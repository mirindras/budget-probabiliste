/** M4 : hypercube latin, copule gaussienne, trajectoires mensuelles, événements (section 7.2). */
import { setupCopula, type CopulaSetup } from './copula.ts';
import { ar1, fxPath, fxWeights, gaussian } from './dynamics.ts';
import { makeLaw, type Law } from './laws.ts';
import { Rng, subSeed } from './rng.ts';
import { normCdf, normInv } from './stats.ts';
import {
  DRIVER_CODES, EVENT_CODES, HYP_CODES,
  type Actuals, type BudgetGrid, type EventCode, type HypCode, type Hypothesis, type Registry, type RiskEvent,
} from './types.ts';

const ND = DRIVER_CODES.length;

export interface Draws {
  n: number;
  nb: number;
  /** Normales corrélées, n × 15, ordre DRIVER_CODES. */
  z: Float64Array;
  /** Valeurs tirées des hypothèses continues (sauf H06). */
  h: Record<Exclude<HypCode, 'H06'>, Float64Array>;
  /** Cours EUR/MGA, n × 12. */
  fx: Float64Array;
  /** Cours moyen de l'année, n. */
  fxMean: Float64Array;
  occ: Record<EventCode, Uint8Array>;
  /** Mois de survenance, 0 = janvier. */
  month: Record<EventCode, Uint8Array>;
  amp: Record<EventCode, Float64Array>;
  e03Cost: Float64Array;
  /** Bruit mensuel recentré des volumes, n × nb × 12. */
  noise: Float64Array;
  moisClos: number;
}

export interface SamplingContext {
  laws: Partial<Record<HypCode, Law>>;
  fx: { depart: number; derive: number; vol: number };
  events: Record<EventCode, RiskEvent>;
  copula: CopulaSetup;
  phi: number;
  sigma: number;
}

export function hyp(reg: Registry, code: HypCode): Hypothesis {
  const h = reg.hypotheses.find((x) => x.code === code);
  if (!h) throw new Error(`Hypothèse ${code} absente du registre`);
  return h;
}

export function event(reg: Registry, code: EventCode): RiskEvent {
  const e = reg.evenements.find((x) => x.code === code);
  if (!e) throw new Error(`Événement ${code} absent du registre`);
  return e;
}

export function samplingContext(reg: Registry): SamplingContext {
  const laws: SamplingContext['laws'] = {};
  for (const code of HYP_CODES) if (code !== 'H06') laws[code] = makeLaw(hyp(reg, code));
  const h6 = hyp(reg, 'H06');
  const k6 = h6.k ?? 1;
  return {
    laws,
    fx: { depart: h6.depart!, derive: h6.derive_annuelle!, vol: h6.volatilite_mensuelle! * k6 },
    events: { E01: event(reg, 'E01'), E02: event(reg, 'E02'), E03: event(reg, 'E03') },
    copula: setupCopula(reg.correlations_rang),
    phi: reg.bruit_volumes.phi,
    sigma: reg.bruit_volumes.sigma_mensuel,
  };
}

/** Saisonnalité budgétée de chaque BU (part du mois dans le CA annuel). */
export function seasonality(budget: BudgetGrid): number[][] {
  return budget.ca.map((row) => {
    const s = row.reduce((a, x) => a + x, 0);
    return row.map((x) => x / s);
  });
}

/** Uniformes en hypercube latin : n × d, une permutation par colonne (annexe D, point 1). */
export function latinHypercube(rng: Rng, n: number, d: number): Float64Array {
  const u = new Float64Array(n * d);
  for (let j = 0; j < d; j++) {
    const perm = rng.permutation(n);
    for (let i = 0; i < n; i++) u[i * d + j] = (perm[i] + rng.uniform()) / n;
  }
  return u;
}

export interface DrawOptions {
  n: number;
  graine: number;
  moisClos?: number;
  /** Cours du dernier mois clos (mode atterrissage). */
  dernierCours?: number;
  /** Tirage simple au lieu de l'hypercube latin (mesures de convergence). */
  simple?: boolean;
}

