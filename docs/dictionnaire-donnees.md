# Dictionnaire des données

Modèles Excel de l'outil, format du scénario, jeu ALFA préchargé et générateur du jeu synthétique. Les montants se saisissent dans l'unité choisie par l'entreprise (k€, M€, GAr…) et s'affichent dans cette unité ; les petits écarts s'affichent en millièmes d'unité (€ pour un budget en k€, MAr pour ALFA, R-IN-06).

Toutes les données ALFA sont synthétiques : société fictive, aucune donnée d'entreprise réelle (R-DS-01).

## 1. BUDGET_BASE.xlsx : la structure du P&L et son budget

Le modèle prérempli avec le budget en cours se télécharge depuis l'outil (Fichiers → Télécharger les modèles Excel à remplir) ; celui d'ALFA est dans `templates/`. Les en-têtes de colonnes acceptent accents et majuscules (« Février » vaut `fevrier`).

### Feuille PARAMETRES

| cle | Type | Règle |
| --- | --- | --- |
| libelle | texte | nom du budget, affiché dans le bandeau |
| exercice | entier | année budgétée |
| unite | texte | unité des montants de la feuille POSTES : k€, M€, GAr… |
| unite_detail | texte | un millième de l'unité (€ pour k€, MAr pour GAr), pour les petits écarts ; déduite de l'unité si vide |
| unite_libelle | texte | l'unité en toutes lettres, pour les pieds de page (« milliers d'euros ») |
| ebitda_publie | nombre | EBITDA budgété publié ; le budget importé doit le retrouver à un millième d'unité près (R-IN-01) |
| devise | texte | devise étrangère, si des postes sont payés en devises (EUR pour ALFA) |
| monnaie_locale | texte | monnaie des comptes (MGA pour ALFA) |
| cours_budget | nombre > 0 | unités de monnaie locale pour 1 unité de devise (5 200 pour ALFA) ; obligatoire dès qu'un poste a une part en devises |

### Feuille RUBRIQUES

Les lignes du P&L de gestion jusqu'à l'EBITDA, dans l'ordre d'affichage. L'EBITDA est la somme des produits moins la somme des charges.

