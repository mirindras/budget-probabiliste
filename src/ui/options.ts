/** Options à arbitrer en CODIR, communes à la synthèse et à la note d'une page. */
import type { CaseResult } from '../engine/simulate.ts';
import type { Paquet } from '../engine/types.ts';

export interface Option {
  c: CaseResult;
  nom: string;
  codes: string[];
  pour: string;
}

/**
 * Deux paquets de leviers : celui qui maximise les chances de tenir le budget, et celui qui protège le mieux
 * le bas de fourchette, s'il est distinct et protège vraiment mieux. Sinon, rien à arbitrer.
 */
export function arbitrage(cases: CaseResult[], paquets: Paquet[]): Option[] {
  const pk = cases.filter((c) => c.type === 'paquet' && !c.refus);
  if (pk.length < 2) return [];
  const a = [...pk].sort((x, y) => y.stats.prob - x.stats.prob)[0];
  const b = pk.filter((c) => c !== a).sort((x, y) => y.stats.p10 - x.stats.p10)[0];
  if (b.stats.p10 <= a.stats.p10) return [];
  const codesOf = (c: CaseResult) => paquets.find((p) => p.code === c.code)?.codes ?? [];
  return [
    { c: a, nom: `Option ${a.code}`, codes: codesOf(a), pour: 'maximise les chances de tenir le budget' },
    { c: b, nom: `Option ${b.code}`, codes: codesOf(b), pour: 'protège le bas de fourchette' },
  ];
}
