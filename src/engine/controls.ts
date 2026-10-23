/** M9 : contrôles C01 à C12 exécutés à chaque run (section 12). */
import { bumps, buildEffects, type Effects } from './levers.ts';
import { buildModel, type Model } from './model.ts';
import { runPL, type PLResult } from './pl.ts';
import { batchProbSE, batchQuantileSE } from './risk.ts';
import { budgetValues, drawAll, pointDraws, type Draws } from './sampling.ts';
import { pearson, percentileSorted, ranks, sorted } from './stats.ts';
import type { Actuals, Budget, Registry, Scenario } from './types.ts';

export interface ControlResult {
  code: string;
  libelle: string;
  seuil: string;
  nature: 'Bloquant' | 'Alerte';
  ok: boolean;
  valeur: string;
  detail?: string;
}

/** N minimal fixé par les mesures de convergence de la section 7.4 (LHS). */
export const N_MIN = 5000;

const fmt = (x: number, d = 3) => x.toFixed(d).replace('.', ',');

/** EBITDA recalculé, hypothèses au budget, change au cours budget, sans bruit ni événement. */
export function reconciliationOf(m: Model): number {
  const d = pointDraws(m, budgetValues(m), new Array(12).fill(m.coursBudget));
  return runPL(m, d, { noise: false, events: false }).annual[0];
}

/** Réconciliation d'un budget seul : un registre vide suffit, les postes restent au budget. */
export function reconciliation(budget: Budget): number {
  const empty: Registry = { version: '', statut: 'brouillon', hypotheses: [], evenements: [], correlations_rang: [], bruit_volumes: { phi: 0, sigma_mensuel: 0 } };
  return reconciliationOf(buildModel(budget, empty));
}

export interface ControlInput {
  scenario: Scenario;
  model: Model;
  draws: Draws;
  base: PLResult;
  effects: Effects;
  actuals?: Actuals;
  dernierCours?: number;
}

