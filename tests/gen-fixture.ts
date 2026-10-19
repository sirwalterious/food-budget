// Regenerates tests/fixtures/costs-2026-08.json from the saved PDF text. Run only when the parser intentionally changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAll } from '../scripts/parse';

const t = (n: string) => readFileSync(new URL(`./fixtures/${n}.txt`, import.meta.url), 'utf8');
const pdf = { url: 'fixture', sha256: 'fixture' };
const data = parseAll({
  thriftyText: t('thrifty'),
  lowModLibText: t('lowmodlib'),
  akhiText: t('akhi'),
  pdfs: { thrifty: pdf, lowmodlib: pdf, akhi: pdf },
  sourceUrl: 'fixture',
  fetchedAt: '2026-01-01T00:00:00.000Z',
});
writeFileSync(new URL('./fixtures/costs-2026-08.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
