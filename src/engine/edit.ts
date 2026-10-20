/**
 * Édition du registre : ajouter une hypothèse ou un événement avec des valeurs par défaut prudentes,
 * changer son effet, le retirer avec ce qui en dépend (corrélations, leviers, stress tests, paquets).
 * Toute nouvelle entrée part en brouillon, propriétaire à désigner : l'état de préparation le signale.
 */
import { describePortee } from './portee.ts';
import { uncoveredPostes } from './readiness.ts';
import { DEFAULT_JUSTIFICATION, DEFAULT_OWNER } from './starter.ts';
import type { Budget, EventEffect, HypEffect, Hypothesis, LeverDef, LeverType, Portee, RiskEvent, Scenario, StressDef, StressType } from './types.ts';

/** Premier code libre de la forme H13, E04 (pad 2), ou L6, S4 (pad 1). */
export function nextCode(prefix: string, used: string[], pad = 2): string {
  const taken = new Set(used);
  for (let i = 1; ; i++) {
    const c = `${prefix}${String(i).padStart(pad, '0')}`;
    if (!taken.has(c)) return c;
  }
}

const allCodes = (s: Scenario) => [...s.registre.hypotheses.map((h) => h.code), ...s.registre.evenements.map((e) => e.code)];

export const EFFECT_LABEL: Record<HypEffect, string> = {
  volume: 'Volume des ventes',
  prix: 'Prix de vente',
  poste: 'Montant d\'un poste',
  change: 'Cours de change',
  marge: 'Points de marge',
};

export const EFFECT_HELP: Record<HypEffect, string> = {
  volume: 'un facteur sur les volumes des BU choisies : chiffre d\'affaires et coûts qui suivent l\'activité',
  prix: 'un facteur sur le prix de vente net des BU choisies : chiffre d\'affaires seulement',
  poste: 'un facteur sur le montant des postes choisis (achats, salaires, loyers, énergie…)',
  change: 'le cours de la devise, qui s\'applique à la part en devises de chaque poste',
  marge: 'des points de marge sur le chiffre d\'affaires (mix produits ou canaux), comptés dans une rubrique',
};

/** Valeurs par défaut d'un effet : fourchette prudente, à remplacer par celle du propriétaire. */
function applyDefaults(h: Hypothesis, effet: HypEffect, b: Budget): void {
  delete h.p10;
  delete h.p50;
  delete h.p90;
  delete h.min;
  delete h.max;
  delete h.depart;
  delete h.derive_annuelle;
  delete h.volatilite_mensuelle;
  h.effet = effet;
  if (effet === 'change') {
    h.depart = b.change?.coursBudget ?? 1;
    h.derive_annuelle = 0;
    h.volatilite_mensuelle = 0.01;
    h.unite = b.change ? `${b.change.locale} pour 1 ${b.change.devise}` : 'cours';
    h.portee = {};
  } else if (effet === 'marge') {
    h.p10 = -0.5;
    h.p50 = 0;
    h.p90 = 0.5;
    h.unite = 'points de marge';
  } else {
    const [lo, hi] = effet === 'prix' ? [0.99, 1.01] : effet === 'volume' ? [0.97, 1.03] : [0.98, 1.03];
    h.p10 = lo;
    h.p50 = 1;
    h.p90 = hi;
    h.unite = 'facteur';
  }
}

/** Portée proposée pour un nouvel effet : ce que le registre ne couvre pas encore. */
export function defaultPortee(s: Scenario, b: Budget, effet: HypEffect): Portee {
  const hyps = s.registre.hypotheses;
  if (effet === 'volume') {
    const covered = new Set(hyps.filter((h) => h.effet === 'volume').flatMap((h) => h.portee.bu ?? b.bu));
    const free = b.bu.find((x) => !covered.has(x));
    return { bu: [free ?? b.bu[0]] };
  }
  if (effet === 'poste') {
    const left = uncoveredPostes(s, b).filter((c) => b.rubriques.find((r) => r.code === b.postes.find((p) => p.code === c)?.rubrique)?.nature !== 'ca');
    if (left.length) return { postes: [left[0]] };
    const charge = b.rubriques.find((r) => r.nature === 'charge' && b.postes.some((p) => p.rubrique === r.code));
    return charge ? { rubrique: charge.code } : {};
  }
  if (effet === 'marge') {
    const r = b.rubriques.find((x) => x.nature === 'produit') ?? b.rubriques.find((x) => x.nature === 'charge');
    return r ? { rubrique: r.code } : {};
  }
  return {};
}

