import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import {
  changeEffect, dependents, leverRule, leverTypesFor, newEvent, newHypothesis, newLever, newStress, nextCode, removeCase, removeDriver, stressTypesFor,
} from '../../src/engine/edit.ts';
import { buildEffects } from '../../src/engine/levers.ts';
import { buildModel } from '../../src/engine/model.ts';
import { runPL } from '../../src/engine/pl.ts';
import { budgetValues, fxDeterministic, pointDraws } from '../../src/engine/sampling.ts';
import { objectives, simulate } from '../../src/engine/simulate.ts';
import { starterScenario } from '../../src/engine/starter.ts';
import { LEVER_TYPES, STRESS_TYPES, type Budget, type Scenario } from '../../src/engine/types.ts';
import { betaBudget } from '../fixtures.ts';

const ok = (s: Scenario, b: Budget, n = 2000) => {
  const r = simulate({ scenario: { ...s, n }, budget: b });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r;
};
/** EBITDA déterministe : toutes les hypothèses au budget, change au cours budget, sans bruit ni événement. */
function point(s: Scenario, b: Budget, values: Record<string, number> = {}, active: string[] = []): number {
  const m = buildModel(b, s.registre);
  const d = pointDraws(m, { ...budgetValues(m), ...values }, fxDeterministic(m, 0, b.change?.coursBudget ?? 1));
  return runPL(m, d, { noise: false, events: false, effects: buildEffects(m, active, s.leviers, s.stress) }).annual[0];
}
const ca = (b: Budget) => b.postes.filter((p) => b.rubriques.find((r) => r.code === p.rubrique)!.nature === 'ca').reduce((a, p) => a + p.montants.reduce((x, y) => x + y, 0), 0);

/** BETA avec un achat de licences payé en dollars : le change devient une hypothèse du registre de départ. */
function betaUsd(): Budget {
  const b = betaBudget();
  b.postes.push({ code: 'LICENCES', libelle: 'Licences logicielles', rubrique: 'ACH', bu: null, assiette: 'fixe', devises: 1, montants: new Array(12).fill(10) });
  b.change = { devise: 'USD', locale: 'EUR', coursBudget: 0.92 };
  b.ebitdaPublie -= 120;
  return b;
}

describe('ajouter et retirer des hypothèses et des événements', () => {
  test('codes libres, valeurs par défaut prudentes, portée sur ce qui n\'est pas encore couvert', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    expect(nextCode('H', ['H01', 'H02', 'H04'])).toBe('H03');
    expect(nextCode('L', ['L1', 'L2'], 1)).toBe('L3');
    const h = newHypothesis(s, b, 'poste', 'Subventions');
    expect(h).toMatchObject({ code: 'H07', libelle: 'Subventions', effet: 'poste', portee: { postes: ['SUBV'] }, p10: 0.98, p50: 1, p90: 1.03, statut: 'brouillon' });
    const m = newHypothesis(s, b, 'marge');
    expect(m).toMatchObject({ effet: 'marge', p10: -0.5, p50: 0, p90: 0.5, unite: 'points de marge', portee: { rubrique: 'SUB' } });
    // Changer l'effet repart des valeurs par défaut du nouvel effet.
    changeEffect(s, b, h, 'volume');
    expect(h).toMatchObject({ effet: 'volume', p10: 0.97, p90: 1.03, portee: { bu: ['Conseil'] } });
    const e = newEvent(s, b, 'volume', 'Perte du client Gamma');
    expect(e).toMatchObject({ code: 'E01', effet: 'volume', sens: 'baisse', portee: { bu: ['Conseil'] }, cible: 'BU Conseil', duree: 'fin' });
    s.registre.hypotheses.push(newHypothesis(s, b, 'poste', 'Subventions'));
    s.registre.evenements.push(e);
    expect(simulate({ scenario: { ...s, n: 1000 }, budget: b, quick: true }).ok).toBe(true);
  });
  test('retirer une entrée retire ce qui en dépend : corrélations, leviers, stress tests, paquets', () => {
    const s = alfaScenario();
    expect(dependents(s, 'H09')).toEqual({ correlations: 2, leviers: ['L4'], stress: [] });
    removeDriver(s, 'H09');
    expect(s.leviers.map((l) => l.code)).toEqual(['L1', 'L2', 'L3', 'L5']);
    removeDriver(s, 'E02');
    expect(s.stress.map((x) => x.code)).toEqual(['S1', 'S3']);
    expect(s.registre.revue_risques!.find((r) => r.categorie === 'R09')!.ref).not.toMatch(/E02/);
    // Sans le change, la couverture et le choc de change n'ont plus d'objet : ils partent avec lui.
    const t = alfaScenario();
    expect(dependents(t, 'H06')).toMatchObject({ leviers: ['L1'], stress: ['S1'] });
    removeDriver(t, 'H06');
    expect(t.paquets.map((p) => `${p.code}:${p.codes.join('+')}`)).toEqual(['A:L2+L3', 'B:L2+L3', 'S1+S3:S3']);
    expect(simulate({ scenario: { ...t, n: 1000 }, budget: alfaBudget(), quick: true }).ok).toBe(true);
    removeCase(s, 'L2');
    expect(s.paquets).toEqual([
      { code: 'A', libelle: 'Paquet A : L2 + L3', codes: ['L3'] },
      { code: 'B', libelle: 'Paquet B : A + L1', codes: ['L1', 'L3'] },
      { code: 'S1+S3', libelle: 'Choc macro combiné', codes: ['S1', 'S3'] },
    ]);
    const r = ok(s, alfaBudget());
    expect(r.cases.map((c) => c.code)).toEqual(['L1', 'L3', 'L5', 'A', 'B', 'S1', 'S3', 'S1+S3']);
  });
});

