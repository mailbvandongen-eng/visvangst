// Vangstkans per uur. Elke factor geeft een waarde van 0 (slecht) tot 1 (ideaal).
// Gewichten en profielen volgen het onderzoek van 21-11-2026 (zie README): temperatuur, licht en getij wegen zwaar;
// luchtdruk en maan licht. Bronnen per soort staan bij het profiel.

export type Water = 'zoet' | 'zout'
/** Soort water op de plek (uit TOP10NL) */
export type WaterKind = 'sloot' | 'watergang' | 'kanaal' | 'plas' | 'meer' | 'rivier' | 'haven' | 'zee' | 'onbekend'

interface Light { day: number; dusk: number; night: number; sunPenalty: number }

export interface Profile {
  id: string
  name: string
  water: Water
  icon: string
  temp: [number, number, number, number] // te koud, fijn van, fijn tot, te warm (watertemperatuur °C)
  light: Light
  lightWinter?: Light      // lichtpatroon in koud water (onder 8 °C)
  tide?: 'moving' | 'rising'
  waves?: [number, number, number]
  wind: { calm: number; strongOk?: boolean; onshoreBonus?: number; southWestBonus?: number }
  season: number[]         // jan..dec, 0..1
  moonW?: number           // gewicht maan (standaard 0,04)
  warmW?: number           // gewicht "water warmt op" (standaard 0,04)
  turbidLikes?: boolean    // troebel/hoger water is gunstig (snoekbaars)
  habitat?: Partial<Record<WaterKind, number>> // hoe waarschijnlijk de soort in dit soort water zit (0..1)
  closed?: 'snoek' | 'roofvis'
  notes: string            // korte onderbouwing, getoond in de uitleg
}

