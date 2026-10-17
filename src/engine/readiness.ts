/**
 * État de préparation des entrées : pour chaque hypothèse, événement, corrélation et catégorie de risque,
 * ce qui bloque le calcul, ce qui est à revoir, et ce qui est prêt. Sert l'assistant de saisie.
 */
import { RISK_CATEGORIES, fullReview } from './guide.ts';
import { asymmetry, chooseLaw, validateHypothesis } from './laws.ts';
import type { Hypothesis, RiskEvent, Scenario } from './types.ts';

export type Level = 'bloquant' | 'a-revoir';
export interface Finding {
  niveau: Level;
  texte: string;
}
export type Step = 'budget' | 'hypotheses' | 'evenements' | 'correlations' | 'revue';
export interface ReadinessItem {
  code: string;
  etape: Step;
  libelle: string;
  constats: Finding[];
  /** prêt : rien à signaler ; à revoir : saisie possible mais discutable ; bloquant : le calcul est refusé. */
  statut: 'pret' | Level;
}
export interface Readiness {
  items: ReadinessItem[];
  prets: number;
  total: number;
  bloquants: number;
}

const GENERIC = /^(à justifier|a justifier|tbd|todo|à compléter|a completer|\?+|-+|n\/?a|ras|voir .{0,10})$/i;
/** Une justification utile cite une source ou un raisonnement : quelques mots au moins. */
const JUSTIF_MIN = 20;

function governance(x: { proprietaire: string; justification: string; statut: string }, out: Finding[]): void {
  if (!x.proprietaire?.trim()) out.push({ niveau: 'bloquant', texte: 'Propriétaire manquant : qui répond de ce chiffre ?' });
  const j = x.justification?.trim() ?? '';
  if (!j) out.push({ niveau: 'bloquant', texte: 'Justification manquante : sur quoi repose cette fourchette ?' });
  else if (GENERIC.test(j) || j.length < JUSTIF_MIN) out.push({ niveau: 'a-revoir', texte: 'Justification trop courte : citer la source (historique, contrat, carnet de commandes…).' });
  if (x.statut === 'brouillon') out.push({ niveau: 'a-revoir', texte: 'Encore en brouillon : le propriétaire doit la valider.' });
}

const isPoints = (h: Hypothesis) => h.unite.startsWith('points');

function hypothesisFindings(h: Hypothesis): Finding[] {
  const out: Finding[] = [];
  for (const e of validateHypothesis(h)) {
    // Les manques de gouvernance sont reformulés plus bas ; les autres erreurs bloquent telles quelles.
    if (!/propriétaire manquant|justification manquante/.test(e)) out.push({ niveau: 'bloquant', texte: e.replace(`${h.code} : `, '') });
  }
  governance(h, out);
  if (out.some((f) => f.niveau === 'bloquant' && !/Propriétaire|Justification/.test(f.texte))) return out;
  const law = chooseLaw(h);
  if (law === 'marche-aleatoire') {
    const v = h.volatilite_mensuelle!;
    if (v < 0.003) out.push({ niveau: 'a-revoir', texte: `Volatilité de ${(v * 100).toFixed(1).replace('.', ',')} % par mois : quasi nulle, le change ne porterait presque aucun risque.` });
    if (v > 0.08) out.push({ niveau: 'a-revoir', texte: `Volatilité de ${(v * 100).toFixed(1).replace('.', ',')} % par mois : très élevée, vérifier qu'elle est bien mensuelle et non annuelle.` });
    if (Math.abs(h.derive_annuelle!) > 0.3) out.push({ niveau: 'a-revoir', texte: 'Dérive annuelle de plus de 30 % : vérifier l\'unité (0,04 = 4 %).' });
    return out;
  }
  if (law === 'pert') return out;
  const p10 = h.p10!;
  const p90 = h.p90!;
  const p50 = h.p50 ?? Math.sqrt(p10 * p90);
  const width = isPoints(h) ? p90 - p10 : (p90 - p10) / Math.abs(p50);
  if (isPoints(h)) {
    if (width < 0.1) out.push({ niveau: 'a-revoir', texte: 'Fourchette de moins de 0,1 point : le risque est-il vraiment aussi faible ?' });
    if (width > 5) out.push({ niveau: 'a-revoir', texte: 'Fourchette de plus de 5 points : vérifier l\'unité (points de marge, pas pourcentage).' });
  } else {
    if (width < 0.01) out.push({ niveau: 'a-revoir', texte: 'Fourchette de moins de 1 % : presque une certitude. Une fourchette trop étroite sous-estime le risque.' });
    if (width > 0.6) out.push({ niveau: 'a-revoir', texte: 'Fourchette de plus de 60 % : vérifier la saisie (1,05 = budget + 5 %).' });
    if (Math.abs(p50 - 1) > 0.05) out.push({ niveau: 'a-revoir', texte: `Valeur centrale à ${((p50 - 1) * 100).toFixed(1).replace('.', ',')} % du budget : si c'est l'avis du propriétaire, le budget lui-même est peut-être à revoir.` });
  }
  if (h.p50 != null) {
    const a = asymmetry(p10, h.p50, p90);
    if (a > 4 || a < 0.25) out.push({ niveau: 'a-revoir', texte: 'Fourchette très déséquilibrée : un côté est plus de 4 fois plus long que l\'autre. Est-ce voulu ?' });
  }
  return out;
}

