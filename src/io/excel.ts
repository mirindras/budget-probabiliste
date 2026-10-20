/**
 * Import et export Excel (SheetJS), pour le modèle configurable.
 * - Budget : modèle générique BUDGET_BASE (PARAMETRES, RUBRIQUES, POSTES), montants dans l'unité du budget ;
 *   l'ancien format détaillé d'un distributeur (VENTES au grain mois × BU × canal × famille, CHARGES, en MGA)
 *   reste accepté et se convertit dans le modèle.
 * - Registre : hypothèses, événements, corrélations, revue des risques, leviers, stress tests, paquets,
 *   chaque ligne avec son effet et sa portée ; on peut ajouter ou retirer des lignes avant de réimporter.
 * - Résultats : schéma en étoile prêt pour Power BI.
 * Toutes les erreurs d'import sont localisées par feuille et par ligne (R-IN-08).
 */
import * as XLSX from 'xlsx';
import { ALFA_COMPACT, alfaBudget, expandGrid, TOOL_VERSION } from '../engine/alfa.ts';
import { checkMatrixRules } from '../engine/copula.ts';
import { reconciliation } from '../engine/controls.ts';
import { DECISION_LABEL, eventGuide, fullReview, hypGuide, RISK_CATEGORIES } from '../engine/guide.ts';
import { ALFA_LEVER_TYPES, ALFA_PAQUETS, ALFA_STRESS_TYPES, gridToBudget, V1_EVENT, V1_HYP, type LegacyGrid } from '../engine/legacy.ts';
import type { Model } from '../engine/model.ts';
import { formatPortee, parsePortee } from '../engine/portee.ts';
import { budgetErrors, referenceErrors } from '../engine/references.ts';
import type { RunOutput } from '../engine/simulate.ts';
import type { Draws } from '../engine/sampling.ts';
import type { PLResult } from '../engine/pl.ts';
import { CODE_RE } from '../engine/schema.ts';
import {
  ASSIETTES, EVENT_EFFECTS, HYP_EFFECTS, LEVER_PARAMS, LEVER_TYPES, NATURES, STRESS_PARAMS, STRESS_TYPES,
  type Assiette, type Budget, type Correlation, type EventEffect, type HypEffect, type Hypothesis, type LeverType, type Nature,
  type Paquet, type Poste, type Registry, type RiskEvent, type Rubrique, type Scenario, type Status, type StressType,
} from '../engine/types.ts';
import { checkCsvText, checkSheetRange, checkXlsxBytes, LIMITS } from './limits.ts';

const G = 1e9;
export const MENTION = 'Données synthétiques : société fictive ALFA Distribution, aucune donnée d\'entreprise réelle.';
/** Mois des colonnes de la feuille POSTES, sans accent pour la saisie. */
export const MOIS_COLS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

export interface ImportError {
  feuille: string;
  ligne: number | null;
  message: string;
}

export class ImportFailure extends Error {
  errors: ImportError[];
  constructor(errors: ImportError[]) {
    super(errors.map((e) => `${e.feuille}${e.ligne ? ` ligne ${e.ligne}` : ''} : ${e.message}`).join('\n'));
    this.errors = errors;
  }
}

const sheet = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
const toBytes = (wb: XLSX.WorkBook) => XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;

/** En-tête normalisé : minuscules, sans accent, espaces et tirets en soulignement (« Février » → « fevrier »). */
const norm = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function rows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] | null {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v])));
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN);
const opt = (v: unknown): number | undefined => (v === null || v === undefined || v === '' ? undefined : num(v));
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const fr = (x: number, d: number) => x.toFixed(d).replace('.', ',');
const STATUTS: Status[] = ['brouillon', 'valide', 'gele'];
/** Sous-unité usuelle : un millième de l'unité principale. */
const DETAIL: Record<string, string> = { GAr: 'MAr', MAr: 'kAr', 'Md€': 'M€', 'M€': 'k€', 'k€': '€', 'M$': 'k$', 'k$': '$', MDH: 'kDH', MFCFA: 'kFCFA' };

/* ------------------------------------------------------------------ Budget générique : PARAMETRES, RUBRIQUES, POSTES */

/** Modèle BUDGET_BASE générique, prérempli avec un budget (ALFA par défaut). */
export function budgetTemplate(b: Budget = alfaBudget()): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['BUDGET_BASE : la structure du P&L de gestion de l\'entreprise et son budget mois par mois'],
    [b.source === 'alfa' ? MENTION : ''],
    [],
    ['Feuille', 'Contenu'],
    ['PARAMETRES', 'libellé, exercice, unité des montants (et son millième), EBITDA publié ; devise, monnaie locale et cours budget si des postes sont payés en devises'],
    ['RUBRIQUES', 'les lignes du P&L jusqu\'à l\'EBITDA, dans l\'ordre : code, libellé, nature (ca = chiffre d\'affaires, produit = autre produit, charge)'],
    ['POSTES', 'une ligne par poste budgétaire : code, libellé, rubrique, BU (vide pour un poste commun), assiette, part en devises, puis les douze montants mensuels'],
    [],
    ['Assiette', 'fixe : le montant ne dépend pas de l\'activité ; volume : il suit le volume de sa BU (ou l\'activité de l\'entreprise pour un poste commun) ; ca : il suit le chiffre d\'affaires simulé'],
    ['Part en devises', 'de 0 à 1 : la part du montant payée en devises, exposée au change (1 pour un achat importé facturé en devises)'],
    ['Règles', 'R-IN-01 l\'EBITDA recalculé retrouve l\'EBITDA publié à un millième d\'unité près ; codes uniques ; chaque poste dans une rubrique connue ; un poste de chiffre d\'affaires appartient à une BU ; douze mois complets'],
  ]), 'LISEZ_MOI');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['cle', 'valeur', 'commentaire'],
    ['libelle', b.libelle, ''],
    ['exercice', b.exercice, ''],
    ['unite', b.unites.principale, 'unité des montants de la feuille POSTES'],
    ['unite_detail', b.unites.detail, 'un millième de l\'unité, pour les petits écarts'],
    ['unite_libelle', b.unites.libelle, 'en toutes lettres'],
    ['ebitda_publie', b.ebitdaPublie, 'EBITDA budgété publié, pour la réconciliation (R-IN-01)'],
    ['devise', b.change?.devise ?? '', 'devise étrangère, si des postes sont payés en devises'],
    ['monnaie_locale', b.change?.locale ?? '', ''],
    ['cours_budget', b.change?.coursBudget ?? '', 'unités de monnaie locale pour 1 unité de devise'],
  ]), 'PARAMETRES');
  XLSX.utils.book_append_sheet(wb, sheet([['code', 'libelle', 'nature'], ...b.rubriques.map((r) => [r.code, r.libelle, r.nature])]), 'RUBRIQUES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'rubrique', 'bu', 'assiette', 'part_devises', ...MOIS_COLS],
    ...b.postes.map((p) => [p.code, p.libelle, p.rubrique, p.bu ?? '', p.assiette, p.devises, ...p.montants]),
  ]), 'POSTES');
  return wb;
}

