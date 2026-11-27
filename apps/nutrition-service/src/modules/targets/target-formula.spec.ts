import { describe, expect, it } from 'vitest';
import { ACTIVITY_LEVELS, GOAL_TYPES, SEXES } from '../../db/schema';
import {
  DEFAULT_FAT_SHARE_PERCENT,
  FORMULA_VERSION,
  MAX_CALORIES,
  MIN_CALORIES,
  basalMetabolicRate,
  calculateTarget,
  defaultProteinPerKg,
  macrosFor,
  type TargetInput,
} from './target-formula';

const man: TargetInput = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goalType: 'maintain',
  rateKgPerWeek: null,
  proteinGPerKg: null,
  fatSharePercent: null,
};

const woman: TargetInput = {
  sex: 'female',
  age: 25,
  heightCm: 165,
  weightKg: 60,
  activityLevel: 'light',
  goalType: 'maintain',
  rateKgPerWeek: null,
  proteinGPerKg: null,
  fatSharePercent: null,
};

// Expected numbers come from an independent Python implementation of the
// formula (docs/target-formula.md), not from this code.
const REFERENCE: [string, TargetInput, Record<string, number | boolean>][] = [
  [
    'male 30y 180cm 80kg moderate maintain',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'maintain',
      rateKgPerWeek: null,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2760,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 1.4,
      proteinG: 112,
      fatG: 77,
      carbsG: 405,
    },
  ],
  [
    'male 30y 180cm 80kg moderate lose rate 0.5',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'lose',
      rateKgPerWeek: 0.5,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2210,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 1.7,
      proteinG: 136,
      fatG: 61,
      carbsG: 279,
    },
  ],
  [
    'male 30y 180cm 80kg moderate gain rate 0.25',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'gain',
      rateKgPerWeek: 0.25,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 3030,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 1.4,
      proteinG: 112,
      fatG: 84,
      carbsG: 457,
    },
  ],
  [
    'male 30y 180cm 80kg moderate recomp',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'recomp',
      rateKgPerWeek: null,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2480,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 1.7,
      proteinG: 136,
      fatG: 69,
      carbsG: 329,
    },
  ],
  [
    'female 25y 165cm 60kg light maintain',
    {
      sex: 'female',
      age: 25,
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'light',
      goalType: 'maintain',
      rateKgPerWeek: null,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 1850,
      bmrKcal: 1345,
      tdeeKcal: 1850,
      floorApplied: false,
      proteinGPerKg: 1.2,
      proteinG: 72,
      fatG: 51,
      carbsG: 276,
    },
  ],
  [
    'female 25y 165cm 60kg light lose rate 1',
    {
      sex: 'female',
      age: 25,
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'light',
      goalType: 'lose',
      rateKgPerWeek: 1,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 1350,
      bmrKcal: 1345,
      tdeeKcal: 1850,
      floorApplied: true,
      proteinGPerKg: 1.5,
      proteinG: 90,
      fatG: 38,
      carbsG: 162,
    },
  ],
  [
    'female 40y 170cm 70kg sedentary lose rate 0.5',
    {
      sex: 'female',
      age: 40,
      heightCm: 170,
      weightKg: 70,
      activityLevel: 'sedentary',
      goalType: 'lose',
      rateKgPerWeek: 0.5,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 1410,
      bmrKcal: 1402,
      tdeeKcal: 1682,
      floorApplied: true,
      proteinGPerKg: 1.3,
      proteinG: 91,
      fatG: 39,
      carbsG: 174,
    },
  ],
  [
    'male 45y 175cm 95kg sedentary lose rate 1',
    {
      sex: 'male',
      age: 45,
      heightCm: 175,
      weightKg: 95,
      activityLevel: 'sedentary',
      goalType: 'lose',
      rateKgPerWeek: 1,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 1830,
      bmrKcal: 1824,
      tdeeKcal: 2189,
      floorApplied: true,
      proteinGPerKg: 1.3,
      proteinG: 124,
      fatG: 51,
      carbsG: 219,
    },
  ],
  [
    'female 33y 168cm 62kg active recomp',
    {
      sex: 'female',
      age: 33,
      heightCm: 168,
      weightKg: 62,
      activityLevel: 'active',
      goalType: 'recomp',
      rateKgPerWeek: null,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2090,
      bmrKcal: 1344,
      tdeeKcal: 2318,
      floorApplied: false,
      proteinGPerKg: 1.9,
      proteinG: 118,
      fatG: 58,
      carbsG: 274,
    },
  ],
  [
    'male 22y 190cm 85kg very_active gain rate 0.5',
    {
      sex: 'male',
      age: 22,
      heightCm: 190,
      weightKg: 85,
      activityLevel: 'very_active',
      goalType: 'gain',
      rateKgPerWeek: 0.5,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 4220,
      bmrKcal: 1933,
      tdeeKcal: 3672,
      floorApplied: false,
      proteinGPerKg: 1.8,
      proteinG: 153,
      fatG: 117,
      carbsG: 639,
    },
  ],
  [
    'male 50y 178cm 90kg active lose rate 0.5',
    {
      sex: 'male',
      age: 50,
      heightCm: 178,
      weightKg: 90,
      activityLevel: 'active',
      goalType: 'lose',
      rateKgPerWeek: 0.5,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2500,
      bmrKcal: 1768,
      tdeeKcal: 3049,
      floorApplied: false,
      proteinGPerKg: 1.9,
      proteinG: 171,
      fatG: 69,
      carbsG: 299,
    },
  ],
  [
    'female 28y 160cm 55kg very_active maintain',
    {
      sex: 'female',
      age: 28,
      heightCm: 160,
      weightKg: 55,
      activityLevel: 'very_active',
      goalType: 'maintain',
      rateKgPerWeek: null,
      proteinGPerKg: null,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2370,
      bmrKcal: 1249,
      tdeeKcal: 2373,
      floorApplied: false,
      proteinGPerKg: 1.8,
      proteinG: 99,
      fatG: 66,
      carbsG: 345,
    },
  ],
  [
    'male 30y 180cm 80kg moderate lose rate 0.5 protein 1.4',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'lose',
      rateKgPerWeek: 0.5,
      proteinGPerKg: 1.4,
      fatSharePercent: null,
    },
    {
      caloriesKcal: 2210,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 1.4,
      proteinG: 112,
      fatG: 61,
      carbsG: 303,
    },
  ],
  [
    'male 30y 180cm 80kg moderate lose rate 0.5 protein 2.4 fat 30%',
    {
      sex: 'male',
      age: 30,
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goalType: 'lose',
      rateKgPerWeek: 0.5,
      proteinGPerKg: 2.4,
      fatSharePercent: 30,
    },
    {
      caloriesKcal: 2210,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
      proteinGPerKg: 2.4,
      proteinG: 192,
      fatG: 74,
      carbsG: 194,
    },
  ],
  [
    'female 25y 165cm 60kg light gain rate 0.25 protein 1.0 fat 35%',
    {
      sex: 'female',
      age: 25,
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'light',
      goalType: 'gain',
      rateKgPerWeek: 0.25,
      proteinGPerKg: 1.0,
      fatSharePercent: 35,
    },
    {
      caloriesKcal: 2120,
      bmrKcal: 1345,
      tdeeKcal: 1850,
      floorApplied: false,
      proteinGPerKg: 1.0,
      proteinG: 60,
      fatG: 82,
      carbsG: 286,
    },
  ],
];

