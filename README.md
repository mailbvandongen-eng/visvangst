# Visvangst

Hoe groot is de kans op actieve vis, hier en nu? Eén scherm met een score van ½ visje (kansloos) tot 5 visjes (Top!), voor zoet en zout water en per vissoort.

**Live:** https://mailbvandongen-eng.github.io/visvangst/

## Wat er op het scherm staat

- **Visjes**: de kans per uur, met het beste moment van de dag. De uitleg van de score staat in het menu.
- **Zoet of zout** (standaard zoet), en een soort of groep: roofvis (snoek, snoekbaars, baars), witvis, karper, zeevis (zeebaars, kabeljauw en wijting, platvis, makreel).
- **Vandaag, morgen, overmorgen**: morgen en overmorgen zijn een verwachting.
- **Maan**: foto van NASA voor die dag, percentage verlicht, springtij of doodtij.
- **Luchtdruk** met trend, **temperatuur** van lucht en water, **getij** van het dichtstbijzijnde station (zelf te kiezen).
- **Per uur**: visscore, regenkans, zon, wind (Beaufort), zonsopkomst en -ondergang.
- **Donker of licht**: standaard donker, de keuze wordt onthouden (menu).

## Hoe de score werkt

Per uur krijgt elke factor een waarde van 0 tot 1. De weging volgt wat onderzoek laat zien:

| Factor | Gewicht | Waarom |
|---|---|---|
| Watertemperatuur | zwaar | Vis is koudbloedig; elke soort heeft een eigen voorkeur |
| Getijstroming (zout) | zwaar | Vis eet als het water loopt; kentering is stil |
| Licht en schemer | zwaar | Schemer is voor veel soorten het eetmoment; felle zon remt rovers |
| Wind en golven | middel | Matige (aanlandige) wind helpt, storm niet |
| Regen | licht | Lichte regen prima, onweer = kansloos |
| Luchtdruk | licht | Populair, maar weinig bewijs |
| Maan | heel licht | Maantabels voorspellen vangst niet aantoonbaar |
| Rivierafvoer (zoet) | licht | Hoog, troebel water remt |
| Seizoen | vermenigvuldiger | Makreel in de winter is kansloos |

De factoren worden gecombineerd met een gewogen meetkundig gemiddelde, zodat één slechte factor de kans duidelijk drukt. Bij een groep telt de soort met de beste kans. Zie `src/score.ts`.

## Bronnen

- Weer, golven, zeewatertemperatuur en rivierafvoer: [Open-Meteo](https://open-meteo.com) (CC BY 4.0)
- Getijvoorspelling en watertemperatuur: Rijkswaterstaat (Waterwebservices)
- Maanfoto's: NASA Scientific Visualization Studio (Dial-A-Moon)
- Plaatsnaam: © OpenStreetMap-bijdragers (Nominatim)
- Iconen: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT)
- Vissilhouetten en het score-visje (makreel): [PhyloPic](https://www.phylopic.org) (publiek domein / CC0)

Rijkswaterstaat stuurt geen CORS-header mee. Daarom haalt een GitHub Action elke drie uur getij, watertemperatuur en maanfoto's op (`tools/fetch-data.mjs`) en publiceert ze als statische bestanden samen met de site.

## Ontwikkelen

```sh
npm install
npm run data     # getij, watertemperatuur en maan ophalen naar public/data
npm run dev
```
