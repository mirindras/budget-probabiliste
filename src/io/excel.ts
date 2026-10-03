/**
 * Import et export Excel (SheetJS) : modèles BUDGET_BASE et REGISTRE_HYPOTHESES,
 * import avec erreurs localisées ligne par ligne (R-IN-08), export des résultats en étoile.
 * Montants stockés en MGA dans les fichiers, en GAr dans le moteur (R-IN-06).
 */
import * as XLSX from 'xlsx';
import { ALFA_COMPACT, alfaLevers, alfaStress, TOOL_VERSION } from '../engine/alfa.ts';
import { reconciliation } from '../engine/controls.ts';
import type { RunOutput } from '../engine/simulate.ts';
import type { Draws } from '../engine/sampling.ts';
import type { PLResult } from '../engine/pl.ts';
import {
  DRIVER_CODES, EVENT_CODES, HYP_CODES, PL_LINES, PL_LINE_LABELS,
  type BudgetGrid, type Correlation, type DriverCode, type EventCode, type HypCode, type LeverDef, type Registry, type Scenario, type Status, type StressDef,
} from '../engine/types.ts';

const G = 1e9;
export const MENTION = 'Données synthétiques : société fictive ALFA Distribution, aucune donnée d\'entreprise réelle.';
export const POSTES = ['carburant', 'sous_traitance', 'autres_transport', 'masse_salariale', 'frais_commerciaux', 'frais_generaux'] as const;
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

/* ------------------------------------------------------------------ Budget de base */

/** Modèle BUDGET_BASE.xlsx prérempli avec ALFA, au grain mois × BU × canal × famille. */
export function budgetTemplate(): XLSX.WorkBook {
  const b = ALFA_COMPACT;
  const wb = XLSX.utils.book_new();
  const lisezMoi = [
    ['BUDGET_BASE : budget de base au grain mois × BU × canal × famille'],
    [MENTION],
    [],
    ['Feuille', 'Contenu'],
    ['PARAMETRES', 'libellé, exercice, cours budget EUR/MGA, EBITDA publié (MGA), part variable des frais commerciaux'],
    ['VENTES', 'une ligne par mois × BU × canal × famille : volume (cartons), prix net (MGA par carton), coût matière unitaire (MGA par carton), part importée du coût matière'],
    ['CHARGES', 'une ligne par mois × poste : carburant, sous_traitance, autres_transport, masse_salariale, frais_commerciaux, frais_generaux (MGA)'],
    [],
    ['Règles', 'R-IN-01 réconciliation à 1 MAr ; R-IN-02 volumes ≥ 0, prix > 0 ; R-IN-03 aucune ligne orpheline ; R-IN-04 12 mois continus ; trois BU, dans l\'ordre des hypothèses H01 à H03'],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(lisezMoi), 'LISEZ_MOI');
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
    const vals: Record<(typeof POSTES)[number], number> = {
      carburant: b.transport.carburant * w,
      sous_traitance: b.transport.sous_traitance * w,
      autres_transport: b.transport.autres / 12,
      masse_salariale: b.masse_salariale / 12,
      frais_commerciaux: fc.total * fc.part_variable * w + (fc.total * (1 - fc.part_variable)) / 12,
      frais_generaux: b.frais_generaux / 12,
    };
    for (const p of POSTES) charges.push([t + 1, p, vals[p] * G]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(charges), 'CHARGES');
  return wb;
}

function rows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] | null {
  const ws = wb.Sheets[name];
  return ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }) : null;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN);

