/**
 * Portée en texte, pour les classeurs Excel et l'affichage : « bu: Boissons, Epicerie », « postes: CARBURANT »,
 * « rubrique: FG », « hypothese: H09 », « evenement: E03 », plusieurs parties séparées par « ; ».
 * Une portée vide vise toute l'entreprise.
 */
import type { Budget, Portee } from './types.ts';

const KEYS = ['bu', 'postes', 'rubrique', 'hypothese', 'evenement'] as const;
type Key = (typeof KEYS)[number];
const ALIASES: Record<string, Key> = {
  bu: 'bu', bus: 'bu', postes: 'postes', poste: 'postes', rubrique: 'rubrique', rubriques: 'rubrique',
  hypothese: 'hypothese', 'hypothèse': 'hypothese', evenement: 'evenement', 'événement': 'evenement',
};

export function formatPortee(p: Portee | undefined): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.bu?.length) parts.push(`bu: ${p.bu.join(', ')}`);
  if (p.postes?.length) parts.push(`postes: ${p.postes.join(', ')}`);
  if (p.rubrique) parts.push(`rubrique: ${p.rubrique}`);
  if (p.hypothese) parts.push(`hypothese: ${p.hypothese}`);
  if (p.evenement) parts.push(`evenement: ${p.evenement}`);
  return parts.join(' ; ');
}

/** Lecture d'une portée écrite en texte ; erreur lisible si une partie est mal formée. */
export function parsePortee(s: unknown): { portee: Portee; error: string | null } {
  const text = String(s ?? '').trim();
  const portee: Portee = {};
  if (!text) return { portee, error: null };
  for (const part of text.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf(':');
    if (i < 0) return { portee, error: `« ${p} » : forme attendue « bu: … », « postes: … », « rubrique: … », « hypothese: … » ou « evenement: … »` };
    const key = ALIASES[p.slice(0, i).trim().toLowerCase()];
    if (!key) return { portee, error: `« ${p.slice(0, i).trim()} » : clé inconnue (bu, postes, rubrique, hypothese, evenement)` };
    const values = p.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean);
    if (!values.length) return { portee, error: `« ${p} » : aucune valeur` };
    if (key === 'bu' || key === 'postes') portee[key] = [...(portee[key] ?? []), ...values];
    else portee[key] = values[0];
  }
  return { portee, error: null };
}

/** Portée en clair, pour l'interface : « BU Boissons et Épicerie », « postes Carburant », « toute l'entreprise ». */
export function describePortee(p: Portee | undefined, b: Budget): string {
  if (!p) return 'toute l\'entreprise';
  const parts: string[] = [];
  if (p.bu?.length) parts.push(`BU ${joinFr(p.bu)}`);
  if (p.postes?.length) parts.push(joinFr(p.postes.map((c) => b.postes.find((x) => x.code === c)?.libelle ?? c)));
  if (p.rubrique) parts.push(b.rubriques.find((r) => r.code === p.rubrique)?.libelle ?? p.rubrique);
  if (p.hypothese) parts.push(`hypothèse ${p.hypothese}`);
  if (p.evenement) parts.push(`événement ${p.evenement}`);
  return parts.length ? parts.join(', ') : 'toute l\'entreprise';
}

export function joinFr(x: string[]): string {
  return x.length <= 1 ? (x[0] ?? '') : `${x.slice(0, -1).join(', ')} et ${x[x.length - 1]}`;
}
