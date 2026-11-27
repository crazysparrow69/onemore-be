import { Injectable } from '@nestjs/common';
import { requirePlausibleToday } from '../../common/date-guards';
import { ageOn, notBefore } from '../../common/dates';
import { appError } from '../../common/errors';
import { lockXact } from '../../db/locks';
import type { Executor } from '../../db/executor';
import { UnitOfWork } from '../../db/unit-of-work';
import { snapshotOn } from './target-history';
import {
  FORMULA_VERSION,
  calculateTarget,
  macrosFor,
  type CalculatedTarget,
} from './target-formula';
import {
  toDailyTarget,
  toTargetResponse,
  type DailyTarget,
  type TargetResponse,
} from './target.response';
import {
  TargetsRepository,
  type BodyRow,
  type GoalRow,
  type Parts,
  type SnapshotRow,
} from './targets.repository';

export type TargetLookup = (date: string) => DailyTarget | null;

export function nutritionLockKey(userId: string): string {
  return `nutrition:${userId}`;
}

@Injectable()
export class TargetsService {
  constructor(
    private readonly targets: TargetsRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(userId: string, date: string): Promise<TargetResponse> {
    const row = await this.targets.activeOn(
      this.unitOfWork.reader,
      userId,
      date,
    );
    if (!row) {
      throw appError('TARGET_NOT_FOUND');
    }
    return toTargetResponse(row);
  }

  async lookupFor(
    userId: string,
    from: string,
    to: string,
  ): Promise<TargetLookup> {
    const history = await this.targets.history(
      this.unitOfWork.reader,
      userId,
      from,
      to,
    );
    return (date) => {
      const row = snapshotOn(history, date);
      return row ? toDailyTarget(row) : null;
    };
  }

  async activeOn(userId: string, date: string): Promise<DailyTarget | null> {
    const row = await this.targets.activeOn(
      this.unitOfWork.reader,
      userId,
      date,
    );
    return row ? toDailyTarget(row) : null;
  }

  async useFormula(userId: string, today: string): Promise<TargetResponse> {
    requirePlausibleToday(today);
    const row = await this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      return this.writeAuto(tx, userId, today);
    });
    return toTargetResponse(row);
  }

  async setOwn(
    userId: string,
    today: string,
    caloriesKcal: number,
  ): Promise<TargetResponse> {
    requirePlausibleToday(today);
    const row = await this.unitOfWork.run(async (tx) => {
      await lockXact(tx, nutritionLockKey(userId));
      return this.writeManual(tx, userId, today, caloriesKcal);
    });
    return toTargetResponse(row);
  }

  async recalculate(
    tx: Executor,
    userId: string,
    today: string,
  ): Promise<void> {
    const latest = await this.targets.latest(tx, userId);
    if (latest?.source === 'manual') {
      return;
    }
    const ready = readyParts(await this.targets.parts(tx, userId));
    if (!ready) {
      return;
    }
    const effectiveFrom = effectiveDate(latest, today);
    const target = calculationFor(ready, effectiveFrom);
    if (latest && sameValues(latest, target)) {
      return;
    }
    await this.saveAuto(tx, userId, effectiveFrom, ready, target);
  }

  private async writeAuto(
    tx: Executor,
    userId: string,
    today: string,
  ): Promise<SnapshotRow> {
    const latest = await this.targets.latest(tx, userId);
    const ready = readyParts(await this.targets.parts(tx, userId));
    if (!ready) {
      throw appError('TARGET_INPUTS_MISSING');
    }
    const effectiveFrom = effectiveDate(latest, today);
    return this.saveAuto(
      tx,
      userId,
      effectiveFrom,
      ready,
      calculationFor(ready, effectiveFrom),
    );
  }

  private async writeManual(
    tx: Executor,
    userId: string,
    today: string,
    caloriesKcal: number,
  ): Promise<SnapshotRow> {
    const latest = await this.targets.latest(tx, userId);
    const parts = await this.targets.parts(tx, userId);
    return this.targets.upsert(tx, {
      userId,
      effectiveFrom: effectiveDate(latest, today),
      source: 'manual',
      goalId: null,
      caloriesKcal,
      ...macrosFor({
        caloriesKcal,
        weightKg: parts.weightKg,
        goalType: parts.goal?.type ?? null,
        activityLevel: parts.body?.activityLevel ?? null,
        proteinGPerKg: parts.body?.proteinGPerKg ?? null,
        fatSharePercent: parts.body?.fatSharePercent ?? null,
      }),
      bmrKcal: null,
      tdeeKcal: null,
      floorApplied: false,
      formulaVersion: null,
      inputs: null,
    });
  }

  private saveAuto(
    tx: Executor,
    userId: string,
    effectiveFrom: string,
    { body, goal, weightKg }: ReadyParts,
    target: CalculatedTarget,
  ): Promise<SnapshotRow> {
    return this.targets.upsert(tx, {
      userId,
      effectiveFrom,
      source: 'auto',
      goalId: goal.id,
      caloriesKcal: target.caloriesKcal,
      proteinG: target.proteinG,
      fatG: target.fatG,
      carbsG: target.carbsG,
      bmrKcal: target.bmrKcal,
      tdeeKcal: target.tdeeKcal,
      floorApplied: target.floorApplied,
      formulaVersion: FORMULA_VERSION,
      inputs: {
        sex: body.sex,
        age: ageOn(body.birthDate, effectiveFrom),
        heightCm: body.heightCm,
        weightKg,
        activityLevel: body.activityLevel,
        goalType: goal.type,
        rateKgPerWeek: goal.rateKgPerWeek,
        proteinGPerKg: target.proteinGPerKg,
        fatSharePercent: target.fatSharePercent,
      },
    });
  }
}

type ReadyParts = { body: BodyRow; goal: GoalRow; weightKg: number };

function readyParts({ body, goal, weightKg }: Parts): ReadyParts | null {
  return body && goal && weightKg !== null ? { body, goal, weightKg } : null;
}

function effectiveDate(latest: SnapshotRow | null, today: string): string {
  return notBefore(today, latest?.effectiveFrom ?? null);
}

function calculationFor(
  { body, goal, weightKg }: ReadyParts,
  effectiveFrom: string,
): CalculatedTarget {
  return calculateTarget({
    sex: body.sex,
    age: ageOn(body.birthDate, effectiveFrom),
    heightCm: body.heightCm,
    weightKg,
    activityLevel: body.activityLevel,
    goalType: goal.type,
    rateKgPerWeek: goal.rateKgPerWeek,
    proteinGPerKg: body.proteinGPerKg,
    fatSharePercent: body.fatSharePercent,
  });
}

function sameValues(row: SnapshotRow, target: CalculatedTarget): boolean {
  return (
    row.caloriesKcal === target.caloriesKcal &&
    row.proteinG === target.proteinG &&
    row.fatG === target.fatG &&
    row.carbsG === target.carbsG
  );
}
