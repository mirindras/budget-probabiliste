/** Orchestration d'un run complet : M4 → M5 → M6 → M7 → M9 (section 3). */
import { TOOL_VERSION } from './alfa.ts';
import { checkMatrixRules } from './copula.ts';
import { runControls, type ControlResult } from './controls.ts';
import { hash } from './hash.ts';
import { asymmetry, chooseLaw, validateHypothesis } from './laws.ts';
import { buildEffects, leverMissingField, neutralEffects, PACKAGES } from './levers.ts';
import { budgetMonthly, runPL } from './pl.ts';
import {
  byBu, computeStats, contributions, eventEffects, fanChart, isolatedEffects, probAtLeast, quarterly, scenarioProfile, totalEffects,
  type BuStats, type Contribution, type Effect, type EventEffect, type FanPoint, type ProfileRow, type QuarterStats, type Stats,
} from './risk.ts';
import { drawAll, samplingContext, type Draws } from './sampling.ts';
import { percentileSorted, sorted } from './stats.ts';
import type { Actuals, BudgetGrid, CaseCode, LawKind, Scenario } from './types.ts';

export interface RunRef {
  outil: string;
  budget: string;
  registre: string;
  registreVersion: string;
  graine: number;
  n: number;
  actifs: CaseCode[];
  moisClos: number;
  date: string;
  /** Texte court affiché sous chaque résultat (12.2). */
  texte: string;
}

export interface CaseResult {
  code: string;
  libelle: string;
  type: 'levier' | 'stress' | 'paquet';
  stats: Stats;
  dProb: number;
  dP50: number;
  dP10: number;
  dEaR: number;
  cout: number | null;
  refus?: string;
}

export interface LawInfo {
  code: string;
  loi: LawKind;
  asymetrie: number | null;
  p10: number;
  p50: number;
  p90: number;
  /** P10, P50, P90 empiriques des tirages. */
  emp: [number, number, number];
}

export interface RunOutput {
  ok: true;
  /** Résultat partiel : distributions et leviers seulement, analyses et contrôles à suivre. */
  partial: boolean;
  ref: RunRef;
  budgetEbitda: number;
  budgetMonthly: number[];
  base: Stats;
  annual: Float64Array;
  selection: { codes: CaseCode[]; stats: Stats; annual: Float64Array } | null;
  cases: CaseResult[];
  targets: { objectif: number; prob: number }[];
  contributions: { items: Contribution[]; blocks: { code: string; libelle: string; part: number }[] };
  totalEffects: Effect[];
  isolated: { base: number; effects: Effect[] };
  events: EventEffect[];
  profile: ProfileRow[];
  fan: FanPoint[];
  quarters: QuarterStats[];
  bus: BuStats[];
  controls: ControlResult[];
  blocking: boolean;
  laws: LawInfo[];
  fxStats: [number, number, number];
  timings: { simulation: number; total: number };
}

export interface RunError {
  ok: false;
  errors: string[];
}

export function validateScenario(s: Scenario): string[] {
  const errors: string[] = [];
  for (const h of s.registre.hypotheses) errors.push(...validateHypothesis(h));
  for (const e of s.registre.evenements) {
    if (!(e.p >= 0 && e.p <= 1)) errors.push(`${e.code} : probabilité hors de [0 ; 1]`);
    if (!(e.amplitude[0] <= e.amplitude[1])) errors.push(`${e.code} : amplitude minimale supérieure à la maximale`);
    if (!e.proprietaire?.trim()) errors.push(`${e.code} : propriétaire manquant (principe 3)`);
  }
  errors.push(...checkMatrixRules(s.registre.correlations_rang));
  if (!(s.n >= 1000 && s.n <= 100000)) errors.push('N doit être compris entre 1 000 et 100 000 (7.1)');
  return errors;
}

export function runReference(s: Scenario, budget: BudgetGrid): RunRef {
  const b = hash(budget);
  const r = hash(s.registre);
  const actifs = [...s.actifs].sort();
  const parts = [
    `outil v${TOOL_VERSION}`, `registre ${s.registre.version} (${r.slice(0, 6)})`, `budget ${b.slice(0, 6)}`,
    `graine ${s.graine}`, `${s.n.toLocaleString('fr-FR')} itérations`,
  ];
  if (actifs.length) parts.push(`actifs ${actifs.join('+')}`);
  if (s.moisClos) parts.push(`${s.moisClos} mois clos`);
  return {
    outil: TOOL_VERSION, budget: b, registre: r, registreVersion: s.registre.version, graine: s.graine, n: s.n,
    actifs, moisClos: s.moisClos, date: new Date().toISOString(), texte: parts.join(' · '),
  };
}

export interface RunInput {
  scenario: Scenario;
  budget: BudgetGrid;
  actuals?: Actuals;
  /** Phase rapide : distributions et leviers, sans analyses ni contrôles. */
  quick?: boolean;
}