/** Import du budget : contrôles R-IN-01 à R-IN-04, agrégation au grain BU × mois. */
export function importBudget(wb: XLSX.WorkBook): BudgetGrid {
  const errors: ImportError[] = [];
  const params = rows(wb, 'PARAMETRES');
  const ventes = rows(wb, 'VENTES');
  const charges = rows(wb, 'CHARGES');
  for (const [n, r] of [['PARAMETRES', params], ['VENTES', ventes], ['CHARGES', charges]] as const) {
    if (!r) errors.push({ feuille: n, ligne: null, message: 'feuille absente' });
  }
  if (errors.length) throw new ImportFailure(errors);
  const p = Object.fromEntries(params!.map((r) => [String(r.cle ?? '').trim(), r.valeur]));
  const cours = num(p.cours_budget_eur_mga);
  const ebitda = num(p.ebitda_publie_mga) / G;
  const partVar = num(p.part_variable_frais_commerciaux);
  if (!(cours > 0)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'cours_budget_eur_mga absent ou non positif' });
  if (!Number.isFinite(ebitda)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'ebitda_publie_mga absent' });
  if (!(partVar >= 0 && partVar <= 1)) errors.push({ feuille: 'PARAMETRES', ligne: null, message: 'part_variable_frais_commerciaux hors de [0 ; 1]' });

  const bus: string[] = [];
  const cells = new Map<string, { ca: number; imp: number; loc: number }>();
  const seen = new Map<string, Set<number>>();
  ventes!.forEach((r, k) => {
    const ligne = k + 2;
    const mois = num(r.mois);
    const bu = String(r.bu ?? '').trim();
    const vol = num(r.volume_cartons);
    const prix = num(r.prix_net_mga);
    const cu = num(r.cout_unitaire_mga);
    const imp = num(r.part_importee);
    const errs: string[] = [];
    if (!(Number.isInteger(mois) && mois >= 1 && mois <= 12)) errs.push('mois hors de 1 à 12');
    if (!bu) errs.push('BU absente : ligne orpheline (R-IN-03)');
    if (!String(r.canal ?? '').trim() || !String(r.famille ?? '').trim()) errs.push('canal ou famille absent : ligne orpheline (R-IN-03)');
    if (!(vol >= 0)) errs.push('volume négatif ou non numérique (R-IN-02)');
    if (!(prix > 0)) errs.push('prix nul, négatif ou non numérique (R-IN-02)');
    if (!(cu >= 0)) errs.push('coût unitaire négatif ou non numérique');
    if (!(imp >= 0 && imp <= 1)) errs.push('part importée hors de 0 à 100 %');
    if (errs.length) {
      errors.push({ feuille: 'VENTES', ligne, message: errs.join(' ; ') });
      return;
    }
    if (!bus.includes(bu)) bus.push(bu);
    const key = `${bu}|${mois}`;
    const c = cells.get(key) ?? { ca: 0, imp: 0, loc: 0 };
    c.ca += (vol * prix) / G;
    c.imp += (vol * cu * imp) / G;
    c.loc += (vol * cu * (1 - imp)) / G;
    cells.set(key, c);
    if (!seen.has(bu)) seen.set(bu, new Set());
    seen.get(bu)!.add(mois);
  });
  if (bus.length !== 3 && !errors.some((e) => e.feuille === 'VENTES')) {
    errors.push({ feuille: 'VENTES', ligne: null, message: `3 BU attendues (hypothèses H01 à H03), ${bus.length} trouvées` });
  }
  // Continuité (R-IN-04) vérifiée seulement sans erreur de ligne : une ligne rejetée n'est pas signalée deux fois.
  const ventesLineErrors = errors.some((e) => e.feuille === 'VENTES' && e.ligne !== null);
  for (const bu of ventesLineErrors ? [] : bus) {
    const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !seen.get(bu)!.has(m));
    if (missing.length) errors.push({ feuille: 'VENTES', ligne: null, message: `${bu} : mois manquant(s) ${missing.join(', ')} (R-IN-04)` });
  }
  const ch: Record<string, number[]> = Object.fromEntries(POSTES.map((x) => [x, new Array(12).fill(NaN)]));
  charges!.forEach((r, k) => {
    const ligne = k + 2;
    const mois = num(r.mois);
    const poste = String(r.poste ?? '').trim();
    const m = num(r.montant_mga);
    if (!(POSTES as readonly string[]).includes(poste)) {
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
  for (const poste of chargesLineErrors ? [] : POSTES) {
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
  const grid: BudgetGrid = {
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
  const recon = reconciliation(grid);
  if (Math.abs(recon - ebitda) * 1000 > 1) {
    throw new ImportFailure([{ feuille: 'PARAMETRES', ligne: null, message: `réconciliation : le budget recalculé donne ${fr(recon, 3)} GAr pour ${fr(ebitda, 3)} GAr publiés, écart supérieur à 1 MAr (R-IN-01)` }]);
  }
  return grid;
}

const fr = (x: number, d: number) => x.toFixed(d).replace('.', ',');

/* ------------------------------------------------------------------ Registre */

export function registryWorkbook(s: Scenario): XLSX.WorkBook {
  const r = s.registre;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['REGISTRE_HYPOTHESES : hypothèses, événements, corrélations, leviers. À rééditer puis réimporter.'],
    [MENTION],
    ['Règles : P10 < P50 < P90 (R-HY-01) ; un propriétaire et une justification par ligne (principe 3) ; corrélations de rang entre -0,9 et +0,9 (R-DE-01).'],
    ['H07 se saisit par P10 et P90 (loi lognormale, P50 vide) ; H06 par départ, dérive annuelle et volatilité mensuelle (marche aléatoire) ; renseigner min et max pour une loi PERT.'],
  ]), 'LISEZ_MOI');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['cle', 'valeur'], ['version', r.version], ['statut', r.statut], ['n', s.n], ['graine', s.graine],
    ['phi', r.bruit_volumes.phi], ['sigma_mensuel', r.bruit_volumes.sigma_mensuel], ['version_outil', TOOL_VERSION],
  ]), 'PARAMETRES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'proprietaire', 'unite', 'grain', 'p10', 'p50', 'p90', 'min', 'max', 'depart', 'derive_annuelle', 'volatilite_mensuelle', 'k', 'justification', 'statut'],
    ...r.hypotheses.map((h) => [h.code, h.libelle, h.proprietaire, h.unite, h.grain, h.p10 ?? null, h.p50 ?? null, h.p90 ?? null, h.min ?? null, h.max ?? null,
      h.depart ?? null, h.derive_annuelle ?? null, h.volatilite_mensuelle ?? null, h.k ?? 1, h.justification, h.statut]),
  ]), 'HYPOTHESES');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'proprietaire', 'p', 'amplitude_min', 'amplitude_max', 'surcout_min_gar', 'surcout_max_gar', 'duree', 'cible', 'justification', 'statut'],
    ...r.evenements.map((e) => [e.code, e.libelle, e.proprietaire, e.p, e.amplitude[0], e.amplitude[1], e.surcout?.[0] ?? null, e.surcout?.[1] ?? null, e.duree, e.cible, e.justification, e.statut]),
  ]), 'EVENEMENTS');
  XLSX.utils.book_append_sheet(wb, sheet([['a', 'b', 'correlation_rang', 'justification'], ...r.correlations_rang.map((c) => [c[0], c[1], c[2], c[3] ?? ''])]), 'CORRELATIONS');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'description', 'hypotheses', 'regle', 'cout_gar', 'cout_libelle', 'mois_effet', 'proprietaire', 'faisabilite', 'parametres'],
    ...s.leviers.map((l) => [l.code, l.libelle, l.description, l.hypotheses, l.regle, l.cout, l.coutLibelle, l.mois, l.proprietaire, l.faisabilite, params(l.params)]),
  ]), 'LEVIERS');
  XLSX.utils.book_append_sheet(wb, sheet([['code', 'libelle', 'regle', 'mois_effet', 'parametres'], ...s.stress.map((x) => [x.code, x.libelle, x.regle, x.mois, params(x.params)])]), 'STRESS');
  return wb;
}