export function newHypothesis(s: Scenario, b: Budget, effet: HypEffect, libelle?: string): Hypothesis {
  const h: Hypothesis = {
    code: nextCode('H', allCodes(s)),
    libelle: libelle?.trim() || EFFECT_LABEL[effet],
    famille: effet === 'change' ? 'Macroéconomie' : effet === 'poste' ? 'Coûts' : 'Commercial',
    effet,
    portee: defaultPortee(s, b, effet),
    proprietaire: DEFAULT_OWNER,
    unite: 'facteur',
    grain: '',
    justification: DEFAULT_JUSTIFICATION,
    statut: 'brouillon',
    k: 1,
  };
  applyDefaults(h, effet, b);
  if (effet !== 'change') h.portee = defaultPortee(s, b, effet);
  return h;
}

/** Changement d'effet : la fourchette repart des valeurs par défaut du nouvel effet, la portée est revue. */
export function changeEffect(s: Scenario, b: Budget, h: Hypothesis, effet: HypEffect): void {
  if (h.effet === effet) return;
  applyDefaults(h, effet, b);
  if (effet !== 'change') h.portee = defaultPortee({ ...s, registre: { ...s.registre, hypotheses: s.registre.hypotheses.filter((x) => x !== h) } }, b, effet);
}

export const EVENT_EFFECT_LABEL: Record<EventEffect, string> = {
  volume: 'Volume des ventes',
  poste: 'Montant d\'un poste',
};

/** Portée proposée pour un événement : la première BU, ou la première rubrique de charges. */
export function defaultEventPortee(b: Budget, effet: EventEffect): Portee {
  const charge = b.rubriques.find((r) => r.nature === 'charge' && b.postes.some((p) => p.rubrique === r.code));
  return effet === 'volume' ? { bu: [b.bu[0]] } : charge ? { rubrique: charge.code } : {};
}

export function newEvent(s: Scenario, b: Budget, effet: EventEffect, libelle?: string): RiskEvent {
  const portee = defaultEventPortee(b, effet);
  return {
    code: nextCode('E', allCodes(s)),
    libelle: libelle?.trim() || (effet === 'volume' ? 'Perte de ventes' : 'Dérapage d\'un poste'),
    famille: effet === 'volume' ? 'Commercial' : 'Coûts',
    effet,
    sens: effet === 'volume' ? 'baisse' : 'hausse',
    portee,
    proprietaire: DEFAULT_OWNER,
    p: 0.2,
    amplitude: [0.05, 0.15],
    duree: 'fin',
    cible: describePortee(portee, b),
    justification: DEFAULT_JUSTIFICATION,
    statut: 'brouillon',
  };
}

/**
 * Ce qui dépend d'une hypothèse ou d'un événement : à retirer avec lui. Le change emporte aussi
 * la couverture de change et les chocs de change, qui n'ont plus de sens sans lui.
 */
export function dependents(s: Scenario, code: string): { correlations: number; leviers: string[]; stress: string[] } {
  const fx = s.registre.hypotheses.find((h) => h.code === code)?.effet === 'change';
  const uses = (p: Portee) => p.hypothese === code || p.evenement === code;
  return {
    correlations: s.registre.correlations_rang.filter((c) => c[0] === code || c[1] === code).length,
    leviers: s.leviers.filter((l) => uses(l.portee) || (fx && l.type === 'couverture')).map((l) => l.code),
    stress: s.stress.filter((x) => uses(x.portee) || (fx && x.type === 'change')).map((x) => x.code),
  };
}

/** Retire une hypothèse ou un événement, ses corrélations, et les leviers et stress tests qui le visent. */
export function removeDriver(s: Scenario, code: string): void {
  const dep = dependents(s, code);
  const gone = new Set([...dep.leviers, ...dep.stress]);
  const r = s.registre;
  r.hypotheses = r.hypotheses.filter((h) => h.code !== code);
  r.evenements = r.evenements.filter((e) => e.code !== code);
  r.correlations_rang = r.correlations_rang.filter((c) => c[0] !== code && c[1] !== code);
  if (r.revue_risques) {
    for (const x of r.revue_risques) x.ref = x.ref.split(/[,;]\s*/).filter((c) => c.trim() && c.trim() !== code).join(', ');
  }
  for (const c of gone) removeCase(s, c);
}

