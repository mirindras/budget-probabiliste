"""
Prototype de reference : budget probabiliste par simulation Monte Carlo (jeu ALFA Distribution).

Role : fournir les valeurs attendues de l'annexe F de la SFD. L'outil web doit les retrouver
(test TC16 : percentiles a +/- 0,05 GAr, probabilites a +/- 1 point, avec N = 10 000).

Donnees fictives. Montants en GAr (milliards d'ariarys). Dependances : numpy, scipy.
Lancer : python prototype_alfa.py
"""
import numpy as np
from scipy.stats import norm, qmc, spearmanr

Z90 = norm.ppf(0.9)
T = 12
BUDGET_EBITDA = 9.4

# ---- Budget de base ALFA 2027 (GAr) : Boissons, Epicerie, Hygiene ----
CA = np.array([40.0, 30.0, 15.0])
COGS = np.array([23.2, 18.9, 8.9])
IMP = np.array([0.30, 0.50, 0.60])            # part importee du cout matiere
SEAS = np.array([                             # saisonnalite : part mensuelle du CA et du cout matiere
    [0.095, 0.090, 0.085, 0.075, 0.070, 0.065, 0.065, 0.070, 0.080, 0.090, 0.100, 0.115],
    [0.080, 0.078, 0.080, 0.080, 0.082, 0.080, 0.080, 0.082, 0.085, 0.085, 0.088, 0.100],
    [0.082, 0.080, 0.083, 0.082, 0.083, 0.082, 0.083, 0.083, 0.084, 0.084, 0.085, 0.089]])
FUEL, ST, TR_OTH = 2.0, 2.6, 1.4              # transport : carburant, sous-traitance, autres
MS, FC, FC_VAR, FG = 10.5, 4.5, 0.6, 3.6      # masse salariale, frais commerciaux (60 % variables), frais generaux
FX_B = 5200.0                                 # cours budget EUR/MGA
CA_bt = CA[:, None] * SEAS
COGS_bt = COGS[:, None] * SEAS
CA_t = CA_bt.sum(0)
VOLW_t = CA_t / CA_t.sum()                    # poids mensuel du transport

# ---- Registre (P10, P50, P90) ; codes de la SFD entre parentheses ----
REG = {
    'H01': ('split', 0.955, 0.995, 1.025),   # H01 volume Boissons
    'H02': ('split', 0.965, 1.000, 1.025),   # H02 volume Epicerie
    'H03': ('split', 0.960, 1.000, 1.040),   # H03 volume Hygiene
    'H04': ('split', 0.990, 1.000, 1.005),   # H04 prix net realise
    'H05': ('split', -0.4, 0.0, 0.4),        # H05 mix, en points de marge brute
    'H07': ('logn', 0.980, None, 1.025),     # H07 prix d'achat importes (EUR)
    'H08': ('split', 0.990, 1.000, 1.020),   # H08 prix d'achat locaux
    'H09': ('split', 0.995, 1.010, 1.040),   # H09 tarifs transporteurs
    'H10': ('split', 0.995, 1.000, 1.015),   # H10 masse salariale
    'H11': ('split', 0.970, 1.000, 1.040),   # H11 frais commerciaux
    'H12': ('split', 0.990, 1.000, 1.030),   # H12 frais generaux
}
FXP = dict(S0=5100.0, drift=0.04, sm=0.018)   # H06 change : depart, derive annuelle, volatilite mensuelle
EV = dict(E01=dict(p=0.35, lo=0.08, hi=0.15),                        # revision du prix du carburant
          E02=dict(p=0.15, lo=0.04, hi=0.08),                        # perte d'un grand compte GMS
          E03=dict(p=0.25, lo=0.15, hi=0.25, c_lo=0.03, c_hi=0.06))  # retard de navire (effet bateau)
ORDER = ['H06', 'H01', 'H02', 'H03', 'H04', 'H05', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'E01', 'E02', 'E03']


def spearman_target():
    d = len(ORDER); R = np.eye(d); ix = {k: i for i, k in enumerate(ORDER)}
    def s(a, b, v): R[ix[a], ix[b]] = R[ix[b], ix[a]] = v
    s('H06', 'H08', 0.4); s('H06', 'E01', 0.5); s('H06', 'H09', 0.4); s('H06', 'H10', 0.2); s('H06', 'H12', 0.3)
    for v in ['H01', 'H02', 'H03']:
        s('H06', v, -0.2); s('H04', v, -0.3)
    s('H01', 'H02', 0.5); s('H01', 'H03', 0.4); s('H02', 'H03', 0.5)
    s('E01', 'H09', 0.6); s('H08', 'H12', 0.3); s('H11', 'H01', -0.3); s('H11', 'H02', -0.3)
    return R


