import { describe, expect, test } from 'vitest';
import { Rng, subSeed } from '../../src/engine/rng.ts';
import {
  Z90, betaInc, betaInv, chi2Cdf, logGamma, mean, normCdf, normInv, pearson, percentile, percentileSorted, ranks, sorted, spearman, std,
} from '../../src/engine/stats.ts';

describe('loi normale', () => {
  test('quantiles de référence', () => {
    expect(normInv(0.9)).toBeCloseTo(1.2815515655446004, 12);
    expect(Z90).toBeCloseTo(normInv(0.9), 14);
    expect(normInv(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normInv(0.5)).toBe(0);
    expect(normInv(1e-10)).toBeCloseTo(-6.361340902404056, 9);
    expect(normInv(0.02)).toBeCloseTo(-2.053748910631823, 12);
    expect(normInv(0)).toBe(-Infinity);
    expect(normInv(1)).toBe(Infinity);
  });
  test('répartition et réciprocité', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 15);
    expect(normCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(normCdf(-40)).toBe(0);
    expect(normCdf(8)).toBeCloseTo(1, 14);
    expect(normCdf(-8) / 6.22096057427178e-16).toBeCloseTo(1, 7);
    for (const p of [1e-6, 0.001, 0.1, 0.3, 0.5, 0.77, 0.95, 0.999999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 12);
  });
});

describe('statistiques descriptives', () => {
  test('percentile avec interpolation linéaire (R-RI-01)', () => {
    const x = [5, 1, 4, 2, 3];
    expect(percentile(x, 0)).toBe(1);
    expect(percentile(x, 1)).toBe(5);
    expect(percentile(x, 0.5)).toBe(3);
    expect(percentile(x, 0.1)).toBeCloseTo(1.4, 12);
    expect(percentileSorted([], 0.5)).toBeNaN();
    expect(Array.from(sorted([3, 1, 2]))).toEqual([1, 2, 3]);
  });
  test('moyenne, écart-type, rangs avec ex aequo', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138089935, 8);
    expect(Array.from(ranks([10, 20, 10, 30]))).toEqual([1.5, 3, 1.5, 4]);
  });
  test('corrélations', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(spearman([1, 2, 3, 4], [1, 8, 27, 64])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });
  test('khi-deux, gamma, bêta', () => {
    expect(chi2Cdf(9.487729036781154, 4)).toBeCloseTo(0.95, 9);
    expect(chi2Cdf(1, 4)).toBeCloseTo(0.090204010431050, 9);
    expect(chi2Cdf(0, 4)).toBe(0);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(betaInc(0.5, 2, 2)).toBeCloseTo(0.5, 12);
    expect(betaInc(0.3, 2, 5)).toBeCloseTo(0.579825, 6);
    expect(betaInc(0, 2, 5)).toBe(0);
    expect(betaInc(1, 2, 5)).toBe(1);
    expect(betaInc(0.9, 5, 2)).toBeCloseTo(1 - betaInc(0.1, 2, 5), 12);
    expect(betaInv(betaInc(0.42, 3, 4.5), 3, 4.5)).toBeCloseTo(0.42, 10);
  });
});

describe('générateur à graine', () => {
  test('même graine, même suite ; graines différentes, suites différentes', () => {
    const a = new Rng(2027);
    const b = new Rng(2027);
    const c = new Rng(2028);
    const sa = Array.from({ length: 5 }, () => a.nextU32());
    expect(Array.from({ length: 5 }, () => b.nextU32())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.nextU32())).not.toEqual(sa);
    expect(subSeed(2027, 1)).not.toBe(subSeed(2027, 2));
    expect(subSeed(2027, 1)).toBe(subSeed(2027, 1));
  });
  test('uniformes dans ]0 ; 1[, entiers et permutations', () => {
    const r = new Rng(7);
    let s = 0;
    for (let i = 0; i < 20000; i++) {
      const u = r.uniform();
      expect(u > 0 && u < 1).toBe(true);
      s += u;
    }
    expect(s / 20000).toBeCloseTo(0.5, 2);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[r.int(1, 6) - 1]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
    const p = Array.from(r.permutation(100)).sort((x, y) => x - y);
    expect(p).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
});
