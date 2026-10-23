/**
 * Compilation du modèle : du budget (rubriques, postes, BU) et du registre (hypothèses, événements typés)
 * aux tableaux indexés que parcourt le moteur. Un modèle se compile une fois par run.
 *
 * Les postes qui se calculent exactement de la même façon (même rubrique, même BU, même assiette, même part
 * en devises, mêmes hypothèses, mêmes événements, mêmes stress tests) sont regroupés en une ligne de calcul
 * dont les montants sont la somme des leurs : un budget de quelques centaines de postes se ramène à quelques
 * dizaines de lignes, sans changer le résultat.
 */
import { setupCopula, type CopulaSetup } from './copula.ts';
import { makeLaw, type Law } from './laws.ts';
import { signOf, type Budget, type Hypothesis, type Portee, type Registry, type RiskEvent, type StressDef } from './types.ts';

export const ASS_FIXE = 0;
export const ASS_VOLUME = 1;
export const ASS_CA = 2;

export interface Model {
  budget: Budget;
  reg: Registry;
  /** Nombre de BU, de rubriques, de postes, d'hypothèses, d'événements, de drivers (hypothèses + événements). */
  nb: number;
  nr: number;
  np: number;
  nh: number;
  ne: number;
  nd: number;
  /** Codes des drivers, ordre des colonnes de l'hypercube et de la copule : hypothèses puis événements. */
  codes: string[];
  hyps: Hypothesis[];
  events: RiskEvent[];
  /** Loi de chaque hypothèse (null pour le change, en marche aléatoire). */
  laws: (Law | null)[];
  /** Indice de l'hypothèse de change, -1 si le modèle n'en a pas. */
  fxIndex: number;
  fx: { depart: number; derive: number; vol: number } | null;
  coursBudget: number;
  copula: CopulaSetup;
  phi: number;
  sigma: number;
  rubSign: Float64Array;
  rubCharge: Uint8Array;
  /**
   * Lignes de calcul (postes regroupés) : rubrique, BU (-1 si commune), assiette, part en devises,
   * montants (np × 12), chiffre d'affaires ou non. np est le nombre de lignes, pas de postes.
   */
  pR: Int32Array;
  pB: Int32Array;
  pAss: Uint8Array;
  pDev: Float64Array;
  pAmt: Float64Array;
  pCA: Uint8Array;
  /** Ligne de calcul de chaque poste du budget, dans l'ordre du budget. */
  posteLine: Int32Array;
  /** Hypothèses d'effet « poste » et événements d'effet « poste » qui touchent chaque ligne. */
  pHyps: Int32Array[];
  pEvents: Int32Array[];
  caPostes: Int32Array;
  /** Hypothèses de volume et de prix de chaque BU. */
  volHyps: Int32Array[];
  prixHyps: Int32Array[];
  /** Hypothèses de marge : indice, BU visées (null : toutes), rubrique d'arrivée. */
  marge: { j: number; mask: Uint8Array | null; r: number }[];
  /** Événements d'effet volume, dans l'ordre du registre. */
  volEvents: Int32Array;
  evMask: Uint8Array[];
  evSign: Float64Array;
  evMonthly: Uint8Array;
  evSurcoutR: Int32Array;
  /** Chiffre d'affaires budgété par BU et par mois (nb × 12), et par mois. */
  caBud: Float64Array;
  caBudMonth: Float64Array;
  /** Saisonnalité budgétée de chaque BU, poids du recentrage du bruit mensuel. */
  seas: Float64Array[];
  hypIndex: Map<string, number>;
  eventIndex: Map<string, number>;
  posteIndex: Map<string, number>;
  rubIndex: Map<string, number>;
  buIndex: Map<string, number>;
}

/** Postes visés par une portée : postes nommés, plus tous ceux de la rubrique nommée. */
export function postesOf(b: Budget, p: Portee): number[] {
  const out = new Set<number>();
  for (const c of p.postes ?? []) {
    const i = b.postes.findIndex((x) => x.code === c);
    if (i >= 0) out.add(i);
  }
  if (p.rubrique) b.postes.forEach((x, i) => x.rubrique === p.rubrique && out.add(i));
  return [...out].sort((a, c) => a - c);
}

/** Masque des BU visées : toutes si la portée n'en nomme aucune. */
export function buMask(b: Budget, p: Portee): Uint8Array {
  const m = new Uint8Array(b.bu.length);
  if (!p.bu || p.bu.length === 0) m.fill(1);
  else for (const x of p.bu) {
    const i = b.bu.indexOf(x);
    if (i >= 0) m[i] = 1;
  }
  return m;
}

export function driverCodes(reg: Registry): string[] {
  return [...reg.hypotheses.map((h) => h.code), ...reg.evenements.map((e) => e.code)];
}

