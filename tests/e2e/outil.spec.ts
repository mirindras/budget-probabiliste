import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { budgetTemplate } from '../../src/io/excel.ts';

test.skip(({ isMobile }) => isMobile, 'parcours sur ordinateur');

// Ces parcours portent sur la vue « Analyse détaillée » (CDG, FP&A) ; la synthèse CODIR a son propre test.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('vue', 'analyse'));
});

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('probabilite')).toBeVisible();
  // Résultat complet (contrôles compris) : le voyant de l'onglet Contrôles apparaît.
  await expect(page.locator('[role=tab] .light')).toBeVisible({ timeout: 20_000 });
}

test('UC03 : ALFA préchargée, probabilité d\'atteinte affichée dès l\'ouverture', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('./');
  await expect(page.getByTestId('probabilite')).toContainText('%');
  expect(Date.now() - t0).toBeLessThan(3000);
  await expect(page.getByTestId('probabilite')).toContainText('30');
  await expect(page.locator('h2.headline')).toContainText('9,4 GAr a 30 %');
  await expect(page.getByTestId('run-ref')).toContainText('graine 2027');
});

test('UC05 : cocher L2 et L3 superpose la distribution et donne environ 40 %', async ({ page }) => {
  await ready(page);
  await page.getByTestId('case-L2').check();
  await page.getByTestId('case-L3').check();
  await expect(page.getByTestId('probabilite')).toContainText(/39|40/);
  await expect(page.getByTestId('probabilite')).toContainText('avec L2 + L3');
  await expect(page.locator('path.overlay')).toBeVisible();
});

test('TC15 : 10 000 itérations calculées en moins d\'une seconde', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: /Contrôles/ }).click();
  const txt = await page.getByText(/dont simulation/).textContent();
  const sim = Number(/simulation (\d[\d\s  ]*) ms/.exec(txt ?? '')![1].replace(/\D/g, ''));
  const total = Number(/Durée du run : (\d[\d\s  ]*) ms/.exec(txt ?? '')![1].replace(/\D/g, ''));
  expect(sim).toBeLessThan(1000);
  expect(total).toBeLessThan(10000);
  for (const c of ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12']) {
    await expect(page.getByTestId(`ctrl-${c}`).locator('.light')).toHaveClass(/ok/);
  }
});

test('TC17 : le lien de partage rejoue le même scénario dans un autre navigateur', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await page.getByTestId('case-L2').check();
  await page.getByRole('tab', { name: 'Registre' }).click();
  await page.getByTestId('n').selectOption('5000');
  await expect(page.getByTestId('run-ref')).toContainText('5 000 itérations');
  await expect(page.getByTestId('run-ref')).not.toContainText('analyses en cours');
  const prob = await page.getByTestId('probabilite').locator('.value').textContent();
  const ref = (await page.getByTestId('run-ref').textContent())!.replace(/\s+/g, ' ');
  await page.getByTestId('partager').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('#s=');
  const other = await browser.newContext();
  await other.addInitScript(() => localStorage.setItem('vue', 'analyse'));
  const p2 = await other.newPage();
  await p2.goto(url);
  await expect(p2.getByTestId('probabilite').locator('.value')).toHaveText(prob!);
  await expect(p2.getByTestId('run-ref')).not.toContainText('analyses en cours');
  expect((await p2.getByTestId('run-ref').textContent())!.replace(/\s+/g, ' ').replace(/recalcul…|Run :/, '')).toContain(ref.replace(/recalcul…|Run :/, '').trim());
  await expect(p2.getByTestId('case-L2')).toBeChecked();
  await expect(p2.getByRole('status').first()).toContainText('lien de partage');
  await other.close();
});

test('TC18 : un modèle à 3 erreurs donne 3 messages localisés et aucun calcul', async ({ page }) => {
  await ready(page);
  const before = await page.getByTestId('run-ref').textContent();
  const wb = budgetTemplate();
  wb.Sheets.VENTES.E5 = { t: 'n', v: -120 };
  wb.Sheets.VENTES.F9 = { t: 'n', v: 0 };
  wb.Sheets.CHARGES.B3 = { t: 's', v: 'loyers' };
  const buffer = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  await page.getByTestId('file-input').setInputFiles({ name: 'BUDGET_BASE.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  const box = page.getByTestId('import-errors');
  await expect(box).toContainText('3 erreurs');
  await expect(box.locator('li')).toHaveCount(3);
  await expect(box).toContainText('VENTES, ligne 5');
  await expect(box).toContainText('VENTES, ligne 9');
  await expect(box).toContainText('CHARGES, ligne 3');
  await expect(page.getByTestId('run-ref')).toHaveText(before!);
});

test('UC10 : un budget importé conforme est calculé localement et ne part jamais dans un lien', async ({ page }) => {
  await ready(page);
  const wb = budgetTemplate();
  wb.Sheets.PARAMETRES.B2 = { t: 's', v: 'Société test, budget 2027' };
  const buffer = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  await page.getByTestId('file-input').setInputFiles({ name: 'BUDGET_BASE.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await expect(page.locator('header.banner h1')).toContainText('Société test');
  await expect(page.getByTestId('probabilite')).toContainText('30');
  const download = page.waitForEvent('download');
  await page.getByTestId('partager').click();
  expect((await download).suggestedFilename()).toBe('scenario.xlsx');
});

test('TC19 : aucun appel réseau après le chargement, usage complet de l\'outil', async ({ page }) => {
  await ready(page);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('blob:') && !r.url().startsWith('data:')) requests.push(r.url());
  });
  await page.getByText('Volume Boissons').first().click();
  await page.locator('.edit input[type=range]').first().fill('0.94');
  await page.getByTestId('case-L1').check();
  await page.getByTestId('case-S1').check();
  for (const t of ['Trajectoire mensuelle', 'Backtest', 'Registre', 'Contrôles', 'Origine du risque']) {
    await page.getByRole('tab', { name: new RegExp(t) }).click();
    await page.waitForTimeout(t === 'Backtest' ? 4000 : 300);
  }
  await page.getByRole('tab', { name: 'Trajectoire mensuelle' }).click();
  await page.getByTestId('mois-clos').fill('6');
  await expect(page.getByTestId('run-ref')).toContainText('6 mois clos');
  await page.getByTestId('fichiers').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Exporter le registre/ }).click();
  await download;
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);
});

