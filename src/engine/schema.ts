/**
 * Validation de structure d'un scénario venu de l'extérieur (lien de partage, brouillon, fichier) :
 * champs obligatoires, types, codes attendus, bornes. Elle précède tout calcul, pour qu'un scénario
 * mal formé produise une erreur métier lisible et jamais une exception du moteur.
 */
import { DRIVER_CODES, EVENT_CODES, HYP_CODES, type Scenario } from './types.ts';

const STATUTS = ['brouillon', 'valide', 'gele'];
/** Paramètres attendus par levier et par stress (section 10). */
const LEVER_PARAMS: Record<string, string[]> = {
  L1: ['part', 'cours'], L2: ['hausse', 'elasticite'], L3: ['economieAnnuelle'], L4: ['plafond'], L5: ['reduction', 'coutAnnuel'],
};
const STRESS_PARAMS: Record<string, string[]> = { S1: ['choc'], S2: ['choc'], S3: ['choc'] };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Longueur maximale d'un texte libre (libellé, justification…). */
const TEXT_MAX = 2000;
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length <= TEXT_MAX;
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isPair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);

/** Codes : chacun des codes attendus une fois et une seule, aucun autre. */
function checkCodes(where: string, items: Obj[], expected: readonly string[], errors: string[]): void {
  const codes = items.map((x) => x.code);
  for (const c of expected) {
    const n = codes.filter((x) => x === c).length;
    if (n === 0) errors.push(`${where} : ${c} absent`);
    if (n > 1) errors.push(`${where} : ${c} présent ${n} fois`);
  }
  for (const c of codes) if (!expected.includes(c as string)) errors.push(`${where} : code ${String(c)} inconnu`);
}

function checkHypothesis(h: Obj, errors: string[]): void {
  const c = String(h.code);
  for (const f of ['libelle', 'proprietaire', 'justification']) if (!isStr(h[f])) errors.push(`${c} : champ ${f} absent, non textuel ou de plus de ${TEXT_MAX} caractères`);
  if (!STATUTS.includes(h.statut as string)) errors.push(`${c} : statut inconnu`);
  if (h.k !== undefined && !isNum(h.k)) errors.push(`${c} : k non numérique`);
  if (c === 'H06') {
    for (const f of ['depart', 'derive_annuelle', 'volatilite_mensuelle']) if (!isNum(h[f])) errors.push(`H06 : ${f} absent ou non numérique`);
    return;
  }
  if (!isNum(h.p10) || !isNum(h.p90)) errors.push(`${c} : P10 et P90 numériques obligatoires`);
  if (h.p50 !== null && h.p50 !== undefined && !isNum(h.p50)) errors.push(`${c} : P50 non numérique`);
  const pert = h.min !== undefined || h.max !== undefined;
  if (pert && !(isNum(h.min) && isNum(h.max) && isNum(h.p50))) errors.push(`${c} : loi PERT incomplète (minimum, mode et maximum numériques)`);
}

function checkEvent(e: Obj, errors: string[]): void {
  const c = String(e.code);
  for (const f of ['libelle', 'proprietaire', 'justification', 'cible']) if (!isStr(e[f])) errors.push(`${c} : champ ${f} absent, non textuel ou de plus de ${TEXT_MAX} caractères`);
  if (!isNum(e.p)) errors.push(`${c} : probabilité non numérique`);
  if (!isPair(e.amplitude)) errors.push(`${c} : amplitude attendue sous la forme [minimum, maximum]`);
  if (e.surcout !== undefined && !isPair(e.surcout)) errors.push(`${c} : surcoût attendu sous la forme [minimum, maximum]`);
  if (e.duree !== 'fin' && e.duree !== 'mois') errors.push(`${c} : durée attendue « fin » ou « mois »`);
  if (!STATUTS.includes(e.statut as string)) errors.push(`${c} : statut inconnu`);
}

function checkCase(where: string, x: Obj, params: Record<string, string[]>, nullable: boolean, errors: string[]): void {
  const c = String(x.code);
  if (!isStr(x.libelle)) errors.push(`${where} ${c} : libellé absent`);
  const mois = x.mois;
  if (!(isInt(mois) && mois >= 1 && mois <= 12) && !(nullable && mois === null)) errors.push(`${where} ${c} : mois d'effet hors de 1 à 12`);
  if (nullable && !(x.cout === null || isNum(x.cout))) errors.push(`${where} ${c} : coût non numérique`);
  if (!isObj(x.params)) {
    errors.push(`${where} ${c} : paramètres absents`);
    return;
  }
  for (const p of params[c] ?? []) if (!isNum(x.params[p])) errors.push(`${where} ${c} : paramètre ${p} absent ou non numérique`);
}