describe('basalMetabolicRate', () => {
  it('follows Mifflin - St Jeor for a man', () => {
    expect(basalMetabolicRate(man)).toBe(1780);
  });

  it('follows Mifflin - St Jeor for a woman', () => {
    expect(basalMetabolicRate(woman)).toBe(1345.25);
  });
});

describe('reference profiles', () => {
  it.each(REFERENCE)('%s', (_name, input, expected) => {
    expect(calculateTarget(input)).toMatchObject(expected);
  });
});

describe('calculateTarget', () => {
  it('maintains at TDEE rounded to 10 kcal', () => {
    expect(calculateTarget(man)).toMatchObject({
      caloriesKcal: 2760,
      bmrKcal: 1780,
      tdeeKcal: 2759,
      floorApplied: false,
    });
  });

  it('turns the weekly rate into a daily deficit for losing', () => {
    const target = calculateTarget({
      ...man,
      goalType: 'lose',
      rateKgPerWeek: 0.5,
    });

    expect(target.caloriesKcal).toBe(2210);
    expect(target.floorApplied).toBe(false);
  });

  it('adds the daily surplus for gaining', () => {
    expect(
      calculateTarget({ ...man, goalType: 'gain', rateKgPerWeek: 0.25 })
        .caloriesKcal,
    ).toBe(3030);
  });

  it('cuts 10 percent for recomposition', () => {
    expect(calculateTarget({ ...man, goalType: 'recomp' }).caloriesKcal).toBe(
      2480,
    );
  });

  it('does not depend on the sex constant for the activity factor', () => {
    const light = calculateTarget({ ...man, activityLevel: 'light' });
    const active = calculateTarget({ ...man, activityLevel: 'very_active' });

    expect(light.caloriesKcal).toBeLessThan(active.caloriesKcal);
  });

  describe('rounding and limits', () => {
    const halfWay: TargetInput = {
      ...man,
      sex: 'male',
      age: 21,
      heightCm: 160,
      weightKg: 50,
      activityLevel: 'light',
    };

    it('rounds a value exactly between two tens up', () => {
      expect(calculateTarget(halfWay)).toMatchObject({
        tdeeKcal: 1925,
        caloriesKcal: 1930,
      });
    });

    it('keeps calories inside the stored range', () => {
      const tiny = calculateTarget({
        ...woman,
        weightKg: 20,
        heightCm: 100,
        age: 90,
        activityLevel: 'sedentary',
      });
      const huge = calculateTarget({
        ...man,
        weightKg: 400,
        heightCm: 250,
        age: 18,
        activityLevel: 'very_active',
        goalType: 'gain',
        rateKgPerWeek: 1,
      });

      expect(tiny.caloriesKcal).toBe(MIN_CALORIES);
      expect(huge.caloriesKcal).toBe(MAX_CALORIES);
    });
  });

  describe('safe floor', () => {
    const atFloor: TargetInput = {
      ...man,
      age: 31,
      heightCm: 200,
      weightKg: 110,
      activityLevel: 'light',
      goalType: 'lose',
      rateKgPerWeek: 0.75,
    };

    it('does not trigger when the deficit lands exactly on the basal rate', () => {
      expect(calculateTarget(atFloor)).toMatchObject({
        bmrKcal: 2200,
        caloriesKcal: 2200,
        floorApplied: false,
      });
    });

    it('does not round down below the floor when the deficit stays above it', () => {
      expect(
        calculateTarget({
          ...man,
          age: 28,
          heightCm: 190,
          weightKg: 45,
          goalType: 'lose',
          rateKgPerWeek: 0.75,
        }),
      ).toMatchObject({
        bmrKcal: 1503,
        caloriesKcal: 1510,
        floorApplied: false,
      });
    });

    it('triggers as soon as the deficit goes below the basal rate', () => {
      expect(calculateTarget({ ...atFloor, rateKgPerWeek: 0.8 })).toMatchObject(
        { caloriesKcal: 2200, floorApplied: true },
      );
    });

    it('uses 1500 for men and 1200 for women when the basal rate is lower', () => {
      const small = {
        weightKg: 50,
        heightCm: 150,
        age: 50,
        activityLevel: 'sedentary',
        goalType: 'lose',
        rateKgPerWeek: 1,
      } as const;

      expect(calculateTarget({ ...man, ...small, sex: 'male' })).toMatchObject({
        caloriesKcal: 1500,
        floorApplied: true,
      });
      expect(
        calculateTarget({ ...woman, ...small, sex: 'female' }),
      ).toMatchObject({ caloriesKcal: 1200, floorApplied: true });
    });

    it('never applies to a surplus', () => {
      const target = calculateTarget({
        ...woman,
        weightKg: 40,
        heightCm: 150,
        age: 60,
        activityLevel: 'sedentary',
      });

      expect(target.floorApplied).toBe(false);
      expect(target.caloriesKcal).toBeLessThan(1200);
      expect(target.caloriesKcal).toBeGreaterThanOrEqual(MIN_CALORIES);
    });

    it('never gives less than the basal rate to someone who is cutting', () => {
      const target = calculateTarget({
        ...man,
        weightKg: 140,
        activityLevel: 'sedentary',
        goalType: 'lose',
        rateKgPerWeek: 1,
      });

      expect(target.floorApplied).toBe(true);
      expect(target.caloriesKcal).toBeGreaterThanOrEqual(target.bmrKcal);
    });
  });

  describe('macros', () => {
    it('gives more protein per kilogram when cutting than when maintaining', () => {
      const lose = calculateTarget({
        ...man,
        goalType: 'lose',
        rateKgPerWeek: 0.5,
      });

      expect(lose.proteinG).toBe(136);
      expect(calculateTarget(man).proteinG).toBe(112);
    });

    it('takes the own protein and fat share when given', () => {
      const target = calculateTarget({
        ...man,
        proteinGPerKg: 2,
        fatSharePercent: 30,
      });

      expect(target).toMatchObject({
        proteinGPerKg: 2,
        fatSharePercent: 30,
        proteinG: 160,
        fatG: 92,
      });
    });

    it('reports the numbers it used', () => {
      expect(calculateTarget(man)).toMatchObject({
        proteinGPerKg: 1.4,
        fatSharePercent: DEFAULT_FAT_SHARE_PERCENT,
      });
    });

    it('makes calories add up from protein, fat and carbs within rounding', () => {
      const target = calculateTarget(man);
      const sum = target.proteinG * 4 + target.fatG * 9 + target.carbsG * 4;

      expect(Math.abs(sum - target.caloriesKcal)).toBeLessThanOrEqual(10);
    });
  });
});

