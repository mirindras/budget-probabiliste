/**
 * M5 : moteur P&L générique, recalcul mensuel par itération (section 8, règles F.2).
 * Chaque mois : volumes et prix des BU, puis chaque poste (montant budgété × assiette × hypothèses × change
 * × événements × stress), cumulé dans sa rubrique ; l'EBITDA est la somme signée des rubriques.
 */
import { neutralEffects, type Effects } from './levers.ts';
import { ASS_CA, ASS_VOLUME, type Model } from './model.ts';
import type { Draws } from './sampling.ts';
import type { Actuals } from './types.ts';

export interface PLOptions {
  effects?: Effects;
  /** Bruit mensuel des volumes (désactivé pour C01). */
  noise?: boolean;
  /** Événements tirés (désactivés pour C01). */
  events?: boolean;
  /** Réalisé des mois clos (mode atterrissage). */
  actuals?: Actuals;
  /** Conserver les rubriques annuelles et les marges par BU (exports, contrôles). */
  detail?: boolean;
  /** Conserver les rubriques mensuelles (réalisé synthétique, petits N). */
  monthlyLines?: boolean;
}

export interface PLResult {
  n: number;
  /** Nombre de lignes de résultat : une par rubrique, puis l'EBITDA. */
  nl: number;
  /** EBITDA annuel par itération. */
  annual: Float64Array;
  /** EBITDA mensuel, n × 12. */
  monthly: Float64Array;
  /** Rubriques annuelles puis EBITDA, n × nl (si detail). */
  lines?: Float64Array;
  /** Marge annuelle par BU, n × nb : somme signée des postes de la BU (si detail). */
  buMargin?: Float64Array;
  /** Même total recalculé par rubrique, pour le contrôle d'agrégation C02 (si detail). */
  buCheck?: Float64Array;
  /** Rubriques mensuelles puis EBITDA, n × 12 × nl (si monthlyLines). */
  monthlyLines?: Float64Array;
  /** Itérations ayant touché une borne physique (R-PL-04). */
  boundHits: number;
}

