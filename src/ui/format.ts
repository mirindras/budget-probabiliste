/** Formats français : virgule décimale, espace fine des milliers, montants en GAr à une décimale. */
const nf = (d: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = new Map<number, Intl.NumberFormat>();
export function num(x: number, d = 1): string {
  if (!Number.isFinite(x)) return '–';
  if (!cache.has(d)) cache.set(d, nf(d));
  return cache.get(d)!.format(x).replace(/ /g, ' ');
}
export const gar = (x: number, d = 1) => `${num(x, d)} GAr`;
export const mar = (x: number) => `${num(x * 1000, 0)} MAr`;
export const pct = (x: number, d = 0) => `${num(x * 100, d)} %`;
/** Arrondi à 5 points pour la note CODIR (R-RI-02). */
export const pct5 = (x: number) => `${num(Math.round(x * 20) * 5, 0)} %`;
/** Signe affiché seulement si la valeur arrondie n'est pas nulle (pas de « −0,00 »). */
const sign = (x: number, d: number) => (Math.abs(x) < 0.5 * 10 ** -d ? '' : x > 0 ? '+' : '−');
export const pts = (x: number, d = 1) => `${sign(x * 100, d)}${num(Math.abs(x * 100), d)} pt${Math.abs(x * 100) >= 2 ? 's' : ''}`;
export const signed = (x: number, d = 2, unit = 'GAr') => `${sign(x, d)}${num(Math.abs(x), d)} ${unit}`;
export const signedMar = (x: number) => `${sign(x * 1000, 0)}${num(Math.abs(x * 1000), 0)} MAr`;
export const factor = (x: number) => num(x, 3);

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