function importBudgetPostes(wb: XLSX.WorkBook): Budget {
  const errors: ImportError[] = [];
  const params = rows(wb, 'PARAMETRES');
  const rubs = rows(wb, 'RUBRIQUES');
  const postesRows = rows(wb, 'POSTES');
  for (const [n, r] of [['PARAMETRES', params], ['RUBRIQUES', rubs], ['POSTES', postesRows]] as const) {
    if (!r) errors.push({ feuille: n, ligne: null, message: 'feuille absente' });
  }
  if (errors.length) throw new ImportFailure(errors);
  const kv = Object.fromEntries(params!.map((r) => [norm(str(r.cle)), r.valeur]));
  const P = (m: string) => errors.push({ feuille: 'PARAMETRES', ligne: null, message: m });
  const exercice = num(kv.exercice);
  if (!Number.isInteger(exercice)) P('exercice absent ou non entier');
  const unite = str(kv.unite);
  if (!unite) P('unite absente : l\'unité des montants (M€, k€, GAr…)');
  const ebitda = num(kv.ebitda_publie);
  if (!Number.isFinite(ebitda)) P('ebitda_publie absent ou non numérique');
  const cours = opt(kv.cours_budget);
  const devise = str(kv.devise);
  const locale = str(kv.monnaie_locale);

  const rubriques: Rubrique[] = [];
  rubs!.forEach((r, k) => {
    const ligne = k + 2;
    const code = str(r.code);
    const nature = norm(str(r.nature)) as Nature;
    const errs: string[] = [];
    if (!CODE_RE.test(code)) errs.push('code absent ou invalide (lettres, chiffres, _ - . +)');
    else if (rubriques.some((x) => x.code === code)) errs.push(`code ${code} en double`);
    if (!NATURES.includes(nature)) errs.push(`nature « ${str(r.nature)} » inconnue : ca, produit ou charge`);
    if (errs.length) errors.push({ feuille: 'RUBRIQUES', ligne, message: errs.join(' ; ') });
    else rubriques.push({ code, libelle: str(r.libelle) || code, nature });
  });

  const postes: Poste[] = [];
  const bus: string[] = [];
  postesRows!.forEach((r, k) => {
    const ligne = k + 2;
    const code = str(r.code);
    const rubrique = str(r.rubrique);
    const bu = str(r.bu);
    const rub = rubriques.find((x) => x.code === rubrique);
    const assiette = (norm(str(r.assiette)) || (rub?.nature === 'ca' ? 'volume' : 'fixe')) as Assiette;
    const devises = opt(r.part_devises) ?? 0;
    const montants = MOIS_COLS.map((m) => num(r[m]));
    const errs: string[] = [];
    if (!CODE_RE.test(code)) errs.push('code absent ou invalide (lettres, chiffres, _ - . +)');
    else if (postes.some((x) => x.code === code)) errs.push(`code ${code} en double`);
    if (!rub) errs.push(`rubrique « ${rubrique} » absente de la feuille RUBRIQUES (R-IN-03)`);
    if (!ASSIETTES.includes(assiette)) errs.push(`assiette « ${str(r.assiette)} » inconnue : fixe, volume ou ca`);
    if (!(devises >= 0 && devises <= 1)) errs.push('part_devises hors de 0 à 1');
    const missing = montants.map((x, t) => (Number.isFinite(x) ? 0 : t + 1)).filter(Boolean);
    if (missing.length) errs.push(`montant manquant ou non numérique : ${missing.map((t) => MOIS_COLS[t - 1]).join(', ')} (R-IN-04)`);
    if (rub?.nature === 'ca' && !bu) errs.push('un poste de chiffre d\'affaires appartient à une BU');
    if (errs.length) {
      errors.push({ feuille: 'POSTES', ligne, message: errs.join(' ; ') });
      return;
    }
    if (bu && !bus.includes(bu)) bus.push(bu);
    postes.push({ code, libelle: str(r.libelle) || code, rubrique, bu: bu || null, assiette, devises, montants });
  });
  if (errors.length) throw new ImportFailure(errors);
  const enDevises = postes.some((p) => p.devises > 0);
  if (enDevises && !(cours !== undefined && cours > 0 && devise && locale)) P('des postes sont en devises : devise, monnaie_locale et cours_budget requis');
  if (errors.length) throw new ImportFailure(errors);
  const budget: Budget = {
    libelle: str(kv.libelle) || 'Budget importé',
    exercice,
    unites: { principale: unite, detail: str(kv.unite_detail) || DETAIL[unite] || `${unite}/1000`, libelle: str(kv.unite_libelle) || unite },
    bu: bus.length ? bus : ['Entreprise'],
    rubriques,
    postes,
    change: enDevises || (cours !== undefined && cours > 0 && devise) ? { devise: devise || 'devise', locale: locale || 'locale', coursBudget: cours! } : null,
    ebitdaPublie: ebitda,
    source: 'import',
  };
  const be = budgetErrors(budget);
  if (be.length) throw new ImportFailure(be.map((m) => ({ feuille: 'POSTES', ligne: null, message: m })));
  const recon = reconciliation(budget);
  if (Math.abs(recon - ebitda) * 1000 > 1) {
    throw new ImportFailure([{ feuille: 'PARAMETRES', ligne: null, message: `réconciliation : le budget recalculé donne ${fr(recon, 3)} ${unite} pour ${fr(ebitda, 3)} ${unite} publiés, écart supérieur à un millième d'unité (R-IN-01)` }]);
  }
  return budget;
}

/* ------------------------------------------------------------------ Ancien format : distributeur au grain mois × BU × canal × famille */

export const POSTES_LEGACY = ['carburant', 'sous_traitance', 'autres_transport', 'masse_salariale', 'frais_commerciaux', 'frais_generaux'] as const;
const CANAUX = ['GMS', 'Grossistes', 'Traditionnel'];
const PART_CANAL = [0.45, 0.35, 0.2];
const FAMILLES: Record<string, string[]> = {
  Boissons: ['Eaux', 'Sodas', 'Jus', 'Bières'],
  Epicerie: ['Riz et farines', 'Huiles', 'Conserves', 'Sucre et café'],
  Hygiene: ['Savons', 'Lessives', 'Soins', 'Papier'],
};
const PART_FAMILLE = [0.4, 0.3, 0.2, 0.1];
const PRIX_FAMILLE: Record<string, number[]> = {
  Boissons: [14000, 22000, 31000, 46000],
  Epicerie: [38000, 52000, 27000, 61000],
  Hygiene: [24000, 33000, 45000, 19000],
};

