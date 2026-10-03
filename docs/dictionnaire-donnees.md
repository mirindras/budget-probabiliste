# Dictionnaire des données

Modèles Excel de l'outil, format du jeu ALFA préchargé et générateur du jeu synthétique. Les montants sont stockés en MGA dans les fichiers Excel et affichés en GAr (milliards d'ariarys) ou MAr (millions) dans l'outil (R-IN-06).

Toutes les données ALFA sont synthétiques : société fictive, aucune donnée d'entreprise réelle (R-DS-01).

## 1. BUDGET_BASE.xlsx

Budget de base au grain mois × BU × canal × famille. Le modèle prérempli avec ALFA est dans `templates/` et se télécharge depuis l'outil (Exporter → Modèles Excel à remplir).

### Feuille PARAMETRES

| cle | Type | Règle |
| --- | --- | --- |
| libelle | texte | nom du budget, affiché dans le bandeau |
| exercice | entier | année budgétée |
| cours_budget_eur_mga | nombre > 0 | cours budget, en MGA pour 1 EUR (5 200 pour ALFA) |
| ebitda_publie_mga | nombre | EBITDA budgété publié, en MGA ; le budget importé doit le reproduire à 1 MAr près (R-IN-01) |
| part_variable_frais_commerciaux | entre 0 et 1 | part des frais commerciaux variable avec le CA (0,6 pour ALFA) |

### Feuille VENTES

Une ligne par mois × BU × canal × famille (432 lignes pour ALFA : 12 mois, 3 BU, 3 canaux, 4 familles).

| Colonne | Unité | Règle |
| --- | --- | --- |
| mois | entier | de 1 à 12, les 12 mois présents pour chaque BU (R-IN-04) |
| bu | texte | exactement 3 BU, dans l'ordre des hypothèses H01, H02, H03 (Boissons, Épicerie, Hygiène pour ALFA) |
| canal | texte | obligatoire (R-IN-03) |
| famille | texte | obligatoire (R-IN-03) |
| volume_cartons | cartons | ≥ 0 (R-IN-02) |
| prix_net_mga | MGA par carton, après remises | > 0 (R-IN-02) |
| cout_unitaire_mga | MGA par carton | ≥ 0 |
| part_importee | entre 0 et 1 | part du coût matière importée et payée en euros |

CA net = volume × prix net. Coût matière importé = volume × coût unitaire × part importée, valorisé au cours budget ; coût matière local = le reste.

### Feuille CHARGES

Une ligne par mois × poste, montants en MGA.

| poste | Ligne de P&L | Hypothèses qui le font varier |
| --- | --- | --- |
| carburant | Transport, flotte propre | volumes (indice de volume), E01, S3 |
| sous_traitance | Transport, sous-traitance | volumes, H09, L4 |
| autres_transport | Transport, autres | aucune |
| masse_salariale | Masse salariale | H10 |
| frais_commerciaux | Frais commerciaux | CA simulé (part variable), H11 |
| frais_generaux | Frais généraux | H12, L3, L5 |

Un poste inconnu est une ligne orpheline : l'import est bloqué (R-IN-03).

### Erreurs d'import

Chaque erreur est localisée par feuille et numéro de ligne Excel. Aucun calcul ne part tant qu'il en reste une (R-IN-08). Les CSV sont acceptés : un fichier par feuille, nommé d'après elle (PARAMETRES.csv, VENTES.csv, CHARGES.csv), déposés ensemble.

## 2. REGISTRE_HYPOTHESES.xlsx

Registre réimportable : l'outil l'exporte, on le réédite, on le redépose.

| Feuille | Colonnes |
| --- | --- |
| PARAMETRES | version, statut, n, graine, phi, sigma_mensuel, version_outil |
| HYPOTHESES | code (H01 à H12), libelle, proprietaire, unite, grain, p10, p50, p90, min, max, depart, derive_annuelle, volatilite_mensuelle, k, justification, statut |
| EVENEMENTS | code (E01 à E03), libelle, proprietaire, p, amplitude_min, amplitude_max, surcout_min_gar, surcout_max_gar, duree, cible, justification, statut |
| CORRELATIONS | a, b, correlation_rang (entre -0,9 et +0,9), justification |
| LEVIERS | code, libelle, description, hypotheses, regle, cout_gar, cout_libelle, mois_effet, proprietaire, faisabilite, parametres |
| STRESS | code, libelle, regle, mois_effet, parametres |

Règles de saisie :