describe('defaultProteinPerKg', () => {
  it.each([
    ['sedentary', 'maintain', 1],
    ['light', 'maintain', 1.2],
    ['moderate', 'maintain', 1.4],
    ['active', 'maintain', 1.6],
    ['very_active', 'maintain', 1.8],
    ['moderate', 'gain', 1.4],
    ['moderate', 'lose', 1.7],
    ['moderate', 'recomp', 1.7],
    ['very_active', 'lose', 2.1],
  ] as const)('%s and %s gets %s g/kg', (activity, goal, expected) => {
    expect(defaultProteinPerKg(activity, goal)).toBe(expected);
  });

  it('assumes moderate maintenance when nothing is known', () => {
    expect(defaultProteinPerKg(null, null)).toBe(1.4);
  });
});

describe('macrosFor', () => {
  const base = {
    caloriesKcal: 2000,
    weightKg: 75,
    goalType: 'maintain',
    activityLevel: 'moderate',
    proteinGPerKg: null,
    fatSharePercent: null,
  } as const;

  it('splits fat at 25 percent of calories and gives the rest to carbs', () => {
    expect(macrosFor(base)).toEqual({ proteinG: 105, fatG: 56, carbsG: 269 });
  });

  it('prefers the own numbers over the defaults', () => {
    expect(
      macrosFor({ ...base, proteinGPerKg: 2, fatSharePercent: 35 }),
    ).toEqual({ proteinG: 150, fatG: 78, carbsG: 175 });
  });

  it('caps protein at 40 percent of calories even for an own number', () => {
    const macros = macrosFor({
      ...base,
      caloriesKcal: 1000,
      weightKg: 150,
      proteinGPerKg: 3,
    });

    expect(macros.proteinG).toBe(100);
    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });

  it('takes a quarter of calories as protein when the weight is unknown', () => {
    expect(
      macrosFor({
        ...base,
        weightKg: null,
        goalType: null,
        activityLevel: null,
      }).proteinG,
    ).toBe(125);
  });

  it('never returns negative carbs', () => {
    const macros = macrosFor({
      ...base,
      caloriesKcal: 800,
      weightKg: 400,
      goalType: 'lose',
      fatSharePercent: 45,
    });

    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
  });
});

