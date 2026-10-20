import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import { newEvent, newHypothesis, newLever, newStress, removeDriver } from '../../src/engine/edit.ts';
import { migrateBudget, migrateScenario } from '../../src/engine/legacy.ts';
import { budgetErrors, referenceErrors } from '../../src/engine/references.ts';
import { checkBudgetShape, checkScenarioShape, isBudget } from '../../src/engine/schema.ts';
import { starterScenario } from '../../src/engine/starter.ts';
import { legacyGrid } from '../../src/io/excel.ts';
import { simulate } from '../../src/engine/simulate.ts';
import type { Scenario } from '../../src/engine/types.ts';
import { encodeScenario, readScenario } from '../../src/io/share.ts';
import { compressToEncodedURIComponent } from 'lz-string';
import { betaBudget, v1Scenario } from '../fixtures.ts';

/** Scénario ALFA modifié par une fonction, sans typage : simule un lien ou un brouillon altéré. */
function altered(f: (s: any) => void): unknown {
  const s = structuredClone(alfaScenario()) as any;
  f(s);
  return s;
}

describe('validation de structure du scénario', () => {
  test('le scénario ALFA est valide', () => {
    expect(checkScenarioShape(alfaScenario())).toEqual([]);
  });
  test.each([
    ['objet absent', () => null, /objet attendu/],
    ['version de schéma', () => altered((s) => (s.schemaVersion = 3)), /Version de schéma 3 non prise en charge/],
    ['N non entier', () => altered((s) => (s.n = 'dix mille')), /N : entier/],
    ['mois clos hors bornes', () => altered((s) => (s.moisClos = 14)), /Mois clos/],
    ['registre absent', () => altered((s) => delete s.registre), /Registre absent/],
    ['registre vide', () => altered((s) => (s.registre.hypotheses = [])), /au moins une attendue/],
    ['trop d\'hypothèses', () => altered((s) => (s.registre.hypotheses = Array.from({ length: 61 }, (_, i) => ({ ...s.registre.hypotheses[0], code: `H${i + 100}` })))), /61 éléments, 60 au plus/],
    ['hypothèse en double', () => altered((s) => s.registre.hypotheses.push(s.registre.hypotheses[0])), /Hypothèses : code H01 en double/],
    ['code invalide', () => altered((s) => (s.registre.hypotheses[0].code = 'H 01')), /code absent ou invalide/],
    ['effet inconnu', () => altered((s) => (s.registre.hypotheses[0].effet = 'taux')), /H01 : effet « taux » inconnu/],
    ['portée absente', () => altered((s) => delete s.registre.hypotheses[0].portee), /H01 : portée absente/],
    ['P10 textuel', () => altered((s) => (s.registre.hypotheses[0].p10 = '0,95')), /H01 : P10 et P90 numériques/],
    ['change sans volatilité', () => altered((s) => delete s.registre.hypotheses.find((h: any) => h.effet === 'change').volatilite_mensuelle), /H06 : volatilite_mensuelle/],
    ['k textuel', () => altered((s) => (s.registre.hypotheses[1].k = 'deux')), /H02 : k non numérique/],
    ['événement sans amplitude', () => altered((s) => (s.registre.evenements[0].amplitude = 0.1)), /E01 : amplitude/],
    ['sens inconnu', () => altered((s) => (s.registre.evenements[1].sens = 'stable')), /E02 : sens attendu/],
    ['durée inconnue', () => altered((s) => (s.registre.evenements[1].duree = 'semaine')), /E02 : durée/],
    ['code commun', () => altered((s) => (s.registre.evenements[0].code = 'H01')), /Codes communs à une hypothèse et un événement : H01/],
    ['corrélation mal formée', () => altered((s) => s.registre.correlations_rang.push(['H01', 'X1', 0.2])), /Corrélation n° \d+/],
    ['bruit des volumes', () => altered((s) => (s.registre.bruit_volumes.phi = 1.2)), /Bruit des volumes/],
    ['levier sans paramètre', () => altered((s) => delete s.leviers[1].params.elasticite), /Levier L2 : paramètre elasticite/],
    ['type de levier inconnu', () => altered((s) => (s.leviers[0].type = 'swap')), /Levier L1 : type « swap » inconnu/],
    ['stress sans choc', () => altered((s) => delete s.stress[0].params.choc), /Stress S1 : paramètre choc/],
    ['paquet incohérent', () => altered((s) => (s.paquets[0].codes = ['L9'])), /Paquet A : L9 n'est ni un levier ni un stress test/],
    ['action cochée inconnue', () => altered((s) => (s.actifs = ['L9'])), /Action cochée L9 inconnue/],
  ])('%s', (_, make, re) => {
    expect(checkScenarioShape(make()).join('\n')).toMatch(re);
  });
  test('retirer une hypothèse, un événement, un stress test : le scénario reste valide et se calcule', () => {
    const s = alfaScenario();
    removeDriver(s, 'H05');
    removeDriver(s, 'E02');
    s.stress = s.stress.filter((x) => x.code !== 'S3');
    s.paquets = s.paquets.filter((p) => !p.codes.includes('S3'));
    expect(checkScenarioShape(s)).toEqual([]);
    // E02 portait le stress S2 (événement forcé) : retiré avec lui.
    expect(s.stress.map((x) => x.code)).toEqual(['S1']);
    expect(s.registre.correlations_rang.some((c) => c.includes('E02') || c.includes('H05'))).toBe(false);
    const r = simulate({ scenario: { ...s, n: 2000 }, budget: alfaBudget(), quick: true });
    expect(r.ok).toBe(true);
  });
  test('le moteur renvoie une erreur métier au lieu d\'échouer', () => {
    const bad = altered((s) => (s.registre.hypotheses[0].effet = 'taux')) as Scenario;
    const r = simulate({ scenario: bad, budget: alfaBudget(), quick: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/effet « taux » inconnu/);
    // Portée qui nomme une BU absente du budget : refusée avant calcul, avec le nom fautif.
    const ref = altered((s) => (s.registre.hypotheses[0].portee = { bu: ['Boulangerie'] })) as Scenario;
    const r2 = simulate({ scenario: ref, budget: alfaBudget(), quick: true });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.join(' ')).toMatch(/H01 : BU « Boulangerie » inconnue/);
  });
  test('lien de partage : altéré ou tronqué, refusé avec un message', () => {
    expect(readScenario(encodeScenario(alfaScenario())).ok).toBe(true);
    const bad = readScenario(compressToEncodedURIComponent(JSON.stringify(altered((s) => (s.leviers = {})))));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/Leviers : liste absente/);
    const cut = readScenario(encodeScenario(alfaScenario()).slice(0, 40));
    expect(cut.ok).toBe(false);
    expect(readScenario('%%%').ok).toBe(false);
  });
});