/* ------------------------------------------------------------------ Leviers et stress tests */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fr = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',').replace('-', '−');
const pc = (x: number) => `${fr(x * 100)} %`;
const des = (m: number | null) => `dès ${MOIS[(m ?? 1) - 1]}`;
const rubLib = (b: Budget, code?: string) => b.rubriques.find((r) => r.code === code)?.libelle ?? code ?? '?';

export const LEVER_LABEL: Record<LeverType, string> = {
  couverture: 'Couverture de change',
  prix: 'Hausse de prix',
  montant: 'Économie ou dépense sur une rubrique',
  plafond: 'Plafond sur une hypothèse',
  attenuation: 'Atténuation d\'un événement',
};
/** Libellés proposés à la création, à remplacer par le nom de l'action. */
const LEVER_NAME: Record<LeverType, string> = {
  couverture: 'Couverture de change',
  prix: 'Hausse tarifaire',
  montant: 'Plan d\'économies',
  plafond: 'Plafond contractuel',
  attenuation: 'Plan de continuité',
};
const STRESS_NAME: Record<StressType, string> = {
  change: 'Dépréciation de la monnaie locale',
  evenement: 'Événement forcé',
  poste: 'Hausse de coûts',
  volume: 'Baisse d\'activité',
};
export const STRESS_LABEL: Record<StressType, string> = {
  change: 'Choc de change',
  evenement: 'Événement forcé',
  poste: 'Hausse de postes',
  volume: 'Baisse des volumes',
};

/** Règle de calcul d'un levier, en clair, déduite de son type et de ses paramètres. */
export function leverRule(l: LeverDef, b: Budget): string {
  const p = l.params;
  const u = b.unites.principale;
  switch (l.type) {
    case 'couverture':
      return `${pc(p.part)} des achats en devises à cours garanti de ${fr(p.cours)}`;
    case 'prix':
      return `Prix ${p.hausse >= 0 ? '+' : ''}${pc(p.hausse)} (${describePortee(l.portee, b)}) ${des(l.mois)}, élasticité ${fr(p.elasticite)} : volumes ${p.hausse * p.elasticite >= 0 ? '+' : ''}${pc(p.hausse * p.elasticite)}`;
    case 'montant':
      return `${rubLib(b, l.portee.rubrique)} ${p.variationAnnuelle >= 0 ? '+' : ''}${fr(p.variationAnnuelle)} ${u} en année pleine, ${des(l.mois)}${l.cout ? ` ; coût unique de ${fr(l.cout)} ${u} en janvier` : ''}`;
    case 'plafond':
      return `${l.portee.hypothese ?? '?'} plafonnée à ${fr(p.plafond)}${Number.isFinite(p.plancher) ? `, plancher ${fr(p.plancher)}` : ''}`;
    case 'attenuation':
      return `Impact de ${l.portee.evenement ?? '?'} réduit de ${pc(p.reduction)}, surcoût supprimé ; ${rubLib(b, l.portee.rubrique)} + ${fr(p.coutAnnuel)} ${u} par an`;
  }
}

/** Règle d'un stress test, en clair. */
export function stressRule(x: StressDef, b: Budget): string {
  const c = x.params.choc;
  switch (x.type) {
    case 'change':
      return `Cours +${pc(c)} au-dessus de la trajectoire simulée, ${des(x.mois)}`;
    case 'evenement':
      return `${x.portee.evenement ?? '?'} forcé, impact de ${pc(c)}, ${des(x.mois)}`;
    case 'poste':
      return `${describePortee(x.portee, b)} +${pc(c)} ${des(x.mois)}, en plus des tirages`;
    case 'volume':
      return `Volumes (${describePortee(x.portee, b)}) −${pc(c)} ${des(x.mois)}`;
  }
}

const caseCodes = (s: Scenario) => [...s.leviers.map((l) => l.code), ...s.stress.map((x) => x.code), ...s.paquets.map((p) => p.code)];
const bigCharge = (b: Budget) => {
  const tot = (code: string) => b.postes.filter((p) => p.rubrique === code).reduce((a, p) => a + p.montants.reduce((x, y) => x + y, 0), 0);
  return [...b.rubriques].filter((r) => r.nature === 'charge' && tot(r.code) > 0).sort((x, y) => tot(y.code) - tot(x.code))[0];
};

