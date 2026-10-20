/**
 * Validation de structure d'un scénario venu de l'extérieur (lien de partage, brouillon, fichier) :
 * champs obligatoires, types, codes uniques, effets et types connus, bornes. Elle précède tout calcul,
 * pour qu'un scénario mal formé produise une erreur métier lisible et jamais une exception du moteur.
 * Les références au budget (BU, postes, rubriques) sont contrôlées ensuite, budget en main (references.ts).
 */
import { RISK_CATEGORIES } from './guide.ts';
import { ASSIETTES, EVENT_EFFECTS, HYP_EFFECTS, LEVER_PARAMS, LEVER_TYPES, NATURES, RISK_DECISIONS, STRESS_PARAMS, STRESS_TYPES, type Budget, type Scenario } from './types.ts';

const STATUTS = ['brouillon', 'valide', 'gele'];

/** Bornes du registre : assez larges pour un P&L détaillé, assez serrées pour une entrée externe. */
export const SHAPE_LIMITS = { hypotheses: 60, evenements: 30, leviers: 20, stress: 20, paquets: 20, bu: 30, rubriques: 40, postes: 400 } as const;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Longueur maximale d'un texte libre (libellé, justification…). */
const TEXT_MAX = 2000;
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length <= TEXT_MAX;
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isPair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);
/** Code d'une hypothèse, d'un événement, d'un levier, d'un poste : lettres, chiffres, tiret, soulignement, point, signe +. */
export const CODE_RE = /^[\p{L}\p{N}_.+-]{1,24}$/u;
const isCode = (x: unknown): x is string => typeof x === 'string' && CODE_RE.test(x);
const isStrList = (x: unknown, max = 400): x is string[] => Array.isArray(x) && x.length <= max && x.every((y) => typeof y === 'string' && y.length <= 80);

function checkUnique(where: string, items: Obj[], errors: string[]): void {
  const seen = new Set<string>();
  items.forEach((x, i) => {
    if (!isCode(x.code)) errors.push(`${where}, ligne ${i + 1} : code absent ou invalide (lettres, chiffres, _ - . +, 24 caractères au plus)`);
    else if (seen.has(x.code)) errors.push(`${where} : code ${x.code} en double`);
    else seen.add(x.code);
  });
}

function checkPortee(where: string, p: unknown, errors: string[]): void {
  if (!isObj(p)) {
    errors.push(`${where} : portée absente`);
    return;
  }
  if (p.bu !== undefined && !isStrList(p.bu, SHAPE_LIMITS.bu)) errors.push(`${where} : liste de BU mal formée`);
  if (p.postes !== undefined && !isStrList(p.postes)) errors.push(`${where} : liste de postes mal formée`);
  for (const f of ['rubrique', 'hypothese', 'evenement']) if (p[f] !== undefined && !isStr(p[f])) errors.push(`${where} : ${f} non textuelle`);
}

function checkHypothesis(h: Obj, errors: string[]): void {
  const c = String(h.code);
  for (const f of ['libelle', 'proprietaire', 'justification', 'famille', 'unite', 'grain']) if (!isStr(h[f])) errors.push(`${c} : champ ${f} absent, non textuel ou de plus de ${TEXT_MAX} caractères`);
  if (!STATUTS.includes(h.statut as string)) errors.push(`${c} : statut inconnu`);
  if (!HYP_EFFECTS.includes(h.effet as never)) errors.push(`${c} : effet « ${String(h.effet)} » inconnu (${HYP_EFFECTS.join(', ')})`);
  checkPortee(c, h.portee, errors);
  if (h.k !== undefined && !isNum(h.k)) errors.push(`${c} : k non numérique`);
  if (h.effet === 'change') {
    for (const f of ['depart', 'derive_annuelle', 'volatilite_mensuelle']) if (!isNum(h[f])) errors.push(`${c} : ${f} absent ou non numérique`);
    return;
  }
  if (!isNum(h.p10) || !isNum(h.p90)) errors.push(`${c} : P10 et P90 numériques obligatoires`);
  if (h.p50 !== null && h.p50 !== undefined && !isNum(h.p50)) errors.push(`${c} : P50 non numérique`);
  const pert = h.min !== undefined || h.max !== undefined;
  if (pert && !(isNum(h.min) && isNum(h.max) && isNum(h.p50))) errors.push(`${c} : loi PERT incomplète (minimum, mode et maximum numériques)`);
}