test('R-RE-06 : un contrôle bloquant en rouge désactive l\'impression de la note', async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId('imprimer')).toBeEnabled();
  await page.getByRole('tab', { name: 'Registre' }).click();
  await page.locator('table.hyp tbody tr').first().locator('select').selectOption('brouillon');
  await expect(page.getByTestId('imprimer')).toBeDisabled({ timeout: 15_000 });
  await page.getByRole('tab', { name: /Contrôles/ }).click();
  await expect(page.getByTestId('ctrl-C12').locator('.light')).not.toHaveClass(/ok/);
});

test('UC07 : atterrissage, 6 mois clos figés au réel', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Trajectoire mensuelle' }).click();
  await page.getByTestId('mois-clos').fill('6');
  await expect(page.getByText(/Probabilité glissante/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tr.closed')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: /Avec 6 mois clos, l'EBITDA de l'année est attendu entre/ })).toBeVisible();
});

test('UC06 : la note CODIR imprimable tient sur une page', async ({ page }) => {
  await ready(page);
  await page.emulateMedia({ media: 'print' });
  const note = page.locator('article.note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Message clé');
  await expect(note).toContainText('Q4, leviers');
  await expect(note).toContainText('Référence');
  const pdf = await page.pdf({ format: 'A4' });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(1);
});

test('repli sur le fil principal quand les Web Workers sont bloqués', async ({ page }) => {
  await page.route(/worker-.*\.js$/, (route) => route.abort());
  await page.goto('./');
  await expect(page.getByTestId('probabilite')).toContainText('30', { timeout: 20_000 });
  await expect(page.locator('[role=tab] .light')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('case-L3').check();
  await expect(page.getByTestId('probabilite')).toContainText('avec L3');
});

test('aperçu de la note à l\'écran et changement de graine journalisé (R-SI-02)', async ({ page }) => {
  await ready(page);
  await page.getByTestId('apercu-note').click();
  await expect(page.getByRole('dialog', { name: 'Note CODIR' })).toContainText('Message clé');
  await page.getByTestId('fermer-note').click();
  await page.getByRole('tab', { name: 'Registre' }).click();
  await page.getByRole('button', { name: 'changer' }).click();
  await page.locator('#seed-value').fill('7');
  await page.getByRole('button', { name: 'Changer la graine' }).click();
  await expect(page.getByText('Le motif est obligatoire')).toBeVisible();
  await page.locator('#seed-motif').fill('vérification sur une autre graine');
  await page.getByRole('button', { name: 'Changer la graine' }).click();
  await expect(page.getByTestId('run-ref')).toContainText('graine 7');
  await expect(page.getByText(/2027 → 7, motif : vérification/)).toBeVisible();
});

test('synthèse CODIR : la réponse, le pourquoi, les décisions et les « et si »', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Le budget a 30 % de chances/ })).toBeVisible();
  await expect(page.getByText('12 contrôles sur 12 au vert')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Pourquoi : ce qui fait bouger le résultat')).toBeVisible();
  await expect(page.getByText('Change EUR/MGA, cours moyen').first()).toBeVisible();
  await page.getByRole('button', { name: 'Voir sur la distribution' }).first().click();
  await expect(page.getByTestId('probabilite')).toContainText(/39|40/);
  await expect(page.getByText(/Avec L2 \+ L3 :/)).toBeVisible();
  await page.getByTestId('vue-analyse').click();
  await expect(page.getByRole('tab', { name: 'Origine du risque' })).toBeVisible();
  await context.close();
});

test('les hypothèses et les événements restent visibles après un passage par une fenêtre étroite', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await ready(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('complementary', { name: 'Hypothèses' }).getByText('Volume Boissons')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Hypothèses' }).getByText('Révision du prix du carburant')).toBeVisible();
});
