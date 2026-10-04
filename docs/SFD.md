# SFD : Budget probabiliste par simulation Monte Carlo

Sep 30, 2026 · @SOLOFONIAINA ANJARA MIRINDRA

## Fiche document

Le projet remplace l'EBITDA budgété à chiffre unique par une distribution de résultats : probabilité de tenir le budget, perte possible en scénario défavorable, hypothèses qui portent le risque, leviers qui le réduisent.

| Rubrique | Contenu |
| --- | --- |
| Projet | Budget probabiliste par simulation Monte Carlo (projet de démonstration FP&A) |
| Document | Spécifications Fonctionnelles Détaillées (SFD) |
| Livrable | Outil web ouvert par un simple lien : aucune installation, calcul dans le navigateur, aucune donnée transmise à un serveur |
| Version | 1.1 : stack web retenue, soumise à validation |
| Auteur | Mirindra SOLOFONIAINA |
| Données | Société fictive ALFA Distribution, données synthétiques, aucune donnée d'entreprise réelle |
| Référence de calcul | Prototype Python ALFA ; données exactes et valeurs attendues en annexe F |
| Unités | Montants en GAr (milliards d'ariarys) et MAr (millions), probabilités au point près dans les analyses, arrondies à 5 points dans la note CODIR |
| Convention Px | Px = x-ième percentile : P10 défavorable, P90 favorable |
| Correspondance | Le tableau de la section 3 renvoie chaque module M1 à M10 à sa section détaillée |

## 1. Objet et contexte

Le budget annuel fixe un EBITDA sans dire quelle chance on a de l'atteindre. Ce moteur répond à cette question et aux trois autres que se pose un CODIR.

### 1.1 Problème adressé

Le budget classique produit un chiffre unique. Il ne dit rien de la probabilité de l'atteindre, de l'amplitude des écarts possibles, ni des hypothèses qui concentrent le risque.

Les scénarios « bas » et « haut » habituels appliquent ±10 % à toutes les hypothèses. Ils supposent que tout dérape en même temps, ce qui est improbable. Ils ignorent aussi les hypothèses qui dérapent ensemble : change, matières importées, carburant.

### 1.2 Objectifs : quatre questions CODIR

| N° | Question | Indicateur de réponse |
| --- | --- | --- |
| Q1 | Quelle est la probabilité d'atteindre l'EBITDA budgété ? | Probabilité d'atteinte |
| Q2 | Dans un scénario défavorable à 1 chance sur 10, combien perd-on ? | EBITDA-at-Risk 90 (P50 moins P10) |
| Q3 | Quelles hypothèses expliquent l'essentiel du risque ? | Contribution à la variance, effets isolé et total |
| Q4 | Quelles actions améliorent le plus la probabilité, et à quel coût ? | Gain en points de probabilité et variation de l'EaR, nets du coût du levier |

### 1.3 Périmètre

- **Inclus (V1)** : P&L de gestion jusqu'à l'EBITDA, budget N+1 mensualisé sur 12 mois, 3 business units, 3 canaux, simulation, analyses de risque, leviers, backtest, restitution, le tout dans un outil web ouvert par lien.
- **Inclus (V2, option)** : cash-flow opérationnel et BFR (DSO, DIO, DPO), probabilité de passer sous un seuil de trésorerie.
- **Exclu** : bilan complet, fiscalité, consolidation statutaire, optimisation automatique des leviers, fixation des objectifs.

### 1.4 Cadre de démonstration

Le projet tourne sur une société fictive, ALFA Distribution : distributeur agroalimentaire à Madagascar, ventes en ariary, matières en partie importées et payées en euros, livraisons en flotte propre et sous-traitée. Aucune donnée réelle n'est utilisée : modèle et résultats sont publiables.

| Paramètre | Valeur illustrative |
| --- | --- |
| CA net budgété 2027 | 85 GAr |
| EBITDA budgété 2027 | 9,4 GAr (11,1 % du CA) |
| Business units | Boissons, Épicerie, Hygiène |
| Canaux | GMS, Grossistes, Traditionnel |
| Familles de produits | 4 par business unit |
| Historique synthétique | 60 mois de réalisé, 3 budgets passés |

### 1.5 Acteurs et rôles

| Acteur | Rôle | Ce qu'il fournit ou reçoit |
| --- | --- | --- |
| CFO | Commanditaire | Reçoit la note CODIR, arbitre le niveau de risque accepté |
| FP&A, contrôle de gestion | Propriétaire du modèle et de l'hypothèse de mix | Construit, calibre, lance, analyse |
| Directeurs commerciaux | Propriétaires volumes, prix, perte de grands comptes | Fourchettes P10 / P50 / P90 argumentées |
| Achats et supply chain | Propriétaires prix d'achat, transport, carburant, retards d'approvisionnement | Fourchettes et événements de risque |
| Trésorerie | Propriétaire du change | Paramètres de la trajectoire EUR/MGA |
| RH, marketing, DAF | Propriétaires masse salariale, frais commerciaux, frais généraux | Fourchettes argumentées |
| CODIR | Instance de décision | Arbitre les leviers |
| Relecteur indépendant | Revue du modèle | Valide contrôles et backtest |

## 2. Principes directeurs

Neuf règles fondent la crédibilité du modèle et de l'outil. Une version qui en enfreint une n'est pas présentable.

1. **Le budget reste l'objectif.** Le moteur mesure l'exigence du budget, il ne le remplace pas. Avec toutes les hypothèses à leur valeur budgétée, il reproduit l'EBITDA budgété à 1 MAr près (contrôle C01).
2. **Les métiers donnent des fourchettes, le FP&A choisit les lois.** Chaque propriétaire fournit P10, P50, P90 et une justification écrite. La traduction statistique relève du FP&A (annexe B).
3. **Une hypothèse, un propriétaire, une source.** Une hypothèse sans propriétaire nommé ni justification n'entre pas dans la simulation.
4. **Les dépendances sont explicites.** Corrélations et dynamiques mensuelles sont saisies, justifiées et testées. L'indépendance entre deux hypothèses est une hypothèse comme une autre : elle se justifie.
5. **Tout résultat est reproductible.** Même budget, même registre, même graine : même résultat, au bit près dans un même navigateur. Chaque résultat porte sa référence de run, et le lien de partage suffit à le rejouer.
6. **Le modèle est jugé sur son passé.** Aucune restitution au CODIR sans backtest sur les budgets antérieurs (section 11).
7. **La précision affichée est la précision réelle.** Probabilités arrondies à 5 points dans la note CODIR, montants à 0,1 GAr, limites du modèle écrites sur la note.
8. **Les comparaisons se font à aléa commun.** Leviers et stress tests réutilisent les tirages de la base : l'écart mesure l'action, pas le bruit de simulation.
9. **L'outil se transmet par un lien.** Aucune installation, aucun compte, aucune donnée envoyée à un serveur. Un utilisateur non technique obtient la probabilité d'atteinte en moins de 2 minutes, sans aide.

## 3. Architecture fonctionnelle

Dix modules répartis en quatre étages (préparer, simuler, analyser, restituer), sous le contrôle permanent de M9. Le backtest (M8) boucle sur le registre : il élargit les fourchettes avant la simulation suivante.

&#91;embedded content: flux des modules M1 à M10 · boucle de calibration du backtest\]

| Module | Rôle | Entrées | Sorties | Détail |
| --- | --- | --- | --- | --- |
| M1 Données | Import et contrôle du budget, de l'historique, des référentiels | Budget mensualisé, 60 mois de réalisé | Tables de base figées | Section 4 |
| M2 Registre des hypothèses | Recueil P10 / P50 / P90, choix de la loi | Ateliers avec les propriétaires | Registre versionné | Section 5 |
| M3 Dépendances | Corrélations et dynamiques mensuelles | Registre, historique | Matrice validée, paramètres de processus | Section 6 |
| M4 Simulation | Tirages LHS, copule, trajectoires mensuelles | M2, M3, graine, N | Cube des tirages | Section 7 |
| M5 Moteur P&L | Recalcul du P&L à chaque itération | Budget de base, cube des tirages | Cube des résultats | Section 8 |
| M6 Analyses de risque | Percentiles, probabilité, EaR, attribution | Cube des résultats | Indicateurs, profils de scénarios | Section 9 |
| M7 Leviers et scénarios | Stress tests et leviers à aléa commun | Définitions, tirages de la base | Comparatifs | Section 10 |
| M8 Backtest | Rejeu des budgets passés, calibration | Budgets, registres et réalisés passés | Coefficients de calibration | Section 11 |
| M9 Contrôles | Contrôles bloquants, journal des runs | Sorties de tous les modules | Rapport de contrôle | Section 12 |
| M10 Restitution | Note CODIR, tableau de bord | M6, M7, M8 | Note d'une page, écran de l'outil, exports PDF et Excel | Section 13 |

M9 s'exécute après chaque module. Un contrôle bloquant en échec interrompt la chaîne et interdit la restitution.

## 4. Données d'entrée (M1)

Trois jeux alimentent le moteur : le budget de base au grain le plus fin, l'historique avec les budgets passés, les référentiels. Le budget de base est figé au lancement.

### 4.1 Budget de base

Grain : mois × BU × canal × famille × ligne de P&L. Chaque ligne porte ses drivers et pas seulement un montant, car le moteur recalcule les montants à partir des drivers tirés.

| Donnée | Unité | Grain | Règle |
| --- | --- | --- | --- |
| Volume | cartons | mois × BU × canal × famille | ≥ 0 |
| Prix net unitaire | MGA par carton, après remises | idem | > 0 |
| Coût matière unitaire | MGA par carton | idem | séparé en part importée (EUR) et part locale |
| Part importée du coût matière | % | BU × famille | entre 0 et 100 % |
| Cours budget EUR/MGA | MGA pour 1 EUR | mois | 5 200 sur 2027 |
| Transport | MGA | mois × poste | carburant flotte propre, sous-traitance, autres |
| Masse salariale | MGA | mois × BU | fixe sur l'exercice |
| Frais commerciaux | MGA | mois × BU | 60 % variables avec le CA, 40 % fixes |
| Frais généraux | MGA | mois | fixes |

Budget de base ALFA 2027, en GAr. Le transport se décompose en carburant 2,0, sous-traitance 2,6 et autres 1,4.

| Ligne | Boissons | Épicerie | Hygiène | Total |
| --- | --- | --- | --- | --- |
| CA net | 40,0 | 30,0 | 15,0 | 85,0 |
| Coût matière | 23,2 | 18,9 | 8,9 | 51,0 |
| dont importé, au cours de 5 200 | 7,0 | 9,5 | 5,3 | 21,8 |
| Marge brute | 16,8 | 11,1 | 6,1 | 34,0 |
| Transport |  |  |  | 6,0 |
| Masse salariale |  |  |  | 10,5 |
| Frais commerciaux |  |  |  | 4,5 |
| Frais généraux |  |  |  | 3,6 |
| **EBITDA** |  |  |  | **9,4** |

### 4.2 Historique

- 60 mois de réalisé (2022 à 2026) au même grain que le budget.
- Séries externes mensuelles : cours EUR/MGA, prix du carburant, indice des prix.
- Budgets et registres d'hypothèses 2024, 2025 et 2026, nécessaires au backtest.
- Journal des événements survenus : pertes de clients, ruptures d'approvisionnement, révisions du prix du carburant.

### 4.3 Référentiels

BU, canaux, familles, lignes de P&L, calendrier, table de passage des comptes du grand livre vers les lignes de P&L de gestion.

### 4.4 Règles d'import

| Règle | Contenu |
| --- | --- |
| R-IN-01 | Le budget de base reproduit l'EBITDA budgété publié à 1 MAr près. |
| R-IN-02 | Aucun volume négatif, aucun prix nul ou négatif. |
| R-IN-03 | Chaque ligne est rattachée à une ligne de P&L et à un driver. Une ligne orpheline bloque l'import. |
| R-IN-04 | L'historique est continu. Un mois manquant bloque l'import. |
| R-IN-05 | L'historique est retraité à périmètre constant : familles arrêtées, clients gagnés ou perdus identifiés. |
| R-IN-06 | Les montants sont stockés en MGA, affichés en GAr ou MAr. |
| R-IN-07 | Le budget de base est figé par empreinte (hash) au lancement. Toute modification crée une nouvelle version. |
| R-IN-08 | Formats acceptés : modèles Excel fournis (BUDGET\_BASE.xlsx, REGISTRE\_HYPOTHESES.xlsx) ou CSV, par glisser-déposer dans l'outil. Une erreur d'import s'affiche ligne par ligne et aucun calcul ne part tant qu'elle n'est pas corrigée. |

## 5. Registre des hypothèses (M2)

Le registre est le seul point d'entrée de l'incertitude : 12 hypothèses continues et 3 événements, chacun avec un propriétaire, une fourchette annuelle et une justification. Il se saisit dans l'écran Hypothèses de l'outil ou dans le modèle Excel importable, jamais dans le code.

### 5.1 Fiche hypothèse

| Champ | Contenu | Exemple H01 |
| --- | --- | --- |
| Code | H01 à H12, E01 à E03 | H01 |
| Libellé |  | Volume Boissons |
| Propriétaire | nom et fonction | Directeur commercial Boissons |
| Unité | facteur appliqué au budget (1,000 = budget), points, MGA pour 1 EUR | facteur |
| Grain d'application | total, BU, canal, famille | BU Boissons, tous canaux |
| P10 / P50 / P90 | valeurs annuelles | 0,955 / 0,995 / 1,025 |
| Loi | choisie par le FP&A selon 5.3 | split-normale |
| Dynamique mensuelle | section 6.2 | niveau annuel et bruit mensuel recentré |
| Justification | 3 lignes maximum, sources citées | tendance 5 ans, élasticité prix, carnet de commandes GMS |
| Coefficient k | issu du backtest (section 11) | 1,00 avant backtest |
| Version et statut | brouillon, validé, gelé | v2, validé |

### 5.2 Catalogue V1 ALFA 2027

Hypothèses continues. Un facteur de 1,000 reproduit le budget ; un P50 différent de 1,000 signale un budget non centré.

| Code | Hypothèse | Propriétaire | Unité | P10 | P50 | P90 | Loi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H01 | Volume Boissons | Dir. commercial | facteur | 0,955 | 0,995 | 1,025 | Split-normale |
| H02 | Volume Épicerie | Dir. commercial | facteur | 0,965 | 1,000 | 1,025 | Split-normale |
| H03 | Volume Hygiène | Dir. commercial | facteur | 0,960 | 1,000 | 1,040 | Normale |
| H04 | Prix net réalisé | Dir. commercial | facteur | 0,990 | 1,000 | 1,005 | Split-normale |
| H05 | Mix produits et canaux | Contrôle de gestion | points de marge brute | -0,4 | 0,0 | +0,4 | Normale |
| H06 | Change EUR/MGA, cours moyen | Trésorerie | MGA pour 1 EUR | 4 963 | 5 213 | 5 477 | Marche aléatoire |
| H07 | Prix d'achat importés, en EUR | Achats | facteur | 0,980 | 1,002 | 1,025 | Lognormale |
| H08 | Prix d'achat locaux | Achats | facteur | 0,990 | 1,000 | 1,020 | Split-normale |
| H09 | Tarifs transporteurs | Supply chain | facteur | 0,995 | 1,010 | 1,040 | Split-normale |
| H10 | Masse salariale | RH | facteur | 0,995 | 1,000 | 1,015 | Split-normale |
| H11 | Frais commerciaux | Marketing | facteur | 0,970 | 1,000 | 1,040 | Split-normale |
| H12 | Frais généraux | DAF | facteur | 0,990 | 1,000 | 1,030 | Split-normale |

H06 est saisi par ses paramètres de processus : départ 5 100 (dernier cours connu), dérive de 4 % par an, volatilité mensuelle de 1,8 %. Ses P10, P50 et P90 sont ceux du cours moyen simulé, à comparer au cours budget de 5 200.

Événements :

| Code | Événement | Propriétaire | Probabilité annuelle | Impact | Date et durée |
| --- | --- | --- | --- | --- | --- |
| E01 | Révision du prix du carburant | Supply chain | 35 % | +8 % à +15 % sur le carburant de la flotte propre | mois uniforme, jusqu'à fin d'exercice |
| E02 | Perte d'un grand compte GMS | Dir. commercial | 15 % | -4 % à -8 % sur les volumes Boissons et Épicerie | mois uniforme, jusqu'à fin d'exercice |
| E03 | Retard de navire (effet bateau) | Supply chain | 25 % | -15 % à -25 % sur les volumes Épicerie et Hygiène, surcoût de 30 à 60 MAr | mois uniforme, un mois |

### 5.3 Choix de la loi

Le FP&A applique la première règle qui correspond. L'indice d'asymétrie A = (P90 - P50) / (P50 - P10) : sous 1, la queue est plus longue vers le bas ; au-dessus, vers le haut.

| Ordre | Situation | Loi | Paramètres (annexe B) |
| --- | --- | --- | --- |
| 1 | Choc qui survient ou non | Bernoulli × amplitude | probabilité, amplitude uniforme, règle de date |
| 2 | Grandeur cotée à mémoire | Marche aléatoire | départ, dérive, volatilité mensuelle |
| 3 | Bornes physiques et valeur la plus probable connues | PERT | minimum, mode, maximum |
| 4 | Prix positif saisi par P10 et P90 seulement | Lognormale | médiane √(P10 × P90), σ = ln(P90 / P10) / 2,563 |
| 5 | A entre 0,9 et 1,1 | Normale | μ = P50, σ = (P90 - P10) / 2,563 |
| 6 | Autres cas | Split-normale | σ gauche = (P50 - P10) / 1,282, σ droite = (P90 - P50) / 1,282 |

### 5.4 Protocole de recueil

Atelier de 45 minutes par propriétaire, conduit par le FP&A. L'ordre des questions limite l'ancrage sur le chiffre budgété.

1. Présenter l'historique de l'hypothèse : réalisé sur 5 ans, écarts budget / réel des 3 derniers exercices.
2. Demander les extrêmes d'abord : « Quelle valeur n'a qu'une chance sur 10 d'être plus basse ? Plus haute ? » Puis la valeur centrale.
3. Faire le test du pari : « Préférez-vous parier que le réalisé tombera dans votre fourchette, ou sur une roue qui gagne 8 fois sur 10 ? » Préférer la roue signale une fourchette trop étroite. Ajuster jusqu'à l'indifférence.
4. Écrire la justification : 3 lignes, sources citées.
5. Revue croisée par le FP&A : comparer la fourchette à la dispersion historique (R-HY-02).
6. Valider, puis geler avec le registre.

### 5.5 Règles

| Règle | Contenu |
| --- | --- |
| R-HY-01 | P10 < P50 < P90, strictement. |
| R-HY-02 | Une fourchette P10-P90 plus étroite que la moitié de l'intervalle historique équivalent exige une justification validée par le CFO. |
| R-HY-03 | Le coefficient k du backtest écarte les bornes du P50 : P10 devient P50 - k × (P50 - P10), P90 devient P50 + k × (P90 - P50). |
| R-HY-04 | Toute modification après gel crée une nouvelle version du registre. Les runs antérieurs ne sont plus présentables. |
| R-HY-05 | Un événement porte une probabilité, une amplitude, une date et une durée. Un impact sans probabilité est un stress test, pas un événement. |
| R-HY-06 | Pas de double comptage : si E02 existe, la perte d'un grand compte est exclue de la fourchette de H01 et H02. |

## 6. Dépendances (M3)

Ignorer les dépendances sous-estime le risque : le change entraîne prix locaux, carburant et frais généraux, et un mauvais mois annonce souvent le suivant. M3 saisit les deux, les justifie et les teste.

### 6.1 Corrélations entre hypothèses

Les corrélations sont saisies en rang (Spearman), la mesure la plus intuitive pour un métier : « quand A est dans son décile haut, B l'est souvent aussi ». Matrice cible ALFA :

| Paire | Corrélation de rang | Justification |
| --- | --- | --- |
| H06 Change / E01 Carburant | +0,5 | carburant importé, payé en devises |
| H06 Change / H08 Prix locaux | +0,4 | inflation importée |
| H06 Change / H09 Transporteurs | +0,4 | carburant et pièces détachées importés |
| H06 Change / H12 Frais généraux | +0,3 | énergie, maintenance, informatique |
| H06 Change / H10 Masse salariale | +0,2 | pression salariale en période d'inflation |
| H06 Change / H01 à H03 Volumes | -0,2 | pouvoir d'achat des ménages |
| H04 Prix net / H01 à H03 Volumes | -0,3 | élasticité prix |
| Volumes entre BU (H01-H02, H02-H03, H01-H03) | +0,5, +0,5, +0,4 | demande commune |
| E01 Carburant / H09 Transporteurs | +0,6 | répercussion par les transporteurs |
| H08 Prix locaux / H12 Frais généraux | +0,3 | inflation domestique |
| H11 Frais commerciaux / H01, H02 Volumes | -0,3 | promotions de relance quand les volumes décrochent |

Toutes les autres paires sont indépendantes. C'est une hypothèse documentée, revue à chaque backtest.

| Règle | Contenu |
| --- | --- |
| R-DE-01 | Matrice symétrique, diagonale à 1, valeurs hors diagonale entre -0,9 et +0,9. |
| R-DE-02 | La matrice doit être semi-définie positive. Sinon, correction par la matrice de corrélation la plus proche (Higham) et alerte listant les paires déplacées de plus de 0,05. Prototype ALFA : plus petite valeur propre 0,23, aucune correction. |
| R-DE-03 | Toute corrélation d'au moins 0,3 en valeur absolue s'affiche à côté de la corrélation observée sur 60 mois. Un écart de plus de 0,3 exige un argument écrit. |
| R-DE-04 | Les corrélations de crise, quand tout se dégrade ensemble, relèvent des stress tests (section 10), pas de la matrice. |
| R-DE-05 | Les corrélations de rang sont converties pour la copule gaussienne (annexe D). |

### 6.2 Dynamiques mensuelles

Les fourchettes sont recueillies sur l'année ; le moteur les décline en trajectoires mensuelles, nécessaires au suivi en cours d'année et aux événements datés.

| Type | Hypothèses | Modèle | Paramètres ALFA |
| --- | --- | --- | --- |
| Niveau annuel et bruit recentré | H01 à H03 | facteur annuel tiré × (1 + bruit mensuel AR(1)) | persistance φ = 0,6, écart-type 3 % par mois |
| Niveau annuel constant | H04, H05, H07 à H12 | le facteur tiré s'applique à tous les mois | trajectoires mensuelles en V2 si l'historique le justifie |
| Marche aléatoire | H06 | ln S(t) = ln S(t-1) + dérive + σ × ε(t) | départ 5 100, dérive 4 % par an, σ = 1,8 % par mois |
| Saut persistant | E01, E02 | à la date tirée, le niveau change jusqu'à fin d'exercice | probabilité, amplitude |
| Choc ponctuel | E03 | impact limité au mois tiré | probabilité, amplitude, surcoût |

Le bruit mensuel est recentré : sa moyenne pondérée par la saisonnalité budgétée est nulle sur l'année. Il déplace le profil dans l'année sans toucher au total annuel, qui respecte exactement la fourchette validée (contrôle C11).

Pourquoi la persistance compte : avec φ = 0,8, l'écart-type annuel vaut 2,4 fois celui de douze mois indépendants ; avec un choc permanent (φ = 1), 3,5 fois (annexe C). Pour le change, 1,8 % de volatilité mensuelle donne 3,8 % d'écart-type sur le cours moyen de l'année.

## 7. Moteur de simulation (M4)

10 000 itérations en hypercube latin, graine fixe. Sur le protocole de validation ALFA (section 7.4), la précision empirique mesurée est d'environ ±0,6 point sur la probabilité d'atteinte et ±35 MAr sur le P10 (intervalles à 95 %). Ce n'est pas une propriété générale de 10 000 tirages : elle dépend de la forme de la distribution et de la position du budget.

### 7.1 Paramètres

| Paramètre | Défaut | Règle |
| --- | --- | --- |
| Nombre d'itérations N | 10 000 | de 1 000 à 100 000, minimum fixé par la convergence (7.4) |
| Échantillonnage des chocs annuels | Hypercube latin (LHS) | chaque loi est couverte uniformément de bout en bout ; même précision qu'un tirage simple avec deux fois moins d'itérations |
| Dépendances | Copule gaussienne | corrélations de rang converties (annexe D) |
| Chocs mensuels | pseudo-aléatoires, conditionnels au choc annuel pour le change | annexe D |
| Générateur | pseudo-aléatoire à graine, codé dans l'outil (xoshiro128\*\* ou équivalent) | pour une graine donnée, la même suite de tirages sur tous les navigateurs |
| Graine | 2027 | affichée à l'écran et modifiable ; une autre graine donne un autre résultat, lui aussi reproductible |
| Exécution | tâche de fond du navigateur (Web Worker) | l'écran reste fluide ; recalcul automatique à chaque modification |

### 7.2 Algorithme

1. Charger le budget de base, le registre gelé et la matrice validée, vérifier leurs empreintes.
2. Tirer N × 15 uniformes en hypercube latin, une colonne par hypothèse et par événement, et les convertir en normales.
3. Appliquer la matrice de corrélation par décomposition de Cholesky.
4. Transformer chaque normale en valeur d'hypothèse par la fonction quantile de sa loi.
5. Pour le change, répartir le choc annuel en 12 chocs mensuels conditionnels, puis construire la trajectoire du cours.
6. Pour chaque événement : survenance si le rang dépasse 1 - p, date et amplitude tirées uniformément. Le quantile supérieur porte la corrélation : E01 survient plus souvent quand l'ariary se déprécie.
7. Construire les trajectoires des volumes : niveau annuel × (1 + bruit AR(1) recentré).
8. Garder le cube des tirages en mémoire, en tableaux typés, et le transmettre à M5.

### 7.3 Modes

| Mode | Usage | Particularités |
| --- | --- | --- |
| Base | budget initial | registre gelé, douze mois simulés |
| Levier ou stress | question du CODIR | mêmes tirages que la base, règles de la section 10 en surcouche |
| Atterrissage | suivi mensuel en cours d'année | mois clos figés au réel, change reparti du dernier cours, fourchettes des mois restants mises à jour ; probabilité recalculée à chaque clôture |
| Backtest | budgets passés | registre de l'époque, aucune information postérieure (section 11) |

### 7.4 Convergence

Critères : erreur-type du P10 inférieure à 0,5 % du budget (47 MAr), intervalle à 95 % sur la probabilité d'au plus ±1 point. Mesures du prototype, 100 à 200 répétitions à graines différentes par taille (30 pour 50 000) :

| N | Erreur-type du P10, LHS | IC 95 % probabilité, LHS | Erreur-type du P10, tirage simple | IC 95 % probabilité, tirage simple | Temps, prototype |
| --- | --- | --- | --- | --- | --- |
| 1 000 | 56 MAr (0,60 %) | ±1,8 pt | 82 MAr | ±2,9 pts | < 0,1 s |
| 5 000 | 28 MAr (0,30 %) | ±0,8 pt | 35 MAr | ±1,2 pt | < 0,1 s |
| 10 000 | 18 MAr (0,19 %) | ±0,6 pt | 28 MAr | ±0,9 pt | 0,1 s |
| 50 000 | 8 MAr (0,08 %) | ±0,3 pt | 12 MAr | ±0,4 pt | 0,5 s |

N = 5 000 suffit aux critères. N = 10 000 est retenu pour tenir la même précision sur les analyses par BU et par trimestre. Ces temps sont ceux du prototype Python au grain BU × mois ; l'exigence de l'outil web figure en section 14.

| Règle | Contenu |
| --- | --- |
| R-SI-01 | Un run dont N est sous le minimum de convergence est marqué non présentable. |
| R-SI-02 | On ne change jamais de graine pour obtenir un meilleur chiffre. Tout changement de graine est journalisé avec son motif. |
| R-SI-03 | Les fonctions quantiles reproduisent les P10, P50 et P90 saisis à 1 point de percentile près (contrôle C05). |

## 8. Moteur P&L (M5)

Chaque itération recalcule le P&L mensuel en remplaçant les drivers budgétés par les drivers tirés. La chaîne de calcul est celle du budget : quand rien ne varie, le moteur rend l'EBITDA budgété.

### 8.1 Chaîne de calcul

Calcul au grain mois × BU × canal × famille, puis agrégation. S(t) est le cours EUR/MGA du mois t, Hxx le facteur tiré pour l'itération.

| Ligne | Règle de calcul | Hypothèses |
| --- | --- | --- |
| Volume | volume budget × H01 à H03 × (1 + bruit mensuel) × (1 - impact E02 ou E03 si survenu) | H01 à H03, E02, E03 |
| CA net | volume × prix net budget × H04 | H04 |
| Coût matière | volume × coût unitaire budget × \[part importée × S(t) / 5 200 × H07 + part locale × H08\] | H06, H07, H08 |
| Effet mix | H05 / 100 × CA net total | H05 |
| Transport | carburant budget × indice de volume × (1 + E01) + sous-traitance budget × indice de volume × H09 + autres + surcoût E03 | E01, H09, E03 |
| Masse salariale | budget × H10 | H10 |
| Frais commerciaux | budget × (60 % × CA / CA budget + 40 %) × H11 | H11 |
| Frais généraux | budget × H12 | H12 |
| **EBITDA** | CA net - coût matière + effet mix - transport - masse salariale - frais commerciaux - frais généraux |  |

L'indice de volume du mois rapporte les volumes simulés, valorisés au prix budget, au CA budget du mois.

### 8.2 Réconciliation

Toutes les hypothèses à 1,000, H05 à 0, change au cours budget, bruit et événements désactivés : l'EBITDA doit valoir 9,400 GAr à 1 MAr près (C01). Le prototype retrouve 9,400 exactement.

### 8.3 Biais structurel : pourquoi le P50 est sous le budget

Le P50 simulé ressort à 8 627 MAr, 773 MAr sous le budget, sans aucun scénario de crise. Trois effets l'expliquent.

&#91;embedded content: prototype ALFA, 10 000 itérations, graine 2027 · écarts à l'EBITDA budgété, en MAr\]

1. **Hypothèses budgétées non centrées, -204 MAr.** Le budget retient des volumes Boissons au-dessus du P50 de leur propriétaire, un cours de 5 200 contre 5 213 attendu, des prix importés et des tarifs transporteurs sous leur P50.
2. **Asymétrie des risques, -346 MAr.** Les fourchettes sont plus longues du côté défavorable. La médiane d'une somme de risques asymétriques passe sous la somme des médianes.
3. **Événements, -223 MAr.** Rares un par un, ils frappent ensemble 58 % des itérations au moins une fois.

Lecture pour le CFO : la simulation n'est pas pessimiste. Le budget additionne des valeurs centrales légèrement optimistes et ignore les chocs datés.

### 8.4 Règles

| Règle | Contenu |
| --- | --- |
| R-PL-01 | Calcul au grain le plus fin, agrégation ensuite, aucun arrondi intermédiaire. |
| R-PL-02 | Les lignes non modélisées restent au budget et sont listées dans le rapport de run. |
| R-PL-03 | Convention d'écart : sur les charges, un écart positif est un dépassement, un écart négatif une économie. |
| R-PL-04 | Bornes : volumes ≥ 0, prix et cours > 0. Une itération qui touche une borne est comptée et signalée (C08). |
| R-PL-05 | Résultats gardés en mémoire dans le navigateur au grain BU × mois × ligne, exportables en Excel. Le grain complet se recalcule à la demande à partir de la graine. |

## 9. Analyses de risque (M6)

Dans l'exemple ALFA, le budget a 30 % de chances d'être atteint, une année défavorable à 1 chance sur 10 perd 2,0 GAr sur le médian, et le bloc macroéconomique porte 68 % du risque.

### 9.1 Indicateurs

| Indicateur | Définition | ALFA 2027 |
| --- | --- | --- |
| P10 / P50 / P90 | percentiles de l'EBITDA annuel simulé | 6,6 / 8,6 / 10,4 GAr |
| Moyenne |  | 8,6 GAr |
| Probabilité d'atteinte (Q1) | part des itérations ≥ 9,4 GAr | 30 % (29,9 %) |
| EBITDA-at-Risk 90 (Q2) | P50 - P10 | 2,0 GAr |
| CVaR 10 | moyenne des 10 % d'itérations les plus basses | 5,9 GAr, soit 3,5 GAr sous le budget |
| Objectif à 80 % de confiance | P20 | 7,3 GAr |
| Écart-type |  | 1,5 GAr |

La même distribution chiffre d'autres objectifs : 8,5 GAr a 53 % de chances d'être atteint, 9,0 GAr 40 %, 10,0 GAr 17 %.

### 9.2 Origine du risque (Q3)

| Méthode | Calcul | Question traitée |
| --- | --- | --- |
| Contribution à la variance | carré de la corrélation de rang entre hypothèse et EBITDA, normalisé à 100 % | classement et regroupement par blocs |
| Effet total | P50 de l'EBITDA quand l'hypothèse est autour de son P10 puis de son P90 (bandes P5-P15 et P85-P95) | ce que l'entreprise subit, corrélations comprises |
| Effet isolé | EBITDA quand l'hypothèse seule passe de P10 à P90, les autres à leur P50 | ce qu'une action ciblée sur cette seule hypothèse peut changer |

Par blocs : macroéconomie (H06, H08, H09, H10, H12, E01) 68 %, commercial (H01 à H05, H11, E02) 28 %, approvisionnement (H07, E03) 4 %.

&#91;embedded content: prototype ALFA, 10 000 itérations · effet isolé : autres hypothèses au P50 ; effet total : P50 conditionnel autour du P10 puis du P90\]

Les frais généraux ne sont pas un risque en soi : ils signalent le scénario d'inflation. Le prix net fait l'inverse, son effet est amorti par l'élasticité des volumes.

Avec des hypothèses corrélées, les contributions se recouvrent : les 13 % des prix d'achat locaux contiennent du change transmis. La lecture par blocs, et la comparaison entre effet isolé et effet total, corrigent ce biais.

| Événement | P50 si survenu (GAr) | P50 sinon (GAr) |
| --- | --- | --- |
| E01 Révision du carburant | 8,01 | 8,95 |
| E02 Perte d'un grand compte GMS | 8,05 | 8,73 |
| E03 Retard de navire | 8,44 | 8,68 |

L'écart d'E01 inclut le change auquel il est corrélé : une révision survient surtout les années de dépréciation.

### 9.3 Profil des scénarios

Le moteur décrit l'année type de chaque zone de la distribution. « Une année P10 » est la moyenne des hypothèses sur les itérations comprises entre P5 et P15.

| Hypothèse | Année P10 | Ensemble des itérations |
| --- | --- | --- |
| Change moyen, MGA pour 1 EUR | 5 435 | 5 218 |
| Volume Boissons | -2,1 % | -0,8 % |
| Volume Épicerie | -1,4 % | -0,3 % |
| Volume Hygiène | -1,1 % | 0,0 % |
| Prix d'achat locaux | +1,1 % | +0,3 % |
| Révision du carburant survenue | 55 % des cas | 35 % |
| Perte d'un grand compte survenue | 23 % des cas | 15 % |
| Retard de navire survenu | 29 % des cas | 25 % |

Une année P10 n'est pas une catastrophe : un ariary un peu plus faible, des volumes un peu plus bas, un choc carburant de plus. C'est ce qui la rend plausible, donc utile au CODIR.

### 9.4 Règles

| Règle | Contenu |
| --- | --- |
| R-RI-01 | Percentiles calculés sur les N itérations, interpolation linéaire. |
| R-RI-02 | Niveaux de probabilité au point près en analyse, arrondis à 5 points dans la note CODIR. Les écarts entre scénarios restent au point près, car l'aléa commun les mesure bien plus précisément que les niveaux. |
| R-RI-03 | Toute contribution s'affiche avec sa méthode. Effet isolé et effet total ne se mélangent jamais dans un même classement. |
| R-RI-04 | Indicateurs calculés sur l'EBITDA annuel, puis par BU et par trimestre. |

## 10. Leviers et scénarios (M7)

Un levier se juge sur deux axes, la probabilité d'atteinte et le risque de bas de fourchette. Dans l'exemple, la couverture de change réduit l'EaR de 21 % mais coûte 7 points de probabilité.

### 10.1 Stress tests

Un stress test force une ou plusieurs hypothèses à une valeur extrême et laisse les autres aléatoires. Il produit une distribution conditionnelle, pas un chiffre unique.

| Code | Scénario | Règle appliquée | Probabilité d'atteinte | P10 / P50 (GAr) |
| --- | --- | --- | --- | --- |
| Base |  |  | 29,9 % | 6,6 / 8,6 |
| S1 | Dépréciation brutale de l'ariary | cours +15 % au-dessus de la trajectoire simulée, dès avril | 1,5 % | 4,1 / 6,2 |
| S2 | Perte de deux grands comptes GMS | volumes Boissons et Épicerie -12 % dès avril | 2,2 % | 5,0 / 6,8 |
| S3 | Choc carburant | +25 % dès avril, en plus des révisions simulées | 21,4 % | 6,3 / 8,3 |
| S1 + S3 | Choc macro combiné | S1 et S3 | 0,7 % | 3,7 / 5,8 |

L'entreprise encaisse un choc carburant (-8,5 points) mais pas une dépréciation brutale de l'ariary, qui ramène la probabilité près de zéro. Le change est le risque à piloter en priorité.

### 10.2 Leviers de gestion

Fiche levier : code, description, hypothèses touchées, règle de calcul, coût direct, date d'effet, propriétaire, faisabilité. Tous sont évalués sur les tirages de la base.

| Levier | Règle de calcul | Coût direct | Δ P50 (GAr) | Δ probabilité (pts) | Δ EaR 90 (GAr) | Lecture |
| --- | --- | --- | --- | --- | --- | --- |
| L1 Couverture de change | 50 % des achats EUR à cours garanti de 5 250 | implicite dans le cours | -0,07 | -7,1 | -0,43 | réduit le risque de 21 %, pas la probabilité |
| L2 Hausse tarifaire ciblée | +1 % sur Épicerie et Hygiène au 1er avril, élasticité -0,8 | volumes perdus, inclus | +0,25 | +6,7 | 0,00 | meilleur rapport effet / effort |
| L3 Économies de frais généraux | -0,25 GAr en année pleine, effet dès avril | 0,05 GAr, unique | +0,14 | +3,7 | 0,00 | gain sûr, limité |
| L4 Plafond des tarifs transporteurs | hausses limitées à +3 % contre engagement de volume | aucun | 0,00 | +0,1 | -0,01 | sans effet : à abandonner |
| L5 Stock de sécurité import | +2 semaines, impact de E03 réduit de 75 % | 0,16 GAr par an | -0,12 | -2,6 | -0,01 | coûte plus que le risque couvert |
| Paquet A : L2 + L3 |  | 0,05 GAr | +0,38 | +10,0 | 0,00 | probabilité 40 % |
| Paquet B : A + L1 |  | 0,05 GAr | +0,31 | +4,4 | -0,43 | probabilité 35 %, P10 à 7,4 GAr |

Réduire le risque n'augmente pas toujours la probabilité. Quand le P50 est sous le budget, resserrer la distribution éloigne aussi les issues favorables.

Arbitrage soumis au CODIR : le paquet A maximise la probabilité (40 %) ; le paquet B la ramène à 35 % mais remonte le P10 de 7,0 à 7,4 GAr. Le choix dépend de ce que le CODIR redoute le plus : rater le budget, ou subir une mauvaise année.

### 10.3 Règles

| Règle | Contenu |
| --- | --- |
| R-LE-01 | Aléa commun : mêmes tirages que la base. Un levier sans effet donne un écart exactement nul (TC11). |
| R-LE-02 | Chaque levier porte un coût direct, une date d'effet et un propriétaire. |
| R-LE-03 | Un paquet est toujours recalculé : les gains de probabilité ne s'additionnent pas (10,4 points en somme pour L2 et L3, 10,0 en paquet). |
| R-LE-04 | Les leviers s'affichent sur deux axes : Δ probabilité et Δ EaR. |
| R-LE-05 | Un stress test n'a pas de probabilité de survenance. Il répond à « et si », il ne prévoit rien. |

## 11. Backtest et calibration (M8)

Le modèle rejoue les budgets 2024 à 2026 avec les fourchettes de l'époque. Si les réalisés sortent trop souvent de l'intervalle P10-P90, les fourchettes sont élargies avant la simulation suivante.

Trois budgets annuels ne suffisent pas à valider une probabilité annuelle. Le backtest travaille donc hypothèse par hypothèse et par trimestre : 3 ans × 4 trimestres donnent 12 observations par hypothèse, 36 pour les trois volumes réunis. Les trimestres d'un même exercice restent liés : les seuils ci-dessous sont des alertes qui déclenchent une revue, pas des tests formels.

### 11.1 Tests et seuils

| Test | Mesure | Seuil d'acceptation |
| --- | --- | --- |
| Couverture P10-P90 | part des réalisés dans l'intervalle | 70 % à 90 %, cible 80 % |
| Queues | part des réalisés sous le P10, puis au-dessus du P90 | chacune entre 5 % et 15 % |
| Uniformité du PIT | rang du réalisé dans sa distribution simulée, en 5 classes | uniformité non rejetée par un test du khi-deux au seuil de 5 % |
| Biais | médiane de (réalisé - P50) / P50 | au plus 1 % en valeur absolue |
| Score de Brier | sur l'événement « budget trimestriel atteint » | meilleur que 0,25, score d'une prévision à 50 % |
| CRPS | écart entre la distribution et le réalisé | inférieur à l'erreur absolue du budget déterministe |

### 11.2 Calibration

Une couverture c trop faible signale des fourchettes trop étroites, travers classique des estimations d'experts. Le coefficient k = 1,2816 / Φ⁻¹((1 + c) / 2) ramène la couverture à 80 % : 58 % de couverture donnent k = 1,59, 70 % donnent k = 1,24.

Un biais significatif déplace le P50. Si les volumes réalisés ressortent en moyenne 1,5 % sous le P50 sur trois ans, le P50 de l'hypothèse est abaissé d'autant, avec l'accord du propriétaire.

Le jeu synthétique contient des fourchettes passées volontairement trop étroites, couvrant environ 60 % des réalisés. Le backtest doit le détecter et proposer un k proche de 1,5.

### 11.3 Règles

| Règle | Contenu |
| --- | --- |
| R-BT-01 | Aucune information postérieure : chaque budget est rejoué avec le registre, les corrélations et les données disponibles à sa date. |
| R-BT-02 | Sans registre d'époque, les fourchettes sont reconstruites à partir de la volatilité historique et le backtest est marqué « reconstitué ». |
| R-BT-03 | k est borné entre 1,0 et 2,0. Au-delà de 2,0, l'hypothèse repasse en atelier. |
| R-BT-04 | Une couverture supérieure à 90 %, signe de fourchettes trop larges, déclenche une revue en atelier ; aucune réduction automatique. |
| R-BT-05 | Le résultat du backtest figure en une ligne sur la note CODIR. |

## 12. Contrôles et traçabilité (M9)

Douze contrôles s'exécutent à chaque run ; un contrôle bloquant en échec interdit la restitution. Ils s'affichent en vert ou en rouge dans le panneau Contrôles de l'outil ; le prototype passe tous ceux qu'il peut exécuter.

### 12.1 Contrôles

| Code | Contrôle | Seuil | Nature | Prototype ALFA |
| --- | --- | --- | --- | --- |
| C01 | Réconciliation : hypothèses au budget, bruit et événements désactivés | écart ≤ 1 MAr | Bloquant | 0 MAr |
| C02 | Cohérence des agrégats : mois vers année, BU vers total | écart nul | Bloquant | conforme |
| C03 | Corrélations de rang empiriques contre cibles | écart maximal ≤ 0,05 | Bloquant | 0,026 |
| C04 | Matrice semi-définie positive | plus petite valeur propre ≥ 0 | Bloquant, correction automatique | 0,227 |
| C05 | Quantiles empiriques contre P10 et P90 saisis | ≤ 1 point de percentile | Bloquant | 0,48 point |
| C06 | Reproductibilité : deux runs, même graine, même navigateur | identiques ; entre navigateurs, écart d'au plus 1 MAr | Bloquant | identiques |
| C07 | Convergence | critères de 7.4 | Bloquant | conforme à N = 10 000 |
| C08 | Bornes physiques : volumes, prix, cours | aucune violation | Bloquant | aucune |
| C09 | Monotonie : +1 % sur chaque charge et sur le cours fait baisser l'EBITDA | aucune violation | Bloquant | aucune sur 70 000 tests |
| C10 | Fréquence des événements contre probabilité saisie | ±1 point | Alerte | 34,6 %, 15,0 %, 25,0 % |
| C11 | Bruit mensuel recentré : total annuel inchangé | écart ≤ 0,01 % | Bloquant | 0 |
| C12 | Complétude du registre : propriétaire, justification, statut validé | 100 % | Bloquant | sans objet, registre codé dans le prototype |

### 12.2 Référence de run

Chaque calcul produit une référence de run : version de l'outil, empreinte du budget et du registre, graine, N, leviers et stress actifs. Elle s'affiche sous chaque résultat, part avec chaque export et figure dans le lien de partage. Le journal des runs de la session s'exporte en Excel, avec P10 / P50 / P90, probabilité, statut des contrôles et durée.

### 12.3 Versionnement

- Code sous Git ; chaque version publiée de l'outil porte un numéro affiché à l'écran.
- Un lien de scénario enregistre la version de l'outil qui l'a calculé. Ouvert avec une autre version, il le signale.
- Tout chiffre cité dans une note renvoie à sa référence de run.

## 13. Restitution (M10)

La restitution vit dans l'outil : un écran unique pour explorer, et une note CODIR d'une page pour décider, construite autour de la distribution de l'EBITDA et de la ligne du budget.

### 13.1 Structure de la note

1. Message clé, en gras, deux lignes au plus.
2. Réponses chiffrées aux questions Q1 à Q4.
3. Graphique de distribution avec la ligne du budget.
4. Décision attendue du CODIR.
5. Limites et référence du run, en deux lignes.

### 13.2 Exemple : note CODIR ALFA 2027

**Message clé : l'EBITDA budgété de 9,4 GAr a 30 % de chances d'être atteint. Une hausse tarifaire ciblée et des économies de frais généraux portent cette probabilité à 40 % pour 0,05 GAr de coût direct.**

- **Q1, probabilité :** 30 %. Le résultat médian attendu est de 8,6 GAr, 0,8 GAr sous le budget.
- **Q2, risque :** une année défavorable à 1 chance sur 10 donne 6,6 GAr. Dans les 10 % pires cas, l'EBITDA moyen tombe à 5,9 GAr.
- **Q3, origine :** le change et ce qu'il entraîne (prix locaux, carburant, frais généraux) portent 68 % du risque. Le volume Boissons est le premier risque commercial.
- **Q4, leviers :** hausse tarifaire ciblée, +7 points ; économies de frais généraux, +4 points. La couverture de change réduit le risque de 21 % mais retire 7 points de probabilité.
- **Décision attendue :** valider le paquet A (probabilité 40 %), ou le paquet B si le CODIR privilégie la protection du bas de fourchette (P10 à 7,4 GAr au lieu de 7,0).
- **Limites :** données de démonstration, corrélations estimées sur 5 ans, risques hors registre non couverts. Référence : outil v1.0, registre v2, graine 2027, 10 000 itérations.

&#91;embedded content: prototype ALFA, 10 000 itérations, graine 2027 · valeurs sous 3,4 GAr regroupées dans la première tranche\]

### 13.3 Interface de l'outil

Un écran unique, lu de gauche à droite : ce qu'on suppose, ce qui en résulte, ce qu'on peut faire. Rien à lancer : chaque modification recalcule la distribution en moins d'une seconde.

| Zone | Contenu | Interaction |
| --- | --- | --- |
| Bandeau | nom du scénario, référence de run, boutons Partager, Importer, Exporter, Imprimer la note | une action par clic |
| Gauche : Hypothèses | les 12 hypothèses et les 3 événements, P10 / P50 / P90 en curseurs, propriétaire et justification en info-bulle | modifier une valeur relance le calcul |
| Centre : Résultat | probabilité d'atteinte en grand, distribution avec la ligne du budget, P10 / P50 / P90, EaR | survol d'une barre : fourchette et nombre d'itérations |
| Droite : Leviers | leviers L1 à L5 et stress S1 à S3 et S1 + S3 en cases à cocher, effet en points et en MAr à côté de chaque case | cocher superpose la nouvelle distribution à la base |
| Onglets sous l'écran | Origine du risque, Trajectoire mensuelle, Backtest, Registre, Contrôles | lecture détaillée sans quitter l'écran |

Principes d'ergonomie :

- ALFA préchargée : la démonstration fonctionne dès l'ouverture du lien.
- Vocabulaire CODIR à l'écran (« 1 chance sur 10 »), termes techniques en info-bulle.
- Contrôles visibles : un voyant vert ou rouge par contrôle.
- Consultation et leviers sur mobile ; saisie complète sur ordinateur.
- Brouillon conservé sur le poste entre deux visites, bouton « Revenir à ALFA ».

Onglet Trajectoire mensuelle : fin juin, l'EBITDA cumulé attendu est compris entre 3,2 et 4,8 GAr, P50 à 4,0 pour un budget de 4,2. Un réalisé cumulé sous 3,2 GAr sort de l'éventail et déclenche une revue des hypothèses.

### 13.4 Exports et partage

| Export | Format | Contenu |
| --- | --- | --- |
| Note CODIR | PDF d'une page A4, via « Imprimer » | message clé, Q1 à Q4, distribution, décision attendue, limites, référence de run |
| Résultats | Excel | synthèse, percentiles, EBITDA par itération, leviers, stress, contrôles ; tables en schéma en étoile, prêtes pour Power BI |
| Registre | Excel | hypothèses, corrélations, leviers, à rééditer puis réimporter |
| Scénario sur ALFA | lien | hypothèses, leviers, graine et version de l'outil dans l'ancre du lien ; le destinataire retrouve les mêmes chiffres |
| Scénario sur données importées | fichier Excel | le budget importé voyage dans un fichier, jamais dans un lien |

### 13.5 Règles de restitution

| Règle | Contenu |
| --- | --- |
| R-RE-01 | Tout graphique de distribution porte la ligne du budget. |
| R-RE-02 | Tout chiffre publié porte la référence du run, la version du registre et la graine. |
| R-RE-03 | Chaque graphique est titré par son constat, pas par son sujet. |
| R-RE-04 | Vocabulaire CODIR : « 1 chance sur 10 » plutôt que « P10 » dans les messages. Les termes techniques restent en info-bulle et en annexe. |
| R-RE-05 | La note ne dépasse pas une page. |
| R-RE-06 | Un contrôle bloquant en rouge désactive l'impression de la note CODIR. |
| R-RE-07 | Le lien de partage ne contient jamais de budget importé : seulement les hypothèses, les leviers, la graine et la version de l'outil. |

## 14. Exigences non fonctionnelles

L'outil doit se transmettre par un lien et répondre à la vitesse d'une conversation : moins d'une seconde pour 10 000 itérations, dans un navigateur récent, sur un portable standard.

| Domaine | Exigence | Critère de mesure |
| --- | --- | --- |
| Accès | Un lien, aucune installation, aucun compte | premier résultat affiché moins de 3 s après l'ouverture, en 4G |
| Performance | 10 000 itérations au grain mois × BU × canal × famille | moins de 1 s dans Chrome, Edge, Firefox ou Safari récents |
| Performance | Batterie complète : base, 5 leviers, 4 stress tests | moins de 10 s |
| Fluidité | Calcul en tâche de fond | l'écran reste utilisable pendant le calcul |
| Reproductibilité | Mêmes entrées et même graine donnent la même sortie | bit à bit dans un même navigateur ; au plus 1 MAr et 0,1 point entre navigateurs |
| Confidentialité | Aucune donnée ne quitte le navigateur | aucun appel réseau après le chargement de la page, vérifié en recette |
| Hors ligne | L'outil fonctionne sans connexion une fois chargé | test en mode avion |
| Prise en main | Un utilisateur non technique obtient la probabilité et teste un levier sans aide | moins de 2 minutes, pour 3 testeurs sur 3 |
| Traçabilité | Chaque chiffre affiché ou exporté porte sa référence de run | 100 % |
| Qualité du code | Tests automatisés sur le moteur et l'interface | couverture du moteur d'au moins 90 % |
| Documentation | README, guide utilisateur d'une page, dictionnaire des modèles Excel, SFD | livrés avec le code |
| Compatibilité | Ordinateur pour la saisie, mobile pour la consultation et les leviers | test sur les deux formats |
| Langue et formats | Français, montants en GAr à une décimale, virgule décimale, espace des milliers | contrôle visuel en recette |
| Lisibilité | Graphiques lisibles en niveaux de gris, contrastes conformes au niveau AA des WCAG | revue en recette |

## 15. Architecture technique et modèle de données

Une page web statique qui calcule dans le navigateur : on ouvre un lien, rien à installer, aucune donnée ne quitte le poste. Le prototype Python reste en coulisse, comme référence de calcul.

### 15.1 Composants

| Couche | Choix | Rôle |
| --- | --- | --- |
| Application | page web statique en TypeScript, construite avec Vite | interface et calcul, sans serveur applicatif |
| Interface | Svelte (ou React), composants réactifs | curseurs, cases à cocher, onglets, recalcul automatique |
| Hébergement | GitHub Pages | lien public gratuit, chaque version publiée depuis le dépôt |
| Moteur | module TypeScript sans dépendance : générateur à graine, hypercube latin, copule, lois, P&L, analyses, contrôles | 10 000 itérations en moins d'une seconde |
| Calcul en arrière-plan | Web Worker | l'écran reste fluide pendant le calcul |
| Graphiques | SVG, avec D3 pour les échelles | distribution, cascade, effets, éventail, nets à l'écran comme à l'impression |
| Excel | SheetJS | import et export du budget, du registre et des résultats |
| Partage | état compressé dans l'ancre du lien (lz-string) | un scénario tient dans un lien ; l'ancre n'est jamais envoyée au serveur |
| Brouillon | stockage local du navigateur (IndexedDB) | reprise du travail entre deux visites, sur ce poste seulement |
| Note CODIR | page d'impression dédiée (CSS d'impression) | PDF d'une page via « Imprimer » |
| Tests | Vitest pour le moteur, Playwright pour l'interface | recette automatisée (section 18) |
| Référence de calcul | prototype Python (numpy, scipy), hors parcours utilisateur | valeurs attendues de l'annexe F |