const params = (p: Record<string, number>) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join('; ');
const parseParams = (s: unknown): Record<string, number> =>
  Object.fromEntries(String(s ?? '').split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), num(v)]));
const opt = (v: unknown): number | undefined => (v === null || v === undefined || v === '' ? undefined : num(v));
const STATUTS: Status[] = ['brouillon', 'valide', 'gele'];

/** Import du registre : applique les valeurs au scénario courant, erreurs localisées. */
export function importRegistry(wb: XLSX.WorkBook, current: Scenario): Scenario {
  const errors: ImportError[] = [];
  const hyps = rows(wb, 'HYPOTHESES');
  const evs = rows(wb, 'EVENEMENTS');
  const cors = rows(wb, 'CORRELATIONS');
  if (!hyps) errors.push({ feuille: 'HYPOTHESES', ligne: null, message: 'feuille absente' });
  if (!evs) errors.push({ feuille: 'EVENEMENTS', ligne: null, message: 'feuille absente' });
  if (!cors) errors.push({ feuille: 'CORRELATIONS', ligne: null, message: 'feuille absente' });
  if (errors.length) throw new ImportFailure(errors);
  const s = structuredClone(current);
  const reg: Registry = s.registre;
  const found = new Set<string>();
  hyps!.forEach((r, k) => {
    const ligne = k + 2;
    const code = String(r.code ?? '').trim() as HypCode;
    if (!HYP_CODES.includes(code)) {
      errors.push({ feuille: 'HYPOTHESES', ligne, message: `code « ${code} » inconnu (H01 à H12)` });
      return;
    }
    found.add(code);
    const h = reg.hypotheses.find((x) => x.code === code)!;
    h.libelle = String(r.libelle ?? h.libelle);
    h.proprietaire = String(r.proprietaire ?? '').trim();
    h.unite = String(r.unite ?? h.unite);
    h.grain = String(r.grain ?? h.grain);
    h.justification = String(r.justification ?? '').trim();
    h.statut = STATUTS.includes(r.statut as Status) ? (r.statut as Status) : 'brouillon';
    h.k = opt(r.k) ?? 1;
    const msgs: string[] = [];
    if (!h.proprietaire) msgs.push('propriétaire manquant (principe 3)');
    if (!h.justification) msgs.push('justification manquante (principe 3)');
    if (code === 'H06') {
      h.depart = opt(r.depart);
      h.derive_annuelle = opt(r.derive_annuelle);
      h.volatilite_mensuelle = opt(r.volatilite_mensuelle);
      if (!(h.depart! > 0 && h.volatilite_mensuelle! > 0 && Number.isFinite(h.derive_annuelle))) msgs.push('départ, dérive et volatilité du change requis');
    } else {
      h.p10 = opt(r.p10);
      h.p50 = opt(r.p50) ?? null;
      h.p90 = opt(r.p90);
      h.min = opt(r.min);
      h.max = opt(r.max);
      if (h.min !== undefined && h.max !== undefined) {
        if (!(h.p50 !== null && h.min < h.p50 && h.p50 < h.max)) msgs.push('PERT : minimum < P50 (mode) < maximum requis');
      } else if (h.p50 === null) {
        if (!(h.p10! > 0 && h.p10! < h.p90!)) msgs.push('0 < P10 < P90 requis (R-HY-01)');
      } else if (!(h.p10! < h.p50 && h.p50 < h.p90!)) {
        msgs.push('P10 < P50 < P90 requis (R-HY-01)');
      }
    }
    if (!(h.k! >= 1 && h.k! <= 2)) msgs.push('k hors de [1 ; 2] (R-BT-03)');
    if (msgs.length) errors.push({ feuille: 'HYPOTHESES', ligne, message: `${code} : ${msgs.join(' ; ')}` });
  });
  for (const c of HYP_CODES) if (!found.has(c)) errors.push({ feuille: 'HYPOTHESES', ligne: null, message: `${c} absente` });
  evs!.forEach((r, k) => {
    const ligne = k + 2;
    const code = String(r.code ?? '').trim() as EventCode;
    if (!EVENT_CODES.includes(code)) {
      errors.push({ feuille: 'EVENEMENTS', ligne, message: `code « ${code} » inconnu (E01 à E03)` });
      return;
    }
    const e = reg.evenements.find((x) => x.code === code)!;
    e.libelle = String(r.libelle ?? e.libelle);
    e.proprietaire = String(r.proprietaire ?? '').trim();
    e.p = num(r.p);
    e.amplitude = [num(r.amplitude_min), num(r.amplitude_max)];
    const sc = [opt(r.surcout_min_gar), opt(r.surcout_max_gar)];
    e.surcout = sc[0] !== undefined && sc[1] !== undefined ? [sc[0], sc[1]] : undefined;
    e.justification = String(r.justification ?? '').trim();
    e.statut = STATUTS.includes(r.statut as Status) ? (r.statut as Status) : 'brouillon';
    const msgs: string[] = [];
    if (!(e.p >= 0 && e.p <= 1)) msgs.push('probabilité hors de [0 ; 1] (R-HY-05)');
    if (!(e.amplitude[0] <= e.amplitude[1])) msgs.push('amplitude minimale supérieure à la maximale');
    if (!e.proprietaire) msgs.push('propriétaire manquant');
    if (msgs.length) errors.push({ feuille: 'EVENEMENTS', ligne, message: `${code} : ${msgs.join(' ; ')}` });
  });
  const corr: Correlation[] = [];
  cors!.forEach((r, k) => {
    const ligne = k + 2;
    const a = String(r.a ?? '').trim() as DriverCode;
    const b = String(r.b ?? '').trim() as DriverCode;
    const v = num(r.correlation_rang);
    if (!DRIVER_CODES.includes(a) || !DRIVER_CODES.includes(b) || a === b) {
      errors.push({ feuille: 'CORRELATIONS', ligne, message: `paire ${a} / ${b} invalide` });
      return;
    }
    if (!(v >= -0.9 && v <= 0.9)) {
      errors.push({ feuille: 'CORRELATIONS', ligne, message: `${a} / ${b} : corrélation hors de [-0,9 ; +0,9] (R-DE-01)` });
      return;
    }
    corr.push([a, b, v, String(r.justification ?? '')]);
  });
  reg.correlations_rang = corr;
  const p = rows(wb, 'PARAMETRES');
  if (p) {
    const kv = Object.fromEntries(p.map((r) => [String(r.cle ?? ''), r.valeur]));
    if (kv.version) reg.version = String(kv.version);
    if (STATUTS.includes(kv.statut as Status)) reg.statut = kv.statut as Status;
    if (Number.isFinite(num(kv.n))) s.n = num(kv.n);
    if (Number.isFinite(num(kv.graine))) s.graine = num(kv.graine);
    if (Number.isFinite(num(kv.phi))) reg.bruit_volumes.phi = num(kv.phi);
    if (Number.isFinite(num(kv.sigma_mensuel))) reg.bruit_volumes.sigma_mensuel = num(kv.sigma_mensuel);
  }
  const lv = rows(wb, 'LEVIERS');
  if (lv) {
    s.leviers = alfaLevers().map((def) => {
      const r = lv.find((x) => String(x.code).trim() === def.code);
      if (!r) return def;
      const l: LeverDef = { ...def, cout: opt(r.cout_gar) ?? null, mois: opt(r.mois_effet) ?? null, proprietaire: String(r.proprietaire ?? '').trim(), params: { ...def.params, ...parseParams(r.parametres) } };
      return l;
    });
  }
  const st = rows(wb, 'STRESS');
  if (st) {
    s.stress = alfaStress().map((def) => {
      const r = st.find((x) => String(x.code).trim() === def.code);
      if (!r) return def;
      const x: StressDef = { ...def, mois: opt(r.mois_effet) ?? def.mois, params: { ...def.params, ...parseParams(r.parametres) } };
      return x;
    });
  }
  if (errors.length) throw new ImportFailure(errors);
  return s;
}