describe('properties over a grid of people', () => {
  const weights = [40, 60, 80, 110, 160];
  const ages = [18, 35, 55, 75];
  const rates = [0.25, 0.5, 1];

  function everyone(): TargetInput[] {
    const people: TargetInput[] = [];
    for (const sex of SEXES) {
      for (const activityLevel of ACTIVITY_LEVELS) {
        for (const goalType of GOAL_TYPES) {
          for (const weightKg of weights) {
            for (const age of ages) {
              for (const rate of rates) {
                people.push({
                  sex,
                  age,
                  heightCm: sex === 'male' ? 178 : 165,
                  weightKg,
                  activityLevel,
                  goalType,
                  rateKgPerWeek: rate,
                  proteinGPerKg: null,
                  fatSharePercent: null,
                });
              }
            }
          }
        }
      }
    }
    return people;
  }

  it('keeps calories in range and in steps of 10', () => {
    for (const person of everyone()) {
      const { caloriesKcal } = calculateTarget(person);
      expect(caloriesKcal % 10).toBe(0);
      expect(caloriesKcal).toBeGreaterThanOrEqual(MIN_CALORIES);
      expect(caloriesKcal).toBeLessThanOrEqual(MAX_CALORIES);
    }
  });

  it('keeps macros sane: not negative, protein at most 40 percent, sums match', () => {
    for (const person of everyone()) {
      const target = calculateTarget(person);
      const sum = target.proteinG * 4 + target.fatG * 9 + target.carbsG * 4;
      expect(target.proteinG).toBeGreaterThanOrEqual(0);
      expect(target.fatG).toBeGreaterThanOrEqual(0);
      expect(target.carbsG).toBeGreaterThanOrEqual(0);
      expect(target.proteinG * 4).toBeLessThanOrEqual(
        target.caloriesKcal * 0.4 + 2,
      );
      expect(Math.abs(sum - target.caloriesKcal)).toBeLessThanOrEqual(10);
    }
  });

  it('never gives fewer calories for more activity', () => {
    for (const person of everyone()) {
      const calories = ACTIVITY_LEVELS.map(
        (activityLevel) =>
          calculateTarget({ ...person, activityLevel }).caloriesKcal,
      );
      expect([...calories].sort((a, b) => a - b)).toEqual(calories);
    }
  });

  it('never gives more calories for a faster loss and never fewer for a faster gain', () => {
    for (const person of everyone()) {
      if (person.goalType !== 'lose' && person.goalType !== 'gain') {
        continue;
      }
      const calories = [0.25, 0.5, 1].map(
        (rateKgPerWeek) =>
          calculateTarget({ ...person, rateKgPerWeek }).caloriesKcal,
      );
      const expected = [...calories].sort((a, b) => a - b);
      expect(calories).toEqual(
        person.goalType === 'gain' ? expected : expected.reverse(),
      );
    }
  });

  it('never gives less protein per kilogram for more activity or a stricter goal', () => {
    for (const goal of GOAL_TYPES) {
      const perKg = ACTIVITY_LEVELS.map((level) =>
        defaultProteinPerKg(level, goal),
      );
      expect([...perKg].sort((a, b) => a - b)).toEqual(perKg);
    }
    for (const level of ACTIVITY_LEVELS) {
      expect(defaultProteinPerKg(level, 'lose')).toBeGreaterThan(
        defaultProteinPerKg(level, 'maintain'),
      );
    }
  });

  it('stays inside the range the research supports by default', () => {
    for (const level of ACTIVITY_LEVELS) {
      for (const goal of GOAL_TYPES) {
        const perKg = defaultProteinPerKg(level, goal);
        expect(perKg).toBeGreaterThanOrEqual(1);
        expect(perKg).toBeLessThanOrEqual(2.1);
      }
    }
  });
});