export const PROFILES: Profile[] = [
  { id: 'snoek', name: 'Snoek', water: 'zoet', icon: 'snoek', temp: [0, 4, 14, 22],
    light: { day: 0.8, dusk: 1, night: 0.25, sunPenalty: 0.35 },
    lightWinter: { day: 1, dusk: 1, night: 0.25, sunPenalty: 0.1 },
    wind: { calm: 0.5, strongOk: true }, moonW: 0.07,
    season: [0.85, 0.8, 0.5, 0.5, 0.6, 0.6, 0.5, 0.55, 0.75, 1, 1, 0.95],
    habitat: { sloot: 1, watergang: 1, kanaal: 0.9, plas: 1, meer: 0.9, rivier: 0.85, haven: 0.9 },
    closed: 'snoek',
    notes: 'Meer vangst bij koud water, harde wind, in de schemer en rond volle en nieuwe maan (Kuparinen e.a. 2010). Actief tot ongeveer 15 °C. In de winter overdag actief, dicht bij de kant en bij de prooivis.' },
  { id: 'snoekbaars', name: 'Snoekbaars', water: 'zoet', icon: 'snoekbaars', temp: [3, 10, 18, 26],
    light: { day: 0.45, dusk: 1, night: 0.5, sunPenalty: 0.5 },
    wind: { calm: 0.6 }, turbidLikes: true,
    season: [0.6, 0.55, 0.6, 0.6, 0.7, 0.8, 0.8, 0.85, 0.95, 1, 0.9, 0.7],
    habitat: { sloot: 0.2, watergang: 0.7, kanaal: 1, plas: 0.85, meer: 1, rivier: 1, haven: 1 },
    closed: 'roofvis',
    notes: 'Het actiefst in de schemer, het minst midden in de nacht (Poulet e.a. 2005, Horký e.a. 2008). Voelt zich thuis in groot, troebel water; ziet goed bij weinig licht.' },
  { id: 'baars', name: 'Baars', water: 'zoet', icon: 'baars', temp: [0, 5, 22, 28],
    light: { day: 0.9, dusk: 1, night: 0.2, sunPenalty: 0.15 },
    lightWinter: { day: 1, dusk: 0.9, night: 0.1, sunPenalty: 0.05 },
    wind: { calm: 0.75 },
    season: [0.55, 0.55, 0.6, 0.65, 0.75, 0.85, 0.9, 0.95, 1, 1, 0.8, 0.65],
    habitat: { sloot: 0.7, watergang: 0.95, kanaal: 1, plas: 1, meer: 1, rivier: 0.95, haven: 1 },
    closed: 'roofvis',
    notes: 'Vooral een dagvis; in de zomer de schemer, in de winter overdag. Watertemperatuur maakte in vangstonderzoek weinig uit, kou en weinig licht remmen wel.' },
  { id: 'witvis', name: 'Witvis', water: 'zoet', icon: 'brasem', temp: [1, 9, 22, 28],
    light: { day: 0.65, dusk: 1, night: 0.8, sunPenalty: 0.3 },
    wind: { calm: 0.75, southWestBonus: 0.08 }, warmW: 0.08,
    season: [0.6, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 0.95, 0.85, 0.75, 0.65],
    habitat: { sloot: 0.9, watergang: 1, kanaal: 1, plas: 1, meer: 1, rivier: 1, haven: 1 },
    notes: 'Brasem en voorn eten in de zomer vooral \'s avonds en in het begin van de nacht; in de winter rustiger en dieper, maar ze blijven eten.' },
  { id: 'karper', name: 'Karper', water: 'zoet', icon: 'karper', temp: [6, 17, 26, 31],
    light: { day: 0.65, dusk: 1, night: 0.9, sunPenalty: 0.2 },
    wind: { calm: 0.7, southWestBonus: 0.15 }, warmW: 0.12,
    season: [0.3, 0.3, 0.5, 0.75, 0.95, 1, 1, 1, 0.9, 0.75, 0.5, 0.35],
    habitat: { sloot: 0.5, watergang: 0.8, kanaal: 0.9, plas: 1, meer: 0.8, rivier: 0.7, haven: 0.8 },
    notes: 'Eet volop boven ongeveer 18 °C, minder onder 15 °C, bijna niet onder 8 °C (FAO). Opwarmend water helpt duidelijk.' },

  { id: 'zeebaars', name: 'Zeebaars', water: 'zout', icon: 'zeebaars', temp: [7, 12, 20, 24],
    light: { day: 0.65, dusk: 1, night: 0.7, sunPenalty: 0.3 },
    lightWinter: { day: 0.4, dusk: 0.9, night: 1, sunPenalty: 0.3 },
    tide: 'moving', waves: [0.4, 1.4, 2.6], wind: { calm: 0.65, onshoreBonus: 0.15 },
    season: [0.15, 0.1, 0.15, 0.35, 0.75, 0.95, 1, 1, 1, 0.7, 0.3, 0.15],
    notes: 'Trekt in de herfst weg van de kust (Waddenzee: helft vertrokken half oktober, WUR) en komt in het voorjaar terug. In de zomer overdag actief, in koud water \'s nachts.' },
  { id: 'kabeljauw', name: 'Kabeljauw & wijting', water: 'zout', icon: 'kabeljauw', temp: [2, 5, 12, 17],
    light: { day: 0.35, dusk: 1, night: 0.95, sunPenalty: 0.25 },
    tide: 'moving', waves: [0.5, 2, 3.2], wind: { calm: 0.6, onshoreBonus: 0.15 },
    season: [1, 0.95, 0.75, 0.4, 0.15, 0.1, 0.1, 0.15, 0.35, 0.75, 1, 1],
    notes: 'Wijting eet het meest tussen 22 en 24 uur, het minst rond 8–10 uur. Kabeljauw bij Noordzee-windparken het actiefst rond zonsop- en ondergang. Boven 15 °C dieper.' },
  { id: 'platvis', name: 'Platvis', water: 'zout', icon: 'platvis', temp: [3, 6, 15, 20],
    light: { day: 0.9, dusk: 1, night: 0.85, sunPenalty: 0.15 },
    tide: 'rising', waves: [0.2, 1.2, 2.4], wind: { calm: 0.8, onshoreBonus: 0.05 },
    season: [0.75, 0.75, 0.85, 0.85, 0.6, 0.5, 0.5, 0.55, 0.75, 0.95, 1, 0.9],
    notes: 'Bot zwemt met opkomend water de platen op om te eten, ook overdag.' },
  { id: 'makreel', name: 'Makreel', water: 'zout', icon: 'makreel', temp: [11, 14, 20, 23],
    light: { day: 1, dusk: 0.95, night: 0.2, sunPenalty: 0 },
    tide: 'moving', waves: [0, 0.7, 1.8], wind: { calm: 1 },
    season: [0, 0, 0, 0.05, 0.3, 0.8, 1, 1, 0.85, 0.35, 0.05, 0],
    notes: 'Zomervis die warm water zoekt. Over vissen vanaf de Nederlandse kust is weinig onderzoek.' },
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
  month: number
  waterTemp: number | null
  waterTrend: number | null  // verandering van de watertemperatuur over 24 uur (°C)
  waterUncertain: boolean    // sloot: lokale kwel/doorstroming maakt de temperatuur onzeker
  waterKind: WaterKind
  sunAlt: number
  twilight: number
  sunFrac: number
  cloud: number
  pressure: number
  dp3: number
  windKmh: number
  gustKmh: number
  onshore: boolean | null
  windDir: number
  rainProb: number
  rainMm: number
  thunder: boolean
  tideFlow: number | null
  tideRising: boolean | null
  springRatio: number
  waves: number | null
  moonNear: number
  riverRatio: number | null
}

