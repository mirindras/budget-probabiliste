import { describe, expect, test } from 'vitest';
import { alfaScenario } from '../../src/engine/alfa.ts';
import { EVENT_GUIDE, frequencyToProbability, fullReview, HYP_GUIDE, RISK_CATEGORIES } from '../../src/engine/guide.ts';
import { readiness } from '../../src/engine/readiness.ts';
import { checkScenarioShape } from '../../src/engine/schema.ts';
import { EVENT_CODES, HYP_CODES } from '../../src/engine/types.ts';

const ALFA = { budgetImporte: false, reconciliationOk: true };
const findings = (s: ReturnType<typeof alfaScenario>, code: string, opts = ALFA) => readiness(s, opts).items.find((i) => i.code === code)!;

describe('guide de saisie', () => {
  test('une question, un répondant, des sources et un piège pour chaque entrée', () => {
    for (const c of HYP_CODES) for (const k of ['question', 'qui', 'sources', 'piege'] as const) expect(HYP_GUIDE[c][k].length).toBeGreaterThan(k === 'qui' ? 1 : 10);
    for (const c of EVENT_CODES) for (const k of ['question', 'qui', 'sources', 'piege'] as const) expect(EVENT_GUIDE[c][k].length).toBeGreaterThan(k === 'qui' ? 1 : 10);
    expect(new Set(RISK_CATEGORIES.map((c) => c.code)).size).toBe(16);
  });
  test('fréquence observée : estimation prudente, jamais 0 ni 100 %', () => {
    expect(frequencyToProbability(2, 5)).toBeCloseTo(3 / 7, 12);
    expect(frequencyToProbability(0, 5)).toBeCloseTo(1 / 7, 12);
    expect(frequencyToProbability(5, 5)).toBeCloseTo(6 / 7, 12);
    expect(frequencyToProbability(3, 2)).toBeNaN();
    expect(frequencyToProbability(1, 0)).toBeNaN();
  });
  test('revue complète : une ligne par catégorie, décisions existantes conservées', () => {
    const r = fullReview([{ categorie: 'R04', decision: 'couvert', ref: 'H06', commentaire: '' }]);
    expect(r).toHaveLength(16);
    expect(r.find((x) => x.categorie === 'R04')!.decision).toBe('couvert');
    expect(r.find((x) => x.categorie === 'R01')!.decision).toBeNull();
  });
});

