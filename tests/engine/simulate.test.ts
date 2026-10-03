import { beforeAll, describe, expect, test } from 'vitest';
import { alfaBudget, alfaLevers, alfaScenario, alfaStress } from '../../src/engine/alfa.ts';
import { reconciliation } from '../../src/engine/controls.ts';
import { buildEffects, leverMissingField, neutralEffects, BUMPS } from '../../src/engine/levers.ts';
import { budgetMonthly, runPL } from '../../src/engine/pl.ts';
import { batchProbSE, batchQuantileSE, computeStats } from '../../src/engine/risk.ts';
import { drawAll, fxDeterministic, p50Values, pointDraws, samplingContext } from '../../src/engine/sampling.ts';
import { objectives, simulate, validateScenario, type RunOutput } from '../../src/engine/simulate.ts';
import { syntheticData } from '../../src/engine/synthetic.ts';
import type { CaseCode } from '../../src/engine/types.ts';

let run: RunOutput;
beforeAll(() => {
  const r = simulate({ scenario: alfaScenario(), budget: alfaBudget() });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  run = r;
});

describe('moteur P&L déterministe (M5)', () => {
  test('TC01 / C01 : toutes les hypothèses au budget, EBITDA = 9,400 GAr à 1 MAr près', () => {
    expect(Math.abs(reconciliation(alfaBudget()) - 9.4)).toBeLessThan(0.001);
    expect(budgetMonthly(alfaBudget()).reduce((a, x) => a + x, 0)).toBeCloseTo(9.4, 9);
  });
  test('F.4 : hypothèses à leur P50, change sur sa trajectoire médiane, sans aléa : 9,197 GAr', () => {
    const ctx = samplingContext(alfaScenario().registre);
    const v = runPL(alfaBudget(), pointDraws(3, p50Values(ctx), fxDeterministic(ctx)), { noise: false, events: false }).annual[0];
    expect(Math.abs(v - 9.197)).toBeLessThan(0.001);
  });
  test('effets déterministes des leviers (F.3)', () => {
    const b = alfaBudget();
    const d = pointDraws(3, { H01: 1, H02: 1, H03: 1, H04: 1, H05: 0, H07: 1, H08: 1, H09: 1.05, H10: 1, H11: 1, H12: 1 }, new Array(12).fill(5200));
    const at = (codes: CaseCode[]) => runPL(b, d, { noise: false, events: false, effects: buildEffects(codes, alfaLevers(), alfaStress()) }).annual[0];
    const ref = at([]);
    expect(at(['L3']) - ref).toBeCloseTo((0.25 / 12) * 9 - 0.05, 10);
    expect(at(['L5']) - ref).toBeCloseTo(-0.16, 10);
    expect(at(['L4']) - ref).toBeCloseTo(2.6 * 0.02, 10);
    // Coût matière importé exact : 23,2 × 30 % + 18,9 × 50 % + 8,9 × 60 % = 21,75 GAr (21,8 arrondi dans la SFD).
    expect(at(['L1']) - ref).toBeCloseTo(-21.75 * 0.5 * (50 / 5200), 10);
  });
});

