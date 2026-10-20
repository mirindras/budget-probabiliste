/**
 * Génère les modèles Excel du dépôt (dossier templates/) à partir du jeu ALFA :
 * BUDGET_BASE.xlsx (modèle générique : rubriques et postes), BUDGET_BASE_DETAILLE.xlsx
 * (format détaillé d'un distributeur, grain mois × BU × canal × famille) et REGISTRE_HYPOTHESES.xlsx.
 * Lancer : npm run templates (Node 22.18 ou plus, qui exécute le TypeScript directement).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { alfaBudget, alfaScenario } from '../src/engine/alfa.ts';
import { budgetTemplate, legacyBudgetTemplate, registryWorkbook, workbookBytes } from '../src/io/excel.ts';

const out = new URL('../templates/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('BUDGET_BASE.xlsx', out), Buffer.from(workbookBytes(budgetTemplate(alfaBudget()))));
writeFileSync(new URL('BUDGET_BASE_DETAILLE.xlsx', out), Buffer.from(workbookBytes(legacyBudgetTemplate())));
writeFileSync(new URL('REGISTRE_HYPOTHESES.xlsx', out), Buffer.from(workbookBytes(registryWorkbook(alfaScenario(), alfaBudget()))));
console.log('Modèles écrits dans templates/ : BUDGET_BASE.xlsx, BUDGET_BASE_DETAILLE.xlsx, REGISTRE_HYPOTHESES.xlsx');
