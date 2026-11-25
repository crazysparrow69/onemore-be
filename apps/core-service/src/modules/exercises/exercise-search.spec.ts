import { describe, expect, it } from 'vitest';
import { buildSearchPlan } from './exercise-search';

describe('buildSearchPlan', () => {
  it('has no words for an empty or blank query', () => {
    expect(buildSearchPlan(undefined).words).toEqual([]);
    expect(buildSearchPlan('   ').words).toEqual([]);
    expect(buildSearchPlan('').phrase).toBe('');
  });

  it('builds prefix patterns and a normalised phrase', () => {
    const plan = buildSearchPlan('  Жим  Лежачи ');

    expect(plan.phrase).toBe('жим лежачи');
    expect(plan.words.map((word) => word.patterns)).toEqual([
      ['% жим%'],
      ['% лежачи%', '% лежач%', '% лежа%'],
    ]);
  });

  it('resolves a muscle name in any language to the same muscle', () => {
    expect(buildSearchPlan('biceps').words[0]?.muscles).toContain('biceps');
    expect(buildSearchPlan('біцепс').words[0]?.muscles).toContain('biceps');
    expect(buildSearchPlan('БІЦЕПСИ').words[0]?.muscles).toContain('biceps');
  });

  it('resolves muscle aliases', () => {
    expect(buildSearchPlan('пекси').words[0]?.muscles).toEqual(['chest']);
    expect(buildSearchPlan('quads').words[0]?.muscles).toEqual(['quadriceps']);
  });

  it('resolves equipment names, aliases and inflected forms', () => {
    expect(buildSearchPlan('гантелями').words[0]?.equipment).toEqual([
      'dumbbell',
    ]);
    expect(buildSearchPlan('dumbbell').words[0]?.equipment).toEqual([
      'dumbbell',
    ]);
    expect(buildSearchPlan('сміт').words[0]?.equipment).toEqual([
      'smith_machine',
    ]);
  });

  it('resolves every word of a mixed query on its own', () => {
    const [equipmentWord, muscleWord] = buildSearchPlan('гантелі груди').words;

    expect(equipmentWord?.equipment).toEqual(['dumbbell']);
    expect(muscleWord?.muscles).toEqual(['chest']);
  });

  it('matches nothing among tags for an ordinary exercise word', () => {
    const [word] = buildSearchPlan('бенч').words;

    expect(word?.muscles).toEqual([]);
    expect(word?.equipment).toEqual([]);
  });
});