describe('TC16 : concordance avec le prototype (annexe F.4), N = 10 000, graine 2027', () => {
  test('indicateurs de la base', () => {
    const b = run.base;
    expect(Math.abs(b.p10 - 6.64)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.p50 - 8.63)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.p90 - 10.44)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.mean - 8.59)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.prob - 0.299)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(b.ear - 1.98)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(b.cvar10 - 5.93)).toBeLessThanOrEqual(0.05);
  });
  test('fréquences des événements (C10, TC09)', () => {
    const f = Object.fromEntries(run.events.map((e) => [e.code, e.freq]));
    expect(Math.abs(f.E01 - 0.35)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(f.E02 - 0.15)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(f.E03 - 0.25)).toBeLessThanOrEqual(0.01);
  });
  test('leviers, paquets et stress tests', () => {
    const expected: Record<string, [number, number]> = {
      L1: [0.228, 8.56], L2: [0.366, 8.87], L3: [0.336, 8.76], L4: [0.3, 8.63], L5: [0.273, 8.51],
      A: [0.399, 9.01], B: [0.344, 8.94], S1: [0.015, 6.19], S2: [0.022, 6.84], S3: [0.214, 8.25], 'S1+S3': [0.007, 5.81],
    };
    for (const [code, [p, p50]] of Object.entries(expected)) {
      const c = run.cases.find((x) => x.code === code)!;
      expect(Math.abs(c.stats.prob - p), `${code} probabilité`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(c.stats.p50 - p50), `${code} P50`).toBeLessThanOrEqual(0.05);
    }
  });
  test('section 9 : 68 % du risque dans le bloc macroéconomique, P20 à 7,3 GAr, objectifs', () => {
    const macro = run.contributions.blocks.find((b) => b.code === 'macro')!;
    expect(Math.abs(macro.part - 0.68)).toBeLessThan(0.02);
    expect(run.contributions.items[0].code).toBe('H06');
    expect(Math.abs(run.base.p20 - 7.3)).toBeLessThan(0.08);
    const t = Object.fromEntries(run.targets.map((x) => [x.objectif, x.prob]));
    expect(Math.abs(t[8.5] - 0.53)).toBeLessThan(0.015);
    expect(Math.abs(t[9] - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(t[10] - 0.17)).toBeLessThan(0.015);
    expect(Math.abs(run.base.std - 1.5)).toBeLessThan(0.06);
  });
  test('section 9.2-9.3 : événements et profil de l\'année P10', () => {
    const e = Object.fromEntries(run.events.map((x) => [x.code, x]));
    expect(Math.abs(e.E01.p50If - 8.01)).toBeLessThan(0.08);
    expect(Math.abs(e.E01.p50Else - 8.95)).toBeLessThan(0.08);
    const p = Object.fromEntries(run.profile.map((x) => [x.code, x]));
    expect(Math.abs(p.H06.p10Year - 5435)).toBeLessThan(25);
    expect(Math.abs(p.E01.p10Year - 0.55)).toBeLessThan(0.04);
    expect(Math.abs(p.H01.p10Year - 0.979)).toBeLessThan(0.004);
    // Effet isolé : la référence est le P&L des hypothèses au P50.
    expect(run.isolated.base).toBeCloseTo(9.197, 3);
    expect(run.isolated.effects.find((x) => x.code === 'H06')!.high).toBeLessThan(run.isolated.base);
    expect(run.totalEffects).toHaveLength(12);
  });
  test('section 13.3 : fin juin, éventail 3,2 à 4,8 GAr, médian 4,0 pour un budget de 4,2', () => {
    const j = run.fan[5];
    expect(j.p10).toBeCloseTo(3.2, 1);
    expect(j.p50).toBeCloseTo(4.0, 1);
    expect(j.p90).toBeCloseTo(4.8, 1);
    expect(j.budget).toBeCloseTo(4.22, 2);
    expect(run.fan[11].budget).toBeCloseTo(9.4, 9);
    expect(run.quarters).toHaveLength(4);
    expect(run.bus.map((b) => b.bu)).toEqual(['Boissons', 'Epicerie', 'Hygiene']);
  });
});

