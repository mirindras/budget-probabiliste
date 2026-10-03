/** M8 : backtest des budgets passés et calibration (section 11, annexe E). */
import { computeStats } from './risk.ts';
import { runPL } from './pl.ts';
import { drawAll, samplingContext, seasonality, type Draws } from './sampling.ts';
import { chi2Cdf, normInv, percentileSorted, sorted } from './stats.ts';
import { syntheticData, trueRegistry, type PastYear, type YearTruth } from './synthetic.ts';
import { ALFA_COMPACT, expandBudget } from './alfa.ts';
import { HYP_CODES, type HypCode, type Registry } from './types.ts';

export interface Observation {
  annee: number;
  trimestre: number;
  code: HypCode;
  realise: number;
  p10: number;
  p50: number;
  p90: number;
  /** Rang du réalisé dans sa distribution simulée (PIT). */
  pit: number;
}

export interface Tests {
  n: number;
  couverture: number;
  sousP10: number;
  surP90: number;
  /** Effectifs du PIT en 5 classes. */
  pitClasses: number[];
  /** p-valeur du test du khi-deux d'uniformité du PIT. */
  pitPValue: number;
  /** Médiane de (réalisé - P50) / P50 (en points pour le mix). */
  biais: number;
  /** k proposé (R-HY-03), borné entre 1 et 2 (R-BT-03). */
  k: number;
  kBrut: number;
  alerte: string | null;
}

export interface BacktestResult {
  observations: Observation[];
  parHypothese: (Tests & { code: HypCode })[];
  global: Tests;
  /** Score de Brier sur « budget trimestriel atteint ». */
  brier: number;
  /** CRPS moyen contre l'erreur absolue du budget déterministe, en GAr. */
  crps: number;
  erreurDeterministe: number;
  trimestres: { annee: number; trimestre: number; budget: number; realise: number; prob: number; p10: number; p50: number; p90: number }[];
  verdicts: { test: string; mesure: string; seuil: string; ok: boolean }[];
  /** Phrase d'une ligne pour la note CODIR (R-BT-05). */
  synthese: string;
}

/** Coefficient d'élargissement k = Φ⁻¹(0,9) / Φ⁻¹((1 + c) / 2) (11.2). */
export function kFromCoverage(c: number): number {
  if (c <= 0) return Infinity;
  if (c >= 1) return 0;
  return 1.2815515655446004 / normInv((1 + c) / 2);
}

const VOL = ['H01', 'H02', 'H03'];

/** Valeur trimestrielle d'une hypothèse : volumes avec le bruit du trimestre, change moyen du trimestre, sinon niveau annuel. */
function quarterValue(code: HypCode, q: number, level: number, noise: ArrayLike<number> | null, seas: number[], fx: ArrayLike<number>): number {
  const ts = [3 * q, 3 * q + 1, 3 * q + 2];
  if (code === 'H06') return (fx[ts[0]] + fx[ts[1]] + fx[ts[2]]) / 3;
  if (VOL.includes(code) && noise) {
    let s = 0, w = 0;
    for (const t of ts) {
      s += seas[t] * (1 + noise[t]);
      w += seas[t];
    }
    return (level * s) / w;
  }
  return level;
}

function simulatedQuarter(d: Draws, code: HypCode, q: number, seas: number[][]): Float64Array {
  const out = new Float64Array(d.n);
  const b = VOL.indexOf(code);
  for (let i = 0; i < d.n; i++) {
    const level = code === 'H06' ? 0 : d.h[code as Exclude<HypCode, 'H06'>][i];
    const noise = b >= 0 ? d.noise.subarray((i * d.nb + b) * 12, (i * d.nb + b) * 12 + 12) : null;
    out[i] = quarterValue(code, q, level, noise, b >= 0 ? seas[b] : seas[0], d.fx.subarray(i * 12, i * 12 + 12));
  }
  return out;
}

function realizedQuarter(y: YearTruth, code: HypCode, q: number, seas: number[][]): number {
  const b = VOL.indexOf(code);
  const level = code === 'H06' ? 0 : y.h[code as Exclude<HypCode, 'H06'>];
  return quarterValue(code, q, level, b >= 0 ? y.bruit[b] : null, b >= 0 ? seas[b] : seas[0], y.cours);
}

