/** M7 : leviers et stress tests appliqués en surcouche, à aléa commun (section 10, règles F.3). */
import { buMask, postesOf, type Model } from './model.ts';
import type { CaseCode, LeverDef, Paquet, StressDef } from './types.ts';

/** Effets combinés des leviers et stress actifs, lus par le moteur P&L. */
export interface Effects {
  /** Couverture de change : part couverte et cours garanti. */
  hedge: { part: number; cours: number } | null;
  /** Hausses de prix avec effet volume, à partir d'un mois, sur des BU. */
  prices: { factor: number; volume: number; from: number; mask: Uint8Array }[];
  /** Ajustement additif de chaque rubrique, par mois (nr × 12). */
  rubDelta: Float64Array;
  /** Bornes imposées aux hypothèses (plafond, plancher). */
  capMax: Float64Array;
  capMin: Float64Array;
  /** Facteur sur l'amplitude de chaque événement, et suppression de son surcoût. */
  eventAmp: Float64Array;
  eventNoCost: Uint8Array;
  /** Choc sur le cours. */
  fxShock: { factor: number; from: number } | null;
  /** Événements forcés par un stress test : amplitude et mois de départ, à la place du tirage. */
  forced: ({ amp: number; from: number } | null)[];
  /** Lignes de calcul (postes regroupés) en hausse à partir d'un mois. */
  posteShocks: { p: number; factor: number; from: number }[];
  /** Volumes en baisse à partir d'un mois, sur des BU. */
  volShocks: { factor: number; from: number; mask: Uint8Array }[];
  /** Contrôle de monotonie C09 : +1 % sur une rubrique de charge, ou sur le cours. */
  bump: number;
  bumpFx: boolean;
}

export function neutralEffects(m: Model): Effects {
  return {
    hedge: null, prices: [], rubDelta: new Float64Array(m.nr * 12),
    capMax: new Float64Array(m.nh).fill(Infinity), capMin: new Float64Array(m.nh).fill(-Infinity),
    eventAmp: new Float64Array(m.ne).fill(1), eventNoCost: new Uint8Array(m.ne),
    fxShock: null, forced: new Array(m.ne).fill(null), posteShocks: [], volShocks: [], bump: -1, bumpFx: false,
  };
}

/** Refus d'un levier incomplet (R-LE-02, exception UC05) : renvoie le champ manquant. */
export function leverMissingField(l: LeverDef): string | null {
  if (l.cout === null || l.cout === undefined || Number.isNaN(l.cout)) return 'coût direct';
  if (l.mois === null || l.mois === undefined || !(l.mois >= 1 && l.mois <= 12)) return "date d'effet";
  if (!l.proprietaire?.trim()) return 'propriétaire';
  return null;
}

export function buildEffects(m: Model, active: readonly CaseCode[], levers: LeverDef[], stress: StressDef[]): Effects {
  const e = neutralEffects(m);
  const b = m.budget;
  for (const code of active) {
    const l = levers.find((x) => x.code === code);
    if (l) {
      if (leverMissingField(l)) continue;
      const from = l.mois! - 1;
      const p = l.params;
      switch (l.type) {
        case 'couverture':
          e.hedge = { part: p.part, cours: p.cours };
          break;
        case 'prix':
          e.prices.push({ factor: 1 + p.hausse, volume: 1 + p.hausse * p.elasticite, from, mask: buMask(b, l.portee) });
          break;
        case 'montant': {
          const r = m.rubIndex.get(l.portee.rubrique ?? '');
          if (r === undefined) break;
          for (let t = from; t < 12; t++) e.rubDelta[r * 12 + t] += p.variationAnnuelle / 12;
          // Le coût unique pèse toujours sur l'EBITDA : en plus sur une charge, en moins sur un produit.
          e.rubDelta[r * 12] -= m.rubSign[r] * l.cout!;
          break;
        }
        case 'plafond': {
          const j = m.hypIndex.get(l.portee.hypothese ?? '');
          if (j === undefined) break;
          if (Number.isFinite(p.plafond)) e.capMax[j] = Math.min(e.capMax[j], p.plafond);
          if (Number.isFinite(p.plancher)) e.capMin[j] = Math.max(e.capMin[j], p.plancher);
          break;
        }
        case 'attenuation': {
          const k = m.eventIndex.get(l.portee.evenement ?? '');
          if (k !== undefined) {
            e.eventAmp[k] *= 1 - p.reduction;
            e.eventNoCost[k] = 1;
          }
          const r = m.rubIndex.get(l.portee.rubrique ?? '');
          if (r !== undefined) for (let t = 0; t < 12; t++) e.rubDelta[r * 12 + t] -= (m.rubSign[r] * p.coutAnnuel) / 12;
          break;
        }
      }
      continue;
    }
    const s = stress.find((x) => x.code === code);
    if (!s) continue;
    const from = s.mois - 1;
    const choc = s.params.choc;
    switch (s.type) {
      case 'change':
        e.fxShock = { factor: 1 + choc, from };
        break;
      case 'evenement': {
        const k = m.eventIndex.get(s.portee.evenement ?? '');
        if (k !== undefined) e.forced[k] = { amp: choc, from };
        break;
      }
      case 'poste':
        for (const g of shockedLines(m, postesOf(b, s.portee), s.code)) e.posteShocks.push({ p: g, factor: 1 + choc, from });
        break;
      case 'volume':
        e.volShocks.push({ factor: 1 - choc, from, mask: buMask(b, s.portee) });
        break;
    }
  }
  return e;
}

/**
 * Lignes de calcul visées par un choc sur des postes. Chaque ligne doit être visée en entier : le modèle,
 * compilé avec les stress tests du scénario, ne regroupe jamais un poste choqué avec un poste qui ne l'est pas.
 */
function shockedLines(m: Model, postes: number[], code: string): number[] {
  const hit = new Map<number, number>();
  for (const p of postes) hit.set(m.posteLine[p], (hit.get(m.posteLine[p]) ?? 0) + 1);
  for (const [g, k] of hit) {
    let size = 0;
    for (let p = 0; p < m.posteLine.length; p++) if (m.posteLine[p] === g) size++;
    if (k !== size) throw new Error(`Stress ${code} : modèle compilé sans ce stress test, ses postes sont regroupés avec d'autres`);
  }
  return [...hit.keys()].sort((a, c) => a - c);
}

/**
 * Bumps du contrôle de monotonie C09 : chaque rubrique de charge budgétée, et le cours s'il y a des postes en devises.
 * Une rubrique de charge sans montant au budget n'a rien à faire monter : elle n'est pas testée.
 */
export function bumps(m: Model): { label: string; rubrique: number; fx: boolean }[] {
  const funded = new Uint8Array(m.nr);
  for (let p = 0; p < m.np; p++) for (let t = 0; t < 12; t++) if (m.pAmt[p * 12 + t] !== 0) funded[m.pR[p]] = 1;
  const out = m.budget.rubriques.flatMap((r, i) => (m.rubCharge[i] && funded[i] ? [{ label: r.libelle, rubrique: i, fx: false }] : []));
  if (m.fxIndex >= 0 && Array.from(m.pDev).some((x) => x > 0)) out.push({ label: 'cours', rubrique: -1, fx: true });
  return out;
}

/** Type d'un paquet : combinaison de stress tests si tous ses codes sont des stress, paquet de leviers sinon. */
export function packageType(p: Paquet, stress: StressDef[]): 'paquet' | 'stress' {
  return p.codes.length > 0 && p.codes.every((c) => stress.some((s) => s.code === c)) ? 'stress' : 'paquet';
}
