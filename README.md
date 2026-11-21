# Visvangst

Hoe groot is de kans op actieve vis, hier en nu? Eén scherm met een score van ½ visje (kansloos) tot 5 visjes (Top!), voor zoet en zout water en per vissoort.

**Live:** https://mailbvandongen-eng.github.io/visvangst/

## Wat er op het scherm staat

Eén scherm dat zich aanpast aan elke telefoon (iPhone, Samsung, Pixel, Fold) en de hoogte altijd vult.

- **Visjes**: ½ tot 5, van Kansloos tot Top!, voor het gekozen uur.
- **Zoet of zout** (standaard zoet), met een soort of groep: roofvis (snoek, snoekbaars, baars), witvis, karper, zeevis (zeebaars, kabeljauw en wijting, platvis, makreel).
- **Vandaag, morgen, overmorgen**: morgen en overmorgen zijn een verwachting.
- **Tegels**: maan (NASA-foto), luchtdruk, temperatuur van lucht en water, getij van het dichtstbijzijnde station.
- **Vangstkans per uur**: een curve over de dag met de beste periode, zonsopkomst en -ondergang. Schuif met je vinger en het hele scherm volgt dat uur. Daaronder per uur weer, temperatuur, regenkans (alleen als die er is) en wind.
- **Tik op een tegel** en hij groeit uit tot een groot venster met een grafiek waarover je kunt schuiven:
  - Getij: drie dagen, alle hoog- en laagwatertijden, station kiezen.
  - Luchtdruk: zes dagen terug tot drie dagen vooruit.
  - Temperatuur: lucht en water, met de bron van de meting.
  - Maan: schuif door 30 dagen met de echte NASA-foto per dag, komende fasen.
  - Visjes: waarom de score is wat hij is, per factor en per soort.
  - Per uur: tabel met wind en windstoten, bewolking, golven, watertemperatuur.
  Sluiten met het kruisje, naast het venster tikken of naar beneden vegen.
- **Buienradar**: boven de curve één regel voor de komende twee uur ("Droog tot 15:15", "Regen vanaf 14:30"); tik erop voor een radaranimatie van de afgelopen twee uur rond je plek en de regen per kwartier.
- **Menu**: uitleg, bronnen, donker of licht (standaard donker, onthouden).

## Wateren herkennen

De plek bepaalt het water; je kiest niets. Via TOP10NL (Kadaster, PDOK) zoekt de app binnen 250 m (GPS) of 500 m (gezochte plek) het dichtstbijzijnde water per groep: **ondiep** (sloot < 3 m), **middel** (watergang 3–12 m, plas) en **diep** (vaart, kanaal, meer, rivier, haven, zee). Liggen er meerdere, dan krijgt elk water een eigen score en kiest de app automatisch het water met de beste kans (tikken kiest een ander).

**Watertemperatuur per water** (`src/watertemp.ts`): voor polderwater een warmtebalans per uur (zon, langgolvige straling, verdamping en voelbare warmte met de windfunctie van Sweers, bodem en kwel), met de diepte uit de breedteklasse. Getoetst aan 28 HHNK-meetpunten (`tools/validatie`): 0,6 °C fout in watergangen tegen 1,1 °C voor het dichtstbijzijnde RWS-meetpunt; in smalle sloten ± 1,4 °C (lokale kwel), daarom telt de temperatuur daar minder zwaar. Groot water: meting van Rijkswaterstaat als die in hetzelfde water ligt.

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
- Regen per kwartier: Open-Meteo (minutely_15, in Nederland het KNMI-model)
- Radarbeelden: [RainViewer](https://www.rainviewer.com) (gratis, zoomniveau 7); kaartondergrond © OpenStreetMap-bijdragers
- Plaatsnaam: © OpenStreetMap-bijdragers (Nominatim)
- Iconen: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT)
- Vissilhouetten en het score-visje (voorn): [PhyloPic](https://www.phylopic.org) (publiek domein / CC0)

Rijkswaterstaat stuurt geen CORS-header mee. Daarom haalt een GitHub Action elke drie uur getij, watertemperatuur en maanfoto's op (`tools/fetch-data.mjs`) en publiceert ze als statische bestanden samen met de site.

## Ontwikkelen

```sh
npm install
npm run data     # getij, watertemperatuur en maan ophalen naar public/data
npm run dev
```

Testen (Chromium via playwright-core): `tools/radar.cjs` (buienradar: regel, beelden, animatie, schuif), `tools/devices.cjs` (15 toestellen: past alles, geen lege ruimte), `tools/touch.cjs` (schuiven, vensters, vegen), `tools/flow.cjs` (zoeken, station, thema), `tools/dist.cjs` (scoreverdeling).
