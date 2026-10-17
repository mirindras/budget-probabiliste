/**
 * Guide de saisie : pour chaque hypothèse et chaque événement, la question à poser à son propriétaire,
 * qui y répond, où chercher la réponse et les pièges à éviter ; puis les catégories de risques à passer
 * en revue pour ne rien oublier. Contenu affiché par l'assistant de saisie et exporté dans le registre Excel.
 */
import type { EventCode, HypCode, RiskReview } from './types.ts';

export interface InputGuide {
  /** Question posée au propriétaire, en langage courant. */
  question: string;
  /** Qui répond. */
  qui: string;
  /** Où chercher la réponse. */
  sources: string;
  /** Piège fréquent. */
  piege: string;
}

export const HYP_GUIDE: Record<HypCode, InputGuide> = {
  H01: {
    question: 'Par rapport au volume budgété, où serait le volume Boissons dans une mauvaise année (1 chance sur 10), une année normale, une bonne année (1 chance sur 10) ?',
    qui: 'Directeur commercial de la BU',
    sources: 'Volumes réalisés des 5 derniers exercices, carnet de commandes, référencements signés, tendance du marché.',
    piege: 'Ne pas y compter la perte d\'un grand compte : elle est portée par l\'événement E02, sinon elle est comptée deux fois.',
  },
  H02: {
    question: 'Par rapport au volume budgété, où serait le volume Épicerie dans une mauvaise année, une année normale, une bonne année ?',
    qui: 'Directeur commercial de la BU',
    sources: 'Volumes réalisés des 5 derniers exercices, référencements signés, carnet de commandes.',
    piege: 'Ne pas y compter la perte d\'un grand compte (E02) ni une rupture d\'approvisionnement (E03).',
  },
  H03: {
    question: 'Par rapport au volume budgété, où serait le volume Hygiène dans une mauvaise année, une année normale, une bonne année ?',
    qui: 'Directeur commercial de la BU',
    sources: 'Volumes réalisés des 5 derniers exercices, part de marché, lancements prévus.',
    piege: 'Une fourchette symétrique n\'est pas obligatoire : si le risque baissier est plus grand, la fourchette doit le montrer.',
  },
  H04: {
    question: 'Quel prix net moyen sera réellement encaissé par rapport au prix budgété, une fois remises et promotions déduites ?',
    qui: 'Directeur commercial',
    sources: 'Hausses tarifaires négociées, historique des remises par enseigne, conditions générales de vente.',
    piege: 'Raisonner en prix net réalisé, pas en prix catalogue : les remises de fin d\'année font souvent la différence.',
  },
  H05: {
    question: 'De combien de points la marge brute peut-elle s\'écarter du budget à cause du mix produits et canaux ?',
    qui: 'Contrôle de gestion',
    sources: 'Écarts de mix des 3 derniers exercices, plan de lancement des produits.',
    piege: 'Saisir en points de marge brute (0,4 = 0,4 point), pas en pourcentage du chiffre d\'affaires.',
  },
  H06: {
    question: 'Quel cours EUR/MGA au départ, quelle dérive annuelle attendue, quelle volatilité mensuelle ?',
    qui: 'Trésorerie',
    sources: 'Dernier cours connu, 60 derniers mois de cours, prévisions des banques.',
    piege: 'La volatilité mensuelle se lit sur l\'historique des variations mensuelles, pas sur l\'écart entre deux cours éloignés.',
  },
  H07: {
    question: 'Où seraient les prix d\'achat des produits importés, en euros, dans une année défavorable et une année favorable ?',
    qui: 'Achats',
    sources: 'Contrats fournisseurs, clauses d\'indexation, cours mondiaux des matières.',
    piege: 'En euros, hors change : l\'effet du cours EUR/MGA est déjà porté par H06.',
  },
  H08: {
    question: 'Où seraient les prix d\'achat locaux par rapport au budget, dans une mauvaise année, une année normale, une bonne année ?',
    qui: 'Achats',
    sources: 'Inflation domestique, contrats locaux, historique des hausses fournisseurs.',
    piege: 'Une dépréciation de l\'ariary fait monter les prix locaux : relier H08 à H06 par une corrélation plutôt que d\'élargir la fourchette.',
  },
  H09: {
    question: 'Où seraient les tarifs des transporteurs par rapport au budget, hors révision exceptionnelle du carburant ?',
    qui: 'Supply chain',
    sources: 'Contrats de transport, dates de renégociation, historique des révisions.',
    piege: 'Une révision brutale du prix du carburant est portée par E01 : ne pas la compter aussi ici.',
  },
  H10: {
    question: 'Où serait la masse salariale par rapport au budget : rattrapage d\'inflation, embauches, primes ?',
    qui: 'RH',
    sources: 'Accord salarial, plan d\'embauche, historique des augmentations.',
    piege: 'Penser au rattrapage salarial si l\'inflation dépasse l\'hypothèse du budget.',
  },
  H11: {
    question: 'Où seraient les frais commerciaux par rapport au budget, y compris les relances promotionnelles si les volumes décrochent ?',
    qui: 'Marketing',
    sources: 'Plan promotionnel, accords de coopération commerciale, historique des dépassements.',
    piege: 'Les relances suivent souvent une baisse de volume : la corrélation négative avec les volumes doit le dire.',
  },
  H12: {
    question: 'Où seraient les frais généraux par rapport au budget : énergie, maintenance, informatique ?',
    qui: 'DAF',
    sources: 'Contrats, factures d\'énergie, plan informatique.',
    piege: 'Une partie de ces frais est payée en devises : la relier au change plutôt que d\'élargir la fourchette.',
  },
};