export function simulate({ scenario: s, budget, actuals, quick = false }: RunInput): RunOutput | RunError {
  const t0 = performance.now();
  const errors = validateScenario(s);
  if (errors.length) return { ok: false, errors };
  const reg = s.registre;
  const ctx = samplingContext(reg);
  const m = actuals ? Math.min(s.moisClos, actuals.lignes.length) : 0;
  const act = m > 0 ? { lignes: actuals!.lignes.slice(0, m), cours: actuals!.cours.slice(0, m) } : undefined;
  const dernierCours = act ? act.cours[m - 1] : undefined;
  const d: Draws = drawAll(reg, budget, { n: s.n, graine: s.graine, moisClos: m, dernierCours }, ctx);
  const neutral = neutralEffects();
  const base = runPL(budget, d, { effects: neutral, actuals: act, detail: true });
  const t1 = performance.now();
  const target = budget.ebitdaPublie;
  const stats = computeStats(base.annual, target);

  const caseOf = (codes: CaseCode[], code: string, libelle: string, type: CaseResult['type'], cout: number | null): CaseResult => {
    const r = runPL(budget, d, { effects: buildEffects(codes, s.leviers, s.stress), actuals: act });
    const st = computeStats(r.annual, target);
    return { code, libelle, type, stats: st, dProb: st.prob - stats.prob, dP50: st.p50 - stats.p50, dP10: st.p10 - stats.p10, dEaR: st.ear - stats.ear, cout };
  };
  const cases: CaseResult[] = [];
  for (const l of s.leviers) {
    const missing = leverMissingField(l);
    if (missing) {
      cases.push({ code: l.code, libelle: l.libelle, type: 'levier', stats, dProb: 0, dP50: 0, dP10: 0, dEaR: 0, cout: l.cout, refus: `Levier non appliqué : ${missing} manquant (R-LE-02)` });
    } else {
      cases.push(caseOf([l.code], l.code, l.libelle, 'levier', l.cout));
    }
  }
  for (const p of PACKAGES) {
    const cout = p.leviers.reduce((a, c) => a + (s.leviers.find((l) => l.code === c)?.cout ?? 0), 0);
    cases.push(caseOf(p.leviers, p.code, p.libelle, 'paquet', cout));
  }
  for (const st of s.stress) cases.push(caseOf([st.code], st.code, st.libelle, 'stress', null));
  cases.push(caseOf(['S1', 'S3'], 'S1+S3', 'Choc macro combiné', 'stress', null));

  let selection: RunOutput['selection'] = null;
  if (s.actifs.length) {
    const r = runPL(budget, d, { effects: buildEffects(s.actifs, s.leviers, s.stress), actuals: act });
    selection = { codes: [...s.actifs], stats: computeStats(r.annual, target), annual: r.annual };
  }

  const bm = budgetMonthly(budget);
  const controls = quick ? [] : runControls({ scenario: s, budget, reg, ctx, draws: d, base, effects: neutral, actuals: act, dernierCours });
  const laws: LawInfo[] = reg.hypotheses.map((h) => {
    if (h.code === 'H06') {
      const fs = sorted(d.fxMean);
      const e: [number, number, number] = [percentileSorted(fs, 0.1), percentileSorted(fs, 0.5), percentileSorted(fs, 0.9)];
      return { code: h.code, loi: 'marche-aleatoire', asymetrie: null, p10: e[0], p50: e[1], p90: e[2], emp: e };
    }
    const law = ctx.laws[h.code]!;
    const sv = sorted(d.h[h.code as Exclude<typeof h.code, 'H06'>]);
    return {
      code: h.code, loi: chooseLaw(h), asymetrie: h.p50 == null ? null : asymmetry(h.p10!, h.p50, h.p90!),
      p10: law.p10, p50: law.p50, p90: law.p90,
      emp: [percentileSorted(sv, 0.1), percentileSorted(sv, 0.5), percentileSorted(sv, 0.9)],
    };
  });
  const fxs = sorted(d.fxMean);
  const out: RunOutput = {
    ok: true,
    partial: quick,
    ref: runReference(s, budget),
    budgetEbitda: target,
    budgetMonthly: bm,
    base: stats,
    annual: base.annual,
    selection,
    cases,
    targets: objectives(budget).map((x) => ({ objectif: x, prob: probAtLeast(base.annual, x) })),
    contributions: quick ? { items: [], blocks: [] } : contributions(d, base.annual),
    totalEffects: quick ? [] : totalEffects(d, base.annual),
    isolated: quick ? { base: NaN, effects: [] } : isolatedEffects(budget, reg, ctx),
    events: quick ? [] : eventEffects(d, base.annual),
    profile: quick ? [] : scenarioProfile(d, base.annual),
    fan: fanChart(base, bm),
    quarters: quick ? [] : quarterly(base, bm),
    bus: quick ? [] : byBu(base, budget),
    controls,
    blocking: quick || controls.some((c) => c.nature === 'Bloquant' && !c.ok),
    laws,
    fxStats: [percentileSorted(fxs, 0.1), percentileSorted(fxs, 0.5), percentileSorted(fxs, 0.9)],
    timings: { simulation: t1 - t0, total: 0 },
  };
  out.timings.total = performance.now() - t0;
  return out;
}

/** Autres objectifs chiffrés sur la même distribution (9.1). */
export function objectives(budget: BudgetGrid): number[] {
  if (budget.source === 'alfa' && Math.abs(budget.ebitdaPublie - 9.4) < 1e-9) return [8.5, 9.0, 9.4, 10.0];
  const t = budget.ebitdaPublie;
  return [0.9, 0.95, 1, 1.05].map((f) => Math.round(t * f * 10) / 10);
}

/** Tirages et P&L détaillés, pour les exports (le grain complet se recalcule à partir de la graine, R-PL-05). */
export function detailedRun({ scenario: s, budget, actuals }: RunInput) {
  const reg = s.registre;
  const ctx = samplingContext(reg);
  const m = actuals ? Math.min(s.moisClos, actuals.lignes.length) : 0;
  const act = m > 0 ? { lignes: actuals!.lignes.slice(0, m), cours: actuals!.cours.slice(0, m) } : undefined;
  const d = drawAll(reg, budget, { n: s.n, graine: s.graine, moisClos: m, dernierCours: act?.cours[m - 1] }, ctx);
  const base = runPL(budget, d, { actuals: act, detail: true });
  return { draws: d, base };
}
