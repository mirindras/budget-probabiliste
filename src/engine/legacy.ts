/**
 * Compatibilité avec la version 1, où la structure d'ALFA était écrite en dur :
 * budget au grain BU × mois (CA, coût matière importé et local, six postes de charges),
 * scénarios aux codes fixes H01 à H12, E01 à E03, L1 à L5, S1 à S3.
 * Ces formats se convertissent dans le modèle configurable sans perte.
 */
import type { Budget, LeverDef, Paquet, Poste, Rubrique, StressDef } from './types.ts';

/** Budget de la version 1 : grain BU × mois, structure de distributeur. */
export interface LegacyGrid {
  libelle: string;
  exercice: number;
  bu: string[];
  ca: number[][];
  cmImp: number[][];
  cmLoc: number[][];
  carburant: number[];
  sousTraitance: number[];
  autresTransport: number[];
  masseSalariale: number[];
  fcTauxVariable: number;
  fcFixe: number[];
  fraisGeneraux: number[];
  coursBudget: number;
  ebitdaPublie: number;
  source: 'alfa' | 'import';
}

export const DISTRIBUTEUR_RUBRIQUES: Rubrique[] = [
  { code: 'CA', libelle: 'CA net', nature: 'ca' },
  { code: 'CM', libelle: 'Coût matière', nature: 'charge' },
  { code: 'MIX', libelle: 'Effet mix', nature: 'produit' },
  { code: 'TR', libelle: 'Transport', nature: 'charge' },
  { code: 'MS', libelle: 'Masse salariale', nature: 'charge' },
  { code: 'FC', libelle: 'Frais commerciaux', nature: 'charge' },
  { code: 'FG', libelle: 'Frais généraux', nature: 'charge' },
];

export const UNITES_GAR = { principale: 'GAr', detail: 'MAr', libelle: 'milliards d\'ariarys' };

export function isLegacyGrid(x: unknown): x is LegacyGrid {
  const g = x as LegacyGrid;
  return !!g && Array.isArray(g.ca) && Array.isArray(g.cmImp) && Array.isArray(g.carburant) && !('postes' in (g as object));
}

/** Code de poste dérivé d'un nom de BU : lettres, chiffres et soulignements. */
export const codeOf = (s: string): string => s.normalize('NFC').replace(/[^\p{L}\p{N}_.+-]+/gu, '_').slice(0, 20);

/** Budget de distributeur (structure ALFA) dans le modèle configurable. */
export function gridToBudget(g: LegacyGrid): Budget {
  const caMonth = Array.from({ length: 12 }, (_, t) => g.ca.reduce((a, r) => a + r[t], 0));
  const poste = (code: string, libelle: string, rubrique: string, bu: string | null, assiette: Poste['assiette'], devises: number, montants: number[]): Poste =>
    ({ code, libelle, rubrique, bu, assiette, devises, montants: [...montants] });
  const postes: Poste[] = [
    ...g.bu.map((bu, b) => poste(`CA_${codeOf(bu)}`, `CA ${bu}`, 'CA', bu, 'volume', 0, g.ca[b])),
    ...g.bu.flatMap((bu, b) => [
      poste(`CMI_${codeOf(bu)}`, `Coût matière importé ${bu}`, 'CM', bu, 'volume', 1, g.cmImp[b]),
      poste(`CML_${codeOf(bu)}`, `Coût matière local ${bu}`, 'CM', bu, 'volume', 0, g.cmLoc[b]),
    ]),
    poste('CARBURANT', 'Carburant de la flotte', 'TR', null, 'volume', 0, g.carburant),
    poste('SOUS_TRAITANCE', 'Transport sous-traité', 'TR', null, 'volume', 0, g.sousTraitance),
    poste('AUTRES_TRANSPORT', 'Autres frais de transport', 'TR', null, 'fixe', 0, g.autresTransport),
    poste('MASSE_SALARIALE', 'Masse salariale', 'MS', null, 'fixe', 0, g.masseSalariale),
    poste('FC_VARIABLES', 'Frais commerciaux variables', 'FC', null, 'ca', 0, caMonth.map((c) => g.fcTauxVariable * c)),
    poste('FC_FIXES', 'Frais commerciaux fixes', 'FC', null, 'fixe', 0, g.fcFixe),
    poste('FRAIS_GENERAUX', 'Frais généraux', 'FG', null, 'fixe', 0, g.fraisGeneraux),
  ];
  return {
    libelle: g.libelle,
    exercice: g.exercice,
    unites: { ...UNITES_GAR },
    bu: [...g.bu],
    rubriques: DISTRIBUTEUR_RUBRIQUES.map((r) => ({ ...r })),
    postes,
    change: { devise: 'EUR', locale: 'MGA', coursBudget: g.coursBudget },
    ebitdaPublie: g.ebitdaPublie,
    source: g.source,
  };
}