export const EVENT_GUIDE: Record<EventCode, InputGuide> = {
  E01: {
    question: 'Quelle chance qu\'une révision du prix du carburant survienne dans l\'année, et de combien serait-elle ?',
    qui: 'Supply chain',
    sources: 'Révisions des 5 à 10 dernières années : leur nombre donne la fréquence, leur ampleur donne l\'amplitude.',
    piege: 'Fréquence = nombre d\'années avec révision divisé par le nombre d\'années observées, pas le nombre de révisions.',
  },
  E02: {
    question: 'Quelle chance de perdre un grand compte dans l\'année, et quelle part des volumes représenterait-il ?',
    qui: 'Directeur commercial',
    sources: 'Pertes de comptes des 5 dernières années, comptes en renégociation, poids de chaque grand compte.',
    piege: 'Si un compte est déjà perdu ou annoncé perdu, ce n\'est plus un risque : il doit sortir du budget.',
  },
  E03: {
    question: 'Quelle chance qu\'un retard de navire provoque une rupture, combien de ventes seraient perdues ce mois-là, et quel surcoût ?',
    qui: 'Supply chain',
    sources: 'Journal des ruptures, historique des retards portuaires, stock de sécurité.',
    piege: 'L\'amplitude est la part des ventes perdues sur le mois touché, pas sur l\'année.',
  },
};

export interface RiskCategory {
  code: string;
  libelle: string;
  /** Ce qu'il faut se demander. */
  question: string;
  /** Hypothèses ou événements qui couvrent habituellement ce risque, s'il y en a. */
  couvertPar: string;
}

