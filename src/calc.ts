import type { CostData, Group, Person, PlanId, RegionId, View } from './types';

export const REGIONS: { id: RegionId; label: string }[] = [
  { id: 'us', label: 'Contiguous US & DC (U.S. average)' },
  { id: 'ak-anchorage', label: 'Alaska – Anchorage' },
  { id: 'ak-urban', label: 'Alaska – Other urban areas' },
  { id: 'ak-rural1', label: 'Alaska – Rural I' },
  { id: 'ak-rural2', label: 'Alaska – Rural II' },
  { id: 'hi', label: 'Hawaii' },
];

export const MIN_AGE = 1;
export const MAX_AGE = 120;

export function householdFactor(data: CostData, size: number): { factor: number; percent: number } {
  const row = data.householdAdjustment.find((r) => size >= r.minSize && size <= r.maxSize);
  if (!row) throw new Error(`No household adjustment for size ${size}`);
  return { factor: 1 + row.percent / 100, percent: row.percent };
}

export function findGroup(data: CostData, plan: PlanId, p: Person): Group | undefined {
  return data.plans[plan].groups.find(
    (g) => p.age >= g.ageMin && p.age <= g.ageMax && (g.sex === null || g.sex === p.sex),
  );
}

// USDA publishes Alaska/Hawaii costs only for the Thrifty reference family, so we scale by the ratio to the U.S. figure.
export function regionRatio(data: CostData, region: RegionId): number {
  const us = data.referenceFamily.monthly;
  const ak = data.regions.anchorageMonthly / us;
  const pct = data.regions.alaskaPercentAboveAnchorage;
  switch (region) {
    case 'us':
      return 1;
    case 'ak-anchorage':
      return ak;
    case 'ak-urban':
      return ak * (1 + pct.urban / 100);
    case 'ak-rural1':
      return ak * (1 + pct.ruralI / 100);
    case 'ak-rural2':
      return ak * (1 + pct.ruralII / 100);
    case 'hi':
      return data.regions.hawaiiMonthly / us;
  }
}

export interface Line {
  person: Person;
  group: Group;
  base: number;
  adjusted: number;
}

export type Result =
  | { ok: false; reason: 'unavailable' | 'empty' | 'invalid-age'; invalidIndex?: number }
  | {
      ok: true;
      lines: Line[];
      subtotal: number;
      percent: number;
      factor: number;
      ratio: number;
      derived: boolean;
      total: number;
    };

const cents = (n: number) => Math.round(n * 100) / 100;

export function calculate(
  data: CostData,
  input: { plan: PlanId; region: RegionId; view: View; people: Person[] },
): Result {
  const { plan, region, view, people } = input;
  if (region !== 'us' && plan !== 'thrifty') return { ok: false, reason: 'unavailable' };
  if (people.length === 0) return { ok: false, reason: 'empty' };

  const ratio = regionRatio(data, region);
  const { factor, percent } = householdFactor(data, people.length);
  const lines: Line[] = [];
  for (const [i, person] of people.entries()) {
    const group = findGroup(data, plan, person);
    if (!group || !Number.isInteger(person.age)) return { ok: false, reason: 'invalid-age', invalidIndex: i };
    const base = group[view] * ratio;
    lines.push({ person, group, base, adjusted: base * factor });
  }
  const subtotal = lines.reduce((s, l) => s + l.base, 0);
  return { ok: true, lines, subtotal, percent, factor, ratio, derived: region !== 'us', total: cents(subtotal * factor) };
}
