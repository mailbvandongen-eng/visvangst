# Toets watertemperatuurmodel

1. `node tools/validatie/fetch-hhnk.mjs` — 45 dagen watertemperatuur van de HHNK-meetpunten (Lizard, openbaar)
2. `node tools/validatie/fetch-rest.mjs` — RWS-meetpunten erbij, type water uit TOP10NL, weer uit Open-Meteo
3. `npx tsx tools/validatie/validate.ts` — fit op de helft, toets op de andere helft, vergelijk met RWS-meetpunt en luchtgemiddelde
4. `npx tsx tools/validatie/slootdiepte.ts` — gevoeligheid van de slootdiepte

Uitslag 21-11-2026 (toetshelft, gemiddelde fout in °C):

| water | model | dichtstbijzijnd RWS-meetpunt | lucht 7 dagen |
|---|---|---|---|
| polderwatergang 3–50 m (n=8) | **0,56** | 1,06 | 0,88 |
| plas, diepte onbekend (n=1) | **0,82** | 1,94 | 0,97 |
| sloot < 3 m (n=5) | 1,43 | 1,29 | 1,72 |

Verandering over 24 uur (correlatie met meting): watergang model 0,82 vs RWS 0,46; plas 0,79 vs −0,02; sloot 0,45 vs 0,46.
Groot water (IJsselmeer, Markermeer, grote kanalen): het RWS-meetpunt is beter dan het model.
