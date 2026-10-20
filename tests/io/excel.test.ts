import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import { readiness, uncoveredPostes } from '../../src/engine/readiness.ts';
import { detailedRun, simulate } from '../../src/engine/simulate.ts';
import { adaptScenario, starterScenario } from '../../src/engine/starter.ts';
import type { Budget } from '../../src/engine/types.ts';
import {
  budgetTemplate, importBudget, importRegistry, importScenarioBudget, ImportFailure, journalWorkbook, legacyBudgetTemplate, readCsv, readWorkbook,
  registryWorkbook, resultsWorkbook, scenarioWorkbook, workbookBytes, workbookKind,
} from '../../src/io/excel.ts';
import { decodeScenario, encodeScenario, scenarioFromHash, shareUrl } from '../../src/io/share.ts';
import { betaBudget } from '../fixtures.ts';

const roundTrip = (wb: XLSX.WorkBook) => readWorkbook(new Uint8Array(workbookBytes(wb)));
const rowsOf = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
const asAlfa = (b: Budget): Budget => ({ ...b, source: 'alfa' });

function errorsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportFailure) return e.errors.map((x) => `${x.feuille}|${x.ligne}|${x.message}`);
    throw e;
  }
  return [];
}

describe('modèle BUDGET_BASE générique : rubriques et postes (R-IN-08)', () => {
  test('ALFA se réimporte à l\'identique et donne la même distribution', () => {
    const wb = roundTrip(budgetTemplate(alfaBudget()));
    expect(workbookKind(wb)).toBe('budget');
    expect(wb.SheetNames).toEqual(['LISEZ_MOI', 'PARAMETRES', 'RUBRIQUES', 'POSTES']);
    expect(rowsOf(wb.Sheets.POSTES)).toHaveLength(alfaBudget().postes.length);
    const g = importBudget(wb);
    expect(g.source).toBe('import');
    expect(asAlfa(g)).toEqual(alfaBudget());
    const s = { ...alfaScenario(), n: 2000 };
    const r1 = simulate({ scenario: s, budget: alfaBudget(), quick: true });
    const r2 = simulate({ scenario: s, budget: g, quick: true });
    if (!r1.ok || !r2.ok) throw new Error('run');
    expect(r2.base.p50).toBe(r1.base.p50);
  });
  test('une autre entreprise : rubriques, BU et unité qui lui sont propres, sans devise', () => {
    const b = betaBudget();
    const g = importBudget(roundTrip(budgetTemplate(b)));
    expect(g).toEqual(b);
    expect(g.change).toBeNull();
    expect(g.unites).toEqual({ principale: 'k€', detail: '€', libelle: 'milliers d\'euros' });
  });
  test('TC18 : trois erreurs volontaires, trois messages localisés, aucun calcul', () => {
    const wb = roundTrip(budgetTemplate(betaBudget()));
    const p = wb.Sheets.POSTES;
    p.C3 = { t: 's', v: 'XX' }; // rubrique inconnue, ligne 3
    p.I6 = { t: 's', v: 'beaucoup' }; // montant de mars non numérique, ligne 6
    p.F8 = { t: 'n', v: 1.5 }; // part en devises hors bornes, ligne 8
    const errs = errorsOf(() => importBudget(wb));
    expect(errs).toHaveLength(3);
    expect(errs[0]).toMatch(/^POSTES\|3\|rubrique « XX » absente de la feuille RUBRIQUES/);
    expect(errs[1]).toMatch(/^POSTES\|6\|montant manquant ou non numérique : mars/);
    expect(errs[2]).toMatch(/^POSTES\|8\|part_devises hors de 0 à 1/);
  });
  test('règles : codes uniques, nature connue, CA rattaché à une BU, devises avec un cours, réconciliation', () => {
    const wb = roundTrip(budgetTemplate(betaBudget()));
    wb.Sheets.RUBRIQUES.C3 = { t: 's', v: 'recette' };
    wb.Sheets.POSTES.A4 = { t: 's', v: 'CA_CONSEIL' };
    wb.Sheets.POSTES.D3 = { t: 's', v: '' };
    const errs = errorsOf(() => importBudget(wb)).join('\n');
    expect(errs).toMatch(/RUBRIQUES\|3\|nature « recette » inconnue/);
    expect(errs).toMatch(/POSTES\|4\|code CA_CONSEIL en double/);
    expect(errs).toMatch(/POSTES\|3\|un poste de chiffre d'affaires appartient à une BU/);
    const fx = roundTrip(budgetTemplate(betaBudget()));
    fx.Sheets.POSTES.F4 = { t: 'n', v: 0.5 };
    expect(errorsOf(() => importBudget(fx))[0]).toMatch(/PARAMETRES\|null\|des postes sont en devises : devise, monnaie_locale et cours_budget requis/);
    const rec = roundTrip(budgetTemplate(betaBudget()));
    rec.Sheets.PARAMETRES.B7 = { t: 'n', v: 1500 };
    expect(betaBudget().ebitdaPublie).toBe(1322);
    expect(errorsOf(() => importBudget(rec))[0]).toMatch(/réconciliation : le budget recalculé donne 1322,000 k€ pour 1500,000 k€ publiés/);
  });
  test('en-têtes saisis à la main : accents et majuscules acceptés', () => {
    const wb = roundTrip(budgetTemplate(betaBudget()));
    wb.Sheets.POSTES.H1 = { t: 's', v: 'Février' };
    wb.Sheets.POSTES.F1 = { t: 's', v: 'Part devises' };
    expect(importBudget(wb)).toEqual(betaBudget());
  });
  test('feuilles absentes et CSV', () => {
    expect(errorsOf(() => importBudget(XLSX.utils.book_new()))).toHaveLength(3);
    const only = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(only, XLSX.utils.aoa_to_sheet([['code']]), 'POSTES');
    expect(errorsOf(() => importBudget(only)).map((e) => e.split('|')[0])).toEqual(['PARAMETRES', 'RUBRIQUES']);
    expect(readCsv('cle;valeur\nlibelle;Test', 'parametres').SheetNames).toEqual(['PARAMETRES']);
  });
  test('un budget importé reçoit un registre de départ s\'il ne correspond pas au registre en cours', () => {
    const b = betaBudget();
    const kept = adaptScenario(alfaScenario(), alfaBudget());
    expect(kept.starter).toBe(false);
    const s = adaptScenario(alfaScenario(), b);
    expect(s.starter).toBe(true);
    expect(s.scenario.registre.hypotheses.map((h) => `${h.code} ${h.libelle}`)).toEqual([
      'H01 Volume Conseil', 'H02 Volume Formation', 'H03 Prix de vente', 'H04 Achats et sous-traitance', 'H05 Frais de personnel', 'H06 Locaux',
    ]);
    // Pas de devise : ni hypothèse de change, ni stress de change.
    expect(s.scenario.stress.map((x) => x.type)).toEqual(['volume']);
    const r = simulate({ scenario: { ...s.scenario, n: 2000 }, budget: b });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.budgetEbitda).toBe(1322);
    // Registre de départ en brouillon : le run n'est pas présentable tant qu'il n'est pas validé (C12).
    expect(r.controls.find((c) => c.code === 'C12')!.ok).toBe(false);
    expect(r.controls.find((c) => c.code === 'C01')!.valeur).toMatch(/€/);
  });
});