/** Catégories de risques à passer en revue : chacune reçoit une décision, pour qu'aucune ne soit oubliée. */
export const RISK_CATEGORIES: RiskCategory[] = [
  { code: 'R01', libelle: 'Volumes et demande', question: 'Le marché, la saisonnalité ou la météo peuvent-ils faire décrocher les volumes ?', couvertPar: 'H01, H02, H03' },
  { code: 'R02', libelle: 'Prix de vente et remises', question: 'Les clients peuvent-ils imposer des remises ou refuser une hausse ?', couvertPar: 'H04' },
  { code: 'R03', libelle: 'Mix produits et canaux', question: 'Le poids des produits ou des canaux à faible marge peut-il augmenter ?', couvertPar: 'H05' },
  { code: 'R04', libelle: 'Change', question: 'Une dépréciation de la monnaie locale renchérit-elle les achats ?', couvertPar: 'H06' },
  { code: 'R05', libelle: 'Coût des achats', question: 'Les prix fournisseurs, importés ou locaux, peuvent-ils monter plus que prévu ?', couvertPar: 'H07, H08' },
  { code: 'R06', libelle: 'Transport et logistique', question: 'Le carburant, les tarifs transporteurs ou les délais d\'acheminement peuvent-ils déraper ?', couvertPar: 'H09, E01, E03' },
  { code: 'R07', libelle: 'Masse salariale et climat social', question: 'Un rattrapage salarial, des embauches ou un conflit social sont-ils possibles ?', couvertPar: 'H10' },
  { code: 'R08', libelle: 'Frais commerciaux et généraux', question: 'Des dépenses de relance, d\'énergie ou d\'informatique peuvent-elles dépasser le budget ?', couvertPar: 'H11, H12' },
  { code: 'R09', libelle: 'Client clé et impayés', question: 'La perte ou la défaillance d\'un grand client toucherait-elle l\'EBITDA ?', couvertPar: 'E02' },
  { code: 'R10', libelle: 'Fournisseur clé et ruptures', question: 'Un fournisseur unique peut-il faire défaut, ou un retard créer des ruptures ?', couvertPar: 'E03' },
  { code: 'R11', libelle: 'Fiscalité, douanes, réglementation', question: 'Droits de douane, taxes, prix administrés ou normes peuvent-ils changer en cours d\'année ?', couvertPar: '' },
  { code: 'R12', libelle: 'Climat et événements naturels', question: 'Cyclone, inondation, sécheresse : quel effet sur les ventes et la logistique ?', couvertPar: '' },
  { code: 'R13', libelle: 'Énergie et infrastructures', question: 'Des coupures d\'électricité ou une hausse de l\'énergie toucheraient-elles l\'activité ?', couvertPar: 'H12' },
  { code: 'R14', libelle: 'Informatique, cyber, fraude', question: 'Une panne, une attaque ou une fraude pourraient-elles arrêter la facturation ?', couvertPar: '' },
  { code: 'R15', libelle: 'Concurrence', question: 'Un nouvel entrant ou une guerre des prix sont-ils plausibles cette année ?', couvertPar: 'H04, E02' },
  { code: 'R16', libelle: 'Risques sous l\'EBITDA', question: 'Taux d\'intérêt, impôt, dépréciations : ils ne changent pas l\'EBITDA, le confirmer.', couvertPar: '' },
];

export const DECISION_LABEL: Record<NonNullable<RiskReview['decision']>, string> = {
  couvert: 'Couvert par le registre',
  stress: 'Couvert par un stress test',
  'non-significatif': 'Non significatif',
  'hors-modele': 'Hors modèle, signalé au CODIR',
};

/** Revue complète : une ligne par catégorie, en gardant les décisions déjà prises. */
export function fullReview(existing: RiskReview[] | undefined): RiskReview[] {
  return RISK_CATEGORIES.map((c) => existing?.find((r) => r.categorie === c.code) ?? { categorie: c.code, decision: null, ref: '', commentaire: '' });
}

/**
 * Traduction d'une fréquence observée en probabilité annuelle : k années touchées sur n observées.
 * Estimateur de Laplace (k + 1) / (n + 2) : jamais 0 ni 100 % sur un historique court.
 */
export function frequencyToProbability(k: number, n: number): number {
  if (!(n > 0) || !(k >= 0) || k > n) return NaN;
  return (k + 1) / (n + 2);
}
