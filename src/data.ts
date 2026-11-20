import * as SunCalc from 'suncalc'
import type { HourInput, Water, WaterKind } from './score'

const BASE = import.meta.env.BASE_URL

export interface Station { c: string; n: string; lat: number; lon: number; r?: number }
export interface TempStation extends Station { t: number; at: number; z: number }
export interface Index {
  generated: number
  tide: Station[]
  temp: TempStation[]
  moon: Record<string, { f: string; phase: number; age: number }>
}
export interface Tide { t0: number; step: number; v: (number | null)[]; ext: { t: number; h: number; hw: boolean }[] }

export interface Weather {
  time: number[]
  temp: number[]; pressure: number[]; rainProb: number[]; rain: number[]; sun: number[]; cloud: number[]
  wind: number[]; gust: number[]; windDir: number[]; code: number[]; isDay: number[]
  sw: number[]; rh: number[]
}
export interface Marine { time: number[]; sst: (number | null)[]; waves: (number | null)[] }
export interface River { time: number[]; q: (number | null)[]; median: (number | null)[] }

export const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

export const loadIndex = () => json<Index>(`${BASE}data/index.json?v=${Math.floor(Date.now() / 600000)}`)
export const loadTide = (code: string) => json<Tide>(`${BASE}data/tide/${code}.json?v=${Math.floor(Date.now() / 600000)}`)

export async function loadWeather(lat: number, lon: number): Promise<Weather> {
  const vars = 'temperature_2m,pressure_msl,precipitation_probability,precipitation,sunshine_duration,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day,shortwave_radiation,relative_humidity_2m'
  const d = await json<any>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${vars}&past_days=21&forecast_days=4&timezone=Europe%2FAmsterdam&timeformat=unixtime`)
  const h = d.hourly
  return {
    time: h.time.map((t: number) => t * 1000), temp: h.temperature_2m, pressure: h.pressure_msl,
    rainProb: h.precipitation_probability, rain: h.precipitation, sun: h.sunshine_duration, cloud: h.cloud_cover,
    wind: h.wind_speed_10m, gust: h.wind_gusts_10m, windDir: h.wind_direction_10m, code: h.weather_code, isDay: h.is_day,
    sw: h.shortwave_radiation, rh: h.relative_humidity_2m,
  }
}

export async function loadMarine(lat: number, lon: number): Promise<Marine | null> {
  try {
    const d = await json<any>(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=sea_surface_temperature,wave_height&past_days=1&forecast_days=4&timezone=Europe%2FAmsterdam&timeformat=unixtime`)
    const h = d.hourly
    if (!h.wave_height.some((x: number | null) => x != null)) return null
    return { time: h.time.map((t: number) => t * 1000), sst: h.sea_surface_temperature, waves: h.wave_height }
  } catch { return null }
}

export async function loadRiver(lat: number, lon: number): Promise<River | null> {
  try {
    const d = await json<any>(`https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_median&past_days=1&forecast_days=4&timeformat=unixtime`)
    return { time: d.daily.time.map((t: number) => t * 1000), q: d.daily.river_discharge, median: d.daily.river_discharge_median }
  } catch { return null }
}