describe('compatibilité avec la version 1', () => {
  test('un lien de la version 1 se relit à l\'identique dans le modèle configurable', () => {
    const d = readScenario(compressToEncodedURIComponent(JSON.stringify(v1Scenario())));
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.scenario).toEqual(alfaScenario());
  });
  test('un brouillon de la version 1 sur un budget importé : les BU d\'ALFA prennent le nom de celles du budget, dans l\'ordre', () => {
    const s = migrateScenario(v1Scenario(), ['Frais', 'Sec', 'Hygiène']) as Scenario;
    const h = (c: string) => s.registre.hypotheses.find((x) => x.code === c)!;
    expect(h('H01').portee).toEqual({ bu: ['Frais'] });
    expect(h('H03').portee).toEqual({ bu: ['Hygiène'] });
    expect(h('H07').portee).toEqual({ postes: ['CMI_Frais', 'CMI_Sec', 'CMI_Hygiène'] });
    expect(s.registre.evenements.find((e) => e.code === 'E02')!.portee).toEqual({ bu: ['Frais', 'Sec'] });
    expect(s.leviers.find((l) => l.code === 'L2')!.portee).toEqual({ bu: ['Sec', 'Hygiène'] });
    expect(checkScenarioShape(s)).toEqual([]);
  });
});

