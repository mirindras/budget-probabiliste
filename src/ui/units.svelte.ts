/** Unité des montants affichés : celle du budget en cours (GAr et MAr pour ALFA, M€ et k€ ailleurs). */
import type { Unites } from '../engine/types.ts';

export const units = $state<Unites>({ principale: 'GAr', detail: 'MAr', libelle: 'milliards d\'ariarys' });

export function setUnits(u: Unites) {
  units.principale = u.principale;
  units.detail = u.detail;
  units.libelle = u.libelle;
}
