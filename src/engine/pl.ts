/** M5 : moteur P&L, recalcul mensuel par itération (section 8, règles F.2). */
import { neutralEffects, type Effects } from './levers.ts';
import type { Draws } from './sampling.ts';
import type { Actuals, BudgetGrid } from './types.ts';

export const NL = 8; // ca, cm, mix, transport, ms, fc, fg, ebitda
export const L_CA = 0, L_CM = 1, L_MIX = 2, L_TR = 3, L_MS = 4, L_FC = 5, L_FG = 6, L_EBITDA = 7;

export interface PLOptions {
  effects?: Effects;
  /** Bruit mensuel des volumes (désactivé pour C01). */
  noise?: boolean;
  /** Événements E01 à E03 (désactivés pour C01). */
  events?: boolean;
  /** Réalisé des mois clos (mode atterrissage). */
  actuals?: Actuals;
  /** Conserver les lignes annuelles et les marges par BU (exports, contrôles). */
  detail?: boolean;
  /** Conserver les lignes mensuelles (réalisé synthétique, petits N). */
  monthlyLines?: boolean;
}

export interface PLResult {
  n: number;
  /** EBITDA annuel par itération. */
  annual: Float64Array;
  /** EBITDA mensuel, n × 12. */
  monthly: Float64Array;
  /** Lignes annuelles, n × 8 (si detail). */
  lines?: Float64Array;
  /** Marge brute annuelle par BU, n × nb (si detail). */
  buMargin?: Float64Array;
  /** Lignes mensuelles, n × 12 × 8 (si monthlyLines). */
  monthlyLines?: Float64Array;
  /** Itérations ayant touché une borne physique (R-PL-04). */
  boundHits: number;
}