- P10 < P50 < P90 strictement (R-HY-01) ; un propriétaire et une justification par ligne (principe 3) ; statut brouillon, valide ou gele.
- Laisser p50 vide pour une loi lognormale saisie par P10 et P90 (H07) ; renseigner min et max pour une loi PERT ; H06 se saisit par depart, derive_annuelle et volatilite_mensuelle.
- k est le coefficient d'élargissement issu du backtest, entre 1 et 2 (R-BT-03).
- La loi n'est pas saisie : elle découle de la table 5.3 de la SFD (normale si l'asymétrie est entre 0,9 et 1,1, split-normale sinon).
- `parametres` d'un levier : liste `cle=valeur` séparée par des points-virgules, par exemple `hausse=0.01; elasticite=-0.8`.

## 3. Résultats exportés (schéma en étoile)

| Table | Grain | Contenu |
| --- | --- | --- |
| SYNTHESE | indicateur | probabilité, P10, P50, P90, moyenne, écart-type, EaR 90, CVaR 10, P20, référence du run |
| FAIT_RESULTAT | run × itération × ligne de P&L | montant annuel en GAr |
| FAIT_EBITDA_MENSUEL | run × itération × mois | EBITDA mensuel en GAr |
| FAIT_TIRAGE | run × itération × hypothèse | valeur tirée (H06 : cours moyen ; événement : amplitude si survenu, sinon 0) |
| FAIT_PERCENTILE | run × cas × indicateur | indicateurs de la base, des leviers, des paquets et des stress tests |
| DIM_RUN, DIM_BU, DIM_TEMPS, DIM_LIGNE_PL, DIM_HYPOTHESE | dimension | référence du run, BU, mois et trimestres, lignes de P&L, hypothèses |
| LEVIERS_STRESS, CONTROLES, JOURNAL_RUNS | détail | comparatifs, voyants C01 à C12, runs de la session |

## 4. Jeu ALFA préchargé

`data/alfa/budget.json` et `data/alfa/registre.json` reprennent l'annexe F de la SFD, décimales au point, montants en GAr. Le budget compact (CA et coût matière par BU, saisonnalité mensuelle, charges annuelles) est décliné au grain BU × mois par `expandBudget` (règles F.2).

## 5. Générateur du jeu synthétique (R-DS-02)

`src/engine/synthetic.ts`, graines `SYNTH_SEED = 13` (années 2022 à 2026) et `SEED_2027 = 13` (réalisé 2027, flux séparé).

| Donnée | Génération | Paramètres |
| --- | --- | --- |
| Chocs mensuels 2022 à 2027 | normales corrélées selon la matrice cible du registre | 72 mois |
| Facteurs annuels réels des hypothèses | quantile de la loi vraie appliqué à la somme des 12 chocs mensuels divisée par √12 | lois du registre 2027, fourchettes élargies de K_VRAI = 1,5 |
| Volumes | facteur annuel × (1 + bruit AR(1) recentré) | φ = 0,6, σ = 3 % par mois ; niveau réel 1,5 % sous le P50 des propriétaires (biais d'optimisme) |
| Change EUR/MGA | marche aléatoire en logarithme, calée sur 5 100 en décembre 2026 | dérive 4 % par an, volatilité 1,8 % × 1,5 par mois |
| Événements | survenance si le choc annuel corrélé dépasse le quantile 1 - p ; mois et amplitude uniformes | probabilités du registre ; journal fourni |
| Budgets 2024 à 2026 | budget ALFA ramené à l'année (croissance de 9,2 % par an en valeur), cours budget = dernier cours connu + 2 % | EBITDA à 11,1 % du CA (R-DS-03) |
| Registres 2024 à 2026 | registre ALFA, départ du change au dernier cours connu | fourchettes volontairement trop étroites |
| Réalisé 2024 à 2027 | moteur P&L appliqué aux drivers réels | lignes mensuelles de P&L |

Ce que le backtest en retire (onglet Backtest) : couverture P10-P90 de 60 % sur 144 observations trimestrielles, k proposé de 1,51, biais des volumes Boissons (-1,6 %) et Épicerie (-2,0 %) au-delà du seuil de 1 %. Vérité connue (TC14) : 1 000 réalisés tirés du processus générateur tombent à 80 % entre le P10 et le P90 du moteur nourri des vrais paramètres.

Corrélations observées sur 60 mois et intervalles historiques équivalents (R-DE-03, R-HY-02) : calculés sur les chocs mensuels et les facteurs annuels 2022 à 2026, affichés dans l'onglet Registre.