export function tests(obs: Observation[], relative = true): Tests {
  const n = obs.length;
  const inside = obs.filter((o) => o.realise >= o.p10 && o.realise <= o.p90).length;
  const below = obs.filter((o) => o.realise < o.p10).length;
  const above = obs.filter((o) => o.realise > o.p90).length;
  const classes = [0, 0, 0, 0, 0];
  for (const o of obs) classes[Math.min(4, Math.floor(o.pit * 5))]++;
  const e = n / 5;
  const chi2 = classes.reduce((a, c) => a + (c - e) ** 2 / e, 0);
  const rel = obs.map((o) => (relative && o.code !== 'H05' ? (o.realise - o.p50) / o.p50 : (o.realise - o.p50) / 100));
  const biais = percentileSorted(sorted(rel), 0.5);
  const c = inside / n;
  const kBrut = kFromCoverage(c);
  let alerte: string | null = null;
  if (c > 0.9) alerte = 'Couverture supérieure à 90 % : fourchettes trop larges, revue en atelier (R-BT-04)';
  else if (kBrut > 2) alerte = 'k supérieur à 2 : l\'hypothèse repasse en atelier (R-BT-03)';
  return {
    n, couverture: c, sousP10: below / n, surP90: above / n, pitClasses: classes, pitPValue: 1 - chi2Cdf(chi2, 4),
    biais, k: Math.min(2, Math.max(1, kBrut)), kBrut, alerte,
  };
}

/** CRPS d'un échantillon contre un réalisé : E|X - y| - ½ E|X - X'| (annexe E). */
export function crps(sample: ArrayLike<number>, y: number): number {
  const s = sorted(sample);
  const n = s.length;
  let a = 0;
  for (let i = 0; i < n; i++) a += Math.abs(s[i] - y);
  // E|X - X'| sur un échantillon trié : 2 Σ (2i - n + 1) x(i) / n².
  let b = 0;
  for (let i = 0; i < n; i++) b += (2 * i - n + 1) * s[i];
  return a / n - b / (n * n);
}

export function runBacktest(n = 2000, data = syntheticData()): BacktestResult {
  const observations: Observation[] = [];
  const trimestres: BacktestResult['trimestres'] = [];
  let brier = 0, crpsSum = 0, absErr = 0, nq = 0;
  data.budgets.forEach((py: PastYear, k: number) => {
    const ctx = samplingContext(py.registre);
    // R-BT-01 : registre, corrélations et données de l'époque uniquement.
    const d = drawAll(py.registre, py.budget, { n, graine: 2024 + k }, ctx);
    const seas = seasonality(py.budget);
    for (const code of HYP_CODES) {
      for (let q = 0; q < 4; q++) {
        const sim = sorted(simulatedQuarter(d, code, q, seas));
        const r = realizedQuarter(py.verite, code, q, seas);
        let below = 0;
        while (below < sim.length && sim[below] < r) below++;
        observations.push({
          annee: py.annee, trimestre: q + 1, code, realise: r,
          p10: percentileSorted(sim, 0.1), p50: percentileSorted(sim, 0.5), p90: percentileSorted(sim, 0.9),
          pit: below / sim.length,
        });
      }
    }
    const pl = runPL(py.budget, d);
    const bm = budgetLines(py);
    for (let q = 0; q < 4; q++) {
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let t = 3 * q; t < 3 * q + 3; t++) x[i] += pl.monthly[i * 12 + t];
      const bud = bm[3 * q] + bm[3 * q + 1] + bm[3 * q + 2];
      const real = py.realise[3 * q][7] + py.realise[3 * q + 1][7] + py.realise[3 * q + 2][7];
      const st = computeStats(x, bud - 1e-12);
      const o = real >= bud ? 1 : 0;
      brier += (st.prob - o) ** 2;
      crpsSum += crps(x, real);
      absErr += Math.abs(bud - real);
      nq++;
      trimestres.push({ annee: py.annee, trimestre: q + 1, budget: bud, realise: real, prob: st.prob, p10: st.p10, p50: st.p50, p90: st.p90 });
    }
  });
  const parHypothese = HYP_CODES.map((code) => ({ code, ...tests(observations.filter((o) => o.code === code)) }));
  const global = tests(observations);
  brier /= nq;
  const crpsM = crpsSum / nq;
  const errM = absErr / nq;
  const pct = (x: number) => `${(100 * x).toFixed(0)} %`;
  const biasMax = Math.max(...parHypothese.map((h) => Math.abs(h.biais)));
  const verdicts = [
    { test: 'Couverture P10-P90', mesure: pct(global.couverture), seuil: '70 % à 90 %, cible 80 %', ok: global.couverture >= 0.7 && global.couverture <= 0.9 },
    { test: 'Queues', mesure: `${pct(global.sousP10)} sous le P10, ${pct(global.surP90)} au-dessus du P90`, seuil: 'chacune entre 5 % et 15 %', ok: [global.sousP10, global.surP90].every((x) => x >= 0.05 && x <= 0.15) },
    { test: 'Uniformité du PIT', mesure: `p = ${global.pitPValue.toFixed(3).replace('.', ',')}`, seuil: 'non rejetée au seuil de 5 %', ok: global.pitPValue >= 0.05 },
    { test: 'Biais', mesure: `max ${(100 * biasMax).toFixed(1).replace('.', ',')} % (${parHypothese.reduce((a, h) => (Math.abs(h.biais) > Math.abs(a.biais) ? h : a)).code})`, seuil: 'au plus 1 % en valeur absolue', ok: biasMax <= 0.01 },
    { test: 'Score de Brier', mesure: brier.toFixed(3).replace('.', ','), seuil: 'meilleur que 0,25', ok: brier < 0.25 },
    { test: 'CRPS', mesure: `${crpsM.toFixed(3).replace('.', ',')} GAr contre ${errM.toFixed(3).replace('.', ',')}`, seuil: 'inférieur à l\'erreur absolue du budget déterministe', ok: crpsM < errM },
  ];
  const synthese = `Backtest 2024-2026 (${global.n} observations trimestrielles) : couverture P10-P90 de ${pct(global.couverture)} pour 80 % visés, coefficient d'élargissement proposé k = ${global.k.toFixed(2).replace('.', ',')}.`;
  return { observations, parHypothese, global, brier, crps: crpsM, erreurDeterministe: errM, trimestres, verdicts, synthese };
}