/** Type d'un classeur déposé : budget, registre, ou scénario complet (budget + registre). */
export function workbookKind(wb: XLSX.WorkBook): 'budget' | 'registre' | 'scenario' | 'inconnu' {
  const has = (n: string) => wb.SheetNames.includes(n);
  const budget = has('VENTES') && has('CHARGES');
  const reg = has('HYPOTHESES') && has('EVENEMENTS');
  if (budget && reg) return 'scenario';
  if (budget) return 'budget';
  if (reg) return 'registre';
  return 'inconnu';
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array' });
}

/** Lecture d'un CSV : une feuille nommée d'après le fichier (VENTES.csv, CHARGES.csv…). */
export function readCsv(text: string, sheetName: string): XLSX.WorkBook {
  const wb = XLSX.read(text, { type: 'string', FS: text.includes(';') ? ';' : ',' });
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, wb.Sheets[wb.SheetNames[0]], sheetName.toUpperCase());
  return out;
}

/** Scénario sur données importées : budget et registre voyagent ensemble dans un fichier, jamais dans un lien. */
export function scenarioWorkbook(s: Scenario, budget: BudgetGrid): XLSX.WorkBook {
  const wb = registryWorkbook(s);
  const g = budgetGridWorkbook(budget);
  for (const n of ['PARAMETRES_BUDGET', 'VENTES', 'CHARGES']) XLSX.utils.book_append_sheet(wb, g.Sheets[n], n);
  return wb;
}