export function runPL(budget: BudgetGrid, d: Draws, opt: PLOptions = {}): PLResult {
  const e = opt.effects ?? neutralEffects();
  const noiseOn = opt.noise ?? true;
  const eventsOn = opt.events ?? true;
  const detail = opt.detail ?? false;
  const { n, nb } = d;
  const m = opt.actuals ? Math.min(opt.actuals.lignes.length, d.moisClos || opt.actuals.lignes.length) : 0;
  const annual = new Float64Array(n);
  const monthly = new Float64Array(n * 12);
  const lines = detail ? new Float64Array(n * NL) : undefined;
  const buMargin = detail ? new Float64Array(n * nb) : undefined;
  const ml = opt.monthlyLines ? new Float64Array(n * 12 * NL) : undefined;

  const bump = e.bump;
  const kCmImp = bump === 'cmImp' ? 1.01 : 1;
  const kCmLoc = bump === 'cmLoc' ? 1.01 : 1;
  const kTr = bump === 'transport' ? 1.01 : 1;
  const kMs = bump === 'ms' ? 1.01 : 1;
  const kFc = bump === 'fc' ? 1.01 : 1;
  const kFg = bump === 'fg' ? 1.01 : 1;
  const kFx = bump === 'cours' ? 1.01 : 1;

  const caBudgetMonth = new Float64Array(12);
  for (let t = 0; t < 12; t++) for (let b = 0; b < nb; b++) caBudgetMonth[t] += budget.ca[b][t];
  const V = new Float64Array(nb);
  const H = [d.h.H01, d.h.H02, d.h.H03];
  let boundHits = 0;

  for (let i = 0; i < n; i++) {
    const h04 = d.h.H04[i], h05 = d.h.H05[i], h07 = d.h.H07[i], h08 = d.h.H08[i];
    const h09 = e.h09Cap !== null ? Math.min(d.h.H09[i], e.h09Cap) : d.h.H09[i];
    const h10 = d.h.H10[i], h11 = d.h.H11[i], h12 = d.h.H12[i];
    const e01 = eventsOn && d.occ.E01[i] === 1;
    const e02 = eventsOn && d.occ.E02[i] === 1 && !e.forcedLoss;
    const e03 = eventsOn && d.occ.E03[i] === 1;
    const m1 = d.month.E01[i], m2 = d.month.E02[i], m3 = d.month.E03[i];
    const a1 = d.amp.E01[i], a2 = d.amp.E02[i], a3 = d.amp.E03[i] * e.e03AmpFactor;
    let hit = false;
    let sum = 0;
    let sCa = 0, sCm = 0, sMix = 0, sTr = 0, sMs = 0, sFc = 0, sFg = 0;

    for (let t = 0; t < 12; t++) {
      let ebitda: number;
      if (t < m) {
        const a = opt.actuals!.lignes[t];
        ebitda = a[L_EBITDA];
        sCa += a[L_CA]; sCm += a[L_CM]; sMix += a[L_MIX]; sTr += a[L_TR]; sMs += a[L_MS]; sFc += a[L_FC]; sFg += a[L_FG];
      } else {
        let fx = d.fx[i * 12 + t];
        if (e.fxShock && t >= e.fxShock.from) fx *= e.fxShock.factor;
        if (!(fx > 0)) hit = true;
        let rate = e.hedge ? e.hedge.part * e.hedge.cours + (1 - e.hedge.part) * fx : fx;
        rate *= kFx;
        const impF = (rate / budget.coursBudget) * h07 * kCmImp;
        const locF = h08 * kCmLoc;
        let ca = 0, cm = 0, volIdx = 0;
        for (let b = 0; b < nb; b++) {
          let v = b < 3 ? H[b][i] : 1;
          if (noiseOn) v *= 1 + d.noise[(i * nb + b) * 12 + t];
          if (e02 && b <= 1 && t >= m2) v *= 1 - a2;
          if (e.forcedLoss && b <= 1 && t >= e.forcedLoss.from) v *= 1 - e.forcedLoss.amp;
          if (e03 && (b === 1 || b === 2) && t === m3) v *= 1 - a3;
          let price = h04;
          if (e.price && t >= e.price.from && e.price.bus.includes(b)) {
            price *= e.price.factor;
            v *= e.price.volume;
          }
          if (v < 0) {
            hit = true;
            v = 0;
          }
          V[b] = v;
          const caB = budget.ca[b][t] * v * price;
          const cmB = (budget.cmImp[b][t] * impF + budget.cmLoc[b][t] * locF) * v;
          ca += caB;
          cm += cmB;
          volIdx += budget.ca[b][t] * v;
          if (buMargin) buMargin[i * nb + b] += caB - cmB;
        }
        volIdx /= caBudgetMonth[t];
        const mix = (h05 / 100) * ca;
        let fuel = 1;
        if (e01 && t >= m1) fuel *= 1 + a1;
        if (e.fuelShock && t >= e.fuelShock.from) fuel *= e.fuelShock.factor;
        let tr = budget.carburant[t] * volIdx * fuel + budget.sousTraitance[t] * volIdx * h09 + budget.autresTransport[t];
        if (e03 && t === m3 && !e.e03NoCost) tr += d.e03Cost[i];
        tr *= kTr;
        const ms = budget.masseSalariale[t] * h10 * kMs;
        const fc = (budget.fcTauxVariable * ca + budget.fcFixe[t]) * h11 * kFc;
        const fg = (budget.fraisGeneraux[t] * h12 + e.fgDelta[t]) * kFg;
        ebitda = ca - cm + mix - tr - ms - fc - fg;
        sCa += ca; sCm += cm; sMix += mix; sTr += tr; sMs += ms; sFc += fc; sFg += fg;
        if (ml) {
          const o = (i * 12 + t) * NL;
          ml[o] = ca; ml[o + 1] = cm; ml[o + 2] = mix; ml[o + 3] = tr; ml[o + 4] = ms; ml[o + 5] = fc; ml[o + 6] = fg; ml[o + 7] = ebitda;
        }
      }
      monthly[i * 12 + t] = ebitda;
      sum += ebitda;
    }
    annual[i] = sum;
    if (hit) boundHits++;
    if (lines) {
      const o = i * NL;
      lines[o] = sCa; lines[o + 1] = sCm; lines[o + 2] = sMix; lines[o + 3] = sTr;
      lines[o + 4] = sMs; lines[o + 5] = sFc; lines[o + 6] = sFg; lines[o + 7] = sum;
    }
  }
  return { n, annual, monthly, lines, buMargin, monthlyLines: ml, boundHits };
}

/** EBITDA mensuel du budget (toutes hypothèses au budget, sans aléa). */
export function budgetMonthly(budget: BudgetGrid): number[] {
  const nb = budget.bu.length;
  return Array.from({ length: 12 }, (_, t) => {
    let ca = 0, cm = 0;
    for (let b = 0; b < nb; b++) {
      ca += budget.ca[b][t];
      cm += budget.cmImp[b][t] + budget.cmLoc[b][t];
    }
    const tr = budget.carburant[t] + budget.sousTraitance[t] + budget.autresTransport[t];
    const fc = budget.fcTauxVariable * ca + budget.fcFixe[t];
    return ca - cm - tr - budget.masseSalariale[t] - fc - budget.fraisGeneraux[t];
  });
}
