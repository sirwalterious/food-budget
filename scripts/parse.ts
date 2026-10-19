import type { CostData, Group, PlanId, Sex } from '../src/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = MONTHS.join('|');
const MAX_AGE = 120;

export const normalize = (text: string) => text.replace(/\s+/g, ' ');
const money = (s: string) => Number(s.replace(/[$,]/g, ''));

interface Row {
  id: string;
  label: string;
  sex: Sex | null;
  ageMin: number;
  ageMax: number;
  values: number[]; // [weekly, monthly, weekly, monthly, ...]
}

export function parseRows(text: string): { rows: Row[]; reference: number[] | null } {
  const rows: Row[] = [];
  let section: string | null = null;
  let reference: number[] | null = null;
  let inReference = false;

  for (const line of text.split('\n')) {
    const sec = line.match(/^\s*(Child|Female|Male):\s*$/);
    if (sec) {
      section = sec[1]!;
      continue;
    }
    if (/Reference Family/i.test(line)) inReference = true;

    const row = line.match(/^\s*(\d+)(?:\s*-\s*(\d+)|(\+))?\s+years?\s+((?:\$[\d,]+\.\d\d\s*)+)/);
    if (row && section) {
      const ageMin = Number(row[1]);
      const ageMax = row[3] ? MAX_AGE : row[2] ? Number(row[2]) : ageMin;
      const sex: Sex | null = section === 'Female' ? 'F' : section === 'Male' ? 'M' : null;
      const range = row[3] ? `${ageMin}+` : ageMin === ageMax ? `${ageMin}` : `${ageMin}-${ageMax}`;
      rows.push({
        id: `${sex ?? 'C'}${range}`,
        label: row[3] ? `${ageMin}+ years` : ageMin === ageMax ? `${ageMin} year${ageMin === 1 ? '' : 's'}` : `${ageMin}-${ageMax} years`,
        sex,
        ageMin,
        ageMax,
        values: (row[4]!.match(/\$[\d,]+\.\d\d/g) ?? []).map(money),
      });
      continue;
    }
    if (inReference && !reference) {
      const vals = line.match(/\$[\d,]+\.\d\d/g);
      if (vals && vals.length >= 2) reference = vals.map(money);
    }
  }
  return { rows, reference };
}

function toGroups(rows: Row[], offset: number): Group[] {
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    sex: r.sex,
    ageMin: r.ageMin,
    ageMax: r.ageMax,
    weekly: r.values[offset]!,
    monthly: r.values[offset + 1]!,
  }));
}

export function parseMonth(text: string) {
  const m = normalize(text).match(new RegExp(`(${MONTH_RE}) (\\d{4})`));
  if (!m) throw new Error('Could not find data month in PDF');
  return { name: m[1]!, year: m[2]!, month: `${m[2]}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}` };
}

export function parseIssued(text: string): string {
  const m = normalize(text).match(new RegExp(`Issued (${MONTH_RE}) (\\d{4})`));
  if (!m) throw new Error('Could not find "Issued <Month> <Year>" in PDF');
  return `${m[1]} ${m[2]}`;
}

export function parseAdjustments(text: string): CostData['householdAdjustment'] {
  const t = normalize(text);
  const D = '[—–-]+';
  const S = '[;\u037e]'; // the PDF uses a Greek question mark for the semicolon
  const re = new RegExp(
    `1-person${D}add (\\d+) percent${S} 2-person${D}add (\\d+) percent${S} 3-person${D}add (\\d+) percent${S} 4-person${D}no adjustment${S} ` +
      `5- or 6-person${D}subtract (\\d+) percent${S} 7-\\s*\\(or more\\) person${D}subtract (\\d+) percent`,
  );
  const m = t.match(re);
  if (!m) throw new Error('Could not parse household size adjustment footnote');
  const [a1, a2, a3, s56, s7] = m.slice(1).map(Number) as [number, number, number, number, number];
  return [
    { minSize: 1, maxSize: 1, percent: a1 },
    { minSize: 2, maxSize: 2, percent: a2 },
    { minSize: 3, maxSize: 3, percent: a3 },
    { minSize: 4, maxSize: 4, percent: 0 },
    { minSize: 5, maxSize: 6, percent: -s56 },
    { minSize: 7, maxSize: 999, percent: -s7 },
  ];
}

export function parseAkhi(text: string) {
  const t = normalize(text);
  const vals = t.match(/Reference Family.*?(\$[\d,]+\.\d\d) (\$[\d,]+\.\d\d)/);
  if (!vals) throw new Error('Could not parse Alaska/Hawaii reference family costs');
  const pct = t.match(/Urban, Rural I, and Rural II areas of Alaska are ([\d.]+) percent, ([\d.]+) percent,? and ([\d.]+) percent higher/);
  if (!pct) throw new Error('Could not parse Alaska urban/rural percentages');
  return {
    anchorageMonthly: money(vals[1]!),
    hawaiiMonthly: money(vals[2]!),
    alaskaPercentAboveAnchorage: { urban: Number(pct[1]), ruralI: Number(pct[2]), ruralII: Number(pct[3]) },
  };
}

export interface ParseInput {
  thriftyText: string;
  lowModLibText: string;
  akhiText: string;
  pdfs: CostData['meta']['pdfs'];
  sourceUrl: string;
  fetchedAt: string;
}

export function parseAll(input: ParseInput): CostData {
  const thrifty = parseRows(input.thriftyText);
  const lml = parseRows(input.lowModLibText);
  if (!thrifty.reference || thrifty.reference.length < 2) throw new Error('Thrifty reference family not found');

  const months = [input.thriftyText, input.lowModLibText, input.akhiText].map(parseMonth);
  if (new Set(months.map((m) => m.month)).size !== 1) {
    throw new Error(`PDFs disagree on month: ${months.map((m) => m.month).join(', ')}`);
  }
  const month = months[0]!;

  const plan = (name: string, groups: Group[]) => ({ name, groups });
  return {
    meta: {
      month: month.month,
      monthLabel: `${month.name} ${month.year}`,
      issuedLabel: parseIssued(input.akhiText),
      sourceUrl: input.sourceUrl,
      fetchedAt: input.fetchedAt,
      pdfs: input.pdfs,
    },
    householdAdjustment: parseAdjustments(input.thriftyText),
    referenceFamily: { weekly: thrifty.reference[0]!, monthly: thrifty.reference[1]! },
    plans: {
      thrifty: plan('Thrifty', toGroups(thrifty.rows, 0)),
      low: plan('Low-Cost', toGroups(lml.rows, 0)),
      moderate: plan('Moderate-Cost', toGroups(lml.rows, 2)),
      liberal: plan('Liberal', toGroups(lml.rows, 4)),
    } satisfies Record<PlanId, unknown>,
    regions: parseAkhi(input.akhiText),
  };
}