export interface Factor { key: string; label: string; f: number; w: number; cost?: number }
export interface HourScore { t: number; fish: number; raw: number; factors: Factor[]; best: string; profile: string; cap?: string }

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

/** Factoren voor één soort en één uur (zonder seizoen en leefgebied, die vermenigvuldigen) */
function factors(p: Profile, h: HourInput): Factor[] {
  const F: Factor[] = []
  const add = (key: string, label: string, f: number, w: number) => F.push({ key, label, f: clamp(f), w })
  const zout = p.water === 'zout'

  // Watertemperatuur; bij een sloot telt hij minder zwaar omdat de echte waarde onzeker is
  if (h.waterTemp != null) add('temp', 'Watertemperatuur', trapezoid(h.waterTemp, p.temp), (zout ? 0.22 : 0.32) * (h.waterUncertain ? 0.6 : 1))

  // Licht, met een eigen patroon in koud water
  const L0 = h.waterTemp != null && h.waterTemp < 8 && p.lightWinter ? p.lightWinter : p.light
  let L: number
  if (h.sunAlt < -6) L = L0.night
  else if (h.sunAlt < 0) L = Math.max(L0.dusk * 0.95, lerp(L0.night, L0.day, (h.sunAlt + 6) / 6))
  else L = L0.day * (1 - L0.sunPenalty * h.sunFrac * clamp(h.sunAlt / 25))
  L = Math.max(L, lerp(L, L0.dusk, h.twilight))
  add('light', h.twilight > 0.5 ? 'Schemer' : h.sunAlt < -6 ? 'Donker' : 'Licht', L, zout ? 0.18 : 0.24)

  // Opwarmend water (vooral karper en witvis)
  if (h.waterTrend != null) add('warm', 'Water warmt op', 0.7 + 0.15 * h.waterTrend, p.warmW ?? 0.04)

  if (zout && p.tide && h.tideFlow != null) {
    let D = 0.2 + 0.8 * h.tideFlow
    if (p.tide === 'rising') D = h.tideRising ? 0.35 + 0.65 * h.tideFlow : 0.2 + 0.45 * h.tideFlow
    D *= lerp(0.85, 1.08, (h.springRatio - 0.75) / 0.5)
    add('tide', 'Getijstroming', D, 0.25)
  }
  if (zout && p.waves && h.waves != null) {
    const [lo, hi, rough] = p.waves
    const V = h.waves < lo ? lerp(0.55, 1, h.waves / Math.max(lo, 0.01)) : h.waves <= hi ? 1 : lerp(1, 0.1, (h.waves - hi) / (rough - hi))
    add('waves', 'Golven', V, 0.08)
  }

  // Wind: bij snoek is harde wind juist gunstig (Kuparinen e.a. 2010)
  const b = bft(h.windKmh)
  let W = b <= 1 ? p.wind.calm : b <= 4 ? 1 : b === 5 ? (p.wind.strongOk ? 0.95 : 0.75) : b === 6 ? (p.wind.strongOk ? 0.7 : 0.45) : 0.12
  if (p.id === 'makreel') W = b <= 3 ? 1 : b === 4 ? 0.75 : b === 5 ? 0.45 : 0.1
  if (h.onshore && p.wind.onshoreBonus && b >= 2 && b <= 5) W += p.wind.onshoreBonus
  if (p.wind.southWestBonus && h.windDir >= 190 && h.windDir <= 280 && b >= 2 && b <= 5) W += p.wind.southWestBonus
  add('wind', 'Wind', W, zout ? 0.1 : 0.12)

  // Regen: lichte regen en droog bijna gelijk; zware buien en onweer slecht
  let R = h.rainMm < 0.1 ? 0.9 : h.rainMm <= 1 ? 0.95 : h.rainMm <= 4 ? 0.75 : 0.4
  if (p.turbidLikes && h.rainMm >= 0.1 && h.rainMm <= 4) R = 1
  if (p.id === 'makreel' && h.rainMm >= 0.1) R -= 0.2
  if (h.thunder) R = 0.05
  add('rain', 'Regen', R, 0.06)

  // Luchtdruk: zwak bewijs, dus licht; alleen snelle veranderingen tellen echt
  const d = h.dp3
  add('pressure', 'Luchtdruk', d < -3 ? 0.6 : d < -0.7 ? 1 : d <= 0.7 ? 0.85 : d <= 2.5 ? 0.7 : 0.55, 0.04)

  // Rivierafvoer: hoog en troebel water remt de meeste soorten, snoekbaars minder
  if (!zout && h.riverRatio != null) {
    const r = h.riverRatio
    add('river', 'Waterafvoer', p.turbidLikes ? (r < 1.6 ? 1 : r < 3 ? 0.9 : 0.6) : (r < 1.6 ? 1 : r < 3 ? 0.65 : 0.35), 0.06)
  }

  add('moon', 'Maan', 0.55 + 0.45 * h.moonNear, p.moonW ?? 0.04)
  return F
}