describe('format détaillé d\'un distributeur (version 1)', () => {
  test('le modèle au grain mois × BU × canal × famille se réimporte et reproduit ALFA', () => {
    const wb = roundTrip(legacyBudgetTemplate());
    expect(workbookKind(wb)).toBe('budget');
    expect(rowsOf(wb.Sheets.VENTES)).toHaveLength(432);
    const g = importBudget(wb);
    const a = alfaBudget();
    expect(g.bu).toEqual(a.bu);
    expect(g.postes.map((p) => p.code)).toEqual(a.postes.map((p) => p.code));
    g.postes.forEach((p, i) => p.montants.forEach((x, t) => expect(x).toBeCloseTo(a.postes[i].montants[t], 9)));
    const s = { ...alfaScenario(), n: 2000 };
    const r1 = simulate({ scenario: s, budget: a, quick: true });
    const r2 = simulate({ scenario: s, budget: g, quick: true });
    if (!r1.ok || !r2.ok) throw new Error('run');
    expect(r2.base.p50).toBeCloseTo(r1.base.p50, 8);
  });
  test('TC18 : trois erreurs volontaires, trois messages localisés', () => {
    const wb = roundTrip(legacyBudgetTemplate());
    wb.Sheets.VENTES.E5 = { t: 'n', v: -120 };
    wb.Sheets.VENTES.F9 = { t: 'n', v: 0 };
    wb.Sheets.CHARGES.B3 = { t: 's', v: 'loyers' };
    const errs = errorsOf(() => importBudget(wb));
    expect(errs).toHaveLength(3);
    expect(errs[0]).toMatch(/^VENTES\|5\|.*volume négatif/);
    expect(errs[1]).toMatch(/^VENTES\|9\|.*prix nul/);
    expect(errs[2]).toMatch(/^CHARGES\|3\|.*loyers.*R-IN-03/);
  });
  test('grain : un fichier incomplet est rejeté même si son EBITDA se réconcilie', () => {
    const wb = roundTrip(legacyBudgetTemplate());
    const rows = XLSX.utils.sheet_to_json<Record<string, number | string>>(wb.Sheets.VENTES);
    const iR = rows.findIndex((r) => r.mois === 3 && r.bu === 'Boissons');
    const R = rows[iR];
    const Q = rows.find((r, i) => i !== iR && r.mois === 3 && r.bu === 'Boissons')!;
    const ca = +Q.volume_cartons * +Q.prix_net_mga + +R.volume_cartons * +R.prix_net_mga;
    const cm = +Q.volume_cartons * +Q.cout_unitaire_mga + +R.volume_cartons * +R.cout_unitaire_mga;
    Object.assign(Q, { volume_cartons: 1, prix_net_mga: ca, cout_unitaire_mga: cm });
    rows.splice(iR, 1);
    wb.Sheets.VENTES = XLSX.utils.json_to_sheet(rows);
    const errs = errorsOf(() => importBudget(wb));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(new RegExp(`^VENTES\\|null\\|Boissons, ${R.canal}, ${R.famille} : mois manquant\\(s\\) 3 `));
  });
  test('grain : un doublon mois × BU × canal × famille est rejeté et localisé', () => {
    const wb = roundTrip(legacyBudgetTemplate());
    const rows = XLSX.utils.sheet_to_json<Record<string, number | string>>(wb.Sheets.VENTES);
    const a = rows.findIndex((r) => r.mois === 5 && r.bu === 'Epicerie');
    const b = rows.findIndex((r, i) => i > a && r.mois === 5 && r.bu === 'Epicerie' && r.canal === rows[a].canal);
    rows[b].famille = rows[a].famille;
    wb.Sheets.VENTES = XLSX.utils.json_to_sheet(rows);
    expect(errorsOf(() => importBudget(wb))[0]).toMatch(new RegExp(`^VENTES\\|${b + 2}\\|doublon de la ligne ${a + 2} : mois 5, Epicerie`));
  });
  test('R-IN-01 et R-IN-04 : écart de réconciliation et mois manquant', () => {
    const wb = roundTrip(legacyBudgetTemplate());
    wb.Sheets.PARAMETRES.B5 = { t: 'n', v: 9.5e9 };
    expect(errorsOf(() => importBudget(wb))[0]).toMatch(/réconciliation/);
    const wb2 = roundTrip(legacyBudgetTemplate());
    wb2.Sheets.VENTES = XLSX.utils.json_to_sheet(rowsOf(wb2.Sheets.VENTES).filter((r) => !(r.mois === 3 && r.bu === 'Hygiene')));
    expect(errorsOf(() => importBudget(wb2)).join('\n')).toMatch(/Hygiene, .+ : mois manquant\(s\) 3/);
  });
});