/** Format détaillé d'un distributeur, prérempli avec ALFA : VENTES au grain mois × BU × canal × famille, CHARGES, en MGA. */
export function legacyBudgetTemplate(): XLSX.WorkBook {
  const b = ALFA_COMPACT;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['BUDGET_BASE, format détaillé d\'un distributeur : budget au grain mois × BU × canal × famille'],
    [MENTION],
    [],
    ['Feuille', 'Contenu'],
    ['PARAMETRES', 'libellé, exercice, cours budget EUR/MGA, EBITDA publié (MGA), part variable des frais commerciaux'],
    ['VENTES', 'une ligne par mois × BU × canal × famille : volume (cartons), prix net (MGA par carton), coût matière unitaire (MGA par carton), part importée du coût matière'],
    ['CHARGES', 'une ligne par mois × poste : carburant, sous_traitance, autres_transport, masse_salariale, frais_commerciaux, frais_generaux (MGA)'],
    [],
    ['Règles', 'R-IN-01 réconciliation à 1 MAr ; R-IN-02 volumes ≥ 0, prix > 0 ; R-IN-03 aucune ligne orpheline ; R-IN-04 12 mois continus'],
  ]), 'LISEZ_MOI');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['cle', 'valeur', 'commentaire'],
    ['libelle', b.libelle, ''],
    ['exercice', b.exercice, ''],
    ['cours_budget_eur_mga', b.cours_budget_eur_mga, 'MGA pour 1 EUR'],
    ['ebitda_publie_mga', b.ebitda * G, 'EBITDA budgété publié, pour la réconciliation (R-IN-01)'],
    ['part_variable_frais_commerciaux', b.frais_commerciaux.part_variable, 'part variable avec le CA'],
  ]), 'PARAMETRES');
  const ventes: unknown[][] = [['mois', 'bu', 'canal', 'famille', 'volume_cartons', 'prix_net_mga', 'cout_unitaire_mga', 'part_importee']];
  for (let t = 0; t < 12; t++) {
    b.bu.forEach((bu, i) => {
      const s = b.saisonnalite[bu][t];
      CANAUX.forEach((canal, c) => {
        FAMILLES[bu].forEach((fam, f) => {
          const share = s * PART_CANAL[c] * PART_FAMILLE[f];
          const ca = b.ca[i] * G * share;
          const cm = b.cout_matiere[i] * G * share;
          const vol = Math.round(ca / PRIX_FAMILLE[bu][f]);
          ventes.push([t + 1, bu, canal, fam, vol, ca / vol, cm / vol, b.part_importee[i]]);
        });
      });
    });
  }
  XLSX.utils.book_append_sheet(wb, sheet(ventes), 'VENTES');
  const caTot = b.ca.reduce((a, x) => a + x, 0);
  const charges: unknown[][] = [['mois', 'poste', 'montant_mga']];
  for (let t = 0; t < 12; t++) {
    const caT = b.bu.reduce((a, bu, i) => a + b.ca[i] * b.saisonnalite[bu][t], 0);
    const w = caT / caTot;
    const fc = b.frais_commerciaux;
    const vals: Record<(typeof POSTES_LEGACY)[number], number> = {
      carburant: b.transport.carburant * w,
      sous_traitance: b.transport.sous_traitance * w,
      autres_transport: b.transport.autres / 12,
      masse_salariale: b.masse_salariale / 12,
      frais_commerciaux: fc.total * fc.part_variable * w + (fc.total * (1 - fc.part_variable)) / 12,
      frais_generaux: b.frais_generaux / 12,
    };
    for (const p of POSTES_LEGACY) charges.push([t + 1, p, vals[p] * G]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(charges), 'CHARGES');
  return wb;
}

/** Import de l'ancien format : contrôles R-IN-01 à R-IN-04, agrégation au grain BU × mois, conversion en postes. */
function importBudgetLegacy(wb: XLSX.WorkBook): Budget {
  const errors: ImportError[] = [];
  const params = rows(wb, 'PARAMETRES');
  const ventes = rows(wb, 'VENTES');
  const charges = rows(wb, 'CHARGES');
  for (const [n, r] of [['PARAMETRES', params], ['VENTES', ventes], ['CHARGES', charges]] as const) {
    if (!r) errors.push({ feuille: n, ligne: null, message: 'feuille absente' });
  }
  if (errors.length) throw new ImportFailure(errors);
  const p = Object.fromEntries(params!.map((r) => [str(r.cle), r.valeur]));
  const cours = num(p.cours_budget_eur_mga);
  const ebitda = num(p.ebitda_publie_mga) / G;
  const partVar = num(p.part_variable_frais_commerciaux);
  if (!(cours > 0)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'cours_budget_eur_mga absent ou non positif' });
  if (!Number.isFinite(ebitda)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'ebitda_publie_mga absent' });
  if (!(partVar >= 0 && partVar <= 1)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'part_variable_frais_commerciaux hors de [0 ; 1]' });

  const bus: string[] = [];
  const cells = new Map<string, { ca: number; imp: number; loc: number }>();
  // Grain mois × BU × canal × famille : chaque combinaison BU × canal × famille du fichier doit figurer une fois et une seule chaque mois.
  const grain = new Map<string, number>();
  const combos = new Map<string, { bu: string; canal: string; famille: string; mois: Set<number> }>();
  ventes!.forEach((r, k) => {
    const ligne = k + 2;
    const mois = num(r.mois);
    const bu = str(r.bu);
    const vol = num(r.volume_cartons);
    const prix = num(r.prix_net_mga);
    const cu = num(r.cout_unitaire_mga);
    const imp = num(r.part_importee);
    const errs: string[] = [];
    if (!(Number.isInteger(mois) && mois >= 1 && mois <= 12)) errs.push('mois hors de 1 à 12');
    if (!bu) errs.push('BU absente : ligne orpheline (R-IN-03)');
    if (!str(r.canal) || !str(r.famille)) errs.push('canal ou famille absent : ligne orpheline (R-IN-03)');
    if (!(vol >= 0)) errs.push('volume négatif ou non numérique (R-IN-02)');
    if (!(prix > 0)) errs.push('prix nul, négatif ou non numérique (R-IN-02)');
    if (!(cu >= 0)) errs.push('coût unitaire négatif ou non numérique');
    if (!(imp >= 0 && imp <= 1)) errs.push('part importée hors de 0 à 100 %');
    if (errs.length) {
      errors.push({ feuille: 'VENTES', ligne, message: errs.join(' ; ') });
      return;
    }
    const canal = str(r.canal);
    const famille = str(r.famille);
    const cle = `${mois}|${bu}|${canal}|${famille}`;
    const premiere = grain.get(cle);
    if (premiere !== undefined) {
      errors.push({ feuille: 'VENTES', ligne, message: `doublon de la ligne ${premiere} : mois ${mois}, ${bu}, ${canal}, ${famille} (clé unique mois × BU × canal × famille)` });
      return;
    }
    grain.set(cle, ligne);
    const combo = `${bu}|${canal}|${famille}`;
    if (!combos.has(combo)) combos.set(combo, { bu, canal, famille, mois: new Set() });
    combos.get(combo)!.mois.add(mois);
    if (!bus.includes(bu)) bus.push(bu);
    const key = `${bu}|${mois}`;
    const c = cells.get(key) ?? { ca: 0, imp: 0, loc: 0 };
    c.ca += (vol * prix) / G;
    c.imp += (vol * cu * imp) / G;
    c.loc += (vol * cu * (1 - imp)) / G;
    cells.set(key, c);
  });
  // Continuité (R-IN-04) vérifiée seulement sans erreur de ligne : une ligne rejetée n'est pas signalée deux fois.
  const ventesLineErrors = errors.some((e) => e.feuille === 'VENTES' && e.ligne !== null);
  for (const c of ventesLineErrors ? [] : combos.values()) {
    const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !c.mois.has(m));
    if (missing.length) errors.push({ feuille: 'VENTES', ligne: null, message: `${c.bu}, ${c.canal}, ${c.famille} : mois manquant(s) ${missing.join(', ')} (R-IN-04)` });
  }
  if (!bus.length && !errors.some((e) => e.feuille === 'VENTES')) errors.push({ feuille: 'VENTES', ligne: null, message: 'aucune vente' });
  const ch: Record<string, number[]> = Object.fromEntries(POSTES_LEGACY.map((x) => [x, new Array(12).fill(NaN)]));
  charges!.forEach((r, k) => {
    const ligne = k + 2;
    const mois = num(r.mois);
    const poste = str(r.poste);
    const m = num(r.montant_mga);
    if (!(POSTES_LEGACY as readonly string[]).includes(poste)) {
      errors.push({ feuille: 'CHARGES', ligne, message: `poste « ${poste} » non rattaché à une ligne de P&L (R-IN-03)` });
      return;
    }
    if (!(Number.isInteger(mois) && mois >= 1 && mois <= 12)) {
      errors.push({ feuille: 'CHARGES', ligne, message: 'mois hors de 1 à 12' });
      return;
    }
    if (!Number.isFinite(m) || m < 0) {
      errors.push({ feuille: 'CHARGES', ligne, message: 'montant négatif ou non numérique' });
      return;
    }
    ch[poste][mois - 1] = (Number.isNaN(ch[poste][mois - 1]) ? 0 : ch[poste][mois - 1]) + m / G;
  });
  const chargesLineErrors = errors.some((e) => e.feuille === 'CHARGES' && e.ligne !== null);
  for (const poste of chargesLineErrors ? [] : POSTES_LEGACY) {
    const missing = ch[poste].map((v, i) => (Number.isNaN(v) ? i + 1 : 0)).filter(Boolean);
    if (missing.length && missing.length < 12) errors.push({ feuille: 'CHARGES', ligne: null, message: `${poste} : mois manquant(s) ${missing.join(', ')} (R-IN-04)` });
    if (missing.length === 12) errors.push({ feuille: 'CHARGES', ligne: null, message: `${poste} : poste absent` });
  }
  if (errors.length) throw new ImportFailure(errors);

  const get = (bu: string, t: number) => cells.get(`${bu}|${t + 1}`)!;
  const ca = bus.map((bu) => Array.from({ length: 12 }, (_, t) => get(bu, t).ca));
  const caMonth = Array.from({ length: 12 }, (_, t) => ca.reduce((a, r) => a + r[t], 0));
  const caTot = caMonth.reduce((a, x) => a + x, 0);
  const fcTot = ch.frais_commerciaux.reduce((a, x) => a + x, 0);
  const taux = (partVar * fcTot) / caTot;
  const grid: LegacyGrid = {
    libelle: String(p.libelle ?? 'Budget importé'),
    exercice: num(p.exercice) || new Date().getFullYear() + 1,
    bu: bus,
    ca,
    cmImp: bus.map((bu) => Array.from({ length: 12 }, (_, t) => get(bu, t).imp)),
    cmLoc: bus.map((bu) => Array.from({ length: 12 }, (_, t) => get(bu, t).loc)),
    carburant: ch.carburant,
    sousTraitance: ch.sous_traitance,
    autresTransport: ch.autres_transport,
    masseSalariale: ch.masse_salariale,
    fcTauxVariable: taux,
    fcFixe: ch.frais_commerciaux.map((x, t) => x - taux * caMonth[t]),
    fraisGeneraux: ch.frais_generaux,
    coursBudget: cours,
    ebitdaPublie: ebitda,
    source: 'import',
  };
  const budget = gridToBudget(grid);
  const recon = reconciliation(budget);
  if (Math.abs(recon - ebitda) * 1000 > 1) {
    throw new ImportFailure([{ feuille: 'PARAMETRES', ligne: null, message: `réconciliation : le budget recalculé donne ${fr(recon, 3)} GAr pour ${fr(ebitda, 3)} GAr publiés, écart supérieur à 1 MAr (R-IN-01)` }]);
  }
  return budget;
}

