# Food Budget Calculator

A static web app that estimates a household grocery budget using **only** the official
[USDA Cost of Food Monthly Reports](https://www.fna.usda.gov/research/cnpp/usda-food-plans/cost-food-monthly-reports).

Pick a plan (Thrifty, Low-Cost, Moderate-Cost, Liberal), a location, and the people in your household. The app sums the
USDA per-person costs and applies USDA's household-size adjustment (1 person +20%, 2 +10%, 3 +5%, 4 none, 5–6 −5%, 7+ −10%).
Weekly/monthly toggle and shareable URLs are included. The data month is always shown.

## Notes on the data
- Alaska and Hawaii: USDA publishes only the Thrifty reference-family cost. Per-person costs are scaled by
  (that figure ÷ U.S. reference family). Alaska Urban/Rural I/Rural II apply USDA's published percentages over Anchorage.
  These are flagged as estimates in the UI; other plans are not offered for AK/HI.
- Thrifty uses age bands 14–19 / 20–50; the other plans use 14–18 / 19–50. The app maps each age to the right band.
- Weekly and monthly figures are USDA's published values (not converted by us).

## Development
```
npm ci
npm run dev          # local dev server
npm test             # unit, golden, parser, data-validation, Python cross-check
npm run e2e          # Playwright (needs `npx playwright install chromium`)
npm run build
```

## Data updates (automatic)
`data/costs.json` is the only data the app reads (bundled at build time; no runtime calls to USDA).
`.github/workflows/update-data.yml` runs daily: it finds the PDF links on the USDA page, skips if their hashes are unchanged,
otherwise parses them (`pdftotext`), runs strict validation (`scripts/validate.ts`), runs the tests, commits to `main`,
and triggers a Pages deploy. If parsing or validation fails, nothing is committed, the site keeps the last good month, and a
GitHub issue (`data-update-failed`) is opened. Manual run: `npm run update-data` (needs `poppler-utils`), `-- --force` to re-parse.
If USDA changes the PDF layout, fix `scripts/parse.ts` and update the fixtures in `tests/fixtures/`.

## Deployment
GitHub Pages via `.github/workflows/deploy.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
Make sure the default branch is `main`, and that Actions can push (Settings → Actions → Workflow permissions: read and write).

## Testing the math
- `tests/calc.test.ts` golden values computed by hand from the USDA PDFs (e.g. reference family = $1,023.70/month),
  age-band boundaries, region ratios, and a 300-case cross-check against an independent Python implementation.
- Tests run against a frozen fixture (`tests/fixtures/costs-2026-08.json`) so monthly data updates don't break them;
  `tests/parse.test.ts` validates the live `data/costs.json`.
