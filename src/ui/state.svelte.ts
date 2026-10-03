/** État de l'outil : scénario, budget, résultats, journal des runs. Tout reste dans le navigateur. */
import { alfaBudget, alfaScenario, TOOL_VERSION } from '../engine/alfa.ts';
import type { BacktestResult } from '../engine/backtest.ts';
import type { RunError, RunOutput } from '../engine/simulate.ts';
import type { Actuals, BudgetGrid, CaseCode, Scenario } from '../engine/types.ts';
import type { JournalEntry } from '../io/excel.ts';
import { scenarioFromHash } from '../io/share.ts';
import { clearDraft, loadDraft, saveDraft } from '../io/storage.ts';
import { EngineClient } from './engine-client.ts';

export interface SyntheticSummary {
  realise2027: Actuals;
  journal: { annee: number; mois: number; code: string; libelle: string; amplitude: number }[];
  correlationsObservees: Record<string, number>;
  intervalleHistorique: Record<string, number>;
  cours: { annee: number; mois: number; cours: number }[];
}

interface Draft {
  scenario: Scenario;
  budget: BudgetGrid;
}

const DRAFT_KEY = 'scenario';

function bumpVersion(v: string): string {
  const m = /^v(\d+)$/.exec(v);
  return m ? `v${Number(m[1]) + 1}` : `${v}.1`;
}

function readVue(): 'codir' | 'analyse' {
  try {
    return localStorage.getItem('vue') === 'analyse' ? 'analyse' : 'codir';
  } catch {
    return 'codir';
  }
}

class AppState {
  scenario = $state<Scenario>(alfaScenario());
  budget = $state<BudgetGrid>(alfaBudget());
  result = $state<RunOutput | null>(null);
  errors = $state<string[]>([]);
  running = $state(false);
  backtest = $state<BacktestResult | null>(null);
  synthetic = $state<SyntheticSummary | null>(null);
  journal = $state<JournalEntry[]>([]);
  seedLog = $state<{ date: string; de: number; vers: number; motif: string }[]>([]);
  notice = $state<string | null>(null);
  toast = $state<string | null>(null);
  ready = $state(false);
  /** Vue affichée : synthèse pour le CFO et le CODIR, ou analyse détaillée pour le CDG et le FP&A. */
  vue = $state<'codir' | 'analyse'>(readVue());

  private client: EngineClient | null = null;
  private runId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  get engine(): EngineClient {
    if (!this.client) this.client = new EngineClient();
    return this.client;
  }

  get isAlfa(): boolean {
    return this.budget.source === 'alfa';
  }

  /** Réalisé disponible pour l'atterrissage (ALFA : réalisé synthétique 2027). */
  get actuals(): Actuals | undefined {
    return this.isAlfa ? this.synthetic?.realise2027 : undefined;
  }

  async init() {
    const fromLink = scenarioFromHash(location.hash);
    if (fromLink) {
      this.scenario = fromLink;
      this.budget = alfaBudget();
      if (fromLink.toolVersion !== TOOL_VERSION) {
        this.notice = `Ce lien a été calculé avec la version ${fromLink.toolVersion} de l'outil ; vous utilisez la version ${TOOL_VERSION}. Les chiffres peuvent différer (12.3).`;
      } else {
        this.notice = 'Scénario ouvert depuis un lien de partage : mêmes hypothèses, mêmes leviers, même graine.';
      }
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      const draft = await loadDraft<Draft>(DRAFT_KEY);
      if (draft?.scenario?.schemaVersion === 1 && draft.budget) {
        this.scenario = draft.scenario;
        this.budget = draft.budget;
        this.notice = 'Brouillon restauré depuis votre dernière visite sur ce poste.';
      }
    }
    this.ready = true;
    this.engine
      .request<SyntheticSummary>({ type: 'synthetic' })
      .then((s) => {
        this.synthetic = s;
        if (this.scenario.moisClos > 0) this.schedule(0);
      })
      .catch(() => {});
  }

  /** Recalcul automatique, regroupé sur 150 ms. */
  schedule(delay = 150) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), delay);
  }

  run() {
    const scenario = $state.snapshot(this.scenario) as Scenario;
    const budget = $state.snapshot(this.budget) as BudgetGrid;
    const actuals = scenario.moisClos > 0 ? (this.actuals ? ($state.snapshot(this.actuals) as Actuals) : undefined) : undefined;
    if (this.runId) this.engine.cancel(this.runId);
    const id = this.engine.lastId + 1;
    this.runId = id;
    this.running = true;
    const t0 = performance.now();
    void saveDraft(DRAFT_KEY, { scenario, budget });
    this.engine
      .request<RunOutput | RunError>({ type: 'run', scenario, budget, actuals }, (partial) => {
        if (id === this.runId && partial.ok) {
          this.result = partial;
          this.errors = [];
        }
      })
      .then((out) => {
        if (id !== this.runId) return;
        this.running = false;
        if (!out.ok) {
          this.errors = out.errors;
          return;
        }
        this.errors = [];
        this.result = out;
        const failed = out.controls.filter((c) => !c.ok).map((c) => c.code);
        this.journal = [
          { ref: out.ref.texte, date: out.ref.date, p10: out.base.p10, p50: out.base.p50, p90: out.base.p90, prob: out.base.prob, controles: failed.length ? `en échec : ${failed.join(', ')}` : 'tous verts', duree: performance.now() - t0 },
          ...this.journal,
        ].slice(0, 200);
      })
      .catch((e: Error) => {
        if (id !== this.runId) return;
        this.running = false;
        this.errors = [e.message];
      });
  }

  /** Une modification du registre gelé crée une nouvelle version (R-HY-04). */
  markRegistryEdited() {
    const r = this.scenario.registre;
    if (r.statut !== 'brouillon') {
      r.version = bumpVersion(r.version);
      r.statut = 'brouillon';
    }
  }

  freezeRegistry() {
    this.scenario.registre.statut = 'gele';
    for (const h of this.scenario.registre.hypotheses) if (h.statut === 'brouillon') h.statut = 'valide';
  }

  toggleCase(code: CaseCode) {
    const a = this.scenario.actifs;
    this.scenario.actifs = a.includes(code) ? a.filter((c) => c !== code) : [...a, code];
  }

  setSeed(seed: number, motif: string) {
    this.seedLog = [...this.seedLog, { date: new Date().toISOString(), de: this.scenario.graine, vers: seed, motif }];
    this.scenario.graine = seed;
  }

  async resetToAlfa() {
    await clearDraft(DRAFT_KEY);
    this.scenario = alfaScenario();
    this.budget = alfaBudget();
    this.notice = null;
    this.backtest = null;
  }

  loadScenario(s: Scenario, budget?: BudgetGrid) {
    this.scenario = s;
    if (budget) this.budget = budget;
  }

  async loadBacktest() {
    if (this.backtest) return;
    this.backtest = await this.engine.request<BacktestResult>({ type: 'backtest' });
  }

  setVue(v: 'codir' | 'analyse') {
    this.vue = v;
    try {
      localStorage.setItem('vue', v);
    } catch {
      /* stockage indisponible */
    }
    window.scrollTo({ top: 0 });
  }

  showToast(msg: string) {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3500);
  }
}

export const app = new AppState();
