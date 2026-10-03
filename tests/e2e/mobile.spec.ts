import { expect, test } from '@playwright/test';

test('consultation et leviers sur mobile, sans défilement horizontal', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('probabilite')).toContainText('%');
  await expect(page.getByText(/contrôles sur 12 au vert/)).toBeVisible({ timeout: 20_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId('case-L2').check();
  await expect(page.getByTestId('probabilite')).toContainText('avec L2');
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow2).toBeLessThanOrEqual(0);
});
