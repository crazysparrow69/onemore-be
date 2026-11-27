import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { shiftDate, utcDateOf } from '../../src/common/dates';
import { uuidV7 } from '../../src/common/uuid-v7';
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

type Entry = {
  id: string;
  localDate: string;
  meal: string;
  name: string;
  amount: number | null;
  unit: string | null;
  caloriesKcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  source: string;
};

type Totals = {
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
};

type Day = {
  date: string;
  entries: Entry[];
  totals: Totals;
  target: Totals | null;
  remaining: Totals | null;
};

type Suggestion = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  meal: string | null;
  caloriesKcal: number;
  proteinG: number | null;
  useCount: number;
};

function oatmeal(extra: object = {}): object {
  return {
    localDate: TODAY,
    meal: 'breakfast',
    name: 'Овсянка',
    amount: 150,
    unit: 'g',
    caloriesKcal: 350,
    proteinG: 12,
    fatG: 7,
    carbsG: 60,
    ...extra,
  };
}

describe('food diary and suggestions (real Postgres)', () => {
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

  async function dayOf(caller: Caller, date = TODAY): Promise<Day> {
    const response = await caller.get(`/api/nutrition/days/${date}`);
    expect(response.status).toBe(200);
    return jsonOf<Day>(response);
  }

  async function suggestions(
    caller: Caller,
    query = '',
  ): Promise<Suggestion[]> {
    const response = await caller.get(
      `/api/nutrition/suggestions?q=${encodeURIComponent(query)}`,
    );
    expect(response.status).toBe(200);
    return jsonOf<{ items: Suggestion[] }>(response).items;
  }

  async function onboard(caller: Caller): Promise<void> {
    await caller
      .put('/api/body', {
        sex: 'male',
        birthDate: `${YEAR - 30}-01-01`,
        heightCm: 180,
        activityLevel: 'moderate',
        today: TODAY,
      })
      .expect(200);
    await caller
      .put('/api/goals/current', {
        type: 'lose',
        rateKgPerWeek: 0.5,
        today: TODAY,
      })
      .expect(200);
    await caller
      .put(`/api/weight/${TODAY}`, { weightKg: 80, today: TODAY })
      .expect(201);
  }

  describe('entries', () => {
    it('creates with 201 and answers 200 to the same request again', async () => {
      const id = uuidV7();

      const first = await alice.put(`/api/nutrition/entries/${id}`, oatmeal());
      const retry = await alice.put(`/api/nutrition/entries/${id}`, oatmeal());

      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(jsonOf<Entry>(first)).toMatchObject({
        id,
        localDate: TODAY,
        meal: 'breakfast',
        name: 'Овсянка',
        amount: 150,
        unit: 'g',
        caloriesKcal: 350,
        proteinG: 12,
        fatG: 7,
        carbsG: 60,
        source: 'manual',
      });
      expect((await dayOf(alice)).entries).toHaveLength(1);
    });

    it('saves only calories and protein when that is all the user knows', async () => {
      const response = await alice.put(`/api/nutrition/entries/${uuidV7()}`, {
        localDate: TODAY,
        meal: 'snack',
        name: 'Протеїнова пластівці',
        caloriesKcal: 180,
        proteinG: 25,
      });

      expect(response.status).toBe(201);
      expect(jsonOf<Entry>(response)).toMatchObject({
        caloriesKcal: 180,
        proteinG: 25,
        fatG: null,
        carbsG: null,
        amount: null,
        unit: null,
      });
    });

    it('replaces the values and the day of an own entry', async () => {
      const id = uuidV7();
      await alice.put(`/api/nutrition/entries/${id}`, oatmeal());

      const changed = await alice.put(
        `/api/nutrition/entries/${id}`,
        oatmeal({ localDate: YESTERDAY, caloriesKcal: 400, meal: 'lunch' }),
      );

      expect(changed.status).toBe(200);
      expect((await dayOf(alice)).entries).toHaveLength(0);
      expect((await dayOf(alice, YESTERDAY)).entries[0]).toMatchObject({
        id,
        caloriesKcal: 400,
        meal: 'lunch',
      });
    });

    it('answers 404 when the id belongs to another user, and changes nothing', async () => {
      const id = uuidV7();
      await alice.put(`/api/nutrition/entries/${id}`, oatmeal());

      const response = await bob.put(
        `/api/nutrition/entries/${id}`,
        oatmeal({ caloriesKcal: 1 }),
      );

      expect(response.status).toBe(404);
      expect(bodyOf(response).code).toBe('FOOD_ENTRY_NOT_FOUND');
      expect((await dayOf(alice)).entries[0]?.caloriesKcal).toBe(350);
      expect((await dayOf(bob)).entries).toHaveLength(0);
    });

    it('deletes an own entry and answers 404 for a missing or foreign one', async () => {
      const id = uuidV7();
      await alice.put(`/api/nutrition/entries/${id}`, oatmeal());

      const foreign = await bob.delete(`/api/nutrition/entries/${id}`);
      const first = await alice.delete(`/api/nutrition/entries/${id}`);
      const second = await alice.delete(`/api/nutrition/entries/${id}`);

      expect(foreign.status).toBe(404);
      expect(first.status).toBe(204);
      expect(second.status).toBe(404);
    });

    it('rejects an entry with amount but no unit, an unknown meal and a bad id', async () => {
      const noUnit = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ unit: null }),
      );
      const meal = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ meal: 'brunch' }),
      );
      const id = await alice.put(
        '/api/nutrition/entries/not-a-uuid',
        oatmeal(),
      );

      expect(noUnit.status).toBe(400);
      expect(meal.status).toBe(400);
      expect(id.status).toBe(400);
      expect(bodyOf(id).code).toBe('VALIDATION_FAILED');
    });

    it('rejects a day in the far future and a day before 2000', async () => {
      const future = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ localDate: shiftDate(TODAY, 5) }),
      );
      const old = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ localDate: '1999-12-31' }),
      );

      expect(future.status).toBe(400);
      expect(bodyOf(future).code).toBe('DATE_OUT_OF_RANGE');
      expect(old.status).toBe(400);
    });

    it('allows 100 entries a day and refuses the 101st, but not an edit of one of them', async () => {
      const ids = Array.from({ length: 100 }, () => uuidV7());
      for (const id of ids) {
        await alice
          .put(`/api/nutrition/entries/${id}`, oatmeal({ name: `Їжа ${id}` }))
          .expect(201);
      }

      const extra = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ name: 'Ще одна' }),
      );
      const edit = await alice.put(
        `/api/nutrition/entries/${ids[0]}`,
        oatmeal({ name: 'Змінена' }),
      );
      const otherDay = await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ localDate: YESTERDAY }),
      );

      expect(extra.status).toBe(409);
      expect(bodyOf(extra).code).toBe('FOOD_ENTRY_LIMIT_REACHED');
      expect(edit.status).toBe(200);
      expect(otherDay.status).toBe(201);
    }, 60_000);
  });

  describe('day and calendar', () => {
    it('adds up the day and counts a missing macro as zero', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, {
        localDate: TODAY,
        meal: 'snack',
        name: 'Кава з молоком',
        caloriesKcal: 60,
      });
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, {
        localDate: TODAY,
        meal: 'lunch',
        name: 'Курка',
        caloriesKcal: 300,
        proteinG: 40.5,
      });

      const day = await dayOf(alice);

      expect(day.totals).toEqual({
        caloriesKcal: 710,
        proteinG: 52.5,
        fatG: 7,
        carbsG: 60,
      });
      expect(day.entries.map((entry) => entry.name)).toEqual([
        'Овсянка',
        'Кава з молоком',
        'Курка',
      ]);
    });

    it('has no target and no remainder before the target exists', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());

      const day = await dayOf(alice);

      expect(day.target).toBeNull();
      expect(day.remaining).toBeNull();
    });

    it('shows the target of the day and what is left, negative when overeaten', async () => {
      await onboard(alice);
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());

      const day = await dayOf(alice);

      expect(day.target).toEqual({
        caloriesKcal: 2210,
        proteinG: 144,
        fatG: 61,
        carbsG: 271,
      });
      expect(day.remaining).toEqual({
        caloriesKcal: 1860,
        proteinG: 132,
        fatG: 54,
        carbsG: 211,
      });

      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ name: 'Торт', caloriesKcal: 2000, meal: 'snack' }),
      );
      expect((await dayOf(alice)).remaining?.caloriesKcal).toBe(-140);
    });

    it('has no target for days before the first one', async () => {
      await onboard(alice);
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ localDate: YESTERDAY }),
      );

      const day = await dayOf(alice, YESTERDAY);

      expect(day.entries).toHaveLength(1);
      expect(day.target).toBeNull();
    });

    it('returns an empty day for a day without entries', async () => {
      const day = await dayOf(alice, shiftDate(TODAY, -10));

      expect(day).toEqual({
        date: shiftDate(TODAY, -10),
        entries: [],
        totals: { caloriesKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
        target: null,
        remaining: null,
      });
    });

    it('lists only the days with entries and gives each its own target', async () => {
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ localDate: YESTERDAY }),
      );
      await onboard(alice);
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ name: 'Обід', meal: 'lunch', caloriesKcal: 650 }),
      );

      const response = await alice.get(
        `/api/nutrition/days?from=${shiftDate(TODAY, -5)}&to=${TODAY}`,
      );

      expect(response.status).toBe(200);
      expect(jsonOf<{ items: unknown[] }>(response).items).toEqual([
        {
          date: YESTERDAY,
          entryCount: 1,
          totals: { caloriesKcal: 350, proteinG: 12, fatG: 7, carbsG: 60 },
          target: null,
        },
        {
          date: TODAY,
          entryCount: 2,
          totals: { caloriesKcal: 1000, proteinG: 24, fatG: 14, carbsG: 120 },
          target: {
            caloriesKcal: 2210,
            proteinG: 144,
            fatG: 61,
            carbsG: 271,
          },
        },
      ]);
    });

    it('rejects a reversed range and a range longer than 62 days', async () => {
      const reversed = await alice.get(
        `/api/nutrition/days?from=${TODAY}&to=${YESTERDAY}`,
      );
      const long = await alice.get(
        `/api/nutrition/days?from=${shiftDate(TODAY, -62)}&to=${TODAY}`,
      );

      expect(reversed.status).toBe(400);
      expect(long.status).toBe(400);
    });

    it('does not show the entries of another user', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());

      expect((await dayOf(bob)).entries).toEqual([]);
      const range = await bob.get(
        `/api/nutrition/days?from=${YESTERDAY}&to=${TODAY}`,
      );
      expect(jsonOf<{ items: unknown[] }>(range).items).toEqual([]);
    });
  });

  describe('suggestions', () => {
    it('remembers a food the first time it is logged', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());

      expect(await suggestions(alice, 'овс')).toEqual([
        expect.objectContaining({
          name: 'Овсянка',
          amount: 150,
          unit: 'g',
          meal: 'breakfast',
          caloriesKcal: 350,
          proteinG: 12,
          useCount: 1,
        }),
      ]);
    });

    it('counts a repeat under any spelling and keeps the latest values', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({
          name: '  овсянка ',
          caloriesKcal: 380,
          amount: 160,
          meal: 'snack',
        }),
      );

      const found = await suggestions(alice, 'ОВС');

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        name: 'овсянка',
        caloriesKcal: 380,
        amount: 160,
        meal: 'snack',
        useCount: 2,
      });
    });

    it('does not count an edit of an existing entry as a new use', async () => {
      const id = uuidV7();
      await alice.put(`/api/nutrition/entries/${id}`, oatmeal());
      await alice.put(`/api/nutrition/entries/${id}`, oatmeal());
      await alice.put(
        `/api/nutrition/entries/${id}`,
        oatmeal({ caloriesKcal: 333 }),
      );

      const [found] = await suggestions(alice, 'овс');

      expect(found).toMatchObject({ useCount: 1, caloriesKcal: 333 });
    });

    it('puts names that start with the query first, then the most used', async () => {
      for (const name of ['Гречка з овсянкою', 'Овсянка', 'Овсяне печиво']) {
        await alice.put(
          `/api/nutrition/entries/${uuidV7()}`,
          oatmeal({ name }),
        );
      }
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ name: 'Овсяне печиво' }),
      );

      const found = await suggestions(alice, 'овс');

      expect(found.map((item) => item.name)).toEqual([
        'Овсяне печиво',
        'Овсянка',
        'Гречка з овсянкою',
      ]);
    });

    it('lists the most recently used first when the query is empty', async () => {
      for (const name of ['Перша', 'Друга', 'Третя']) {
        await alice.put(
          `/api/nutrition/entries/${uuidV7()}`,
          oatmeal({ name }),
        );
      }

      const found = await suggestions(alice);

      expect(found.map((item) => item.name)).toEqual([
        'Третя',
        'Друга',
        'Перша',
      ]);
    });

    it('treats % and _ in the query as plain characters', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      await alice.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ name: 'Йогурт 2% жиру' }),
      );

      expect(await suggestions(alice, '%')).toHaveLength(1);
      expect(await suggestions(alice, '_')).toHaveLength(0);
    });

    it('respects the limit', async () => {
      for (let n = 1; n <= 5; n += 1) {
        await alice.put(
          `/api/nutrition/entries/${uuidV7()}`,
          oatmeal({ name: `Страва ${n}` }),
        );
      }

      const response = await alice.get(
        '/api/nutrition/suggestions?q=страва&limit=2',
      );

      expect(jsonOf<{ items: unknown[] }>(response).items).toHaveLength(2);
      expect(
        (await alice.get('/api/nutrition/suggestions?limit=21')).status,
      ).toBe(400);
    });

    it('keeps the suggestions of each user separate', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      await bob.put(
        `/api/nutrition/entries/${uuidV7()}`,
        oatmeal({ caloriesKcal: 100 }),
      );

      expect((await suggestions(alice, 'овс'))[0]?.caloriesKcal).toBe(350);
      expect((await suggestions(bob, 'овс'))[0]?.caloriesKcal).toBe(100);
    });

    it('deletes a suggestion and leaves the diary alone', async () => {
      const entryId = uuidV7();
      await alice.put(`/api/nutrition/entries/${entryId}`, oatmeal());
      const [found] = await suggestions(alice, 'овс');

      const foreign = await bob.delete(
        `/api/nutrition/suggestions/${found?.id}`,
      );
      const removed = await alice.delete(
        `/api/nutrition/suggestions/${found?.id}`,
      );
      const again = await alice.delete(
        `/api/nutrition/suggestions/${found?.id}`,
      );

      expect(foreign.status).toBe(404);
      expect(removed.status).toBe(204);
      expect(again.status).toBe(404);
      expect(await suggestions(alice, 'овс')).toEqual([]);
      expect((await dayOf(alice)).entries.map((entry) => entry.id)).toEqual([
        entryId,
      ]);
    });

    it('links an entry to its suggestion and starts over after the suggestion is deleted', async () => {
      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());
      const [found] = await suggestions(alice, 'овс');
      await alice.delete(`/api/nutrition/suggestions/${found?.id}`);

      await alice.put(`/api/nutrition/entries/${uuidV7()}`, oatmeal());

      const [fresh] = await suggestions(alice, 'овс');
      expect(fresh?.useCount).toBe(1);
      expect(fresh?.id).not.toBe(found?.id);
      const links = await harness.admin.query<{ linked: number }>(
        `select count(*)::int as linked from nutrition.food_entries
         where user_food_id is not null`,
      );
      expect(firstRow(links).linked).toBe(1);
    });
  });
});