/** Erreurs de structure d'un scénario ; vide si le moteur peut le lire sans risque. */
export function checkScenarioShape(x: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(x)) return ['Scénario illisible : objet attendu'];
  if (x.schemaVersion !== 1) errors.push(`Version de schéma ${String(x.schemaVersion)} non prise en charge (1 attendue)`);
  if (!isStr(x.toolVersion)) errors.push('Version de l\'outil absente');
  if (!isStr(x.nom)) errors.push('Nom du scénario absent');
  // Les bornes de N (7.1) sont une règle métier, contrôlée avec les autres dans validateScenario.
  if (!(isInt(x.n) && x.n > 0)) errors.push('N : entier positif attendu');
  if (!(isInt(x.graine) && x.graine >= 0)) errors.push('Graine : entier positif attendu');
  if (!(isInt(x.moisClos) && x.moisClos >= 0 && x.moisClos <= 11)) errors.push('Mois clos : entier de 0 à 11 attendu');

  const reg = x.registre;
  if (!isObj(reg)) return [...errors, 'Registre absent'];
  if (!isStr(reg.version)) errors.push('Registre : version absente');
  const hyps = Array.isArray(reg.hypotheses) ? reg.hypotheses : null;
  const evts = Array.isArray(reg.evenements) ? reg.evenements : null;
  if (!hyps || !hyps.every(isObj)) errors.push('Registre : liste des hypothèses absente ou mal formée');
  else {
    checkCodes('Hypothèses', hyps, HYP_CODES, errors);
    for (const h of hyps) checkHypothesis(h, errors);
  }
  if (!evts || !evts.every(isObj)) errors.push('Registre : liste des événements absente ou mal formée');
  else {
    checkCodes('Événements', evts, EVENT_CODES, errors);
    for (const e of evts) checkEvent(e, errors);
  }
  const corr = reg.correlations_rang;
  const pairs = (DRIVER_CODES.length * (DRIVER_CODES.length - 1)) / 2;
  if (!Array.isArray(corr)) errors.push('Registre : corrélations absentes');
  else if (corr.length > pairs) errors.push(`Registre : ${corr.length} corrélations, ${pairs} paires possibles au plus`);
  else {
    corr.forEach((c, i) => {
      const ok = Array.isArray(c) && c.length >= 3 && DRIVER_CODES.includes(c[0]) && DRIVER_CODES.includes(c[1]) && isNum(c[2]);
      if (!ok) errors.push(`Corrélation n° ${i + 1} : [code, code, valeur] attendu avec des codes du registre`);
    });
  }
  const bv = reg.bruit_volumes;
  if (!(isObj(bv) && isNum(bv.phi) && bv.phi > -1 && bv.phi < 1 && isNum(bv.sigma_mensuel) && bv.sigma_mensuel >= 0)) {
    errors.push('Bruit des volumes : φ dans ]-1 ; 1[ et σ positif attendus');
  }

  const lev = Array.isArray(x.leviers) && x.leviers.every(isObj) ? x.leviers : null;
  const str = Array.isArray(x.stress) && x.stress.every(isObj) ? x.stress : null;
  if (!lev) errors.push('Liste des leviers absente ou mal formée');
  else {
    checkCodes('Leviers', lev, Object.keys(LEVER_PARAMS), errors);
    for (const l of lev) checkCase('Levier', l, LEVER_PARAMS, true, errors);
  }
  if (!str) errors.push('Liste des stress tests absente ou mal formée');
  else {
    checkCodes('Stress tests', str, Object.keys(STRESS_PARAMS), errors);
    for (const s of str) checkCase('Stress', s, STRESS_PARAMS, false, errors);
  }
  const known = [...Object.keys(LEVER_PARAMS), ...Object.keys(STRESS_PARAMS)];
  if (!Array.isArray(x.actifs)) errors.push('Liste des actions cochées absente');
  else for (const a of x.actifs) if (!known.includes(a as string)) errors.push(`Action cochée ${String(a)} inconnue`);
  return errors;
}

export function isScenario(x: unknown): x is Scenario {
  return checkScenarioShape(x).length === 0;
}
