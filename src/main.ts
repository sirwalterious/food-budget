import './style.css';
import data from '../data/costs.json';
import { MAX_AGE, MIN_AGE, REGIONS, calculate, findGroup } from './calc';
import { DEFAULT_STATE, decodeState, encodeState, type State } from './url';
import type { CostData, PlanId, RegionId, Sex } from './types';

const costs = data as CostData;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const PLAN_HELP: Record<PlanId, string> = {
  thrifty: 'Lowest cost. Nutritious, practical diet; the basis for SNAP benefits.',
  low: 'A step up from Thrifty, with more variety.',
  moderate: 'Mid-range plan with more flexibility in food choices.',
  liberal: 'Highest cost; the most variety and convenience foods.',
};

let state: State = decodeState(location.search);

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function initStatic() {
  $('data-banner').textContent = `Using USDA Cost of Food data for ${costs.meta.monthLabel} (issued ${costs.meta.issuedLabel}).`;
  ($('src-link') as HTMLAnchorElement).href = costs.meta.sourceUrl;
  $('pdf-links').innerHTML = (['thrifty', 'lowmodlib', 'akhi'] as const)
    .map((k) => `<a href="${esc(costs.meta.pdfs[k].url)}" rel="noopener">${{ thrifty: 'Thrifty PDF', lowmodlib: 'Low/Moderate/Liberal PDF', akhi: 'Alaska & Hawaii PDF' }[k]}</a>`)
    .join(' · ');

  const [y, m] = costs.meta.month.split('-').map(Number) as [number, number];
  const now = new Date();
  const monthsOld = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (monthsOld > 3) {
    $('stale').hidden = false;
    $('stale').textContent = `This data is ${monthsOld} months old; USDA normally publishes a new report monthly. Check the source for newer figures.`;
  }

  $<HTMLSelectElement>('plan').innerHTML = (Object.keys(costs.plans) as PlanId[])
    .map((id) => `<option value="${id}">${costs.plans[id].name} Plan</option>`)
    .join('');
  $<HTMLSelectElement>('region').innerHTML = REGIONS.map((r) => `<option value="${r.id}">${r.label}</option>`).join('');
}

function renderPeople() {
  const box = $('people');
  box.innerHTML = '';
  state.people.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'person';
    row.innerHTML = `
      <div><label for="age-${i}">Age</label>
        <input id="age-${i}" data-testid="age-${i}" type="number" min="${MIN_AGE}" max="${MAX_AGE}" step="1" inputmode="numeric" value="${Number.isFinite(p.age) ? p.age : ''}" /></div>
      <div id="sexwrap-${i}"><label for="sex-${i}">Sex</label>
        <select id="sex-${i}" data-testid="sex-${i}"><option value="F">Female</option><option value="M">Male</option></select></div>
      <span class="grp" id="grp-${i}"></span>
      <button type="button" class="icon" data-testid="remove-${i}" aria-label="Remove person ${i + 1}">✕</button>`;
    const age = row.querySelector<HTMLInputElement>('input')!;
    const sex = row.querySelector<HTMLSelectElement>('select')!;
    sex.value = p.sex;
    age.addEventListener('input', () => {
      p.age = age.value === '' ? NaN : Number(age.value);
      update();
    });
    sex.addEventListener('change', () => {
      p.sex = sex.value as Sex;
      update();
    });
    row.querySelector('button')!.addEventListener('click', () => {
      state.people.splice(i, 1);
      renderPeople();
      update();
    });
    box.append(row);
  });
}

function update() {
  $<HTMLSelectElement>('plan').value = state.plan;
  $<HTMLSelectElement>('region').value = state.region;
  $('plan-help').textContent = PLAN_HELP[state.plan];
  for (const v of ['weekly', 'monthly'] as const) $(`v-${v}`).setAttribute('aria-pressed', String(state.view === v));

  state.people.forEach((p, i) => {
    const g = findGroup(costs, state.plan, p);
    $(`grp-${i}`).textContent = g ? `Plan group: ${g.sex ? (g.sex === 'F' ? 'Female' : 'Male') : 'Child'} ${g.label}` : '';
    $(`sexwrap-${i}`).hidden = p.age < 12;
  });

  const res = calculate(costs, state);
  const out = $('results');
  const per = state.view === 'weekly' ? 'week' : 'month';

  if (!res.ok) {
    if (res.reason === 'unavailable') {
      out.innerHTML = `<p class="warn" data-testid="unavailable">USDA publishes Alaska and Hawaii costs only for the Thrifty Plan. Choose the Thrifty Plan, or select the contiguous US, to see a result.</p>
        <button type="button" id="to-thrifty">Switch to Thrifty Plan</button>`;
      $('to-thrifty').addEventListener('click', () => {
        state.plan = 'thrifty';
        update();
      });
    } else if (res.reason === 'empty') {
      out.innerHTML = '<p>Add at least one person to see your budget.</p>';
    } else {
      out.innerHTML = `<p class="err" data-testid="invalid">Person ${(res.invalidIndex ?? 0) + 1}: enter a whole-number age from ${MIN_AGE} to ${MAX_AGE}. (USDA does not publish costs for infants under 1.)</p>`;
    }
  } else {
    const sign = res.percent > 0 ? '+' : '';
    const adjText =
      res.percent === 0
        ? `No household-size adjustment for ${state.people.length} people`
        : `Household-size adjustment for ${state.people.length} ${state.people.length === 1 ? 'person' : 'people'}: ${sign}${res.percent}%`;
    out.innerHTML = `
      <p class="total" data-testid="total">${usd(res.total)} <small>per ${per}</small></p>
      <table>
        <thead><tr><th>Person</th><th class="num">USDA base</th><th class="num">Adjusted</th></tr></thead>
        <tbody>${res.lines
          .map((l) => `<tr><td>${l.group.sex === 'F' ? 'Female' : l.group.sex === 'M' ? 'Male' : 'Child'} ${l.group.label}</td><td class="num">${usd(l.base)}</td><td class="num">${usd(l.adjusted)}</td></tr>`)
          .join('')}</tbody>
        <tfoot><tr><th>Sum of individuals</th><td class="num" colspan="2" data-testid="subtotal">${usd(res.subtotal)}</td></tr></tfoot>
      </table>
      <p class="note" data-testid="adjustment">${adjText}, applied to the sum of individual costs.</p>
      ${res.derived ? `<p class="note" data-testid="derived">Estimated: USDA publishes Thrifty costs for ${REGIONS.find((r) => r.id === state.region)!.label} only for a reference family of four. Each person's U.S. cost is scaled by ${res.ratio.toFixed(4)}× (that figure ÷ the U.S. reference family).</p>` : ''}`;
  }

  history.replaceState(null, '', `?${encodeState(state)}`);
}

function init() {
  initStatic();
  renderPeople();
  $<HTMLSelectElement>('plan').addEventListener('change', (e) => {
    state.plan = (e.target as HTMLSelectElement).value as PlanId;
    update();
  });
  $<HTMLSelectElement>('region').addEventListener('change', (e) => {
    state.region = (e.target as HTMLSelectElement).value as RegionId;
    update();
  });
  for (const v of ['weekly', 'monthly'] as const) {
    $(`v-${v}`).addEventListener('click', () => {
      state.view = v;
      update();
    });
  }
  $('add').addEventListener('click', () => {
    state.people.push({ ...DEFAULT_STATE.people[0]! });
    renderPeople();
    update();
  });
  $('share').addEventListener('click', async () => {
    const status = $('share-status');
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent = 'Link copied!';
    } catch {
      status.textContent = 'Copy this page address from your browser bar.';
    }
  });
  update();
}

init();
