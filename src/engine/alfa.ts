/** Jeu ALFA préchargé : budget, registre, leviers et stress tests (annexe F). Données synthétiques. */
import budgetJson from '../../data/alfa/budget.json' with { type: 'json' };
import registreJson from '../../data/alfa/registre.json' with { type: 'json' };
import type { BudgetGrid, LeverDef, Registry, Scenario, StressDef } from './types.ts';

export const TOOL_VERSION: string = typeof __TOOL_VERSION__ !== 'undefined' ? __TOOL_VERSION__ : '1.0.0';

export interface CompactBudget {
  libelle: string;
  exercice: number;
  bu: string[];
  ca: number[];
  cout_matiere: number[];
  part_importee: number[];
  transport: { carburant: number; sous_traitance: number; autres: number };
  masse_salariale: number;
  frais_commerciaux: { total: number; part_variable: number };
  frais_generaux: number;
  cours_budget_eur_mga: number;
  ebitda: number;
  saisonnalite: Record<string, number[]>;
}

/** Décline un budget annuel par BU en grille BU × mois (règles F.2). */
export function expandBudget(b: CompactBudget, source: 'alfa' | 'import' = 'alfa'): BudgetGrid {
  const nb = b.bu.length;
  const seas = b.bu.map((name) => b.saisonnalite[name]);
  const caTot = b.ca.reduce((a, x) => a + x, 0);
  const ca = b.bu.map((_, i) => seas[i].map((s) => b.ca[i] * s));
  const cmImp = b.bu.map((_, i) => seas[i].map((s) => b.cout_matiere[i] * b.part_importee[i] * s));
  const cmLoc = b.bu.map((_, i) => seas[i].map((s) => b.cout_matiere[i] * (1 - b.part_importee[i]) * s));
  const w = Array.from({ length: 12 }, (_, t) => {
    let s = 0;
    for (let i = 0; i < nb; i++) s += ca[i][t];
    return s / caTot;
  });
  const fc = b.frais_commerciaux;
  return {
    libelle: b.libelle,
    exercice: b.exercice,
    bu: [...b.bu],
    ca,
    cmImp,
    cmLoc,
    carburant: w.map((x) => b.transport.carburant * x),
    sousTraitance: w.map((x) => b.transport.sous_traitance * x),
    autresTransport: w.map(() => b.transport.autres / 12),
    masseSalariale: w.map(() => b.masse_salariale / 12),
    fcTauxVariable: (fc.total * fc.part_variable) / caTot,
    fcFixe: w.map(() => (fc.total * (1 - fc.part_variable)) / 12),
    fraisGeneraux: w.map(() => b.frais_generaux / 12),
    coursBudget: b.cours_budget_eur_mga,
    ebitdaPublie: b.ebitda,
    source,
  };
}

export const ALFA_COMPACT: CompactBudget = budgetJson as CompactBudget;

export function alfaBudget(): BudgetGrid {
  return expandBudget(ALFA_COMPACT, 'alfa');
}

export function alfaRegistry(): Registry {
  const r = structuredClone(registreJson) as unknown as Registry & { _mention?: string; simulation?: unknown };
  delete r._mention;
  delete r.simulation;
  for (const h of r.hypotheses) h.k = h.k ?? 1;
  return r;
}

/** Leviers L1 à L5 (section 10.2, règles exactes F.3). */
export function alfaLevers(): LeverDef[] {
  return [
    {
      code: 'L1', libelle: 'Couverture de change',
      description: '50 % des achats en euros à cours garanti de 5 250',
      hypotheses: 'H06', regle: 'Coût matière importé valorisé pour moitié au cours S(t), pour moitié à 5 250',
      cout: 0, coutLibelle: 'implicite dans le cours', mois: 1, proprietaire: 'Trésorerie', faisabilite: 'Contrat à terme avec la banque',
      params: { part: 0.5, cours: 5250 },
    },
    {
      code: 'L2', libelle: 'Hausse tarifaire ciblée',
      description: '+1 % sur Épicerie et Hygiène au 1er avril, élasticité -0,8',
      hypotheses: 'H02, H03, H04', regle: 'À partir d\'avril, prix Épicerie et Hygiène × 1,01 et volumes × 0,992',
      cout: 0, coutLibelle: 'volumes perdus, inclus', mois: 4, proprietaire: 'Directeur commercial', faisabilite: 'Négociation GMS en mars',
      params: { hausse: 0.01, elasticite: -0.8 },
    },
    {
      code: 'L3', libelle: 'Économies de frais généraux',
      description: '-0,25 GAr en année pleine, effet dès avril',
      hypotheses: 'H12', regle: 'Frais généraux diminués de 0,25 / 12 par mois à partir d\'avril ; coût unique de 0,05 en janvier',
      cout: 0.05, coutLibelle: '0,05 GAr, unique', mois: 4, proprietaire: 'DAF', faisabilite: 'Plan d\'économies identifié',
      params: { economieAnnuelle: 0.25 },
    },
    {
      code: 'L4', libelle: 'Plafond des tarifs transporteurs',
      description: 'Hausses limitées à +3 % contre engagement de volume',
      hypotheses: 'H09', regle: 'H09 plafonné à 1,03',
      cout: 0, coutLibelle: 'aucun', mois: 1, proprietaire: 'Supply chain', faisabilite: 'Avenant aux contrats transporteurs',
      params: { plafond: 1.03 },
    },
    {
      code: 'L5', libelle: 'Stock de sécurité import',
      description: '+2 semaines de stock, impact de E03 réduit de 75 %',
      hypotheses: 'E03', regle: 'Amplitude de E03 × 0,25, surcoût de E03 supprimé, frais généraux + 0,16 / 12 par mois',
      cout: 0.16, coutLibelle: '0,16 GAr par an', mois: 1, proprietaire: 'Supply chain', faisabilite: 'Capacité d\'entrepôt disponible',
      params: { reduction: 0.75, coutAnnuel: 0.16 },
    },
  ];
}

/** Stress tests S1 à S3 (section 10.1, règles F.3). */
export function alfaStress(): StressDef[] {
  return [
    { code: 'S1', libelle: 'Dépréciation brutale de l\'ariary', regle: 'Cours +15 % au-dessus de la trajectoire simulée, dès avril', mois: 4, params: { choc: 0.15 } },
    { code: 'S2', libelle: 'Perte de deux grands comptes GMS', regle: 'Volumes Boissons et Épicerie -12 % dès avril (E02 forcé)', mois: 4, params: { choc: 0.12 } },
    { code: 'S3', libelle: 'Choc carburant', regle: 'Carburant +25 % dès avril, en plus des révisions simulées', mois: 4, params: { choc: 0.25 } },
  ];
}

export function alfaScenario(): Scenario {
  return {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    nom: 'ALFA 2027, budget initial',
    registre: alfaRegistry(),
    leviers: alfaLevers(),
    stress: alfaStress(),
    actifs: [],
    n: 10000,
    graine: 2027,
    moisClos: 0,
  };
}
