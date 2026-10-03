import { describe, expect, test } from 'vitest';
import { alfaBudget, alfaRegistry } from '../../src/engine/alfa.ts';
import {
  checkMatrixRules, cholesky, copulaToRank, eigenSym, identity, minEigen, nearestCorrelation, rankMatrix, rankToCopula, setupCopula,
} from '../../src/engine/copula.ts';
import { ar1, fxPath, fxWeights, persistenceMultiplier } from '../../src/engine/dynamics.ts';
import { Rng } from '../../src/engine/rng.ts';
import { drawAll, latinHypercube, seasonality } from '../../src/engine/sampling.ts';
import { normInv, percentile, spearman, std } from '../../src/engine/stats.ts';
import type { Correlation, Registry } from '../../src/engine/types.ts';

describe('corrélations de rang et copule (annexe D)', () => {
  test('table de conversion rang → copule', () => {
    const t: [number, number][] = [[0.2, 0.209], [0.3, 0.313], [0.4, 0.416], [0.5, 0.518], [0.6, 0.618], [0.7, 0.717]];
    for (const [s, c] of t) expect(rankToCopula(s)).toBeCloseTo(c, 3);
    expect(copulaToRank(rankToCopula(0.37))).toBeCloseTo(0.37, 12);
  });
  test('R-DE-02 : matrice ALFA semi-définie positive, plus petite valeur propre 0,227', () => {
    const c = setupCopula(alfaRegistry().correlations_rang);
    expect(c.corrected).toBe(false);
    expect(c.minEigenBefore).toBeCloseTo(0.227, 3);
    const L = c.cholesky;
    for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) {
      let s = 0;
      for (let k = 0; k < 15; k++) s += L[i][k] * L[j][k];
      expect(s).toBeCloseTo(c.copula[i][j], 12);
    }
  });
  test('TC05 : deux hypothèses, cible +0,5 : corrélation de rang 0,50 à ±0,02', () => {
    const reg = alfaRegistry();
    reg.correlations_rang = [['H01', 'H03', 0.5]];
    const d = drawAll(reg, alfaBudget(), { n: 10000, graine: 5 });
    expect(Math.abs(spearman(d.h.H01, d.h.H03) - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(spearman(d.h.H01, d.h.H02))).toBeLessThan(0.03);
  });
  test('TC06 : matrice incohérente corrigée (Higham), alerte et paires déplacées listées', () => {
    const bad: Correlation[] = [['H01', 'H02', 0.9], ['H02', 'H03', 0.9], ['H01', 'H03', -0.9]];
    const c = setupCopula(bad);
    expect(c.minEigenBefore).toBeLessThan(0);
    expect(c.corrected).toBe(true);
    expect(c.minEigenAfter).toBeGreaterThan(0);
    expect(c.moved.length).toBeGreaterThan(0);
    expect(c.moved.map((m) => `${m.a}/${m.b}`)).toContain('H01/H03');
    for (let i = 0; i < 15; i++) expect(c.copula[i][i]).toBeCloseTo(1, 12);
    expect(cholesky([[1, 2], [2, 1]])).toBeNull();
  });
  test('Higham ne modifie pas une matrice déjà valide', () => {
    const m = [[1, 0.3], [0.3, 1]];
    const n = nearestCorrelation(m);
    expect(n[0][1]).toBeCloseTo(0.3, 5);
    expect(minEigen(identity(3))).toBeCloseTo(1, 12);
    const e = eigenSym([[2, 1], [1, 2]]).values.sort();
    expect(e[0]).toBeCloseTo(1, 10);
    expect(e[1]).toBeCloseTo(3, 10);
  });
  test('R-DE-01 : règles de saisie de la matrice', () => {
    expect(checkMatrixRules(alfaRegistry().correlations_rang)).toEqual([]);
    const errs = checkMatrixRules([['H01', 'H01', 0.2], ['H01', 'H02', 0.95], ['H02', 'H01', 0.1], ['X9' as never, 'H02', 0.1]]);
    expect(errs.length).toBe(4);
    expect(rankMatrix([['H01', 'H02', 0.4]])[0][1]).toBe(0.4);
  });
});

