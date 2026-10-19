import type { CostData, PlanId } from '../src/types';

const PLAN_IDS: PlanId[] = ['thrifty', 'low', 'moderate', 'liberal'];
const EXPECTED_GROUPS = 15;
const MAX_MONTHLY_CHANGE = 0.1;

// Returns a list of problems; empty means the data is trustworthy.
export function validate(data: CostData, previous?: CostData): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  if (!/^\d{4}-\d{2}$/.test(data.meta.month)) err(`bad month ${data.meta.month}`);

  for (const id of PLAN_IDS) {
    const groups = data.plans[id]?.groups ?? [];
    if (groups.length !== EXPECTED_GROUPS) err(`${id}: expected ${EXPECTED_GROUPS} groups, got ${groups.length}`);
    for (const g of groups) {
      if (![g.weekly, g.monthly].every((n) => Number.isFinite(n))) {
        err(`${id}/${g.id}: non-numeric cost`);
        continue;
      }
      if (g.weekly < 10 || g.weekly > 250) err(`${id}/${g.id}: weekly ${g.weekly} out of range`);
      if (g.monthly < 40 || g.monthly > 1100) err(`${id}/${g.id}: monthly ${g.monthly} out of range`);
      if (Math.abs(g.weekly * 4.333 - g.monthly) > 0.5) err(`${id}/${g.id}: monthly ${g.monthly} != weekly ${g.weekly} x 4.333`);
    }
    const ids = new Set(groups.map((g) => g.id));
    if (ids.size !== groups.length) err(`${id}: duplicate groups`);
    // Age bands must tile 1..120 for each sex with no gaps or overlaps.
    for (const sex of ['F', 'M'] as const) {
      const bands = groups.filter((g) => g.sex === sex || g.sex === null).sort((a, b) => a.ageMin - b.ageMin);
      let next = 1;
      for (const b of bands) {
        if (b.ageMin !== next) err(`${id}/${sex}: age bands have a gap or overlap at ${b.id}`);
        next = b.ageMax + 1;
      }
      if (next !== 121) err(`${id}/${sex}: age bands do not cover ages 1 to 120`);
    }
  }

  // Plans must get more expensive from thrifty to liberal for every comparable group start age.
  for (const sex of ['F', 'M', null] as const) {
    for (const g of data.plans.low?.groups.filter((x) => x.sex === sex) ?? []) {
      const m = data.plans.moderate.groups.find((x) => x.id === g.id);
      const l = data.plans.liberal.groups.find((x) => x.id === g.id);
      if (!m || !l) err(`moderate/liberal missing ${g.id}`);
      else if (!(g.monthly <= m.monthly && m.monthly <= l.monthly)) err(`${g.id}: low/moderate/liberal costs not ascending`);
    }
  }

  // The USDA reference family (SNAP basis) must equal the sum of its members.
  const t = data.plans.thrifty?.groups ?? [];
  const pick = (id: string) => t.find((g) => g.id === id);
  const members = [pick('C6-8'), pick('C9-11'), pick('F20-50'), pick('M20-50')];
  if (members.some((m) => !m)) err('thrifty reference family members missing');
  else {
    const m = members.reduce((s, g) => s + g!.monthly, 0);
    const w = members.reduce((s, g) => s + g!.weekly, 0);
    if (Math.abs(m - data.referenceFamily.monthly) > 1) err(`reference family monthly ${data.referenceFamily.monthly} != member sum ${m.toFixed(2)}`);
    if (Math.abs(w - data.referenceFamily.weekly) > 0.5) err(`reference family weekly ${data.referenceFamily.weekly} != member sum ${w.toFixed(2)}`);
  }

  const expectedAdj = [20, 10, 5, 0, -5, -10];
  const adj = data.householdAdjustment ?? [];
  if (adj.length !== 6 || adj.some((a, i) => a.percent !== expectedAdj[i])) {
    err(`household adjustment table changed: ${JSON.stringify(adj.map((a) => a.percent))} (expected ${JSON.stringify(expectedAdj)}); review before accepting`);
  }

  const r = data.regions;
  if (!(r.anchorageMonthly > data.referenceFamily.monthly && r.anchorageMonthly < data.referenceFamily.monthly * 2)) err('Anchorage cost implausible');
  if (!(r.hawaiiMonthly > data.referenceFamily.monthly && r.hawaiiMonthly < data.referenceFamily.monthly * 2)) err('Hawaii cost implausible');
  const a = r.alaskaPercentAboveAnchorage;
  if (!(a.urban >= 0 && a.urban < a.ruralI && a.ruralI < a.ruralII && a.ruralII < 100)) err('Alaska urban/rural percentages implausible');

  if (previous) {
    if (data.meta.month < previous.meta.month) err(`new data month ${data.meta.month} is older than current ${previous.meta.month}`);
    const change = data.referenceFamily.monthly / previous.referenceFamily.monthly - 1;
    if (Math.abs(change) > MAX_MONTHLY_CHANGE) err(`reference family changed ${(change * 100).toFixed(1)}% vs previous month`);
  }
  return errors;
}
