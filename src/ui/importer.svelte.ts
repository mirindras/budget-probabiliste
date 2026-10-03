/** Import par glisser-déposer ou sélection : budget, registre ou scénario, contrôlés avant tout calcul. */
import * as XLSX from 'xlsx';
import { importBudget, importRegistry, importScenarioBudget, ImportFailure, readWorkbook, workbookKind, type ImportError } from '../io/excel.ts';
import { app } from './state.svelte.ts';

export interface ImportOutcome {
  ok: boolean;
  titre: string;
  errors: ImportError[];
}

async function toWorkbook(files: File[]): Promise<XLSX.WorkBook> {
  const xlsx = files.find((f) => /\.xlsx?$/i.test(f.name));
  if (xlsx) return readWorkbook(new Uint8Array(await xlsx.arrayBuffer()));
  // CSV : une feuille par fichier, nommée d'après le fichier (VENTES.csv, CHARGES.csv, PARAMETRES.csv…).
  const wb = XLSX.utils.book_new();
  for (const f of files) {
    if (!/\.csv$/i.test(f.name)) continue;
    const text = await f.text();
    const parsed = XLSX.read(text, { type: 'string', FS: text.split('\n')[0].includes(';') ? ';' : ',' });
    const name = f.name.replace(/\.csv$/i, '').toUpperCase().replace(/^.*?(PARAMETRES|VENTES|CHARGES|HYPOTHESES|EVENEMENTS|CORRELATIONS|LEVIERS|STRESS)$/, '$1');
    XLSX.utils.book_append_sheet(wb, parsed.Sheets[parsed.SheetNames[0]], name);
  }
  return wb;
}

export async function importFiles(files: File[]): Promise<ImportOutcome> {
  if (!files.length) return { ok: false, titre: 'Aucun fichier', errors: [] };
  try {
    const wb = await toWorkbook(files);
    const kind = workbookKind(wb);
    const current = $state.snapshot(app.scenario);
    if (kind === 'budget') {
      const budget = importBudget(wb);
      app.loadScenario({ ...current, nom: budget.libelle, moisClos: 0 }, budget);
      return { ok: true, titre: `Budget importé : ${budget.libelle}. Calcul local, rien n'est transmis.`, errors: [] };
    }
    if (kind === 'registre') {
      const s = importRegistry(wb, current);
      app.loadScenario(s);
      return { ok: true, titre: `Registre importé : version ${s.registre.version}.`, errors: [] };
    }
    if (kind === 'scenario') {
      const budget = importScenarioBudget(wb);
      const s = importRegistry(wb, current);
      app.loadScenario({ ...s, nom: budget.libelle }, budget);
      return { ok: true, titre: `Scénario importé : ${budget.libelle}, registre ${s.registre.version}.`, errors: [] };
    }
    return {
      ok: false, titre: 'Fichier non reconnu',
      errors: [{ feuille: files[0].name, ligne: null, message: 'attendu : modèle BUDGET_BASE (feuilles PARAMETRES, VENTES, CHARGES) ou REGISTRE_HYPOTHESES (HYPOTHESES, EVENEMENTS, CORRELATIONS)' }],
    };
  } catch (e) {
    if (e instanceof ImportFailure) return { ok: false, titre: `${e.errors.length} erreur${e.errors.length > 1 ? 's' : ''} : aucun calcul n'est lancé tant qu'elles ne sont pas corrigées`, errors: e.errors };
    return { ok: false, titre: 'Lecture impossible', errors: [{ feuille: files[0].name, ligne: null, message: e instanceof Error ? e.message : String(e) }] };
  }
}
