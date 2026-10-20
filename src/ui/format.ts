/** Formats français : virgule décimale, espace fine des milliers, montants dans l'unité du budget à une décimale. */
import { units } from './units.svelte.ts';

const nf = (d: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = new Map<number, Intl.NumberFormat>();
export function num(x: number, d = 1): string {
  if (!Number.isFinite(x)) return '–';
  if (!cache.has(d)) cache.set(d, nf(d));
  return cache.get(d)!.format(x).replace(/ /g, ' ');
}
/** Montant dans l'unité du budget (GAr pour ALFA). */
export const amount = (x: number, d = 1) => `${num(x, d)} ${units.principale}`;
/** Montant dans l'unité de détail, un millième de l'unité du budget (MAr pour ALFA). */
export const amountDetail = (x: number) => `${num(x * 1000, 0)} ${units.detail}`;
export const pct = (x: number, d = 0) => `${num(x * 100, d)} %`;
/** Arrondi à 5 points pour la note CODIR (R-RI-02). */
export const pct5 = (x: number) => `${num(Math.round(x * 20) * 5, 0)} %`;
/** Signe affiché seulement si la valeur arrondie n'est pas nulle (pas de « −0,00 »). */
const sign = (x: number, d: number) => (Math.abs(x) < 0.5 * 10 ** -d ? '' : x > 0 ? '+' : '−');
export const pts = (x: number, d = 1) => `${sign(x * 100, d)}${num(Math.abs(x * 100), d)} pt${Math.abs(x * 100) >= 2 ? 's' : ''}`;
export const signed = (x: number, d = 2, unit = units.principale) => `${sign(x, d)}${num(Math.abs(x), d)} ${unit}`;
export const signedDetail = (x: number) => `${sign(x * 1000, 0)}${num(Math.abs(x * 1000), 0)} ${units.detail}`;
export const factor = (x: number) => num(x, 3);
/** Pas de graduation rond (1, 2 ou 5 × 10ⁿ) donnant environ `n` graduations sur l'étendue, quelle que soit l'unité. */
export function niceStep(span: number, n = 8): number {
  const raw = span / n;
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  let best = p;
  for (const k of [1, 2, 5]) if (k * p <= raw) best = k * p;
  return best;
}
/** Écart significatif sur un montant : une part de l'EBITDA budgété, et au moins 0,05 (une décimale affichée). */
export const material = (budget: number, part = 0.005) => Math.max(Math.abs(budget) * part, 0.05);
/** Cours de change : sans décimale au-delà de 100 (5 000 MGA), quatre en dessous de 10 (1,0850 USD). */
export const rate = (x: number, ref = x) => num(x, Math.abs(ref) >= 100 ? 0 : Math.abs(ref) >= 10 ? 2 : 4);

/** « 1 chance sur 3 » : vocabulaire CODIR (R-RE-04). */
export function chances(p: number): string {
  if (p <= 0.005) return 'quasi nulle';
  if (p >= 0.995) return 'quasi certaine';
  if (p < 0.5) {
    const k = Math.round(1 / p);
    return `environ 1 chance sur ${k}`;
  }
  const k = Math.round(p * 10);
  return `environ ${k} chances sur 10`;
}

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