| Colonne | Règle |
| --- | --- |
| code | unique ; lettres, chiffres, `_ - . +`, 24 caractères au plus |
| libelle | affiché dans l'outil |
| nature | `ca` (chiffre d'affaires), `produit` (autre produit) ou `charge` ; au moins une rubrique `ca` |

### Feuille POSTES

Une ligne par poste budgétaire, montants positifs : le signe vient de la rubrique.

| Colonne | Règle |
| --- | --- |
| code | unique ; c'est lui que citent les hypothèses et les événements |
| libelle | affiché dans l'outil |
| rubrique | code d'une rubrique de la feuille RUBRIQUES (R-IN-03) |
| bu | BU du poste ; vide pour un poste commun à l'entreprise. Un poste de chiffre d'affaires a toujours une BU. Les BU de l'entreprise sont celles qui apparaissent dans cette colonne |
| assiette | `fixe` : le montant ne dépend pas de l'activité ; `volume` : il suit le volume de sa BU (ou l'activité de l'entreprise pour un poste commun) ; `ca` : il suit le chiffre d'affaires simulé. Par défaut : `volume` pour un poste de chiffre d'affaires, `fixe` sinon |
| part_devises | de 0 à 1 : la part du montant payée en devises, exposée au change (1 pour un achat importé) |
| janvier … decembre | douze montants numériques (R-IN-04) ; un chiffre d'affaires ne peut pas être négatif |

Comment une hypothèse agit sur un poste : un volume multiplie le chiffre d'affaires de sa BU et les postes à assiette volume ; le chiffre d'affaires simulé entraîne les postes à assiette `ca` ; un facteur de poste multiplie les postes visés ; le change multiplie la part en devises par le rapport du cours simulé au cours budget.

### Format détaillé d'un distributeur (version 1)

L'ancien modèle reste accepté et se convertit dans le modèle ci-dessus (`templates/BUDGET_BASE_DETAILLE.xlsx`, prérempli avec ALFA) : PARAMETRES (`cours_budget_eur_mga`, `ebitda_publie_mga`, `part_variable_frais_commerciaux`), VENTES au grain mois × BU × canal × famille (volume, prix net, coût unitaire, part importée, en MGA) et CHARGES au grain mois × poste (carburant, sous_traitance, autres_transport, masse_salariale, frais_commerciaux, frais_generaux). L'import contrôle le grain (chaque combinaison BU × canal × famille présente une fois chaque mois), l'agrège au grain BU × mois et le convertit en sept rubriques : CA net, coût matière (importé et local, par BU), effet mix, transport, masse salariale, frais commerciaux, frais généraux.

### Erreurs d'import

Chaque erreur est localisée par feuille et numéro de ligne Excel. Aucun calcul ne part tant qu'il en reste une (R-IN-08). Les CSV sont acceptés : un fichier par feuille, nommé d'après elle (PARAMETRES.csv, RUBRIQUES.csv, POSTES.csv), déposés ensemble. Fichiers, feuilles et lignes sont bornés avant lecture (voir SECURITY.md).

À l'import d'un budget, le registre en cours est conservé s'il ne cite que des BU, rubriques et postes de ce budget ; sinon un registre de départ le remplace : une hypothèse de volume par BU, une de prix, une par rubrique de charges, le change s'il y a des postes en devises, une baisse d'activité et un choc de change en stress tests, tout en brouillon.

## 2. REGISTRE_HYPOTHESES.xlsx : ce qui fait varier le budget

Registre réimportable : l'outil l'exporte, on le réédite, on le redépose. Les feuilles HYPOTHESES et EVENEMENTS donnent la liste complète : une ligne ajoutée est une entrée de plus, une ligne supprimée une entrée de moins. Leviers, stress tests et paquets sont remplacés quand leur feuille est présente.

| Feuille | Colonnes |
| --- | --- |
| REFERENTIEL | type (bu, rubrique, poste), code, libelle, detail : ce que la colonne `porte_sur` peut citer (lecture seule) |
| GUIDE | code, libelle, question, qui_repond, sources, piege : la question à poser au propriétaire de chaque entrée (lecture seule) |
| PARAMETRES | version, statut, n, graine, phi, sigma_mensuel, postes_certains, version_outil |
| HYPOTHESES | code, libelle, famille, effet, porte_sur, proprietaire, unite, grain, p10, p50, p90, min, max, depart, derive_annuelle, volatilite_mensuelle, k, justification, statut |
| EVENEMENTS | code, libelle, famille, effet, sens, porte_sur, proprietaire, p, amplitude_min, amplitude_max, duree, surcout_min, surcout_max, rubrique_surcout, cible, justification, statut |
| CORRELATIONS | a, b, correlation_rang (entre -0,9 et +0,9), justification |
| REVUE_RISQUES | categorie (R01 à R16), libelle, question, decision (couvert, stress, non-significatif, hors-modele, ou vide), reference, commentaire. Facultative |
| LEVIERS | code, libelle, type, porte_sur, description, hypotheses, regle, cout, cout_libelle, mois_effet, proprietaire, faisabilite, parametres |
| STRESS | code, libelle, type, porte_sur, regle, mois_effet, parametres |
| PAQUETS | code, libelle, composition (codes de leviers ou de stress tests séparés par des points-virgules) |

### Effet d'une hypothèse

| effet | Saisie | Agit sur |
| --- | --- | --- |
| volume | facteur, 1 = budget | volumes des BU visées : chiffre d'affaires et postes qui suivent l'activité |
| prix | facteur | prix de vente net des BU visées : chiffre d'affaires seulement |
| poste | facteur | montant des postes visés (une rubrique entière ou des postes choisis) |
| change | depart, derive_annuelle, volatilite_mensuelle | cours de la devise en marche aléatoire, appliqué à la part en devises de chaque poste ; une seule hypothèse de change par registre |
| marge | points de marge, 0 = budget | points de marge sur le chiffre d'affaires des BU visées, comptés dans la rubrique citée (un point de plus améliore toujours l'EBITDA) |

### Effet d'un événement

`effet` : `volume` (volumes des BU visées) ou `poste` (montant des postes visés) ; `sens` : `baisse` ou `hausse` de l'amplitude tirée ; `duree` : `fin` (jusqu'à la fin de l'exercice) ou `mois` (le mois de survenance). Un surcoût ponctuel se compte le mois de survenance dans une rubrique de charge (`rubrique_surcout`).

### Colonne porte_sur

Une ou plusieurs parties séparées par « ; » : `bu: Boissons, Epicerie`, `postes: CARBURANT, SOUS_TRAITANCE`, `rubrique: FG`, `hypothese: H09`, `evenement: E03`. Vide : toute l'entreprise. Chaque nom cité doit exister dans le budget ou le registre ; sinon l'import est refusé avec la feuille et le nom fautif.

### Leviers et stress tests

