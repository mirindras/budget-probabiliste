/**
 * Jeu de données synthétiques ALFA (section 16) : générateur documenté à graine fixe.
 *
 * Processus générateur (« vérité connue ») :
 * - mêmes lois que le registre 2027, fourchettes élargies d'un facteur K_VRAI = 1,5 autour du P50
 *   (les fourchettes des métiers sont volontairement trop étroites : couverture proche de 60 %) ;
 * - volumes réels 1,5 % sous le P50 des propriétaires (biais d'optimisme des budgets) ;
 * - change en marche aléatoire, dérive 4 % par an, volatilité mensuelle 1,8 % × 1,5 ;
 * - chocs mensuels corrélés selon la matrice cible, 60 mois de 2022 à 2026, puis 2027 pour l'atterrissage ;
 * - événements tirés avec les probabilités du registre, journal fourni.
 * Données synthétiques : aucune donnée d'entreprise réelle.
 */
import { ALFA_COMPACT, alfaRegistry, expandBudget, type CompactBudget } from './alfa.ts';
import { setupCopula } from './copula.ts';
import { ar1, gaussian } from './dynamics.ts';
import { makeLaw } from './laws.ts';
import { NL, runPL } from './pl.ts';
import { Rng, subSeed } from './rng.ts';
import { pointDraws, seasonality } from './sampling.ts';
import { normCdf } from './stats.ts';
import { DRIVER_CODES, EVENT_CODES, HYP_CODES, type Actuals, type BudgetGrid, type HypCode, type Registry } from './types.ts';

export const SYNTH_SEED = 13;
/** Graine du flux de l'exercice 2027 (réalisé de l'atterrissage), indépendant des années du backtest. */
export const SEED_2027 = 13;
export const K_VRAI = 1.5;
export const BIAIS_VOLUMES = 0.015;
export const ANNEES = [2022, 2023, 2024, 2025, 2026, 2027];
export const ANNEES_BACKTEST = [2024, 2025, 2026];

/** Registre du processus générateur : fourchettes élargies, volumes décalés. */
export function trueRegistry(base: Registry = alfaRegistry()): Registry {
  const r = structuredClone(base);
  for (const h of r.hypotheses) {
    h.k = K_VRAI;
    if (h.code === 'H01' || h.code === 'H02' || h.code === 'H03') {
      h.p10 = h.p10! / (1 + BIAIS_VOLUMES);
      h.p50 = h.p50! / (1 + BIAIS_VOLUMES);
      h.p90 = h.p90! / (1 + BIAIS_VOLUMES);
    }
  }
  r.version = 'processus générateur';
  return r;
}

export interface YearTruth {
  annee: number;
  /** Facteurs annuels réalisés des hypothèses continues (hors H06). */
  h: Record<Exclude<HypCode, 'H06'>, number>;
  /** Cours mensuels réalisés. */
  cours: number[];
  /** Bruit mensuel réalisé des volumes, [bu][mois]. */
  bruit: number[][];
  evenements: { code: string; mois: number; amplitude: number; surcout?: number }[];
  /** Chocs mensuels corrélés (normales), [mois][driver]. */
  chocs: number[][];
}

export interface PastYear {
  annee: number;
  budget: BudgetGrid;
  registre: Registry;
  /** Réalisé mensuel : lignes du P&L, [mois][ligne]. */
  realise: number[][];
  verite: YearTruth;
}

export interface SyntheticData {
  annees: YearTruth[];
  /** Cours EUR/MGA mensuels de janvier 2022 à décembre 2027. */
  cours: { annee: number; mois: number; cours: number }[];
  budgets: PastYear[];
  /** Réalisé 2027, pour le mode atterrissage. */
  realise2027: Actuals;
  journal: { annee: number; mois: number; code: string; libelle: string; amplitude: number }[];
  /** Corrélations de rang observées sur 60 mois (R-DE-03). */
  correlationsObservees: Record<string, number>;
  /** Intervalle P10-P90 historique équivalent, estimé sur 5 ans (R-HY-02). */
  intervalleHistorique: Record<string, number>;
}