describe('structure et cohérence du budget', () => {
  test('brouillon : budget bien formé, ou ancienne grille convertie', () => {
    expect(checkBudgetShape(alfaBudget())).toEqual([]);
    expect(checkBudgetShape(betaBudget())).toEqual([]);
    expect(isBudget(migrateBudget(legacyGrid()))).toBe(true);
    expect(checkBudgetShape(null)).toEqual(['Budget illisible : objet attendu']);
    const b = structuredClone(alfaBudget()) as any;
    b.postes[0].montants.pop();
    b.source = 'autre';
    b.change = { devise: 'EUR' };
    expect(checkBudgetShape(b)).toEqual(['Poste CA_Boissons : structure mal formée', 'Budget : change mal formé', 'Budget : source inconnue']);
  });
  test('cohérence : rubriques, BU, chiffre d\'affaires, devises, EBITDA', () => {
    const b = betaBudget();
    expect(budgetErrors(b)).toEqual([]);
    const bad = structuredClone(b);
    bad.postes[0].rubrique = 'XX';
    bad.postes[1].bu = 'Nouvelle BU';
    bad.postes[2].devises = 0.5;
    bad.postes[3].montants[0] = -5;
    bad.rubriques.push({ code: 'HON', libelle: 'Doublon', nature: 'ca' });
    expect(budgetErrors(bad)).toEqual([
      'Rubrique HON en double',
      'Poste CA_CONSEIL : rubrique « XX » inconnue',
      'Poste CA_FORMATION : BU « Nouvelle BU » inconnue',
      'Budget : des postes sont en devises, le cours budget est requis',
    ]);
    const ca = structuredClone(b);
    ca.postes[0].montants[0] = -1;
    ca.postes[1].bu = null;
    expect(budgetErrors(ca)).toEqual([
      'Poste CA_CONSEIL : un chiffre d\'affaires budgété ne peut pas être négatif',
      'Poste CA_FORMATION : un poste de chiffre d\'affaires appartient à une BU',
    ]);
  });
  test('références du scénario : chaque portée nomme un élément du budget', () => {
    const b = betaBudget();
    const s = starterScenario(b);
    expect(referenceErrors(s, b)).toEqual([]);
    const fx = newHypothesis(s, alfaBudget(), 'change');
    fx.code = 'FX';
    const marge = newHypothesis(s, b, 'marge');
    marge.portee = { rubrique: 'HON' };
    const e = newEvent(s, b, 'poste');
    e.portee = { postes: [] };
    e.surcout = [0, 1];
    e.rubriqueSurcout = 'SUB';
    s.registre.hypotheses.push(fx, marge);
    s.registre.evenements.push(e);
    s.leviers.push({ ...newLever(s, b, 'montant'), portee: {} });
    s.leviers.push({ ...newLever(s, b, 'plafond'), portee: {} });
    s.stress.push({ ...newStress(s, b, 'poste'), portee: {} });
    s.paquets.push({ code: 'P1', libelle: 'Paquet', codes: ['L9'] });
    expect(referenceErrors(s, b)).toEqual([
      'FX : le budget n\'a pas de cours de change',
      'H07 : les points de marge ne vont pas dans une rubrique de chiffre d\'affaires',
      'E01 : aucun poste visé',
      'E01 : le surcoût va dans une rubrique de charge',
      'Levier L1 : rubrique à préciser',
      'Levier L2 : hypothèse plafonnée à préciser',
      'Stress S2 : aucun poste visé',
      'Paquet P1 : L9 n\'est ni un levier ni un stress test',
    ]);
  });
});