describe('dynamiques mensuelles (annexe C)', () => {
  test('multiplicateur de persistance', () => {
    expect(persistenceMultiplier(0)).toBeCloseTo(1, 12);
    expect(persistenceMultiplier(0.5)).toBeCloseTo(1.63, 2);
    expect(persistenceMultiplier(0.8)).toBeCloseTo(2.43, 2);
    expect(persistenceMultiplier(0.9)).toBeCloseTo(2.87, 2);
    expect(persistenceMultiplier(1)).toBeCloseTo(3.46, 2);
  });
  test('TC07 : φ = 0,8 non recentré, écart-type annuel 2,43 fois celui de φ = 0, à ±3 %', () => {
    const n = 40000;
    const sums = (phi: number) => {
      const r = new Rng(11);
      const out = new Float64Array(n);
      const buf = new Float64Array(12);
      for (let i = 0; i < n; i++) {
        ar1(r, phi, 0.03, buf, 0);
        out[i] = buf.reduce((a, x) => a + x, 0);
      }
      return std(out);
    };
    expect(sums(0.8) / sums(0) / 2.43).toBeGreaterThan(0.97);
    expect(sums(0.8) / sums(0) / 2.43).toBeLessThan(1.03);
  });
  test('TC08 : bruit recentré φ = 0,6, total annuel inchangé à 0,01 % près', () => {
    const seas = seasonality(alfaBudget());
    const r = new Rng(3);
    const buf = new Float64Array(12);
    for (let i = 0; i < 2000; i++) {
      for (const s of seas) {
        ar1(r, 0.6, 0.03, buf, 0, 0, s);
        let tot = 0;
        for (let t = 0; t < 12; t++) tot += s[t] * (1 + buf[t]);
        expect(Math.abs(tot - 1)).toBeLessThan(1e-4);
      }
    }
    // Recentrage sur les mois restants (atterrissage) : les mois clos restent à zéro.
    ar1(r, 0.6, 0.03, buf, 0, 6, seas[0]);
    expect(Array.from(buf.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });
  test('change : ŵ · ε = z exactement, cours moyen dispersé de 3,8 %', () => {
    const w = fxWeights();
    expect(w.reduce((a, x) => a + x * x, 0)).toBeCloseTo(1, 12);
    const out = new Float64Array(12);
    const eta = Float64Array.from({ length: 12 }, (_, t) => Math.sin(t + 1));
    fxPath(0.7, eta, 5100, 0.04, 0.018, out, 0);
    // Le choc total pondéré retrouvé à partir des log-rendements vaut z.
    let lnPrev = Math.log(5100);
    let proj = 0;
    for (let t = 0; t < 12; t++) {
      const eps = (Math.log(out[t]) - lnPrev - 0.04 / 12) / 0.018;
      proj += eps * w[t];
      lnPrev = Math.log(out[t]);
    }
    expect(proj).toBeCloseTo(0.7, 10);
    // Dispersion du cours moyen et quantiles analytiques (annexe C).
    const n = 20000;
    const u = latinHypercube(new Rng(9), n, 1);
    const r = new Rng(10);
    const means = new Float64Array(n);
    const e = new Float64Array(12);
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 12; t++) e[t] = normInv(r.uniform());
      fxPath(normInv(u[i]), e, 5100, 0.04, 0.018, out, 0);
      means[i] = out.reduce((a, x) => a + x, 0) / 12;
    }
    expect(Math.abs(percentile(means, 0.5) - 5212)).toBeLessThan(8);
    expect(Math.abs(percentile(means, 0.1) - 4963)).toBeLessThan(12);
    expect(Math.abs(percentile(means, 0.9) - 5477)).toBeLessThan(12);
    expect(std(means.map((x) => Math.log(x)))).toBeCloseTo(0.038, 3);
  });
});

describe('tirages complets (M4)', () => {
  test('C11 et bornes : mois clos à zéro, événements limités aux mois restants', () => {
    const reg: Registry = alfaRegistry();
    const d = drawAll(reg, alfaBudget(), { n: 2000, graine: 1, moisClos: 6, dernierCours: 5300 });
    for (let i = 0; i < d.n; i++) {
      expect(d.month.E01[i]).toBeGreaterThanOrEqual(6);
      for (let t = 0; t < 6; t++) expect(d.noise[i * 36 + t]).toBe(0);
    }
    let f = 0;
    for (let i = 0; i < d.n; i++) f += d.occ.E02[i];
    expect(f / d.n).toBeCloseTo(0.075, 2);
    const simple = drawAll(reg, alfaBudget(), { n: 1000, graine: 1, simple: true });
    expect(simple.n).toBe(1000);
  });
});