/** Chiffre d'affaires budgété d'une BU, mois par mois. */
function caBudget(b: Budget): Float64Array {
  const nb = b.bu.length;
  const caRubs = new Set(b.rubriques.filter((r) => r.nature === 'ca').map((r) => r.code));
  const out = new Float64Array(nb * 12);
  for (const p of b.postes) {
    if (!caRubs.has(p.rubrique) || p.bu === null) continue;
    const bi = b.bu.indexOf(p.bu);
    if (bi < 0) continue;
    for (let t = 0; t < 12; t++) out[bi * 12 + t] += p.montants[t];
  }
  return out;
}

/**
 * `stress` : stress tests du scénario. Un stress test qui vise des postes nommés empêche de regrouper
 * ces postes avec d'autres, pour que son choc s'applique exactement à eux.
 */
export function buildModel(budget: Budget, reg: Registry, stress: StressDef[] = []): Model {
  const nb = budget.bu.length;
  const nr = budget.rubriques.length;
  const np = budget.postes.length;
  const hyps = reg.hypotheses;
  const events = reg.evenements;
  const nh = hyps.length;
  const ne = events.length;
  const codes = driverCodes(reg);
  const rubIndex = new Map(budget.rubriques.map((r, i) => [r.code, i]));
  const buIndex = new Map(budget.bu.map((x, i) => [x, i]));
  const posteIndex = new Map(budget.postes.map((p, i) => [p.code, i]));
  const hypIndex = new Map(hyps.map((h, i) => [h.code, i]));
  const eventIndex = new Map(events.map((e, i) => [e.code, i]));

  const rubSign = Float64Array.from(budget.rubriques, (r) => signOf(r.nature));
  const rubCharge = Uint8Array.from(budget.rubriques, (r) => (r.nature === 'charge' ? 1 : 0));
  const caRubs = new Set(budget.rubriques.filter((r) => r.nature === 'ca').map((r) => r.code));

  // Hypothèses, événements et stress tests qui touchent chaque poste du budget, avant regroupement.
  const pHypsL: number[][] = Array.from({ length: np }, () => []);
  const volHypsL: number[][] = Array.from({ length: nb }, () => []);
  const prixHypsL: number[][] = Array.from({ length: nb }, () => []);
  const marge: Model['marge'] = [];
  const laws: (Law | null)[] = [];
  let fxIndex = -1;
  hyps.forEach((h, j) => {
    laws.push(h.effet === 'change' ? null : makeLaw(h));
    if (h.effet === 'change') {
      if (fxIndex < 0) fxIndex = j;
    } else if (h.effet === 'volume' || h.effet === 'prix') {
      const m = buMask(budget, h.portee);
      for (let b = 0; b < nb; b++) if (m[b]) (h.effet === 'volume' ? volHypsL : prixHypsL)[b].push(j);
    } else if (h.effet === 'poste') {
      for (const p of postesOf(budget, h.portee)) pHypsL[p].push(j);
    } else if (h.effet === 'marge') {
      const all = !h.portee.bu || h.portee.bu.length === 0;
      marge.push({ j, mask: all ? null : buMask(budget, h.portee), r: rubIndex.get(h.portee.rubrique ?? '') ?? 0 });
    }
  });

  const pEventsL: number[][] = Array.from({ length: np }, () => []);
  const volEventsL: number[] = [];
  const evMask: Uint8Array[] = [];
  const evSign = new Float64Array(ne);
  const evMonthly = new Uint8Array(ne);
  const evSurcoutR = new Int32Array(ne).fill(-1);
  events.forEach((e, k) => {
    evSign[k] = e.sens === 'hausse' ? 1 : -1;
    evMonthly[k] = e.duree === 'mois' ? 1 : 0;
    evMask.push(buMask(budget, e.portee));
    if (e.effet === 'volume') volEventsL.push(k);
    else for (const p of postesOf(budget, e.portee)) pEventsL[p].push(k);
    if (e.surcout && e.rubriqueSurcout !== undefined) evSurcoutR[k] = rubIndex.get(e.rubriqueSurcout) ?? -1;
  });

  const pStressL: number[][] = Array.from({ length: np }, () => []);
  stress.forEach((x, k) => {
    if (x.type === 'poste' && x.portee.postes?.length) for (const p of postesOf(budget, x.portee)) pStressL[p].push(k);
  });

  // Regroupement des postes de même comportement en lignes de calcul, dans l'ordre de leur première apparition.
  const lineOf = new Map<string, number>();
  const posteLine = new Int32Array(np);
  const lines: { r: number; b: number; ass: number; dev: number; ca: number; hyps: number[]; evs: number[]; amt: number[] }[] = [];
  budget.postes.forEach((p, i) => {
    const r = rubIndex.get(p.rubrique) ?? 0;
    const b = p.bu === null ? -1 : (buIndex.get(p.bu) ?? -1);
    const ass = p.assiette === 'volume' ? ASS_VOLUME : p.assiette === 'ca' ? ASS_CA : ASS_FIXE;
    const ca = caRubs.has(p.rubrique) && b >= 0 ? 1 : 0;
    const key = [r, b, ass, p.devises, ca, pHypsL[i].join(','), pEventsL[i].join(','), pStressL[i].join(',')].join('|');
    let g = lineOf.get(key);
    if (g === undefined) {
      g = lines.length;
      lineOf.set(key, g);
      lines.push({ r, b, ass, dev: p.devises, ca, hyps: pHypsL[i], evs: pEventsL[i], amt: new Array(12).fill(0) });
    }
    posteLine[i] = g;
    for (let t = 0; t < 12; t++) lines[g].amt[t] += p.montants[t];
  });
  const nLines = lines.length;
  const pR = Int32Array.from(lines, (l) => l.r);
  const pB = Int32Array.from(lines, (l) => l.b);
  const pAss = Uint8Array.from(lines, (l) => l.ass);
  const pDev = Float64Array.from(lines, (l) => l.dev);
  const pCA = Uint8Array.from(lines, (l) => l.ca);
  const pAmt = new Float64Array(nLines * 12);
  lines.forEach((l, g) => {
    for (let t = 0; t < 12; t++) pAmt[g * 12 + t] = l.amt[t];
  });

  const caBud = caBudget(budget);
  const caBudMonth = new Float64Array(12);
  for (let b = 0; b < nb; b++) for (let t = 0; t < 12; t++) caBudMonth[t] += caBud[b * 12 + t];
  const seas = Array.from({ length: nb }, (_, b) => {
    let s = 0;
    for (let t = 0; t < 12; t++) s += caBud[b * 12 + t];
    return Float64Array.from({ length: 12 }, (_, t) => (s > 0 ? caBud[b * 12 + t] / s : 1 / 12));
  });

  const hFx = fxIndex >= 0 ? hyps[fxIndex] : null;
  return {
    budget, reg, nb, nr, np: nLines, nh, ne, nd: nh + ne, codes, hyps, events, laws, fxIndex,
    fx: hFx ? { depart: hFx.depart!, derive: hFx.derive_annuelle!, vol: hFx.volatilite_mensuelle! * (hFx.k ?? 1) } : null,
    coursBudget: budget.change?.coursBudget ?? 1,
    copula: setupCopula(reg.correlations_rang, codes),
    phi: reg.bruit_volumes.phi,
    sigma: reg.bruit_volumes.sigma_mensuel,
    rubSign, rubCharge, pR, pB, pAss, pDev, pAmt, pCA, posteLine,
    pHyps: lines.map((l) => Int32Array.from(l.hyps)),
    pEvents: lines.map((l) => Int32Array.from(l.evs)),
    caPostes: Int32Array.from(lines.map((_, g) => g).filter((g) => pCA[g])),
    volHyps: volHypsL.map((x) => Int32Array.from(x)),
    prixHyps: prixHypsL.map((x) => Int32Array.from(x)),
    marge,
    volEvents: Int32Array.from(volEventsL),
    evMask, evSign, evMonthly, evSurcoutR,
    caBud, caBudMonth, seas,
    hypIndex, eventIndex, posteIndex, rubIndex, buIndex,
  };
}

/** EBITDA mensuel du budget : postes à leur montant budgété, aucune hypothèse ni aucun aléa. */
export function budgetMonthly(budget: Budget): number[] {
  const sign = new Map(budget.rubriques.map((r) => [r.code, signOf(r.nature)]));
  const out = new Array<number>(12).fill(0);
  // Par rubrique d'abord, dans l'ordre du P&L, comme le moteur.
  for (const r of budget.rubriques) {
    for (let t = 0; t < 12; t++) {
      let s = 0;
      for (const p of budget.postes) if (p.rubrique === r.code) s += p.montants[t];
      out[t] += sign.get(r.code)! * s;
    }
  }
  return out;
}

/** Marge budgétée de chaque BU sur l'année : somme signée de ses postes. */
export function buBudget(budget: Budget): number[] {
  const sign = new Map(budget.rubriques.map((r) => [r.code, signOf(r.nature)]));
  return budget.bu.map((bu) => budget.postes.filter((p) => p.bu === bu).reduce((a, p) => a + sign.get(p.rubrique)! * p.montants.reduce((x, y) => x + y, 0), 0));
}
