/** Dynamiques mensuelles : bruit AR(1) recentré, marche aléatoire du change, sauts (section 6.2, annexe C). */
import type { Rng } from './rng.ts';
import { normInv } from './stats.ts';

export function gaussian(rng: Rng): number {
  return normInv(rng.uniform());
}

/**
 * Bruit AR(1) d'une trajectoire de 12 mois, à partir du mois `from` (0 = janvier) :
 * η(t) = φ η(t-1) + √(1-φ²) σ ε(t), premier mois tiré selon N(0, σ²).
 * Recentré si `weights` est fourni : Σ w(t) η̃(t) = 0 sur les mois simulés.
 */
export function ar1(rng: Rng, phi: number, sigma: number, out: Float64Array, offset: number, from = 0, weights?: ArrayLike<number>): void {
  const c = Math.sqrt(1 - phi * phi) * sigma;
  let prev = 0;
  for (let t = 0; t < 12; t++) {
    if (t < from) {
      out[offset + t] = 0;
      continue;
    }
    const e = gaussian(rng);
    prev = t === from ? sigma * e : phi * prev + c * e;
    out[offset + t] = prev;
  }
  if (weights) {
    let m = 0;
    let ws = 0;
    for (let t = from; t < 12; t++) {
      m += weights[t] * out[offset + t];
      ws += weights[t];
    }
    m /= ws;
    for (let t = from; t < 12; t++) out[offset + t] -= m;
  }
}

/** Multiplicateur de l'écart-type annuel dû à la persistance φ (annexe C). */
export function persistenceMultiplier(phi: number, months = 12): number {
  let s = months;
  for (let k = 1; k < months; k++) s += 2 * (months - k) * phi ** k;
  return Math.sqrt(s / months);
}

/** Poids normalisés ŵ des chocs mensuels sur le cours moyen des mois `from` à 11. */
export function fxWeights(from = 0): Float64Array {
  const w = new Float64Array(12);
  let norm = 0;
  for (let t = from; t < 12; t++) {
    w[t] = 12 - t; // le choc du mois t pèse sur les mois t à 11
    norm += w[t] * w[t];
  }
  norm = Math.sqrt(norm);
  for (let t = from; t < 12; t++) w[t] /= norm;
  return w;
}

/**
 * Trajectoire du change conditionnelle au choc annuel z (annexe D, point 5) :
 * ε = z ŵ + (η - (ηᵀŵ) ŵ), puis ln S(t) = ln S(from) + μ (t - from) + σ Σ ε.
 * `eta` est null pour la trajectoire déterministe (chocs orthogonaux nuls).
 */
export function fxPath(
  z: number,
  eta: Float64Array | null,
  start: number,
  driftAnnual: number,
  volMonthly: number,
  out: Float64Array,
  offset: number,
  from = 0,
  w: Float64Array = fxWeights(from),
): void {
  let proj = 0;
  if (eta) for (let t = from; t < 12; t++) proj += eta[t] * w[t];
  const mu = driftAnnual / 12;
  let ln = Math.log(start);
  for (let t = from; t < 12; t++) {
    const eps = z * w[t] + (eta ? eta[t] - proj * w[t] : 0);
    ln += mu + volMonthly * eps;
    out[offset + t] = Math.exp(ln);
  }
}
