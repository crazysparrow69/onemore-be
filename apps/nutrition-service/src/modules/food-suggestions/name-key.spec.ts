import { describe, expect, it } from 'vitest';
import { escapeLike, toNameKey } from './name-key';

describe('toNameKey', () => {
  it('lowercases, trims and collapses spaces', () => {
    expect(toNameKey('  Овсянка   С Бананом ')).toBe('овсянка с бананом');
  });

  it('treats ё and е as the same letter', () => {
    expect(toNameKey('Мёд')).toBe(toNameKey('мед'));
  });

  it('gives one key to a precomposed and a decomposed letter', () => {
    expect(toNameKey('Йогурт')).toBe(toNameKey('Йогурт'));
  });

  it('keeps Ukrainian letters apart', () => {
    expect(toNameKey('Їжа')).toBe('їжа');
  });
});

describe('escapeLike', () => {
  it('escapes the characters that LIKE treats as patterns', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('овсянка')).toBe('овсянка');
  });
});