export function runControls(inp: ControlInput): ControlResult[] {
  const { model: m, draws: d, base, scenario } = inp;
  const budget = m.budget;
  const reg = m.reg;
  const out: ControlResult[] = [];
  const n = d.n;
  const target = budget.ebitdaPublie;
  const U = budget.unites;

  // C01 Réconciliation.
  const c01 = reconciliationOf(m);
  const e01 = Math.abs(c01 - target) * 1000;
  out.push({ code: 'C01', libelle: 'Réconciliation : hypothèses au budget, bruit et événements désactivés', seuil: `écart ≤ 1 ${U.detail}`, nature: 'Bloquant', ok: e01 <= 1, valeur: `${fmt(e01, 2)} ${U.detail}`, detail: `EBITDA recalculé ${fmt(c01, 4)} ${U.principale} pour ${fmt(target, 3)} ${U.principale} publié` });

  // C02 Cohérence des agrégats.
  let e02 = 0;
  const L = base.lines!;
  const nl = base.nl;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = 0; t < 12; t++) s += base.monthly[i * 12 + t];
    e02 = Math.max(e02, Math.abs(s - base.annual[i]));
    const o = i * nl;
    let e = 0;
    for (let r = 0; r < m.nr; r++) e += m.rubSign[r] * L[o + r];
    e02 = Math.max(e02, Math.abs(e - L[o + m.nr]));
    let bu = 0;
    for (let b = 0; b < m.nb; b++) bu += base.buMargin![i * m.nb + b];
    e02 = Math.max(e02, Math.abs(bu - base.buCheck![i]));
  }
  out.push({ code: 'C02', libelle: 'Cohérence des agrégats : mois vers année, BU vers total, rubriques vers EBITDA', seuil: 'écart nul', nature: 'Bloquant', ok: e02 < 1e-9, valeur: e02 < 1e-9 ? 'conforme' : `${e02.toExponential(2)} ${U.principale}` });

  // C03 Corrélations de rang empiriques contre cibles.
  const nd = m.nd;
  const cols = m.codes.map((_, j) => {
    const c = new Float64Array(n);
    for (let i = 0; i < n; i++) c[i] = d.z[i * nd + j];
    return ranks(c);
  });
  let e03 = 0;
  let worst = '';
  for (let a = 0; a < nd; a++) {
    for (let b = a + 1; b < nd; b++) {
      const tgt = m.copula.corrected ? (6 / Math.PI) * Math.asin(m.copula.copula[a][b] / 2) : m.copula.rank[a][b];
      const diff = Math.abs(pearson(cols[a], cols[b]) - tgt);
      if (diff > e03) {
        e03 = diff;
        worst = `${m.codes[a]} / ${m.codes[b]}`;
      }
    }
  }
  out.push({ code: 'C03', libelle: 'Corrélations de rang empiriques contre cibles', seuil: 'écart maximal ≤ 0,05', nature: 'Bloquant', ok: e03 <= 0.05, valeur: fmt(e03), detail: worst ? `paire la plus éloignée : ${worst}` : 'aucune paire' });

  // C04 Matrice semi-définie positive.
  const cp = m.copula;
  out.push({
    code: 'C04', libelle: 'Matrice semi-définie positive', seuil: 'plus petite valeur propre ≥ 0', nature: 'Bloquant',
    ok: cp.minEigenAfter >= 0, valeur: fmt(Number.isFinite(cp.minEigenBefore) ? cp.minEigenBefore : 1),
    detail: cp.corrected
      ? `Matrice corrigée (Higham), valeur propre après correction ${fmt(cp.minEigenAfter, 4)}. Paires déplacées de plus de 0,05 : ${cp.moved.map((x) => `${x.a}/${x.b} ${fmt(x.avant, 2)} → ${fmt(x.apres, 2)}`).join(', ') || 'aucune'}`
      : 'aucune correction',
  });

  // C05 Quantiles empiriques contre P10 et P90 saisis.
  let e05 = 0;
  let w05 = '';
  m.hyps.forEach((h, j) => {
    const law = m.laws[j];
    if (!law) return;
    const s = sorted(d.h[j]);
    for (const p of [0.1, 0.9]) {
      const diff = Math.abs(law.cdf(percentileSorted(s, p)) - p) * 100;
      if (diff > e05) {
        e05 = diff;
        w05 = `${h.code} ${p === 0.1 ? 'P10' : 'P90'}`;
      }
    }
  });
  out.push({ code: 'C05', libelle: 'Quantiles empiriques contre P10 et P90 saisis', seuil: '≤ 1 point de percentile', nature: 'Bloquant', ok: e05 <= 1, valeur: `${fmt(e05, 2)} point`, detail: w05 ? `écart maximal : ${w05}` : undefined });

  // C06 Reproductibilité : tirages refaits à partir de la graine, P&L recalculé, comparé au run de base.
  const d2 = drawAll(m, { n, graine: scenario.graine, moisClos: scenario.moisClos, dernierCours: inp.dernierCours });
  const r2 = runPL(m, d2, { effects: inp.effects, actuals: inp.actuals });
  let same = true;
  for (let i = 0; i < n; i++) if (!Object.is(base.annual[i], r2.annual[i])) same = false;
  out.push({ code: 'C06', libelle: 'Reproductibilité : deux runs, même graine', seuil: 'identiques bit à bit', nature: 'Bloquant', ok: same, valeur: same ? 'identiques' : 'différents' });

  // C07 Convergence.
  const seP10 = batchQuantileSE(base.annual, 0.1) * 1000;
  const seProb = batchProbSE(base.annual, target) * 100;
  const okN = n >= N_MIN;
  const okSe = seP10 <= 0.005 * Math.abs(target) * 1000;
  out.push({
    code: 'C07', libelle: 'Convergence', seuil: `N ≥ ${N_MIN.toLocaleString('fr-FR')}, erreur-type du P10 ≤ 0,5 % du budget`, nature: 'Bloquant',
    ok: okN && okSe, valeur: `N = ${n.toLocaleString('fr-FR')}, ET P10 ${fmt(seP10, 0)} ${U.detail}`,
    detail: `estimations par lots (prudentes : elles ignorent le gain du LHS) ; IC 95 % de la probabilité ±${fmt(1.96 * seProb, 1)} pt`,
  });

  // C08 Bornes physiques : volumes et cours positifs, facteurs de prix et de postes strictement positifs.
  let viol = base.boundHits;
  const factors = m.hyps.flatMap((h, j) => (h.effet === 'prix' || h.effet === 'poste' ? [j] : []));
  for (let i = 0; i < n; i++) if (factors.some((j) => !(d.h[j][i] > 0))) viol++;
  out.push({ code: 'C08', libelle: 'Bornes physiques : volumes, prix, montants, cours', seuil: 'aucune violation', nature: 'Bloquant', ok: viol === 0, valeur: viol === 0 ? 'aucune' : `${viol} itérations` });

  // C09 Monotonie.
  let v09 = 0;
  const list = bumps(m);
  for (const bp of list) {
    const r = runPL(m, d, { effects: { ...inp.effects, bump: bp.rubrique, bumpFx: bp.fx }, actuals: inp.actuals });
    for (let i = 0; i < n; i++) if (!(r.annual[i] < base.annual[i])) v09++;
  }
  out.push({ code: 'C09', libelle: 'Monotonie : +1 % sur chaque charge et sur le cours fait baisser l\'EBITDA', seuil: 'aucune violation', nature: 'Bloquant', ok: v09 === 0, valeur: v09 === 0 ? `aucune sur ${(list.length * n).toLocaleString('fr-FR')} tests` : `${v09} violations` });

  // C10 Fréquence des événements.
  const rem = (12 - scenario.moisClos) / 12;
  const freqs = m.events.map((ev, k) => {
    let c = 0;
    for (let i = 0; i < n; i++) c += d.occ[k][i];
    return { f: c / n, p: ev.p * rem };
  });
  const ok10 = freqs.every((x) => Math.abs(x.f - x.p) <= 0.01);
  out.push({ code: 'C10', libelle: 'Fréquence des événements contre probabilité saisie', seuil: '±1 point', nature: 'Alerte', ok: ok10, valeur: freqs.length ? freqs.map((x) => `${fmt(x.f * 100, 1)} %`).join(', ') : 'aucun événement' });

  // C11 Bruit mensuel recentré.
  const mc = scenario.moisClos;
  let e11 = 0;
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < m.nb; b++) {
      let s = 0;
      let ws = 0;
      for (let t = mc; t < 12; t++) {
        s += m.seas[b][t] * (1 + d.noise[(i * m.nb + b) * 12 + t]);
        ws += m.seas[b][t];
      }
      if (ws > 0) e11 = Math.max(e11, Math.abs(s / ws - 1));
    }
  }
  out.push({ code: 'C11', libelle: 'Bruit mensuel recentré : total annuel inchangé', seuil: 'écart ≤ 0,01 %', nature: 'Bloquant', ok: e11 <= 1e-4, valeur: e11 < 1e-12 ? '0' : `${fmt(e11 * 100, 6)} %` });

  // C12 Complétude du registre.
  const items = [...reg.hypotheses, ...reg.evenements];
  const missing = items.filter((h) => !h.proprietaire?.trim() || !h.justification?.trim() || !(h.statut === 'valide' || h.statut === 'gele'));
  out.push({
    code: 'C12', libelle: 'Complétude du registre : propriétaire, justification, statut validé', seuil: '100 %', nature: 'Bloquant',
    ok: missing.length === 0, valeur: `${items.length ? Math.round((100 * (items.length - missing.length)) / items.length) : 100} %`,
    detail: missing.length ? `incomplètes : ${missing.map((h) => h.code).join(', ')}` : undefined,
  });
  return out;
}

/** Effets d'un ensemble de leviers, raccourci pour les contrôles. */
export function effectsFor(m: Model, s: Scenario): Effects {
  return buildEffects(m, s.actifs, s.leviers, s.stress);
}
