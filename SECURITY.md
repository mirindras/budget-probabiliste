# Sécurité

L'outil est une page statique : le calcul, l'import et l'export se font dans le navigateur de l'utilisateur, aucune donnée n'est envoyée à un serveur. Les entrées externes sont donc les fichiers qu'il dépose et les liens de partage qu'il ouvre. Chacune est bornée avant lecture, puis validée avant tout calcul.

## Fichiers importés

Contrôles de [src/io/limits.ts](src/io/limits.ts), appliqués avant que SheetJS ne lise le fichier :

| Contrôle | Limite | Usage réel (ALFA) |
| --- | --- | --- |
| Formats acceptés | `.xlsx` et `.csv` seulement (`.xls`, `.xlsm` refusés) | `.xlsx` |
| Fichiers par import | 10 | 1 |
| Taille d'un fichier | 5 Mo | 62 Ko |
| Signature | archive zip pour un `.xlsx` | |
| Contenu décompressé | 50 Mo, lus dans le répertoire central du zip sans rien décompresser | 153 Ko |
| Feuilles par classeur | 20 | 4 |
| Lignes par feuille | 50 000 (lecture tronquée au-delà, puis refus) | 433 |
| Colonnes par feuille | 50 | 8 |
| Lignes d'un CSV | 50 000, comptées avant lecture | |

Un fichier hors limites est refusé avec un message localisé, et aucun calcul n'est lancé. Les contrôles métier suivent (R-IN-01 à R-IN-04, clé unique mois × BU × canal × famille), puis la validation de structure du scénario ([src/engine/schema.ts](src/engine/schema.ts)).

## Liens de partage

Le scénario voyage compressé dans l'ancre de l'URL, jamais envoyée au serveur. [src/io/share.ts](src/io/share.ts) le borne en trois temps :

1. avant décompression : 16 000 caractères au plus, alphabet de lz-string seulement (un lien ALFA en fait 7 559) ; un scénario plus long n'est pas mis en lien, il part dans un fichier Excel ;
2. avant analyse JSON : 100 000 caractères décompressés au plus (11 724 pour ALFA) ;
3. avant calcul : structure complète (codes attendus, types, bornes, textes de 2 000 caractères au plus), puis règles métier.

Un lien refusé ouvre le jeu ALFA et affiche « Lien de partage invalide » avec la raison.

Limite connue : lz-string ne permet pas de borner la décompression elle-même. Avec 16 000 caractères en entrée, le pire cas théorique reste de l'ordre de quelques dizaines de mégaoctets, transitoires, avant le refus de l'étape 2.

## Dépendance SheetJS

SheetJS ne publie plus ses versions sur npm : la dernière, 0.18.5, porte CVE-2023-30533 (pollution de prototype) et CVE-2024-22363 (ReDoS). Le projet installe la version 0.20.3, qui corrige les deux, depuis le CDN officiel :

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

- **Intégrité.** `package-lock.json` garde l'empreinte SHA-512 de l'archive ; `npm ci` refuse toute archive différente.
- **Contrôle en CI.** `npm run check:sheetjs` ([scripts/check-sheetjs.mjs](scripts/check-sheetjs.mjs)) vérifie à chaque push que la dépendance pointe vers le CDN officiel, que le lockfile porte l'empreinte et que la version installée n'est pas vulnérable. La publication n'a lieu que si ce contrôle passe, avec la recette complète.
- **Outils d'audit.** `npm audit` et Dependabot ne suivent pas une dépendance installée par URL : ils peuvent l'ignorer, ou signaler à tort la version 0.20.3 en la confondant avec la 0.18.5 de npm. La version réellement installée fait foi : `npm ls xlsx`.
- **Mises à jour.** Elles ne sont pas automatiques. Pour passer à une nouvelle version, après lecture des notes de version sur https://cdn.sheetjs.com :

  ```bash
  npm install --save https://cdn.sheetjs.com/xlsx-X.Y.Z/xlsx-X.Y.Z.tgz
  npm run check:sheetjs && npm run check && npm test
  ```

  puis pousser : la CI rejoue toute la recette, interface comprise, avant publication.

## Signaler une vulnérabilité

Ouvrir un avis privé depuis l'onglet Security du dépôt (Report a vulnerability), plutôt qu'une issue publique.