function combine(p: Profile, h: HourInput, F: Factor[]) {
  // Gewogen meetkundig gemiddelde: één zwakke factor drukt de kans duidelijk
  const sumW = F.reduce((s, x) => s + x.w, 0)
  let raw = Math.exp(F.reduce((s, x) => s + x.w * Math.log(Math.max(0.05, x.f)), 0) / sumW)
  raw *= lerp(0.4, 1, p.season[h.month])
  raw *= lerp(0.35, 1, p.habitat?.[h.waterKind] ?? 1)
  return raw
}
const toFish = (raw: number) => clamp(Math.round((0.5 + 4.5 * clamp((raw - 0.45) / 0.5)) * 2) / 2, 0.5, 5)

function scoreProfile(p: Profile, h: HourInput): HourScore {
  const F = factors(p, h)
  const raw = combine(p, h, F)
  let fish = toFish(raw)
  let cap: string | undefined
  if (h.thunder) { fish = 0.5; cap = 'Onweer' }
  else if (bft(Math.max(h.windKmh, h.gustKmh * 0.75)) >= 8) { fish = Math.min(fish, 1); cap = 'Storm' }
  const season = p.season[h.month]
  F.push({ key: 'season', label: season < 0.3 ? 'Buiten seizoen' : 'Seizoen', f: season, w: 0 })
  const hab = p.habitat?.[h.waterKind]
  if (hab != null) F.push({ key: 'habitat', label: 'Soort water', f: hab, w: 0 })
  return { t: h.t, fish, raw, factors: F, best: p.name, profile: p.id, cap }
}

/** Wat kost elke factor in visjes? Zet hem op ideaal en kijk hoeveel de score stijgt (fijner dan halve visjes) */
export function factorCosts(profileId: string, h: HourInput): Factor[] {
  const p = PROFILES.find(x => x.id === profileId)!
  const F = factors(p, h)
  const base = combine(p, h, F)
  const fishOf = (raw: number) => 0.5 + 4.5 * clamp((raw - 0.45) / 0.5)
  const out = F.map(f => {
    const alt = F.map(g => g === f ? { ...g, f: 1 } : g)
    return { ...f, cost: fishOf(combine(p, h, alt)) - fishOf(base) }
  })
  const s = p.season[h.month]
  out.push({ key: 'season', label: 'Seizoen', f: s, w: 0, cost: fishOf(base / lerp(0.4, 1, s)) - fishOf(base) })
  const hab = p.habitat?.[h.waterKind]
  if (hab != null) out.push({ key: 'habitat', label: 'Soort water', f: hab, w: 0, cost: fishOf(base / lerp(0.35, 1, hab)) - fishOf(base) })
  return out
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
