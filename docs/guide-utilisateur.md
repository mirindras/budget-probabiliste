# Guide utilisateur : budget probabiliste en une page

L'outil dit quelle chance a l'EBITDA budgété d'être atteint, ce qu'on perd dans une mauvaise année, d'où vient le risque et quelles actions le réduisent. Il s'ouvre par un lien et calcule dans votre navigateur : rien n'est envoyé.

## Deux vues

- **Synthèse CODIR** (vue par défaut) : la réponse en une phrase, les chiffres clés, ce qui fait bouger le résultat, les décisions sur la table et les « et si ». Pensée pour le CFO et le CODIR.
- **Analyse détaillée** : hypothèses en curseurs, leviers et stress, onglets Origine du risque, Trajectoire mensuelle, Backtest, Registre et Contrôles. Pensée pour le contrôle de gestion et le FP&A.

On passe de l'une à l'autre par le bouton en haut de l'écran ; l'outil retient la dernière vue utilisée sur ce poste.

## 1. Lire le résultat (30 secondes)

- **Le grand pourcentage** est la probabilité d'atteindre le budget : la part des 10 000 années simulées où l'EBITDA atteint au moins le chiffre budgété.
- **Le graphique** montre ces 10 000 années. Les barres foncées sont celles qui atteignent le budget ; la ligne rouge pointillée est le budget.
- **Année défavorable** (P10) : 1 chance sur 10 de faire moins. **Risque (EaR 90)** : ce qu'une telle année coûte par rapport au résultat médian.
- Survolez une barre pour voir sa fourchette et son nombre d'itérations. Survolez un libellé souligné pour sa définition.

## 2. Tester une action (1 minute)

Dans la colonne de droite, cochez un levier, par exemple « Hausse tarifaire ciblée ». La nouvelle distribution se superpose en orange et l'écart s'affiche à côté de la case et sous la probabilité. Les paquets A et B cochent plusieurs leviers d'un coup.

Les stress tests (S1 à S3) répondent à « et si » : ils ne prévoient rien, ils mesurent la résistance du budget à un choc.

## 3. Modifier une hypothèse

Dans la colonne de gauche, cliquez sur une hypothèse : trois curseurs règlent la valeur qui n'a qu'une chance sur 10 d'être plus basse (P10), la valeur centrale (P50) et celle qui n'a qu'une chance sur 10 d'être plus haute (P90). Le calcul repart seul. La petite règle sous chaque hypothèse montre la fourchette (bleu) et le budget (trait rouge).

Modifier le registre crée une nouvelle version en brouillon. Pour la présenter, faites valider les fiches puis gelez le registre (onglet Registre).

## 4. Aller plus loin : les onglets

| Onglet | Pour quoi faire |
| --- | --- |
| Origine du risque | quelles hypothèses pèsent, effet d'une action ciblée, année « 1 chance sur 10 », trimestres et BU |
| Trajectoire mensuelle | éventail de l'EBITDA cumulé ; en cours d'année, figez les mois clos pour obtenir la probabilité glissante |
| Backtest | le modèle jugé sur 2024 à 2026 ; bouton pour élargir les fourchettes trop étroites |
| Registre | fiches complètes, corrélations, leviers, nombre d'itérations, graine |
| Contrôles | les 12 voyants ; un voyant rouge bloquant désactive la note CODIR |

## 5. Partager et restituer

- **Partager** copie un lien qui rejoue exactement le scénario (hypothèses, leviers, graine). Sur vos propres données, le scénario part dans un fichier Excel, jamais dans un lien.
- **Imprimer la note** produit la note CODIR d'une page A4 (choisissez « Enregistrer au format PDF »).
- **Exporter** donne les résultats en Excel (tables prêtes pour Power BI), le registre réimportable et les modèles vierges.

## 6. Essayer avec vos données

Exporter → « Modèles Excel à remplir », complétez BUDGET_BASE.xlsx, puis déposez-le sur la page. Les erreurs s'affichent ligne par ligne et aucun calcul ne part tant qu'elles ne sont pas corrigées. « Revenir à ALFA » efface le brouillon conservé sur votre poste.

## À retenir

Le budget reste l'objectif : la probabilité mesure son exigence, elle ne le remplace pas. Les probabilités de la note sont arrondies à 5 points ; les écarts entre leviers se lisent au point près, car ils sont calculés sur les mêmes tirages.
