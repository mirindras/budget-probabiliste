/** M4 : hypercube latin, copule gaussienne, trajectoires mensuelles, événements (section 7.2). */
import { ar1, fxPath, fxWeights, gaussian } from './dynamics.ts';
import type { Model } from './model.ts';
import { Rng, subSeed } from './rng.ts';
import { normCdf, normInv } from './stats.ts';
import type { Actuals } from './types.ts';

export interface Draws {
  n: number;
  nb: number;
  nd: number;
  /** Normales corrélées, n × nd, dans l'ordre des drivers du modèle. */
  z: Float64Array;
  /** Valeurs tirées de chaque hypothèse, n ; pour le change, le cours moyen de l'année. */
  h: Float64Array[];
  /** Cours mensuels, n × 12 (vide sans change). */
  fx: Float64Array;
  /** Cours moyen de l'année, n (vide sans change). */
  fxMean: Float64Array;
  /** Par événement : survenance, mois (0 = janvier), amplitude, surcoût. */
  occ: Uint8Array[];
  month: Uint8Array[];
  amp: Float64Array[];
  cost: Float64Array[];
  /** Bruit mensuel recentré des volumes, n × nb × 12. */
  noise: Float64Array;
  moisClos: number;
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

export function drawAll(m: Model, opt: DrawOptions): Draws {
  const { n, graine } = opt;
  const mc = opt.moisClos ?? 0;
  const { nb, nd, nh, ne } = m;
  const rngLhs = new Rng(subSeed(graine, 1));
  const rngFx = new Rng(subSeed(graine, 2));
  const rngEv = new Rng(subSeed(graine, 3));
  const rngNoise = new Rng(subSeed(graine, 4));

  // 1-2. Uniformes stratifiées puis normales.
  let u: Float64Array;
  if (opt.simple) {
    u = new Float64Array(n * nd);
    for (let i = 0; i < u.length; i++) u[i] = rngLhs.uniform();
  } else {
    u = latinHypercube(rngLhs, n, nd);
  }
  // 3. Corrélation par Cholesky : Zc = Z Lᵀ.
  const L = m.copula.cholesky;
  const z = new Float64Array(n * nd);
  const zi = new Float64Array(nd);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < nd; j++) zi[j] = normInv(u[i * nd + j]);
    for (let r = 0; r < nd; r++) {
      let s = 0;
      const lr = L[r];
      for (let c = 0; c <= r; c++) s += lr[c] * zi[c];
      z[i * nd + r] = s;
    }
  }

  // 4. Fonctions quantiles.
  const h: Float64Array[] = [];
  for (let j = 0; j < nh; j++) {
    const law = m.laws[j];
    const col = new Float64Array(n);
    if (law) for (let i = 0; i < n; i++) col[i] = law.quantile(z[i * nd + j]);
    h.push(col);
  }

  // 5. Change : choc annuel réparti en chocs mensuels conditionnels.
  let fx = new Float64Array(0);
  let fxMean = new Float64Array(0);
  if (m.fx && m.fxIndex >= 0) {
    const jf = m.fxIndex;
    fx = new Float64Array(n * 12);
    fxMean = new Float64Array(n);
    const w = fxWeights(mc);
    const eta = new Float64Array(12);
    const start = mc > 0 && opt.dernierCours ? opt.dernierCours : m.fx.depart;
    for (let i = 0; i < n; i++) {
      for (let t = mc; t < 12; t++) eta[t] = gaussian(rngFx);
      fxPath(z[i * nd + jf], eta, start, m.fx.derive, m.fx.vol, fx, i * 12, mc, w);
      let s = 0;
      for (let t = mc; t < 12; t++) s += fx[i * 12 + t];
      fxMean[i] = s / (12 - mc);
    }
    h[jf] = fxMean;
  }

  // 6. Événements : survenance si Φ(Z) > 1 - p ; date et amplitude uniformes, surcoût uniforme s'il y en a un.
  const occ: Uint8Array[] = [];
  const month: Uint8Array[] = [];
  const amp: Float64Array[] = [];
  const cost: Float64Array[] = [];
  const remaining = (12 - mc) / 12;
  for (let k = 0; k < ne; k++) {
    const ev = m.events[k];
    const p = ev.p * remaining;
    const col = nh + k;
    const o = new Uint8Array(n);
    const mo = new Uint8Array(n);
    const a = new Float64Array(n);
    const c = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      o[i] = normCdf(z[i * nd + col]) > 1 - p ? 1 : 0;
      mo[i] = rngEv.int(mc, 11);
      a[i] = ev.amplitude[0] + (ev.amplitude[1] - ev.amplitude[0]) * rngEv.uniform();
      if (ev.surcout) c[i] = ev.surcout[0] + (ev.surcout[1] - ev.surcout[0]) * rngEv.uniform();
    }
    occ.push(o);
    month.push(mo);
    amp.push(a);
    cost.push(c);
  }

  // 7. Bruit AR(1) recentré des volumes.
  const noise = new Float64Array(n * nb * 12);
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < nb; b++) ar1(rngNoise, m.phi, m.sigma, noise, (i * nb + b) * 12, mc, m.seas[b]);
  }

  return { n, nb, nd, z, h, fx, fxMean, occ, month, amp, cost, noise, moisClos: mc };
}

/** Tirage ponctuel sans aléa : valeurs imposées par code d'hypothèse, change sur une trajectoire donnée. */
export function pointDraws(m: Model, values: Record<string, number>, fxMonthly: ArrayLike<number>): Draws {
  const one = (v: number) => Float64Array.of(v);
  const fx = m.fxIndex >= 0 ? Float64Array.from(fxMonthly) : new Float64Array(0);
  const fxMean = m.fxIndex >= 0 ? one(fx.reduce((a, x) => a + x, 0) / 12) : new Float64Array(0);
  const h = m.hyps.map((x, j) => (j === m.fxIndex ? fxMean : one(values[x.code] ?? NaN)));
  return {
    n: 1, nb: m.nb, nd: m.nd, z: new Float64Array(m.nd), h, fx, fxMean,
    occ: m.events.map(() => new Uint8Array(1)),
    month: m.events.map(() => new Uint8Array(1)),
    amp: m.events.map(() => one(0)),
    cost: m.events.map(() => one(0)),
    noise: new Float64Array(m.nb * 12), moisClos: 0,
  };
}

/** Trajectoire médiane du change (chocs nuls) ou à un z annuel donné. */
export function fxDeterministic(m: Model, z = 0, start = m.fx?.depart ?? m.coursBudget): Float64Array {
  const out = new Float64Array(12);
  if (!m.fx) return out.fill(m.coursBudget);
  fxPath(z, null, start, m.fx.derive, m.fx.vol, out, 0, 0);
  return out;
}

/** Les hypothèses au budget : facteurs à 1, points de marge à 0. */
export function budgetValues(m: Model): Record<string, number> {
  const v: Record<string, number> = {};
  for (const h of m.hyps) if (h.effet !== 'change') v[h.code] = h.effet === 'marge' ? 0 : 1;
  return v;
}

/** Les hypothèses à leur P50. */
export function p50Values(m: Model): Record<string, number> {
  const v: Record<string, number> = {};
  m.hyps.forEach((h, j) => {
    if (m.laws[j]) v[h.code] = m.laws[j]!.p50;
  });
  return v;
}

/** Saisonnalité budgétée de chaque BU (part du mois dans le CA annuel). */
export function seasonality(m: Model): number[][] {
  return m.seas.map((s) => Array.from(s));
}

export type { Actuals };