### 15.2 Modèle de données

L'état de l'outil tient dans un objet JSON versionné (schemaVersion) : référence du budget, registre, corrélations, leviers, stress, N et graine. C'est cet objet qui s'enregistre dans le lien, dans le brouillon local et dans les exports.

| Objet | Contenu | Volume pour 10 000 itérations |
| --- | --- | --- |
| Scénario (JSON) | registre, corrélations, leviers, stress, N, graine, version de l'outil | quelques kilo-octets |
| Budget de base | mois × BU × canal × famille × ligne | environ 4 300 lignes |
| Tirages | itération × hypothèse, et × mois pour les dynamiques, en tableaux typés | environ 0,7 million de valeurs |
| Résultats | itération × BU × mois × ligne, en tableaux typés | 3,6 millions de valeurs, environ 29 Mo en mémoire |
| Synthèse | percentiles, probabilités, contributions, profils de scénarios | quelques milliers de valeurs |

L'export Excel suit un schéma en étoile (Kimball) : FAIT\_RESULTAT, FAIT\_PERCENTILE, FAIT\_TIRAGE et les dimensions DIM\_BU, DIM\_TEMPS, DIM\_LIGNE\_PL, DIM\_HYPOTHESE, DIM\_RUN. Un Power BI d'entreprise s'y branche sans retraitement.

