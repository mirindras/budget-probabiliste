/** Jeux d'essai partagés : un scénario de la version 1, et le budget d'une autre entreprise que ALFA. */
import { alfaScenario } from '../src/engine/alfa.ts';
import type { Budget, Poste } from '../src/engine/types.ts';

/** Le scénario ALFA tel que l'écrivait la version 1 : codes fixes, sans effet, portée, famille, type ni paquet. */
export function v1Scenario(): any {
  const s = structuredClone(alfaScenario()) as any;
  s.schemaVersion = 1;
  for (const h of s.registre.hypotheses) for (const k of ['famille', 'effet', 'portee']) delete h[k];
  for (const e of s.registre.evenements) for (const k of ['famille', 'effet', 'sens', 'portee', 'rubriqueSurcout']) delete e[k];
  for (const x of [...s.leviers, ...s.stress]) for (const k of ['type', 'portee']) delete x[k];
  s.leviers.find((l: any) => l.code === 'L3').params = { economieAnnuelle: 0.25 };
  delete s.paquets;
  return s;
}

const SAISON = [0.9, 0.95, 1.05, 1, 1, 1.05, 0.85, 0.6, 1.1, 1.15, 1.15, 1.2];
const poste = (code: string, libelle: string, rubrique: string, bu: string | null, assiette: Poste['assiette'], base: number, saison = false, devises = 0): Poste => ({
  code, libelle, rubrique, bu, assiette, devises, montants: SAISON.map((s) => Math.round(base * (saison ? s : 1))),
});

/**
 * BETA Conseil, société fictive de services : deux BU, montants en k€, sans achats en devises,
 * des rubriques qui n'ont rien à voir avec celles d'un distributeur.
 */
export function betaBudget(): Budget {
  const postes: Poste[] = [
    poste('CA_CONSEIL', 'Honoraires de conseil', 'HON', 'Conseil', 'volume', 400, true),
    poste('CA_FORMATION', 'Ventes de formations', 'HON', 'Formation', 'volume', 150, true),
    poste('SOUSTRAIT', 'Consultants sous-traités', 'ACH', 'Conseil', 'volume', 80, true),
    poste('COMMISSIONS', 'Commissions d\'apporteurs', 'ACH', null, 'ca', 25, true),
    poste('SALAIRES', 'Salaires et charges', 'PERS', null, 'fixe', 300),
    poste('LOYERS', 'Loyers des bureaux', 'LOC', null, 'fixe', 40),
    poste('SUBV', 'Subventions de formation', 'SUB', 'Formation', 'fixe', 5),
  ];
  const b: Budget = {
    libelle: 'BETA Conseil, budget 2028',
    exercice: 2028,
    unites: { principale: 'k€', detail: '€', libelle: 'milliers d\'euros' },
    bu: ['Conseil', 'Formation'],
    rubriques: [
      { code: 'HON', libelle: 'Chiffre d\'affaires', nature: 'ca' },
      { code: 'SUB', libelle: 'Subventions', nature: 'produit' },
      { code: 'ACH', libelle: 'Achats et sous-traitance', nature: 'charge' },
      { code: 'PERS', libelle: 'Frais de personnel', nature: 'charge' },
      { code: 'LOC', libelle: 'Locaux', nature: 'charge' },
    ],
    postes,
    change: null,
    ebitdaPublie: 0,
    source: 'import',
  };
  const sign = (r: string) => (b.rubriques.find((x) => x.code === r)!.nature === 'charge' ? -1 : 1);
  b.ebitdaPublie = postes.reduce((a, p) => a + sign(p.rubrique) * p.montants.reduce((x, y) => x + y, 0), 0);
  return b;
}
