import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import { simulate } from '../../src/engine/simulate.ts';
import { detailedRun } from '../../src/engine/simulate.ts';
import {
  budgetTemplate, importBudget, importRegistry, importScenarioBudget, ImportFailure, journalWorkbook, readCsv, readWorkbook, registryWorkbook,
  resultsWorkbook, scenarioWorkbook, workbookBytes, workbookKind,
} from '../../src/io/excel.ts';
import { decodeScenario, encodeScenario, scenarioFromHash, shareUrl } from '../../src/io/share.ts';

const roundTrip = (wb: XLSX.WorkBook) => readWorkbook(new Uint8Array(workbookBytes(wb)));

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportFailure) return e.errors.map((x) => `${x.feuille}|${x.ligne}|${x.message}`);
    throw e;
  }
  return [];
}

describe('modèle BUDGET_BASE (R-IN-08)', () => {
  test('le modèle ALFA au grain mois × BU × canal × famille se réimporte et reproduit 9,400 GAr', () => {
    const wb = roundTrip(budgetTemplate());
    expect(workbookKind(wb)).toBe('budget');
    expect(XLSX.utils.sheet_to_json(wb.Sheets.VENTES)).toHaveLength(432);
    const g = importBudget(wb);
    expect(g.bu).toEqual(['Boissons', 'Epicerie', 'Hygiene']);
    const a = alfaBudget();
    for (let b = 0; b < 3; b++) for (let t = 0; t < 12; t++) {
      expect(g.ca[b][t]).toBeCloseTo(a.ca[b][t], 9);
      expect(g.cmImp[b][t]).toBeCloseTo(a.cmImp[b][t], 9);
    }
    expect(g.fcTauxVariable).toBeCloseTo(a.fcTauxVariable, 12);
    // Même distribution que le jeu préchargé.
    const s = { ...alfaScenario(), n: 2000 };
    const r1 = simulate({ scenario: s, budget: a, quick: true });
    const r2 = simulate({ scenario: s, budget: g, quick: true });
    if (!r1.ok || !r2.ok) throw new Error('run');
    expect(r2.base.p50).toBeCloseTo(r1.base.p50, 8);
  });
  test('TC18 : modèle contenant 3 erreurs volontaires, 3 messages localisés, aucun calcul', () => {
    const wb = roundTrip(budgetTemplate());
    const ventes = wb.Sheets.VENTES;
    ventes.E5 = { t: 'n', v: -120 }; // volume négatif, ligne 5
    ventes.F9 = { t: 'n', v: 0 }; // prix nul, ligne 9
    const charges = wb.Sheets.CHARGES;
    charges.B3 = { t: 's', v: 'loyers' }; // poste orphelin, ligne 3
    const errs = errorsOf(() => importBudget(wb));
    expect(errs).toHaveLength(3);
    expect(errs[0]).toMatch(/^VENTES\|5\|.*volume négatif/);
    expect(errs[1]).toMatch(/^VENTES\|9\|.*prix nul/);
    expect(errs[2]).toMatch(/^CHARGES\|3\|.*loyers.*R-IN-03/);
  });
  test('R-IN-01 et R-IN-04 : écart de réconciliation et mois manquant', () => {
    const wb = roundTrip(budgetTemplate());
    const p = wb.Sheets.PARAMETRES;
    p.B5 = { t: 'n', v: 9.5e9 };
    expect(errorsOf(() => importBudget(wb))[0]).toMatch(/réconciliation/);
    const wb2 = roundTrip(budgetTemplate());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb2.Sheets.VENTES).filter((r) => !(r.mois === 3 && r.bu === 'Hygiene'));
    wb2.Sheets.VENTES = XLSX.utils.json_to_sheet(rows);
    expect(errorsOf(() => importBudget(wb2)).join('\n')).toMatch(/Hygiene : mois manquant\(s\) 3/);
    expect(errorsOf(() => importBudget(XLSX.utils.book_new()))).toHaveLength(3);
  });
  test('import CSV : une feuille par fichier', () => {
    const wb = readCsv('cle;valeur\nlibelle;Test', 'parametres');
    expect(wb.SheetNames).toEqual(['PARAMETRES']);
  });
});

