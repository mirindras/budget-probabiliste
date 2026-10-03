# Prototype de référence

`prototype_alfa.py` calcule le budget probabiliste ALFA 2027 avec numpy et scipy. Il fournit les valeurs attendues de l'annexe F de la SFD ; l'outil web doit les retrouver aux tolérances du test TC16 (percentiles à ±0,05 GAr, probabilités à ±1 point, N = 10 000).

```bash
pip install numpy scipy
python reference/prototype_alfa.py
```

Sortie attendue (graine 2027) :

| Indicateur | Valeur |
| --- | --- |
| C01, tout au budget | 9,4000 GAr |
| Hypothèses au P50, sans aléa | 9,1965 GAr |
| P10 / P50 / P90 | 6,642 / 8,627 / 10,443 GAr |
| Moyenne | 8,588 GAr |
| Probabilité d'atteinte | 29,9 % |
| EaR 90 / CVaR 10 | 1,985 / 5,925 GAr |
| C03 / C04 | 0,026 / 0,227 |
| Fréquences E01 / E02 / E03 | 34,6 % / 15,0 % / 25,0 % |

Le prototype et l'outil n'utilisent pas le même générateur pseudo-aléatoire : leurs tirages diffèrent, leurs distributions coïncident. `tests/engine/simulate.test.ts` vérifie l'outil contre ces valeurs.
