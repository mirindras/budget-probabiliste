import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import { newEvent, newHypothesis } from '../../src/engine/edit.ts';
import { eventGuide, EVENT_GUIDE, frequencyToProbability, fullReview, hypGuide, HYP_GUIDE, RISK_CATEGORIES, suggestRefs } from '../../src/engine/guide.ts';
import { readiness, uncoveredPostes } from '../../src/engine/readiness.ts';
import { checkScenarioShape } from '../../src/engine/schema.ts';
import { starterScenario } from '../../src/engine/starter.ts';
import { HYP_EFFECTS } from '../../src/engine/types.ts';
import { betaBudget } from '../fixtures.ts';

const ALFA = { budgetImporte: false, reconciliationOk: true };
const findings = (s: ReturnType<typeof alfaScenario>, code: string, opts = ALFA) => readiness(s, opts).items.find((i) => i.code === code)!;

describe('guide de saisie', () => {
  test('une question, un répondant, des sources et un piège pour chaque entrée', () => {
    const s = alfaScenario();
    const KEYS = ['question', 'qui', 'sources', 'piege'] as const;
    // ALFA : les questions écrites pour l'exemple ; toute entrée a la sienne.
    for (const h of s.registre.hypotheses) for (const k of KEYS) expect(HYP_GUIDE[h.code][k].length).toBeGreaterThan(k === 'qui' ? 1 : 10);
    for (const e of s.registre.evenements) for (const k of KEYS) expect(EVENT_GUIDE[e.code][k].length).toBeGreaterThan(k === 'qui' ? 1 : 10);
    expect(hypGuide(s.registre.hypotheses[0], alfaBudget(), true)).toBe(HYP_GUIDE.H01);
    // Une autre entreprise : la question se déduit de l'effet et de la portée, avec les noms de son budget.
    const b = betaBudget();
    const t = starterScenario(b);
    for (const effet of HYP_EFFECTS.filter((x) => x !== 'change')) {
      const g = hypGuide(newHypothesis(t, b, effet), b);
      for (const k of KEYS) expect(g[k].length).toBeGreaterThan(5);
    }
    expect(hypGuide(t.registre.hypotheses[0], b).question).toMatch(/BU Conseil/);
    expect(eventGuide(newEvent(t, b, 'volume', 'Perte du client Gamma'), b).question).toMatch(/Perte du client Gamma.*baisseraient les volumes/);
    expect(new Set(RISK_CATEGORIES.map((c) => c.code)).size).toBe(16);
    // Revue des risques : les entrées du registre qui couvrent chaque famille sont proposées.
    expect(suggestRefs(RISK_CATEGORIES.find((c) => c.code === 'R04')!, s.registre)).toEqual(['H06']);
    expect(suggestRefs(RISK_CATEGORIES.find((c) => c.code === 'R01')!, t.registre)).toEqual(['H01', 'H02']);
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
  test('postes couverts : chaque poste varie avec une hypothèse, ou est confirmé certain', () => {
    const s = alfaScenario();
    const withBudget = { ...ALFA, budget: alfaBudget() };
    const r = readiness(s, withBudget);
    expect(r.total).toBe(1 + 12 + 1 + 3 + 1 + 16);
    expect(r.items.find((i) => i.code === 'POSTES')!.statut).toBe('pret');
    expect(uncoveredPostes(s, alfaBudget())).toEqual([]);
    // Sans la confirmation, les autres frais de transport restent au budget sans incertitude : signalé.
    s.registre.postes_certains = [];
    expect(uncoveredPostes(s, alfaBudget())).toEqual(['AUTRES_TRANSPORT']);
    expect(readiness(s, withBudget).items.find((i) => i.code === 'POSTES')!.constats[0].texte).toMatch(/Autres frais de transport/);
  });
  test('références : une portée qui nomme une BU absente bloque l\'hypothèse concernée', () => {
    const s = alfaScenario();
    s.registre.hypotheses[0].portee = { bu: ['Boulangerie'] };
    const f = findings(s, 'H01', { ...ALFA, budget: alfaBudget() } as never);
    expect(f.statut).toBe('bloquant');
    expect(f.constats[0].texte).toBe('BU « Boulangerie » inconnue.');
  });
  test('budget importé : registre de départ en brouillon, à compléter, rien de bloquant', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    const r = readiness(s, { budgetImporte: true, reconciliationOk: true, budget: b });
    expect(r.bloquants).toBe(0);
    expect(r.items.filter((i) => i.etape === 'hypotheses' && i.statut === 'a-revoir').length).toBe(s.registre.hypotheses.length + 1);
    expect(r.items.find((i) => i.code === 'H01')!.constats.map((x) => x.texte).join()).toMatch(/Propriétaire à désigner.*Fourchette par défaut/);
    // Les subventions, seul produit sans hypothèse, restent au budget : signalées.
    expect(uncoveredPostes(s, b)).toEqual(['SUBV']);
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