describe('registre et scénario', () => {
  test('aller-retour du registre : mêmes hypothèses, mêmes leviers', () => {
    const s = alfaScenario();
    s.registre.hypotheses[0].p90 = 1.03;
    s.leviers[1].params.hausse = 0.02;
    const wb = roundTrip(registryWorkbook(s));
    expect(workbookKind(wb)).toBe('registre');
    const back = importRegistry(wb, alfaScenario());
    expect(back.registre.hypotheses).toEqual(s.registre.hypotheses);
    expect(back.registre.correlations_rang.map((c) => c.slice(0, 3))).toEqual(s.registre.correlations_rang.map((c) => c.slice(0, 3)));
    expect(back.registre.evenements).toEqual(s.registre.evenements);
    expect(back.leviers[1].params.hausse).toBe(0.02);
    expect(back.n).toBe(10000);
  });
  test('registre incohérent : erreurs localisées', () => {
    const wb = roundTrip(registryWorkbook(alfaScenario()));
    const h = wb.Sheets.HYPOTHESES;
    h.F2 = { t: 'n', v: 1.2 }; // H01 : P10 > P50
    h.C3 = { t: 's', v: '' }; // H02 : propriétaire manquant
    wb.Sheets.CORRELATIONS.C2 = { t: 'n', v: 0.95 };
    wb.Sheets.EVENEMENTS.D2 = { t: 'n', v: 1.4 };
    const errs = errorsOf(() => importRegistry(wb, alfaScenario()));
    expect(errs).toHaveLength(4);
    expect(errs.join('\n')).toMatch(/H01 : P10 < P50 < P90/);
    expect(errs.join('\n')).toMatch(/H02 : propriétaire manquant/);
  });
  test('scénario sur données importées : budget et registre dans un même fichier (R-RE-07)', () => {
    const s = alfaScenario();
    const wb = roundTrip(scenarioWorkbook(s, alfaBudget()));
    expect(workbookKind(wb)).toBe('scenario');
    const b = importScenarioBudget(wb);
    expect(b.ca[1][4]).toBeCloseTo(alfaBudget().ca[1][4], 9);
    expect(b.fraisGeneraux[0]).toBeCloseTo(0.3, 12);
  });
  test('export des résultats en schéma en étoile et journal', () => {
    const s = { ...alfaScenario(), n: 1000 };
    const r = simulate({ scenario: s, budget: alfaBudget() });
    if (!r.ok) throw new Error('run');
    const { draws, base } = detailedRun({ scenario: s, budget: alfaBudget() });
    expect(Array.from(base.annual)).toEqual(Array.from(r.annual));
    const wb = resultsWorkbook(s, alfaBudget(), r, draws, base, [{ ref: r.ref.texte, date: r.ref.date, p10: 1, p50: 2, p90: 3, prob: 0.3, controles: 'ok', duree: 10 }]);
    for (const n of ['SYNTHESE', 'FAIT_RESULTAT', 'FAIT_PERCENTILE', 'FAIT_TIRAGE', 'FAIT_EBITDA_MENSUEL', 'DIM_BU', 'DIM_TEMPS', 'DIM_LIGNE_PL', 'DIM_HYPOTHESE', 'DIM_RUN', 'CONTROLES', 'JOURNAL_RUNS']) {
      expect(wb.SheetNames).toContain(n);
    }
    expect(XLSX.utils.sheet_to_json(wb.Sheets.FAIT_TIRAGE)).toHaveLength(15000);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.FAIT_RESULTAT)).toHaveLength(8000);
    expect(journalWorkbook([]).SheetNames).toEqual(['JOURNAL_RUNS']);
    expect(workbookKind(XLSX.utils.book_new())).toBe('inconnu');
  });
});

describe('lien de partage (R-RE-07, TC17)', () => {
  test('aller-retour exact du scénario, budget jamais inclus', () => {
    const s = alfaScenario();
    s.actifs = ['L2', 'L3'];
    s.graine = 99;
    const url = shareUrl(s, 'https://exemple.org/outil/#ancien');
    expect(url.startsWith('https://exemple.org/outil/#s=')).toBe(true);
    const back = scenarioFromHash(new URL(url).hash)!;
    expect(back).toEqual(s);
    expect(JSON.stringify(back)).not.toContain('cout_matiere');
    expect(decodeScenario(encodeScenario(s))).toEqual(s);
    expect(decodeScenario('nimporte-quoi')).toBeNull();
    expect(scenarioFromHash('#autre=1')).toBeNull();
    expect(url.length).toBeLessThan(8000);
  });
});
