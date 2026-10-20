/**
 * Types du modèle configurable. Le budget décrit la structure du P&L de l'entreprise (BU, rubriques, postes) ;
 * le registre décrit ce qui le fait varier (hypothèses et événements typés, avec leur portée) ;
 * le scénario y ajoute leviers, stress tests et paquets. ALFA n'est qu'une configuration parmi d'autres (alfa.ts).
 */

export const MONTHS = 12;

export type LawKind = 'normale' | 'split-normale' | 'lognormale' | 'pert' | 'marche-aleatoire' | 'bernoulli';
export type Status = 'brouillon' | 'valide' | 'gele';

/* ------------------------------------------------------------------ Budget : structure du P&L */

/** Nature d'une rubrique : chiffre d'affaires, autre produit (signe +), charge (signe −). */
export type Nature = 'ca' | 'produit' | 'charge';
export const NATURES: Nature[] = ['ca', 'produit', 'charge'];

/** Rubrique du P&L de gestion, dans l'ordre d'affichage. L'EBITDA est la somme signée des rubriques. */
export interface Rubrique {
  code: string;
  libelle: string;
  nature: Nature;
}

/**
 * Assiette d'un poste : ce qui le fait varier avec l'activité.
 * - fixe : le montant ne dépend pas de l'activité ;
 * - volume : proportionnel au volume de sa BU (ou à l'indice d'activité de l'entreprise pour un poste commun) ;
 * - ca : proportionnel au chiffre d'affaires simulé de sa BU (ou de l'entreprise pour un poste commun).
 */
export type Assiette = 'fixe' | 'volume' | 'ca';
export const ASSIETTES: Assiette[] = ['fixe', 'volume', 'ca'];

/** Ligne du budget, au grain BU × mois. */
export interface Poste {
  code: string;
  libelle: string;
  /** Code de la rubrique du P&L. */
  rubrique: string;
  /** BU du poste, null pour un poste commun à l'entreprise. Un poste de chiffre d'affaires a toujours une BU. */
  bu: string | null;
  assiette: Assiette;
  /** Part du montant payée en devises et exposée au change, de 0 à 1. */
  devises: number;
  /** Montants budgétés de janvier à décembre, dans l'unité du budget, positifs : le signe vient de la rubrique. */
  montants: number[];
}

/** Unité des montants : « GAr » et « MAr » pour ALFA, « M€ » et « k€ » ailleurs. Le détail vaut un millième de l'unité. */
export interface Unites {
  principale: string;
  detail: string;
  /** En toutes lettres, pour les pieds de page : « milliards d'ariarys ». */
  libelle: string;
}

/** Change : devise étrangère et monnaie locale, cours retenu au budget (unités locales pour 1 unité de devise). */
export interface Change {
  devise: string;
  locale: string;
  coursBudget: number;
}

export interface Budget {
  libelle: string;
  exercice: number;
  unites: Unites;
  /** BU de l'entreprise, au moins une. */
  bu: string[];
  rubriques: Rubrique[];
  postes: Poste[];
  /** Absent si aucun poste n'est payé en devises. */
  change: Change | null;
  /** EBITDA publié, pour la réconciliation C01. */
  ebitdaPublie: number;
  source: 'alfa' | 'import';
}

/* ------------------------------------------------------------------ Registre : ce qui fait varier le budget */

/** Portée d'une hypothèse, d'un événement, d'un levier ou d'un stress test. Champs vides : toute l'entreprise. */
export interface Portee {
  bu?: string[];
  postes?: string[];
  rubrique?: string;
  hypothese?: string;
  evenement?: string;
}

/**
 * Effet d'une hypothèse sur le P&L :
 * - volume : facteur sur le volume des BU visées (chiffre d'affaires et postes à assiette volume ou CA) ;
 * - prix : facteur sur le prix de vente des BU visées (chiffre d'affaires seulement) ;
 * - poste : facteur sur le montant des postes visés ;
 * - change : cours de la devise, en marche aléatoire, appliqué à la part en devises des postes ;
 * - marge : points de marge sur le chiffre d'affaires des BU visées, ajoutés à une rubrique.
 */
export type HypEffect = 'volume' | 'prix' | 'poste' | 'change' | 'marge';
export const HYP_EFFECTS: HypEffect[] = ['volume', 'prix', 'poste', 'change', 'marge'];

export interface Hypothesis {
  code: string;
  libelle: string;
  /** Famille de risque, pour regrouper l'origine du risque : « Commercial », « Macroéconomie »… */
  famille: string;
  effet: HypEffect;
  portee: Portee;
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
  /** Change : départ, dérive annuelle, volatilité mensuelle. */
  depart?: number;
  derive_annuelle?: number;
  volatilite_mensuelle?: number;
  justification: string;
  /** Coefficient d'élargissement issu du backtest (R-HY-03), 1 avant backtest. */
  k?: number;
  statut: Status;
}

/** Effet d'un événement : sur le volume des BU visées, ou sur le montant des postes visés. */
export type EventEffect = 'volume' | 'poste';
export const EVENT_EFFECTS: EventEffect[] = ['volume', 'poste'];
export type Sens = 'baisse' | 'hausse';