function checkEvent(e: Obj, errors: string[]): void {
  const c = String(e.code);
  for (const f of ['libelle', 'proprietaire', 'justification', 'cible', 'famille']) if (!isStr(e[f])) errors.push(`${c} : champ ${f} absent, non textuel ou de plus de ${TEXT_MAX} caractères`);
  if (!EVENT_EFFECTS.includes(e.effet as never)) errors.push(`${c} : effet « ${String(e.effet)} » inconnu (volume ou poste)`);
  if (e.sens !== 'baisse' && e.sens !== 'hausse') errors.push(`${c} : sens attendu « baisse » ou « hausse »`);
  checkPortee(c, e.portee, errors);
  if (!isNum(e.p)) errors.push(`${c} : probabilité non numérique`);
  if (!isPair(e.amplitude)) errors.push(`${c} : amplitude attendue sous la forme [minimum, maximum]`);
  if (e.surcout !== undefined && !isPair(e.surcout)) errors.push(`${c} : surcoût attendu sous la forme [minimum, maximum]`);
  if (e.rubriqueSurcout !== undefined && !isStr(e.rubriqueSurcout)) errors.push(`${c} : rubrique du surcoût non textuelle`);
  if (e.duree !== 'fin' && e.duree !== 'mois') errors.push(`${c} : durée attendue « fin » ou « mois »`);
  if (!STATUTS.includes(e.statut as string)) errors.push(`${c} : statut inconnu`);
}

function checkCase(where: string, x: Obj, params: Record<string, string[]>, types: readonly string[], nullable: boolean, errors: string[]): void {
  const c = String(x.code);
  if (!isStr(x.libelle)) errors.push(`${where} ${c} : libellé absent`);
  if (!types.includes(x.type as string)) errors.push(`${where} ${c} : type « ${String(x.type)} » inconnu (${types.join(', ')})`);
  checkPortee(`${where} ${c}`, x.portee, errors);
  const mois = x.mois;
  if (!(isInt(mois) && mois >= 1 && mois <= 12) && !(nullable && mois === null)) errors.push(`${where} ${c} : mois d'effet hors de 1 à 12`);
  if (nullable && !(x.cout === null || isNum(x.cout))) errors.push(`${where} ${c} : coût non numérique`);
  if (!isObj(x.params)) {
    errors.push(`${where} ${c} : paramètres absents`);
    return;
  }
  for (const p of params[x.type as string] ?? []) if (!isNum(x.params[p])) errors.push(`${where} ${c} : paramètre ${p} absent ou non numérique`);
}

function list(where: string, x: unknown, max: number, errors: string[]): Obj[] | null {
  if (!Array.isArray(x) || !x.every(isObj)) {
    errors.push(`${where} : liste absente ou mal formée`);
    return null;
  }
  if (x.length > max) {
    errors.push(`${where} : ${x.length} éléments, ${max} au plus`);
    return null;
  }
  return x;
}