describe('registre : ajouter, retirer, modifier par Excel', () => {
  test('aller-retour du registre ALFA : mêmes hypothèses, événements, leviers et paquets', () => {
    const s = alfaScenario();
    s.registre.hypotheses[0].p90 = 1.03;
    s.leviers[1].params.hausse = 0.02;
    const wb = roundTrip(registryWorkbook(s, alfaBudget()));
    expect(workbookKind(wb)).toBe('registre');
    const back = importRegistry(wb, alfaScenario(), alfaBudget());
    expect(back.registre).toEqual(s.registre);
    expect(back.leviers).toEqual(s.leviers);
    expect(back.stress).toEqual(s.stress);
    expect(back.paquets).toEqual(s.paquets);
    expect(back.n).toBe(10000);
    const ref = rowsOf(wb.Sheets.REFERENTIEL);
    expect(ref.filter((r) => r.type === 'poste')).toHaveLength(alfaBudget().postes.length);
  });
  test('une autre entreprise : on ajoute une hypothèse, on en retire une, sans toucher au code', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    const wb = roundTrip(registryWorkbook(s, b));
    const rows = rowsOf(wb.Sheets.HYPOTHESES).filter((r) => r.code !== 'H03');
    rows.push({
      code: 'SUB1', libelle: 'Subventions versées', famille: 'Financement public', effet: 'poste', porte_sur: 'postes: SUBV', proprietaire: 'DAF', unite: 'facteur',
      grain: 'BU Formation', p10: 0.85, p50: 1, p90: 1.05, k: 1, justification: 'Convention 2028 signée, versement conditionné aux heures réalisées.', statut: 'valide',
    });
    wb.Sheets.HYPOTHESES = XLSX.utils.json_to_sheet(rows);
    const back = importRegistry(wb, s, b);
    expect(back.registre.hypotheses.map((h) => h.code)).toEqual(['H01', 'H02', 'H04', 'H05', 'H06', 'SUB1']);
    const sub = back.registre.hypotheses.at(-1)!;
    expect(sub.portee).toEqual({ postes: ['SUBV'] });
    expect(sub.famille).toBe('Financement public');
    expect(uncoveredPostes(back, b)).toEqual([]);
    const ready = readiness(back, { budgetImporte: true, reconciliationOk: true, budget: b });
    expect(ready.items.find((i) => i.code === 'SUB1')!.statut).toBe('pret');
    const r = simulate({ scenario: { ...back, n: 2000 }, budget: b, quick: true });
    expect(r.ok).toBe(true);
  });
  test('portée qui nomme un poste absent du budget : refusée, avec la feuille et le nom fautif', () => {
    const b = betaBudget();
    const wb = roundTrip(registryWorkbook(starterScenario(b), b));
    const rows = rowsOf(wb.Sheets.HYPOTHESES);
    rows[3].porte_sur = 'postes: LOYER_SIEGE';
    rows[0].effet = 'taux';
    wb.Sheets.HYPOTHESES = XLSX.utils.json_to_sheet(rows);
    expect(errorsOf(() => importRegistry(wb, starterScenario(b), b)).join('\n')).toMatch(/HYPOTHESES\|2\|H01 : effet « taux » inconnu/);
    rows[0].effet = 'volume';
    wb.Sheets.HYPOTHESES = XLSX.utils.json_to_sheet(rows);
    expect(errorsOf(() => importRegistry(wb, starterScenario(b), b))).toEqual(['HYPOTHESES|null|H04 : poste « LOYER_SIEGE » inconnu']);
  });
  test('un registre de la version 1, sans effet ni portée, se relit dans le modèle configurable', () => {
    const wb = roundTrip(registryWorkbook(alfaScenario(), alfaBudget()));
    const strip = (name: string, keys: string[], rename: Record<string, string> = {}) => {
      const rows = rowsOf(wb.Sheets[name]).filter((r) => r.code).map((r) => {
        for (const k of keys) delete r[k];
        for (const [a, z] of Object.entries(rename)) {
          r[z] = r[a];
          delete r[a];
        }
        return r;
      });
      wb.Sheets[name] = XLSX.utils.json_to_sheet(rows);
      return rows;
    };
    strip('HYPOTHESES', ['famille', 'effet', 'porte_sur']);
    strip('EVENEMENTS', ['famille', 'effet', 'sens', 'porte_sur', 'rubrique_surcout'], { surcout_min: 'surcout_min_gar', surcout_max: 'surcout_max_gar' });
    const lev = strip('LEVIERS', ['type', 'porte_sur'], { cout: 'cout_gar' });
    lev.find((l) => l.code === 'L3')!.parametres = 'economieAnnuelle=0.25';
    wb.Sheets.LEVIERS = XLSX.utils.json_to_sheet(lev);
    strip('STRESS', ['type', 'porte_sur']);
    delete wb.Sheets.PAQUETS;
    wb.SheetNames = wb.SheetNames.filter((n) => n !== 'PAQUETS');
    const back = importRegistry(wb, alfaScenario(), alfaBudget());
    expect(back.registre).toEqual(alfaScenario().registre);
    expect(back.leviers).toEqual(alfaScenario().leviers);
    expect(back.stress).toEqual(alfaScenario().stress);
    expect(back.paquets).toEqual(alfaScenario().paquets);
  });
  test('registre Excel : feuille GUIDE et revue des risques, relue à l\'import', () => {
    const s = alfaScenario();
    s.registre.revue_risques![10] = { categorie: 'R11', decision: 'stress', ref: 'S1', commentaire: 'Test.' };
    const wb = roundTrip(registryWorkbook(s, alfaBudget()));
    const guide = rowsOf(wb.Sheets.GUIDE);
    expect(guide).toHaveLength(15);
    expect(guide[0].question).toMatch(/volume Boissons/);
    const back = importRegistry(wb, { ...alfaScenario(), registre: { ...alfaScenario().registre, revue_risques: undefined } }, alfaBudget());
    expect(back.registre.revue_risques).toEqual(s.registre.revue_risques);
    const bad = roundTrip(registryWorkbook(s, alfaBudget()));
    bad.Sheets.REVUE_RISQUES.D3 = { t: 's', v: 'peut-être' };
    expect(errorsOf(() => importRegistry(bad, alfaScenario(), alfaBudget())).join()).toMatch(/REVUE_RISQUES\|3\|décision « peut-être » inconnue/);
    // Une autre entreprise : la question se déduit de l'effet et de la portée.
    const b = betaBudget();
    const g2 = rowsOf(roundTrip(registryWorkbook(starterScenario(b), b)).Sheets.GUIDE);
    expect(g2[0].question).toMatch(/volume budgété \(BU Conseil\)/);
  });
  test('registre incohérent : erreurs localisées', () => {
    const wb = roundTrip(registryWorkbook(alfaScenario(), alfaBudget()));
    const h = wb.Sheets.HYPOTHESES;
    h.I2 = { t: 'n', v: 1.2 }; // H01 : P10 > P50
    h.F3 = { t: 's', v: '' }; // H02 : propriétaire manquant
    wb.Sheets.CORRELATIONS.C2 = { t: 'n', v: 0.95 };
    wb.Sheets.EVENEMENTS.H2 = { t: 'n', v: 1.4 };
    const errs = errorsOf(() => importRegistry(wb, alfaScenario(), alfaBudget()));
    expect(errs).toHaveLength(4);
    expect(errs.join('\n')).toMatch(/H01 : P10 < P50 < P90/);
    expect(errs.join('\n')).toMatch(/H02 : propriétaire manquant/);
    expect(errs.join('\n')).toMatch(/E01 : probabilité hors de \[0 ; 1\]/);
  });
  test('scénario complet : budget et registre dans un même fichier (R-RE-07)', () => {
    const wb = roundTrip(scenarioWorkbook(alfaScenario(), alfaBudget()));
    expect(workbookKind(wb)).toBe('scenario');
    expect(asAlfa(importScenarioBudget(wb))).toEqual(alfaBudget());
    const b = betaBudget();
    const s = starterScenario(b);
    const wb2 = roundTrip(scenarioWorkbook(s, b));
    const b2 = importScenarioBudget(wb2);
    expect(b2).toEqual(b);
    expect(importRegistry(wb2, alfaScenario(), b2).registre).toEqual(s.registre);
  });
  test('export des résultats en schéma en étoile et journal', () => {
    const s = { ...alfaScenario(), n: 1000 };
    const r = simulate({ scenario: s, budget: alfaBudget() });
    if (!r.ok) throw new Error('run');
    const { model, draws, base } = detailedRun({ scenario: s, budget: alfaBudget() });
    expect(Array.from(base.annual)).toEqual(Array.from(r.annual));
    const wb = resultsWorkbook(s, alfaBudget(), r, model, draws, base, [{ ref: r.ref.texte, date: r.ref.date, p10: 1, p50: 2, p90: 3, prob: 0.3, controles: 'ok', duree: 10 }]);
    for (const n of ['SYNTHESE', 'FAIT_RESULTAT', 'FAIT_PERCENTILE', 'FAIT_TIRAGE', 'FAIT_EBITDA_MENSUEL', 'DIM_BU', 'DIM_TEMPS', 'DIM_LIGNE_PL', 'DIM_HYPOTHESE', 'DIM_RUN', 'CONTROLES', 'JOURNAL_RUNS']) {
      expect(wb.SheetNames).toContain(n);
    }
    expect(rowsOf(wb.Sheets.FAIT_TIRAGE)).toHaveLength(15000);
    expect(rowsOf(wb.Sheets.FAIT_RESULTAT)).toHaveLength(8000);
    expect(rowsOf(wb.Sheets.DIM_LIGNE_PL).map((x) => x.code)).toEqual(['CA', 'CM', 'MIX', 'TR', 'MS', 'FC', 'FG', 'EBITDA']);
    expect(journalWorkbook([]).SheetNames).toEqual(['JOURNAL_RUNS']);
    expect(workbookKind(XLSX.utils.book_new())).toBe('inconnu');
    // Une autre entreprise : ses rubriques, son unité.
    const b = betaBudget();
    const t = { ...starterScenario(b), n: 1000 };
    const rb = simulate({ scenario: t, budget: b });
    if (!rb.ok) throw new Error('run');
    const d = detailedRun({ scenario: t, budget: b });
    const wb2 = resultsWorkbook(t, b, rb, d.model, d.draws, d.base, []);
    expect(rowsOf(wb2.Sheets.DIM_LIGNE_PL).map((x) => x.code)).toEqual(['HON', 'SUB', 'ACH', 'PERS', 'LOC', 'EBITDA']);
    expect(rowsOf(wb2.Sheets.FAIT_RESULTAT)).toHaveLength(6000);
    expect(XLSX.utils.sheet_to_json<unknown[]>(wb2.Sheets.SYNTHESE, { header: 1 })[5]).toEqual(['EBITDA budgété', 1322, 'k€']);
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
    expect(JSON.stringify(back)).not.toContain('montants');
    expect(decodeScenario(encodeScenario(s))).toEqual(s);
    expect(decodeScenario('nimporte-quoi')).toBeNull();
    expect(scenarioFromHash('#autre=1')).toBeNull();
    expect(url.length).toBeLessThan(9000);
  });
});