/* ------------------------------------------------------------------ Scénarios de la version 1 */

type V1 = Record<string, unknown> & { registre?: Record<string, unknown> };

/** Effet, portée et famille des codes d'ALFA, pour relire un scénario de la version 1. */
export const V1_HYP: Record<string, { famille: string; effet: string; portee: Record<string, unknown> }> = {
  H01: { famille: 'Commercial', effet: 'volume', portee: { bu: ['Boissons'] } },
  H02: { famille: 'Commercial', effet: 'volume', portee: { bu: ['Epicerie'] } },
  H03: { famille: 'Commercial', effet: 'volume', portee: { bu: ['Hygiene'] } },
  H04: { famille: 'Commercial', effet: 'prix', portee: {} },
  H05: { famille: 'Commercial', effet: 'marge', portee: { rubrique: 'MIX' } },
  H06: { famille: 'Macroéconomie', effet: 'change', portee: {} },
  H07: { famille: 'Approvisionnement', effet: 'poste', portee: { postes: ['CMI_Boissons', 'CMI_Epicerie', 'CMI_Hygiene'] } },
  H08: { famille: 'Macroéconomie', effet: 'poste', portee: { postes: ['CML_Boissons', 'CML_Epicerie', 'CML_Hygiene'] } },
  H09: { famille: 'Macroéconomie', effet: 'poste', portee: { postes: ['SOUS_TRAITANCE'] } },
  H10: { famille: 'Macroéconomie', effet: 'poste', portee: { postes: ['MASSE_SALARIALE'] } },
  H11: { famille: 'Commercial', effet: 'poste', portee: { postes: ['FC_VARIABLES', 'FC_FIXES'] } },
  H12: { famille: 'Macroéconomie', effet: 'poste', portee: { postes: ['FRAIS_GENERAUX'] } },
};
export const V1_EVENT: Record<string, Record<string, unknown>> = {
  E01: { famille: 'Macroéconomie', effet: 'poste', sens: 'hausse', portee: { postes: ['CARBURANT'] } },
  E02: { famille: 'Commercial', effet: 'volume', sens: 'baisse', portee: { bu: ['Boissons', 'Epicerie'] } },
  E03: { famille: 'Approvisionnement', effet: 'volume', sens: 'baisse', portee: { bu: ['Epicerie', 'Hygiene'] }, rubriqueSurcout: 'TR' },
};

export const ALFA_LEVER_TYPES: Record<string, Pick<LeverDef, 'type' | 'portee'>> = {
  L1: { type: 'couverture', portee: {} },
  L2: { type: 'prix', portee: { bu: ['Epicerie', 'Hygiene'] } },
  L3: { type: 'montant', portee: { rubrique: 'FG' } },
  L4: { type: 'plafond', portee: { hypothese: 'H09' } },
  L5: { type: 'attenuation', portee: { evenement: 'E03', rubrique: 'FG' } },
};
export const ALFA_STRESS_TYPES: Record<string, Pick<StressDef, 'type' | 'portee'>> = {
  S1: { type: 'change', portee: {} },
  S2: { type: 'evenement', portee: { evenement: 'E02' } },
  S3: { type: 'poste', portee: { postes: ['CARBURANT'] } },
};
export const ALFA_PAQUETS: Paquet[] = [
  { code: 'A', libelle: 'Paquet A : L2 + L3', codes: ['L2', 'L3'] },
  { code: 'B', libelle: 'Paquet B : A + L1', codes: ['L1', 'L2', 'L3'] },
  { code: 'S1+S3', libelle: 'Choc macro combiné', codes: ['S1', 'S3'] },
];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const ALFA_BU = ['Boissons', 'Epicerie', 'Hygiene'];

