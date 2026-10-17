/** Lien de partage : scénario compressé dans l'ancre (jamais envoyée au serveur), R-RE-07. */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { checkScenarioShape } from '../engine/schema.ts';
import type { Scenario } from '../engine/types.ts';

export const HASH_KEY = 's';
/**
 * Bornes du lien, contrôlées avant décompression puis avant analyse JSON.
 * Un lien ALFA fait 5 124 caractères pour 7 573 caractères de JSON : la marge est large.
 */
export const LINK_LIMITS = { encoded: 12_000, json: 100_000 } as const;

export function encodeScenario(s: Scenario): string {
  return compressToEncodedURIComponent(JSON.stringify(s));
}

export type Decoded = { ok: true; scenario: Scenario } | { ok: false; errors: string[] };

/** Décode et valide un lien : structure complète contrôlée avant tout calcul. */
export function readScenario(code: string): Decoded {
  if (code.length > LINK_LIMITS.encoded) return { ok: false, errors: [`Lien trop long : ${code.length} caractères, ${LINK_LIMITS.encoded} au plus`] };
  if (!/^[A-Za-z0-9+\-$ ]*$/.test(code)) return { ok: false, errors: ['Lien altéré : caractères inattendus'] };
  let parsed: unknown;
  try {
    const json = decompressFromEncodedURIComponent(code);
    if (!json) return { ok: false, errors: ['Lien tronqué ou illisible'] };
    if (json.length > LINK_LIMITS.json) return { ok: false, errors: ['Contenu du lien trop volumineux'] };
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Lien tronqué ou illisible'] };
  }
  const errors = checkScenarioShape(parsed);
  return errors.length ? { ok: false, errors } : { ok: true, scenario: parsed as Scenario };
}

export function decodeScenario(code: string): Scenario | null {
  const d = readScenario(code);
  return d.ok ? d.scenario : null;
}

export function shareUrl(s: Scenario, base: string): string {
  return `${base.split('#')[0]}#${HASH_KEY}=${encodeScenario(s)}`;
}

/** Scénario de l'ancre : null s'il n'y en a pas, sinon le résultat de la validation. */
export function readScenarioFromHash(hash: string): Decoded | null {
  const m = hash.replace(/^#/, '').split('&').find((p) => p.startsWith(`${HASH_KEY}=`));
  return m ? readScenario(m.slice(HASH_KEY.length + 1)) : null;
}

export function scenarioFromHash(hash: string): Scenario | null {
  const d = readScenarioFromHash(hash);
  return d?.ok ? d.scenario : null;
}