/** Import d'un budget : modèle générique (feuille POSTES) ou format détaillé d'un distributeur (VENTES, CHARGES). */
export function importBudget(wb: XLSX.WorkBook): Budget {
  return wb.Sheets.POSTES ? importBudgetPostes(wb) : importBudgetLegacy(wb);
}

/* ------------------------------------------------------------------ Registre */

const UNITE_PAR_EFFET: Record<HypEffect, string> = { volume: 'facteur', prix: 'facteur', poste: 'facteur', change: 'cours', marge: 'points de marge' };
const FAMILLE_PAR_EFFET: Record<HypEffect, string> = { volume: 'Commercial', prix: 'Commercial', poste: 'Coûts', change: 'Macroéconomie', marge: 'Commercial' };

export function registryWorkbook(s: Scenario, budget: Budget): XLSX.WorkBook {
  const r = s.registre;
  const alfa = budget.source === 'alfa';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['REGISTRE_HYPOTHESES : hypothèses, événements, corrélations, leviers, stress tests. À rééditer puis réimporter : on peut ajouter ou retirer des lignes.'],
    [alfa ? MENTION : ''],
    ['Règles : P10 < P50 < P90 (R-HY-01) ; un propriétaire et une justification par ligne (principe 3) ; corrélations de rang entre -0,9 et +0,9 (R-DE-01) ; codes uniques.'],
    [`Effet d'une hypothèse : ${HYP_EFFECTS.join(', ')}. Volume et prix : facteurs (1 = budget) sur les BU visées ; poste : facteur sur les postes visés ; marge : points de marge sur le CA, ajoutés à une rubrique ; change : départ, dérive annuelle et volatilité mensuelle (marche aléatoire).`],
    ['Lognormale : laisser p50 vide et saisir P10 et P90. PERT : renseigner min et max, p50 étant le mode.'],
    ['Colonne porte_sur : « bu: Boissons, Epicerie », « postes: CARBURANT, SOUS_TRAITANCE », « rubrique: FG », « hypothese: H09 », « evenement: E03 », plusieurs parties séparées par « ; ». Vide : toute l\'entreprise.'],
    ['Feuille REFERENTIEL : les BU, rubriques et postes du budget, à citer dans porte_sur. Feuille GUIDE : la question à poser à chaque propriétaire.'],
  ]), 'LISEZ_MOI');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['type', 'code', 'libelle', 'detail'],
    ...budget.bu.map((b) => ['bu', b, b, '']),
    ...budget.rubriques.map((x) => ['rubrique', x.code, x.libelle, x.nature]),
    ...budget.postes.map((p) => ['poste', p.code, p.libelle, `${p.rubrique}${p.bu ? `, BU ${p.bu}` : ', commun'}, assiette ${p.assiette}${p.devises ? `, ${Math.round(p.devises * 100)} % en devises` : ''}`]),
  ]), 'REFERENTIEL');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'question', 'qui_repond', 'sources', 'piege'],
    ...r.hypotheses.map((h) => { const g = hypGuide(h, budget, alfa); return [h.code, h.libelle, g.question, g.qui, g.sources, g.piege]; }),
    ...r.evenements.map((e) => { const g = eventGuide(e, budget, alfa); return [e.code, e.libelle, g.question, g.qui, g.sources, g.piege]; }),
  ]), 'GUIDE');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['cle', 'valeur'], ['version', r.version], ['statut', r.statut], ['n', s.n], ['graine', s.graine],
    ['phi', r.bruit_volumes.phi], ['sigma_mensuel', r.bruit_volumes.sigma_mensuel], ['postes_certains', (r.postes_certains ?? []).join('; ')], ['version_outil', TOOL_VERSION],
  ]), 'PARAMETRES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'famille', 'effet', 'porte_sur', 'proprietaire', 'unite', 'grain', 'p10', 'p50', 'p90', 'min', 'max', 'depart', 'derive_annuelle', 'volatilite_mensuelle', 'k', 'justification', 'statut'],
    ...r.hypotheses.map((h) => [h.code, h.libelle, h.famille, h.effet, formatPortee(h.portee), h.proprietaire, h.unite, h.grain, h.p10 ?? null, h.p50 ?? null, h.p90 ?? null, h.min ?? null, h.max ?? null,
      h.depart ?? null, h.derive_annuelle ?? null, h.volatilite_mensuelle ?? null, h.k ?? 1, h.justification, h.statut]),
  ]), 'HYPOTHESES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'famille', 'effet', 'sens', 'porte_sur', 'proprietaire', 'p', 'amplitude_min', 'amplitude_max', 'duree', 'surcout_min', 'surcout_max', 'rubrique_surcout', 'cible', 'justification', 'statut'],
    ...r.evenements.map((e) => [e.code, e.libelle, e.famille, e.effet, e.sens, formatPortee(e.portee), e.proprietaire, e.p, e.amplitude[0], e.amplitude[1], e.duree,
      e.surcout?.[0] ?? null, e.surcout?.[1] ?? null, e.rubriqueSurcout ?? '', e.cible, e.justification, e.statut]),
  ]), 'EVENEMENTS');
  XLSX.utils.book_append_sheet(wb, sheet([['a', 'b', 'correlation_rang', 'justification'], ...r.correlations_rang.map((c) => [c[0], c[1], c[2], c[3] ?? ''])]), 'CORRELATIONS');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['categorie', 'libelle', 'question', 'decision', 'reference', 'commentaire'],
    ...fullReview(r.revue_risques).map((x) => {
      const c = RISK_CATEGORIES.find((y) => y.code === x.categorie)!;
      return [x.categorie, c.libelle, c.question, x.decision ?? '', x.ref, x.commentaire];
    }),
    [],
    [`Décisions possibles : ${Object.keys(DECISION_LABEL).join(', ')}.`],
  ]), 'REVUE_RISQUES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'type', 'porte_sur', 'description', 'hypotheses', 'regle', 'cout', 'cout_libelle', 'mois_effet', 'proprietaire', 'faisabilite', 'parametres'],
    ...s.leviers.map((l) => [l.code, l.libelle, l.type, formatPortee(l.portee), l.description, l.hypotheses, l.regle, l.cout, l.coutLibelle, l.mois, l.proprietaire, l.faisabilite, params(l.params)]),
    [],
    [`Types : ${LEVER_TYPES.map((t) => `${t} (${LEVER_PARAMS[t].join(', ')})`).join(' ; ')}.`],
  ]), 'LEVIERS');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'type', 'porte_sur', 'regle', 'mois_effet', 'parametres'],
    ...s.stress.map((x) => [x.code, x.libelle, x.type, formatPortee(x.portee), x.regle, x.mois, params(x.params)]),
    [],
    [`Types : ${STRESS_TYPES.map((t) => `${t} (${STRESS_PARAMS[t].join(', ')})`).join(' ; ')}.`],
  ]), 'STRESS');
  XLSX.utils.book_append_sheet(wb, sheet([['code', 'libelle', 'composition'], ...s.paquets.map((p) => [p.code, p.libelle, p.codes.join('; ')])]), 'PAQUETS');
  return wb;
}