export function runPL(m: Model, d: Draws, opt: PLOptions = {}): PLResult {
  const e = opt.effects ?? neutralEffects(m);
  const noiseOn = opt.noise ?? true;
  const eventsOn = opt.events ?? true;
  const detail = opt.detail ?? false;
  const { n } = d;
  const { nb, nr, np, nh, ne } = m;
  const nl = nr + 1;
  const mc = opt.actuals ? Math.min(opt.actuals.lignes.length, d.moisClos || opt.actuals.lignes.length) : 0;
  const annual = new Float64Array(n);
  const monthly = new Float64Array(n * 12);
  const lines = detail ? new Float64Array(n * nl) : undefined;
  const buMargin = detail ? new Float64Array(n * nb) : undefined;
  const buCheck = detail ? new Float64Array(n) : undefined;
  const ml = opt.monthlyLines ? new Float64Array(n * 12 * nl) : undefined;

  const kFx = e.bumpFx ? 1.01 : 1;
  const fxOn = m.fxIndex >= 0 && d.fx.length > 0;
  const rub = new Float64Array(nr);
  const rubBU = new Float64Array(nr);
  const sL = new Float64Array(nr);
  const V = new Float64Array(nb);
  const P = new Float64Array(nb);
  const CAb = new Float64Array(nb);
  const val = new Float64Array(nh);
  const volBase = new Float64Array(nb);
  const priceBase = new Float64Array(nb);
  const mult = new Float64Array(np);
  const caTmp = new Float64Array(np);
  const occ = new Uint8Array(ne);
  const mon = new Int32Array(ne);
  const amp = new Float64Array(ne);
  const cost = new Float64Array(ne);
  const { pR, pB, pAss, pDev, pAmt, pCA, pHyps, pEvents, caPostes, volHyps, prixHyps, volEvents, evMask, evSign, evMonthly, evSurcoutR, caBud, caBudMonth, rubSign } = m;
  let boundHits = 0;
  let ratio = 1;

  /** Facteurs d'un poste : hypothèses, part en devises, événements et stress du mois. */
  const posteFactors = (x0: number, p: number, t: number): number => {
    let x = x0 * mult[p];
    const dv = pDev[p];
    if (dv > 0) x *= dv * ratio + (1 - dv);
    const pe = pEvents[p];
    for (let q = 0; q < pe.length; q++) {
      const k = pe[q];
      const f = e.forced[k];
      if (f) {
        if (evMonthly[k] ? t === f.from : t >= f.from) x *= 1 + evSign[k] * f.amp;
      } else if (occ[k] && (evMonthly[k] ? t === mon[k] : t >= mon[k])) {
        x *= 1 + evSign[k] * amp[k];
      }
    }
    for (let q = 0; q < e.posteShocks.length; q++) {
      const s = e.posteShocks[q];
      if (s.p === p && t >= s.from) x *= s.factor;
    }
    return x;
  };

  for (let i = 0; i < n; i++) {
    // Valeurs de l'itération, bornées par les leviers de plafond.
    for (let j = 0; j < nh; j++) {
      if (j === m.fxIndex) continue;
      let x = d.h[j][i];
      if (x > e.capMax[j]) x = e.capMax[j];
      if (x < e.capMin[j]) x = e.capMin[j];
      val[j] = x;
    }
    for (let b = 0; b < nb; b++) {
      let v = 1;
      const vh = volHyps[b];
      for (let q = 0; q < vh.length; q++) v *= val[vh[q]];
      volBase[b] = v;
      let pr = 1;
      const ph = prixHyps[b];
      for (let q = 0; q < ph.length; q++) pr *= val[ph[q]];
      priceBase[b] = pr;
    }
    for (let p = 0; p < np; p++) {
      let x = 1;
      const hs = pHyps[p];
      for (let q = 0; q < hs.length; q++) x *= val[hs[q]];
      mult[p] = x;
    }
    for (let k = 0; k < ne; k++) {
      occ[k] = eventsOn && d.occ[k][i] === 1 && !e.forced[k] ? 1 : 0;
      mon[k] = d.month[k][i];
      amp[k] = d.amp[k][i] * e.eventAmp[k];
      cost[k] = d.cost[k][i];
    }
    let hit = false;
    let sum = 0;
    sL.fill(0);
    if (detail) rubBU.fill(0);

    for (let t = 0; t < 12; t++) {
      let ebitda = 0;
      if (t < mc) {
        const a = opt.actuals!.lignes[t];
        ebitda = a[nr];
        for (let r = 0; r < nr; r++) sL[r] += a[r];
        if (ml) for (let r = 0; r < nl; r++) ml[(i * 12 + t) * nl + r] = a[r];
      } else {
        // Change : cours du mois, choc éventuel, couverture.
        ratio = 1;
        if (fxOn) {
          let fx = d.fx[i * 12 + t];
          if (e.fxShock && t >= e.fxShock.from) fx *= e.fxShock.factor;
          if (!(fx > 0)) hit = true;
          let rate = e.hedge ? e.hedge.part * e.hedge.cours + (1 - e.hedge.part) * fx : fx;
          rate *= kFx;
          ratio = rate / m.coursBudget;
        }
        // Volumes et prix des BU.
        let idx = 0;
        for (let b = 0; b < nb; b++) {
          let v = volBase[b];
          if (noiseOn) v *= 1 + d.noise[(i * nb + b) * 12 + t];
          for (let q = 0; q < volEvents.length; q++) {
            const k = volEvents[q];
            if (!evMask[k][b]) continue;
            const f = e.forced[k];
            if (f) {
              if (evMonthly[k] ? t === f.from : t >= f.from) v *= 1 + evSign[k] * f.amp;
            } else if (occ[k] && (evMonthly[k] ? t === mon[k] : t >= mon[k])) {
              v *= 1 + evSign[k] * amp[k];
            }
          }
          for (let q = 0; q < e.volShocks.length; q++) {
            const s = e.volShocks[q];
            if (t >= s.from && s.mask[b]) v *= s.factor;
          }
          let price = priceBase[b];
          for (let q = 0; q < e.prices.length; q++) {
            const pr = e.prices[q];
            if (t >= pr.from && pr.mask[b]) {
              price *= pr.factor;
              v *= pr.volume;
            }
          }
          if (v < 0) {
            hit = true;
            v = 0;
          }
          V[b] = v;
          P[b] = price;
          idx += caBud[b * 12 + t] * v;
        }
        let volIdx: number;
        if (caBudMonth[t] > 0) volIdx = idx / caBudMonth[t];
        else {
          volIdx = 0;
          for (let b = 0; b < nb; b++) volIdx += V[b] / nb;
        }

        // Chiffre d'affaires d'abord : les postes à assiette CA et les points de marge en dépendent.
        let caTot = 0;
        CAb.fill(0);
        for (let q = 0; q < caPostes.length; q++) {
          const p = caPostes[q];
          const b = pB[p];
          let x = pAmt[p * 12 + t];
          if (pAss[p] === ASS_VOLUME) x *= V[b];
          x *= P[b];
          x = posteFactors(x, p, t);
          caTmp[p] = x;
          CAb[b] += x;
          caTot += x;
        }

        rub.fill(0);
        for (let p = 0; p < np; p++) {
          let x: number;
          const b = pB[p];
          if (pCA[p]) x = caTmp[p];
          else {
            x = pAmt[p * 12 + t];
            if (pAss[p] === ASS_VOLUME) x *= b >= 0 ? V[b] : volIdx;
            else if (pAss[p] === ASS_CA) {
              if (b >= 0) x *= caBud[b * 12 + t] > 0 ? CAb[b] / caBud[b * 12 + t] : 1;
              else x *= caBudMonth[t] > 0 ? caTot / caBudMonth[t] : 1;
            }
            x = posteFactors(x, p, t);
          }
          rub[pR[p]] += x;
          if (detail && b >= 0) {
            buMargin![i * nb + b] += rubSign[pR[p]] * x;
            rubBU[pR[p]] += x;
          }
        }
        for (let q = 0; q < m.marge.length; q++) {
          const g = m.marge[q];
          let base = caTot;
          if (g.mask) {
            base = 0;
            for (let b = 0; b < nb; b++) if (g.mask[b]) base += CAb[b];
          }
          // Des points de marge en plus améliorent l'EBITDA, quelle que soit la rubrique d'arrivée (produit ou charge).
          rub[g.r] += rubSign[g.r] * (val[g.j] / 100) * base;
        }
        for (let k = 0; k < ne; k++) {
          const r = evSurcoutR[k];
          if (r < 0 || e.eventNoCost[k]) continue;
          const f = e.forced[k];
          if (f ? t === f.from : occ[k] && t === mon[k]) rub[r] += cost[k];
        }
        for (let r = 0; r < nr; r++) rub[r] += e.rubDelta[r * 12 + t];
        if (e.bump >= 0) rub[e.bump] *= 1.01;
        for (let r = 0; r < nr; r++) {
          ebitda += rubSign[r] * rub[r];
          sL[r] += rub[r];
        }
        if (ml) {
          const o = (i * 12 + t) * nl;
          for (let r = 0; r < nr; r++) ml[o + r] = rub[r];
          ml[o + nr] = ebitda;
        }

      }
      monthly[i * 12 + t] = ebitda;
      sum += ebitda;
    }
    annual[i] = sum;
    if (hit) boundHits++;
    if (lines) {
      const o = i * nl;
      for (let r = 0; r < nr; r++) lines[o + r] = sL[r];
      lines[o + nr] = sum;
    }
    if (detail) {
      // Les postes de BU, recomptés par rubrique : la somme des marges par BU doit la retrouver (C02).
      let c = 0;
      for (let r = 0; r < nr; r++) c += rubSign[r] * rubBU[r];
      buCheck![i] = c;
    }
  }
  return { n, nl, annual, monthly, lines, buMargin, buCheck, monthlyLines: ml, boundHits };
}