export function drawAll(reg: Registry, budget: BudgetGrid, opt: DrawOptions, ctx = samplingContext(reg)): Draws {
  const { n, graine } = opt;
  const m = opt.moisClos ?? 0;
  const nb = budget.bu.length;
  const rngLhs = new Rng(subSeed(graine, 1));
  const rngFx = new Rng(subSeed(graine, 2));
  const rngEv = new Rng(subSeed(graine, 3));
  const rngNoise = new Rng(subSeed(graine, 4));

  // 1-2. Uniformes stratifiées puis normales.
  let u: Float64Array;
  if (opt.simple) {
    u = new Float64Array(n * ND);
    for (let i = 0; i < u.length; i++) u[i] = rngLhs.uniform();
  } else {
    u = latinHypercube(rngLhs, n, ND);
  }
  // 3. Corrélation par Cholesky : Zc = Z Lᵀ.
  const L = ctx.copula.cholesky;
  const z = new Float64Array(n * ND);
  const zi = new Float64Array(ND);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < ND; j++) zi[j] = normInv(u[i * ND + j]);
    for (let r = 0; r < ND; r++) {
      let s = 0;
      const lr = L[r];
      for (let c = 0; c <= r; c++) s += lr[c] * zi[c];
      z[i * ND + r] = s;
    }
  }

  // 4. Fonctions quantiles.
  const h = {} as Draws['h'];
  for (let j = 0; j < HYP_CODES.length; j++) {
    const code = HYP_CODES[j];
    if (code === 'H06') continue;
    const law = ctx.laws[code]!;
    const col = new Float64Array(n);
    for (let i = 0; i < n; i++) col[i] = law.quantile(z[i * ND + j]);
    h[code] = col;
  }

  // 5. Change : choc annuel réparti en chocs mensuels conditionnels.
  const j6 = HYP_CODES.indexOf('H06');
  const fx = new Float64Array(n * 12);
  const fxMean = new Float64Array(n);
  const w = fxWeights(m);
  const eta = new Float64Array(12);
  const start = m > 0 && opt.dernierCours ? opt.dernierCours : ctx.fx.depart;
  for (let i = 0; i < n; i++) {
    for (let t = m; t < 12; t++) eta[t] = gaussian(rngFx);
    fxPath(z[i * ND + j6], eta, start, ctx.fx.derive, ctx.fx.vol, fx, i * 12, m, w);
    let s = 0;
    for (let t = m; t < 12; t++) s += fx[i * 12 + t];
    fxMean[i] = s / (12 - m);
  }

  // 6. Événements : survenance si Φ(Z) > 1 - p ; date et amplitude uniformes.
  const occ = {} as Draws['occ'];
  const month = {} as Draws['month'];
  const amp = {} as Draws['amp'];
  const e03Cost = new Float64Array(n);
  const remaining = (12 - m) / 12;
  for (let k = 0; k < EVENT_CODES.length; k++) {
    const code = EVENT_CODES[k];
    const ev = ctx.events[code];
    const p = ev.p * remaining;
    const col = HYP_CODES.length + k;
    const o = new Uint8Array(n);
    const mo = new Uint8Array(n);
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      o[i] = normCdf(z[i * ND + col]) > 1 - p ? 1 : 0;
      mo[i] = rngEv.int(m, 11);
      a[i] = ev.amplitude[0] + (ev.amplitude[1] - ev.amplitude[0]) * rngEv.uniform();
      if (code === 'E03') {
        const c = ev.surcout ?? [0, 0];
        e03Cost[i] = c[0] + (c[1] - c[0]) * rngEv.uniform();
      }
    }
    occ[code] = o;
    month[code] = mo;
    amp[code] = a;
  }

  // 7. Bruit AR(1) recentré des volumes.
  const seas = seasonality(budget);
  const noise = new Float64Array(n * nb * 12);
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < nb; b++) ar1(rngNoise, ctx.phi, ctx.sigma, noise, (i * nb + b) * 12, m, seas[b]);
  }

  return { n, nb, z, h, fx, fxMean, occ, month, amp, e03Cost, noise, moisClos: m };
}

/** Tirage ponctuel sans aléa : valeurs imposées, change sur une trajectoire donnée. */
export function pointDraws(nb: number, values: Record<Exclude<HypCode, 'H06'>, number>, fxMonthly: ArrayLike<number>): Draws {
  const one = (v: number) => Float64Array.of(v);
  const h = {} as Draws['h'];
  for (const code of HYP_CODES) if (code !== 'H06') h[code] = one(values[code]);
  const fx = Float64Array.from(fxMonthly);
  const zeros = () => new Uint8Array(1);
  return {
    n: 1, nb, z: new Float64Array(ND), h, fx, fxMean: one(fx.reduce((a, x) => a + x, 0) / 12),
    occ: { E01: zeros(), E02: zeros(), E03: zeros() },
    month: { E01: zeros(), E02: zeros(), E03: zeros() },
    amp: { E01: one(0), E02: one(0), E03: one(0) },
    e03Cost: one(0), noise: new Float64Array(nb * 12), moisClos: 0,
  };
}

/** Trajectoire médiane du change (chocs nuls) ou à un z annuel donné. */
export function fxDeterministic(ctx: SamplingContext, z = 0, start = ctx.fx.depart): Float64Array {
  const out = new Float64Array(12);
  fxPath(z, null, start, ctx.fx.derive, ctx.fx.vol, out, 0, 0);
  return out;
}

/** Les hypothèses au budget (facteur 1, mix nul). */
export function budgetValues(): Record<Exclude<HypCode, 'H06'>, number> {
  const v = {} as Record<Exclude<HypCode, 'H06'>, number>;
  for (const c of HYP_CODES) if (c !== 'H06') v[c] = c === 'H05' ? 0 : 1;
  return v;
}

/** Les hypothèses à leur P50. */
export function p50Values(ctx: SamplingContext): Record<Exclude<HypCode, 'H06'>, number> {
  const v = {} as Record<Exclude<HypCode, 'H06'>, number>;
  for (const c of HYP_CODES) if (c !== 'H06') v[c] = ctx.laws[c]!.p50;
  return v;
}

export type { Actuals };
