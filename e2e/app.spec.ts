import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const costs = JSON.parse(readFileSync('data/costs.json', 'utf8'));

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const g = (id: string) => costs.plans.thrifty.groups.find((x: { id: string }) => x.id === id);

test('default household, month banner, weekly/monthly toggle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('data-banner')).toContainText(costs.meta.monthLabel);
  const expected = (g('F20-50').monthly + g('M20-50').monthly) * 1.1;
  await expect(page.getByTestId('total')).toContainText(money(Math.round(expected * 100) / 100));
  await page.getByRole('button', { name: 'Weekly' }).click();
  const w = (g('F20-50').weekly + g('M20-50').weekly) * 1.1;
  await expect(page.getByTestId('total')).toContainText(money(Math.round(w * 100) / 100));
});

test('add/remove people applies size adjustment; share URL restores state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add person' }).click();
  await page.getByTestId('age-2').fill('8');
  await page.getByRole('button', { name: '+ Add person' }).click();
  await page.getByTestId('age-3').fill('10');
  await expect(page.getByTestId('adjustment')).toContainText('No household-size adjustment');
  await expect(page.getByTestId('total')).toContainText('$1,02'); // ~USDA reference family
  await expect(page).toHaveURL(/h=F35%2CM35%2CF8%2CF10|h=F35,M35,F8,F10/);

  const url = page.url();
  await page.getByTestId('remove-3').click();
  await expect(page.getByTestId('adjustment')).toContainText('+5%');
  await page.goto(url);
  await expect(page.getByTestId('age-3')).toHaveValue('10');
});

test('AK/HI only for Thrifty', async ({ page }) => {
  await page.goto('/?plan=low&loc=hi&h=F30');
  await expect(page.getByTestId('unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Thrifty Plan' }).click();
  await expect(page.getByTestId('derived')).toBeVisible();
  await expect(page.getByTestId('total')).toBeVisible();
});

test('invalid age shows an error, not a number', async ({ page }) => {
  await page.goto('/?h=F30');
  await page.getByTestId('age-0').fill('0');
  await expect(page.getByTestId('invalid')).toBeVisible();
});