export interface RiskEvent {
  code: string;
  libelle: string;
  famille: string;
  effet: EventEffect;
  /** Baisse ou hausse de ce qu'il touche, de l'amplitude tirée. */
  sens: Sens;
  portee: Portee;
  proprietaire: string;
  p: number;
  amplitude: [number, number];
  /** Surcoût ponctuel, dans l'unité du budget, compté le mois de survenance. */
  surcout?: [number, number];
  /** Rubrique de charge où le surcoût est compté. */
  rubriqueSurcout?: string;
  duree: 'fin' | 'mois';
  /** Description libre de ce que l'événement touche. */
  cible: string;
  justification: string;
  statut: Status;
}

export type Correlation = [string, string, number, string?];

/** Décision de la revue des risques : où le risque est traité, ou pourquoi il ne l'est pas. */
export type RiskDecision = 'couvert' | 'stress' | 'non-significatif' | 'hors-modele';
export const RISK_DECISIONS: RiskDecision[] = ['couvert', 'stress', 'non-significatif', 'hors-modele'];

/** Une ligne de la revue des risques (guide.ts, catégories R01 à R16). */
export interface RiskReview {
  categorie: string;
  decision: RiskDecision | null;
  /** Hypothèses, événements ou stress qui portent le risque (« H01, E02 »). */
  ref: string;
  commentaire: string;
}

export interface Registry {
  version: string;
  statut: Status;
  hypotheses: Hypothesis[];
  evenements: RiskEvent[];
  correlations_rang: Correlation[];
  bruit_volumes: { phi: number; sigma_mensuel: number };
  /** Revue des risques : chaque catégorie de risque passée en revue, pour ne rien oublier. */
  revue_risques?: RiskReview[];
  /** Postes confirmés certains : sans hypothèse, ils restent au budget, et ce choix est assumé. */
  postes_certains?: string[];
}

/* ------------------------------------------------------------------ Leviers, stress tests, paquets */

/**
 * Types de levier :
 * - couverture : une part de l'exposition au change à cours garanti (params part, cours) ;
 * - prix : hausse de prix sur des BU, avec effet volume (params hausse, elasticite) ;
 * - montant : variation annuelle d'une rubrique, étalée à partir du mois d'effet, coût unique en janvier (params variationAnnuelle) ;
 * - plafond : borne une hypothèse (params plafond, et plancher s'il y a lieu) ;
 * - attenuation : réduit l'impact d'un événement et supprime son surcoût, contre un coût annuel compté dans une rubrique (params reduction, coutAnnuel).
 */
export type LeverType = 'couverture' | 'prix' | 'montant' | 'plafond' | 'attenuation';
export const LEVER_TYPES: LeverType[] = ['couverture', 'prix', 'montant', 'plafond', 'attenuation'];

/**
 * Types de stress test :
 * - change : cours au-dessus de sa trajectoire simulée (params choc) ;
 * - evenement : un événement forcé, d'amplitude choc, dès le mois d'effet (params choc) ;
 * - poste : postes en hausse de choc dès le mois d'effet (params choc) ;
 * - volume : volumes des BU visées en baisse de choc dès le mois d'effet (params choc).
 */
export type StressType = 'change' | 'evenement' | 'poste' | 'volume';
export const STRESS_TYPES: StressType[] = ['change', 'evenement', 'poste', 'volume'];

/** Paramètres attendus par type, dans l'ordre d'affichage. */
export const LEVER_PARAMS: Record<LeverType, string[]> = {
  couverture: ['part', 'cours'],
  prix: ['hausse', 'elasticite'],
  montant: ['variationAnnuelle'],
  plafond: ['plafond'],
  attenuation: ['reduction', 'coutAnnuel'],
};
export const STRESS_PARAMS: Record<StressType, string[]> = { change: ['choc'], evenement: ['choc'], poste: ['choc'], volume: ['choc'] };

export type CaseCode = string;

export interface LeverDef {
  code: string;
  type: LeverType;
  portee: Portee;
  libelle: string;
  description: string;
  hypotheses: string;
  regle: string;
  /** Coût direct dans l'unité du budget (0 si implicite ou nul, jamais absent : R-LE-02). */
  cout: number | null;
  coutLibelle: string;
  /** Mois d'effet, de 1 à 12. */
  mois: number | null;
  proprietaire: string;
  faisabilite: string;
  params: Record<string, number>;
}

export interface StressDef {
  code: string;
  type: StressType;
  portee: Portee;
  libelle: string;
  regle: string;
  mois: number;
  params: Record<string, number>;
}

/** Paquet de leviers, ou combinaison de stress tests, toujours recalculé (R-LE-03). */
export interface Paquet {
  code: string;
  libelle: string;
  codes: string[];
}

export interface Scenario {
  schemaVersion: 2;
  toolVersion: string;
  nom: string;
  registre: Registry;
  leviers: LeverDef[];
  stress: StressDef[];
  paquets: Paquet[];
  /** Leviers et stress cochés. */
  actifs: CaseCode[];
  n: number;
  graine: number;
  /** Nombre de mois clos en mode atterrissage (0 = budget initial). */
  moisClos: number;
}

/** Réalisé mensuel, pour le mode atterrissage. */
export interface Actuals {
  /** Par mois clos : une valeur par rubrique du budget, dans l'ordre, puis l'EBITDA. */
  lignes: number[][];
  /** Cours de change de chaque mois clos (vide si le budget n'a pas de change). */
  cours: number[];
}

/** Signe d'une rubrique dans l'EBITDA. */
export const signOf = (n: Nature): number => (n === 'charge' ? -1 : 1);
