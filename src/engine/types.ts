/** Types du moteur : budget de base, registre, leviers, scénario. Montants en GAr. */

export const HYP_CODES = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12'] as const;
export const EVENT_CODES = ['E01', 'E02', 'E03'] as const;
/** Ordre des colonnes de l'hypercube et de la copule : 12 hypothèses puis 3 événements. */
export const DRIVER_CODES = [...HYP_CODES, ...EVENT_CODES] as const;
export type HypCode = (typeof HYP_CODES)[number];
export type EventCode = (typeof EVENT_CODES)[number];
export type DriverCode = (typeof DRIVER_CODES)[number];
export const MONTHS = 12;

export type LawKind = 'normale' | 'split-normale' | 'lognormale' | 'pert' | 'marche-aleatoire' | 'bernoulli';
export type Status = 'brouillon' | 'valide' | 'gele';

export interface Hypothesis {
  code: HypCode;
  libelle: string;
  proprietaire: string;
  unite: string;
  grain: string;
  /** P10, P50, P90 annuels. P50 nul pour une lognormale saisie par P10 et P90 seulement. */
  p10?: number;
  p50?: number | null;
  p90?: number;
  /** Bornes physiques pour une loi PERT (minimum, mode = p50, maximum). */
  min?: number;
  max?: number;
  /** Marche aléatoire (H06) : départ, dérive annuelle, volatilité mensuelle. */
  depart?: number;
  derive_annuelle?: number;
  volatilite_mensuelle?: number;
  justification: string;
  /** Coefficient d'élargissement issu du backtest (R-HY-03), 1 avant backtest. */
  k?: number;
  statut: Status;
}

export interface RiskEvent {
  code: EventCode;
  libelle: string;
  proprietaire: string;
  p: number;
  amplitude: [number, number];
  surcout?: [number, number];
  duree: 'fin' | 'mois';
  cible: string;
  justification: string;
  statut: Status;
}

export type Correlation = [DriverCode, DriverCode, number, string?];

export interface Registry {
  version: string;
  statut: Status;
  hypotheses: Hypothesis[];
  evenements: RiskEvent[];
  correlations_rang: Correlation[];
  bruit_volumes: { phi: number; sigma_mensuel: number };
}

/** Budget de base au grain BU × mois (agrégé depuis le grain mois × BU × canal × famille). */
export interface BudgetGrid {
  libelle: string;
  exercice: number;
  bu: string[];
  /** CA net budgété, [bu][mois]. */
  ca: number[][];
  /** Coût matière importé valorisé au cours budget, [bu][mois]. */
  cmImp: number[][];
  /** Coût matière local, [bu][mois]. */
  cmLoc: number[][];
  carburant: number[];
  sousTraitance: number[];
  autresTransport: number[];
  masseSalariale: number[];
  /** Frais commerciaux variables : taux appliqué au CA simulé. */
  fcTauxVariable: number;
  /** Frais commerciaux fixes, par mois. */
  fcFixe: number[];
  fraisGeneraux: number[];
  coursBudget: number;
  /** EBITDA publié, pour la réconciliation C01. */
  ebitdaPublie: number;
  source: 'alfa' | 'import';
}

export type LeverCode = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type StressCode = 'S1' | 'S2' | 'S3';
export type CaseCode = LeverCode | StressCode;

export interface LeverDef {
  code: LeverCode;
  libelle: string;
  description: string;
  hypotheses: string;
  regle: string;
  /** Coût direct en GAr (0 si implicite ou nul, jamais absent : R-LE-02). */
  cout: number | null;
  coutLibelle: string;
  /** Mois d'effet, de 1 à 12. */
  mois: number | null;
  proprietaire: string;
  faisabilite: string;
  params: Record<string, number>;
}

export interface StressDef {
  code: StressCode;
  libelle: string;
  regle: string;
  mois: number;
  params: Record<string, number>;
}

export interface Scenario {
  schemaVersion: 1;
  toolVersion: string;
  nom: string;
  registre: Registry;
  leviers: LeverDef[];
  stress: StressDef[];
  /** Leviers et stress cochés. */
  actifs: CaseCode[];
  n: number;
  graine: number;
  /** Nombre de mois clos en mode atterrissage (0 = budget initial). */
  moisClos: number;
}

/** Réalisé mensuel, pour le mode atterrissage. */
export interface Actuals {
  /** Lignes du P&L par mois clos : ca, cm, mix, transport, ms, fc, fg, ebitda. */
  lignes: number[][];
  /** Cours EUR/MGA de chaque mois clos. */
  cours: number[];
}

export const PL_LINES = ['ca', 'cm', 'mix', 'transport', 'ms', 'fc', 'fg', 'ebitda'] as const;
export const PL_LINE_LABELS: Record<(typeof PL_LINES)[number], string> = {
  ca: 'CA net',
  cm: 'Coût matière',
  mix: 'Effet mix',
  transport: 'Transport',
  ms: 'Masse salariale',
  fc: 'Frais commerciaux',
  fg: 'Frais généraux',
  ebitda: 'EBITDA',
};
