/** M6 : indicateurs, origine du risque, profils de scénarios (section 9). */
import { neutralEffects } from './levers.ts';
import { buBudget, type Model } from './model.ts';
import { runPL, type PLResult } from './pl.ts';
import { fxDeterministic, p50Values, pointDraws, type Draws } from './sampling.ts';
import { mean, percentileSorted, ranks, pearson, sorted, std } from './stats.ts';

export interface Stats {
  p10: number;
  p20: number;
  p50: number;
  p90: number;
  mean: number;
  std: number;
  /** Probabilité d'atteinte du budget (Q1). */
  prob: number;
  /** EBITDA-at-Risk 90 = P50 - P10 (Q2). */
  ear: number;
  /** Moyenne des 10 % d'itérations les plus basses. */
  cvar10: number;
  min: number;
  max: number;
}

export function computeStats(x: ArrayLike<number>, target: number): Stats {
  const s = sorted(x);
  const n = s.length;
  let hit = 0;
  for (let i = 0; i < n; i++) if (s[i] >= target) hit++;
  const k = Math.floor(n / 10);
  let cv = 0;
  for (let i = 0; i < k; i++) cv += s[i];
  const p10 = percentileSorted(s, 0.1);
  const p50 = percentileSorted(s, 0.5);
  return {
    p10, p20: percentileSorted(s, 0.2), p50, p90: percentileSorted(s, 0.9),
    mean: mean(s), std: std(s), prob: hit / n, ear: p50 - p10, cvar10: k > 0 ? cv / k : s[0],
    min: s[0], max: s[n - 1],
  };
}

export function probAtLeast(x: ArrayLike<number>, target: number): number {
  let hit = 0;
  for (let i = 0; i < x.length; i++) if (x[i] >= target) hit++;
  return hit / x.length;
}

/** Code court d'une famille de risque, pour l'affichage : « Macroéconomie » donne « macroeconomie ». */
export const familyCode = (f: string): string =>
  f.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'autre';

/** Familles de risque du registre, dans l'ordre de première apparition, avec leurs drivers. */
export function blocks(m: Model): { code: string; libelle: string; drivers: string[] }[] {
  const out: { code: string; libelle: string; drivers: string[] }[] = [];
  for (const x of [...m.hyps, ...m.events]) {
    const lib = x.famille?.trim() || 'Autres';
    let b = out.find((y) => y.libelle === lib);
    if (!b) out.push((b = { code: familyCode(lib), libelle: lib, drivers: [] }));
    b.drivers.push(x.code);
  }
  return out;
}

/**
 * Valeur représentative de chaque driver par itération : valeur tirée de l'hypothèse (cours moyen pour le change),
 * impact annualisé pour un événement (amplitude × mois restants / 12, ou amplitude / 12 sur un seul mois).
 */
export function driverValues(m: Model, d: Draws, code: string): Float64Array {
  const j = m.hypIndex.get(code);
  if (j !== undefined) return d.h[j];
  const k = m.eventIndex.get(code)!;
  const out = new Float64Array(d.n);
  const monthly = m.evMonthly[k];
  for (let i = 0; i < d.n; i++) {
    if (!d.occ[k][i]) continue;
    out[i] = monthly ? d.amp[k][i] / 12 : (d.amp[k][i] * (12 - d.month[k][i])) / 12;
  }
  return out;
}

export interface Contribution {
  code: string;
  /** Corrélation de rang avec l'EBITDA. */
  rho: number;
  /** Contribution relative : rho² ramené à 100 %. Classement descriptif, pas une décomposition de la variance. */
  part: number;
}

/**
 * Contribution relative (9.2) : carré de la corrélation de rang, ramené à 100 %.
 * Avec des hypothèses corrélées, ce n'est pas une décomposition de la variance : les parts se recouvrent.
 */