const params = (p: Record<string, number>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join('; ');
const parseParams = (s: unknown): Record<string, number> =>
  Object.fromEntries(String(s ?? '').split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), num(v)]));
const statut = (v: unknown): Status => (STATUTS.includes(str(v) as Status) ? (str(v) as Status) : 'brouillon');

/** Lignes significatives d'une feuille : celles qui ont un code (les notes sous le tableau sont ignorées). */
const coded = (rs: Record<string, unknown>[]) => rs.map((r, k) => ({ r, ligne: k + 2 })).filter(({ r }) => str(r.code) !== '' && !/^(types|décisions)/i.test(str(r.code)));

/**
 * Import du registre : les feuilles HYPOTHESES et EVENEMENTS définissent la liste complète
 * (ajouter une ligne ajoute une hypothèse, la retirer la supprime). Leviers, stress tests et paquets
 * sont remplacés si leur feuille est présente. Toutes les références sont contrôlées contre le budget.
 */
export function importRegistry(wb: XLSX.WorkBook, current: Scenario, budget: Budget): Scenario {
  const errors: ImportError[] = [];
  const hyps = rows(wb, 'HYPOTHESES');
  const evs = rows(wb, 'EVENEMENTS');
  if (!hyps) errors.push({ feuille: 'HYPOTHESES', ligne: null, message: 'feuille absente' });
  if (!evs) errors.push({ feuille: 'EVENEMENTS', ligne: null, message: 'feuille absente' });
  if (errors.length) throw new ImportFailure(errors);
  const s = structuredClone(current);
  const reg: Registry = s.registre;
  // Un registre de la version 1 n'a pas de colonne effet : les codes d'ALFA retrouvent leur effet et leur portée.
  const v1 = hyps!.length > 0 && !('effet' in hyps![0]);

  const hypotheses: Hypothesis[] = [];
  for (const { r, ligne } of coded(hyps!)) {
    const code = str(r.code);
    const msgs: string[] = [];
    const def = v1 ? V1_HYP[code] : undefined;
    const effet = (str(r.effet) || def?.effet || '') as HypEffect;
    const pp = def && !str(r.porte_sur) ? { portee: structuredClone(def.portee), error: null } : parsePortee(r.porte_sur);
    if (!CODE_RE.test(code)) msgs.push('code invalide (lettres, chiffres, _ - . +)');
    else if (hypotheses.some((h) => h.code === code)) msgs.push(`code ${code} en double`);
    if (!HYP_EFFECTS.includes(effet)) msgs.push(`effet « ${str(r.effet)} » inconnu (${HYP_EFFECTS.join(', ')})`);
    if (pp.error) msgs.push(`porte_sur : ${pp.error}`);
    const h: Hypothesis = {
      code, libelle: str(r.libelle) || code, famille: str(r.famille) || def?.famille || FAMILLE_PAR_EFFET[effet] || 'Autres',
      effet, portee: pp.portee, proprietaire: str(r.proprietaire), unite: str(r.unite) || UNITE_PAR_EFFET[effet] || '', grain: str(r.grain),
      justification: str(r.justification), statut: statut(r.statut), k: opt(r.k) ?? 1,
    };
    if (!h.proprietaire) msgs.push('propriétaire manquant (principe 3)');
    if (!h.justification) msgs.push('justification manquante (principe 3)');
    if (effet === 'change') {
      h.depart = opt(r.depart);
      h.derive_annuelle = opt(r.derive_annuelle);
      h.volatilite_mensuelle = opt(r.volatilite_mensuelle);
      if (!(h.depart! > 0 && h.volatilite_mensuelle! > 0 && Number.isFinite(h.derive_annuelle))) msgs.push('départ, dérive et volatilité du change requis');
    } else {
      h.p10 = opt(r.p10);
      h.p50 = opt(r.p50) ?? null;
      h.p90 = opt(r.p90);
      const mn = opt(r.min);
      const mx = opt(r.max);
      if (mn !== undefined && mx !== undefined) {
        h.min = mn;
        h.max = mx;
        if (!(h.p50 !== null && mn < h.p50 && h.p50 < mx)) msgs.push('PERT : minimum < P50 (mode) < maximum requis');
      } else if (h.p50 === null) {
        if (!(h.p10! > 0 && h.p10! < h.p90!)) msgs.push('0 < P10 < P90 requis (R-HY-01)');
      } else if (!(h.p10! < h.p50 && h.p50 < h.p90!)) {
        msgs.push('P10 < P50 < P90 requis (R-HY-01)');
      }
    }
    if (!(h.k! >= 1 && h.k! <= 2)) msgs.push('k hors de [1 ; 2] (R-BT-03)');
    if (msgs.length) errors.push({ feuille: 'HYPOTHESES', ligne, message: `${code} : ${msgs.join(' ; ')}` });
    hypotheses.push(h);
  }
  if (!hypotheses.length) errors.push({ feuille: 'HYPOTHESES', ligne: null, message: 'aucune hypothèse' });

  const evenements: RiskEvent[] = [];
  for (const { r, ligne } of coded(evs!)) {
    const code = str(r.code);
    const msgs: string[] = [];
    const def = v1 ? V1_EVENT[code] : undefined;
    const effet = (str(r.effet) || (def?.effet as string) || '') as EventEffect;
    const sens = (str(r.sens) || (def?.sens as string) || (effet === 'volume' ? 'baisse' : 'hausse')) as RiskEvent['sens'];
    const pp = def && !str(r.porte_sur) ? { portee: structuredClone(def.portee as RiskEvent['portee']), error: null } : parsePortee(r.porte_sur);
    if (!CODE_RE.test(code)) msgs.push('code invalide (lettres, chiffres, _ - . +)');
    else if (evenements.some((e) => e.code === code) || hypotheses.some((h) => h.code === code)) msgs.push(`code ${code} en double`);
    if (!EVENT_EFFECTS.includes(effet)) msgs.push(`effet « ${str(r.effet)} » inconnu (volume ou poste)`);
    if (sens !== 'baisse' && sens !== 'hausse') msgs.push('sens attendu « baisse » ou « hausse »');
    if (pp.error) msgs.push(`porte_sur : ${pp.error}`);
    const sc = [opt(r.surcout_min ?? r.surcout_min_gar), opt(r.surcout_max ?? r.surcout_max_gar)];
    const duree = str(r.duree) === 'mois' ? 'mois' : 'fin';
    if (str(r.duree) && str(r.duree) !== 'mois' && str(r.duree) !== 'fin') msgs.push('durée attendue « fin » ou « mois »');
    const e: RiskEvent = {
      code, libelle: str(r.libelle) || code, famille: str(r.famille) || (def?.famille as string) || 'Autres', effet, sens, portee: pp.portee,
      proprietaire: str(r.proprietaire), p: num(r.p), amplitude: [num(r.amplitude_min), num(r.amplitude_max)], duree,
      cible: str(r.cible), justification: str(r.justification), statut: statut(r.statut),
    };
    if (sc[0] !== undefined && sc[1] !== undefined) {
      e.surcout = [sc[0], sc[1]];
      e.rubriqueSurcout = str(r.rubrique_surcout) || (def?.rubriqueSurcout as string) || undefined;
    }
    if (!(e.p >= 0 && e.p <= 1)) msgs.push('probabilité hors de [0 ; 1] (R-HY-05)');
    if (!(e.amplitude[0] <= e.amplitude[1])) msgs.push('amplitude minimale supérieure à la maximale');
    if (!e.proprietaire) msgs.push('propriétaire manquant');
    if (msgs.length) errors.push({ feuille: 'EVENEMENTS', ligne, message: `${code} : ${msgs.join(' ; ')}` });
    evenements.push(e);
  }
  reg.hypotheses = hypotheses;
  reg.evenements = evenements;

  const cors = rows(wb, 'CORRELATIONS');
  if (cors) {
    const drivers = new Set([...hypotheses, ...evenements].map((x) => x.code));
    const corr: Correlation[] = [];
    cors.forEach((r, k) => {
      const ligne = k + 2;
      const a = str(r.a);
      const b = str(r.b);
      if (!a && !b) return;
      const v = num(r.correlation_rang);
      if (!drivers.has(a) || !drivers.has(b) || a === b) {
        errors.push({ feuille: 'CORRELATIONS', ligne, message: `paire ${a} / ${b} invalide : codes du registre attendus` });
        return;
      }
      if (!(v >= -0.9 && v <= 0.9)) {
        errors.push({ feuille: 'CORRELATIONS', ligne, message: `${a} / ${b} : corrélation hors de [-0,9 ; +0,9] (R-DE-01)` });
        return;
      }
      corr.push([a, b, v, str(r.justification)]);
    });
    for (const m of checkMatrixRules(corr, [...drivers])) errors.push({ feuille: 'CORRELATIONS', ligne: null, message: m });
    reg.correlations_rang = corr;
  } else {
    const drivers = new Set([...hypotheses, ...evenements].map((x) => x.code));
    reg.correlations_rang = reg.correlations_rang.filter(([a, b]) => drivers.has(a) && drivers.has(b));
  }

  const p = rows(wb, 'PARAMETRES');
  if (p) {
    const kv = Object.fromEntries(p.map((r) => [str(r.cle), r.valeur]));
    if (kv.version) reg.version = String(kv.version);
    if (STATUTS.includes(kv.statut as Status)) reg.statut = kv.statut as Status;
    if (Number.isFinite(num(kv.n))) s.n = num(kv.n);
    if (Number.isFinite(num(kv.graine))) s.graine = num(kv.graine);
    if (Number.isFinite(num(kv.phi))) reg.bruit_volumes.phi = num(kv.phi);
    if (Number.isFinite(num(kv.sigma_mensuel))) reg.bruit_volumes.sigma_mensuel = num(kv.sigma_mensuel);
    if ('postes_certains' in kv) {
      const certains = str(kv.postes_certains).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
      if (certains.length) reg.postes_certains = certains;
      else delete reg.postes_certains;
    }
  }
  const rv = rows(wb, 'REVUE_RISQUES');
  if (rv) {
    const known = Object.keys(DECISION_LABEL);
    const lignes = rv.map((r, k) => ({ r, ligne: k + 2 })).filter(({ r }) => RISK_CATEGORIES.some((c) => c.code === str(r.categorie)));
    reg.revue_risques = lignes.map(({ r, ligne }) => {
      const d = str(r.decision);
      if (d && !known.includes(d)) errors.push({ feuille: 'REVUE_RISQUES', ligne, message: `décision « ${d} » inconnue (${known.join(', ')})` });
      return { categorie: str(r.categorie), decision: known.includes(d) ? (d as never) : null, ref: str(r.reference), commentaire: str(r.commentaire) };
    });
  }

  const lv = rows(wb, 'LEVIERS');
  if (lv) {
    s.leviers = [];
    for (const { r, ligne } of coded(lv)) {
      const code = str(r.code);
      const def = ALFA_LEVER_TYPES[code];
      const type = (str(r.type) || (v1 || !('type' in r) ? def?.type : '') || '') as LeverType;
      const pp = def && !('type' in r) ? { portee: structuredClone(def.portee), error: null } : parsePortee(r.porte_sur);
      const prm = parseParams(r.parametres);
      // Version 1 : L3 décrivait une économie annuelle, devenue une variation annuelle négative.
      if (type === 'montant' && prm.economieAnnuelle !== undefined && prm.variationAnnuelle === undefined) {
        prm.variationAnnuelle = -prm.economieAnnuelle;
        delete prm.economieAnnuelle;
      }
      const msgs: string[] = [];
      if (!CODE_RE.test(code) || s.leviers.some((l) => l.code === code)) msgs.push('code invalide ou en double');
      if (!LEVER_TYPES.includes(type)) msgs.push(`type « ${str(r.type)} » inconnu (${LEVER_TYPES.join(', ')})`);
      if (pp.error) msgs.push(`porte_sur : ${pp.error}`);
      for (const k of LEVER_PARAMS[type] ?? []) if (!Number.isFinite(prm[k])) msgs.push(`paramètre ${k} absent ou non numérique`);
      if (msgs.length) errors.push({ feuille: 'LEVIERS', ligne, message: `${code} : ${msgs.join(' ; ')}` });
      const before = current.leviers.find((l) => l.code === code);
      s.leviers.push({
        code, type, portee: pp.portee, libelle: str(r.libelle) || before?.libelle || code, description: str(r.description) || before?.description || '',
        hypotheses: str(r.hypotheses) || before?.hypotheses || '', regle: str(r.regle) || before?.regle || '',
        cout: opt(r.cout ?? r.cout_gar) ?? null, coutLibelle: str(r.cout_libelle) || before?.coutLibelle || '', mois: opt(r.mois_effet) ?? null,
        proprietaire: str(r.proprietaire), faisabilite: str(r.faisabilite) || before?.faisabilite || '', params: prm,
      });
    }
  }
  const st = rows(wb, 'STRESS');
  if (st) {
    s.stress = [];
    for (const { r, ligne } of coded(st)) {
      const code = str(r.code);
      const def = ALFA_STRESS_TYPES[code];
      const type = (str(r.type) || (!('type' in r) ? def?.type : '') || '') as StressType;
      const pp = def && !('type' in r) ? { portee: structuredClone(def.portee), error: null } : parsePortee(r.porte_sur);
      const prm = parseParams(r.parametres);
      const msgs: string[] = [];
      if (!CODE_RE.test(code) || s.stress.some((x) => x.code === code) || s.leviers.some((l) => l.code === code)) msgs.push('code invalide ou en double');
      if (!STRESS_TYPES.includes(type)) msgs.push(`type « ${str(r.type)} » inconnu (${STRESS_TYPES.join(', ')})`);
      if (pp.error) msgs.push(`porte_sur : ${pp.error}`);
      const mois = opt(r.mois_effet);
      if (!(Number.isInteger(mois) && mois! >= 1 && mois! <= 12)) msgs.push('mois_effet hors de 1 à 12');
      for (const k of STRESS_PARAMS[type] ?? []) if (!Number.isFinite(prm[k])) msgs.push(`paramètre ${k} absent ou non numérique`);
      if (msgs.length) errors.push({ feuille: 'STRESS', ligne, message: `${code} : ${msgs.join(' ; ')}` });
      const before = current.stress.find((x) => x.code === code);
      s.stress.push({ code, type, portee: pp.portee, libelle: str(r.libelle) || before?.libelle || code, regle: str(r.regle) || before?.regle || '', mois: mois ?? 1, params: prm });
    }
  }
  const pq = rows(wb, 'PAQUETS');
  const codes = new Set([...s.leviers.map((l) => l.code), ...s.stress.map((x) => x.code)]);
  if (pq) {
    s.paquets = [];
    for (const { r, ligne } of coded(pq)) {
      const comp = str(r.composition).split(/[;,+]/).map((x) => x.trim()).filter(Boolean);
      const bad = comp.filter((c) => !codes.has(c));
      if (!comp.length || bad.length) errors.push({ feuille: 'PAQUETS', ligne, message: `${str(r.code)} : ${comp.length ? `${bad.join(', ')} ni levier ni stress test` : 'composition vide'}` });
      s.paquets.push({ code: str(r.code), libelle: str(r.libelle) || str(r.code), codes: comp });
    }
  } else {
    const base: Paquet[] = v1 ? structuredClone(ALFA_PAQUETS) : s.paquets;
    s.paquets = base.filter((x) => x.codes.every((c) => codes.has(c)));
  }
  s.actifs = s.actifs.filter((c) => codes.has(c));
  if (errors.length) throw new ImportFailure(errors);

  // Références au budget : BU, postes, rubriques, hypothèses et événements nommés doivent exister.
  const hypCodes = new Set(hypotheses.map((h) => h.code));
  const evCodes = new Set(evenements.map((e) => e.code));
  const sheetOf = (m: string) => {
    const head = m.split(' : ')[0];
    if (head.startsWith('Levier')) return 'LEVIERS';
    if (head.startsWith('Stress')) return 'STRESS';
    if (head.startsWith('Paquet')) return 'PAQUETS';
    if (hypCodes.has(head)) return 'HYPOTHESES';
    if (evCodes.has(head)) return 'EVENEMENTS';
    return 'REGISTRE';
  };
  const refs = referenceErrors(s, budget);
  if (refs.length) throw new ImportFailure(refs.map((m) => ({ feuille: sheetOf(m), ligne: null, message: m })));
  return s;
}

