import { MAX_AGE, MIN_AGE, REGIONS } from './calc';
import type { Person, PlanId, RegionId, View } from './types';

export interface State {
  plan: PlanId;
  region: RegionId;
  view: View;
  people: Person[];
}

const PLANS: PlanId[] = ['thrifty', 'low', 'moderate', 'liberal'];
export const DEFAULT_STATE: State = {
  plan: 'thrifty',
  region: 'us',
  view: 'monthly',
  people: [
    { sex: 'F', age: 35 },
    { sex: 'M', age: 35 },
  ],
};

export function encodeState(s: State): string {
  const p = new URLSearchParams();
  p.set('plan', s.plan);
  p.set('loc', s.region);
  p.set('view', s.view);
  p.set('h', s.people.map((x) => `${x.sex}${x.age}`).join(','));
  return p.toString();
}

export function decodeState(search: string): State {
  const p = new URLSearchParams(search);
  const plan = p.get('plan') as PlanId;
  const region = p.get('loc') as RegionId;
  const view = p.get('view');
  const h = p.get('h');
  const people: Person[] = [];
  if (h !== null) {
    for (const tok of h.split(',').slice(0, 20)) {
      const m = tok.match(/^([FM])(\d{1,3})$/);
      if (!m) continue;
      const age = Number(m[2]);
      if (age >= MIN_AGE && age <= MAX_AGE) people.push({ sex: m[1] as 'F' | 'M', age });
    }
  }
  return {
    plan: PLANS.includes(plan) ? plan : DEFAULT_STATE.plan,
    region: REGIONS.some((r) => r.id === region) ? region : DEFAULT_STATE.region,
    view: view === 'weekly' ? 'weekly' : 'monthly',
    people: h === null ? structuredClone(DEFAULT_STATE.people) : people,
  };
}