describe('leviers et stress tests définis par l\'utilisateur', () => {
  test('chaque type se crée, se décrit et se calcule', () => {
    const b = alfaBudget();
    const s = alfaScenario();
    expect(leverTypesFor(s)).toEqual(LEVER_TYPES);
    expect(stressTypesFor(s)).toEqual(STRESS_TYPES);
    for (const t of LEVER_TYPES) s.leviers.push(newLever(s, b, t));
    for (const t of STRESS_TYPES) s.stress.push(newStress(s, b, t));
    expect(s.leviers.map((l) => l.code)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']);
    expect(s.stress.map((x) => x.code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
    expect(leverRule(s.leviers[7], b)).toMatch(/^Coût matière −0,188 GAr en année pleine, dès avril/);
    const r = ok(s, b);
    for (const c of r.cases) expect(c.refus, c.code).toBeUndefined();
    expect(r.cases.find((c) => c.code === 'S7')!.dProb).toBeLessThan(0);
  });
  test('sans change ni événement, les types qui en dépendent ne sont pas proposés', () => {
    const s = starterScenario(betaBudget());
    expect(leverTypesFor(s)).toEqual(['prix', 'montant', 'plafond']);
    expect(stressTypesFor(s)).toEqual(['poste', 'volume']);
  });
  test('le coût d\'un levier pèse toujours sur l\'EBITDA, même sur une rubrique de produit', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    const l = newLever(s, b, 'montant');
    l.portee = { rubrique: 'SUB' };
    l.params = { variationAnnuelle: 12 };
    l.mois = 1;
    l.cout = 3;
    s.leviers.push(l);
    expect(point(s, b, {}, [l.code]) - point(s, b)).toBeCloseTo(12 - 3, 9);
  });
});

describe('une autre entreprise, avec ses propres rubriques', () => {
  test('points de marge sur une rubrique de charge : un point de plus améliore l\'EBITDA de 1 % du CA', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    const h = newHypothesis(s, b, 'marge', 'Mix des missions');
    h.portee = { rubrique: 'ACH' };
    s.registre.hypotheses.push(h);
    expect(point(s, b, { [h.code]: 1 }) - point(s, b, { [h.code]: 0 })).toBeCloseTo(0.01 * ca(b), 9);
    expect(point(s, b)).toBeCloseTo(b.ebitdaPublie, 9);
  });
  test('achats en dollars : hypothèse et stress de change de départ, couverture possible', () => {
    const b = betaUsd();
    const s = starterScenario(b);
    const fx = s.registre.hypotheses.find((h) => h.effet === 'change')!;
    expect(fx).toMatchObject({ libelle: 'Change USD/EUR, cours moyen', depart: 0.92, unite: 'EUR pour 1 USD' });
    expect(s.stress.map((x) => x.type)).toEqual(['volume', 'change']);
    expect(s.paquets).toEqual([{ code: 'S1+S2', libelle: 'Chocs combinés', codes: ['S1', 'S2'] }]);
    // Cours 10 % plus cher : seules les licences, payées en dollars, renchérissent.
    const m = buildModel(b, s.registre);
    const at = (rate: number) => runPL(m, pointDraws(m, budgetValues(m), new Array(12).fill(rate)), { noise: false, events: false }).annual[0];
    expect(at(0.92 * 1.1) - at(0.92)).toBeCloseTo(-12, 9);
    s.leviers.push(newLever(s, b, 'couverture'));
    const r = ok(s, b, 4000);
    const hedge = r.cases.find((c) => c.type === 'levier')!;
    expect(hedge.dEaR).toBeLessThanOrEqual(0);
    expect(r.fxStats).not.toBeNull();
    expect(r.controls.find((c) => c.code === 'C09')!.valeur).toMatch(/aucune/);
  });
  test('objectifs d\'EBITDA à l\'échelle du budget, quelle que soit l\'unité', () => {
    expect(objectives(betaBudget())).toEqual([1190, 1260, 1322, 1390]);
    expect(objectives({ ...betaBudget(), ebitdaPublie: 1.2 })).toEqual([1.08, 1.14, 1.2, 1.26]);
    expect(objectives({ ...betaBudget(), ebitdaPublie: -50 })).toEqual([-55, -52.5, -50, -47.5]);
  });
});

describe('contrôles sur une structure libre', () => {
  test('C09 : une rubrique de charge sans montant au budget n\'est pas testée, le run reste présentable', () => {
    const b = betaBudget();
    b.rubriques.push({ code: 'PEN', libelle: 'Pénalités', nature: 'charge' });
    const s = starterScenario(b);
    const r = ok(s, b);
    expect(r.controls.find((c) => c.code === 'C09')!.ok).toBe(true);
    expect(r.controls.find((c) => c.code === 'C01')!.ok).toBe(true);
  });
});

describe('du registre de départ à la note CODIR', () => {
  test('une fois les fourchettes validées, le run d\'une autre entreprise est présentable', () => {
    for (const b of [betaBudget(), betaUsd()]) {
      const s = starterScenario(b);
      const r0 = ok(s, b, 10000);
      expect(r0.controls.filter((c) => !c.ok).map((c) => c.code)).toEqual(['C12']);
      for (const h of s.registre.hypotheses) h.statut = 'valide';
      const r = ok(s, b, 10000);
      expect(r.controls.filter((c) => !c.ok).map((c) => `${c.code} ${c.valeur}`)).toEqual([]);
      expect(r.blocking).toBe(false);
    }
  });
});
