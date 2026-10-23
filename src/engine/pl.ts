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
  // Boucle chaude : listes et effets lus une fois, hors des itérations.
  const { forced, posteShocks, volShocks, prices, eventAmp, eventNoCost, capMax, capMin, rubDelta } = e;
  const marges = m.marge;
  /** Facteur de chaque poste pour le mois : hypothèses, part en devises, événements, stress. */
  const fP = new Float64Array(np);
  const devPostes = Int32Array.from({ length: np }, (_, p) => p).filter((p) => pDev[p] > 0);
  // Couples (poste, événement) des événements qui touchent un montant, à plat.
  const evP: number[] = [];
  const evK: number[] = [];
  for (let p = 0; p < np; p++) for (let q = 0; q < pEvents[p].length; q++) {
    evP.push(p);
    evK.push(pEvents[p][q]);
  }
  const nPairs = evP.length;
  // Nature de chaque ligne : chiffre d'affaires, ou charge et produit selon leur assiette.
  const K_CA = 0, K_FIXE = 1, K_VOL_BU = 2, K_VOL_ALL = 3, K_CA_BU = 4, K_CA_ALL = 5;
  const kind = Uint8Array.from({ length: np }, (_, p) =>
    pCA[p] ? K_CA : pAss[p] === ASS_VOLUME ? (pB[p] >= 0 ? K_VOL_BU : K_VOL_ALL) : pAss[p] === ASS_CA ? (pB[p] >= 0 ? K_CA_BU : K_CA_ALL) : K_FIXE);
  const caRatio = new Float64Array(nb);

  for (let i = 0; i < n; i++) {
    // Valeurs de l'itération, bornées par les leviers de plafond.
    for (let j = 0; j < nh; j++) {
      if (j === m.fxIndex) continue;
      let x = d.h[j][i];
      if (x > capMax[j]) x = capMax[j];
      if (x < capMin[j]) x = capMin[j];
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
      occ[k] = eventsOn && d.occ[k][i] === 1 && !forced[k] ? 1 : 0;
      mon[k] = d.month[k][i];
      amp[k] = d.amp[k][i] * eventAmp[k];
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
            const f = forced[k];
            if (f) {
              if (evMonthly[k] ? t === f.from : t >= f.from) v *= 1 + evSign[k] * f.amp;
            } else if (occ[k] && (evMonthly[k] ? t === mon[k] : t >= mon[k])) {
              v *= 1 + evSign[k] * amp[k];
            }
          }
          for (let q = 0; q < volShocks.length; q++) {
            const s = volShocks[q];
            if (t >= s.from && s.mask[b]) v *= s.factor;
          }
          let price = priceBase[b];
          for (let q = 0; q < prices.length; q++) {
            const pr = prices[q];
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

        // Facteur de chaque poste pour le mois : hypothèses, part en devises, événements sur montants, stress.
        for (let p = 0; p < np; p++) fP[p] = mult[p];
        for (let q = 0; q < devPostes.length; q++) {
          const p = devPostes[q];
          fP[p] *= pDev[p] * ratio + (1 - pDev[p]);
        }
        for (let q = 0; q < nPairs; q++) {
          const k = evK[q];
          const f = forced[k];
          if (f) {
            if (evMonthly[k] ? t === f.from : t >= f.from) fP[evP[q]] *= 1 + evSign[k] * f.amp;
          } else if (occ[k] && (evMonthly[k] ? t === mon[k] : t >= mon[k])) {
            fP[evP[q]] *= 1 + evSign[k] * amp[k];
          }
        }
        for (let q = 0; q < posteShocks.length; q++) {
          const s = posteShocks[q];
          if (t >= s.from) fP[s.p] *= s.factor;
        }

        // Chiffre d'affaires d'abord : les postes à assiette CA et les points de marge en dépendent.
        let caTot = 0;
        for (let b = 0; b < nb; b++) CAb[b] = 0;
        for (let q = 0; q < caPostes.length; q++) {
          const p = caPostes[q];
          const b = pB[p];
          let x = pAmt[p * 12 + t];
          if (pAss[p] === ASS_VOLUME) x *= V[b];
          x *= P[b] * fP[p];
          caTmp[p] = x;
          CAb[b] += x;
          caTot += x;
        }

        // Assiette chiffre d'affaires : rapport du chiffre d'affaires simulé au budget, par BU et pour l'entreprise.
        for (let b = 0; b < nb; b++) caRatio[b] = caBud[b * 12 + t] > 0 ? CAb[b] / caBud[b * 12 + t] : 1;
        const caRatioAll = caBudMonth[t] > 0 ? caTot / caBudMonth[t] : 1;
        for (let r = 0; r < nr; r++) rub[r] = 0;
        for (let p = 0; p < np; p++) {
          let x: number;
          const o = p * 12 + t;
          switch (kind[p]) {
            case K_CA: x = caTmp[p]; break;
            case K_FIXE: x = pAmt[o] * fP[p]; break;
            case K_VOL_BU: x = pAmt[o] * V[pB[p]] * fP[p]; break;
            case K_VOL_ALL: x = pAmt[o] * volIdx * fP[p]; break;
            case K_CA_BU: x = pAmt[o] * caRatio[pB[p]] * fP[p]; break;
            default: x = pAmt[o] * caRatioAll * fP[p];
          }
          rub[pR[p]] += x;
          if (detail && pB[p] >= 0) {
            buMargin![i * nb + pB[p]] += rubSign[pR[p]] * x;
            rubBU[pR[p]] += x;
          }
        }
        for (let q = 0; q < marges.length; q++) {
          const g = marges[q];
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
          if (r < 0 || eventNoCost[k]) continue;
          const f = forced[k];
          if (f ? t === f.from : occ[k] && t === mon[k]) rub[r] += cost[k];
        }
        for (let r = 0; r < nr; r++) rub[r] += rubDelta[r * 12 + t];
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
