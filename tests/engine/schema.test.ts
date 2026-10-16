import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaScenario } from '../../src/engine/alfa.ts';
import { checkScenarioShape } from '../../src/engine/schema.ts';
import { simulate } from '../../src/engine/simulate.ts';
import type { Scenario } from '../../src/engine/types.ts';
import { encodeScenario, readScenario } from '../../src/io/share.ts';
import { compressToEncodedURIComponent } from 'lz-string';

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
    ['version de schéma', () => altered((s) => (s.schemaVersion = 2)), /Version de schéma 2/],
    ['N non entier', () => altered((s) => (s.n = 'dix mille')), /N : entier/],
    ['mois clos hors bornes', () => altered((s) => (s.moisClos = 14)), /Mois clos/],
    ['registre absent', () => altered((s) => delete s.registre), /Registre absent/],
    ['hypothèse manquante', () => altered((s) => s.registre.hypotheses.splice(4, 1)), /Hypothèses : H05 absent/],
    ['hypothèse en double', () => altered((s) => s.registre.hypotheses.push(s.registre.hypotheses[0])), /H01 présent 2 fois/],
    ['code inconnu', () => altered((s) => (s.registre.hypotheses[0].code = 'H99')), /H99 inconnu/],
    ['P10 textuel', () => altered((s) => (s.registre.hypotheses[0].p10 = '0,95')), /H01 : P10 et P90 numériques/],
    ['H06 sans volatilité', () => altered((s) => delete s.registre.hypotheses.find((h: any) => h.code === 'H06').volatilite_mensuelle), /H06 : volatilite_mensuelle/],
    ['k textuel', () => altered((s) => (s.registre.hypotheses[1].k = 'deux')), /H02 : k non numérique/],
    ['événement sans amplitude', () => altered((s) => (s.registre.evenements[0].amplitude = 0.1)), /E01 : amplitude/],
    ['durée inconnue', () => altered((s) => (s.registre.evenements[1].duree = 'semaine')), /E02 : durée/],
    ['corrélation mal formée', () => altered((s) => s.registre.correlations_rang.push(['H01', 'X1', 0.2])), /Corrélation n° \d+/],
    ['bruit des volumes', () => altered((s) => (s.registre.bruit_volumes.phi = 1.2)), /Bruit des volumes/],
    ['levier sans paramètre', () => altered((s) => delete s.leviers[1].params.elasticite), /Levier L2 : paramètre elasticite/],
    ['stress manquant', () => altered((s) => s.stress.pop()), /Stress tests : S3 absent/],
    ['action cochée inconnue', () => altered((s) => (s.actifs = ['L9'])), /Action cochée L9 inconnue/],
  ])('%s', (_, make, re) => {
    expect(checkScenarioShape(make()).join('\n')).toMatch(re);
  });
  test('le moteur renvoie une erreur métier au lieu d\'échouer', () => {
    const bad = altered((s) => s.registre.hypotheses.splice(0, 1)) as Scenario;
    const r = simulate({ scenario: bad, budget: alfaBudget(), quick: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/H01 absent/);
  });
  test('lien de partage : altéré ou tronqué, refusé avec un message', () => {
    expect(readScenario(encodeScenario(alfaScenario())).ok).toBe(true);
    const bad = readScenario(compressToEncodedURIComponent(JSON.stringify(altered((s) => (s.leviers = {})))));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/leviers absente/);
    const cut = readScenario(encodeScenario(alfaScenario()).slice(0, 40));
    expect(cut.ok).toBe(false);
    expect(readScenario('%%%').ok).toBe(false);
  });
});
