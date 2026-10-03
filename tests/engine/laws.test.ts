import { describe, expect, test } from 'vitest';
import { alfaRegistry } from '../../src/engine/alfa.ts';
import { asymmetry, chooseLaw, makeLaw, validateHypothesis, widen } from '../../src/engine/laws.ts';
import { Rng } from '../../src/engine/rng.ts';
import { latinHypercube } from '../../src/engine/sampling.ts';
import { mean, normInv, percentile } from '../../src/engine/stats.ts';
import type { Hypothesis } from '../../src/engine/types.ts';

const base = { code: 'H01', libelle: 't', proprietaire: 'p', unite: 'facteur', grain: 'total', justification: 'j', statut: 'valide' } as const;
const h = (o: Partial<Hypothesis>): Hypothesis => ({ ...base, ...o }) as Hypothesis;

/** Tirage LHS d'une loi seule. */
function sample(law: ReturnType<typeof makeLaw>, n = 10000, seed = 1): Float64Array {
  const u = latinHypercube(new Rng(seed), n, 1);
  return Float64Array.from(u, (x) => law.quantile(normInv(x)));
}

describe('choix de la loi (5.3)', () => {
  test('catalogue ALFA', () => {
    const reg = alfaRegistry();
    const kinds = Object.fromEntries(reg.hypotheses.map((x) => [x.code, chooseLaw(x)]));
    expect(kinds).toEqual({
      H01: 'split-normale', H02: 'split-normale', H03: 'normale', H04: 'split-normale', H05: 'normale', H06: 'marche-aleatoire',
      H07: 'lognormale', H08: 'split-normale', H09: 'split-normale', H10: 'split-normale', H11: 'split-normale', H12: 'split-normale',
    });
  });
  test('indice d\'asymétrie et PERT', () => {
    expect(asymmetry(0.955, 0.995, 1.025)).toBeCloseTo(0.75, 12);
    expect(chooseLaw(h({ p10: 0.9, p50: 1, p90: 1.1, min: 0.8, max: 1.3 }))).toBe('pert');
  });
});

describe('conversion des fourchettes (annexe B)', () => {
  test('TC02 normale : P10 et P90 empiriques à ±0,001', () => {
    const law = makeLaw(h({ p10: 0.95, p50: 1, p90: 1.05 }));
    expect(law.kind).toBe('normale');
    const x = sample(law);
    expect(Math.abs(percentile(x, 0.1) - 0.95)).toBeLessThan(0.001);
    expect(Math.abs(percentile(x, 0.9) - 1.05)).toBeLessThan(0.001);
    expect((1.05 - 0.95) / (2 * 1.2815515655446004)).toBeCloseTo(0.039, 3);
  });
  test('TC03 lognormale : médiane 1,0022, σ 0,0175', () => {
    const law = makeLaw(h({ code: 'H07', p10: 0.98, p50: null, p90: 1.025 }));
    expect(law.kind).toBe('lognormale');
    expect(law.p50).toBeCloseTo(1.0022, 4);
    const sigma = Math.log(law.quantile(1) / law.p50);
    expect(sigma).toBeCloseTo(0.0175, 4);
    const x = sample(law);
    expect(percentile(x, 0.5)).toBeCloseTo(1.0022, 3);
    expect(law.cdf(0.98)).toBeCloseTo(0.1, 10);
    expect(law.cdf(-1)).toBe(0);
  });
  test('TC04 split-normale : moyenne 0,9919 à ±0,001', () => {
    const law = makeLaw(h({ p10: 0.955, p50: 0.995, p90: 1.025 }));
    expect(law.kind).toBe('split-normale');
    expect(Math.abs(law.mean - 0.9919)).toBeLessThan(0.001);
    expect(Math.abs(mean(sample(law)) - 0.9919)).toBeLessThan(0.001);
    expect(law.cdf(0.955)).toBeCloseTo(0.1, 10);
    expect(law.cdf(1.025)).toBeCloseTo(0.9, 10);
  });
  test('PERT : moyenne (a + 4m + b) / 6 et bornes respectées', () => {
    const law = makeLaw(h({ p10: 0.95, p50: 1, p90: 1.08, min: 0.9, max: 1.2 }));
    expect(law.mean).toBeCloseTo((0.9 + 4 + 1.2) / 6, 12);
    const x = sample(law, 4000);
    expect(Math.min(...x)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...x)).toBeLessThanOrEqual(1.2);
    expect(Math.abs(mean(x) - law.mean)).toBeLessThan(0.002);
    expect(law.cdf(law.p10)).toBeCloseTo(0.1, 6);
  });
  test('R-HY-03 : élargissement par k autour du P50', () => {
    const [lo, hi] = widen(0.955, 0.995, 1.025, 1.5);
    expect(lo).toBeCloseTo(0.935, 12);
    expect(hi).toBeCloseTo(1.04, 12);
    const law = makeLaw(h({ p10: 0.955, p50: 0.995, p90: 1.025, k: 1.5 }));
    expect(law.p10).toBeCloseTo(0.935, 12);
    expect(law.p90).toBeCloseTo(1.04, 12);
    expect(makeLaw(h({ p10: 0.955, p50: 0.995, p90: 1.025, k: 1.5 }), false).p10).toBeCloseTo(0.955, 12);
    const ln = makeLaw(h({ p10: 0.98, p50: null, p90: 1.025, k: 1.5 }));
    expect(ln.p10).toBeLessThan(0.98);
    const nm = makeLaw(h({ p10: 0.96, p50: 1, p90: 1.04, k: 2 }));
    expect(nm.p10).toBeCloseTo(0.92, 12);
  });
  test('la marche aléatoire n\'a pas de quantile direct', () => {
    expect(() => makeLaw(h({ code: 'H06', depart: 5100, derive_annuelle: 0.04, volatilite_mensuelle: 0.018 }))).toThrow();
  });
});

describe('règles de saisie', () => {
  test('R-HY-01 et principe 3', () => {
    expect(validateHypothesis(h({ p10: 0.95, p50: 1, p90: 1.05 }))).toEqual([]);
    expect(validateHypothesis(h({ p10: 1.01, p50: 1, p90: 1.05 }))[0]).toMatch(/R-HY-01/);
    expect(validateHypothesis(h({ p10: 0.95, p50: 1, p90: 1.05, proprietaire: ' ' }))[0]).toMatch(/propriétaire/);
    expect(validateHypothesis(h({ p10: 0.95, p50: 1, p90: 1.05, justification: '' }))[0]).toMatch(/justification/);
    expect(validateHypothesis(h({ p10: 1.1, p50: null, p90: 1.05 }))[0]).toMatch(/P10 < P90/);
    expect(validateHypothesis(h({ p10: 0.95, p50: 1.3, p90: 1.05, min: 0.9, max: 1.2 }))[0]).toMatch(/PERT|minimum/);
    expect(validateHypothesis(h({ code: 'H06', depart: -1, derive_annuelle: 0, volatilite_mensuelle: 0 }))).toHaveLength(2);
  });
});
