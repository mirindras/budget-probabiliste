/** Lien de partage : scénario compressé dans l'ancre (jamais envoyée au serveur), R-RE-07. */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Scenario } from '../engine/types.ts';

export const HASH_KEY = 's';

export function encodeScenario(s: Scenario): string {
  return compressToEncodedURIComponent(JSON.stringify(s));
}

export function decodeScenario(code: string): Scenario | null {
  try {
    const json = decompressFromEncodedURIComponent(code);
    if (!json) return null;
    const s = JSON.parse(json) as Scenario;
    if (s.schemaVersion !== 1 || !s.registre || !Array.isArray(s.registre.hypotheses)) return null;
    return s;
  } catch {
    return null;
  }
}

export function shareUrl(s: Scenario, base: string): string {
  return `${base.split('#')[0]}#${HASH_KEY}=${encodeScenario(s)}`;
}

export function scenarioFromHash(hash: string): Scenario | null {
  const m = hash.replace(/^#/, '').split('&').find((p) => p.startsWith(`${HASH_KEY}=`));
  return m ? decodeScenario(m.slice(HASH_KEY.length + 1)) : null;
}
