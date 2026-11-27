# Daily calorie and macro target (formula version 2)

Code: `apps/nutrition-service/src/modules/targets/target-formula.ts`.
Tests: `target-formula.spec.ts` (unit) and `test/integration/targets.int-spec.ts`.
Every stored automatic target keeps the `formula_version` and the `inputs` it was calculated from.

## Rule for changing it

Changing any number or rule below changes results. When you do it:

1. Raise `FORMULA_VERSION`.
2. Update the inline snapshot in the "formula version guard" test (it fails on purpose).
3. Recalculate the expected numbers of the reference table in the spec by hand or with a separate script of your own (not from the TypeScript code) and update this document.

Old targets in the database stay as they were. Only new calculations use the new version.

## Calories

| Step | Rule |
| --- | --- |
| BMR | Mifflin - St Jeor: `10 * kg + 6.25 * cm - 5 * age + 5` (male) or `- 161` (female) |
| TDEE | `BMR * activity factor`: sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9 |
| Lose | `TDEE - rate * 7700 / 7` kcal (7700 kcal per kg of body weight, rate in kg per week) |
| Gain | `TDEE + rate * 7700 / 7` |
| Recomposition | `TDEE * 0.9` |
| Maintain | `TDEE` |
| Safe floor (deficits only) | at least `max(BMR, 1500)` for men and `max(BMR, 1200)` for women; `floorApplied` is true when the deficit went below it |
| Final | rounded to 10 kcal (a deficit is never rounded below the floor), kept within 800 - 8000 |

Mifflin - St Jeor is the equation with the best accuracy among the common ones in healthy adults, and 7700 kcal per kg is the usual rule of thumb. Both are estimates: the real needs differ per person, so the target is a start that the user adjusts by watching the weight trend.

## Macros

Calories are decided first. Macros are derived from them and from body weight.

**Protein** is `grams per kg * weight`, at most 40 percent of the calories. If the weight is unknown, 25 percent of calories.

Default grams per kg is `base for the activity level + bonus for the goal`:

| Activity level | Base g/kg | Goal | Bonus g/kg |
| --- | --- | --- | --- |
| sedentary | 1.0 | lose | +0.3 |
| light | 1.2 | recomp | +0.3 |
| moderate | 1.4 | maintain | 0 |
| active | 1.6 | gain | 0 |
| very active | 1.8 | | |

So a moderately active person maintaining weight gets 1.4 g/kg, and the same person cutting gets 1.7 g/kg.

**Fat** is 25 percent of calories by default (9 kcal per g). **Carbs** are the rest (4 kcal per g), never below zero.

The user can set their own protein (0.8 - 3 g/kg) and fat share (15 - 45 percent). Own numbers replace the defaults; the 40 percent protein cap still applies. An own calorie target (1000 - 6000 kcal) gets its macros by the same rules, from the profile's weight, goal, activity and own numbers, and keeps them until the calories are set again.

### Why these protein numbers

- The RDA of 0.8 g/kg is the amount that prevents deficiency in healthy adults. It is not a target for people who train or who diet.
- The ISSN position stand (Jäger et al., 2017, J Int Soc Sports Nutr 14:20) says 1.4 - 2.0 g/kg/day is sufficient for most exercising people and that higher intakes (2.3 - 3.1 g/kg/day) may help to keep lean mass in resistance-trained people during a calorie deficit.
- The meta-analysis of Morton et al. (2018, Br J Sports Med 52:376) found no further gain in lean mass from resistance training above about 1.6 g/kg/day (95 percent confidence interval about 1.0 - 2.2). It covers people who were not dieting.
- So the defaults sit around the middle of the ISSN range for people who train, a little higher when cutting, and lower for people who hardly move. The activity level is only a proxy for how trained a person is. Someone who lifts seriously and is lean may want more than the default (the supported maximum is 3 g/kg), someone who eats less and does well can set less. That is why the numbers can be set by hand.
- Protein above these ranges is not known to be harmful in healthy people, but it also stops helping.

This is general information for healthy adults, not medical advice.

## Reference check

The expected numbers of the reference table in `target-formula.spec.ts` were calculated by a separate implementation of this formula written without looking at the TypeScript, so the test checks the formula and not itself.