### 15.3 Arborescence du dépôt

```
mc-budget/
  index.html
  src/
    engine/           moteur sans dépendance (M3 à M9)
      rng.ts          générateur à graine
      lhs.ts          hypercube latin
      laws.ts         lois et fonctions quantiles
      copula.ts       corrélations, Cholesky, correction de matrice
      dynamics.ts     bruit AR(1), marche aléatoire, sauts
      pl.ts           moteur P&L (M5)
      risk.ts         indicateurs et attribution (M6)
      levers.ts       leviers et stress tests (M7)
      backtest.ts     backtest et calibration (M8)
      controls.ts     contrôles C01 à C12 (M9)
    worker.ts         calcul en tâche de fond
    ui/               écran, onglets, graphiques, note imprimable (M10)
    io/               excel.ts, share.ts, storage.ts (M1, partage, brouillon)
  data/alfa/          budget.json, registre.json : ALFA préchargée
  templates/          BUDGET_BASE.xlsx, REGISTRE_HYPOTHESES.xlsx
  tests/              engine (Vitest), e2e (Playwright)
  reference/          prototype Python et valeurs attendues (annexe F)
  docs/               SFD, guide utilisateur
```

### 15.4 Mise en route pour un développeur

1. `npm install`, puis `npm run dev` : l'outil s'ouvre en local avec ALFA préchargée.
2. `npm test` : lance les tests du moteur, dont la concordance avec l'annexe F.
3. `npm run build` : produit le dossier statique publié sur GitHub Pages.