/** Type d'un classeur déposé : budget, registre, ou scénario complet (budget + registre). */
export function workbookKind(wb: XLSX.WorkBook): 'budget' | 'registre' | 'scenario' | 'inconnu' {
  const has = (n: string) => wb.SheetNames.includes(n);
  const budget = (has('POSTES') && has('RUBRIQUES')) || (has('VENTES') && has('CHARGES'));
  const reg = has('HYPOTHESES') && has('EVENEMENTS');
  if (budget && reg) return 'scenario';
  if (budget) return 'budget';
  if (reg) return 'registre';
  return 'inconnu';
}

/** Dimensions des feuilles lues : nombre de feuilles, lignes et colonnes bornés (limits.ts). */
function checkSheets(wb: XLSX.WorkBook): void {
  const errors: ImportError[] = [];
  if (wb.SheetNames.length > LIMITS.sheets) errors.push({ feuille: 'classeur', ligne: null, message: `${wb.SheetNames.length} feuilles, ${LIMITS.sheets} au plus` });
  for (const n of wb.SheetNames.slice(0, LIMITS.sheets)) {
    const ws = wb.Sheets[n];
    errors.push(...checkSheetRange(n, (ws?.['!fullref'] as string | undefined) ?? ws?.['!ref'], XLSX.utils.decode_range));
  }
  if (errors.length) throw new ImportFailure(errors);
}

