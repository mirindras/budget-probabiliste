/**
 * Génère les modèles Excel du dépôt (dossier templates/) à partir du jeu ALFA :
 * BUDGET_BASE.xlsx (grain mois × BU × canal × famille) et REGISTRE_HYPOTHESES.xlsx.
 * Lancer : npm run templates (Node 22.18 ou plus, qui exécute le TypeScript directement).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { alfaScenario } from '../src/engine/alfa.ts';
import { budgetTemplate, registryWorkbook, workbookBytes } from '../src/io/excel.ts';

const out = new URL('../templates/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('BUDGET_BASE.xlsx', out), Buffer.from(workbookBytes(budgetTemplate())));
writeFileSync(new URL('REGISTRE_HYPOTHESES.xlsx', out), Buffer.from(workbookBytes(registryWorkbook(alfaScenario()))));
console.log('Modèles écrits dans templates/ : BUDGET_BASE.xlsx, REGISTRE_HYPOTHESES.xlsx');