export function contributions(m: Model, d: Draws, annual: Float64Array): { items: Contribution[]; blocks: { code: string; libelle: string; part: number }[] } {
  const re = ranks(annual);
  const raw = m.codes.map((code) => {
    const rho = pearson(ranks(driverValues(m, d, code)), re);
    return { code, rho: Number.isFinite(rho) ? rho : 0, sq: Number.isFinite(rho) ? rho * rho : 0 };
  });
  const tot = raw.reduce((a, x) => a + x.sq, 0) || 1;
  const items = raw.map((x) => ({ code: x.code, rho: x.rho, part: x.sq / tot })).sort((a, b) => b.part - a.part);
  const fam = blocks(m).map((b) => ({
    code: b.code, libelle: b.libelle,
    part: items.filter((i) => b.drivers.includes(i.code)).reduce((a, x) => a + x.part, 0),
  }));
  return { items, blocks: fam };
}

export interface Effect {
  code: string;
  /** EBITDA (isolé) ou P50 conditionnel (total) côté P10 de l'hypothèse. */
  low: number;
  high: number;
}

/** Effet total : P50 de l'EBITDA quand l'hypothèse est dans les bandes P5-P15 puis P85-P95. */
export function totalEffects(m: Model, d: Draws, annual: Float64Array): Effect[] {
  const n = d.n;
  return m.hyps.map(({ code }) => {
    const v = driverValues(m, d, code);
    const r = ranks(v);
    const lo: number[] = [];
    const hi: number[] = [];
    for (let i = 0; i < n; i++) {
      const q = (r[i] - 0.5) / n;
      if (q >= 0.05 && q < 0.15) lo.push(annual[i]);
      else if (q >= 0.85 && q < 0.95) hi.push(annual[i]);
    }
    return { code, low: percentileSorted(sorted(lo), 0.5), high: percentileSorted(sorted(hi), 0.5) };
  });
}

/**
 * Effet isolé : EBITDA quand l'hypothèse seule passe de son P10 à son P90, les autres à leur P50,
 * change sur sa trajectoire médiane, sans bruit ni événement. Un événement est appliqué
 * à son amplitude moyenne, survenu en juillet.
 */
export function isolatedEffects(m: Model): { base: number; effects: Effect[] } {
  const base = p50Values(m);
  const fxMed = fxDeterministic(m);
  const evalAt = (vals: typeof base, fx: Float64Array, k?: number) => {
    const d = pointDraws(m, vals, fx);
    if (k !== undefined) {
      const e = m.events[k];
      d.occ[k][0] = 1;
      d.month[k][0] = 6;
      d.amp[k][0] = (e.amplitude[0] + e.amplitude[1]) / 2;
      if (e.surcout) d.cost[k][0] = (e.surcout[0] + e.surcout[1]) / 2;
    }
    return runPL(m, d, { noise: false, events: k !== undefined, effects: neutralEffects(m) }).annual[0];
  };
  const b0 = evalAt(base, fxMed);
  const effects: Effect[] = [];
  m.hyps.forEach((h, j) => {
    if (j === m.fxIndex) {
      const z = 1.2815515655446004;
      effects.push({ code: h.code, low: evalAt(base, fxDeterministic(m, -z)), high: evalAt(base, fxDeterministic(m, z)) });
      return;
    }
    const law = m.laws[j]!;
    effects.push({ code: h.code, low: evalAt({ ...base, [h.code]: law.p10 }, fxMed), high: evalAt({ ...base, [h.code]: law.p90 }, fxMed) });
  });
  m.events.forEach((ev, k) => effects.push({ code: ev.code, low: b0, high: evalAt(base, fxMed, k) }));
  return { base: b0, effects };
}

export interface EventEffect {
  code: string;
  freq: number;
  p50If: number;
  p50Else: number;
}

export function eventEffects(m: Model, d: Draws, annual: Float64Array): EventEffect[] {
  return m.events.map(({ code }, k) => {
    const yes: number[] = [];
    const no: number[] = [];
    for (let i = 0; i < d.n; i++) (d.occ[k][i] ? yes : no).push(annual[i]);
    return {
      code, freq: yes.length / d.n,
      p50If: yes.length ? percentileSorted(sorted(yes), 0.5) : NaN,
      p50Else: no.length ? percentileSorted(sorted(no), 0.5) : NaN,
    };
  });
}

export interface ProfileRow {
  code: string;
  /** Moyenne sur les itérations entre P5 et P15 de l'EBITDA. */
  p10Year: number;
  all: number;
}