| type de levier | parametres | porte_sur |
| --- | --- | --- |
| couverture | part, cours | (aucune) : part de l'exposition au change à cours garanti |
| prix | hausse, elasticite | BU visées |
| montant | variationAnnuelle (négative pour une économie) | rubrique ; le coût direct, unique, est compté en janvier |
| plafond | plafond, et plancher si besoin | hypothèse plafonnée |
| attenuation | reduction, coutAnnuel | événement atténué et rubrique où le coût annuel est compté |

| type de stress test | parametres | porte_sur |
| --- | --- | --- |
| change | choc (+15 % = 0,15 au-dessus de la trajectoire simulée) | (aucune) |
| evenement | choc (amplitude imposée) | événement forcé |
| poste | choc | postes ou rubrique en hausse |
| volume | choc | BU dont les volumes baissent |

`parametres` : liste `cle=valeur` séparée par des points-virgules, par exemple `hausse=0.01; elasticite=-0.8`. Un levier sans coût direct, sans mois d'effet ou sans propriétaire est refusé (R-LE-02).

### Règles de saisie

- P10 < P50 < P90 strictement (R-HY-01) ; un propriétaire et une justification par ligne (principe 3) ; statut brouillon, valide ou gele.
- Laisser p50 vide pour une loi lognormale saisie par P10 et P90 ; renseigner min et max pour une loi PERT ; le change se saisit par depart, derive_annuelle et volatilite_mensuelle.
- k est le coefficient d'élargissement issu du backtest, entre 1 et 2 (R-BT-03).
- La loi n'est pas saisie : elle découle de la table 5.3 de la SFD (normale si l'asymétrie est entre 0,9 et 1,1, split-normale sinon).
- `postes_certains` (feuille PARAMETRES) : postes confirmés sans incertitude, que la saisie guidée ne signale plus comme non couverts.
- Revue des risques : chaque famille reçoit une décision ; `reference` cite l'hypothèse, l'événement ou le stress qui la couvre ; `commentaire` explique un risque non significatif ou hors modèle. Les risques hors modèle sont nommés dans la note CODIR.
- Un registre de la version 1, sans colonnes `effet` ni `porte_sur`, est relu avec les effets et portées d'ALFA.

## 3. Scénario : lien de partage, brouillon, fichier

Le scénario (format `schemaVersion` 2) réunit le registre, les leviers, les stress tests, les paquets, les actions cochées, N, la graine et le nombre de mois clos. Il voyage dans le lien de partage pour ALFA, dans un fichier Excel pour un budget importé (le budget ne part jamais dans un lien, R-RE-07), et se garde en brouillon sur le poste. Un lien ou un brouillon de la version 1 est converti à la lecture ; sa structure est contrôlée avant tout calcul, puis ses références au budget.

## 4. Résultats exportés (schéma en étoile)

| Table | Grain | Contenu |
| --- | --- | --- |
| SYNTHESE | indicateur | probabilité, P10, P50, P90, moyenne, écart-type, EaR 90, CVaR 10, P20, référence du run, dans l'unité du budget |
| FAIT_RESULTAT | run × itération × ligne de P&L | montant annuel de chaque rubrique, puis l'EBITDA |
| FAIT_EBITDA_MENSUEL | run × itération × mois | EBITDA mensuel |
| FAIT_TIRAGE | run × itération × hypothèse | valeur tirée (change : cours moyen ; événement : amplitude si survenu, sinon 0) |
| FAIT_PERCENTILE | run × cas × indicateur | indicateurs de la base, des leviers, des paquets et des stress tests |
| DIM_RUN, DIM_BU, DIM_TEMPS, DIM_LIGNE_PL, DIM_HYPOTHESE | dimension | référence du run et unité, BU, mois et trimestres, rubriques du P&L, hypothèses et événements avec leur famille et leur effet |
| LEVIERS_STRESS, CONTROLES, JOURNAL_RUNS | détail | comparatifs, voyants C01 à C12, runs de la session |

## 5. Jeu ALFA préchargé

`data/alfa/budget.json` et `data/alfa/registre.json` reprennent l'annexe F de la SFD, décimales au point, montants en GAr. Le budget compact (CA et coût matière par BU, saisonnalité mensuelle, charges annuelles) est décliné au grain BU × mois (règles F.2), puis converti en rubriques et postes (`legacy.ts`) : ALFA est une configuration du modèle générique parmi d'autres. Chaque hypothèse du registre porte sa famille, son effet et sa portée ; le poste « autres frais de transport » est confirmé certain.

## 6. Générateur du jeu synthétique (R-DS-02)

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