/** Lecture d'un classeur, bornée avant et pendant la lecture : taille, contenu décompressé, lignes. */
export function readWorkbook(data: ArrayBuffer | Uint8Array, name?: string): XLSX.WorkBook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const errors = checkXlsxBytes(bytes, name);
  if (errors.length) throw new ImportFailure(errors);
  const wb = XLSX.read(bytes, { type: 'array', sheetRows: LIMITS.rows + 1 });
  checkSheets(wb);
  return wb;
}

/** Feuille lue depuis un CSV, après contrôle de taille et de nombre de lignes. */
export function readCsvSheet(text: string, name = 'CSV'): XLSX.WorkSheet {
  const errors = checkCsvText(text, name);
  if (errors.length) throw new ImportFailure(errors);
  const nl = text.indexOf('\n');
  const firstLine = nl < 0 ? text : text.slice(0, nl);
  const wb = XLSX.read(text, { type: 'string', FS: firstLine.includes(';') ? ';' : ',', sheetRows: LIMITS.rows + 1 });
  checkSheets(wb);
  return wb.Sheets[wb.SheetNames[0]];
}

/** Lecture d'un CSV : une feuille nommée d'après le fichier (POSTES.csv, VENTES.csv…). */
export function readCsv(text: string, sheetName: string): XLSX.WorkBook {
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, readCsvSheet(text, sheetName), sheetName.toUpperCase());
  return out;
}

/** Scénario complet : budget et registre voyagent ensemble dans un fichier, jamais dans un lien. */
export function scenarioWorkbook(s: Scenario, budget: Budget): XLSX.WorkBook {
  const wb = registryWorkbook(s, budget);
  const g = budgetTemplate(budget);
  XLSX.utils.book_append_sheet(wb, g.Sheets.PARAMETRES, 'PARAMETRES_BUDGET');
  XLSX.utils.book_append_sheet(wb, g.Sheets.RUBRIQUES, 'RUBRIQUES');
  XLSX.utils.book_append_sheet(wb, g.Sheets.POSTES, 'POSTES');
  return wb;
}