/** Profil de l'année P10 : moyenne des hypothèses sur les itérations entre P5 et P15 (9.3). */
export function scenarioProfile(m: Model, d: Draws, annual: Float64Array, lo = 0.05, hi = 0.15): ProfileRow[] {
  const s = sorted(annual);
  const a = percentileSorted(s, lo);
  const b = percentileSorted(s, hi);
  const sel: number[] = [];
  for (let i = 0; i < d.n; i++) if (annual[i] >= a && annual[i] <= b) sel.push(i);
  return m.codes.map((code) => {
    const k = m.eventIndex.get(code);
    const v = k !== undefined ? d.occ[k] : driverValues(m, d, code);
    let s1 = 0;
    for (const i of sel) s1 += v[i];
    return { code, p10Year: s1 / sel.length, all: mean(v) };
  });
}

export interface FanPoint {
  mois: number;
  p10: number;
  p50: number;
  p90: number;
  budget: number;
}

/** Éventail de l'EBITDA cumulé, mois par mois. */
export function fanChart(pl: PLResult, budgetMonthly: number[]): FanPoint[] {
  const out: FanPoint[] = [];
  const cum = new Float64Array(pl.n);
  let bc = 0;
  for (let t = 0; t < 12; t++) {
    for (let i = 0; i < pl.n; i++) cum[i] += pl.monthly[i * 12 + t];
    bc += budgetMonthly[t];
    const s = sorted(cum);
    out.push({ mois: t + 1, p10: percentileSorted(s, 0.1), p50: percentileSorted(s, 0.5), p90: percentileSorted(s, 0.9), budget: bc });
  }
  return out;
}

export interface QuarterStats {
  trimestre: number;
  budget: number;
  p10: number;
  p50: number;
  p90: number;
  prob: number;
}

export function quarterly(pl: PLResult, budgetMonthly: number[]): QuarterStats[] {
  return [0, 1, 2, 3].map((q) => {
    const x = new Float64Array(pl.n);
    for (let i = 0; i < pl.n; i++) for (let t = 3 * q; t < 3 * q + 3; t++) x[i] += pl.monthly[i * 12 + t];
    const bud = budgetMonthly[3 * q] + budgetMonthly[3 * q + 1] + budgetMonthly[3 * q + 2];
    const s = sorted(x);
    return { trimestre: q + 1, budget: bud, p10: percentileSorted(s, 0.1), p50: percentileSorted(s, 0.5), p90: percentileSorted(s, 0.9), prob: probAtLeast(x, bud - 1e-9) };
  });
}

export interface BuStats {
  bu: string;
  budget: number;
  p10: number;
  p50: number;
  p90: number;
  prob: number;
}

/** Marge par BU : somme signée des postes de la BU (R-RI-04). */
export function byBu(m: Model, pl: PLResult): BuStats[] {
  const nb = m.nb;
  const bud = buBudget(m.budget);
  return m.budget.bu.map((bu, b) => {
    const x = new Float64Array(pl.n);
    for (let i = 0; i < pl.n; i++) x[i] = pl.buMargin![i * nb + b];
    const s = sorted(x);
    return { bu, budget: bud[b], p10: percentileSorted(s, 0.1), p50: percentileSorted(s, 0.5), p90: percentileSorted(s, 0.9), prob: probAtLeast(x, bud[b] - 1e-9) };
  });
}

/** Erreur-type d'un quantile estimée par lots (annexe E), 20 lots de N / 20 itérations. */
export function batchQuantileSE(x: ArrayLike<number>, p: number, batches = 20): number {
  const size = Math.floor(x.length / batches);
  const q: number[] = [];
  for (let b = 0; b < batches; b++) q.push(percentileSorted(sorted(Array.prototype.slice.call(x, b * size, (b + 1) * size)), p));
  return std(q) / Math.sqrt(batches);
}

/** Erreur-type d'une probabilité estimée par lots. */
export function batchProbSE(x: ArrayLike<number>, target: number, batches = 20): number {
  const size = Math.floor(x.length / batches);
  const q: number[] = [];
  for (let b = 0; b < batches; b++) q.push(probAtLeast(Array.prototype.slice.call(x, b * size, (b + 1) * size), target));
  return std(q) / Math.sqrt(batches);
}
