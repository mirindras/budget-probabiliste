/** Corrélations de rang, conversion pour la copule gaussienne, Cholesky, correction de Higham (section 6.1, annexe D). */
import { DRIVER_CODES, type Correlation } from './types.ts';

export type Matrix = number[][];

/** Corrélation de rang (Spearman) vers corrélation de la copule gaussienne. */
export function rankToCopula(rhoS: number): number {
  return 2 * Math.sin((Math.PI * rhoS) / 6);
}

export function copulaToRank(rho: number): number {
  return (6 / Math.PI) * Math.asin(rho / 2);
}

export function identity(d: number): Matrix {
  return Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0)));
}

/** Matrice cible des corrélations de rang, dans l'ordre DRIVER_CODES. */
export function rankMatrix(corr: Correlation[]): Matrix {
  const ix = new Map<string, number>(DRIVER_CODES.map((c, i) => [c, i]));
  const r = identity(DRIVER_CODES.length);
  for (const [a, b, v] of corr) {
    const i = ix.get(a);
    const j = ix.get(b);
    if (i === undefined || j === undefined || i === j) continue;
    r[i][j] = r[j][i] = v;
  }
  return r;
}

/** Règle R-DE-01 : symétrie, diagonale à 1, valeurs hors diagonale entre -0,9 et +0,9. */
export function checkMatrixRules(corr: Correlation[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const codes = new Set<string>(DRIVER_CODES);
  for (const [a, b, v] of corr) {
    if (!codes.has(a) || !codes.has(b)) errors.push(`Corrélation ${a} / ${b} : code inconnu`);
    if (a === b) errors.push(`Corrélation ${a} / ${b} : diagonale imposée à 1`);
    if (!(v >= -0.9 && v <= 0.9)) errors.push(`Corrélation ${a} / ${b} : ${v} hors de [-0,9 ; +0,9] (R-DE-01)`);
    const key = [a, b].sort().join('/');
    if (seen.has(key)) errors.push(`Corrélation ${a} / ${b} saisie deux fois`);
    seen.add(key);
  }
  return errors;
}

/** Valeurs et vecteurs propres d'une matrice symétrique (méthode de Jacobi). */
export function eigenSym(m: Matrix): { values: number[]; vectors: Matrix } {
  const n = m.length;
  const a = m.map((r) => [...r]);
  const v = identity(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

export function minEigen(m: Matrix): number {
  return Math.min(...eigenSym(m).values);
}

function projectPsd(m: Matrix, floor: number): Matrix {
  const { values, vectors } = eigenSym(m);
  const n = m.length;
  const out: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k++) {
    const l = Math.max(values[k], floor);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] += l * vectors[i][k] * vectors[j][k];
  }
  return out;
}

/**
 * Matrice de corrélation la plus proche (Higham, 2002) : projections alternées
 * avec correction de Dykstra, puis plancher strictement positif pour Cholesky.
 */
export function nearestCorrelation(m: Matrix, floor = 1e-6, iterations = 200): Matrix {
  const n = m.length;
  let y = m.map((r) => [...r]);
  let ds: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  let x = y;
  for (let it = 0; it < iterations; it++) {
    const r = y.map((row, i) => row.map((v, j) => v - ds[i][j]));
    x = projectPsd(r, 0);
    ds = x.map((row, i) => row.map((v, j) => v - r[i][j]));
    const prev = y;
    y = x.map((row, i) => row.map((v, j) => (i === j ? 1 : v)));
    let diff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) diff = Math.max(diff, Math.abs(y[i][j] - prev[i][j]));
    if (diff < 1e-10) break;
  }
  // Plancher sur les valeurs propres puis remise de la diagonale à 1.
  const p = projectPsd(y, floor);
  const d = p.map((r, i) => Math.sqrt(r[i]));
  return p.map((row, i) => row.map((v, j) => (i === j ? 1 : v / (d[i] * d[j]))));
}

/** Décomposition de Cholesky R = L Lᵀ (renvoie null si R n'est pas définie positive). */
export function cholesky(m: Matrix): Matrix | null {
  const n = m.length;
  const l: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        l[i][i] = Math.sqrt(s);
      } else {
        l[i][j] = s / l[j][j];
      }
    }
  }
  return l;
}

export interface CopulaSetup {
  /** Cible en rang (saisie). */
  rank: Matrix;
  /** Matrice de la copule effectivement utilisée (corrigée si besoin). */
  copula: Matrix;
  cholesky: Matrix;
  minEigenBefore: number;
  minEigenAfter: number;
  corrected: boolean;
  /** Paires déplacées de plus de 0,05 en rang par la correction (R-DE-02). */
  moved: { a: string; b: string; avant: number; apres: number }[];
}

export function setupCopula(corr: Correlation[]): CopulaSetup {
  const rank = rankMatrix(corr);
  const cop = rank.map((r, i) => r.map((v, j) => (i === j ? 1 : rankToCopula(v))));
  const minBefore = minEigen(cop);
  let used = cop;
  let corrected = false;
  const moved: CopulaSetup['moved'] = [];
  let chol = minBefore > 1e-9 ? cholesky(cop) : null;
  if (!chol) {
    used = nearestCorrelation(cop);
    corrected = true;
    chol = cholesky(used)!;
    for (let i = 0; i < cop.length; i++) {
      for (let j = i + 1; j < cop.length; j++) {
        const after = copulaToRank(used[i][j]);
        if (Math.abs(after - rank[i][j]) > 0.05) moved.push({ a: DRIVER_CODES[i], b: DRIVER_CODES[j], avant: rank[i][j], apres: after });
      }
    }
  }
  return { rank, copula: used, cholesky: chol, minEigenBefore: minBefore, minEigenAfter: minEigen(used), corrected, moved };
}