/** Lecture du budget d'un fichier scénario : la feuille PARAMETRES_BUDGET remplace PARAMETRES. */
export function importScenarioBudget(wb: XLSX.WorkBook): Budget {
  const copy = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(copy, wb.Sheets.PARAMETRES_BUDGET ?? wb.Sheets.PARAMETRES, 'PARAMETRES');
  for (const n of wb.Sheets.POSTES ? ['RUBRIQUES', 'POSTES'] : ['VENTES', 'CHARGES']) if (wb.Sheets[n]) XLSX.utils.book_append_sheet(copy, wb.Sheets[n], n);
  return importBudget(copy);
}

/** Budget ALFA au format détaillé, grain BU × mois, pour les tests de compatibilité. */
export function legacyGrid(): LegacyGrid {
  return expandGrid(ALFA_COMPACT, 'alfa');
}

/* ------------------------------------------------------------------ Résultats (schéma en étoile) */

export interface JournalEntry {
  ref: string;
  date: string;
  p10: number;
  p50: number;
  p90: number;
  prob: number;
  controles: string;
  duree: number;
}

export function resultsWorkbook(s: Scenario, budget: Budget, run: RunOutput, model: Model, draws: Draws, pl: PLResult, journal: JournalEntry[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const U = budget.unites.principale;
  const runId = run.ref.registre.slice(0, 6) + '-' + s.graine;
  const b = run.base;
  XLSX.utils.book_append_sheet(wb, sheet([
    ['Budget probabiliste : résultats'], [budget.source === 'alfa' ? MENTION : 'Budget importé par l\'utilisateur.'], ['Référence du run', run.ref.texte], [],
    ['Indicateur', 'Valeur', 'Unité'],
    ['EBITDA budgété', budget.ebitdaPublie, U], ['Probabilité d\'atteinte', b.prob, 'part'], ['P10 (1 chance sur 10 de faire moins)', b.p10, U],
    ['P50 (médiane)', b.p50, U], ['P90', b.p90, U], ['Moyenne', b.mean, U], ['Écart-type', b.std, U],
    ['EBITDA-at-Risk 90 (P50 - P10)', b.ear, U], ['CVaR 10', b.cvar10, U], ['Objectif à 80 % de chances (P20)', b.p20, U],
  ]), 'SYNTHESE');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['run_id', 'version_outil', 'registre', 'empreinte_registre', 'empreinte_budget', 'graine', 'n', 'actifs', 'mois_clos', 'date', 'unite'],
    [runId, run.ref.outil, run.ref.registreVersion, run.ref.registre, run.ref.budget, s.graine, s.n, run.ref.actifs.join('+'), s.moisClos, run.ref.date, U],
  ]), 'DIM_RUN');
  XLSX.utils.book_append_sheet(wb, sheet([['bu_id', 'bu'], ...budget.bu.map((x, i) => [i + 1, x])]), 'DIM_BU');
  XLSX.utils.book_append_sheet(wb, sheet([['mois_id', 'exercice', 'mois', 'trimestre'], ...Array.from({ length: 12 }, (_, t) => [t + 1, budget.exercice, t + 1, Math.floor(t / 3) + 1])]), 'DIM_TEMPS');
  XLSX.utils.book_append_sheet(wb, sheet([['ligne_id', 'code', 'libelle', 'nature'], ...budget.rubriques.map((r, i) => [i + 1, r.code, r.libelle, r.nature]), [budget.rubriques.length + 1, 'EBITDA', 'EBITDA', 'resultat']]), 'DIM_LIGNE_PL');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['hypothese_id', 'code', 'libelle', 'famille', 'effet', 'proprietaire', 'loi'],
    ...s.registre.hypotheses.map((h, i) => [i + 1, h.code, h.libelle, h.famille, h.effet, h.proprietaire, run.laws.find((l) => l.code === h.code)?.loi ?? '']),
    ...s.registre.evenements.map((e, i) => [s.registre.hypotheses.length + i + 1, e.code, e.libelle, e.famille, e.effet, e.proprietaire, 'bernoulli']),
  ]), 'DIM_HYPOTHESE');
  const perc: unknown[][] = [['run_id', 'cas', 'indicateur', 'valeur']];
  const push = (cas: string, st: typeof b) => {
    for (const [k, v] of Object.entries(st)) perc.push([runId, cas, k, v]);
  };
  push('Base', b);
  for (const c of run.cases) push(c.code, c.stats);
  XLSX.utils.book_append_sheet(wb, sheet(perc), 'FAIT_PERCENTILE');
  const nl = pl.nl;
  const res: unknown[][] = [['run_id', 'iteration', 'ligne_id', 'valeur']];
  for (let i = 0; i < pl.n; i++) for (let l = 0; l < nl; l++) res.push([runId, i + 1, l + 1, pl.lines![i * nl + l]]);
  XLSX.utils.book_append_sheet(wb, sheet(res), 'FAIT_RESULTAT');
  const men: unknown[][] = [['run_id', 'iteration', 'mois_id', 'ebitda']];
  for (let i = 0; i < pl.n; i++) for (let t = 0; t < 12; t++) men.push([runId, i + 1, t + 1, pl.monthly[i * 12 + t]]);
  XLSX.utils.book_append_sheet(wb, sheet(men), 'FAIT_EBITDA_MENSUEL');
  const tir: unknown[][] = [['run_id', 'iteration', 'hypothese_id', 'valeur']];
  for (let i = 0; i < draws.n; i++) {
    model.hyps.forEach((_, j) => tir.push([runId, i + 1, j + 1, draws.h[j][i]]));
    model.events.forEach((_, k) => tir.push([runId, i + 1, model.nh + k + 1, draws.occ[k][i] ? draws.amp[k][i] : 0]));
  }
  XLSX.utils.book_append_sheet(wb, sheet(tir), 'FAIT_TIRAGE');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'type', 'cout', 'probabilite', 'p10', 'p50', 'p90', 'ear90', 'delta_probabilite_pts', 'delta_p50', 'delta_ear'],
    ...run.cases.map((c) => [c.code, c.libelle, c.type, c.cout, c.stats.prob, c.stats.p10, c.stats.p50, c.stats.p90, c.stats.ear, c.dProb * 100, c.dP50, c.dEaR]),
  ]), 'LEVIERS_STRESS');
  XLSX.utils.book_append_sheet(wb, sheet([['code', 'controle', 'seuil', 'nature', 'statut', 'valeur', 'detail'], ...run.controls.map((c) => [c.code, c.libelle, c.seuil, c.nature, c.ok ? 'vert' : 'rouge', c.valeur, c.detail ?? ''])]), 'CONTROLES');
  XLSX.utils.book_append_sheet(wb, sheet([['reference', 'date', 'p10', 'p50', 'p90', 'probabilite', 'controles', 'duree_ms'], ...journal.map((j) => [j.ref, j.date, j.p10, j.p50, j.p90, j.prob, j.controles, Math.round(j.duree)])]), 'JOURNAL_RUNS');
  return wb;
}

export function journalWorkbook(journal: JournalEntry[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([['reference', 'date', 'p10', 'p50', 'p90', 'probabilite', 'controles', 'duree_ms'], ...journal.map((j) => [j.ref, j.date, j.p10, j.p50, j.p90, j.prob, j.controles, Math.round(j.duree)])]), 'JOURNAL_RUNS');
  return wb;
}

export function workbookBytes(wb: XLSX.WorkBook): ArrayBuffer {
  return toBytes(wb);
}