export async function placeName(lat: number, lon: number): Promise<string> {
  try {
    const d = await json<any>(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=nl`)
    const a = d.address ?? {}
    return a.village || a.town || a.city || a.suburb || a.municipality || d.name || 'Hier'
  } catch { return 'Mijn plek' }
}

export async function searchPlace(q: string) {
  const d = await json<any>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=nl&format=json`)
  // Nederland eerst, dan de buurlanden, dan de rest
  const rank = (cc: string) => ({ NL: 0, BE: 1, DE: 2 } as Record<string, number>)[cc] ?? 3
  return (d.results ?? [])
    .sort((a: any, b: any) => rank(a.country_code) - rank(b.country_code))
    .map((r: any) => ({ name: r.name, sub: [r.admin2 && r.admin2 !== r.name ? r.admin2 : '', r.admin1, r.country_code !== 'NL' ? r.country : ''].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }))
}

// ---------- tijd in Nederland ----------
const fmtYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' })
const fmtHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' })
export const ymd = (t: number) => fmtYmd.format(t)
export const hourNL = (t: number) => Number(fmtHour.format(t))
/** Middernacht (Nederlandse tijd) van de dag waarin t valt; offset is altijd een heel uur */
export function dayStart(t: number) {
  return Math.floor(t / 3600000) * 3600000 - hourNL(t) * 3600000
}
/** Middernacht van de dag die `n` dagen na de dag van t begint (zomer-/wintertijd-veilig) */
export function addDays(t: number, n: number) {
  return dayStart(dayStart(t) + n * 86400000 + 12 * 3600000)
}

// ---------- kust: richting van de zee, voor aanlandige wind ----------
const COAST: [number, number, number][] = [
  [51.38, 3.38, 320], [51.40, 3.55, 20], [51.44, 3.60, 200], [51.52, 3.44, 270], [51.57, 3.50, 315],
  [51.76, 3.85, 315], [51.83, 3.95, 315], [51.96, 4.02, 285], [51.98, 4.12, 290], [52.10, 4.26, 300],
  [52.21, 4.40, 300], [52.30, 4.47, 295], [52.46, 4.56, 280], [52.62, 4.62, 275], [52.75, 4.64, 275],
  [52.96, 4.73, 290], [53.05, 4.70, 280], [53.17, 4.85, 300], [53.27, 5.05, 330], [53.37, 5.25, 340],
  [53.45, 5.65, 350], [53.48, 6.00, 350], [53.50, 6.20, 355], [53.17, 5.40, 290], [52.93, 5.05, 330],
  [53.40, 5.85, 330], [53.40, 6.20, 340], [53.33, 6.93, 60],
]
export function seaBearing(lat: number, lon: number): number | null {
  let best: number | null = null, bd = 8
  for (const [a, b, br] of COAST) {
    const d = km({ lat, lon }, { lat: a, lon: b })
    if (d < bd) { bd = d; best = br }
  }
  return best
}

// ---------- uren opbouwen ----------
export interface World {
  lat: number; lon: number; water: Water
  weather: Weather; marine: Marine | null; river: River | null
  tide: Tide | null
  /** Watertemperatuur per uur voor het gekozen water (model of meting), soort water en of hij onzeker is */
  wt: { series: Map<number, number> | null; kind: WaterKind; uncertain: boolean }
}

function at<T>(times: number[], arr: (T | null)[], t: number): T | null {
  const i = times.indexOf(t)
  return i >= 0 ? arr[i] : null
}

export function tideAt(td: Tide, t: number): number | null {
  const k = (t - td.t0) / (td.step * 60000)
  const i = Math.floor(k)
  if (i < 0 || i + 1 >= td.v.length) return null
  const a = td.v[i], b = td.v[i + 1]
  if (a == null || b == null) return a ?? b
  return a + (b - a) * (k - i)
}

/** Waterstand-curve en stroming per uur */
function tideFlow(td: Tide, t: number) {
  const a = tideAt(td, t - 1800000), b = tideAt(td, t + 1800000)
  if (a == null || b == null) return null
  return { rate: b - a, rising: b > a }
}

export function moonNear(t: number) {
  const p = SunCalc.getMoonIllumination(new Date(t)).phase // 0 nieuw, .5 vol
  return Math.abs(Math.cos(p * 4 * Math.PI)) // 1 bij nieuw en vol
}

export function buildHours(w: World, from: number, to: number): HourInput[] {
  const { weather: W } = w
  const out: HourInput[] = []
  const sea = w.water === 'zout' ? seaBearing(w.lat, w.lon) : null

  // Stroming normaliseren per station: hoogste stroomsnelheid over de hele periode
  let maxRate = 1, meanRange = 0, ranges: Record<string, number> = {}
  if (w.tide) {
    const td = w.tide
    for (let t = td.t0 + 3600000; t < td.t0 + (td.v.length - 6) * 600000; t += 1800000) {
      const f = tideFlow(td, t)
      if (f) maxRate = Math.max(maxRate, Math.abs(f.rate))
    }
    const byDay: Record<string, number[]> = {}
    for (const e of td.ext) (byDay[ymd(e.t)] ??= []).push(e.h)
    for (const [d, hs] of Object.entries(byDay)) ranges[d] = Math.max(...hs) - Math.min(...hs)
    const rs = Object.values(ranges)
    meanRange = rs.reduce((s, x) => s + x, 0) / Math.max(1, rs.length)
  }

  for (let t = from; t < to; t += 3600000) {
    const i = W.time.indexOf(t)
    if (i < 0) continue
    const date = new Date(t)
    const pos = SunCalc.getPosition(date, w.lat, w.lon)
    const times = SunCalc.getTimes(date, w.lat, w.lon)
    const tw = Math.max(
      Math.exp(-(((t - times.sunrise!.getTime()) / 3600000) ** 2) / 1.2),
      Math.exp(-(((t - times.sunset!.getTime()) / 3600000) ** 2) / 1.2),
    )

    const waterTemp = w.wt.series?.get(t) ?? null
    const prev = w.wt.series?.get(t - 86400000)
    const waterTrend = waterTemp != null && prev != null ? waterTemp - prev : null

    const f = w.tide ? tideFlow(w.tide, t) : null
    const dayRange = w.tide ? ranges[ymd(t)] : undefined
    const p3 = W.time.indexOf(t - 3 * 3600000)

    let riverRatio: number | null = null
    if (w.river) {
      const k = w.river.time.findIndex(x => ymd(x) === ymd(t))
      const q = k >= 0 ? w.river.q[k] : null, m = k >= 0 ? w.river.median[k] : null
      if (q != null && m != null && m > 0.05) riverRatio = q / m
    }

    let onshore: boolean | null = null
    if (sea != null) {
      const diff = Math.abs(((W.windDir[i] - sea + 540) % 360) - 180)
      onshore = diff < 60
    }

    out.push({
      t, month: Number(ymd(t).slice(5, 7)) - 1, waterTemp, waterTrend, waterUncertain: w.wt.uncertain, waterKind: w.wt.kind,
      sunAlt: pos.altitude, twilight: tw, // suncalc 2.x geeft graden
      sunFrac: Math.min(1, (W.sun[i] ?? 0) / 3600), cloud: W.cloud[i] ?? 50,
      pressure: W.pressure[i], dp3: p3 >= 0 ? W.pressure[i] - W.pressure[p3] : 0,
      windKmh: W.wind[i] ?? 0, gustKmh: W.gust[i] ?? 0, windDir: W.windDir[i] ?? 0, onshore,
      rainProb: W.rainProb[i] ?? 0, rainMm: W.rain[i] ?? 0, thunder: (W.code[i] ?? 0) >= 95,
      tideFlow: f ? Math.min(1, Math.abs(f.rate) / maxRate) : null, tideRising: f ? f.rising : null,
      springRatio: dayRange && meanRange ? dayRange / meanRange : 1,
      waves: w.marine ? at(w.marine.time, w.marine.waves, t) : null,
      moonNear: moonNear(t), riverRatio,
    })
  }
  return out
}