## 16. Jeu de données synthétiques

Un générateur documenté à graine fixe produit toutes les données. N'importe qui peut reproduire chaque chiffre de la démonstration, et le processus générateur sert de vérité connue pour tester le moteur.

| Donnée | Génération | Paramètres |
| --- | --- | --- |
| Volumes mensuels 2022 à 2026 | tendance, saisonnalité par BU, bruit AR(1) | croissance de 4 % par an, φ = 0,6 |
| Prix nets | hausse tarifaire annuelle en janvier et bruit | +5 % par an en moyenne |
| Change EUR/MGA | marche aléatoire en logarithme | dérive de 4 % par an, volatilité de 1,8 % par mois |
| Carburant | prix par paliers, révisions discrètes | environ 0,4 révision par an, +8 % à +15 % |
| Coûts matières | prix en EUR et locaux, part importée par BU | parts importées de 30 %, 50 % et 60 % |
| Événements | pertes de comptes et retards de navire injectés à dates connues | journal fourni |
| Budgets 2024 à 2026 | réalisé N-1 × objectif de croissance, biais d'optimisme sur les volumes | +1,5 % |
| Registres 2024 à 2026 | fourchettes volontairement trop étroites | couverture proche de 60 % |

| Règle | Contenu |
| --- | --- |
| R-DS-01 | Aucune donnée d'entreprise réelle. Chaque fichier porte la mention « données synthétiques ». |
| R-DS-02 | Le générateur, sa graine et ses paramètres sont publiés avec le dépôt, avec un dictionnaire de données. Le jeu ALFA est préchargé dans l'outil. |
| R-DS-03 | Les ordres de grandeur restent crédibles pour un distributeur malgache : marge d'EBITDA voisine de 11 %, part importée des coûts matières entre 30 % et 60 %. |
| R-DS-04 | Vérité connue : pour 2027, le générateur tire 1 000 réalisés du même processus. Le moteur, nourri des vrais paramètres, doit être calibré sur eux (TC14). |

