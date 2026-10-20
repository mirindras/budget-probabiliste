/**
 * État de préparation des entrées : pour chaque hypothèse, événement, corrélation et catégorie de risque,
 * ce qui bloque le calcul, ce qui est à revoir, et ce qui est prêt. Sert l'assistant de saisie.
 */
import { RISK_CATEGORIES, fullReview } from './guide.ts';
import { asymmetry, chooseLaw, validateHypothesis } from './laws.ts';
import { postesOf } from './model.ts';
import { referenceErrors } from './references.ts';
import { DEFAULT_JUSTIFICATION, DEFAULT_OWNER } from './starter.ts';
import type { Budget, Hypothesis, RiskEvent, Scenario } from './types.ts';

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
  else if (x.proprietaire.trim() === DEFAULT_OWNER) out.push({ niveau: 'a-revoir', texte: 'Propriétaire à désigner : qui répond de ce chiffre ?' });
  const j = x.justification?.trim() ?? '';
  if (!j) out.push({ niveau: 'bloquant', texte: 'Justification manquante : sur quoi repose cette fourchette ?' });
  else if (j === DEFAULT_JUSTIFICATION) out.push({ niveau: 'a-revoir', texte: 'Fourchette par défaut : la remplacer par celle du propriétaire, avec sa source.' });
  else if (GENERIC.test(j) || j.length < JUSTIF_MIN) out.push({ niveau: 'a-revoir', texte: 'Justification trop courte : citer la source (historique, contrat, carnet de commandes…).' });
  if (x.statut === 'brouillon') out.push({ niveau: 'a-revoir', texte: 'Encore en brouillon : à faire valider par le propriétaire.' });
}

const isPoints = (h: Hypothesis) => h.effet === 'marge';

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

/** Postes du budget qu'aucune hypothèse, aucun événement ni le change ne font varier : ils restent au budget, sans incertitude. */
export function uncoveredPostes(s: Scenario, b: Budget): string[] {
  const covered = new Set<number>();
  const caRubs = new Set(b.rubriques.filter((r) => r.nature === 'ca').map((r) => r.code));
  const volBu = new Set<string>();
  const allBu = (p: { bu?: string[] }) => !p.bu || p.bu.length === 0;
  for (const h of s.registre.hypotheses) {
    if (h.effet === 'poste') for (const i of postesOf(b, h.portee)) covered.add(i);
    if (h.effet === 'volume' || h.effet === 'prix') for (const bu of allBu(h.portee) ? b.bu : h.portee.bu!) volBu.add(bu);
    if (h.effet === 'change') b.postes.forEach((p, i) => p.devises > 0 && covered.add(i));
  }
  for (const e of s.registre.evenements) {
    if (e.effet === 'poste') for (const i of postesOf(b, e.portee)) covered.add(i);
    if (e.effet === 'volume') for (const bu of allBu(e.portee) ? b.bu : e.portee.bu!) volBu.add(bu);
  }
  const certains = new Set(s.registre.postes_certains ?? []);
  return b.postes.filter((p, i) => {
    if (covered.has(i) || certains.has(p.code)) return false;
    // Un poste de chiffre d'affaires, ou à assiette volume ou CA, suit les volumes et les prix de sa BU.
    if (p.assiette !== 'fixe' || caRubs.has(p.rubrique)) return p.bu === null ? volBu.size === 0 : !volBu.has(p.bu);
    return true;
  }).map((p) => p.code);
}

export function readiness(s: Scenario, opts: { budgetImporte: boolean; reconciliationOk: boolean | null; budget?: Budget }): Readiness {
  const items: ReadinessItem[] = [];
  const budget: Finding[] = [];
  if (opts.reconciliationOk === false) budget.push({ niveau: 'bloquant', texte: 'L\'EBITDA recalculé ne retrouve pas l\'EBITDA publié (contrôle C01).' });
  if (!opts.budgetImporte) budget.push({ niveau: 'a-revoir', texte: 'Jeu de démonstration ALFA : importer votre budget avec le modèle BUDGET_BASE.' });
  // Références au budget : une portée qui nomme une BU, un poste ou une rubrique absents bloque l'entrée concernée.
  const refs = opts.budget ? referenceErrors(s, opts.budget) : [];
  const own = new Set([...s.registre.hypotheses, ...s.registre.evenements].map((x) => x.code));
  const refsOf = (code: string): Finding[] => refs.filter((m) => m.startsWith(`${code} : `)).map((m) => ({ niveau: 'bloquant', texte: `${m.slice(code.length + 3).replace(/^./, (c) => c.toUpperCase())}.` }));
  for (const m of refs) if (!own.has(m.split(' : ')[0])) budget.push({ niveau: 'bloquant', texte: `${m}.` });
  items.push({ code: 'BUDGET', etape: 'budget', libelle: 'Budget de base', constats: budget, statut: statusOf(budget) });

  for (const h of s.registre.hypotheses) {
    const f = [...refsOf(h.code), ...hypothesisFindings(h)];
    items.push({ code: h.code, etape: 'hypotheses', libelle: h.libelle, constats: f, statut: statusOf(f) });
  }
  if (opts.budget) {
    const left = uncoveredPostes(s, opts.budget);
    const f: Finding[] = left.length
      ? [{ niveau: 'a-revoir', texte: `${left.length} poste${left.length > 1 ? 's' : ''} sans hypothèse, qui reste${left.length > 1 ? 'nt' : ''} au budget sans incertitude : ${left.map((c) => opts.budget!.postes.find((p) => p.code === c)?.libelle ?? c).join(', ')}. Ajouter une hypothèse, ou les confirmer certains.` }]
      : [];
    items.push({ code: 'POSTES', etape: 'hypotheses', libelle: 'Postes couverts par une hypothèse', constats: f, statut: statusOf(f) });
  }
  for (const e of s.registre.evenements) {
    const f = [...refsOf(e.code), ...eventFindings(e)];
    items.push({ code: e.code, etape: 'evenements', libelle: e.libelle, constats: f, statut: statusOf(f) });
  }

  const corr: Finding[] = [];
  const unjustified = s.registre.correlations_rang.filter((c) => !c[3]?.trim() || GENERIC.test(c[3].trim()));
  if (unjustified.length) corr.push({ niveau: 'a-revoir', texte: `${unjustified.length} corrélation${unjustified.length > 1 ? 's' : ''} sans justification : ${unjustified.map((c) => `${c[0]}-${c[1]}`).join(', ')}.` });
  const zeros = s.registre.correlations_rang.filter((c) => c[2] === 0);
  if (zeros.length) corr.push({ niveau: 'a-revoir', texte: `${zeros.length} corrélation${zeros.length > 1 ? 's' : ''} à 0 : la saisir ou la retirer (${zeros.map((c) => `${c[0]}-${c[1]}`).join(', ')}).` });
  const fx = s.registre.hypotheses.find((h) => h.effet === 'change');
  if (fx && !s.registre.correlations_rang.some((c) => c[0] === fx.code || c[1] === fx.code)) corr.push({ niveau: 'a-revoir', texte: `Aucune corrélation avec le change (${fx.code}) : une dépréciation touche pourtant souvent les achats et les frais.` });
  const vols = s.registre.hypotheses.filter((h) => h.effet === 'volume');
  if (vols.length > 1 && !s.registre.correlations_rang.some((c) => vols.some((v) => v.code === c[0]) && vols.some((v) => v.code === c[1]))) {
    corr.push({ niveau: 'a-revoir', texte: 'Volumes des BU sans corrélation entre eux : une demande commune les fait souvent bouger ensemble.' });
  }
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
