/**
 * Registre de départ d'un budget importé : une hypothèse de volume par BU, une hypothèse de prix,
 * une hypothèse par rubrique de charges, le change s'il y a des postes en devises, deux stress tests.
 * Fourchettes par défaut, propriétaires à désigner, tout en brouillon : la saisie guidée signale
 * chaque élément à compléter, et la note CODIR reste bloquée tant que le registre n'est pas validé.
 */
import { TOOL_VERSION } from './alfa.ts';
import { fullReview } from './guide.ts';
import { referenceErrors } from './references.ts';
import type { Budget, Hypothesis, Paquet, Scenario, StressDef } from './types.ts';

export const DEFAULT_OWNER = 'À désigner';
export const DEFAULT_JUSTIFICATION = 'Fourchette par défaut, à remplacer par celle du propriétaire.';

const code = (i: number) => `H${String(i).padStart(2, '0')}`;

export function starterHypotheses(b: Budget): Hypothesis[] {
  const out: Hypothesis[] = [];
  const base = { proprietaire: DEFAULT_OWNER, justification: DEFAULT_JUSTIFICATION, statut: 'brouillon' as const, k: 1 };
  for (const bu of b.bu) {
    out.push({ ...base, code: code(out.length + 1), libelle: `Volume ${bu}`, famille: 'Commercial', effet: 'volume', portee: { bu: [bu] }, unite: 'facteur', grain: `BU ${bu}`, p10: 0.97, p50: 1, p90: 1.03 });
  }
  out.push({ ...base, code: code(out.length + 1), libelle: 'Prix de vente', famille: 'Commercial', effet: 'prix', portee: {}, unite: 'facteur', grain: 'toutes les BU', p10: 0.99, p50: 1, p90: 1.01 });
  for (const r of b.rubriques) {
    if (r.nature !== 'charge' || !b.postes.some((p) => p.rubrique === r.code)) continue;
    out.push({ ...base, code: code(out.length + 1), libelle: r.libelle, famille: 'Coûts', effet: 'poste', portee: { rubrique: r.code }, unite: 'facteur', grain: `rubrique ${r.libelle}`, p10: 0.98, p50: 1, p90: 1.03 });
  }
  if (b.change && b.postes.some((p) => p.devises > 0)) {
    out.push({
      ...base, code: code(out.length + 1), libelle: `Change ${b.change.devise}/${b.change.locale}, cours moyen`, famille: 'Macroéconomie', effet: 'change', portee: {},
      unite: `${b.change.locale} pour 1 ${b.change.devise}`, grain: 'total', depart: b.change.coursBudget, derive_annuelle: 0, volatilite_mensuelle: 0.01,
    });
  }
  return out;
}

export function starterStress(b: Budget, hyps: Hypothesis[]): StressDef[] {
  const out: StressDef[] = [
    { code: 'S1', type: 'volume', portee: {}, libelle: 'Baisse d\'activité', regle: 'Volumes de toutes les BU −10 % dès avril', mois: 4, params: { choc: 0.1 } },
  ];
  if (hyps.some((h) => h.effet === 'change') && b.change) {
    out.push({ code: 'S2', type: 'change', portee: {}, libelle: `Dépréciation de la monnaie locale`, regle: 'Cours +15 % au-dessus de la trajectoire simulée, dès avril', mois: 4, params: { choc: 0.15 } });
  }
  return out;
}

export function starterScenario(b: Budget): Scenario {
  const hypotheses = starterHypotheses(b);
  const stress = starterStress(b, hypotheses);
  const paquets: Paquet[] = stress.length > 1 ? [{ code: 'S1+S2', libelle: 'Chocs combinés', codes: ['S1', 'S2'] }] : [];
  return {
    schemaVersion: 2,
    toolVersion: TOOL_VERSION,
    nom: b.libelle,
    registre: {
      version: 'v1',
      statut: 'brouillon',
      hypotheses,
      evenements: [],
      correlations_rang: [],
      bruit_volumes: { phi: 0.6, sigma_mensuel: 0.03 },
      revue_risques: fullReview(undefined),
    },
    leviers: [],
    stress,
    paquets,
    actifs: [],
    n: 10000,
    graine: b.exercice,
    moisClos: 0,
  };
}

/** Scénario à utiliser avec un nouveau budget : le registre courant s'il en nomme bien les éléments, sinon un registre de départ. */
export function adaptScenario(current: Scenario, b: Budget): { scenario: Scenario; starter: boolean } {
  if (referenceErrors(current, b).length === 0) return { scenario: { ...current, moisClos: 0 }, starter: false };
  return { scenario: starterScenario(b), starter: true };
}