function eventFindings(e: RiskEvent): Finding[] {
  const out: Finding[] = [];
  governance(e, out);
  if (!(e.p >= 0 && e.p <= 1)) out.push({ niveau: 'bloquant', texte: 'Probabilité hors de 0 à 100 %.' });
  else if (e.p === 0) out.push({ niveau: 'a-revoir', texte: 'Probabilité nulle : l\'événement ne pèse plus rien. Le retirer ou justifier.' });
  else if (e.p >= 0.9) out.push({ niveau: 'a-revoir', texte: 'Probabilité de 90 % ou plus : ce n\'est plus un risque, c\'est une hypothèse du budget.' });
  if (!(e.amplitude[0] <= e.amplitude[1])) out.push({ niveau: 'bloquant', texte: 'Amplitude minimale supérieure à la maximale.' });
  else if (e.amplitude[1] === 0) out.push({ niveau: 'a-revoir', texte: 'Amplitude nulle : l\'événement n\'a aucun effet.' });
  if (!e.cible?.trim()) out.push({ niveau: 'a-revoir', texte: 'Cible non précisée : quelle ligne du P&L l\'événement touche-t-il ?' });
  return out;
}

const statusOf = (f: Finding[]): ReadinessItem['statut'] => (f.some((x) => x.niveau === 'bloquant') ? 'bloquant' : f.length ? 'a-revoir' : 'pret');

export function readiness(s: Scenario, opts: { budgetImporte: boolean; reconciliationOk: boolean | null }): Readiness {
  const items: ReadinessItem[] = [];
  const budget: Finding[] = [];
  if (opts.reconciliationOk === false) budget.push({ niveau: 'bloquant', texte: 'L\'EBITDA recalculé ne retrouve pas l\'EBITDA publié (contrôle C01).' });
  if (!opts.budgetImporte) budget.push({ niveau: 'a-revoir', texte: 'Jeu de démonstration ALFA : importer votre budget avec le modèle BUDGET_BASE.' });
  items.push({ code: 'BUDGET', etape: 'budget', libelle: 'Budget de base', constats: budget, statut: statusOf(budget) });

  for (const h of s.registre.hypotheses) {
    const f = hypothesisFindings(h);
    items.push({ code: h.code, etape: 'hypotheses', libelle: h.libelle, constats: f, statut: statusOf(f) });
  }
  for (const e of s.registre.evenements) {
    const f = eventFindings(e);
    items.push({ code: e.code, etape: 'evenements', libelle: e.libelle, constats: f, statut: statusOf(f) });
  }

  const corr: Finding[] = [];
  const unjustified = s.registre.correlations_rang.filter((c) => !c[3]?.trim() || GENERIC.test(c[3].trim()));
  if (unjustified.length) corr.push({ niveau: 'a-revoir', texte: `${unjustified.length} corrélation${unjustified.length > 1 ? 's' : ''} sans justification : ${unjustified.map((c) => `${c[0]}-${c[1]}`).join(', ')}.` });
  const zeros = s.registre.correlations_rang.filter((c) => c[2] === 0);
  if (zeros.length) corr.push({ niveau: 'a-revoir', texte: `${zeros.length} corrélation${zeros.length > 1 ? 's' : ''} à 0 : la saisir ou la retirer (${zeros.map((c) => `${c[0]}-${c[1]}`).join(', ')}).` });
  if (!s.registre.correlations_rang.some((c) => c[0] === 'H06' || c[1] === 'H06')) corr.push({ niveau: 'a-revoir', texte: 'Aucune corrélation avec le change (H06) : une dépréciation touche pourtant souvent les achats et les frais.' });
  items.push({ code: 'CORR', etape: 'correlations', libelle: 'Corrélations entre hypothèses', constats: corr, statut: statusOf(corr) });

  const review = fullReview(s.registre.revue_risques);
  for (const c of RISK_CATEGORIES) {
    const r = review.find((x) => x.categorie === c.code)!;
    const f: Finding[] = [];
    if (!r.decision) f.push({ niveau: 'a-revoir', texte: 'Pas encore passé en revue : décider où ce risque est traité.' });
    else if ((r.decision === 'couvert' || r.decision === 'stress') && !r.ref.trim()) f.push({ niveau: 'a-revoir', texte: 'Préciser l\'hypothèse, l\'événement ou le stress qui le couvre.' });
    else if ((r.decision === 'non-significatif' || r.decision === 'hors-modele') && r.commentaire.trim().length < 10) f.push({ niveau: 'a-revoir', texte: 'Expliquer en une phrase pourquoi ce risque n\'est pas modélisé.' });
    items.push({ code: c.code, etape: 'revue', libelle: c.libelle, constats: f, statut: statusOf(f) });
  }

  const prets = items.filter((i) => i.statut === 'pret').length;
  return { items, prets, total: items.length, bloquants: items.filter((i) => i.statut === 'bloquant').length };
}