/** Types de levier possibles avec ce registre : la couverture suppose le change, le plafond une hypothèse, l'atténuation un événement. */
export function leverTypesFor(s: Scenario): LeverType[] {
  const r = s.registre;
  return (['couverture', 'prix', 'montant', 'plafond', 'attenuation'] as LeverType[]).filter((t) =>
    t === 'couverture' ? r.hypotheses.some((h) => h.effet === 'change') : t === 'plafond' ? r.hypotheses.some((h) => h.effet !== 'change') : t === 'attenuation' ? r.evenements.length > 0 : true);
}
export function stressTypesFor(s: Scenario): StressType[] {
  const r = s.registre;
  return (['change', 'evenement', 'poste', 'volume'] as StressType[]).filter((t) =>
    t === 'change' ? r.hypotheses.some((h) => h.effet === 'change') : t === 'evenement' ? r.evenements.length > 0 : true);
}

export function newLever(s: Scenario, b: Budget, type: LeverType, libelle?: string): LeverDef {
  const r = s.registre;
  const ch = bigCharge(b);
  const scale = Math.abs(b.ebitdaPublie) || 1;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const hyp = r.hypotheses.find((h) => h.effet === 'poste') ?? r.hypotheses.find((h) => h.effet !== 'change');
  const l: LeverDef = {
    code: nextCode('L', caseCodes(s), 1), type, portee: {}, libelle: libelle?.trim() || LEVER_NAME[type], description: '', hypotheses: '', regle: '',
    cout: 0, coutLibelle: 'aucun', mois: type === 'couverture' || type === 'plafond' || type === 'attenuation' ? 1 : 4,
    proprietaire: DEFAULT_OWNER, faisabilite: 'À instruire', params: {},
  };
  switch (type) {
    case 'couverture':
      l.params = { part: 0.5, cours: b.change?.coursBudget ?? 1 };
      l.coutLibelle = 'implicite dans le cours';
      l.hypotheses = r.hypotheses.find((h) => h.effet === 'change')?.code ?? '';
      break;
    case 'prix':
      l.params = { hausse: 0.01, elasticite: -0.8 };
      l.coutLibelle = 'volumes perdus, inclus';
      l.hypotheses = r.hypotheses.filter((h) => h.effet === 'prix' || h.effet === 'volume').map((h) => h.code).join(', ');
      break;
    case 'montant':
      l.portee = ch ? { rubrique: ch.code } : {};
      l.params = { variationAnnuelle: -round(scale * 0.02) };
      break;
    case 'plafond': {
      l.portee = hyp ? { hypothese: hyp.code } : {};
      const p50 = hyp?.p50 ?? 1;
      l.params = { plafond: round(hyp?.p90 !== undefined ? (p50 + hyp.p90) / 2 : p50) };
      l.hypotheses = hyp?.code ?? '';
      break;
    }
    case 'attenuation': {
      const e = r.evenements[0];
      const cost = round(scale * 0.01);
      l.portee = { evenement: e?.code, rubrique: ch?.code };
      l.params = { reduction: 0.5, coutAnnuel: cost };
      l.cout = cost;
      l.coutLibelle = `${String(cost).replace('.', ',')} ${b.unites.principale} par an`;
      l.hypotheses = e?.code ?? '';
      break;
    }
  }
  l.regle = leverRule(l, b);
  l.description = l.regle;
  return l;
}

export function newStress(s: Scenario, b: Budget, type: StressType, libelle?: string): StressDef {
  const e = s.registre.evenements[0];
  const ch = bigCharge(b);
  const x: StressDef = { code: nextCode('S', caseCodes(s), 1), type, portee: {}, libelle: libelle?.trim() || STRESS_NAME[type], regle: '', mois: 4, params: { choc: 0.1 } };
  if (type === 'change') x.params = { choc: 0.15 };
  if (type === 'evenement') {
    x.portee = { evenement: e?.code };
    x.params = { choc: e ? e.amplitude[1] : 0.1 };
  }
  if (type === 'poste') {
    x.portee = ch ? { rubrique: ch.code } : {};
    x.params = { choc: 0.2 };
  }
  x.regle = stressRule(x, b);
  return x;
}

/** Retire un levier, un stress test ou un paquet ; les paquets qui le contenaient le perdent, et disparaissent s'ils sont vides. */
export function removeCase(s: Scenario, code: string): void {
  s.leviers = s.leviers.filter((l) => l.code !== code);
  s.stress = s.stress.filter((x) => x.code !== code);
  s.paquets = s.paquets.filter((p) => p.code !== code).map((p) => ({ ...p, codes: p.codes.filter((c) => c !== code) })).filter((p) => p.codes.length > 0);
  s.actifs = s.actifs.filter((c) => c !== code);
}