/** Budget au grain BU × mois, réimportable (une famille et un canal par BU). */
function budgetGridWorkbook(b: BudgetGrid): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['cle', 'valeur'], ['libelle', b.libelle], ['exercice', b.exercice], ['cours_budget_eur_mga', b.coursBudget],
    ['ebitda_publie_mga', b.ebitdaPublie * G], ['part_variable_frais_commerciaux', partVariable(b)],
  ]), 'PARAMETRES_BUDGET');
  const v: unknown[][] = [['mois', 'bu', 'canal', 'famille', 'volume_cartons', 'prix_net_mga', 'cout_unitaire_mga', 'part_importee']];
  for (let t = 0; t < 12; t++) {
    b.bu.forEach((bu, i) => {
      const cm = b.cmImp[i][t] + b.cmLoc[i][t];
      v.push([t + 1, bu, 'Tous', 'Toutes', 1, b.ca[i][t] * G, cm * G, cm > 0 ? b.cmImp[i][t] / cm : 0]);
    });
  }
  XLSX.utils.book_append_sheet(wb, sheet(v), 'VENTES');
  const c: unknown[][] = [['mois', 'poste', 'montant_mga']];
  for (let t = 0; t < 12; t++) {
    const ca = b.ca.reduce((a, r) => a + r[t], 0);
    const vals = [b.carburant[t], b.sousTraitance[t], b.autresTransport[t], b.masseSalariale[t], b.fcTauxVariable * ca + b.fcFixe[t], b.fraisGeneraux[t]];
    POSTES.forEach((p, k) => c.push([t + 1, p, vals[k] * G]));
  }
  XLSX.utils.book_append_sheet(wb, sheet(c), 'CHARGES');
  return wb;
}