def quantile(kind, a, b, c, z):
    if kind == 'split':                        # split-normale : P50 + sigma gauche ou droite
        sl, sr = (b - a) / Z90, (c - b) / Z90
        return np.where(z < 0, b + sl * z, b + sr * z)
    if kind == 'logn':                         # lognormale definie par P10 et P90
        med = np.sqrt(a * c); s = np.log(c / a) / (2 * Z90)
        return med * np.exp(s * z)
    raise ValueError(kind)


def draw(N, seed):
    rng = np.random.default_rng(seed)
    d = len(ORDER)
    R = 2 * np.sin(np.pi * spearman_target() / 6); np.fill_diagonal(R, 1)   # rang -> copule
    L = np.linalg.cholesky(R)
    E = norm.ppf(qmc.LatinHypercube(d=d, seed=rng).random(N))              # hypercube latin
    z_fx = E[:, 0]                                                          # choc annuel du change
    w = (T - np.arange(T)) / T
    wh = w / np.linalg.norm(w)
    eta = rng.standard_normal((N, T))
    eps = z_fx[:, None] * wh[None] + (eta - (eta @ wh)[:, None] * wh[None])  # chocs mensuels conditionnels
    Z = E @ L.T
    D = {k: Z[:, i] for i, k in enumerate(ORDER)}
    X = {k: quantile(kind, a, b, c, D[k]) for k, (kind, a, b, c) in REG.items()}
    lnS = np.log(FXP['S0']) + FXP['drift'] / 12 * np.arange(1, T + 1) + FXP['sm'] * np.cumsum(eps, axis=1)
    X['H06_trajectoire'] = np.exp(lnS)
    for k in ['E01', 'E02', 'E03']:
        X[k + '_on'] = norm.cdf(D[k]) > 1 - EV[k]['p']                      # survenance : quantile superieur
        X[k + '_m'] = rng.integers(0, T, N)
        X[k + '_a'] = rng.uniform(EV[k]['lo'], EV[k]['hi'], N)
    X['E03_c'] = rng.uniform(EV['E03']['c_lo'], EV['E03']['c_hi'], N)
    phi, sm = 0.6, 0.03                                                     # bruit AR(1) des volumes
    noise = np.zeros((N, 3, T)); e = rng.standard_normal((N, 3, T))
    noise[:, :, 0] = e[:, :, 0] * sm
    for t in range(1, T):
        noise[:, :, t] = phi * noise[:, :, t - 1] + np.sqrt(1 - phi ** 2) * sm * e[:, :, t]
    noise -= (noise * SEAS[None]).sum(2, keepdims=True)                     # recentrage sur la saisonnalite
    X['eta'] = noise
    X['_Z'] = Z; X['_eig'] = np.linalg.eigvalsh(R)
    return X


def pl(X, lever=frozenset(), stress=frozenset(), noise=True, events=True):
    """EBITDA mensuel par iteration (N x 12). Leviers L1 a L5, stress S1 a S3 (SFD section 10)."""
    N = X['H01'].shape[0]; t = np.arange(T)
    vol = np.stack([X['H01'], X['H02'], X['H03']], 1)[:, :, None] * np.ones((1, 1, T))
    if noise:
        vol = vol * (1 + X['eta'])
    if events:
        s2 = 'S2' in stress
        on1 = X['E02_on'] | s2
        m1 = np.where(s2, 3, X['E02_m']); a1 = np.where(s2, 0.12, X['E02_a'])
        hit = (t[None] >= m1[:, None]) & on1[:, None]
        vol[:, 0] *= np.where(hit, 1 - a1[:, None], 1); vol[:, 1] *= np.where(hit, 1 - a1[:, None], 1)
        hit2 = (t[None] == X['E03_m'][:, None]) & X['E03_on'][:, None]
        red = 0.25 if 'L5' in lever else 1.0
        vol[:, 1] *= np.where(hit2, 1 - red * X['E03_a'][:, None], 1)
        vol[:, 2] *= np.where(hit2, 1 - red * X['E03_a'][:, None], 1)
    price = X['H04'][:, None, None] * np.ones((1, 3, T))
    if 'L2' in lever:                                                       # +1 % Epicerie et Hygiene des avril
        price[:, 1:, 3:] *= 1.01; vol[:, 1:, 3:] *= (1 - 0.008)
    ca = CA_bt[None] * vol * price
    fx = X['H06_trajectoire'].copy()
    if 'S1' in stress:
        fx[:, 3:] *= 1.15
    fxr = fx / FX_B
    fxr_imp = 0.5 * fxr + 0.5 * (5250 / FX_B) if 'L1' in lever else fxr
    unit = IMP[None, :, None] * fxr_imp[:, None, :] * X['H07'][:, None, None] + (1 - IMP[None, :, None]) * X['H08'][:, None, None]
    cogs = COGS_bt[None] * vol * unit
    mix = X['H05'][:, None] / 100 * ca.sum(1)
    volidx = (CA_bt[None] * vol).sum(1) / CA_t[None]
    fuelf = np.ones((N, T))
    if events:
        hitf = (t[None] >= X['E01_m'][:, None]) & X['E01_on'][:, None]
        fuelf = np.where(hitf, 1 + X['E01_a'][:, None], 1.0)
    if 'S3' in stress:
        fuelf = fuelf * np.where(t[None] >= 3, 1.25, 1.0)
    stf = X['H09'][:, None] * np.ones((1, T))
    if 'L4' in lever:
        stf = np.minimum(stf, 1.03)
    tr = FUEL * VOLW_t[None] * volidx * fuelf + ST * VOLW_t[None] * volidx * stf + TR_OTH / 12
    if events and 'L5' not in lever:
        tr = tr + np.where((t[None] == X['E03_m'][:, None]) & X['E03_on'][:, None], X['E03_c'][:, None], 0)
    ms = MS / 12 * X['H10'][:, None] * np.ones((1, T))
    fc = FC * (FC_VAR * ca.sum(1) / CA.sum() + (1 - FC_VAR) / 12) * X['H11'][:, None]
    fg = FG / 12 * X['H12'][:, None] * np.ones((1, T))
    if 'L3' in lever:
        fg[:, 3:] -= 0.25 / 12; fg[:, 0] += 0.05
    if 'L5' in lever:
        fg = fg + 0.16 / 12
    return ca.sum(1) - cogs.sum(1) + mix - tr - ms - fc - fg


