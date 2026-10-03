/** M7 : leviers et stress tests appliqués en surcouche, à aléa commun (section 10, règles F.3). */
import type { CaseCode, LeverDef, StressDef } from './types.ts';

export type Bump = 'cmImp' | 'cmLoc' | 'transport' | 'ms' | 'fc' | 'fg' | 'cours';
export const BUMPS: Bump[] = ['cmImp', 'cmLoc', 'transport', 'ms', 'fc', 'fg', 'cours'];

/** Effets combinés des leviers et stress actifs, lus par le moteur P&L. */
export interface Effects {
  /** L1 : part couverte et cours garanti. */
  hedge: { part: number; cours: number } | null;
  /** L2 : hausse de prix et effet volume à partir d'un mois, sur certaines BU. */
  price: { factor: number; volume: number; from: number; bus: number[] } | null;
  /** Ajustement additif des frais généraux par mois (L3, L5). */
  fgDelta: Float64Array;
  /** L4 : plafond de H09. */
  h09Cap: number | null;
  /** L5 : facteur sur l'amplitude de E03 et suppression du surcoût. */
  e03AmpFactor: number;
  e03NoCost: boolean;
  /** S1 : choc sur le cours. */
  fxShock: { factor: number; from: number } | null;
  /** S2 : perte forcée remplaçant E02. */
  forcedLoss: { amp: number; from: number } | null;
  /** S3 : choc carburant. */
  fuelShock: { factor: number; from: number } | null;
  /** Contrôle de monotonie C09 : +1 % sur une charge ou sur le cours. */
  bump: Bump | null;
}

export function neutralEffects(): Effects {
  return {
    hedge: null, price: null, fgDelta: new Float64Array(12), h09Cap: null,
    e03AmpFactor: 1, e03NoCost: false, fxShock: null, forcedLoss: null, fuelShock: null, bump: null,
  };
}

/** Refus d'un levier incomplet (R-LE-02, exception UC05) : renvoie le champ manquant. */
export function leverMissingField(l: LeverDef): string | null {
  if (l.cout === null || l.cout === undefined || Number.isNaN(l.cout)) return 'coût direct';
  if (l.mois === null || l.mois === undefined || !(l.mois >= 1 && l.mois <= 12)) return "date d'effet";
  if (!l.proprietaire?.trim()) return 'propriétaire';
  return null;
}

export function buildEffects(active: readonly CaseCode[], levers: LeverDef[], stress: StressDef[]): Effects {
  const e = neutralEffects();
  for (const code of active) {
    const l = levers.find((x) => x.code === code);
    if (l) {
      if (leverMissingField(l)) continue;
      const from = l.mois! - 1;
      const p = l.params;
      switch (l.code) {
        case 'L1':
          e.hedge = { part: p.part, cours: p.cours };
          break;
        case 'L2':
          e.price = { factor: 1 + p.hausse, volume: 1 + p.hausse * p.elasticite, from, bus: [1, 2] };
          break;
        case 'L3':
          for (let t = from; t < 12; t++) e.fgDelta[t] -= p.economieAnnuelle / 12;
          e.fgDelta[0] += l.cout!;
          break;
        case 'L4':
          e.h09Cap = p.plafond;
          break;
        case 'L5':
          e.e03AmpFactor = 1 - p.reduction;
          e.e03NoCost = true;
          for (let t = 0; t < 12; t++) e.fgDelta[t] += p.coutAnnuel / 12;
          break;
      }
      continue;
    }
    const s = stress.find((x) => x.code === code);
    if (!s) continue;
    const from = s.mois - 1;
    if (s.code === 'S1') e.fxShock = { factor: 1 + s.params.choc, from };
    if (s.code === 'S2') e.forcedLoss = { amp: s.params.choc, from };
    if (s.code === 'S3') e.fuelShock = { factor: 1 + s.params.choc, from };
  }
  return e;
}

/** Paquets de leviers présentés au CODIR (section 10.2) : toujours recalculés (R-LE-03). */
export const PACKAGES: { code: string; libelle: string; leviers: CaseCode[] }[] = [
  { code: 'A', libelle: 'Paquet A : L2 + L3', leviers: ['L2', 'L3'] },
  { code: 'B', libelle: 'Paquet B : A + L1', leviers: ['L1', 'L2', 'L3'] },
];
