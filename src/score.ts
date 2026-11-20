// Vangstkans per uur. Elke factor geeft een waarde van 0 (slecht) tot 1 (ideaal).
// De gewichten volgen het onderzoek: temperatuur, licht en getij wegen zwaar; maan en luchtdruk licht.

export type Water = 'zoet' | 'zout'

export interface Profile {
  id: string
  name: string
  water: Water
  icon: string            // silhouet in /fish
  temp: [number, number, number, number] // te koud, ideaal van, ideaal tot, te warm (watertemperatuur)
  light: { day: number; dusk: number; night: number; sunPenalty: number }
  tide?: 'moving' | 'rising'
  waves?: [number, number, number] // ideaal van, ideaal tot, te ruw (meter)
  wind: { calm: number; onshoreBonus?: number; southWestBonus?: number }
  season: number[]       // jan..dec, 0..1
  closed?: 'snoek' | 'roofvis'
}

export const PROFILES: Profile[] = [
  { id: 'snoek', name: 'Snoek', water: 'zoet', icon: 'snoek', temp: [1, 7, 17, 25],
    light: { day: 0.85, dusk: 1, night: 0.25, sunPenalty: 0.35 }, wind: { calm: 0.6 },
    season: [0.85, 0.8, 0.5, 0.5, 0.6, 0.6, 0.5, 0.55, 0.75, 1, 1, 0.95], closed: 'snoek' },
  { id: 'snoekbaars', name: 'Snoekbaars', water: 'zoet', icon: 'snoekbaars', temp: [3, 9, 20, 27],
    light: { day: 0.45, dusk: 1, night: 0.8, sunPenalty: 0.45 }, wind: { calm: 0.55 },
    season: [0.6, 0.55, 0.6, 0.6, 0.7, 0.8, 0.8, 0.85, 0.95, 1, 0.9, 0.7], closed: 'roofvis' },
  { id: 'baars', name: 'Baars', water: 'zoet', icon: 'baars', temp: [3, 11, 22, 28],
    light: { day: 0.9, dusk: 1, night: 0.2, sunPenalty: 0.15 }, wind: { calm: 0.75 },
    season: [0.55, 0.55, 0.6, 0.65, 0.75, 0.85, 0.9, 0.95, 1, 1, 0.8, 0.65], closed: 'roofvis' },
  { id: 'witvis', name: 'Witvis', water: 'zoet', icon: 'brasem', temp: [1, 9, 22, 28],
    light: { day: 0.7, dusk: 1, night: 0.6, sunPenalty: 0.3 }, wind: { calm: 0.75, southWestBonus: 0.08 },
    season: [0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 0.95, 0.85, 0.75, 0.65] },
  { id: 'karper', name: 'Karper', water: 'zoet', icon: 'karper', temp: [4, 15, 26, 31],
    light: { day: 0.65, dusk: 1, night: 0.9, sunPenalty: 0.2 }, wind: { calm: 0.7, southWestBonus: 0.15 },
    season: [0.3, 0.3, 0.5, 0.75, 0.95, 1, 1, 1, 0.9, 0.75, 0.5, 0.35] },

  { id: 'zeebaars', name: 'Zeebaars', water: 'zout', icon: 'zeebaars', temp: [7, 12, 20, 24],
    light: { day: 0.6, dusk: 1, night: 0.75, sunPenalty: 0.3 }, tide: 'moving', waves: [0.4, 1.4, 2.6],
    wind: { calm: 0.65, onshoreBonus: 0.15 },
    season: [0.15, 0.1, 0.15, 0.35, 0.75, 0.95, 1, 1, 1, 0.9, 0.6, 0.3] },
  { id: 'kabeljauw', name: 'Kabeljauw & wijting', water: 'zout', icon: 'kabeljauw', temp: [2, 5, 12, 17],
    light: { day: 0.45, dusk: 0.95, night: 1, sunPenalty: 0.25 }, tide: 'moving', waves: [0.5, 2, 3.2],
    wind: { calm: 0.6, onshoreBonus: 0.15 },
    season: [1, 0.95, 0.75, 0.4, 0.15, 0.1, 0.1, 0.15, 0.35, 0.75, 1, 1] },
  { id: 'platvis', name: 'Platvis', water: 'zout', icon: 'platvis', temp: [3, 6, 15, 20],
    light: { day: 0.8, dusk: 1, night: 0.85, sunPenalty: 0.15 }, tide: 'rising', waves: [0.2, 1.2, 2.4],
    wind: { calm: 0.8, onshoreBonus: 0.05 },
    season: [0.75, 0.75, 0.85, 0.85, 0.6, 0.5, 0.5, 0.55, 0.75, 0.95, 1, 0.9] },
  { id: 'makreel', name: 'Makreel', water: 'zout', icon: 'makreel', temp: [11, 14, 20, 23],
    light: { day: 1, dusk: 0.95, night: 0.2, sunPenalty: 0 }, tide: 'moving', waves: [0, 0.7, 1.8],
    wind: { calm: 1 },
    season: [0, 0, 0, 0.05, 0.3, 0.8, 1, 1, 0.85, 0.35, 0.05, 0] },
]