/**
 * En version 1, H01 à H03 portaient sur les trois BU du budget dans l'ordre, quel que soit leur nom :
 * les noms d'ALFA de la portée sont remplacés par ceux du budget, BU et postes de coût matière compris.
 */
function renameBu(p: unknown, bus: string[]): void {
  if (!isObj(p)) return;
  const bu = (n: unknown) => (typeof n === 'string' && ALFA_BU.includes(n) && bus[ALFA_BU.indexOf(n)] ? bus[ALFA_BU.indexOf(n)] : n);
  if (Array.isArray(p.bu)) p.bu = p.bu.map(bu);
  if (Array.isArray(p.postes)) {
    p.postes = p.postes.map((c: unknown) => {
      const m = typeof c === 'string' ? /^(CMI|CML)_(.+)$/.exec(c) : null;
      return m && bu(m[2]) !== m[2] ? `${m[1]}_${codeOf(bu(m[2]) as string)}` : c;
    });
  }
}

/**
 * Scénario de la version 1 (codes fixes d'ALFA) vers la version 2 : effets, portées et familles d'ALFA,
 * types des leviers et des stress tests, paquets. Un objet qui n'est pas en version 1 est rendu tel quel.
 * `bus` : BU du budget du scénario, si ce n'est pas celui d'ALFA.
 */
export function migrateScenario(x: unknown, bus?: string[]): unknown {
  if (!isObj(x) || x.schemaVersion !== 1) return x;
  const s = structuredClone(x) as V1;
  const reg = s.registre;
  const rename = bus && bus.join('|') !== ALFA_BU.join('|') ? (o: Record<string, unknown>) => renameBu(o.portee, bus) : () => {};
  if (isObj(reg)) {
    if (Array.isArray(reg.hypotheses)) {
      for (const h of reg.hypotheses) {
        if (!isObj(h) || typeof h.code !== 'string' || !V1_HYP[h.code]) continue;
        Object.assign(h, structuredClone(V1_HYP[h.code]));
        rename(h);
      }
    }
    if (Array.isArray(reg.evenements)) {
      for (const e of reg.evenements) {
        if (!isObj(e) || typeof e.code !== 'string' || !V1_EVENT[e.code]) continue;
        Object.assign(e, structuredClone(V1_EVENT[e.code]));
        rename(e);
      }
    }
  }
  if (Array.isArray(s.leviers)) {
    for (const l of s.leviers) {
      if (!isObj(l) || typeof l.code !== 'string' || !ALFA_LEVER_TYPES[l.code]) continue;
      Object.assign(l, structuredClone(ALFA_LEVER_TYPES[l.code]));
      rename(l);
      // L3 : l'économie annuelle devient une variation annuelle négative de la rubrique.
      const p = l.params as Record<string, number> | undefined;
      if (l.code === 'L3' && isObj(p) && typeof p.economieAnnuelle === 'number') l.params = { variationAnnuelle: -p.economieAnnuelle };
    }
  }
  if (Array.isArray(s.stress)) {
    for (const st of s.stress) if (isObj(st) && typeof st.code === 'string' && ALFA_STRESS_TYPES[st.code]) Object.assign(st, structuredClone(ALFA_STRESS_TYPES[st.code]));
  }
  s.paquets = structuredClone(ALFA_PAQUETS);
  s.schemaVersion = 2;
  return s;
}

/** Budget d'un brouillon de la version 1 : la grille BU × mois devient un budget en postes. */
export function migrateBudget(x: unknown): unknown {
  return isLegacyGrid(x) ? gridToBudget(x) : x;
}