## 17. Cas d'utilisation

Dix cas d'utilisation couvrent le cycle complet, de la construction du budget au partage de l'outil.

| Cas | Acteurs | Déclencheur | Scénario nominal | Résultat |
| --- | --- | --- | --- | --- |
| UC01 Préparer le budget probabiliste | FP&A | budget de base validé | import du modèle Excel, contrôles d'entrée, ouverture du registre | budget de base figé |
| UC02 Recueillir une hypothèse | FP&A, propriétaire | atelier planifié | protocole de 5.4, saisie dans l'écran Hypothèses ou dans le modèle Excel | fiche validée |
| UC03 Simuler | tout utilisateur | modification d'une hypothèse, d'un levier ou de la graine | recalcul automatique en tâche de fond, contrôles affichés | distribution à jour en moins d'une seconde |
| UC04 Analyser le risque | FP&A | run valide | onglet Origine du risque, profils de scénarios | analyse documentée |
| UC05 Tester un levier ou un stress | FP&A, CFO | question du CODIR | case à cocher, nouvelle distribution superposée à la base, à aléa commun | comparatif sur deux axes |
| UC06 Produire la note CODIR | FP&A, CFO | analyses validées | bouton Imprimer la note, relecture, validation par le CFO | PDF d'une page |
| UC07 Réestimer en cours d'année | FP&A, propriétaires | clôture mensuelle | import du réalisé, mois clos figés, fourchettes des mois restants mises à jour | probabilité glissante |
| UC08 Backtester et recalibrer | FP&A, relecteur | clôture de l'exercice | import des budgets et registres passés, tests de 11.1, coefficients k | registre recalibré |
| UC09 Partager un scénario | tout utilisateur | besoin de montrer un résultat | bouton Partager : lien sur ALFA, fichier Excel sur données importées | le destinataire retrouve les mêmes chiffres |
| UC10 Essayer avec ses propres données | CFO, contrôleur de gestion | découverte de l'outil | téléchargement des modèles Excel, saisie, glisser-déposer, calcul local | probabilité d'atteinte de son propre budget, sans rien transmettre |