def stats(e):
    s = np.sort(e); n = len(e)
    p10, p50, p90 = np.percentile(e, [10, 50, 90])
    return dict(p10=p10, p50=p50, p90=p90, moyenne=e.mean(), probabilite=(e >= BUDGET_EBITDA).mean(),
                ear90=p50 - p10, cvar10=s[:n // 10].mean())


def deterministe(median=True):
    """C01 (median=False) : tout au budget. median=True : hypotheses a leur P50, change sur sa trajectoire mediane."""
    X = draw(2, 1)
    for k, (kind, a, b, c) in REG.items():
        if median:
            X[k] = np.full(2, np.sqrt(a * c) if kind == 'logn' else b)
        else:
            X[k] = np.full(2, 0.0 if k == 'H05' else 1.0)
    X['H06_trajectoire'] = (np.exp(np.log(FXP['S0']) + FXP['drift'] / 12 * np.arange(1, T + 1))[None].repeat(2, 0)
                if median else np.full((2, T), FX_B))
    return pl(X, noise=False, events=False).sum(1)[0]


if __name__ == '__main__':
    N, SEED = 10_000, 2027
    print(f"C01 reconciliation (attendu 9,400) : {deterministe(False):.4f} GAr")
    print(f"Hypotheses au P50, sans alea      : {deterministe(True):.4f} GAr")
    X = draw(N, SEED)
    base = stats(pl(X).sum(1))
    print("\nBase (N = 10 000, graine 2027)")
    for k, v in base.items():
        print(f"  {k:12s} {100 * v:6.1f} %" if k == 'probabilite' else f"  {k:12s} {v:7.3f} GAr")
    print("\nLeviers et stress : probabilite d'atteinte et P50")
    cas = [('L1', {'L1'}, set()), ('L2', {'L2'}, set()), ('L3', {'L3'}, set()), ('L4', {'L4'}, set()),
           ('L5', {'L5'}, set()), ('Paquet A = L2 + L3', {'L2', 'L3'}, set()),
           ('Paquet B = L1 + L2 + L3', {'L1', 'L2', 'L3'}, set()),
           ('S1', set(), {'S1'}), ('S2', set(), {'S2'}), ('S3', set(), {'S3'}), ('S1 + S3', set(), {'S1', 'S3'})]
    for nom, lev, st in cas:
        s = stats(pl(X, lever=frozenset(lev), stress=frozenset(st)).sum(1))
        print(f"  {nom:24s} probabilite {100 * s['probabilite']:5.1f} %   P50 {s['p50']:.3f} GAr   EaR {s['ear90']:.3f}")
    emp = np.array(spearmanr(X['_Z']).correlation)
    print(f"\nC03 ecart maximal des correlations de rang : {np.abs(emp - spearman_target()).max():.3f}")
    print(f"C04 plus petite valeur propre              : {X['_eig'].min():.3f}")
    print(f"C10 frequences E01 / E02 / E03              : {100 * X['E01_on'].mean():.1f} % / {100 * X['E02_on'].mean():.1f} % / {100 * X['E03_on'].mean():.1f} %")