describe('contrôles M9 et règles', () => {
  test('C01 à C12 au vert sur ALFA', () => {
    for (const c of run.controls) expect(c.ok, `${c.code} ${c.valeur} ${c.detail ?? ''}`).toBe(true);
    expect(run.controls.map((c) => c.code)).toEqual(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12']);
    expect(run.blocking).toBe(false);
    expect(run.controls.find((c) => c.code === 'C09')!.valeur).toContain('70 000'.replace(' ', ' ').slice(0, 2));
  });
  test('TC10 : deux runs, même graine, identiques bit à bit ; autre graine, autre résultat', () => {
    const s = { ...alfaScenario(), n: 3000 };
    const a = simulate({ scenario: s, budget: alfaBudget(), quick: true });
    const b = simulate({ scenario: s, budget: alfaBudget(), quick: true });
    const c = simulate({ scenario: { ...s, graine: 7 }, budget: alfaBudget(), quick: true });
    if (!a.ok || !b.ok || !c.ok) throw new Error('run');
    expect(Array.from(a.annual)).toEqual(Array.from(b.annual));
    expect(a.ref.texte).toBe(b.ref.texte);
    expect(Array.from(c.annual)).not.toEqual(Array.from(a.annual));
    expect(a.partial).toBe(true);
    expect(a.controls).toEqual([]);
  });
  test('TC11 : aléa commun, un levier neutre donne un écart exactement nul', () => {
    const s = alfaScenario();
    const b = alfaBudget();
    const d = drawAll(s.registre, b, { n: 5000, graine: 2027 });
    const base = runPL(b, d);
    const levers = alfaLevers().map((l) => (l.code === 'L4' ? { ...l, params: { plafond: 99 } } : l));
    const neutral = runPL(b, d, { effects: buildEffects(['L4'], levers, alfaStress()) });
    for (let i = 0; i < d.n; i++) expect(neutral.annual[i] - base.annual[i]).toBe(0);
  });
  test('TC12 : +1 % sur chaque charge et sur le cours fait baisser l\'EBITDA sur toutes les itérations', () => {
    const s = alfaScenario();
    const b = alfaBudget();
    const d = drawAll(s.registre, b, { n: 3000, graine: 12 });
    const base = runPL(b, d);
    for (const bump of BUMPS) {
      const r = runPL(b, d, { effects: { ...neutralEffects(), bump } });
      for (let i = 0; i < d.n; i++) expect(r.annual[i]).toBeLessThan(base.annual[i]);
    }
  });
  test('R-LE-03 : un paquet est recalculé, les gains ne s\'additionnent pas', () => {
    const g = (c: string) => run.cases.find((x) => x.code === c)!.dProb;
    expect(Math.abs(g('A') - (g('L2') + g('L3')))).toBeGreaterThan(0.001);
  });
  test('UC05 / R-LE-02 : un levier sans coût ou sans date est refusé avec le champ manquant', () => {
    const l = alfaLevers()[2];
    expect(leverMissingField({ ...l, cout: null })).toBe('coût direct');
    expect(leverMissingField({ ...l, mois: null })).toBe("date d'effet");
    expect(leverMissingField({ ...l, proprietaire: '' })).toBe('propriétaire');
    expect(leverMissingField(l)).toBeNull();
    const s = alfaScenario();
    s.n = 1000;
    s.leviers[2].cout = null;
    s.actifs = ['L3'];
    const r = simulate({ scenario: s, budget: alfaBudget(), quick: true });
    if (!r.ok) throw new Error('run');
    expect(r.cases.find((c) => c.code === 'L3')!.refus).toMatch(/coût direct/);
    expect(r.selection!.stats.prob).toBe(r.base.prob);
  });
  test('validation : saisie incohérente, aucun calcul ne part', () => {
    const s = alfaScenario();
    s.registre.hypotheses[0].p10 = 1.2;
    s.registre.evenements[0].p = 1.5;
    s.registre.evenements[1].amplitude = [0.2, 0.1];
    s.registre.evenements[2].proprietaire = '';
    s.n = 10;
    const r = simulate({ scenario: s, budget: alfaBudget() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBe(5);
    expect(validateScenario(alfaScenario())).toEqual([]);
  });
  test('C12 et C07 : registre incomplet et N trop faible rendent le run non présentable', () => {
    const s = alfaScenario();
    s.n = 1000;
    s.registre.hypotheses[3].statut = 'brouillon';
    const r = simulate({ scenario: s, budget: alfaBudget() });
    if (!r.ok) throw new Error('run');
    expect(r.blocking).toBe(true);
    expect(r.controls.find((c) => c.code === 'C12')!.ok).toBe(false);
    expect(r.controls.find((c) => c.code === 'C07')!.ok).toBe(false);
  });
  test('C04 : une matrice corrigée reste présentable et signale les paires déplacées', () => {
    const s = alfaScenario();
    s.registre.correlations_rang = [['H01', 'H02', 0.9], ['H02', 'H03', 0.9], ['H01', 'H03', -0.9]];
    const r = simulate({ scenario: s, budget: alfaBudget() });
    if (!r.ok) throw new Error('run');
    const c04 = r.controls.find((c) => c.code === 'C04')!;
    expect(c04.ok).toBe(true);
    expect(c04.detail).toMatch(/Higham/);
    expect(r.controls.find((c) => c.code === 'C03')!.ok).toBe(true);
  });
  test('erreurs-types par lots et objectifs d\'un budget importé', () => {
    expect(batchQuantileSE(run.annual, 0.1)).toBeLessThan(0.047);
    expect(batchProbSE(run.annual, 9.4) * 1.96).toBeLessThan(0.012);
    const b = { ...alfaBudget(), source: 'import' as const, ebitdaPublie: 12 };
    expect(objectives(b)).toEqual([10.8, 11.4, 12, 12.6]);
    expect(computeStats([1, 2, 3], 2).prob).toBeCloseTo(2 / 3, 12);
  });
});

describe('TC13 : atterrissage', () => {
  test('6 mois figés au réel : dispersion nulle sur les 6 premiers mois', () => {
    const s = { ...alfaScenario(), moisClos: 6 };
    const actuals = syntheticData().realise2027;
    const r = simulate({ scenario: s, budget: alfaBudget(), actuals });
    if (!r.ok) throw new Error('run');
    let cum = 0;
    for (let t = 0; t < 6; t++) {
      cum += actuals.lignes[t][7];
      expect(r.fan[t].p10).toBeCloseTo(cum, 12);
      expect(r.fan[t].p90).toBeCloseTo(cum, 12);
    }
    expect(r.fan[6].p90 - r.fan[6].p10).toBeGreaterThan(0.05);
    for (const c of r.controls) expect(c.ok, `${c.code} ${c.valeur}`).toBe(true);
    expect(r.ref.texte).toContain('6 mois clos');
  });
  test('la probabilité glissante converge quand l\'incertitude se résout', () => {
    const actuals = syntheticData().realise2027;
    const prob = (m: number) => {
      const r = simulate({ scenario: { ...alfaScenario(), moisClos: m, n: 3000 }, budget: alfaBudget(), actuals, quick: true });
      if (!r.ok) throw new Error('run');
      return r.base;
    };
    const s3 = prob(3);
    const s11 = prob(11);
    expect(s11.p90 - s11.p10).toBeLessThan((s3.p90 - s3.p10) / 3);
  });
});