export interface Choice { id: string; name: string; water: Water; icon: string; members: string[] }

export const CHOICES: Choice[] = [
  { id: 'roofvis', name: 'Roofvis', water: 'zoet', icon: 'snoek', members: ['snoek', 'snoekbaars', 'baars'] },
  { id: 'snoek', name: 'Snoek', water: 'zoet', icon: 'snoek', members: ['snoek'] },
  { id: 'snoekbaars', name: 'Snoekbaars', water: 'zoet', icon: 'snoekbaars', members: ['snoekbaars'] },
  { id: 'baars', name: 'Baars', water: 'zoet', icon: 'baars', members: ['baars'] },
  { id: 'witvis', name: 'Witvis', water: 'zoet', icon: 'brasem', members: ['witvis'] },
  { id: 'karper', name: 'Karper', water: 'zoet', icon: 'karper', members: ['karper'] },
  { id: 'zeevis', name: 'Zeevis', water: 'zout', icon: 'kabeljauw', members: ['zeebaars', 'kabeljauw', 'platvis', 'makreel'] },
  { id: 'zeebaars', name: 'Zeebaars', water: 'zout', icon: 'zeebaars', members: ['zeebaars'] },
  { id: 'kabeljauw', name: 'Kabeljauw', water: 'zout', icon: 'kabeljauw', members: ['kabeljauw'] },
  { id: 'platvis', name: 'Platvis', water: 'zout', icon: 'platvis', members: ['platvis'] },
  { id: 'makreel', name: 'Makreel', water: 'zout', icon: 'makreel', members: ['makreel'] },
]

/** Alles wat voor één uur bekend is */
export interface HourInput {
  t: number
  month: number            // 0..11
  waterTemp: number | null
  sunAlt: number           // graden
  twilight: number         // 0..1, 1 = midden in de schemer
  sunFrac: number          // deel van het uur met zon (0..1)
  cloud: number            // %
  pressure: number
  dp3: number              // drukverandering afgelopen 3 uur (hPa)
  windKmh: number
  gustKmh: number
  onshore: boolean | null  // null = geen kust in de buurt
  windDir: number
  rainProb: number
  rainMm: number
  thunder: boolean
  tideFlow: number | null  // 0..1 stroming (relatief)
  tideRising: boolean | null
  springRatio: number      // getijverschil van de dag t.o.v. gemiddeld (≈0.7..1.3)
  waves: number | null
  moonNear: number         // 1 = rond nieuwe of volle maan, 0 = halve maan
  riverRatio: number | null // afvoer t.o.v. normaal
}

export interface Factor { key: string; label: string; f: number; w: number }
export interface HourScore { t: number; fish: number; raw: number; factors: Factor[]; best: string; cap?: string }

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const lerp = (a: number, b: number, x: number) => a + (b - a) * clamp(x)

function trapezoid(x: number, [a, b, c, d]: number[]) {
  if (x <= a || x >= d) return 0.08
  if (x < b) return lerp(0.08, 1, (x - a) / (b - a))
  if (x > c) return lerp(1, 0.08, (x - c) / (d - c))
  return 1
}

export function bft(kmh: number) {
  const ms = kmh / 3.6
  const lim = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
  let b = 0
  while (b < lim.length && ms >= lim[b]) b++
  return b
}

