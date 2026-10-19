import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { CostData } from '../src/types';
import { parseAll } from './parse';
import { validate } from './validate';

const PAGE = 'https://www.fna.usda.gov/research/cnpp/usda-food-plans/cost-food-monthly-reports';
const OUT = resolve('data/costs.json');
const UA = 'Mozilla/5.0 (food-budget data updater; +https://github.com)';
const KINDS = ['thrifty', 'lowmodlib', 'akhi'] as const;
type Kind = (typeof KINDS)[number];

const args = process.argv.slice(2);
const force = args.includes('--force');
const dirIdx = args.indexOf('--pdf-dir'); // offline mode: <dir>/{thrifty,lowmodlib,akhi}.pdf
const pdfDir = dirIdx >= 0 ? args[dirIdx + 1] : undefined;

async function discover(): Promise<Record<Kind, string>> {
  const res = await fetch(PAGE, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`);
  const html = await res.text();
  const found: Partial<Record<Kind, string>> = {};
  for (const m of html.matchAll(/href="([^"]*CostofFood[^"]*\.pdf)"/gi)) {
    const href = m[1]!;
    const kind: Kind | null = /Thrifty/i.test(href) ? 'thrifty' : /LowModLib/i.test(href) ? 'lowmodlib' : /AKHI/i.test(href) ? 'akhi' : null;
    if (kind && !found[kind]) found[kind] = new URL(href, PAGE).href;
  }
  for (const k of KINDS) if (!found[k]) throw new Error(`Could not find ${k} PDF link on the page`);
  return found as Record<Kind, string>;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function pdfToText(buf: Buffer): string {
  const file = join(mkdtempSync(join(tmpdir(), 'fb-')), 'in.pdf');
  writeFileSync(file, buf);
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

async function main() {
  const previous: CostData | undefined = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : undefined;

  const urls = pdfDir ? ({ thrifty: 'local', lowmodlib: 'local', akhi: 'local' } as Record<Kind, string>) : await discover();
  const bufs = {} as Record<Kind, Buffer>;
  for (const k of KINDS) bufs[k] = pdfDir ? readFileSync(join(pdfDir, `${k}.pdf`)) : await download(urls[k]);
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const pdfs = Object.fromEntries(KINDS.map((k) => [k, { url: urls[k], sha256: hash(bufs[k]) }])) as CostData['meta']['pdfs'];

  if (previous && !force && KINDS.every((k) => previous.meta.pdfs[k].sha256 === pdfs[k].sha256)) {
    console.log(`No change: still ${previous.meta.monthLabel}.`);
    return;
  }

  const data = parseAll({
    thriftyText: pdfToText(bufs.thrifty),
    lowModLibText: pdfToText(bufs.lowmodlib),
    akhiText: pdfToText(bufs.akhi),
    pdfs,
    sourceUrl: PAGE,
    fetchedAt: new Date().toISOString(),
  });
  const errors = validate(data, previous);
  if (errors.length) {
    console.error('Validation failed; data/costs.json NOT updated:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated data/costs.json to ${data.meta.monthLabel}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