/** Budget d'un exercice passé : ALFA à l'échelle de l'année (croissance de 9,2 % par an en valeur). */
export function pastBudget(annee: number, coursBudget: number): BudgetGrid {
  const f = 1 / 1.092 ** (2027 - annee);
  const b: CompactBudget = structuredClone(ALFA_COMPACT);
  b.libelle = `ALFA Distribution, budget ${annee}`;
  b.exercice = annee;
  b.ca = b.ca.map((x) => x * f);
  b.cout_matiere = b.cout_matiere.map((x) => x * f);
  b.transport = { carburant: b.transport.carburant * f, sous_traitance: b.transport.sous_traitance * f, autres: b.transport.autres * f };
  b.masse_salariale *= f;
  b.frais_commerciaux = { ...b.frais_commerciaux, total: b.frais_commerciaux.total * f };
  b.frais_generaux *= f;
  b.cours_budget_eur_mga = coursBudget;
  b.ebitda *= f;
  return expandBudget(b, 'alfa');
}

let cache: SyntheticData | null = null;

export function syntheticData(): SyntheticData {
  if (!cache) cache = generate(SYNTH_SEED, SEED_2027);
  return cache;
}

export function generate(seed: number, seed2027 = SEED_2027): SyntheticData {
  const reg = alfaRegistry();
  const truth = trueRegistry(reg);
  const laws = Object.fromEntries(HYP_CODES.filter((c) => c !== 'H06').map((c) => [c, makeLaw(truth.hypotheses.find((h) => h.code === c)!)]));
  const L = setupCopula(reg.correlations_rang).cholesky;
  const nd = DRIVER_CODES.length;
  const streams = (sd: number) => ({ rng: new Rng(subSeed(sd, 11)), ev: new Rng(subSeed(sd, 12)), noise: new Rng(subSeed(sd, 13)) });
  const past = streams(seed);
  const next = streams(seed2027 + 1_000_000);
  const h6 = reg.hypotheses.find((h) => h.code === 'H06')!;
  const mu = h6.derive_annuelle! / 12;
  const vol = h6.volatilite_mensuelle! * K_VRAI;
  const seas = seasonality(expandBudget(ALFA_COMPACT));

  // Chocs mensuels corrélés et trajectoire du change (log), de janvier 2022 à décembre 2027.
  const annees: YearTruth[] = [];
  const lnFx: number[] = [];
  let ln = 0;
  const journal: SyntheticData['journal'] = [];
  for (const annee of ANNEES) {
    const { rng, ev: rngEv, noise: rngNoise } = annee === 2027 ? next : past;
    const chocs: number[][] = [];
    const sum = new Float64Array(nd);
    for (let t = 0; t < 12; t++) {
      const e = Array.from({ length: nd }, () => gaussian(rng));
      const zc = L.map((row) => row.reduce((a, l, c) => a + l * e[c], 0));
      chocs.push(zc);
      for (let j = 0; j < nd; j++) sum[j] += zc[j];
      ln += mu + vol * zc[HYP_CODES.indexOf('H06')];
      lnFx.push(ln);
    }
    const za = Array.from(sum, (x) => x / Math.sqrt(12));
    const h = {} as YearTruth['h'];
    HYP_CODES.forEach((c, j) => {
      if (c !== 'H06') h[c] = laws[c]!.quantile(za[j]);
    });
    const evenements: YearTruth['evenements'] = [];
    EVENT_CODES.forEach((c, k) => {
      const ev = truth.evenements.find((e) => e.code === c)!;
      const mois = rngEv.int(0, 11);
      const amplitude = ev.amplitude[0] + (ev.amplitude[1] - ev.amplitude[0]) * rngEv.uniform();
      const surcout = ev.surcout ? ev.surcout[0] + (ev.surcout[1] - ev.surcout[0]) * rngEv.uniform() : undefined;
      if (normCdf(za[HYP_CODES.length + k]) > 1 - ev.p) {
        evenements.push({ code: c, mois, amplitude, surcout });
        journal.push({ annee, mois: mois + 1, code: c, libelle: ev.libelle, amplitude });
      }
    });
    const bruit = seas.map((s) => {
      const out = new Float64Array(12);
      ar1(rngNoise, reg.bruit_volumes.phi, reg.bruit_volumes.sigma_mensuel, out, 0, 0, s);
      return Array.from(out);
    });
    annees.push({ annee, h, cours: [], bruit, evenements, chocs });
  }
  // Niveau du change calé pour finir décembre 2026 à 5 100 (dernier cours connu du registre 2027).
  const shift = Math.log(h6.depart!) - lnFx[59];
  const cours = lnFx.map((x, i) => ({ annee: 2022 + Math.floor(i / 12), mois: (i % 12) + 1, cours: Math.exp(x + shift) }));
  annees.forEach((y, k) => (y.cours = cours.slice(k * 12, k * 12 + 12).map((c) => c.cours)));

  // Budgets, registres d'époque et réalisés 2024 à 2026.
  const budgets: PastYear[] = ANNEES_BACKTEST.map((annee) => {
    const y = annees[ANNEES.indexOf(annee)];
    const dernier = annees[ANNEES.indexOf(annee) - 1].cours[11];
    const budget = pastBudget(annee, Math.round((dernier * 1.02) / 50) * 50);
    const registre = structuredClone(reg);
    registre.version = `${annee}`;
    registre.hypotheses.find((h) => h.code === 'H06')!.depart = Math.round(dernier);
    return { annee, budget, registre, realise: realizedLines(budget, y), verite: y };
  });
  const y27 = annees[annees.length - 1];
  const lignes2027 = realizedLines(expandBudget(ALFA_COMPACT), y27);

  // Corrélations observées sur les 60 mois de 2022 à 2026.
  const months = annees.slice(0, 5).flatMap((y) => y.chocs);
  const correlationsObservees: Record<string, number> = {};
  for (const [a, b] of reg.correlations_rang) {
    const ia = DRIVER_CODES.indexOf(a);
    const ib = DRIVER_CODES.indexOf(b);
    correlationsObservees[`${a}/${b}`] = spearmanCols(months.map((r) => r[ia]), months.map((r) => r[ib]));
  }
  // Intervalle historique équivalent : 2,563 écarts-types des facteurs annuels réalisés sur 5 ans.
  const intervalleHistorique: Record<string, number> = {};
  for (const c of HYP_CODES) {
    const v = c === 'H06'
      ? annees.slice(0, 5).map((y) => y.cours.reduce((a, x) => a + x, 0) / 12 / (y.cours[0] / Math.exp(mu)))
      : annees.slice(0, 5).map((y) => y.h[c as Exclude<HypCode, 'H06'>]);
    const m = v.reduce((a, x) => a + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
    intervalleHistorique[c] = 2.563 * sd;
  }
  return {
    annees, cours, budgets,
    realise2027: { lignes: lignes2027, cours: y27.cours },
    journal, correlationsObservees, intervalleHistorique,
  };
}

/** P&L mensuel réalisé d'une année, à partir des drivers réalisés. */
export function realizedLines(budget: BudgetGrid, y: YearTruth): number[][] {
  const d = pointDraws(budget.bu.length, y.h, y.cours);
  for (const e of y.evenements) {
    const c = e.code as 'E01' | 'E02' | 'E03';
    d.occ[c][0] = 1;
    d.month[c][0] = e.mois;
    d.amp[c][0] = e.amplitude;
    if (c === 'E03') d.e03Cost[0] = e.surcout ?? 0;
  }
  for (let b = 0; b < budget.bu.length; b++) for (let t = 0; t < 12; t++) d.noise[b * 12 + t] = y.bruit[b][t];
  const r = runPL(budget, d, { noise: true, events: true, monthlyLines: true });
  return Array.from({ length: 12 }, (_, t) => Array.from(r.monthlyLines!.subarray(t * NL, t * NL + NL)));
}

function spearmanCols(a: number[], b: number[]): number {
  const rk = (x: number[]) => {
    const idx = x.map((_, i) => i).sort((i, j) => x[i] - x[j]);
    const r = new Array<number>(x.length);
    idx.forEach((i, k) => (r[i] = k + 1));
    return r;
  };
  const ra = rk(a);
  const rb = rk(b);
  const n = a.length;
  const m = (n + 1) / 2;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (ra[i] - m) * (rb[i] - m);
    saa += (ra[i] - m) ** 2;
    sbb += (rb[i] - m) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}
