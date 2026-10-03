/** Lois et fonctions quantiles (section 5.3, annexe B). */
import { Z90, betaInc, betaInv, normCdf } from './stats.ts';
import type { Hypothesis, LawKind } from './types.ts';

export interface Law {
  kind: LawKind;
  /** Fourchette effective, après élargissement par k (R-HY-03). */
  p10: number;
  p50: number;
  p90: number;
  /** Valeur pour un z normal centré réduit. */
  quantile(z: number): number;
  /** Fonction de répartition. */
  cdf(x: number): number;
  /** Espérance. */
  mean: number;
}

/** Indice d'asymétrie A = (P90 - P50) / (P50 - P10). */
export function asymmetry(p10: number, p50: number, p90: number): number {
  return (p90 - p50) / (p50 - p10);
}

/** Choix de la loi : première règle de la table 5.3 qui correspond. */
export function chooseLaw(h: Hypothesis): LawKind {
  if (h.depart !== undefined) return 'marche-aleatoire';
  if (h.min !== undefined && h.max !== undefined) return 'pert';
  if (h.p50 === null || h.p50 === undefined) return 'lognormale';
  const a = asymmetry(h.p10!, h.p50, h.p90!);
  if (a >= 0.9 && a <= 1.1) return 'normale';
  return 'split-normale';
}

/** Élargissement des bornes autour du P50 (R-HY-03). */
export function widen(p10: number, p50: number, p90: number, k: number): [number, number] {
  return [p50 - k * (p50 - p10), p50 + k * (p90 - p50)];
}

export function makeLaw(h: Hypothesis, applyK = true): Law {
  const kind = chooseLaw(h);
  const k = applyK ? (h.k ?? 1) : 1;
  switch (kind) {
    case 'normale': {
      const [p10, p90] = widen(h.p10!, h.p50!, h.p90!, k);
      const mu = h.p50!;
      const s = (p90 - p10) / (2 * Z90);
      return { kind, p10, p50: mu, p90, mean: mu, quantile: (z) => mu + s * z, cdf: (x) => normCdf((x - mu) / s) };
    }
    case 'split-normale': {
      const p50 = h.p50!;
      const [p10, p90] = widen(h.p10!, p50, h.p90!, k);
      const sg = (p50 - p10) / Z90;
      const sd = (p90 - p50) / Z90;
      return {
        kind, p10, p50, p90,
        mean: p50 + (sd - sg) / Math.sqrt(2 * Math.PI),
        quantile: (z) => (z < 0 ? p50 + sg * z : p50 + sd * z),
        cdf: (x) => (x < p50 ? normCdf((x - p50) / sg) : normCdf((x - p50) / sd)),
      };
    }
    case 'lognormale': {
      const med0 = Math.sqrt(h.p10! * h.p90!);
      const [p10, p90] = widen(h.p10!, med0, h.p90!, k);
      const med = Math.sqrt(p10 * p90);
      const s = Math.log(p90 / p10) / (2 * Z90);
      const lm = Math.log(med);
      return {
        kind, p10, p50: med, p90,
        mean: med * Math.exp((s * s) / 2),
        quantile: (z) => med * Math.exp(s * z),
        cdf: (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - lm) / s)),
      };
    }
    case 'pert': {
      const a = h.min!;
      const b = h.max!;
      const m = h.p50!;
      const al = 1 + (4 * (m - a)) / (b - a);
      const be = 1 + (4 * (b - m)) / (b - a);
      const q = (u: number) => a + (b - a) * betaInv(u, al, be);
      return {
        kind, p10: q(0.1), p50: q(0.5), p90: q(0.9),
        mean: (a + 4 * m + b) / 6,
        quantile: (z) => q(normCdf(z)),
        cdf: (x) => betaInc((x - a) / (b - a), al, be),
      };
    }
    default:
      throw new Error(`Loi ${kind} : pas de fonction quantile directe pour ${h.code}`);
  }
}

/** Contrôle R-HY-01 : P10 < P50 < P90 strictement (ou bornes PERT cohérentes). */
export function validateHypothesis(h: Hypothesis): string[] {
  const errors: string[] = [];
  if (!h.proprietaire?.trim()) errors.push(`${h.code} : propriétaire manquant (principe 3)`);
  if (!h.justification?.trim()) errors.push(`${h.code} : justification manquante (principe 3)`);
  const kind = chooseLaw(h);
  if (kind === 'marche-aleatoire') {
    if (!(h.depart! > 0)) errors.push(`${h.code} : cours de départ non positif`);
    if (!(h.volatilite_mensuelle! > 0)) errors.push(`${h.code} : volatilité non positive`);
    return errors;
  }
  if (kind === 'pert') {
    if (!(h.min! < h.p50! && h.p50! < h.max!)) errors.push(`${h.code} : minimum < mode < maximum non respecté`);
    return errors;
  }
  if (kind === 'lognormale') {
    if (!(h.p10! > 0 && h.p10! < h.p90!)) errors.push(`${h.code} : 0 < P10 < P90 non respecté (R-HY-01)`);
    return errors;
  }
  if (!(h.p10! < h.p50! && h.p50! < h.p90!)) errors.push(`${h.code} : P10 < P50 < P90 non respecté (R-HY-01)`);
  return errors;
}
