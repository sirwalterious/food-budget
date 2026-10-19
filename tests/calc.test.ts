import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/costs-2026-08.json';
import { calculate, findGroup, householdFactor, regionRatio } from '../src/calc';
import type { CostData, Person, PlanId, RegionId, View } from '../src/types';

const data = fixture as CostData;
const F = (age: number): Person => ({ sex: 'F', age });
const M = (age: number): Person => ({ sex: 'M', age });
const total = (plan: PlanId, people: Person[], view: View = 'monthly', region: RegionId = 'us') => {
  const r = calculate(data, { plan, region, view, people });
  if (!r.ok) throw new Error(r.reason);
  return r.total;
};

describe('household size factor (USDA footnote 2)', () => {
  it.each([
    [1, 1.2], [2, 1.1], [3, 1.05], [4, 1], [5, 0.95], [6, 0.95], [7, 0.9], [8, 0.9], [12, 0.9],
  ])('size %i -> %f', (n, f) => {
    expect(householdFactor(data, n).factor).toBeCloseTo(f, 10);
  });
});

// Expected values are computed by hand from the August 2026 USDA PDFs, independent of the code.
describe('golden values from the USDA PDFs (Aug 2026)', () => {
  it('Thrifty reference family of four = $1,023.70/month (published figure)', () => {
    expect(total('thrifty', [F(35), M(35), F(7), M(10)])).toBe(1023.7);
    expect(data.referenceFamily.monthly).toBe(1023.7);
  });
  it('Thrifty reference family weekly within rounding of published $236.30', () => {
    expect(total('thrifty', [F(35), M(35), F(7), M(10)], 'weekly')).toBeCloseTo(236.2, 2);
  });
  it('1 adult female 20-50, Thrifty: 253.70 x 1.20', () => expect(total('thrifty', [F(30)])).toBe(304.44));
  it('couple 20-50, Thrifty: (253.70+318.90) x 1.10', () => expect(total('thrifty', [F(30), M(30)])).toBe(629.86));
  it('1 adult female 19-50, Low-Cost: 275.70 x 1.20', () => expect(total('low', [F(30)])).toBe(330.84));
  it('1 adult male 19-50, Moderate: 398.10 x 1.20', () => expect(total('moderate', [M(30)])).toBe(477.72));
  it('1 adult male 19-50, Liberal weekly: 112.20 x 1.20', () => expect(total('liberal', [M(30)], 'weekly')).toBe(134.64));
  it('family of 5, Thrifty: sum x 0.95', () => {
    // 114.20 + 172.60 + 188.30 + 253.70 + 281.20 (M51-70) = 1010.00
    expect(total('thrifty', [F(1), F(3), M(5), F(40), M(60)])).toBe(959.5);
  });
  it('family of 7, Liberal: sum x 0.90', () => {
    const ppl = [M(40), F(40), F(72), M(72), F(13), M(13), F(15)];
    // 486.20 + 428.80 + 394.10 + 447.70 + 400.90 + 460.50 + 399.30 = 3017.50
    expect(total('liberal', ppl)).toBe(2715.75);
  });
});

describe('age band boundaries', () => {
  it('Thrifty: 19 is in 14-19, 20 is in 20-50', () => {
    expect(findGroup(data, 'thrifty', F(19))!.id).toBe('F14-19');
    expect(findGroup(data, 'thrifty', F(20))!.id).toBe('F20-50');
  });
  it('Low-Cost: 18 is in 14-18, 19 is in 19-50', () => {
    expect(findGroup(data, 'low', F(18))!.id).toBe('F14-18');
    expect(findGroup(data, 'low', F(19))!.id).toBe('F19-50');
  });
  it('children ignore sex; 71+ covers old ages', () => {
    expect(findGroup(data, 'thrifty', F(8))).toEqual(findGroup(data, 'thrifty', M(8)));
    expect(findGroup(data, 'thrifty', M(100))!.id).toBe('M71+');
  });
  it('rejects ages out of range or non-integer', () => {
    for (const age of [0, -1, 121, 3.5, NaN]) {
      expect(calculate(data, { plan: 'thrifty', region: 'us', view: 'monthly', people: [F(age)] }).ok).toBe(false);
    }
  });
  it('requires at least one person', () => {
    expect(calculate(data, { plan: 'thrifty', region: 'us', view: 'monthly', people: [] })).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('regions', () => {
  it('Anchorage reference family reproduces the published $1,294.70', () => {
    const fam = [F(35), M(35), F(7), M(10)];
    expect(total('thrifty', fam, 'monthly', 'ak-anchorage')).toBeCloseTo(1294.7, 1);
    expect(total('thrifty', fam, 'monthly', 'hi')).toBeCloseTo(1556, 1);
  });
  it('Alaska urban/rural multipliers apply on top of Anchorage', () => {
    const a = regionRatio(data, 'ak-anchorage');
    expect(regionRatio(data, 'ak-urban')).toBeCloseTo(a * 1.0079, 10);
    expect(regionRatio(data, 'ak-rural1')).toBeCloseTo(a * 1.2852, 10);
    expect(regionRatio(data, 'ak-rural2')).toBeCloseTo(a * 1.5642, 10);
  });
  it('non-Thrifty plans are unavailable outside the contiguous US', () => {
    for (const plan of ['low', 'moderate', 'liberal'] as const) {
      expect(calculate(data, { plan, region: 'hi', view: 'monthly', people: [F(30)] })).toEqual({ ok: false, reason: 'unavailable' });
    }
  });
});

describe('independent Python cross-check', () => {
  it('matches the TypeScript calculator on many households', () => {
    const plans: PlanId[] = ['thrifty', 'low', 'moderate', 'liberal'];
    const ages = [1, 2, 4, 6, 9, 12, 14, 18, 19, 20, 35, 50, 51, 70, 71, 95];
    const cases: { plan: PlanId; region: RegionId; view: View; people: Person[] }[] = [];
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const regions: RegionId[] = ['us', 'ak-anchorage', 'ak-urban', 'ak-rural1', 'ak-rural2', 'hi'];
    for (let i = 0; i < 300; i++) {
      const plan = plans[rnd(4)]!;
      const region = plan === 'thrifty' ? regions[rnd(6)]! : 'us';
      const n = 1 + rnd(9);
      const people = Array.from({ length: n }, () => ({ sex: (rnd(2) ? 'F' : 'M') as 'F' | 'M', age: ages[rnd(ages.length)]! }));
      cases.push({ plan, region, view: rnd(2) ? 'weekly' : 'monthly', people });
    }
    const py = JSON.parse(
      execFileSync('python3', ['tests/crosscheck.py'], {
        input: JSON.stringify({
          costs: 'tests/fixtures/costs-2026-08.json',
          cases: cases.map((c) => ({ ...c, people: c.people.map((p) => [p.sex, p.age]) })),
        }),
        encoding: 'utf8',
      }),
    ) as number[];
    cases.forEach((c, i) => expect(total(c.plan, c.people, c.view, c.region), JSON.stringify(c)).toBeCloseTo(py[i]!, 2));
  });
});
