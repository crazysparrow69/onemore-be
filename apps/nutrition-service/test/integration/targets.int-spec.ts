import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { shiftDate, utcDateOf } from '../../src/common/dates';
import { bodyOf, jsonOf } from '../support/body';
import {
  callerOf,
  startApp,
  type Caller,
  type TestApp,
} from '../support/nutrition-app';
import { firstRow } from '../support/rows';

const TODAY = utcDateOf(new Date());
const YESTERDAY = shiftDate(TODAY, -1);
const YEAR = Number(TODAY.slice(0, 4));

const man = {
  sex: 'male',
  birthDate: `${YEAR - 30}-01-01`,
  heightCm: 180,
  activityLevel: 'moderate',
  today: TODAY,
};
const woman = {
  sex: 'female',
  birthDate: `${YEAR - 25}-01-01`,
  heightCm: 165,
  activityLevel: 'light',
  today: TODAY,
};
const lose = { type: 'lose', rateKgPerWeek: 0.5, today: TODAY };

type Target = {
  effectiveFrom: string;
  source: string;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  bmrKcal: number | null;
  tdeeKcal: number | null;
  floorApplied: boolean;
  inputs: Record<string, unknown> | null;
};

describe('body, goal, weight and daily target (real Postgres)', () => {
  let harness: TestApp;
  let alice: Caller;
  let bob: Caller;

  beforeAll(async () => {
    harness = await startApp();
    alice = callerOf(harness.app, await harness.tokenOf('alice'));
    bob = callerOf(harness.app, await harness.tokenOf('bob'));
  });

  afterAll(async () => {
    await harness?.stop();
  });

  beforeEach(async () => {
    await harness.admin.query(
      `truncate nutrition.food_entries, nutrition.user_foods,
         nutrition.target_snapshots, nutrition.goals,
         nutrition.weight_entries, nutrition.body_profiles cascade`,
    );
  });

  async function onboard(
    caller: Caller,
    profile: object = man,
    goal: object = lose,
    weightKg = 80,
    day = TODAY,
  ): Promise<void> {
    await caller.put('/api/body', { ...profile, today: day }).expect(200);
    await caller.put('/api/goals/current', { ...goal, today: day }).expect(200);
    await caller
      .put(`/api/weight/${day}`, { weightKg, today: day })
      .expect(201);
  }

  async function targetOn(caller: Caller, date = TODAY): Promise<Target> {
    const response = await caller.get(`/api/nutrition/target?date=${date}`);
    expect(response.status).toBe(200);
    return jsonOf<Target>(response);
  }

  async function snapshotCount(): Promise<number> {
    const rows = await harness.admin.query<{ n: number }>(
      'select count(*)::int as n from nutrition.target_snapshots',
    );
    return firstRow(rows).n;
  }

  describe('access', () => {
    it('rejects a request without a token', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/body',
      );

      expect(response.status).toBe(401);
      expect(bodyOf(response).code).toBe('UNAUTHORIZED');
    });

    it('answers 404 with a code where nothing is saved yet', async () => {
      const codes = await Promise.all([
        alice.get('/api/body'),
        alice.get('/api/goals/current'),
        alice.get('/api/weight/latest'),
        alice.get(`/api/nutrition/target?date=${TODAY}`),
      ]);

      expect(codes.map((response) => response.status)).toEqual([
        404, 404, 404, 404,
      ]);
      expect(codes.map((response) => bodyOf(response).code)).toEqual([
        'BODY_PROFILE_NOT_FOUND',
        'GOAL_NOT_FOUND',
        'WEIGHT_NOT_FOUND',
        'TARGET_NOT_FOUND',
      ]);
    });

    it('keeps the data of one user away from another', async () => {
      await onboard(alice);

      expect((await bob.get('/api/body')).status).toBe(404);
      expect((await bob.get('/api/goals/current')).status).toBe(404);
      expect(
        jsonOf<{ items: unknown[] }>(await bob.get('/api/weight')).items,
      ).toEqual([]);
      expect(
        (await bob.get(`/api/nutrition/target?date=${TODAY}`)).status,
      ).toBe(404);
    });
  });

  describe('body and goal', () => {
    it('saves and returns the body parameters', async () => {
      const saved = await alice.put('/api/body', man);
      const read = await alice.get('/api/body');

      expect(saved.status).toBe(200);
      expect(jsonOf(read)).toMatchObject({
        sex: 'male',
        birthDate: man.birthDate,
        heightCm: 180,
        activityLevel: 'moderate',
      });
    });

    it('updates the same profile on a second save', async () => {
      await alice.put('/api/body', man);
      await alice.put('/api/body', { ...man, heightCm: 181.25 });

      expect(
        jsonOf<{ heightCm: number }>(await alice.get('/api/body')),
      ).toEqual(expect.objectContaining({ heightCm: 181.3 }));
      const rows = await harness.admin.query<{ n: number }>(
        'select count(*)::int as n from nutrition.body_profiles',
      );
      expect(firstRow(rows).n).toBe(1);
    });

    it('rejects an age under 13 with a validation error', async () => {
      const response = await alice.put('/api/body', {
        ...man,
        birthDate: `${YEAR - 10}-01-01`,
      });

      expect(response.status).toBe(400);
      expect(bodyOf(response).code).toBe('VALIDATION_FAILED');
    });

    it('rejects a today that is far from the server date', async () => {
      const response = await alice.put('/api/body', {
        ...man,
        today: shiftDate(TODAY, 5),
      });

      expect(response.status).toBe(400);
      expect(bodyOf(response).code).toBe('DATE_OUT_OF_RANGE');
    });

    it('keeps the previous goal in the history and overwrites the same day', async () => {
      await alice.put('/api/goals/current', lose);
      await alice
        .put('/api/goals/current', { type: 'maintain', today: TODAY })
        .expect(200);

      const current = await alice.get('/api/goals/current');
      expect(jsonOf(current)).toMatchObject({
        type: 'maintain',
        rateKgPerWeek: null,
        effectiveFrom: TODAY,
      });
      const rows = await harness.admin.query<{ n: number }>(
        'select count(*)::int as n from nutrition.goals',
      );
      expect(firstRow(rows).n).toBe(1);
    });

    it('starts a new goal on a new day and keeps the old row', async () => {
      await alice.put('/api/goals/current', { ...lose, today: YESTERDAY });
      await alice.put('/api/goals/current', {
        type: 'gain',
        rateKgPerWeek: 0.25,
        today: TODAY,
      });

      const rows = await harness.admin.query<{ type: string }>(
        'select type from nutrition.goals order by effective_from',
      );
      expect(rows.rows.map((row) => row.type)).toEqual(['lose', 'gain']);
    });

    it('ignores a rate for maintain and requires one for lose', async () => {
      const maintain = await alice.put('/api/goals/current', {
        type: 'maintain',
        rateKgPerWeek: 0.5,
        today: TODAY,
      });
      const missing = await alice.put('/api/goals/current', {
        type: 'lose',
        today: TODAY,
      });

      expect(
        jsonOf<{ rateKgPerWeek: number | null }>(maintain).rateKgPerWeek,
      ).toBeNull();
      expect(missing.status).toBe(400);
    });
  });

  describe('weight journal', () => {
    it('creates with 201 and replaces the same day with 200', async () => {
      const created = await alice.put(`/api/weight/${TODAY}`, {
        weightKg: 80,
        today: TODAY,
      });
      const replaced = await alice.put(`/api/weight/${TODAY}`, {
        weightKg: 79.4,
        note: ' после зала ',
        today: TODAY,
      });

      expect(created.status).toBe(201);
      expect(replaced.status).toBe(200);
      expect(jsonOf(replaced)).toMatchObject({
        localDate: TODAY,
        weightKg: 79.4,
        note: 'после зала',
      });
      const rows = await harness.admin.query<{ n: number }>(
        'select count(*)::int as n from nutrition.weight_entries',
      );
      expect(firstRow(rows).n).toBe(1);
    });

    it('lists the newest day first and filters by dates', async () => {
      for (const [offset, weightKg] of [
        [-3, 82],
        [-2, 81.5],
        [-1, 81],
        [0, 80.5],
      ] as const) {
        await alice
          .put(`/api/weight/${shiftDate(TODAY, offset)}`, {
            weightKg,
            today: TODAY,
          })
          .expect(201);
      }

      const all = jsonOf<{ items: { localDate: string }[] }>(
        await alice.get('/api/weight'),
      );
      const part = jsonOf<{ items: { localDate: string }[] }>(
        await alice.get(
          `/api/weight?from=${shiftDate(TODAY, -2)}&to=${shiftDate(TODAY, -1)}`,
        ),
      );
      const latest = jsonOf<{ localDate: string; weightKg: number }>(
        await alice.get('/api/weight/latest'),
      );

      expect(all.items.map((item) => item.localDate)).toEqual([
        TODAY,
        YESTERDAY,
        shiftDate(TODAY, -2),
        shiftDate(TODAY, -3),
      ]);
      expect(part.items.map((item) => item.localDate)).toEqual([
        YESTERDAY,
        shiftDate(TODAY, -2),
      ]);
      expect(latest).toMatchObject({ localDate: TODAY, weightKg: 80.5 });
    });

    it('rejects a day in the far future, an absurd weight and a long note', async () => {
      const future = await alice.put(`/api/weight/${shiftDate(TODAY, 5)}`, {
        weightKg: 80,
        today: TODAY,
      });
      const light = await alice.put(`/api/weight/${TODAY}`, {
        weightKg: 5,
        today: TODAY,
      });
      const note = await alice.put(`/api/weight/${TODAY}`, {
        weightKg: 80,
        note: 'x'.repeat(201),
        today: TODAY,
      });

      expect(future.status).toBe(400);
      expect(bodyOf(future).code).toBe('DATE_OUT_OF_RANGE');
      expect(light.status).toBe(400);
      expect(note.status).toBe(400);
    });

    it('deletes an entry and answers 404 the second time', async () => {
      await alice.put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY });

      const first = await alice.delete(`/api/weight/${TODAY}?today=${TODAY}`);
      const second = await alice.delete(`/api/weight/${TODAY}?today=${TODAY}`);

      expect(first.status).toBe(204);
      expect(second.status).toBe(404);
      expect(bodyOf(second).code).toBe('WEIGHT_NOT_FOUND');
    });

    it('does not let one user delete the entry of another', async () => {
      await alice.put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY });

      const response = await bob.delete(`/api/weight/${TODAY}?today=${TODAY}`);

      expect(response.status).toBe(404);
      expect((await alice.get('/api/weight/latest')).status).toBe(200);
    });

    it('survives several saves at once', async () => {
      await onboard(alice);

      const responses = await Promise.all(
        [1, 2, 3, 4, 5].map((offset) =>
          alice.put(`/api/weight/${shiftDate(TODAY, -offset)}`, {
            weightKg: 80 + offset / 10,
            today: TODAY,
          }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      expect(await snapshotCount()).toBe(1);
    });
  });

  describe('daily target', () => {
    it('is calculated once body, goal and weight are all there', async () => {
      await alice.put('/api/body', man).expect(200);
      expect(
        (await alice.get(`/api/nutrition/target?date=${TODAY}`)).status,
      ).toBe(404);
      await alice.put('/api/goals/current', lose).expect(200);
      expect(
        (await alice.get(`/api/nutrition/target?date=${TODAY}`)).status,
      ).toBe(404);
      await alice
        .put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY })
        .expect(201);

      expect(await targetOn(alice)).toEqual({
        effectiveFrom: TODAY,
        source: 'auto',
        caloriesKcal: 2210,
        proteinG: 136,
        fatG: 61,
        carbsG: 279,
        bmrKcal: 1780,
        tdeeKcal: 2759,
        floorApplied: false,
        inputs: {
          sex: 'male',
          age: 30,
          heightCm: 180,
          weightKg: 80,
          activityLevel: 'moderate',
          goalType: 'lose',
          rateKgPerWeek: 0.5,
          proteinGPerKg: 1.7,
          fatSharePercent: 25,
        },
      });
    });

    it('gives the same target whatever the order of the three steps', async () => {
      await alice.put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY });
      await alice.put('/api/goals/current', lose);
      await alice.put('/api/body', man);
      const first = await targetOn(alice);

      await bob.put('/api/body', man);
      await bob.put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY });
      await bob.put('/api/goals/current', lose);

      expect(await targetOn(bob)).toEqual(first);
    });

    it('applies the safe floor and says so', async () => {
      await onboard(bob, woman, { type: 'lose', rateKgPerWeek: 1 }, 60);

      expect(await targetOn(bob)).toMatchObject({
        caloriesKcal: 1350,
        floorApplied: true,
      });
    });

    it('does not write a new row when a small weight change rounds to the same target', async () => {
      await onboard(alice);

      await alice
        .put(`/api/weight/${TODAY}`, { weightKg: 80.2, today: TODAY })
        .expect(200);

      expect(await snapshotCount()).toBe(1);
      expect((await targetOn(alice)).caloriesKcal).toBe(2210);
    });

    it('rewrites the row of the same day when the change is real', async () => {
      await onboard(alice);

      await alice.put(`/api/weight/${TODAY}`, { weightKg: 70, today: TODAY });

      expect(await snapshotCount()).toBe(1);
      expect((await targetOn(alice)).caloriesKcal).toBeLessThan(2210);
    });

    it('starts a new target on a new day and leaves the past as it was', async () => {
      await onboard(alice, man, lose, 80, YESTERDAY);
      const before = await targetOn(alice, YESTERDAY);

      await alice
        .put(`/api/weight/${TODAY}`, { weightKg: 72, today: TODAY })
        .expect(201);

      expect(await snapshotCount()).toBe(2);
      expect(await targetOn(alice, YESTERDAY)).toEqual(before);
      const now = await targetOn(alice, TODAY);
      expect(now.effectiveFrom).toBe(TODAY);
      expect(now.caloriesKcal).toBeLessThan(before.caloriesKcal);
    });

    it('has no target for a day before the first one', async () => {
      await onboard(alice);

      const response = await alice.get(
        `/api/nutrition/target?date=${YESTERDAY}`,
      );

      expect(response.status).toBe(404);
      expect(bodyOf(response).code).toBe('TARGET_NOT_FOUND');
    });

    it('follows the latest weight again after the latest entry is deleted', async () => {
      await onboard(alice, man, lose, 80, YESTERDAY);
      await alice.put(`/api/weight/${TODAY}`, { weightKg: 70, today: TODAY });
      const lighter = await targetOn(alice, TODAY);

      await alice.delete(`/api/weight/${TODAY}?today=${TODAY}`).expect(204);

      const back = await targetOn(alice, TODAY);
      expect(back.caloriesKcal).toBeGreaterThan(lighter.caloriesKcal);
      expect(back.inputs).toMatchObject({ weightKg: 80 });
    });

    it('keeps the last target when the only weight is deleted', async () => {
      await onboard(alice);

      await alice.delete(`/api/weight/${TODAY}?today=${TODAY}`).expect(204);

      expect((await targetOn(alice)).caloriesKcal).toBe(2210);
    });
  });

  describe('own protein and fat', () => {
    it('saves and returns them, and null means the formula decides', async () => {
      const saved = await alice
        .put('/api/body', { ...man, proteinGPerKg: 1.4, fatSharePercent: 30 })
        .expect(200);
      expect(bodyOf(saved)).toMatchObject({
        proteinGPerKg: 1.4,
        fatSharePercent: 30,
      });

      const cleared = await alice.put('/api/body', man).expect(200);
      expect(bodyOf(cleared)).toMatchObject({
        proteinGPerKg: null,
        fatSharePercent: null,
      });
    });

    it('rejects numbers outside the supported range', async () => {
      for (const own of [
        { proteinGPerKg: 0.5 },
        { proteinGPerKg: 3.5 },
        { fatSharePercent: 10 },
        { fatSharePercent: 60 },
        { fatSharePercent: 25.5 },
      ]) {
        const response = await alice.put('/api/body', { ...man, ...own });
        expect(response.status).toBe(400);
      }
    });

    it('changes the macros of the formula target and the inputs it records', async () => {
      await onboard(alice);

      await alice
        .put('/api/body', { ...man, proteinGPerKg: 1.4, fatSharePercent: 30 })
        .expect(200);

      expect(await targetOn(alice)).toMatchObject({
        source: 'auto',
        caloriesKcal: 2210,
        proteinG: 112,
        fatG: 74,
        carbsG: 274,
        inputs: { proteinGPerKg: 1.4, fatSharePercent: 30 },
      });
      expect(await snapshotCount()).toBe(1);
    });

    it('applies to an own calorie target when it is set', async () => {
      await onboard(alice);
      await alice.put('/api/body', { ...man, proteinGPerKg: 2 }).expect(200);

      const response = await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 2500,
        today: TODAY,
      });

      expect(jsonOf<Target>(response)).toMatchObject({
        source: 'manual',
        proteinG: 160,
        fatG: 69,
      });
    });
  });

  describe('own target', () => {
    it('sets own calories without any profile and derives the macros', async () => {
      const response = await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 2000,
        today: TODAY,
      });

      expect(response.status).toBe(200);
      expect(jsonOf<Target>(response)).toEqual({
        effectiveFrom: TODAY,
        source: 'manual',
        caloriesKcal: 2000,
        proteinG: 125,
        fatG: 56,
        carbsG: 249,
        bmrKcal: null,
        tdeeKcal: null,
        floorApplied: false,
        inputs: null,
      });
    });

    it('is not overwritten by a later change of weight, body or goal', async () => {
      await onboard(alice);
      await alice
        .put('/api/nutrition/target/manual', {
          caloriesKcal: 2000,
          today: TODAY,
        })
        .expect(200);

      await alice.put(`/api/weight/${TODAY}`, { weightKg: 70, today: TODAY });
      await alice.put('/api/body', { ...man, heightCm: 170 });
      await alice.put('/api/goals/current', {
        type: 'gain',
        rateKgPerWeek: 0.5,
        today: TODAY,
      });

      expect(await targetOn(alice)).toMatchObject({
        source: 'manual',
        caloriesKcal: 2000,
      });
    });

    it('goes back to the formula on request', async () => {
      await onboard(alice);
      await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 2000,
        today: TODAY,
      });

      const response = await alice.put('/api/nutrition/target/auto', {
        today: TODAY,
      });

      expect(response.status).toBe(200);
      expect(jsonOf<Target>(response)).toMatchObject({
        source: 'auto',
        caloriesKcal: 2210,
      });
      expect(await snapshotCount()).toBe(1);
    });

    it('keeps yesterday on the formula when own calories start today', async () => {
      await onboard(alice, man, lose, 80, YESTERDAY);

      await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 2000,
        today: TODAY,
      });

      expect((await targetOn(alice, YESTERDAY)).source).toBe('auto');
      expect((await targetOn(alice, TODAY)).source).toBe('manual');
    });

    it('cannot return to the formula before the inputs exist', async () => {
      await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 2000,
        today: TODAY,
      });

      const response = await alice.put('/api/nutrition/target/auto', {
        today: TODAY,
      });

      expect(response.status).toBe(409);
      expect(bodyOf(response).code).toBe('TARGET_INPUTS_MISSING');
    });

    it('rejects calories outside 1000-6000', async () => {
      const response = await alice.put('/api/nutrition/target/manual', {
        caloriesKcal: 500,
        today: TODAY,
      });

      expect(response.status).toBe(400);
    });
  });
});
