/**
 * Cohérence entre le budget et le scénario : la structure du budget elle-même (rubriques, postes, BU),
 * puis chaque portée du registre, des leviers et des stress tests, qui doit nommer des éléments existants.
 */
import { ASSIETTES, NATURES, type Budget, type Portee, type Scenario } from './types.ts';

/** Structure d'un budget : codes uniques, rubriques et BU existantes, montants complets. */
export function budgetErrors(b: Budget): string[] {
  const errors: string[] = [];
  if (!b.bu.length) errors.push('Budget : au moins une BU attendue');
  if (new Set(b.bu).size !== b.bu.length) errors.push('Budget : BU en double');
  const rubs = new Map<string, string>();
  for (const r of b.rubriques) {
    if (rubs.has(r.code)) errors.push(`Rubrique ${r.code} en double`);
    if (!NATURES.includes(r.nature)) errors.push(`Rubrique ${r.code} : nature « ${r.nature} » inconnue (ca, produit ou charge)`);
    rubs.set(r.code, r.nature);
  }
  if (![...rubs.values()].includes('ca')) errors.push('Budget : aucune rubrique de chiffre d\'affaires (nature ca)');
  const seen = new Set<string>();
  let devises = false;
  for (const p of b.postes) {
    const w = `Poste ${p.code}`;
    if (seen.has(p.code)) errors.push(`${w} en double`);
    seen.add(p.code);
    const nat = rubs.get(p.rubrique);
    if (!nat) errors.push(`${w} : rubrique « ${p.rubrique} » inconnue`);
    if (p.bu !== null && !b.bu.includes(p.bu)) errors.push(`${w} : BU « ${p.bu} » inconnue`);
    if (nat === 'ca' && p.bu === null) errors.push(`${w} : un poste de chiffre d'affaires appartient à une BU`);
    if (nat === 'ca' && p.assiette === 'ca') errors.push(`${w} : un poste de chiffre d'affaires ne peut pas avoir le chiffre d'affaires pour assiette`);
    if (!ASSIETTES.includes(p.assiette)) errors.push(`${w} : assiette « ${p.assiette} » inconnue (fixe, volume ou ca)`);
    if (!(p.devises >= 0 && p.devises <= 1)) errors.push(`${w} : part en devises hors de 0 à 1`);
    if (p.devises > 0) devises = true;
    if (!Array.isArray(p.montants) || p.montants.length !== 12 || !p.montants.every((x) => Number.isFinite(x))) {
      errors.push(`${w} : douze montants mensuels numériques attendus`);
    } else if (nat === 'ca' && p.montants.some((x) => x < 0)) {
      errors.push(`${w} : un chiffre d'affaires budgété ne peut pas être négatif`);
    }
  }
  if (!b.postes.some((p) => rubs.get(p.rubrique) === 'ca')) errors.push('Budget : aucun poste de chiffre d\'affaires');
  if (devises && !(b.change && b.change.coursBudget > 0)) errors.push('Budget : des postes sont en devises, le cours budget est requis');
  if (!Number.isFinite(b.ebitdaPublie)) errors.push('Budget : EBITDA publié absent');
  return errors;
}

/** Références d'une portée : BU, postes, rubrique, hypothèse ou événement nommés doivent exister. */
function porteeErrors(where: string, p: Portee, b: Budget, s: Scenario): string[] {
  const errors: string[] = [];
  for (const x of p.bu ?? []) if (!b.bu.includes(x)) errors.push(`${where} : BU « ${x} » inconnue`);
  for (const x of p.postes ?? []) if (!b.postes.some((q) => q.code === x)) errors.push(`${where} : poste « ${x} » inconnu`);
  if (p.rubrique !== undefined && !b.rubriques.some((r) => r.code === p.rubrique)) errors.push(`${where} : rubrique « ${p.rubrique} » inconnue`);
  if (p.hypothese !== undefined && !s.registre.hypotheses.some((h) => h.code === p.hypothese)) errors.push(`${where} : hypothèse « ${p.hypothese} » inconnue`);
  if (p.evenement !== undefined && !s.registre.evenements.some((e) => e.code === p.evenement)) errors.push(`${where} : événement « ${p.evenement} » inconnu`);
  return errors;
}

const touchesPostes = (p: Portee, b: Budget) => (p.postes?.length ?? 0) > 0 || (p.rubrique !== undefined && b.postes.some((q) => q.rubrique === p.rubrique));

export function referenceErrors(s: Scenario, b: Budget): string[] {
  const errors = budgetErrors(b);
  if (errors.length) return errors;
  const reg = s.registre;
  const fx = reg.hypotheses.filter((h) => h.effet === 'change');
  if (fx.length > 1) errors.push(`Une seule hypothèse de change possible : ${fx.map((h) => h.code).join(', ')}`);
  if (fx.length && !b.change) errors.push(`${fx[0].code} : le budget n'a pas de cours de change`);
  for (const h of reg.hypotheses) {
    const w = h.code;
    errors.push(...porteeErrors(w, h.portee, b, s));
    if (h.effet === 'poste' && !touchesPostes(h.portee, b)) errors.push(`${w} : aucun poste visé`);
    if (h.effet === 'marge') {
      const r = b.rubriques.find((x) => x.code === h.portee.rubrique);
      if (!r) errors.push(`${w} : rubrique d'arrivée des points de marge à préciser`);
      else if (r.nature === 'ca') errors.push(`${w} : les points de marge ne vont pas dans une rubrique de chiffre d'affaires`);
    }
  }
  for (const e of reg.evenements) {
    const w = e.code;
    errors.push(...porteeErrors(w, e.portee, b, s));
    if (e.effet === 'poste' && !touchesPostes(e.portee, b)) errors.push(`${w} : aucun poste visé`);
    if (e.surcout) {
      const r = b.rubriques.find((x) => x.code === e.rubriqueSurcout);
      if (!r) errors.push(`${w} : rubrique du surcoût à préciser`);
      else if (r.nature !== 'charge') errors.push(`${w} : le surcoût va dans une rubrique de charge`);
    }
  }
  for (const l of s.leviers) {
    const w = `Levier ${l.code}`;
    errors.push(...porteeErrors(w, l.portee, b, s));
    if (l.type === 'couverture' && !fx.length) errors.push(`${w} : couverture sans hypothèse de change`);
    if ((l.type === 'montant' || l.type === 'attenuation') && l.portee.rubrique === undefined) errors.push(`${w} : rubrique à préciser`);
    if (l.type === 'plafond' && l.portee.hypothese === undefined) errors.push(`${w} : hypothèse plafonnée à préciser`);
    if (l.type === 'attenuation' && l.portee.evenement === undefined) errors.push(`${w} : événement atténué à préciser`);
  }
  for (const x of s.stress) {
    const w = `Stress ${x.code}`;
    errors.push(...porteeErrors(w, x.portee, b, s));
    if (x.type === 'change' && !fx.length) errors.push(`${w} : choc de change sans hypothèse de change`);
    if (x.type === 'evenement' && x.portee.evenement === undefined) errors.push(`${w} : événement forcé à préciser`);
    if (x.type === 'poste' && !touchesPostes(x.portee, b)) errors.push(`${w} : aucun poste visé`);
  }
  const codes = new Set([...s.leviers.map((l) => l.code), ...s.stress.map((x) => x.code)]);
  for (const p of s.paquets) for (const c of p.codes) if (!codes.has(c)) errors.push(`Paquet ${p.code} : ${c} n'est ni un levier ni un stress test`);
  return errors;
}