UC07 est le cas qui fait vivre le modèle après le vote du budget. La probabilité glissante, recalculée à chaque clôture, devient un indicateur de pilotage : elle converge vers 0 % ou 100 % à mesure que l'incertitude se résout, et son décrochage signale tôt un budget hors d'atteinte.

UC09 et UC10 font circuler l'outil : un lien suffit pour montrer, un modèle Excel suffit pour essayer, et aucune donnée ne quitte le poste.

Exceptions :

- UC02 : fourchette plus étroite que le seuil de R-HY-02 sans justification. La fiche est rejetée et repart en atelier.
- UC03 : contrôle bloquant en échec. Le voyant passe au rouge, l'impression de la note est désactivée et le détail s'affiche dans l'onglet Contrôles.
- UC05 : levier sans coût direct ou sans date d'effet. L'outil refuse de l'appliquer et indique le champ manquant.
- UC10 : fichier importé non conforme. Les erreurs s'affichent ligne par ligne et aucun calcul ne part.

## 18. Recette : cas de test

Vingt tests : dix-neuf automatisés (Vitest pour le moteur, Playwright pour l'interface) et un test utilisateur. Une version est recevable quand les vingt passent sur le jeu ALFA et que C01 à C12 sont verts.

| Code | Objet | Données de test | Résultat attendu |
| --- | --- | --- | --- |
| TC01 | Réconciliation | toutes les hypothèses au budget | EBITDA = 9,400 GAr à 1 MAr près |
| TC02 | Loi normale | une hypothèse, P10 0,950, P90 1,050 | P10 et P90 empiriques à ±0,001 |
| TC03 | Loi lognormale | P10 0,980, P90 1,025 | médiane 1,0022, σ 0,0175 |
| TC04 | Split-normale | P10 0,955, P50 0,995, P90 1,025 | moyenne 0,9919 à ±0,001 |
| TC05 | Corrélation | deux hypothèses, cible +0,5 | corrélation de rang 0,50 à ±0,02 |
| TC06 | Matrice incohérente | matrice non semi-définie positive | correction, alerte, paires déplacées listées |
| TC07 | Persistance | φ = 0,8, bruit non recentré | écart-type annuel égal à 2,43 fois celui de φ = 0, à ±3 % |
| TC08 | Bruit recentré | φ = 0,6 | total annuel inchangé à 0,01 % près |
| TC09 | Événement | E02, p = 15 % | fréquence de 15 % à ±1 point |
| TC10 | Reproductibilité | deux runs, même graine | identiques bit à bit dans un même navigateur ; entre navigateurs, au plus 1 MAr et 0,1 point d'écart |
| TC11 | Aléa commun | levier neutre, sans effet | écart base / levier exactement nul |
| TC12 | Monotonie | +1 % sur chaque charge et sur le cours | EBITDA en baisse sur toutes les itérations |
| TC13 | Atterrissage | 6 mois figés au réel | dispersion nulle sur les 6 premiers mois |
| TC14 | Calibration sur vérité connue | 1 000 réalisés tirés du processus générateur | couverture P10-P90 entre 77 % et 83 % |
| TC15 | Performance | 10 000 itérations au grain complet | moins de 1 s dans un navigateur récent |
| TC16 | Concordance avec le prototype | registre ALFA, N = 10 000, graine quelconque | valeurs de l'annexe F : percentiles à ±0,05 GAr, probabilités à ±1 point |
| TC17 | Lien de partage | scénario modifié, lien ouvert dans un autre navigateur | mêmes hypothèses, mêmes résultats aux tolérances de TC10 |
| TC18 | Import Excel | modèle contenant 3 erreurs volontaires | 3 messages localisés, aucun calcul lancé |
| TC19 | Confidentialité | chargement puis usage complet de l'outil | aucun appel réseau après le chargement de la page |
| TC20 | Prise en main, test utilisateur | 3 testeurs non techniques, sans aide | probabilité lue et un levier testé en moins de 2 minutes |

Les tolérances de TC02 et TC05 ont été vérifiées sur le prototype : sur 50 graines, l'écart maximal est de 0,00002 sur les quantiles et de 0,012 sur la corrélation. Celles de TC16 valent deux à trois erreurs-types de simulation à N = 10 000 (section 7.4) : un générateur différent donne des tirages différents, mais la même distribution.

## 19. Lotissement et charge

Sept lots, 36 jours de travail, soit environ 18 semaines à raison de 2 jours par semaine. Une première version utilisable de l'outil existe au jour 22. Avec un assistant de code, la charge de développement baisse nettement ; les jalons et leurs critères restent.

&#91;embedded content: feuille de route · 7 lots, 36 jours de travail, 5 jalons\]

| Lot | Contenu | Livrable | Charge (jours) |
| --- | --- | --- | --- |
| Lot 0 Cadrage et données | SFD, jeu ALFA en JSON, modèles Excel, valeurs attendues (annexe F) | données et modèles publiés | 4 |
| Lot 1 Moteur déterministe | M1 et M5 en TypeScript, contrôle C01 | P&L budget reproduit | 4 |
| Lot 2 Lois et tirages | M2, M3, M4 : générateur à graine, LHS, copule, dynamiques ; TC16 | concordance avec le prototype | 7 |
| Lot 3 Interface et restitution | écran unique, graphiques, note imprimable, M6 | première version utilisable | 7 |
| Lot 4 Leviers, stress et partage | M7, lien de partage, imports et exports Excel | outil transmissible | 5 |
| Lot 5 Backtest et calibration | M8, onglet Backtest | coefficients k | 4 |
| Lot 6 Atterrissage et publication | mode en cours d'année, tests d'interface, test utilisateur, GitHub Pages, vidéo de 3 minutes | lien public, démonstration | 5 |
| **Total** |  |  | **36** |

Publier tôt : dès la première version utilisable, une mise en ligne sur GitHub Pages suffit à une première publication. Le partage, le backtest et le suivi en cours d'année viennent ensuite asseoir la crédibilité.

## 20. Risques et limites du modèle

Le modèle mesure l'incertitude qu'on lui décrit, rien de plus. Ses limites tiennent aux fourchettes, aux corrélations, aux risques absents du registre et à la lecture qu'on fait de ses chiffres.

| Risque | Effet | Parade |
| --- | --- | --- |
| Fourchettes trop étroites (excès de confiance) | probabilité surestimée, risque sous-estimé | test du pari, backtest, coefficient k |
| Fourchettes gonflées par prudence | P50 artificiellement bas, budget facile à battre | revue croisée avec l'historique, P50 comparé à la tendance |
| Corrélations instables en crise | queue de distribution sous-estimée | stress tests S1 à S3 et S1 + S3, run de sensibilité avec les corrélations portées à 0,8 |
| Queues trop fines | chocs extrêmes rares sous-représentés | événements discrets en V1, lois à queue épaisse (Student) en V2 |
| Risques absents du registre | angle mort, sur lequel le modèle ne dit rien | revue annuelle avec la cartographie des risques (COSO), ligne « limites » sur chaque note |
| Fausse précision | décisions prises sur des écarts non significatifs | arrondis de R-RI-02, intervalles de confiance, convergence |
| Mauvaise lecture du P50 | le P50 devient un objectif revu à la baisse | principe 1 : le budget reste l'objectif, la probabilité mesure son exigence |
| Structure du modèle erronée | drivers mal spécifiés | réconciliation C01, backtest du déterministe |
| Écarts entre l'outil web et le prototype | chiffres différents selon l'implémentation | valeurs attendues de l'annexe F, TC16 à chaque version |
| Données d'entreprise saisies dans l'outil | fuite si elles sortent du poste | calcul local, aucun appel réseau (TC19), budget importé jamais mis dans un lien (R-RE-07) |
| Navigateur ancien | outil lent ou inutilisable | navigateurs récents exigés, message clair à l'ouverture |
| Dépendance à une personne | outil non maintenable | code documenté, tests automatisés, guide utilisateur |

## Annexe A. Glossaire

| Terme | Définition |
| --- | --- |
| P10, P50, P90 | valeurs que le résultat a 10 %, 50 % et 90 % de chances de ne pas dépasser. Le P10 est le cas défavorable à 1 chance sur 10. |
| Probabilité d'atteinte | part des itérations où l'EBITDA atteint au moins le budget. |
| EBITDA-at-Risk 90 (EaR 90) | écart entre P50 et P10 : ce qu'une année défavorable à 1 chance sur 10 coûte par rapport au médian. |
| CVaR 10 | moyenne des 10 % d'itérations les plus basses, aussi appelée expected shortfall. |
| Itération | un tirage complet de toutes les hypothèses et le P&L qui en résulte. |
| Graine | nombre qui initialise le générateur aléatoire : même graine, mêmes tirages. |
| Hypercube latin (LHS) | échantillonnage qui découpe chaque loi en N tranches de même probabilité et tire une valeur par tranche. |
| Copule gaussienne | méthode qui relie des lois quelconques par une structure de corrélation normale. |
| Corrélation de rang (Spearman) | corrélation calculée sur les rangs, indépendante de la forme des lois. |
| Split-normale | deux demi-lois normales d'écarts-types différents, raccordées au P50. |
| Lognormale | loi d'une grandeur dont le logarithme suit une loi normale : positive, asymétrique à droite. |
| PERT | loi bornée définie par un minimum, un mode et un maximum. |
| AR(1) | processus où chaque mois garde une part φ du choc du mois précédent. |
| Marche aléatoire | processus où chaque mois repart du niveau du mois précédent : les chocs s'accumulent. |
| Aléa commun | réutilisation des mêmes tirages pour comparer deux scénarios. |
| PIT | rang du réalisé dans sa distribution simulée. Uniforme si le modèle est bien calibré. |
| Score de Brier | erreur quadratique moyenne entre une probabilité annoncée et l'issue observée (0 ou 1). |
| CRPS | score qui compare une distribution entière au réalisé ; il généralise l'erreur absolue. |
| Stress test | scénario qui force une ou plusieurs hypothèses à une valeur extrême. |
| Éventail (fan chart) | bande P10-P90 de l'EBITDA cumulé, mois par mois. |
| Référence de run | version de l'outil, empreintes du budget et du registre, graine et N qui identifient un calcul. |
| Lien de scénario | lien qui porte les hypothèses, les leviers, la graine et la version de l'outil ; il rejoue exactement un calcul sur ALFA. |

## Annexe B. Conversion des fourchettes P10 / P90

Les métiers donnent trois nombres, le FP&A en tire les paramètres de la loi. Pour une loi normale, l'écart entre P10 et P90 couvre 2,563 écarts-types.

**Normale.** Exemple TC02 : P10 0,950 et P90 1,050 donnent σ = 0,0390.

```latex
\mu = P_{50}, \qquad \sigma = \frac{P_{90} - P_{10}}{2\,z}, \qquad z = \Phi^{-1}(0{,}9) = 1{,}2816
```

**Lognormale.** Exemple H07 : P10 0,980 et P90 1,025 donnent une médiane de 1,0022 et σ = 0,0175.

```latex
\text{médiane} = \sqrt{P_{10}\,P_{90}}, \qquad \sigma_{\ln} = \frac{\ln(P_{90}/P_{10})}{2\,z}
```

**Split-normale.** Exemple H01 : P10 0,955, P50 0,995 et P90 1,025 donnent σ gauche = 0,0312, σ droite = 0,0234 et une moyenne de 0,9919, sous le P50. Cumulé sur toutes les hypothèses, ce mécanisme coûte 346 MAr au P50 simulé (section 8.3).

```latex
\sigma_g = \frac{P_{50} - P_{10}}{z}, \quad \sigma_d = \frac{P_{90} - P_{50}}{z}, \quad x = \begin{cases} P_{50} + \sigma_g\,u & u < 0 \\ P_{50} + \sigma_d\,u & u \ge 0 \end{cases}, \quad u \sim \mathcal{N}(0,1)
```

```latex
E[x] = P_{50} + \frac{\sigma_d - \sigma_g}{\sqrt{2\pi}}
```

**PERT**, à partir d'un minimum a, d'un mode m et d'un maximum b : x = a + (b - a) × B, où B suit une loi bêta de paramètres α et β.

```latex
E[x] = \frac{a + 4m + b}{6}, \qquad \alpha = 1 + 4\,\frac{m - a}{b - a}, \qquad \beta = 1 + 4\,\frac{b - m}{b - a}
```

**Bernoulli × amplitude.** Survenance si U > 1 - p, où U est l'uniforme corrélée issue de la copule. Amplitude uniforme entre ses bornes, mois uniforme de 1 à 12.

**Élargissement par le backtest** (R-HY-03) :

```latex
P'_{10} = P_{50} - k\,(P_{50} - P_{10}), \qquad P'_{90} = P_{50} + k\,(P_{90} - P_{50})
```

## Annexe C. Dynamiques temporelles

**Bruit mensuel AR(1) des volumes**, persistance φ et écart-type σ :

```latex
\eta_t = \varphi\,\eta_{t-1} + \sqrt{1-\varphi^2}\;\sigma\,\varepsilon_t, \qquad \varepsilon_t \sim \mathcal{N}(0,1)
```

**Recentrage** sur la saisonnalité budgétée s(t), dont la somme vaut 1 sur l'année. Le total annuel du volume vaut alors exactement le niveau tiré H(b) (contrôle C11).

```latex
\tilde\eta_t = \eta_t - \sum_{u=1}^{12} s_u\,\eta_u, \qquad V_{b,t} = V^{\text{budget}}_{b,t} \times H_b \times (1 + \tilde\eta_{b,t})
```

**Effet de la persistance sur la dispersion annuelle.** Rapport entre l'écart-type de la somme de 12 mois AR(1) et celui de 12 mois indépendants :

```latex
\frac{\sigma\left(\sum_{t=1}^{12} x_t\right)}{\sigma\sqrt{12}} = \sqrt{\frac{12 + 2\sum_{k=1}^{11}(12-k)\,\varphi^k}{12}}
```

| Persistance φ | Multiplicateur de l'écart-type annuel |
| --- | --- |
| 0 | 1,00 |
| 0,5 | 1,63 |
| 0,8 | 2,43 |
| 0,9 | 2,87 |
| 1, choc permanent | 3,46 |

**Marche aléatoire du change**, départ S(0) = 5 100 :

```latex
\ln S_t = \ln S_{t-1} + \mu + \sigma_m\,\varepsilon_t, \qquad \mu = \frac{4\,\%}{12}, \qquad \sigma_m = 1{,}8\,\%
```

**Dispersion du cours moyen de l'année.** Le choc du mois j pèse sur les 13 - j derniers mois de la moyenne :

```latex
\sigma\left(\overline{\ln S}\right) = \sigma_m \sqrt{\frac{1}{144}\sum_{j=1}^{12} j^2} = 2{,}125\,\sigma_m = 3{,}8\,\%
```

Médiane du cours moyen : 5 100 × exp(6,5 μ) = 5 212. P10 et P90 analytiques : 4 962 et 5 473, contre 4 963 et 5 477 simulés.

**Sauts.** Mois de survenance τ tiré uniformément. Le facteur (1 + a) s'applique de τ à décembre pour un saut persistant (E01, E02), au seul mois τ pour un choc ponctuel (E03).

## Annexe D. Échantillonnage et corrélations

**1. Hypercube latin.** Pour chaque colonne j, π(j) est une permutation aléatoire de 1 à N : chaque tranche de probabilité 1/N reçoit exactement un tirage.

```latex
U_{i,j} = \frac{\pi_j(i) - V_{i,j}}{N}, \qquad V_{i,j} \sim \mathcal{U}(0,1)
```

**2. Passage aux normales** : Z = Φ⁻¹(U).

**3. Corrélations.** Conversion des corrélations de rang saisies en corrélations de la copule, puis décomposition de Cholesky :

```latex
\rho = 2\sin\left(\frac{\pi\,\rho_S}{6}\right), \qquad R = L\,L^{\top}, \qquad Z^{c} = Z\,L^{\top}
```

| Rang saisi | Copule |
| --- | --- |
| 0,2 | 0,209 |
| 0,3 | 0,313 |
| 0,4 | 0,416 |
| 0,5 | 0,518 |
| 0,6 | 0,618 |
| 0,7 | 0,717 |

L'écart est faible, 0,018 au plus (vers 0,6), mais systématique : sans conversion, toutes les corrélations de rang obtenues seraient légèrement sous leur cible.

**4. Retour aux lois** : X(j) = F(j)⁻¹(Φ(Zᶜ(j))), fonction quantile de la loi de l'hypothèse j.

**5. Chocs mensuels du change.** Le choc annuel z, stratifié et corrélé comme les autres, est réparti en 12 chocs mensuels tirés conditionnellement :

```latex
\varepsilon = z\,\hat w + \left(\eta - (\eta^{\top}\hat w)\,\hat w\right), \qquad \hat w = \frac{w}{\lVert w \rVert}, \quad w_t = \frac{13 - t}{12}, \quad \eta \sim \mathcal{N}(0, I_{12})
```

On a exactement ŵ · ε = z : le cours moyen de l'année suit le choc stratifié, et la trajectoire garde la bonne loi conditionnelle.

**6. Matrice non semi-définie positive.** Correction par la matrice de corrélation la plus proche (méthode de Higham, projections alternées), puis alerte (R-DE-02).

**Variante.** La méthode d'Iman et Conover réordonne des échantillons marginaux exacts pour imposer les corrélations de rang. Elle s'impose en V2 si des lois empiriques, non paramétriques, entrent dans le registre.

## Annexe E. Calibration et convergence

**Erreur-type d'une probabilité**, tirage simple. Pour p = 0,30 et N = 10 000 : 0,46 point, soit ±0,9 point à 95 %. Le LHS ramène l'intervalle à ±0,6 point (mesure de 7.4).

```latex
\text{SE}(\hat p) = \sqrt{\frac{p\,(1-p)}{N}}
```

**Erreur-type d'un quantile**, f étant la densité au quantile. Faute de forme fermée, le moteur l'estime par lots : 20 lots de N / 20 itérations, écart-type des 20 P10 divisé par √20.

```latex
\text{SE}(\hat q_\alpha) \approx \frac{1}{f(q_\alpha)}\sqrt{\frac{\alpha\,(1-\alpha)}{N}}
```

**Coefficient d'élargissement** à partir de la couverture observée c de l'intervalle P10-P90 :

```latex
k = \frac{\Phi^{-1}(0{,}9)}{\Phi^{-1}\!\left(\frac{1 + c}{2}\right)}
```

| Couverture observée c | Coefficient k |
| --- | --- |
| 58 % | 1,59 |
| 60 % | 1,52 |
| 65 % | 1,37 |
| 70 % | 1,24 |
| 80 % | 1,00 |

**PIT** : u = F(y), rang du réalisé y parmi les N itérations, divisé par N. Si le modèle est calibré, u est uniforme : chaque classe de 20 points reçoit 20 % des observations.

**Score de Brier**, p(i) probabilité annoncée, o(i) issue observée (1 si le budget du trimestre est atteint, 0 sinon) :

```latex
BS = \frac{1}{n}\sum_{i=1}^{n}\left(p_i - o_i\right)^2
```

**CRPS**, calculé directement sur les itérations x(i) : moyenne des |x(i) - y| moins la moitié de la moyenne des |x(i) - x(j)|.

```latex
\text{CRPS}(F, y) = \int_{-\infty}^{+\infty}\left(F(x) - \mathbf{1}\{x \ge y\}\right)^2 dx = E\,|X - y| - \tfrac{1}{2}\,E\,|X - X'|
```

## Annexe F. Jeu de référence ALFA et valeurs attendues

Tout ce qu'il faut pour qu'une implémentation retrouve les chiffres du document : données exactes du jeu ALFA, règles de calcul mois par mois, résultats attendus avec leurs tolérances. Le prototype de référence (prototype\_alfa.py, dossier reference du dépôt) reproduit ces valeurs à l'identique avec la graine 2027.

### F.1 Données et registre

Prêt à copier dans data/alfa : décimales au point, montants en GAr.

```json
{
  "budget": {
    "bu": ["Boissons", "Epicerie", "Hygiene"],
    "ca": [40.0, 30.0, 15.0],
    "cout_matiere": [23.2, 18.9, 8.9],
    "part_importee": [0.30, 0.50, 0.60],
    "transport": {"carburant": 2.0, "sous_traitance": 2.6, "autres": 1.4},
    "masse_salariale": 10.5,
    "frais_commerciaux": {"total": 4.5, "part_variable": 0.6},
    "frais_generaux": 3.6,
    "cours_budget_eur_mga": 5200,
    "ebitda": 9.4
  },
  "registre": {
    "H01": {"libelle": "Volume Boissons", "loi": "split-normale", "p10": 0.955, "p50": 0.995, "p90": 1.025},
    "H02": {"libelle": "Volume Epicerie", "loi": "split-normale", "p10": 0.965, "p50": 1.000, "p90": 1.025},
    "H03": {"libelle": "Volume Hygiene", "loi": "normale", "p10": 0.960, "p50": 1.000, "p90": 1.040},
    "H04": {"libelle": "Prix net realise", "loi": "split-normale", "p10": 0.990, "p50": 1.000, "p90": 1.005},
    "H05": {"libelle": "Mix, points de marge brute", "loi": "normale", "p10": -0.4, "p50": 0.0, "p90": 0.4},
    "H06": {"libelle": "Change EUR/MGA", "loi": "marche-aleatoire", "depart": 5100, "derive_annuelle": 0.04, "volatilite_mensuelle": 0.018},
    "H07": {"libelle": "Prix d'achat importes", "loi": "lognormale", "p10": 0.980, "p90": 1.025},
    "H08": {"libelle": "Prix d'achat locaux", "loi": "split-normale", "p10": 0.990, "p50": 1.000, "p90": 1.020},
    "H09": {"libelle": "Tarifs transporteurs", "loi": "split-normale", "p10": 0.995, "p50": 1.010, "p90": 1.040},
    "H10": {"libelle": "Masse salariale", "loi": "split-normale", "p10": 0.995, "p50": 1.000, "p90": 1.015},
    "H11": {"libelle": "Frais commerciaux", "loi": "split-normale", "p10": 0.970, "p50": 1.000, "p90": 1.040},
    "H12": {"libelle": "Frais generaux", "loi": "split-normale", "p10": 0.990, "p50": 1.000, "p90": 1.030},
    "E01": {"libelle": "Revision du prix du carburant", "p": 0.35, "amplitude": [0.08, 0.15], "duree": "jusqu'a decembre"},
    "E02": {"libelle": "Perte d'un grand compte GMS", "p": 0.15, "amplitude": [0.04, 0.08], "bu": ["Boissons", "Epicerie"], "duree": "jusqu'a decembre"},
    "E03": {"libelle": "Retard de navire", "p": 0.25, "amplitude": [0.15, 0.25], "bu": ["Epicerie", "Hygiene"], "surcout": [0.03, 0.06], "duree": "un mois"}
  },
  "correlations_rang": [
    ["H06", "E01", 0.5], ["H06", "H08", 0.4], ["H06", "H09", 0.4], ["H06", "H12", 0.3], ["H06", "H10", 0.2],
    ["H06", "H01", -0.2], ["H06", "H02", -0.2], ["H06", "H03", -0.2],
    ["H04", "H01", -0.3], ["H04", "H02", -0.3], ["H04", "H03", -0.3],
    ["H01", "H02", 0.5], ["H02", "H03", 0.5], ["H01", "H03", 0.4],
    ["E01", "H09", 0.6], ["H08", "H12", 0.3], ["H11", "H01", -0.3], ["H11", "H02", -0.3]
  ],
  "bruit_volumes": {"phi": 0.6, "sigma_mensuel": 0.03},
  "simulation": {"n": 10000, "graine": 2027}
}
```

Saisonnalité budgétée : part de chaque mois dans le CA et le coût matière annuels de la BU.

```csv
mois,boissons,epicerie,hygiene
1,0.095,0.080,0.082
2,0.090,0.078,0.080
3,0.085,0.080,0.083
4,0.075,0.080,0.082
5,0.070,0.082,0.083
6,0.065,0.080,0.082
7,0.065,0.080,0.083
8,0.070,0.082,0.083
9,0.080,0.085,0.084
10,0.090,0.085,0.084
11,0.100,0.088,0.085
12,0.115,0.100,0.089
```

### F.2 Règles de calcul mois par mois

b désigne la BU, t le mois de 1 à 12, s(b,t) la saisonnalité, V(b,t) le facteur de volume simulé.

1. Volume : V(b,t) = H(b) × (1 + bruit recentré), réduit de a(E02) pour Boissons et Épicerie à partir du mois τ(E02), et de a(E03) pour Épicerie et Hygiène au seul mois τ(E03).
2. CA(b,t) = CA(b) × s(b,t) × V(b,t) × H04.
3. Coût matière(b,t) = CM(b) × s(b,t) × V(b,t) × \[imp(b) × S(t) / 5 200 × H07 + (1 - imp(b)) × H08\].
4. Mix(t) = H05 / 100 × CA(t), CA(t) étant la somme des trois BU.
5. Poids du mois w(t) = CA budget du mois / 85 ; indice de volume I(t) = somme des CA budget(b,t) × V(b,t), divisée par la somme des CA budget(b,t).
6. Transport(t) = 2,0 × w(t) × I(t) × (1 + a(E01) à partir de τ(E01)) + 2,6 × w(t) × I(t) × H09 + 1,4 / 12, plus le surcoût c(E03) au mois τ(E03).
7. Masse salariale(t) = 10,5 / 12 × H10 ; frais généraux(t) = 3,6 / 12 × H12.
8. Frais commerciaux(t) = 4,5 × (0,6 × CA(t) / 85 + 0,4 / 12) × H11.
9. EBITDA(t) = CA(t) - coût matière(t) + mix(t) - transport(t) - masse salariale(t) - frais commerciaux(t) - frais généraux(t). L'EBITDA annuel est la somme des 12 mois.
10. Change : ln S(t) = ln 5 100 + (0,04 / 12) × t + 0,018 × (ε(1) + … + ε(t)), chocs mensuels construits selon l'annexe D.
11. Événements : survenance si Φ(Z) > 1 - p ; mois τ uniforme de 1 à 12 ; amplitude et surcoût uniformes entre leurs bornes.
12. Bruit des volumes : AR(1) avec φ = 0,6 et σ = 3 %, premier mois tiré selon une normale d'écart-type σ, puis recentré sur s(b,t) (annexe C).

### F.3 Règles exactes des leviers et des stress tests

| Code | Règle |
| --- | --- |
| L1 | coût matière importé valorisé pour moitié au cours S(t), pour moitié à 5 250 |
| L2 | à partir d'avril, prix Épicerie et Hygiène × 1,01 et volumes × 0,992 |
| L3 | frais généraux diminués de 0,25 / 12 par mois à partir d'avril ; coût unique de 0,05 en janvier |
| L4 | H09 plafonné à 1,03 |
| L5 | amplitude de E03 × 0,25, surcoût de E03 supprimé, frais généraux augmentés de 0,16 / 12 par mois |
| S1 | S(t) × 1,15 à partir d'avril |
| S2 | E02 forcé : volumes Boissons et Épicerie × 0,88 à partir d'avril |
| S3 | carburant × 1,25 à partir d'avril, en plus de E01 |

### F.4 Valeurs attendues

N = 10 000. Une implémentation avec un autre générateur doit tomber dans les tolérances (TC16) ; les deux premières lignes, sans aléa, doivent être retrouvées exactement.

| Indicateur | Référence, graine 2027 | Tolérance |
| --- | --- | --- |
| C01 : tout au budget, sans aléa | 9,400 GAr | ±0,001 |
| Hypothèses à leur P50, change sur sa trajectoire médiane, sans aléa | 9,197 GAr | ±0,001 |
| P10 | 6,64 GAr | ±0,05 |
| P50 | 8,63 GAr | ±0,05 |
| P90 | 10,44 GAr | ±0,05 |
| Moyenne | 8,59 GAr | ±0,05 |
| Probabilité d'atteindre 9,4 GAr | 29,9 % | ±1 point |
| EaR 90 | 1,98 GAr | ±0,05 |
| CVaR 10 | 5,93 GAr | ±0,05 |
| Fréquences de E01, E02, E03 | 34,6 %, 15,0 %, 25,0 % | ±1 point |

Leviers et stress tests, mêmes tolérances : ±1 point sur les probabilités, ±0,05 GAr sur les P50.

| Cas | Probabilité d'atteinte | P50 (GAr) |
| --- | --- | --- |
| L1 | 22,8 % | 8,56 |
| L2 | 36,6 % | 8,87 |
| L3 | 33,6 % | 8,76 |
| L4 | 30,0 % | 8,63 |
| L5 | 27,3 % | 8,51 |
| Paquet A : L2 + L3 | 39,9 % | 9,01 |
| Paquet B : L1 + L2 + L3 | 34,4 % | 8,94 |
| S1 | 1,5 % | 6,19 |
| S2 | 2,2 % | 6,84 |
| S3 | 21,4 % | 8,25 |
| S1 + S3 | 0,7 % | 5,81 |