function budgetLines(py: PastYear): number[] {
  const b = py.budget;
  return Array.from({ length: 12 }, (_, t) => {
    let ca = 0, cm = 0;
    for (let i = 0; i < b.bu.length; i++) {
      ca += b.ca[i][t];
      cm += b.cmImp[i][t] + b.cmLoc[i][t];
    }
    return ca - cm - b.carburant[t] - b.sousTraitance[t] - b.autresTransport[t] - b.masseSalariale[t] - (b.fcTauxVariable * ca + b.fcFixe[t]) - b.fraisGeneraux[t];
  });
}

/** Applique la calibration au registre : k global, et décalage du P50 des volumes si le biais dépasse 1 % (11.2). */
export function applyCalibration(reg: Registry, bt: BacktestResult, shiftBias = true): Registry {
  const r = structuredClone(reg);
  for (const h of r.hypotheses) {
    h.k = Math.round(bt.global.k * 100) / 100;
    const ph = bt.parHypothese.find((x) => x.code === h.code)!;
    if (shiftBias && VOL.includes(h.code) && Math.abs(ph.biais) > 0.01 && h.p50 != null) {
      const f = 1 + ph.biais;
      h.p10 = round4(h.p10! * f);
      h.p50 = round4(h.p50 * f);
      h.p90 = round4(h.p90! * f);
    }
  }
  r.version = `${reg.version}-calibré`;
  r.statut = 'brouillon';
  return r;
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * TC14 : calibration sur vérité connue. Le générateur tire `nReal` réalisés 2027 du processus vrai ;
 * le moteur, nourri des vrais paramètres, doit les couvrir à 80 % entre son P10 et son P90.
 */
export function knownTruthCoverage(nReal = 1000, n = 10000): number {
  const budget = expandBudget(ALFA_COMPACT);
  const truth = trueRegistry();
  const ctx = samplingContext(truth);
  const real = runPL(budget, drawAll(truth, budget, { n: nReal, graine: 777, simple: true }, ctx)).annual;
  const sim = sorted(runPL(budget, drawAll(truth, budget, { n, graine: 2027 }, ctx)).annual);
  const p10 = percentileSorted(sim, 0.1);
  const p90 = percentileSorted(sim, 0.9);
  let k = 0;
  for (const x of real) if (x >= p10 && x <= p90) k++;
  return k / nReal;
}