function partVariable(b: BudgetGrid): number {
  let fc = 0, ca = 0;
  for (let t = 0; t < 12; t++) {
    const c = b.ca.reduce((a, r) => a + r[t], 0);
    ca += c;
    fc += b.fcTauxVariable * c + b.fcFixe[t];
  }
  return (b.fcTauxVariable * ca) / fc;
}

/** Lecture d'un fichier scénario : la feuille PARAMETRES_BUDGET remplace PARAMETRES pour le budget. */
export function importScenarioBudget(wb: XLSX.WorkBook): BudgetGrid {
  const copy = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(copy, wb.Sheets.PARAMETRES_BUDGET ?? wb.Sheets.PARAMETRES, 'PARAMETRES');
  XLSX.utils.book_append_sheet(copy, wb.Sheets.VENTES, 'VENTES');
  XLSX.utils.book_append_sheet(copy, wb.Sheets.CHARGES, 'CHARGES');
  return importBudget(copy);
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

export function resultsWorkbook(s: Scenario, budget: BudgetGrid, run: RunOutput, draws: Draws, pl: PLResult, journal: JournalEntry[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const runId = run.ref.registre.slice(0, 6) + '-' + s.graine;
  const b = run.base;
  XLSX.utils.book_append_sheet(wb, sheet([
    ['Budget probabiliste : résultats'], [budget.source === 'alfa' ? MENTION : 'Budget importé par l\'utilisateur.'], ['Référence du run', run.ref.texte], [],
    ['Indicateur', 'Valeur', 'Unité'],
    ['EBITDA budgété', budget.ebitdaPublie, 'GAr'], ['Probabilité d\'atteinte', b.prob, 'part'], ['P10 (1 chance sur 10 de faire moins)', b.p10, 'GAr'],
    ['P50 (médiane)', b.p50, 'GAr'], ['P90', b.p90, 'GAr'], ['Moyenne', b.mean, 'GAr'], ['Écart-type', b.std, 'GAr'],
    ['EBITDA-at-Risk 90 (P50 - P10)', b.ear, 'GAr'], ['CVaR 10', b.cvar10, 'GAr'], ['Objectif à 80 % de confiance (P20)', b.p20, 'GAr'],
  ]), 'SYNTHESE');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['run_id', 'version_outil', 'registre', 'empreinte_registre', 'empreinte_budget', 'graine', 'n', 'actifs', 'mois_clos', 'date'],
    [runId, run.ref.outil, run.ref.registreVersion, run.ref.registre, run.ref.budget, s.graine, s.n, run.ref.actifs.join('+'), s.moisClos, run.ref.date],
  ]), 'DIM_RUN');
  XLSX.utils.book_append_sheet(wb, sheet([['bu_id', 'bu'], ...budget.bu.map((x, i) => [i + 1, x])]), 'DIM_BU');
  XLSX.utils.book_append_sheet(wb, sheet([['mois_id', 'exercice', 'mois', 'trimestre'], ...Array.from({ length: 12 }, (_, t) => [t + 1, budget.exercice, t + 1, Math.floor(t / 3) + 1])]), 'DIM_TEMPS');
  XLSX.utils.book_append_sheet(wb, sheet([['ligne_id', 'code', 'libelle'], ...PL_LINES.map((l, i) => [i + 1, l, PL_LINE_LABELS[l]])]), 'DIM_LIGNE_PL');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['hypothese_id', 'code', 'libelle', 'proprietaire', 'loi'],
    ...s.registre.hypotheses.map((h, i) => [i + 1, h.code, h.libelle, h.proprietaire, run.laws.find((l) => l.code === h.code)?.loi ?? '']),
    ...s.registre.evenements.map((e, i) => [13 + i, e.code, e.libelle, e.proprietaire, 'bernoulli']),
  ]), 'DIM_HYPOTHESE');
  const perc: unknown[][] = [['run_id', 'cas', 'indicateur', 'valeur']];
  const push = (cas: string, st: typeof b) => {
    for (const [k, v] of Object.entries(st)) perc.push([runId, cas, k, v]);
  };
  push('Base', b);
  for (const c of run.cases) push(c.code, c.stats);
  XLSX.utils.book_append_sheet(wb, sheet(perc), 'FAIT_PERCENTILE');
  const res: unknown[][] = [['run_id', 'iteration', 'ligne_id', 'valeur_gar']];
  for (let i = 0; i < pl.n; i++) for (let l = 0; l < PL_LINES.length; l++) res.push([runId, i + 1, l + 1, pl.lines![i * PL_LINES.length + l]]);
  XLSX.utils.book_append_sheet(wb, sheet(res), 'FAIT_RESULTAT');
  const men: unknown[][] = [['run_id', 'iteration', 'mois_id', 'ebitda_gar']];
  for (let i = 0; i < pl.n; i++) for (let t = 0; t < 12; t++) men.push([runId, i + 1, t + 1, pl.monthly[i * 12 + t]]);
  XLSX.utils.book_append_sheet(wb, sheet(men), 'FAIT_EBITDA_MENSUEL');
  const tir: unknown[][] = [['run_id', 'iteration', 'hypothese_id', 'valeur']];
  for (let i = 0; i < draws.n; i++) {
    HYP_CODES.forEach((c, j) => tir.push([runId, i + 1, j + 1, c === 'H06' ? draws.fxMean[i] : draws.h[c][i]]));
    EVENT_CODES.forEach((c, j) => tir.push([runId, i + 1, 13 + j, draws.occ[c][i] ? draws.amp[c][i] : 0]));
  }
  XLSX.utils.book_append_sheet(wb, sheet(tir), 'FAIT_TIRAGE');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['code', 'libelle', 'type', 'cout_gar', 'probabilite', 'p10', 'p50', 'p90', 'ear90', 'delta_probabilite_pts', 'delta_p50_gar', 'delta_ear_gar'],
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