/** Erreurs de structure d'un scénario ; vide si le moteur peut le lire sans risque. */
export function checkScenarioShape(x: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(x)) return ['Scénario illisible : objet attendu'];
  if (x.schemaVersion !== 2) errors.push(`Version de schéma ${String(x.schemaVersion)} non prise en charge (2 attendue)`);
  if (!isStr(x.toolVersion)) errors.push('Version de l\'outil absente');
  if (!isStr(x.nom)) errors.push('Nom du scénario absent');
  // Les bornes de N (7.1) sont une règle métier, contrôlée avec les autres dans validateScenario.
  if (!(isInt(x.n) && x.n > 0)) errors.push('N : entier positif attendu');
  if (!(isInt(x.graine) && x.graine >= 0)) errors.push('Graine : entier positif attendu');
  if (!(isInt(x.moisClos) && x.moisClos >= 0 && x.moisClos <= 11)) errors.push('Mois clos : entier de 0 à 11 attendu');

  const reg = x.registre;
  if (!isObj(reg)) return [...errors, 'Registre absent'];
  if (!isStr(reg.version)) errors.push('Registre : version absente');
  const hyps = list('Hypothèses', reg.hypotheses, SHAPE_LIMITS.hypotheses, errors);
  const evts = list('Événements', reg.evenements, SHAPE_LIMITS.evenements, errors);
  if (hyps) {
    if (!hyps.length) errors.push('Hypothèses : au moins une attendue');
    checkUnique('Hypothèses', hyps, errors);
    for (const h of hyps) checkHypothesis(h, errors);
  }
  if (evts) {
    checkUnique('Événements', evts, errors);
    for (const e of evts) checkEvent(e, errors);
  }
  const drivers = [...(hyps ?? []), ...(evts ?? [])].map((d) => d.code as string);
  const dup = drivers.filter((c, i) => drivers.indexOf(c) !== i);
  if (dup.length) errors.push(`Codes communs à une hypothèse et un événement : ${[...new Set(dup)].join(', ')}`);
  const corr = reg.correlations_rang;
  const pairs = (drivers.length * (drivers.length - 1)) / 2;
  if (!Array.isArray(corr)) errors.push('Registre : corrélations absentes');
  else if (corr.length > pairs) errors.push(`Registre : ${corr.length} corrélations, ${pairs} paires possibles au plus`);
  else {
    corr.forEach((c, i) => {
      const ok = Array.isArray(c) && c.length >= 3 && drivers.includes(c[0]) && drivers.includes(c[1]) && isNum(c[2]) && (c[3] === undefined || isStr(c[3]));
      if (!ok) errors.push(`Corrélation n° ${i + 1} : [code, code, valeur] attendu avec des codes du registre`);
    });
  }
  const rev = reg.revue_risques;
  if (rev !== undefined) {
    const cats = RISK_CATEGORIES.map((c) => c.code);
    if (!Array.isArray(rev) || rev.length > cats.length) errors.push(`Revue des risques : liste de ${cats.length} catégories au plus attendue`);
    else {
      rev.forEach((r, i) => {
        const ok = isObj(r) && cats.includes(r.categorie as string) && (r.decision === null || RISK_DECISIONS.includes(r.decision as never)) && isStr(r.ref) && isStr(r.commentaire);
        if (!ok) errors.push(`Revue des risques, ligne ${i + 1} : catégorie, décision, référence et commentaire attendus`);
      });
    }
  }
  if (reg.postes_certains !== undefined && !isStrList(reg.postes_certains, SHAPE_LIMITS.postes)) errors.push('Postes certains : liste de codes attendue');
  const bv = reg.bruit_volumes;
  if (!(isObj(bv) && isNum(bv.phi) && bv.phi > -1 && bv.phi < 1 && isNum(bv.sigma_mensuel) && bv.sigma_mensuel >= 0)) {
    errors.push('Bruit des volumes : φ dans ]-1 ; 1[ et σ positif attendus');
  }

  const lev = list('Leviers', x.leviers, SHAPE_LIMITS.leviers, errors);
  const str = list('Stress tests', x.stress, SHAPE_LIMITS.stress, errors);
  if (lev) {
    checkUnique('Leviers', lev, errors);
    for (const l of lev) checkCase('Levier', l, LEVER_PARAMS, LEVER_TYPES, true, errors);
  }
  if (str) {
    checkUnique('Stress tests', str, errors);
    for (const s of str) checkCase('Stress', s, STRESS_PARAMS, STRESS_TYPES, false, errors);
  }
  const known = [...(lev ?? []), ...(str ?? [])].map((c) => c.code as string);
  const paq = list('Paquets', x.paquets, SHAPE_LIMITS.paquets, errors);
  if (paq) {
    checkUnique('Paquets', paq, errors);
    for (const p of paq) {
      if (!isStr(p.libelle)) errors.push(`Paquet ${String(p.code)} : libellé absent`);
      if (!isStrList(p.codes, 40) || !p.codes.length) errors.push(`Paquet ${String(p.code)} : liste de codes attendue`);
      else for (const c of p.codes) if (!known.includes(c)) errors.push(`Paquet ${String(p.code)} : ${c} n'est ni un levier ni un stress test`);
    }
  }
  if (!Array.isArray(x.actifs)) errors.push('Liste des actions cochées absente');
  else for (const a of x.actifs) if (!known.includes(a as string)) errors.push(`Action cochée ${String(a)} inconnue`);
  return errors;
}

export function isScenario(x: unknown): x is Scenario {
  return checkScenarioShape(x).length === 0;
}

/** Structure d'un budget venu d'un brouillon : types et bornes, avant le contrôle de cohérence (references.ts). */
export function checkBudgetShape(x: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(x)) return ['Budget illisible : objet attendu'];
  for (const f of ['libelle']) if (!isStr(x[f])) errors.push(`Budget : ${f} absent`);
  if (!isInt(x.exercice)) errors.push('Budget : exercice absent');
  const u = x.unites;
  if (!(isObj(u) && isStr(u.principale) && isStr(u.detail) && isStr(u.libelle))) errors.push('Budget : unités absentes');
  if (!isStrList(x.bu, SHAPE_LIMITS.bu)) errors.push('Budget : liste des BU mal formée');
  const rubs = list('Rubriques', x.rubriques, SHAPE_LIMITS.rubriques, errors);
  for (const r of rubs ?? []) if (!(isCode(r.code) && isStr(r.libelle) && NATURES.includes(r.nature as never))) errors.push('Rubriques : code, libellé et nature attendus');
  const postes = list('Postes', x.postes, SHAPE_LIMITS.postes, errors);
  for (const p of postes ?? []) {
    const ok = isCode(p.code) && isStr(p.libelle) && isStr(p.rubrique) && (p.bu === null || isStr(p.bu)) && ASSIETTES.includes(p.assiette as never)
      && isNum(p.devises) && Array.isArray(p.montants) && p.montants.length === 12 && p.montants.every(isNum);
    if (!ok) {
      errors.push(`Poste ${String(p.code)} : structure mal formée`);
      break;
    }
  }
  const c = x.change;
  if (c !== null && !(isObj(c) && isStr(c.devise) && isStr(c.locale) && isNum(c.coursBudget))) errors.push('Budget : change mal formé');
  if (!isNum(x.ebitdaPublie)) errors.push('Budget : EBITDA publié absent');
  if (x.source !== 'alfa' && x.source !== 'import') errors.push('Budget : source inconnue');
  return errors;
}

export function isBudget(x: unknown): x is Budget {
  return checkBudgetShape(x).length === 0;
}
