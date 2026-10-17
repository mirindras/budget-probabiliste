/**
 * Limites des entrées externes, contrôlées avant toute lecture par SheetJS ou tout décodage.
 * Les modèles ALFA en sont loin : BUDGET_BASE pèse 62 Ko (153 Ko décompressé, 433 lignes),
 * un lien de partage ALFA 5 124 caractères. Les marges couvrent un budget réel bien plus détaillé.
 */
import type { ImportError } from './excel.ts';

export const LIMITS = {
  /** Nombre de fichiers déposés en une fois (un classeur, ou une feuille CSV par fichier). */
  files: 10,
  /** Taille d'un fichier, xlsx ou CSV. */
  fileBytes: 5 * 1024 * 1024,
  /** Contenu décompressé d'un xlsx : borne les archives qui gonflent à la lecture. */
  unzippedBytes: 50 * 1024 * 1024,
  /** Feuilles par classeur. */
  sheets: 20,
  /** Lignes par feuille, en-tête compris. */
  rows: 50_000,
  /** Colonnes par feuille. */
  columns: 50,
} as const;

const mo = (n: number) => `${(n / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
const err = (feuille: string, message: string): ImportError => ({ feuille, ligne: null, message });

/** Fichiers acceptés : .xlsx et .csv seulement, en nombre et en taille bornés. */
export function checkFiles(files: readonly { name: string; size: number }[]): ImportError[] {
  const errors: ImportError[] = [];
  if (files.length > LIMITS.files) errors.push(err('import', `${files.length} fichiers déposés, ${LIMITS.files} au plus`));
  for (const f of files) {
    if (!/\.(xlsx|csv)$/i.test(f.name)) errors.push(err(f.name, 'format non accepté : classeur .xlsx ou fichiers .csv seulement'));
    else if (f.size === 0) errors.push(err(f.name, 'fichier vide'));
    else if (f.size > LIMITS.fileBytes) errors.push(err(f.name, `${mo(f.size)}, au-delà de la limite de ${mo(LIMITS.fileBytes)}`));
  }
  return errors;
}

/**
 * Taille totale décompressée d'une archive zip, lue dans son répertoire central sans rien décompresser.
 * null si la structure n'est pas celle d'un zip lisible (ou zip64, qu'un classeur budgétaire n'atteint pas).
 */
export function unzippedSize(b: Uint8Array): number | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const stop = Math.max(0, b.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = b.length - 22; i >= stop; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  let total = 0;
  for (let k = 0; k < entries; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) return null;
    const size = v.getUint32(p + 24, true);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return total;
}

/** Contrôle d'un classeur avant lecture : signature zip et taille décompressée. */
export function checkXlsxBytes(b: Uint8Array, name = 'classeur'): ImportError[] {
  if (b.length > LIMITS.fileBytes) return [err(name, `${mo(b.length)}, au-delà de la limite de ${mo(LIMITS.fileBytes)}`)];
  if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b || b[2] !== 0x03 || b[3] !== 0x04) return [err(name, 'ce n\'est pas un classeur .xlsx valide')];
  const size = unzippedSize(b);
  if (size === null) return [err(name, 'classeur .xlsx corrompu ou illisible')];
  if (size > LIMITS.unzippedBytes) return [err(name, `contenu décompressé de ${mo(size)}, au-delà de la limite de ${mo(LIMITS.unzippedBytes)}`)];
  return [];
}

/** Contrôle d'un CSV avant lecture : taille et nombre de lignes. */
export function checkCsvText(text: string, name = 'CSV'): ImportError[] {
  if (text.length > LIMITS.fileBytes) return [err(name, `${mo(text.length)}, au-delà de la limite de ${mo(LIMITS.fileBytes)}`)];
  let lines = 1;
  for (let i = text.indexOf('\n'); i >= 0 && lines <= LIMITS.rows; i = text.indexOf('\n', i + 1)) lines++;
  if (lines > LIMITS.rows) return [err(name, `plus de ${LIMITS.rows.toLocaleString('fr-FR')} lignes`)];
  return [];
}

/** Dimensions d'une feuille lue, d'après sa plage complète (« !fullref » quand la lecture a été tronquée). */
export function checkSheetRange(name: string, ref: string | undefined, decode: (r: string) => { s: { r: number; c: number }; e: { r: number; c: number } }): ImportError[] {
  if (!ref) return [];
  const r = decode(ref);
  const errors: ImportError[] = [];
  if (r.e.r - r.s.r + 1 > LIMITS.rows) errors.push(err(name, `plus de ${LIMITS.rows.toLocaleString('fr-FR')} lignes`));
  if (r.e.c - r.s.c + 1 > LIMITS.columns) errors.push(err(name, `plus de ${LIMITS.columns} colonnes`));
  return errors;
}
