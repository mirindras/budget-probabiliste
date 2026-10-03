import { describe, expect, test } from 'vitest';
import { alfaRegistry } from '../../src/engine/alfa.ts';
import { applyCalibration, crps, kFromCoverage, knownTruthCoverage, runBacktest, tests as btTests } from '../../src/engine/backtest.ts';
import { reconciliation } from '../../src/engine/controls.ts';
import { hash, canonical } from '../../src/engine/hash.ts';
import { BIAIS_VOLUMES, K_VRAI, pastBudget, syntheticData, trueRegistry } from '../../src/engine/synthetic.ts';

describe('coefficient d\'élargissement (11.2, annexe E)', () => {
  test('table couverture → k', () => {
    const t: [number, number][] = [[0.58, 1.59], [0.6, 1.52], [0.65, 1.37], [0.7, 1.24], [0.8, 1.0]];
    for (const [c, k] of t) expect(kFromCoverage(c)).toBeCloseTo(k, 2);
    expect(kFromCoverage(0)).toBe(Infinity);
    expect(kFromCoverage(1)).toBe(0);
  });
  test('alertes R-BT-03 et R-BT-04', () => {
    const obs = (inside: boolean) => ({ annee: 2024, trimestre: 1, code: 'H01' as const, realise: inside ? 1 : 2, p10: 0.9, p50: 1, p90: 1.1, pit: inside ? 0.5 : 0.99 });
    expect(btTests(Array.from({ length: 10 }, () => obs(true))).alerte).toMatch(/R-BT-04/);
    const wide = btTests([...Array.from({ length: 3 }, () => obs(true)), ...Array.from({ length: 7 }, () => obs(false))]);
    expect(wide.alerte).toMatch(/R-BT-03/);
    expect(wide.k).toBe(2);
  });
  test('CRPS d\'un échantillon : E|X - y| - ½ E|X - X\'|', () => {
    const x = [1, 2, 3, 4];
    let a = 0;
    let b = 0;
    for (const xi of x) {
      a += Math.abs(xi - 2.5);
      for (const xj of x) b += Math.abs(xi - xj);
    }
    expect(crps(x, 2.5)).toBeCloseTo(a / 4 - b / 32, 12);
  });
});

describe('jeu synthétique (section 16)', () => {
  const s = syntheticData();
  test('R-DS-03 : marge d\'EBITDA voisine de 11 %, budgets passés réconciliés', () => {
    for (const py of s.budgets) {
      const ca = py.budget.ca.flat().reduce((a, x) => a + x, 0);
      expect(reconciliation(py.budget) / ca).toBeCloseTo(9.4 / 85, 6);
      expect(Math.abs(reconciliation(py.budget) - py.budget.ebitdaPublie)).toBeLessThan(0.001);
    }
    expect(pastBudget(2026, 5000).coursBudget).toBe(5000);
  });
  test('historique : 72 mois de change, dernier cours connu 5 100 fin 2026, journal des événements', () => {
    expect(s.cours).toHaveLength(72);
    expect(s.cours[59].cours).toBeCloseTo(5100, 6);
    expect(s.journal.length).toBeGreaterThan(3);
    expect(s.realise2027.lignes).toHaveLength(12);
    expect(Object.keys(s.correlationsObservees)).toHaveLength(alfaRegistry().correlations_rang.length);
    expect(Object.keys(s.intervalleHistorique)).toHaveLength(12);
  });
  test('processus générateur : fourchettes élargies de K_VRAI, volumes décalés du biais d\'optimisme', () => {
    const t = trueRegistry();
    const h1 = t.hypotheses.find((h) => h.code === 'H01')!;
    expect(h1.k).toBe(K_VRAI);
    expect(h1.p50).toBeCloseTo(0.995 / (1 + BIAIS_VOLUMES), 12);
  });
});

describe('backtest 2024-2026 (M8)', () => {
  const bt = runBacktest();
  test('détecte des fourchettes trop étroites (couverture proche de 60 %) et propose k proche de 1,5', () => {
    expect(bt.global.n).toBe(144);
    expect(bt.global.couverture).toBeGreaterThan(0.55);
    expect(bt.global.couverture).toBeLessThan(0.66);
    expect(bt.global.k).toBeGreaterThan(1.4);
    expect(bt.global.k).toBeLessThan(1.65);
    expect(bt.verdicts.find((v) => v.test === 'Couverture P10-P90')!.ok).toBe(false);
    expect(bt.verdicts.find((v) => v.test === 'Score de Brier')!.ok).toBe(true);
    expect(bt.verdicts.find((v) => v.test === 'CRPS')!.ok).toBe(true);
    expect(bt.trimestres).toHaveLength(12);
    expect(bt.synthese).toMatch(/k = 1,5/);
  });
  test('détecte le biais d\'optimisme sur les volumes', () => {
    const vb = bt.parHypothese.filter((h) => ['H01', 'H02'].includes(h.code));
    for (const h of vb) expect(h.biais).toBeLessThan(-0.01);
  });
  test('la calibration élargit le registre et crée une version en brouillon', () => {
    const r = applyCalibration(alfaRegistry(), bt);
    expect(r.statut).toBe('brouillon');
    expect(r.version).toBe('v2-calibré');
    for (const h of r.hypotheses) expect(h.k).toBeCloseTo(bt.global.k, 2);
    const h1 = r.hypotheses.find((h) => h.code === 'H01')!;
    expect(h1.p50!).toBeLessThan(0.995);
    const h3 = r.hypotheses.find((h) => h.code === 'H03')!;
    expect(h3.p50).toBe(1);
  });
  test('TC14 : calibration sur vérité connue, couverture P10-P90 entre 77 % et 83 %', () => {
    const c = knownTruthCoverage();
    expect(c).toBeGreaterThanOrEqual(0.77);
    expect(c).toBeLessThanOrEqual(0.83);
  });
});

describe('empreintes (R-IN-07)', () => {
  test('indépendantes de l\'ordre des clés, sensibles au contenu', () => {
    expect(hash({ a: 1, b: [1, 2] })).toBe(hash({ b: [1, 2], a: 1 }));
    expect(hash({ a: 1 })).not.toBe(hash({ a: 2 }));
    expect(canonical({ a: undefined, b: null })).toBe('{"b":null}');
    expect(hash(alfaRegistry())).toHaveLength(12);
  });
});
