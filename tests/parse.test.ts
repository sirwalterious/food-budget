import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/costs-2026-08.json';
import costs from '../data/costs.json';
import { parseAll } from '../scripts/parse';
import { validate } from '../scripts/validate';
import type { CostData } from '../src/types';

const txt = (n: string) => readFileSync(new URL(`./fixtures/${n}.txt`, import.meta.url), 'utf8');
const pdf = { url: 'fixture', sha256: 'fixture' };
const run = (over: Partial<Record<'thrifty' | 'lowmodlib' | 'akhi', string>> = {}) =>
  parseAll({
    thriftyText: over.thrifty ?? txt('thrifty'),
    lowModLibText: over.lowmodlib ?? txt('lowmodlib'),
    akhiText: over.akhi ?? txt('akhi'),
    pdfs: { thrifty: pdf, lowmodlib: pdf, akhi: pdf },
    sourceUrl: 'fixture',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  });

describe('parser', () => {
  it('parses the saved Aug 2026 PDF text to the expected data', () => {
    expect(run()).toEqual(fixture);
  });
  it('extracts spot values exactly as printed', () => {
    const d = run();
    expect(d.meta.month).toBe('2026-08');
    expect(d.plans.thrifty.groups.find((g) => g.id === 'M14-19')).toMatchObject({ weekly: 75.3, monthly: 326.2 });
    expect(d.plans.moderate.groups.find((g) => g.id === 'F51-70')).toMatchObject({ weekly: 76.4, monthly: 331 });
    expect(d.plans.liberal.groups.find((g) => g.id === 'M71+')).toMatchObject({ weekly: 103.3, monthly: 447.7 });
    expect(d.regions.hawaiiMonthly).toBe(1556);
  });
  it('fails loudly when the layout changes', () => {
    expect(() => run({ thrifty: txt('thrifty').replace(/Reference Family/g, 'Sample Family') })).toThrow();
    expect(() => run({ akhi: txt('akhi').replace(/percent higher/g, 'percent more') })).toThrow(/percentages/);
    expect(() => run({ thrifty: txt('thrifty').replace(/subtract 10 percent/, 'subtract 15 percent') })).not.toThrow();
  });
  it('validator catches changed footnote factors, missing rows and wild jumps', () => {
    const changed = run({ thrifty: txt('thrifty').replace(/subtract 10 percent/, 'subtract 15 percent') });
    expect(validate(changed).join()).toMatch(/adjustment table changed/);
    const missing = structuredClone(fixture) as CostData;
    missing.plans.low.groups.pop();
    expect(validate(missing).length).toBeGreaterThan(0);
    const jump = structuredClone(fixture) as CostData;
    jump.referenceFamily.monthly *= 1.5;
    expect(validate(jump, fixture as CostData).join()).toMatch(/changed/);
  });
  it('rejects a PDF set whose months disagree', () => {
    expect(() => run({ akhi: txt('akhi').replace(/August 2026/g, 'July 2026') })).toThrow(/disagree/);
  });
});

describe('committed data/costs.json', () => {
  it('passes all validation checks', () => {
    expect(validate(costs as CostData)).toEqual([]);
  });
});
