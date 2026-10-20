# Guide utilisateur : budget probabiliste en une page

L'outil dit quelle chance a l'EBITDA budgété d'être atteint, ce qu'on perd dans une mauvaise année, d'où vient le risque et quelles actions le réduisent. Il s'ouvre par un lien et calcule dans votre navigateur : rien n'est envoyé.

## Deux vues

- **Synthèse CODIR** (vue par défaut) : la réponse en une phrase, les chiffres clés, ce qui fait bouger le résultat, les décisions sur la table et les « et si ». Pensée pour le CFO et le CODIR.
- **Analyse détaillée** : hypothèses en curseurs, leviers et stress, onglets Origine du risque, Trajectoire mensuelle, Backtest, Registre et Contrôles. Pensée pour le contrôle de gestion et le FP&A.

On passe de l'une à l'autre par le bouton en haut de l'écran ; l'outil retient la dernière vue utilisée sur ce poste.

## 1. Lire le résultat (30 secondes)

- **Le grand pourcentage** est la probabilité d'atteindre le budget : la part des 10 000 années simulées où l'EBITDA atteint au moins le chiffre budgété.
- **Le graphique** montre ces 10 000 années. Les barres foncées sont celles qui atteignent le budget ; la ligne rouge pointillée est le budget.
- **Année défavorable** (P10) : 1 chance sur 10 de faire moins. **Risque (EaR 90)** : ce qu'une telle année coûte par rapport au résultat médian (P50, 1 chance sur 2 de faire moins).
- Survolez une barre pour voir sa fourchette et son nombre d'itérations. Survolez un libellé souligné pour sa définition.

## 2. Tester une action (1 minute)

Dans la colonne de droite, cochez un levier, par exemple « Hausse tarifaire ciblée ». La nouvelle distribution se superpose en orange et l'écart s'affiche à côté de la case et sous la probabilité. Les paquets (A et B sur ALFA) cochent plusieurs leviers d'un coup.

Les stress tests répondent à « et si » : ils ne prévoient rien, ils mesurent la résistance du budget à un choc. Leviers, stress tests et paquets se créent, se règlent et se retirent dans l'onglet Registre.

## 3. Modifier une hypothèse

Dans la colonne de gauche, cliquez sur une hypothèse : trois curseurs règlent la valeur qui n'a qu'une chance sur 10 d'être plus basse (P10), la valeur centrale (P50) et celle qui n'a qu'une chance sur 10 d'être plus haute (P90). Le calcul repart seul. La petite règle sous chaque hypothèse montre la fourchette (bleu) et le budget (trait rouge).

Modifier le registre crée une nouvelle version en brouillon. Pour la présenter, faites valider les fiches puis gelez le registre (onglet Registre).

## 3 bis. Préparer toutes les entrées sans rien oublier : la saisie guidée

Le bouton **Saisie guidée**, en haut de l'écran, passe en revue chaque entrée en six étapes : budget de base, hypothèses, événements, liens entre hypothèses, revue des risques, bilan. Un compteur indique combien d'éléments sont prêts.

- **Le budget de base** : chaque rubrique du P&L, son montant et les hypothèses qui la font varier ; une rubrique que rien ne fait varier est signalée.
- **Ajouter ou retirer** : chaque hypothèse dit ce qui varie (volume, prix de vente, montant d'un poste, cours de change, points de marge) et sur quoi (des BU, une rubrique, des postes) ; chaque événement touche les volumes ou un montant, à la baisse ou à la hausse. « Ajouter » crée une entrée en brouillon, à faire valider par son propriétaire ; « Retirer » la supprime avec ses corrélations et les leviers qui la visaient.
- **Les postes sans hypothèse** restent au budget, sans incertitude : pour chacun, créez une hypothèse ou confirmez qu'il est certain (un loyer contractuel, par exemple).
- **Une question par entrée**, à poser à son propriétaire, avec qui doit répondre, où chercher la réponse et le piège à éviter.
- **Une saisie en écart au budget** : −3 veut dire 3 % sous le budget. Une phrase en clair relit la fourchette (« 1 chance sur 10 d'être à −4,5 % du budget ou moins… ») pour vérifier qu'elle dit bien ce que pense le propriétaire.
- **Des contrôles en direct** : bloquant (P10 au-dessus du P50, propriétaire absent) ou à revoir (fourchette de moins de 1 %, valeur centrale loin du budget, justification trop courte, probabilité nulle ou quasi certaine).
- **Une aide au calcul des probabilités** : « 2 années touchées sur 5 observées » donne une estimation prudente de 43 %, jamais 0 ni 100 %.
- **La revue des risques** : seize familles (change, client clé, fiscalité, climat, cyber…) reçoivent chacune une décision. Un risque laissé hors modèle est nommé dans la note CODIR.

## 4. Aller plus loin : les onglets

| Onglet | Pour quoi faire |
| --- | --- |
| Origine du risque | quelles hypothèses pèsent, effet d'une action ciblée, année « 1 chance sur 10 », trimestres et BU |
| Trajectoire mensuelle | éventail de l'EBITDA cumulé ; en cours d'année, figez les mois clos pour obtenir la probabilité glissante |
| Backtest | le modèle jugé sur 2024 à 2026 (jeu ALFA) ; bouton pour élargir les fourchettes trop étroites |
| Registre | fiches complètes, corrélations ; leviers, stress tests et paquets à créer ou retirer ; nombre d'itérations, graine |
| Contrôles | les 12 voyants ; un voyant rouge bloquant désactive la note CODIR |

## 5. Partager et restituer

- **Partager** copie un lien qui rejoue exactement le scénario (hypothèses, leviers, graine). Sur vos propres données, le scénario part dans un fichier Excel, jamais dans un lien.
- **Imprimer la note** produit la note CODIR d'une page A4 (choisissez « Enregistrer au format PDF »).
- **Exporter** donne les résultats en Excel (tables prêtes pour Power BI), le registre réimportable et les modèles vierges.

## 6. Essayer avec vos données

1. Fichiers → « Télécharger les modèles Excel à remplir ». Dans BUDGET_BASE.xlsx, décrivez votre P&L : l'unité et l'EBITDA publié (feuille PARAMETRES), les lignes du P&L (RUBRIQUES : chiffre d'affaires, autre produit ou charge), puis un poste par ligne avec sa rubrique, sa BU, son assiette, sa part en devises et ses douze montants (POSTES).
2. Déposez le fichier sur la page. Les erreurs s'affichent ligne par ligne et aucun calcul ne part tant qu'elles ne sont pas corrigées.
3. L'outil propose un registre de départ (volume par BU, prix, une hypothèse par rubrique de charges, le change s'il y a des devises) : complétez-le dans la saisie guidée, ou dans REGISTRE_HYPOTHESES.xlsx où une ligne ajoutée est une hypothèse de plus et une ligne supprimée une hypothèse de moins. La feuille GUIDE donne les questions à poser, la feuille REFERENTIEL les BU, rubriques et postes à citer dans la colonne `porte_sur`.

L'ancien modèle détaillé d'un distributeur (ventes par canal et par famille) reste accepté. « Revenir au jeu de démonstration ALFA » efface le brouillon conservé sur votre poste.

## À retenir

Le budget reste l'objectif : la probabilité mesure son exigence, elle ne le remplace pas. Les probabilités de la note sont arrondies à 5 points ; les écarts entre leviers se lisent au point près, car ils sont calculés sur les mêmes tirages.
