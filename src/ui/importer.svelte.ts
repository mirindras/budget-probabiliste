/** Import par glisser-déposer ou sélection : budget, registre ou scénario, contrôlés avant tout calcul. */
import * as XLSX from 'xlsx';
import { importBudget, importRegistry, importScenarioBudget, ImportFailure, readCsvSheet, readWorkbook, workbookKind, type ImportError } from '../io/excel.ts';
import { checkFiles } from '../io/limits.ts';
import { app } from './state.svelte.ts';

export interface ImportOutcome {
  ok: boolean;
  titre: string;
  errors: ImportError[];
}

/** Nom de feuille d'un CSV, déduit de la fin du nom de fichier (« budget_POSTES.csv » → POSTES). */
const SHEET_RE = /^.*?(PARAMETRES_BUDGET|PARAMETRES|RUBRIQUES|POSTES|VENTES|CHARGES|HYPOTHESES|EVENEMENTS|CORRELATIONS|REVUE_RISQUES|LEVIERS|STRESS|PAQUETS)$/;

async function toWorkbook(files: File[]): Promise<XLSX.WorkBook> {
  const xlsx = files.filter((f) => /\.xlsx$/i.test(f.name));
  if (xlsx.length > 1 || (xlsx.length && xlsx.length < files.length)) {
    throw new ImportFailure([{ feuille: 'import', ligne: null, message: 'un seul classeur .xlsx à la fois, ou des fichiers .csv seuls' }]);
  }
  if (xlsx.length) return readWorkbook(new Uint8Array(await xlsx[0].arrayBuffer()), xlsx[0].name);
  // CSV : une feuille par fichier, nommée d'après le fichier (PARAMETRES.csv, RUBRIQUES.csv, POSTES.csv…).
  const wb = XLSX.utils.book_new();
  for (const f of files) {
    if (!/\.csv$/i.test(f.name)) continue;
    const sheet = readCsvSheet(await f.text(), f.name);
    const name = f.name.replace(/\.csv$/i, '').toUpperCase().replace(SHEET_RE, '$1');
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  return wb;
}

export async function importFiles(files: File[]): Promise<ImportOutcome> {
  if (!files.length) return { ok: false, titre: 'Aucun fichier', errors: [] };
  // Limites contrôlées avant toute lecture : nombre, format et taille des fichiers.
  const refused = checkFiles(files);
  if (refused.length) return { ok: false, titre: 'Fichier refusé avant lecture', errors: refused };
  try {
    const wb = await toWorkbook(files);
    const kind = workbookKind(wb);
    const current = $state.snapshot(app.scenario);
    if (kind === 'budget') {
      const budget = importBudget(wb);
      const { starter } = app.loadBudget(budget);
      const suite = starter
        ? ' Registre de départ créé (volume par BU, prix, une hypothèse par rubrique de charges) : à compléter dans la saisie guidée.'
        : ' Le registre en cours est conservé.';
      return { ok: true, titre: `Budget importé : ${budget.libelle}.${suite} Calcul local, rien n'est transmis.`, errors: [] };
    }
    if (kind === 'registre') {
      const s = importRegistry(wb, current, $state.snapshot(app.budget));
      app.loadScenario(s);
      return { ok: true, titre: `Registre importé : version ${s.registre.version}, ${s.registre.hypotheses.length} hypothèses et ${s.registre.evenements.length} événements.`, errors: [] };
    }
    if (kind === 'scenario') {
      const budget = importScenarioBudget(wb);
      const s = importRegistry(wb, current, budget);
      app.loadScenario({ ...s, nom: budget.libelle, moisClos: 0 }, budget);
      return { ok: true, titre: `Scénario importé : ${budget.libelle}, registre ${s.registre.version}.`, errors: [] };
    }
    return {
      ok: false, titre: 'Fichier non reconnu',
      errors: [{ feuille: files[0].name, ligne: null, message: 'attendu : modèle BUDGET_BASE (feuilles PARAMETRES, RUBRIQUES, POSTES) ou REGISTRE_HYPOTHESES (HYPOTHESES, EVENEMENTS)' }],
    };
  } catch (e) {
    if (e instanceof ImportFailure) return { ok: false, titre: `${e.errors.length} erreur${e.errors.length > 1 ? 's' : ''} : aucun calcul n'est lancé tant qu'elles ne sont pas corrigées`, errors: e.errors };
    return { ok: false, titre: 'Lecture impossible', errors: [{ feuille: files[0].name, ligne: null, message: e instanceof Error ? e.message : String(e) }] };
  }
}