// Changing any number that decides a result must also raise FORMULA_VERSION,
// because stored targets keep the version they were calculated with.
// If this fails: update the snapshot and bump FORMULA_VERSION together.
describe('formula version guard', () => {
  it('pins version 2 to six control profiles', () => {
    const controls: TargetInput[] = [
      man,
      { ...man, goalType: 'lose', rateKgPerWeek: 0.5 },
      { ...man, goalType: 'gain', rateKgPerWeek: 0.25 },
      { ...woman, goalType: 'recomp' },
      { ...woman, goalType: 'lose', rateKgPerWeek: 1 },
      { ...man, activityLevel: 'very_active', goalType: 'recomp' },
    ];

    expect({
      version: FORMULA_VERSION,
      results: controls.map((input) => {
        const target = calculateTarget(input);
        return [
          target.caloriesKcal,
          target.proteinG,
          target.fatG,
          target.carbsG,
        ];
      }),
    }).toMatchInlineSnapshot(`
      {
        "results": [
          [
            2760,
            112,
            77,
            405,
          ],
          [
            2210,
            136,
            61,
            279,
          ],
          [
            3030,
            112,
            84,
            457,
          ],
          [
            1660,
            90,
            46,
            222,
          ],
          [
            1350,
            90,
            38,
            162,
          ],
          [
            3040,
            168,
            84,
            403,
          ],
        ],
        "version": 2,
      }
    `);
  });
});
