// Watertemperatuur uit het weer, met een warmtebalans per uur.
// Opbouw volgens de gangbare aanpak voor meren en sloten (evenwichtstemperatuur, Edinger e.a. 1968):
//   zon (min weerkaatsing) + langgolvige straling in − uit − verdamping − voelbare warmte + warmte uit de bodem
// Verdamping en voelbare warmte met de windfunctie van Sweers (1976), f = (5/A)^0,05·(3,80 + 1,57·u10) W/m²·hPa,
// zoals ook gebruikt door McJannet e.a. (2008); A = oppervlak van het water in km².
// Hoe snel het water reageert, hangt af van de diepte: een sloot volgt de lucht binnen een dag, een kanaal binnen een week.

export interface Met { t: number[]; ta: number[]; u: number[]; sw: number[]; cc: number[]; rh: number[] }

export interface WTParams {
  swFactor: number    // deel van het zonlicht dat het water opwarmt (schaduw, troebelheid)
  kBed: number        // warmte-uitwisseling met de bodem (W/m²·K)
  depthMul: number    // correctie op de geschatte diepte
  windMul: number     // correctie op de windfunctie
  gwMix: number       // aandeel grondwater (kwel, ± 10,5 °C) in de bodemtemperatuur, 0..1
}

// Gefit op 14 HHNK- en RWS-meetpunten, getoetst op de andere helft (tools/validatie)
export const WT_DEFAULT: WTParams = { swFactor: 0.7, kBed: 6, depthMul: 1, windMul: 1, gwMix: 0.5 }

/** Gemiddelde grondwatertemperatuur in Nederland (ondiep grondwater), °C */
export const GW_TEMP = 10.5

const SIGMA = 5.67e-8
const RHOC = 4.18e6 // J/m³·K
const es = (t: number) => 6.11 * Math.exp((17.27 * t) / (t + 237.3)) // verzadigde dampdruk (hPa)

/**
 * Rekent de watertemperatuur per uur uit.
 * @param depth effectieve diepte in m (gemengde laag; boven 4 m begrensd, dieper water mengt niet helemaal)
 * @param t0 beginwaarde; zonder meting: gemiddelde luchttemperatuur van de eerste dagen
 */
export function simulate(met: Met, depth: number, areaKm2 = 0.05, p: WTParams = WT_DEFAULT, t0?: number): number[] {
  const h = Math.max(0.25, Math.min(4, depth * p.depthMul))
  const areaF = Math.pow(5 / Math.max(1e-4, areaKm2), 0.05)
  const n = met.t.length
  const first = met.ta.slice(0, 24 * 7).filter(x => x != null)
  let tw = t0 ?? first.reduce((s, x) => s + x, 0) / Math.max(1, first.length)
  // Bodemtemperatuur: traag lopend gemiddelde van de lucht (ongeveer drie weken)
  let tBed = tw
  const out: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const ta = met.ta[i] ?? tw, u = Math.max(0.5, (met.u[i] ?? 10) / 3.6), sw = met.sw[i] ?? 0
    const cc = (met.cc[i] ?? 50) / 100, rh = (met.rh[i] ?? 85) / 100
    const ea = rh * es(ta)
    // Langgolvige straling: heldere hemel (Brutsaert) met bewolking erbij
    const epsA = Math.min(1, 1.24 * Math.pow(ea / (ta + 273.15), 1 / 7) * (1 + 0.17 * cc * cc))
    const lwIn = epsA * SIGMA * Math.pow(ta + 273.15, 4)
    const lwOut = 0.97 * SIGMA * Math.pow(tw + 273.15, 4)
    // Windfunctie Sweers (1976), W/m²·hPa, wind op 10 m
    const f = p.windMul * areaF * (3.8 + 1.57 * u)
    const evap = f * (es(tw) - ea)
    const sens = 0.61 * f * (tw - ta) // Bowen-verhouding (psychrometerconstante ≈ 0,61 hPa/K)
    const bed = p.kBed * (p.gwMix * GW_TEMP + (1 - p.gwMix) * tBed - tw)
    const q = 0.93 * p.swFactor * sw + lwIn - lwOut - evap - sens + bed
    tw = Math.max(0, tw + (q * 3600) / (RHOC * h))
    tBed += (ta - tBed) / (24 * 21)
    out[i] = tw
  }
  return out
}

/** Geschatte diepte (m) uit het soort water en de breedte (TOP10NL) */
export function depthFromWidth(typewater: string | null, breedte: string | null): number | null {
  if (typewater === 'greppel, droge sloot') return 0.2
  if (typewater === 'meer, plas') return null
  // Effectieve (gemengde) diepte, getoetst aan 28 HHNK-meetpunten in polderwater (tools/validatie)
  switch (breedte) {
    case '0,5 - 3 meter': return 0.8
    case '3 - 6 meter': return 1.0
    case '6 - 12 meter': return 1.2
    case '12 - 50 meter': return 2.0
    case '50 - 125 meter': return 3.2
    case '> 125 meter': return 4
    default: return null
  }
}
