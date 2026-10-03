/** Traitement des requêtes de calcul, commun au Web Worker et au repli sur le fil principal. */
import { runBacktest, knownTruthCoverage } from './engine/backtest.ts';
import { detailedRun, simulate, type RunOutput } from './engine/simulate.ts';
import { syntheticData } from './engine/synthetic.ts';
import type { Actuals, BudgetGrid, Scenario } from './engine/types.ts';
import { resultsWorkbook, workbookBytes, type JournalEntry } from './io/excel.ts';

export type WorkerRequest =
  | { type: 'run'; id: number; scenario: Scenario; budget: BudgetGrid; actuals?: Actuals }
  | { type: 'backtest'; id: number }
  | { type: 'synthetic'; id: number }
  | { type: 'truth'; id: number }
  | { type: 'export'; id: number; scenario: Scenario; budget: BudgetGrid; actuals?: Actuals; run: RunOutput; journal: JournalEntry[] };

export type Post = (msg: unknown, transfer?: Transferable[]) => void;

let latest = 0;

export function handle(msg: WorkerRequest, post: Post): void {
  try {
    if (msg.type === 'run') {
      latest = msg.id;
      const quick = simulate({ scenario: msg.scenario, budget: msg.budget, actuals: msg.actuals, quick: true });
      post({ type: 'run', id: msg.id, output: quick });
      if (!quick.ok) return;
      // Un calcul plus récent est peut-être en file : on laisse la main avant la phase complète.
      setTimeout(() => {
        if (msg.id !== latest) return;
        try {
          post({ type: 'run', id: msg.id, output: simulate({ scenario: msg.scenario, budget: msg.budget, actuals: msg.actuals }) });
        } catch (e) {
          post({ type: 'run', id: msg.id, error: e instanceof Error ? e.message : String(e) });
        }
      }, 0);
    } else if (msg.type === 'backtest') {
      post({ type: 'backtest', id: msg.id, output: runBacktest() });
    } else if (msg.type === 'synthetic') {
      const s = syntheticData();
      post({ type: 'synthetic', id: msg.id, output: { realise2027: s.realise2027, journal: s.journal, correlationsObservees: s.correlationsObservees, intervalleHistorique: s.intervalleHistorique, cours: s.cours } });
    } else if (msg.type === 'truth') {
      post({ type: 'truth', id: msg.id, output: knownTruthCoverage() });
    } else if (msg.type === 'export') {
      const { draws, base } = detailedRun({ scenario: msg.scenario, budget: msg.budget, actuals: msg.actuals });
      const bytes = workbookBytes(resultsWorkbook(msg.scenario, msg.budget, msg.run, draws, base, msg.journal));
      post({ type: 'export', id: msg.id, output: bytes }, [bytes]);
    }
  } catch (e) {
    post({ type: msg.type, id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
}
