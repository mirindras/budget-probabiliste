/** M9 : contrôles C01 à C12 exécutés à chaque run (section 12). */
import { BUMPS, buildEffects, type Effects } from './levers.ts';
import { NL, runPL, type PLResult } from './pl.ts';
import { batchProbSE, batchQuantileSE } from './risk.ts';
import { budgetValues, drawAll, pointDraws, seasonality, type Draws, type SamplingContext } from './sampling.ts';
import { pearson, percentileSorted, ranks, sorted } from './stats.ts';
import { DRIVER_CODES, HYP_CODES, type Actuals, type BudgetGrid, type Registry, type Scenario } from './types.ts';

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

export function reconciliation(budget: BudgetGrid): number {
  const d = pointDraws(budget.bu.length, budgetValues(), new Array(12).fill(budget.coursBudget));
  return runPL(budget, d, { noise: false, events: false }).annual[0];
}

export interface ControlInput {
  scenario: Scenario;
  budget: BudgetGrid;
  reg: Registry;
  ctx: SamplingContext;
  draws: Draws;
  base: PLResult;
  effects: Effects;
  actuals?: Actuals;
  dernierCours?: number;
}

export function runControls(inp: ControlInput): ControlResult[] {
  const { budget, reg, ctx, draws: d, base, scenario } = inp;
  const out: ControlResult[] = [];
  const n = d.n;
  const target = budget.ebitdaPublie;

  // C01 Réconciliation.
  const c01 = reconciliation(budget);
  const e01 = Math.abs(c01 - target) * 1000;
  out.push({ code: 'C01', libelle: 'Réconciliation : hypothèses au budget, bruit et événements désactivés', seuil: 'écart ≤ 1 MAr', nature: 'Bloquant', ok: e01 <= 1, valeur: `${fmt(e01, 2)} MAr`, detail: `EBITDA recalculé ${fmt(c01, 4)} GAr pour ${fmt(target, 3)} GAr publié` });

  // C02 Cohérence des agrégats.
  let e02 = 0;
  const L = base.lines!;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = 0; t < 12; t++) s += base.monthly[i * 12 + t];
    e02 = Math.max(e02, Math.abs(s - base.annual[i]));
    const o = i * NL;
    e02 = Math.max(e02, Math.abs(L[o] - L[o + 1] + L[o + 2] - L[o + 3] - L[o + 4] - L[o + 5] - L[o + 6] - L[o + 7]));
    if (!scenario.moisClos) {
      let m = 0;
      for (let b = 0; b < d.nb; b++) m += base.buMargin![i * d.nb + b];
      e02 = Math.max(e02, Math.abs(m - (L[o] - L[o + 1])));
    }
  }
  out.push({ code: 'C02', libelle: 'Cohérence des agrégats : mois vers année, BU vers total, lignes vers EBITDA', seuil: 'écart nul', nature: 'Bloquant', ok: e02 < 1e-9, valeur: e02 < 1e-9 ? 'conforme' : `${e02.toExponential(2)} GAr` });

  // C03 Corrélations de rang empiriques contre cibles.
  const nd = DRIVER_CODES.length;
  const cols = DRIVER_CODES.map((_, j) => {
    const c = new Float64Array(n);
    for (let i = 0; i < n; i++) c[i] = d.z[i * nd + j];
    return ranks(c);
  });
  let e03 = 0;
  let worst = '';
  for (let a = 0; a < nd; a++) {
    for (let b = a + 1; b < nd; b++) {
      const tgt = ctx.copula.corrected ? (6 / Math.PI) * Math.asin(ctx.copula.copula[a][b] / 2) : ctx.copula.rank[a][b];
      const diff = Math.abs(pearson(cols[a], cols[b]) - tgt);
      if (diff > e03) {
        e03 = diff;
        worst = `${DRIVER_CODES[a]} / ${DRIVER_CODES[b]}`;
      }
    }
  }
  out.push({ code: 'C03', libelle: 'Corrélations de rang empiriques contre cibles', seuil: 'écart maximal ≤ 0,05', nature: 'Bloquant', ok: e03 <= 0.05, valeur: fmt(e03), detail: `paire la plus éloignée : ${worst}` });

  // C04 Matrice semi-définie positive.
  const cp = ctx.copula;
  out.push({
    code: 'C04', libelle: 'Matrice semi-définie positive', seuil: 'plus petite valeur propre ≥ 0', nature: 'Bloquant',
    ok: cp.minEigenAfter >= 0, valeur: fmt(cp.minEigenBefore),
    detail: cp.corrected
      ? `Matrice corrigée (Higham), valeur propre après correction ${fmt(cp.minEigenAfter, 4)}. Paires déplacées de plus de 0,05 : ${cp.moved.map((m) => `${m.a}/${m.b} ${fmt(m.avant, 2)} → ${fmt(m.apres, 2)}`).join(', ') || 'aucune'}`
      : 'aucune correction',
  });

  // C05 Quantiles empiriques contre P10 et P90 saisis.
  let e05 = 0;
  let w05 = '';
  for (const code of HYP_CODES) {
    if (code === 'H06') continue;
    const law = ctx.laws[code]!;
    const s = sorted(d.h[code]);
    for (const p of [0.1, 0.9]) {
      const diff = Math.abs(law.cdf(percentileSorted(s, p)) - p) * 100;
      if (diff > e05) {
        e05 = diff;
        w05 = `${code} ${p === 0.1 ? 'P10' : 'P90'}`;
      }
    }
  }
  out.push({ code: 'C05', libelle: 'Quantiles empiriques contre P10 et P90 saisis', seuil: '≤ 1 point de percentile', nature: 'Bloquant', ok: e05 <= 1, valeur: `${fmt(e05, 2)} point`, detail: `écart maximal : ${w05}` });

  // C06 Reproductibilité.
  const d2 = drawAll(reg, budget, { n, graine: scenario.graine, moisClos: scenario.moisClos, dernierCours: inp.dernierCours }, ctx);
  const r2 = runPL(budget, d2, { effects: inp.effects, actuals: inp.actuals });
  const r1 = runPL(budget, d, { effects: inp.effects, actuals: inp.actuals });
  let same = true;
  for (let i = 0; i < n; i++) if (!Object.is(r1.annual[i], r2.annual[i])) same = false;
  out.push({ code: 'C06', libelle: 'Reproductibilité : deux runs, même graine', seuil: 'identiques bit à bit', nature: 'Bloquant', ok: same, valeur: same ? 'identiques' : 'différents' });

  // C07 Convergence.
  const seP10 = batchQuantileSE(base.annual, 0.1) * 1000;
  const seProb = batchProbSE(base.annual, target) * 100;
  const okN = n >= N_MIN;
  const okSe = seP10 <= 0.005 * target * 1000;
  out.push({
    code: 'C07', libelle: 'Convergence', seuil: `N ≥ ${N_MIN.toLocaleString('fr-FR')}, erreur-type du P10 ≤ 0,5 % du budget`, nature: 'Bloquant',
    ok: okN && okSe, valeur: `N = ${n.toLocaleString('fr-FR')}, ET P10 ${fmt(seP10, 0)} MAr`,
    detail: `estimations par lots (prudentes : elles ignorent le gain du LHS) ; IC 95 % de la probabilité ±${fmt(1.96 * seProb, 1)} pt`,
  });

  // C08 Bornes physiques.
  let viol = base.boundHits;
  for (let i = 0; i < n; i++) if (!(d.h.H04[i] > 0 && d.h.H07[i] > 0 && d.h.H08[i] > 0)) viol++;
  out.push({ code: 'C08', libelle: 'Bornes physiques : volumes, prix, cours', seuil: 'aucune violation', nature: 'Bloquant', ok: viol === 0, valeur: viol === 0 ? 'aucune' : `${viol} itérations` });

  // C09 Monotonie.
  let v09 = 0;
  for (const bump of BUMPS) {
    const r = runPL(budget, d, { effects: { ...inp.effects, bump }, actuals: inp.actuals });
    for (let i = 0; i < n; i++) if (!(r.annual[i] < base.annual[i])) v09++;
  }
  out.push({ code: 'C09', libelle: 'Monotonie : +1 % sur chaque charge et sur le cours fait baisser l\'EBITDA', seuil: 'aucune violation', nature: 'Bloquant', ok: v09 === 0, valeur: v09 === 0 ? `aucune sur ${(BUMPS.length * n).toLocaleString('fr-FR')} tests` : `${v09} violations` });

  // C10 Fréquence des événements.
  const rem = (12 - scenario.moisClos) / 12;
  const freqs = (['E01', 'E02', 'E03'] as const).map((c) => {
    let k = 0;
    for (let i = 0; i < n; i++) k += d.occ[c][i];
    return { c, f: k / n, p: ctx.events[c].p * rem };
  });
  const ok10 = freqs.every((x) => Math.abs(x.f - x.p) <= 0.01);
  out.push({ code: 'C10', libelle: 'Fréquence des événements contre probabilité saisie', seuil: '±1 point', nature: 'Alerte', ok: ok10, valeur: freqs.map((x) => `${fmt(x.f * 100, 1)} %`).join(', ') });

  // C11 Bruit mensuel recentré.
  const seas = seasonality(budget);
  const m = scenario.moisClos;
  let e11 = 0;
  for (let i = 0; i < n; i++) {
    for (let b = 0; b < d.nb; b++) {
      let s = 0;
      let ws = 0;
      for (let t = m; t < 12; t++) {
        s += seas[b][t] * (1 + d.noise[(i * d.nb + b) * 12 + t]);
        ws += seas[b][t];
      }
      e11 = Math.max(e11, Math.abs(s / ws - 1));
    }
  }
  out.push({ code: 'C11', libelle: 'Bruit mensuel recentré : total annuel inchangé', seuil: 'écart ≤ 0,01 %', nature: 'Bloquant', ok: e11 <= 1e-4, valeur: e11 < 1e-12 ? '0' : `${fmt(e11 * 100, 6)} %` });

  // C12 Complétude du registre.
  const items = [...reg.hypotheses, ...reg.evenements];
  const missing = items.filter((h) => !h.proprietaire?.trim() || !h.justification?.trim() || !(h.statut === 'valide' || h.statut === 'gele'));
  out.push({
    code: 'C12', libelle: 'Complétude du registre : propriétaire, justification, statut validé', seuil: '100 %', nature: 'Bloquant',
    ok: missing.length === 0, valeur: `${Math.round((100 * (items.length - missing.length)) / items.length)} %`,
    detail: missing.length ? `incomplètes : ${missing.map((h) => h.code).join(', ')}` : undefined,
  });
  return out;
}

/** Effets d'un ensemble de leviers, raccourci pour les contrôles. */
export function effectsFor(s: Scenario): Effects {
  return buildEffects(s.actifs, s.leviers, s.stress);
}
