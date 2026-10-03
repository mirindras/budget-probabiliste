/** M6 : indicateurs, origine du risque, profils de scénarios (section 9). */
import { makeLaw } from './laws.ts';
import { neutralEffects } from './levers.ts';
import { runPL, type PLResult } from './pl.ts';
import { fxDeterministic, p50Values, pointDraws, type Draws, type SamplingContext } from './sampling.ts';
import { mean, percentileSorted, ranks, pearson, sorted, std } from './stats.ts';
import { DRIVER_CODES, HYP_CODES, type BudgetGrid, type DriverCode, type HypCode, type Registry } from './types.ts';

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

export const BLOCKS: { code: string; libelle: string; drivers: DriverCode[] }[] = [
  { code: 'macro', libelle: 'Macroéconomie', drivers: ['H06', 'H08', 'H09', 'H10', 'H12', 'E01'] },
  { code: 'commercial', libelle: 'Commercial', drivers: ['H01', 'H02', 'H03', 'H04', 'H05', 'H11', 'E02'] },
  { code: 'appro', libelle: 'Approvisionnement', drivers: ['H07', 'E03'] },
];

/** Valeur représentative de chaque driver par itération (H06 : cours moyen ; événement : impact annualisé). */
export function driverValues(d: Draws, code: DriverCode): Float64Array {
  if (code === 'H06') return d.fxMean;
  if (code.startsWith('H')) return d.h[code as Exclude<HypCode, 'H06'>];
  const ev = code as 'E01' | 'E02' | 'E03';
  const out = new Float64Array(d.n);
  for (let i = 0; i < d.n; i++) {
    if (!d.occ[ev][i]) continue;
    out[i] = ev === 'E03' ? d.amp[ev][i] : (d.amp[ev][i] * (12 - d.month[ev][i])) / 12;
  }
  return out;
}

export interface Contribution {
  code: DriverCode;
  /** Corrélation de rang avec l'EBITDA. */
  rho: number;
  /** Part de variance, normalisée à 100 %. */
  part: number;
}

/** Contribution à la variance : carré de la corrélation de rang, normalisé (9.2). */
export function contributions(d: Draws, annual: Float64Array): { items: Contribution[]; blocks: { code: string; libelle: string; part: number }[] } {
  const re = ranks(annual);
  const raw = DRIVER_CODES.map((code) => {
    const rho = pearson(ranks(driverValues(d, code)), re);
    return { code, rho, sq: rho * rho };
  });
  const tot = raw.reduce((a, x) => a + x.sq, 0) || 1;
  const items = raw.map((x) => ({ code: x.code, rho: x.rho, part: x.sq / tot })).sort((a, b) => b.part - a.part);
  const blocks = BLOCKS.map((b) => ({
    code: b.code, libelle: b.libelle,
    part: items.filter((i) => b.drivers.includes(i.code)).reduce((a, x) => a + x.part, 0),
  }));
  return { items, blocks };
}

export interface Effect {
  code: DriverCode;
  /** EBITDA (isolé) ou P50 conditionnel (total) côté P10 de l'hypothèse. */
  low: number;
  high: number;
}

/** Effet total : P50 de l'EBITDA quand l'hypothèse est dans les bandes P5-P15 puis P85-P95. */
export function totalEffects(d: Draws, annual: Float64Array): Effect[] {
  const n = d.n;
  return HYP_CODES.map((code) => {
    const v = driverValues(d, code);
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
export function isolatedEffects(budget: BudgetGrid, reg: Registry, ctx: SamplingContext): { base: number; effects: Effect[] } {
  const nb = budget.bu.length;
  const base = p50Values(ctx);
  const fxMed = fxDeterministic(ctx);
  const evalAt = (vals: typeof base, fx: Float64Array, ev?: 'E01' | 'E02' | 'E03') => {
    const d = pointDraws(nb, vals, fx);
    if (ev) {
      const e = ctx.events[ev];
      d.occ[ev][0] = 1;
      d.month[ev][0] = 6;
      d.amp[ev][0] = (e.amplitude[0] + e.amplitude[1]) / 2;
      if (ev === 'E03' && e.surcout) d.e03Cost[0] = (e.surcout[0] + e.surcout[1]) / 2;
    }
    return runPL(budget, d, { noise: false, events: !!ev, effects: neutralEffects() }).annual[0];
  };
  const b0 = evalAt(base, fxMed);
  const effects: Effect[] = [];
  for (const code of HYP_CODES) {
    if (code === 'H06') {
      const z = 1.2815515655446004;
      effects.push({ code, low: evalAt(base, fxDeterministic(ctx, -z)), high: evalAt(base, fxDeterministic(ctx, z)) });
      continue;
    }
    const law = makeLaw(reg.hypotheses.find((h) => h.code === code)!);
    effects.push({ code, low: evalAt({ ...base, [code]: law.p10 }, fxMed), high: evalAt({ ...base, [code]: law.p90 }, fxMed) });
  }
  for (const ev of ['E01', 'E02', 'E03'] as const) effects.push({ code: ev, low: b0, high: evalAt(base, fxMed, ev) });
  return { base: b0, effects };
}

export interface EventEffect {
  code: 'E01' | 'E02' | 'E03';
  freq: number;
  p50If: number;
  p50Else: number;
}

export function eventEffects(d: Draws, annual: Float64Array): EventEffect[] {
  return (['E01', 'E02', 'E03'] as const).map((code) => {
    const yes: number[] = [];
    const no: number[] = [];
    for (let i = 0; i < d.n; i++) (d.occ[code][i] ? yes : no).push(annual[i]);
    return {
      code, freq: yes.length / d.n,
      p50If: yes.length ? percentileSorted(sorted(yes), 0.5) : NaN,
      p50Else: percentileSorted(sorted(no), 0.5),
    };
  });
}

export interface ProfileRow {
  code: DriverCode;
  /** Moyenne sur les itérations entre P5 et P15 de l'EBITDA. */
  p10Year: number;
  all: number;
}

/** Profil de l'année P10 : moyenne des hypothèses sur les itérations entre P5 et P15 (9.3). */
export function scenarioProfile(d: Draws, annual: Float64Array, lo = 0.05, hi = 0.15): ProfileRow[] {
  const s = sorted(annual);
  const a = percentileSorted(s, lo);
  const b = percentileSorted(s, hi);
  const sel: number[] = [];
  for (let i = 0; i < d.n; i++) if (annual[i] >= a && annual[i] <= b) sel.push(i);
  return DRIVER_CODES.map((code) => {
    const v = code.startsWith('E') ? d.occ[code as 'E01'] : driverValues(d, code);
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

/** Marge brute par BU (R-RI-04). */
export function byBu(pl: PLResult, budget: BudgetGrid): BuStats[] {
  const nb = budget.bu.length;
  return budget.bu.map((bu, b) => {
    const x = new Float64Array(pl.n);
    for (let i = 0; i < pl.n; i++) x[i] = pl.buMargin![i * nb + b];
    let bud = 0;
    for (let t = 0; t < 12; t++) bud += budget.ca[b][t] - budget.cmImp[b][t] - budget.cmLoc[b][t];
    const s = sorted(x);
    return { bu, budget: bud, p10: percentileSorted(s, 0.1), p50: percentileSorted(s, 0.5), p90: percentileSorted(s, 0.9), prob: probAtLeast(x, bud - 1e-9) };
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