function scoreProfile(p: Profile, h: HourInput): HourScore {
  const F: Factor[] = []
  const add = (key: string, label: string, f: number, w: number) => F.push({ key, label, f: clamp(f), w })
  const zout = p.water === 'zout'

  // Watertemperatuur
  if (h.waterTemp != null) add('temp', 'Watertemperatuur', trapezoid(h.waterTemp, p.temp), zout ? 0.22 : 0.32)

  // Licht: schemer, dag, nacht en felle zon
  let L: number
  if (h.sunAlt < -6) L = p.light.night
  else if (h.sunAlt < 0) L = Math.max(p.light.dusk * 0.95, lerp(p.light.night, p.light.day, (h.sunAlt + 6) / 6))
  else L = p.light.day * (1 - p.light.sunPenalty * h.sunFrac * clamp(h.sunAlt / 25))
  L = Math.max(L, lerp(L, p.light.dusk, h.twilight))
  add('light', h.twilight > 0.5 ? 'Schemer' : h.sunAlt < -6 ? 'Donker' : 'Licht', L, zout ? 0.18 : 0.24)

  // Getij (alleen zout)
  if (zout && p.tide && h.tideFlow != null) {
    let D = 0.2 + 0.8 * h.tideFlow
    if (p.tide === 'rising') D = h.tideRising ? 0.35 + 0.65 * h.tideFlow : 0.2 + 0.45 * h.tideFlow
    D *= lerp(0.85, 1.08, (h.springRatio - 0.75) / 0.5)
    add('tide', 'Getijstroming', D, 0.25)
  }

  // Golven (zout)
  if (zout && p.waves && h.waves != null) {
    const [lo, hi, rough] = p.waves
    const V = h.waves < lo ? lerp(0.55, 1, h.waves / Math.max(lo, 0.01)) : h.waves <= hi ? 1 : lerp(1, 0.1, (h.waves - hi) / (rough - hi))
    add('waves', 'Golven', V, 0.08)
  }

  // Wind
  const b = bft(h.windKmh)
  let W = b <= 1 ? p.wind.calm : b <= 4 ? 1 : b === 5 ? 0.75 : b === 6 ? 0.45 : 0.12
  if (p.id === 'makreel') W = b <= 3 ? 1 : b === 4 ? 0.75 : b === 5 ? 0.45 : 0.1
  if (h.onshore && p.wind.onshoreBonus && b >= 2 && b <= 5) W += p.wind.onshoreBonus
  if (p.wind.southWestBonus && h.windDir >= 190 && h.windDir <= 280 && b >= 2 && b <= 5) W += p.wind.southWestBonus
  add('wind', 'Wind', W, zout ? 0.1 : 0.12)

  // Neerslag
  let R = h.rainMm < 0.1 ? (h.rainProb > 60 ? 0.85 : 0.8) : h.rainMm <= 1 ? 0.95 : h.rainMm <= 4 ? 0.65 : 0.3
  if (p.id === 'makreel' && h.rainMm >= 0.1) R -= 0.2
  if (h.thunder) R = 0.05
  add('rain', 'Regen', R, 0.06)

  // Luchtdruk: rustig dalend is gunstig, snelle stijging na een front ongunstig
  const d = h.dp3
  const P = d < -2.5 ? 0.5 : d < -0.5 ? 1 : d <= 0.5 ? 0.7 : d <= 2 ? 0.55 : 0.4
  add('pressure', 'Luchtdruk', P - (h.pressure < 995 ? 0.1 : 0), zout ? 0.06 : 0.1)

  // Rivierafvoer (zoet): hoog en troebel water remt
  if (!zout && h.riverRatio != null) {
    const r = h.riverRatio
    add('river', 'Waterafvoer', r < 1.6 ? 1 : r < 3 ? 0.65 : 0.35, 0.06)
  }

  // Maan: klein effect
  add('moon', 'Maan', 0.55 + 0.45 * h.moonNear, 0.04)

  // Gewogen meetkundig gemiddelde: één zwakke factor (stil water, koud water) drukt de kans duidelijk
  const sumW = F.reduce((s, x) => s + x.w, 0)
  let raw = Math.exp(F.reduce((s, x) => s + x.w * Math.log(Math.max(0.05, x.f)), 0) / sumW)
  const season = p.season[h.month]
  raw *= lerp(0.4, 1, season)

  // 0.5 tot 5 visjes in halve stappen
  let fish = Math.round((0.5 + 4.5 * clamp((raw - 0.45) / 0.5)) * 2) / 2
  let cap: string | undefined
  if (h.thunder) { fish = 0.5; cap = 'Onweer' }
  else if (bft(Math.max(h.windKmh, h.gustKmh * 0.75)) >= 8) { fish = Math.min(fish, 1); cap = 'Storm' }
  F.push({ key: 'season', label: season < 0.3 ? 'Buiten seizoen' : 'Seizoen', f: season, w: 0.12 })
  return { t: h.t, fish: clamp(fish, 0.5, 5), raw, factors: F, best: p.name, cap }
}

export function scoreHour(choice: Choice, h: HourInput): HourScore {
  const scores = choice.members.map(id => scoreProfile(PROFILES.find(p => p.id === id)!, h))
  scores.sort((a, b) => b.raw - a.raw)
  return scores[0]
}

export const LABELS: Record<string, string> = {
  '0.5': 'Kansloos', '1': 'Heel slecht', '1.5': 'Slecht', '2': 'Matig', '2.5': 'Redelijk',
  '3': 'Aardig', '3.5': 'Goed', '4': 'Heel goed', '4.5': 'Uitstekend', '5': 'Top!',
}

/** Laatste zaterdag van mei */
function lastSaturdayOfMay(y: number) {
  const d = new Date(Date.UTC(y, 4, 31))
  d.setUTCDate(31 - ((d.getUTCDay() + 1) % 7))
  return d
}

/** Gesloten tijd roofvis in Nederland (Sportvisserij Nederland / Visserijwet) */
export function closedSeason(choice: Choice, date: Date): string | null {
  const y = date.getFullYear()
  const end = lastSaturdayOfMay(y)
  const endTxt = `${end.getUTCDate()} mei`
  const t = Date.UTC(y, date.getMonth(), date.getDate())
  const ids = choice.members.map(m => PROFILES.find(p => p.id === m)!.closed).filter(Boolean)
  if (!ids.length || t > end.getTime()) return null
  if (ids.includes('snoek') && choice.members.length === 1 && t >= Date.UTC(y, 2, 1)) return `Gesloten tijd snoek tot en met ${endTxt}`
  if (t >= Date.UTC(y, 3, 1)) return `Gesloten tijd roofvis tot en met ${endTxt}: geen kunstaas of dood aas`
  if (ids.includes('snoek') && t >= Date.UTC(y, 2, 1)) return `Gesloten tijd snoek tot en met ${endTxt}`
  return null
}
