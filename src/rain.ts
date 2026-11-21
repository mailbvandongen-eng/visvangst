// Buienradar: neerslag per kwartier op je plek (Open-Meteo, voor Nederland het KNMI-model) en
// radarbeelden van de afgelopen twee uur (RainViewer, gratis; tegels tot zoomniveau 7).

export interface RainNow { time: number[]; mm: number[] }   // mm per kwartier
export interface RadarFrame { time: number; url: string }   // url met {x} en {y}

export async function loadRainNow(lat: number, lon: number): Promise<RainNow | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&minutely_15=precipitation&past_minutely_15=4&forecast_minutely_15=9&timezone=Europe%2FAmsterdam&timeformat=unixtime`)
    if (!r.ok) return null
    const m = (await r.json()).minutely_15
    return { time: m.time.map((t: number) => t * 1000), mm: m.precipitation.map((v: number | null) => v ?? 0) }
  } catch { return null }
}

export async function loadRadar(): Promise<RadarFrame[]> {
  const r = await fetch('https://api.rainviewer.com/public/weather-maps.json')
  if (!r.ok) throw new Error('radar')
  const d = await r.json()
  const frames = [...(d.radar?.past ?? []), ...(d.radar?.nowcast ?? [])]
  // Kleurschema 2 (zoals Buienradar), afgevlakt, sneeuw apart gekleurd
  return frames.map((f: { time: number; path: string }) => ({ time: f.time * 1000, url: `${d.host}${f.path}/256/${RADAR_Z}/{x}/{y}/2/1_1.png` }))
}

export const RADAR_Z = 7   // hoger levert RainViewer niet gratis

/** Wereldpixel op zoomniveau z (Web Mercator, tegels van 256) */
export function worldPx(lat: number, lon: number, z = RADAR_Z) {
  const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180)
  return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}

/** Neerslag per kwartier → intensiteit in mm per uur, en een woord */
export const perHour = (mmQ: number) => mmQ * 4
export function intensity(mmH: number) {
  return mmH < 0.2 ? 'droog' : mmH < 1 ? 'motregen of lichte regen' : mmH < 4 ? 'regen' : mmH < 10 ? 'flinke regen' : 'zware bui'
}

/** De regel in de dagkaart: "Droog tot 15:45", "Regen vanaf 14:30", "Regen tot 14:15" */
export function rainLine(r: RainNow, now: number, hhmm: (t: number) => string): { text: string; wet: boolean } | null {
  const fut = r.time.map((t, i) => ({ t, h: perHour(r.mm[i]) })).filter(x => x.t + 15 * 60000 > now)
  if (!fut.length) return null
  const wet = (x: { h: number }) => x.h >= 0.2
  const end = fut[fut.length - 1].t + 15 * 60000
  if (wet(fut[0])) {
    const dry = fut.find(x => !wet(x))
    return { text: dry ? `${cap(intensity(fut[0].h))}, droog vanaf ${hhmm(dry.t)}` : `${cap(intensity(Math.max(...fut.map(x => x.h))))} tot na ${hhmm(end)}`, wet: true }
  }
  const first = fut.find(wet)
  if (first) return { text: `${cap(intensity(first.h))} vanaf ${hhmm(first.t)}`, wet: true }
  return { text: `Droog tot ${hhmm(end)}`, wet: false }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
