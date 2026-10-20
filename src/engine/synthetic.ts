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
import { ar1, gaussian } from './dynamics.ts';
import { buildModel } from './model.ts';
import { runPL } from './pl.ts';
import { Rng, subSeed } from './rng.ts';
import { pointDraws } from './sampling.ts';
import { normCdf } from './stats.ts';
import type { Actuals, Budget, Registry } from './types.ts';

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
    if (h.effet === 'volume') {
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
  /** Facteurs annuels réalisés des hypothèses continues (hors change), par code. */
  h: Record<string, number>;
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
  budget: Budget;
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
export function pastBudget(annee: number, coursBudget: number): Budget {
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
  const alfa = expandBudget(ALFA_COMPACT);
  const mTruth = buildModel(alfa, truth);
  const mReg = buildModel(alfa, reg);
  const L = mReg.copula.cholesky;
  const nd = mReg.nd;
  const nh = mReg.nh;
  const jFx = mReg.fxIndex;
  const streams = (sd: number) => ({ rng: new Rng(subSeed(sd, 11)), ev: new Rng(subSeed(sd, 12)), noise: new Rng(subSeed(sd, 13)) });
  const past = streams(seed);
  const next = streams(seed2027 + 1_000_000);
  const h6 = reg.hypotheses[jFx];
  const mu = h6.derive_annuelle! / 12;
  const vol = h6.volatilite_mensuelle! * K_VRAI;
  const seas = mReg.seas;

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
      ln += mu + vol * zc[jFx];
      lnFx.push(ln);
    }
    const za = Array.from(sum, (x) => x / Math.sqrt(12));
    const h: YearTruth['h'] = {};
    mTruth.hyps.forEach((x, j) => {
      if (mTruth.laws[j]) h[x.code] = mTruth.laws[j]!.quantile(za[j]);
    });
    const evenements: YearTruth['evenements'] = [];
    truth.evenements.forEach((ev, k) => {
      const mois = rngEv.int(0, 11);
      const amplitude = ev.amplitude[0] + (ev.amplitude[1] - ev.amplitude[0]) * rngEv.uniform();
      const surcout = ev.surcout ? ev.surcout[0] + (ev.surcout[1] - ev.surcout[0]) * rngEv.uniform() : undefined;
      if (normCdf(za[nh + k]) > 1 - ev.p) {
        evenements.push({ code: ev.code, mois, amplitude, surcout });
        journal.push({ annee, mois: mois + 1, code: ev.code, libelle: ev.libelle, amplitude });
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
    registre.hypotheses[jFx].depart = Math.round(dernier);
    return { annee, budget, registre, realise: realizedLines(budget, y), verite: y };
  });
  const y27 = annees[annees.length - 1];
  const lignes2027 = realizedLines(expandBudget(ALFA_COMPACT), y27);

  // Corrélations observées sur les 60 mois de 2022 à 2026.
  const months = annees.slice(0, 5).flatMap((y) => y.chocs);
  const correlationsObservees: Record<string, number> = {};
  for (const [a, b] of reg.correlations_rang) {
    const ia = mReg.codes.indexOf(a);
    const ib = mReg.codes.indexOf(b);
    correlationsObservees[`${a}/${b}`] = spearmanCols(months.map((r) => r[ia]), months.map((r) => r[ib]));
  }
  // Intervalle historique équivalent : 2,563 écarts-types des facteurs annuels réalisés sur 5 ans.
  const intervalleHistorique: Record<string, number> = {};
  for (const { code: c } of reg.hypotheses) {
    const v = c === reg.hypotheses[jFx].code
      ? annees.slice(0, 5).map((y) => y.cours.reduce((a, x) => a + x, 0) / 12 / (y.cours[0] / Math.exp(mu)))
      : annees.slice(0, 5).map((y) => y.h[c]);
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

/** P&L mensuel réalisé d'une année, à partir des drivers réalisés : une ligne par rubrique, puis l'EBITDA. */
export function realizedLines(budget: Budget, y: YearTruth, reg: Registry = alfaRegistry()): number[][] {
  const m = buildModel(budget, reg);
  const d = pointDraws(m, y.h, y.cours);
  for (const e of y.evenements) {
    const k = m.eventIndex.get(e.code)!;
    d.occ[k][0] = 1;
    d.month[k][0] = e.mois;
    d.amp[k][0] = e.amplitude;
    d.cost[k][0] = e.surcout ?? 0;
  }
  for (let b = 0; b < m.nb; b++) for (let t = 0; t < 12; t++) d.noise[b * 12 + t] = y.bruit[b][t];
  const r = runPL(m, d, { noise: true, events: true, monthlyLines: true });
  const nl = r.nl;
  return Array.from({ length: 12 }, (_, t) => Array.from(r.monthlyLines!.subarray(t * nl, t * nl + nl)));
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