describe('état de préparation des entrées', () => {
  test('ALFA : registre complet, seul le budget de démonstration reste à remplacer', () => {
    const r = readiness(alfaScenario(), ALFA);
    expect(r.total).toBe(1 + 12 + 3 + 1 + 16);
    const open = r.items.filter((i) => i.statut !== 'pret');
    expect(open.map((i) => i.code)).toEqual(['BUDGET']);
    expect(r.bloquants).toBe(0);
    expect(readiness(alfaScenario(), { budgetImporte: true, reconciliationOk: true }).prets).toBe(r.total);
    expect(checkScenarioShape(alfaScenario())).toEqual([]);
  });
  test('gouvernance : propriétaire, justification, validation', () => {
    const s = alfaScenario();
    const h = s.registre.hypotheses[0];
    h.proprietaire = '';
    expect(findings(s, 'H01').statut).toBe('bloquant');
    h.proprietaire = 'DC Boissons';
    h.justification = 'à justifier';
    expect(findings(s, 'H01').constats[0].texte).toMatch(/trop courte/);
    h.justification = 'Tendance 5 ans et carnet de commandes GMS.';
    h.statut = 'brouillon';
    expect(findings(s, 'H01').constats[0].texte).toMatch(/brouillon/);
  });
  test('fourchettes : incohérente, trop étroite, trop large, décentrée, déséquilibrée', () => {
    const s = alfaScenario();
    const h = s.registre.hypotheses[0];
    Object.assign(h, { p10: 1.01, p50: 1, p90: 1.02 });
    expect(findings(s, 'H01').statut).toBe('bloquant');
    Object.assign(h, { p10: 0.998, p50: 1, p90: 1.002 });
    expect(findings(s, 'H01').constats.map((f) => f.texte).join()).toMatch(/moins de 1 %/);
    Object.assign(h, { p10: 0.6, p50: 1, p90: 1.3 });
    expect(findings(s, 'H01').constats.map((f) => f.texte).join()).toMatch(/plus de 60 %/);
    Object.assign(h, { p10: 0.85, p50: 0.9, p90: 0.95 });
    expect(findings(s, 'H01').constats.map((f) => f.texte).join()).toMatch(/−10,0 %|-10,0 %/);
    Object.assign(h, { p10: 0.99, p50: 1, p90: 1.05 });
    expect(findings(s, 'H01').constats.map((f) => f.texte).join()).toMatch(/déséquilibrée/);
    const m = s.registre.hypotheses.find((x) => x.code === 'H05')!;
    Object.assign(m, { p10: -4, p50: 0, p90: 4 });
    expect(findings(s, 'H05').constats.map((f) => f.texte).join()).toMatch(/plus de 5 points/);
    const fx = s.registre.hypotheses.find((x) => x.code === 'H06')!;
    fx.volatilite_mensuelle = 0.12;
    expect(findings(s, 'H06').constats.map((f) => f.texte).join()).toMatch(/mensuelle et non annuelle/);
  });
  test('événements : probabilité nulle, quasi certaine, impact nul', () => {
    const s = alfaScenario();
    const e = s.registre.evenements[0];
    e.p = 0;
    expect(findings(s, 'E01').constats[0].texte).toMatch(/nulle/);
    e.p = 0.95;
    expect(findings(s, 'E01').constats[0].texte).toMatch(/plus un risque/);
    e.p = 0.3;
    e.amplitude = [0, 0];
    expect(findings(s, 'E01').constats[0].texte).toMatch(/aucun effet/);
    e.amplitude = [0.2, 0.1];
    expect(findings(s, 'E01').statut).toBe('bloquant');
  });
  test('corrélations sans justification, nulles, ou sans lien au change', () => {
    const s = alfaScenario();
    s.registre.correlations_rang.push(['H01', 'H12', 0, 'à justifier']);
    const t = findings(s, 'CORR').constats.map((f) => f.texte).join();
    expect(t).toMatch(/sans justification : H01-H12/);
    expect(t).toMatch(/à 0/);
    s.registre.correlations_rang = s.registre.correlations_rang.filter((c) => c[0] !== 'H06' && c[1] !== 'H06');
    expect(findings(s, 'CORR').constats.map((f) => f.texte).join()).toMatch(/change/);
  });
  test('revue des risques : décision, référence ou explication exigées', () => {
    const s = alfaScenario();
    s.registre.revue_risques = undefined;
    expect(readiness(s, ALFA).items.filter((i) => i.etape === 'revue' && i.statut !== 'pret')).toHaveLength(16);
    s.registre.revue_risques = fullReview(undefined);
    s.registre.revue_risques[0] = { categorie: 'R01', decision: 'couvert', ref: '', commentaire: '' };
    expect(findings(s, 'R01').constats[0].texte).toMatch(/Préciser/);
    s.registre.revue_risques[0] = { categorie: 'R01', decision: 'hors-modele', ref: '', commentaire: 'non' };
    expect(findings(s, 'R01').constats[0].texte).toMatch(/Expliquer/);
    s.registre.revue_risques[0].commentaire = 'Non chiffrable avant la loi de finances.';
    expect(findings(s, 'R01').statut).toBe('pret');
  });
  test('budget : réconciliation en échec bloquante', () => {
    expect(findings(alfaScenario(), 'BUDGET', { budgetImporte: true, reconciliationOk: false }).statut).toBe('bloquant');
  });
  test('structure : une revue mal formée est refusée', () => {
    const s = alfaScenario() as any;
    s.registre.revue_risques = [{ categorie: 'R99', decision: 'peut-être', ref: '', commentaire: '' }];
    expect(checkScenarioShape(s).join()).toMatch(/Revue des risques, ligne 1/);
  });
});
