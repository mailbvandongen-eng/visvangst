import '@fontsource-variable/inter'
import './style.css'
import * as SunCalc from 'suncalc'
import {
  loadIndex, loadTide, loadWeather, loadMarine, loadRiver, placeName, searchPlace,
  buildHours, tideAt, km, ymd, hourNL, dayStart, addDays,
  type Index, type Tide, type Weather, type Marine, type River, type Station, type TempStation,
} from './data'
import { CHOICES, PROFILES, LABELS, closedSeason, scoreHour, bft, type Choice, type HourInput, type HourScore, type Profile, type Water } from './score'
import { chart, scrubTo, indexAt, initCharts } from './chart'

const BASE = import.meta.env.BASE_URL
const icon = (n: string) => `${BASE}icons/${n}.webp`
const $app = document.getElementById('app')!

// ---------- staat ----------
interface Loc { lat: number; lon: number; name: string; gps: boolean }
const saved = JSON.parse(localStorage.getItem('visvangst') ?? '{}')
const S = {
  loc: (saved.loc ?? null) as Loc | null,
  water: (saved.water ?? 'zoet') as Water | null,
  theme: (saved.theme === 'light' ? 'light' : 'dark') as 'dark' | 'light',
  choice: (saved.choice ?? { zoet: 'roofvis', zout: 'zeevis' }) as Record<Water, string>,
  tideOverride: (saved.tideOverride ?? null) as { key: string; code: string } | null,
  day: 0,
  sel: null as number | null,
  sheet: null as null | 'loc' | 'menu',
  detail: null as null | string,
  moonDay: 0,
  search: [] as { name: string; sub: string; lat: number; lon: number }[],
  locating: false,
  error: '' as string,
}
const persist = () => localStorage.setItem('visvangst', JSON.stringify({ loc: S.loc, water: S.water, choice: S.choice, tideOverride: S.tideOverride, theme: S.theme }))

function applyTheme() {
  document.documentElement.dataset.theme = S.theme
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', S.theme === 'light' ? '#eef3f6' : '#071521')
  document.querySelector('meta[name=color-scheme]')?.setAttribute('content', S.theme)
}
applyTheme()
// Het visje als vorm voor alle visjes, ook in de vensters
document.documentElement.style.setProperty('--fishm', `url(${BASE}fish/voorn.svg)`)

const D = {
  index: null as Index | null,
  weather: null as Weather | null,
  marine: null as Marine | null,
  river: null as River | null,
  tide: null as Tide | null,
  tideStation: null as (Station & { d: number }) | null,
  tempStation: null as (TempStation & { d: number }) | null,
  tideList: [] as (Station & { d: number })[],
  hours: [] as HourInput[],
  hoursWide: [] as HourInput[],
}

// ---------- hulpjes ----------
const fmt = (n: number, d = 0) => n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d })
const hhmm = (t: number) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(t)
const dayName = (t: number) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short' }).format(t)
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const locKey = (l: Loc) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`
const choice = (): Choice => {
  const w = S.water ?? 'zoet'
  return CHOICES.find(c => c.id === S.choice[w] && c.water === w) ?? CHOICES.find(c => c.water === w)!
}

function wxIcon(code: number, isDay: boolean, sunFrac: number) {
  if (code >= 95) return 'cloud_with_lightning_and_rain'
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'cloud_with_snow'
  if (code >= 51) return isDay && sunFrac > 0.2 ? 'sun_behind_rain_cloud' : 'cloud_with_rain'
  if (code === 45 || code === 48) return 'fog'
  if (!isDay) return code >= 3 ? 'cloud' : 'crescent_moon'
  if (code === 0 || sunFrac > 0.85) return 'sun'
  if (code === 1 || sunFrac > 0.55) return 'sun_behind_small_cloud'
  if (code === 2 || sunFrac > 0.2) return 'sun_behind_cloud'
  return sunFrac > 0.05 ? 'sun_behind_large_cloud' : 'cloud'
}

function moonInfo(t: number) {
  const m = SunCalc.getMoonIllumination(new Date(t))
  const p = m.phase
  const names = ['Nieuwe maan', 'Jonge maan', 'Eerste kwartier', 'Wassende maan', 'Volle maan', 'Afnemende maan', 'Laatste kwartier', 'Oude maan']
  const files = ['new_moon', 'waxing_crescent_moon', 'first_quarter_moon', 'waxing_gibbous_moon', 'full_moon', 'waning_gibbous_moon', 'last_quarter_moon', 'waning_crescent_moon']
  const k = Math.round(p * 8) % 8
  const age = p * 29.53
  const sinceSyzygy = age % 14.765
  const tij = sinceSyzygy >= 0.5 && sinceSyzygy <= 3.8 ? 'Springtij' : sinceSyzygy >= 7.4 && sinceSyzygy <= 10.6 ? 'Doodtij' : ''
  return { frac: m.fraction, name: names[k], file: files[k], tij }
}

// ---------- laden ----------
async function locate(): Promise<Loc | null> {
  if (!('geolocation' in navigator)) return null
  return new Promise(res => {
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: '', gps: true }),
      () => res(null),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60000 },
    )
  })
}

async function useLocation(loc: Loc) {
  const moved = !S.loc || km(S.loc, loc) > 2
  S.loc = loc
  if (moved) S.tideOverride = null
  persist()
  await loadAll()
  if (!loc.name) {
    loc.name = await placeName(loc.lat, loc.lon)
    persist()
    render()
  }
}

async function loadAll() {
  if (!S.loc) return
  const { lat, lon } = S.loc
  S.error = ''
  render()
  try {
    const [index, weather, marine, river] = await Promise.all([
      D.index ? Promise.resolve(D.index) : loadIndex(),
      loadWeather(lat, lon), loadMarine(lat, lon), loadRiver(lat, lon),
    ])
    Object.assign(D, { index, weather, marine, river })
    if (!S.water) { S.water = 'zoet'; persist() }
    D.tideList = index.tide.map(s => ({ ...s, d: km(s, S.loc!) })).sort((a, b) => a.d - b.d)
    await pickTide()
  } catch (e) {
    console.error(e)
    S.error = 'De gegevens konden niet worden geladen. Controleer je verbinding.'
  }
  render()
}

async function pickTide() {
  const ov = S.tideOverride && S.loc && S.tideOverride.key === locKey(S.loc) ? S.tideOverride.code : null
  D.tideStation = D.tideList.find(s => s.c === ov) ?? D.tideList[0] ?? null
  D.tide = D.tideStation ? await loadTide(D.tideStation.c).catch(() => null) : null
  pickTemp()
  rebuild()
}

function pickTemp() {
  const want = S.water === 'zout' ? 1 : 0
  const list = (D.index?.temp ?? []).filter(t => t.z === want).map(t => ({ ...t, d: km(t, S.loc!) })).sort((a, b) => a.d - b.d)
  // Meetpunten ver op zee (platforms, windparken, boeien) alleen als er aan de kust niets in de buurt is
  const offshore = /platform|windpark|meetboei|buitenbanken|europlatform|k13a|alpha|eierlandsegat|westereems|schiermonnikoog\.noord|vlaktevanderaan|noordwijk\.meetpost/i
  const coast = list.find(t => !offshore.test(t.c) && t.d < 25)
  D.tempStation = coast ?? (list[0] && list[0].d < 30 ? list[0] : null)
}

function waterNow(): { t: number; src: string; dist: number | null } | null {
  if (D.tempStation) return { t: D.tempStation.t, src: D.tempStation.n, dist: D.tempStation.d }
  const now = Math.floor(Date.now() / 3600000) * 3600000
  if (S.water === 'zout' && D.marine) {
    const i = D.marine.time.indexOf(now)
    const v = i >= 0 ? D.marine.sst[i] : null
    if (v != null) return { t: v, src: 'zeemodel', dist: null }
  }
  if (D.weather) {
    // Ondiep zoet water volgt het gemiddelde van de lucht over ongeveer een week
    const W = D.weather
    const vals = W.time.map((t, i) => [t, W.temp[i]] as const).filter(([t]) => t <= now && t > now - 7 * 86400000).map(([, v]) => v)
    if (vals.length) return { t: vals.reduce((s, x) => s + x, 0) / vals.length + (S.water === 'zout' ? 1 : 0.5), src: 'geschat', dist: null }
  }
  return null
}

function rebuild() {
  if (!D.weather || !S.loc || !S.water) return
  const from = dayStart(Date.now())
  // Drie dagen terug (voor de grote grafieken) tot drie dagen vooruit
  D.hoursWide = buildHours({
    lat: S.loc.lat, lon: S.loc.lon, water: S.water, weather: D.weather, marine: D.marine, river: D.river,
    tide: D.tide, waterNow: waterNow(),
  }, addDays(from, -3), addDays(from, 3))
  D.hours = D.hoursWide.filter(h => h.t >= from)
}

// ---------- weergave ----------
function fishRow(n: number) {
  let h = `<div class="fishrow" role="img" aria-label="${fmt(n, n % 1 ? 1 : 0)} van 5 visjes">`
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, n - i))
    h += `<span class="fish ${fill >= 1 ? 'full' : fill > 0 ? 'half' : 'empty'}"></span>`
  }
  return h + '</div>'
}

function sparkline(vals: (number | null)[], opts: { w: number; h: number; sel?: number; pad?: number; area?: boolean; marks?: { i: number; label: string; top: boolean }[] }) {
  const { w, h, pad = 4 } = opts
  const nums = vals.filter((v): v is number => v != null)
  if (nums.length < 2) return ''
  const lo = Math.min(...nums), hi = Math.max(...nums)
  const span = hi - lo || 1
  const x = (i: number) => (i / (vals.length - 1)) * w
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2)
  let d = ''
  vals.forEach((v, i) => { if (v != null) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}` })
  let out = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">`
  if (opts.area) out += `<path d="${d}L${w},${h}L0,${h}Z" class="area"/>`
  out += `<path d="${d}" class="line" vector-effect="non-scaling-stroke"/>`
  if (opts.sel != null && vals[opts.sel] != null) out += `<line x1="${x(opts.sel)}" x2="${x(opts.sel)}" y1="0" y2="${h}" class="selline" vector-effect="non-scaling-stroke"/>`
  out += '</svg>'
  // De stip en labels als HTML erboven, zodat ze niet vervormen
  let dots = ''
  if (opts.sel != null && vals[opts.sel] != null) dots += `<i class="dot" style="left:${(x(opts.sel) / w) * 100}%;top:${(y(vals[opts.sel]!) / h) * 100}%"></i>`
  for (const m of opts.marks ?? []) {
    if (vals[m.i] == null) continue
    const pct = (x(m.i) / w) * 100
    // Een tijd die onder de stip van het gekozen uur valt, staat al onderaan de tegel
    if (opts.sel != null && Math.abs(pct - (x(opts.sel) / w) * 100) < 6) continue
    const edge = pct > 86 ? 'r' : pct < 14 ? 'l' : ''
    dots += `<i class="mark ${m.top ? 'top' : 'bot'} ${edge}" style="left:${pct}%;top:${(y(vals[m.i]!) / h) * 100}%"><em>${m.label}</em></i>`
  }
  return `<div class="sparkwrap">${out}${dots}</div>`
}

// ---------- dagberekening ----------
interface DayView {
  dayFrom: number; dayTo: number; nowH: number
  hours: HourInput[]; scores: HourScore[]
  best: HourScore | null; win: string; bestA: number; bestB: number
  si: number; sh: HourInput; ss: HourScore
}

function dayView(): DayView | null {
  const c = choice()
  const dayFrom = addDays(Date.now(), S.day)
  const dayTo = addDays(Date.now(), S.day + 1)
  const nowH = Math.floor(Date.now() / 3600000) * 3600000
  const hours = D.hours.filter(h => h.t >= dayFrom && h.t < dayTo)
  if (!hours.length) return null
  const scores = hours.map(h => scoreHour(c, h))
  const future = scores.filter(s => S.day > 0 || s.t >= nowH)
  const best = future.reduce<HourScore | null>((b, s) => !b || s.fish > b.fish || (s.fish === b.fish && s.raw > b.raw) ? s : b, null)
  let win = '', bestA = -1, bestB = -1
  if (best) {
    const i = scores.indexOf(best)
    let a = i, b = i
    while (a > 0 && scores[a - 1].fish >= best.fish && (S.day > 0 || scores[a - 1].t >= nowH)) a--
    while (b < scores.length - 1 && scores[b + 1].fish >= best.fish) b++
    const endT = scores[b].t + 3600000
    win = `${hhmm(scores[a].t)}–${hourNL(endT) === 0 ? '24:00' : hhmm(endT)}`
    bestA = a; bestB = b
  }
  const selT = S.sel ?? (S.day === 0 ? nowH : best?.t ?? dayFrom)
  const si = Math.max(0, hours.findIndex(h => h.t === selT))
  return { dayFrom, dayTo, nowH, hours, scores, best, win, bestA, bestB, si, sh: hours[si], ss: scores[si] }
}

const vt = (k: string) => S.detail === k ? '' : `style="view-transition-name:vt-${k}"`
const more = '<svg class="more" viewBox="0 0 12 12"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg>'

function render() {
  if (!S.loc) { $app.innerHTML = welcome(); return }
  const c = choice()
  const v = D.weather && D.hours.length ? dayView() : null
  const closed = v ? closedSeason(c, new Date(v.dayFrom + 12 * 3600000)) : null
  const ss = v?.ss
  const label = ss ? (ss.cap ? `${LABELS[String(ss.fish)]} · ${ss.cap.toLowerCase()}` : LABELS[String(ss.fish)]) : ''
  const heroWhen = !v ? '' : S.sel != null ? `Om ${hhmm(v.sh.t)}` : S.day === 0 ? 'Nu' : `Beste moment ${v.win}`

  $app.innerHTML = `
  <div class="screen">
    <header class="top">
      <button class="place" data-act="sheet-loc">
        <span class="pname">${esc(S.loc.name || 'Locatie…')}</span>
        <svg class="chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>
      </button>
      <div class="water" role="tablist">
        <span class="pill ${S.water === 'zout' ? 'right' : ''}"></span>
        <button role="tab" aria-selected="${S.water === 'zoet'}" data-act="water" data-v="zoet">Zoet</button>
        <button role="tab" aria-selected="${S.water === 'zout'}" data-act="water" data-v="zout">Zout</button>
      </div>
      <button class="round" data-act="sheet-menu" aria-label="Menu"><svg viewBox="0 0 14 14"><path d="M2.5 4h9M2.5 7h9M2.5 10h9"/></svg></button>
    </header>

    <div class="species">
      ${CHOICES.filter(x => x.water === S.water).map(x => `
        <button class="sp ${x.id === c.id ? 'on' : ''} ${x.members.length > 1 ? 'grp' : ''}" data-act="choice" data-v="${x.id}">
          <i style="--m:url(${BASE}fish/${x.icon}.svg)"></i><span>${x.name}</span>
        </button>`).join('')}
    </div>

    ${!v ? `<section class="card hero loading">${S.error ? `<p class="err">${S.error}</p><button class="btn" data-act="retry">Opnieuw</button>` : '<div class="spinner"></div><p>Water, weer en getij ophalen…</p>'}</section>` : `
    <section class="card hero" data-act="open" data-v="score" ${vt('score')}>
      <div class="daynav">
        <button class="round" data-act="day" data-v="-1" ${S.day === 0 ? 'disabled' : ''} aria-label="Vorige dag"><svg viewBox="0 0 12 12"><path d="M7.5 2.5L4 6l3.5 3.5"/></svg></button>
        <div class="dayname"><b>${['Vandaag', 'Morgen', 'Overmorgen'][S.day]}</b> <small>${dayName(v.dayFrom + 12 * 3600000)}${S.day > 0 ? ' · <em>verwachting</em>' : ''}</small></div>
        <button class="round" data-act="day" data-v="1" ${S.day === 2 ? 'disabled' : ''} aria-label="Volgende dag"><svg viewBox="0 0 12 12"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg></button>
      </div>
      ${fishRow(ss!.fish)}
      <h1 class="verdict">${label}</h1>
      <p class="meta">${heroWhen}${c.members.length > 1 ? ` · vooral ${esc(ss!.best.toLowerCase())}` : ''}</p>
      ${closed ? `<div class="notice">${closed}</div>` : ''}
    </section>

    <section class="tiles">
      ${moonTile(v.sh.t)}
      ${pressureTile(v.hours, v.si)}
      ${tempTile(v.hours, v.si)}
      ${tideTile(v.dayFrom, v.dayTo, v.sh.t)}
    </section>

    ${dayCard(v)}
    `}
  </div>
  ${S.detail && v ? detailView(S.detail, v) : ''}
  ${S.sheet === 'loc' ? locSheet() : ''}
  ${S.sheet === 'menu' ? menuSheet() : ''}`

  initCharts($app)
}

function springNeap(t: number): string | null {
  if (!D.tide) return null
  const byDay: Record<string, number[]> = {}
  for (const e of D.tide.ext) (byDay[ymd(e.t)] ??= []).push(e.h)
  const range = (hs: number[]) => Math.max(...hs) - Math.min(...hs)
  const all = Object.values(byDay).filter(h => h.length >= 3).map(range)
  const day = byDay[ymd(t)]
  if (!day || all.length < 3) return null
  const mean = all.reduce((s, x) => s + x, 0) / all.length
  const r = range(day) / mean
  return r > 1.07 ? 'Springtij' : r < 0.9 ? 'Doodtij' : ''
}

function moonImg(t: number, cls = '') {
  const nasa = D.index?.moon[ymd(t)]
  return nasa
    ? `<img class="moonimg nasa ${cls}" src="${BASE}data/${nasa.f}" alt="Foto van de maan (NASA)">`
    : `<img class="moonimg ${cls}" src="${icon(moonInfo(t).file)}" alt="">`
}

function moonTile(t: number) {
  const m = moonInfo(t)
  const sn = springNeap(t)
  if (sn != null) m.tij = sn
  const mt = SunCalc.getMoonTimes(new Date(dayStart(t) + 12 * 3600000), S.loc!.lat, S.loc!.lon)
  return `<button class="tile moon" data-act="open" data-v="moon" ${vt('moon')}>
    <div class="th">Maan ${more}</div>
    ${moonImg(t)}
    <div class="big">${fmt(m.frac * 100)}<small>%</small></div>
    <div class="sub">${m.name}</div>
    <div class="foot">${m.tij ? `<span class="tag">${m.tij}</span>` : ''}${mt.rise ? `<span>op ${hhmm(mt.rise.getTime())}</span>` : ''}</div>
  </button>`
}

function pressureTile(hours: HourInput[], si: number) {
  const h = hours[si]
  const d = h.dp3
  const trend = Math.abs(d) < 0.5 ? 'stabiel' : d < 0 ? 'dalend' : 'stijgend'
  const arrow = Math.abs(d) < 0.5 ? '→' : d < 0 ? '↘' : '↗'
  return `<button class="tile" data-act="open" data-v="pressure" ${vt('pressure')}>
    <div class="th">Luchtdruk ${more}</div>
    <div class="big">${Math.round(h.pressure)}<small> hPa</small></div>
    <div class="sub">${arrow} ${trend}${Math.abs(d) >= 0.5 ? ` · ${fmt(Math.abs(d), 1)} in 3 u` : ''}</div>
    ${sparkline(hours.map(x => x.pressure), { w: 100, h: 26, sel: si })}
  </button>`
}

function airAt(t: number) {
  const i = D.weather!.time.indexOf(t)
  return i >= 0 ? D.weather!.temp[i] : null
}

function waterSrc() {
  const wn = waterNow()
  return !wn ? '' : wn.src === 'geschat' ? 'water geschat uit de lucht' : wn.src === 'zeemodel' ? 'water uit zeemodel' : `water: ${esc(wn.src)}${wn.dist != null ? ` · ${fmt(wn.dist)} km` : ''}`
}

function tempTile(hours: HourInput[], si: number) {
  const h = hours[si]
  const temps = hours.map(x => airAt(x.t))
  const nums = temps.filter((x): x is number => x != null)
  return `<button class="tile" data-act="open" data-v="temp" ${vt('temp')}>
    <div class="th">Temperatuur ${more}</div>
    <div class="duo">
      <div><div class="big">${fmt(airAt(h.t) ?? 0)}<small>°</small></div><div class="sub">lucht</div></div>
      <div><div class="big wtemp">${h.waterTemp != null ? fmt(h.waterTemp, 1) : '–'}<small>°</small></div><div class="sub">water</div></div>
    </div>
    ${sparkline(temps, { w: 100, h: 22, sel: si })}
    <div class="foot src">${fmt(Math.min(...nums))}° tot ${fmt(Math.max(...nums))}° · ${waterSrc()}</div>
  </button>`
}

function tideState(t: number) {
  if (!D.tide) return ''
  const a = tideAt(D.tide, t - 1200000), b = tideAt(D.tide, t + 1200000)
  return a == null || b == null ? '' : Math.abs(b - a) < 3 ? 'kentering' : b > a ? 'opkomend' : 'afgaand'
}

function tideTile(from: number, to: number, selT: number) {
  if (!D.tide || !D.tideStation) return `<div class="tile tide"><div class="th">Getij</div><div class="sub">Geen getijstation gevonden</div></div>`
  const td = D.tide
  const vals: (number | null)[] = []
  for (let t = from; t <= to; t += 1200000) vals.push(tideAt(td, t))
  const ext = td.ext.filter(e => e.t >= from && e.t < to)
  const marks = ext.map(e => ({ i: Math.round((e.t - from) / 1200000), label: hhmm(e.t), top: e.hw }))
  const next = td.ext.filter(e => e.t > selT).slice(0, 2)
  return `<button class="tile tide" data-act="open" data-v="tide" ${vt('tide')}>
    <div class="th">Getij ${more}<span class="state">${tideState(selT)}</span></div>
    <div class="station"><span>${esc(D.tideStation.n)}</span><small>${fmt(D.tideStation.d, D.tideStation.d < 10 ? 1 : 0)} km</small></div>
    ${sparkline(vals, { w: 100, h: 34, sel: Math.round((selT - from) / 1200000), area: true, marks })}
    <div class="foot">${next.map(e => `<span><b>${e.hw ? 'HW' : 'LW'}</b> ${hhmm(e.t)}</span>`).join('')}</div>
  </button>`
}

function sunEvents(hours: HourInput[]) {
  const times = SunCalc.getTimes(new Date(hours[0].t + 12 * 3600000), S.loc!.lat, S.loc!.lon)
  return { rise: times.sunrise!.getTime(), set: times.sunset!.getTime() }
}

/** Vangstkans over de dag (curve) en daaronder per uur het weer, zoals een weer-app */
function dayCard(v: DayView) {
  const W = D.weather!
  const { rise, set } = sunEvents(v.hours)
  const idx = (t: number) => (t - v.hours[0].t) / 3600000
  const nowI = S.day === 0 ? idx(Date.now()) : undefined
  const bands = [
    { a: 0, b: Math.max(0, idx(rise)), cls: 'nightband' },
    { a: Math.min(v.hours.length - 1, idx(set)), b: v.hours.length - 1, cls: 'nightband' },
  ]
  if (v.bestA >= 0) bands.push({ a: Math.max(0, v.bestA - 0.5), b: Math.min(v.hours.length - 1, v.bestB + 0.5), cls: 'bestband' })
  const curve = chart({
    id: 'dag', scrub: 'hour', selI: v.si, nowI, yMin: 0, yMax: 5.6, pad: 3,
    yTicks: [{ v: 5, label: 'Top' }, { v: 2.5, label: 'Redelijk' }, { v: 0.5, label: 'Kansloos' }],
    series: [{ vals: v.scores.map(s => s.fish), cls: 'fishline', area: true }],
    bands,
    events: [
      { i: idx(rise), html: `<img src="${icon('sunrise')}" alt="">${hhmm(rise)}` },
      { i: idx(set), html: `<img src="${icon('sunset')}" alt="">${hhmm(set)}` },
    ],
    bubble: i => `${hhmm(v.hours[i].t)} · <b>${LABELS[String(v.scores[i].fish)]}</b>`,
  })
  // Blokken van 3 uur: passen in de breedte, recht onder de curve, zonder icoontjes
  const blocks: string[] = []
  for (let a = 0; a < v.hours.length; a += 3) {
    const part = v.hours.slice(a, a + 3)
    const mid = part[Math.min(1, part.length - 1)]
    const k = W.time.indexOf(mid.t)
    const rain = Math.max(...part.map(h => h.rainProb))
    const sel = v.si >= a && v.si < a + 3
    const hasNow = S.day === 0 && part.some(h => h.t === v.nowH)
    const past = S.day === 0 && part[part.length - 1].t < v.nowH
    blocks.push(`<button class="hb ${sel ? 'sel' : ''} ${past ? 'past' : ''}" data-act="hour" data-v="${hasNow ? v.nowH : part[0].t}" aria-label="${hhmm(part[0].t)} tot ${hhmm(part[part.length - 1].t + 3600000)}">
      <span class="ht">${hasNow ? 'Nu' : String(hourNL(part[0].t)).padStart(2, '0')}</span>
      <span class="htemp">${fmt(W.temp[k])}°</span>
      <span class="hwind"><svg viewBox="0 0 10 10" style="transform:rotate(${mid.windDir + 180}deg)"><path d="M5 1l3 7-3-1.6L2 8z"/></svg>${bft(mid.windKmh)}</span>
      <span class="hrain">${rain >= 10 ? rain + '%' : ''}</span>
    </button>`)
  }
  return `<section class="card daycard" ${vt('hours')}>
    <div class="dhead"><span>Vangstkans per uur</span>${v.win ? `<span class="dbest">beste ${v.win}</span>` : ''}
      <button class="dmore" data-act="open" data-v="hours">Details ${more}</button></div>
    ${curve}
    <div class="hrow" style="--n:${blocks.length}">${blocks.join('')}</div>
  </section>`
}

// ---------- grote vensters (tik op een tegel) ----------
const dayShort = (t: number) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short' }).format(t)
const dayLong = (t: number) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long' }).format(t)
const when = (t: number) => `${dayShort(t)} ${hhmm(t)}`
const signed = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}`

function midnightTicks(from: number, to: number, step: number) {
  const out: { i: number; label: string }[] = []
  for (let t = dayStart(from) === from ? from : addDays(from, 1); t < to; t = addDays(t, 1)) out.push({ i: (t - from) / step, label: dayShort(t + 12 * 3600000) })
  return out
}

function nightBands(from: number, to: number, step: number) {
  const out: { a: number; b: number; cls: string }[] = []
  for (let d = addDays(from, -1); d < to; d = addDays(d, 1)) {
    const a = SunCalc.getTimes(new Date(d + 12 * 3600000), S.loc!.lat, S.loc!.lon).sunset!.getTime()
    const b = SunCalc.getTimes(new Date(addDays(d, 1) + 12 * 3600000), S.loc!.lat, S.loc!.lon).sunrise!.getTime()
    const ia = Math.max(0, (a - from) / step), ib = Math.min((to - from) / step, (b - from) / step)
    if (ib > ia) out.push({ a: ia, b: ib, cls: 'nightband' })
  }
  return out
}

function detailView(k: string, v: DayView) {
  const titles: Record<string, string> = { score: 'Vangstkans', moon: 'Maan', pressure: 'Luchtdruk', temp: 'Temperatuur', tide: 'Getij', hours: 'Per uur' }
  const body = k === 'score' ? scoreDetail(v) : k === 'moon' ? moonDetail() : k === 'pressure' ? pressureDetail() : k === 'temp' ? tempDetail() : k === 'tide' ? tideDetail() : hoursDetail(v)
  return `<div class="dscrim" data-act="close-detail"></div>
  <div class="detail" role="dialog" aria-label="${titles[k]}" style="view-transition-name:vt-${k}">
    <div class="dtop"><div class="dgrab"></div><h2>${titles[k]}</h2>
      <button class="round" data-act="close-detail" aria-label="Sluiten"><svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg></button></div>
    <div class="dbody">${body}</div>
  </div>`
}

function factorText(key: string, h: HourInput, prof: Profile | undefined): string {
  switch (key) {
    case 'temp': return `water ${fmt(h.waterTemp ?? 0, 1)}°${prof ? `, fijn is ${prof.temp[1]}–${prof.temp[2]}°` : ''}`
    case 'light': return h.twilight > 0.5 ? 'schemer' : h.sunAlt < -6 ? 'donker' : h.sunFrac > 0.5 ? 'felle zon' : 'daglicht'
    case 'tide': return `${h.tideRising ? 'opkomend' : 'afgaand'}, stroming ${fmt((h.tideFlow ?? 0) * 100)}% van het sterkst`
    case 'waves': return `golven ${fmt(h.waves ?? 0, 1)} m`
    case 'wind': return `${bft(h.windKmh)} Bft${h.onshore ? ', aanlandig' : ''}`
    case 'rain': return h.thunder ? 'onweer' : h.rainMm >= 0.1 ? `${fmt(h.rainMm, 1)} mm regen` : 'droog'
    case 'pressure': return `${signed(h.dp3)} hPa in 3 uur`
    case 'river': return `afvoer ${fmt(h.riverRatio ?? 1, 1)}× normaal`
    case 'moon': return `${fmt(SunCalc.getMoonIllumination(new Date(h.t)).fraction * 100)}% verlicht`
    case 'season': return `${fmt(((prof?.season[h.month] ?? 1)) * 100)}% van het hoogseizoen`
    default: return ''
  }
}
const factorName: Record<string, string> = { temp: 'Watertemperatuur', light: 'Licht', tide: 'Getijstroming', waves: 'Golven', wind: 'Wind', rain: 'Regen', pressure: 'Luchtdruk', river: 'Rivier', moon: 'Maan', season: 'Seizoen' }

function scoreDetail(v: DayView) {
  const c = choice()
  const h = v.sh
  const ss = v.ss
  const prof = PROFILES.find(p => p.name === ss.best)
  const members = c.members.length > 1 ? c.members.map(id => {
    const p = PROFILES.find(x => x.id === id)!
    const s = scoreHour({ ...c, members: [id] }, h)
    return `<div class="mrow"><span>${p.name}</span>${fishRow(s.fish)}<em>${LABELS[String(s.fish)]}</em></div>`
  }).join('') : ''
  const rows = [...ss.factors].sort((a, b) => b.w - a.w).map(f => `
    <div class="frow">
      <div class="fname">${factorName[f.key] ?? f.key}<small>${f.key === 'season' ? 'vermenigvuldigt' : f.w >= 0.18 ? 'telt zwaar' : f.w >= 0.08 ? 'telt mee' : 'telt licht'}</small></div>
      <div class="fbar"><i style="width:${Math.round(f.f * 100)}%"></i></div>
      <div class="ftext">${factorText(f.key, h, prof)}</div>
    </div>`).join('')
  return `<div class="dsummary">${fishRow(ss.fish)}<div><b>${LABELS[String(ss.fish)]}</b><span>${dayLong(h.t)}, ${hhmm(h.t)}${c.members.length > 1 ? ` · vooral ${ss.best.toLowerCase()}` : ''}</span></div></div>
    ${members ? `<h3>Per soort</h3><div class="members">${members}</div>` : ''}
    <h3>Waar het op rust${c.members.length > 1 ? ` (${ss.best.toLowerCase()})` : ''}</h3>
    <div class="factors">${rows}</div>
    <p class="dnote">Een langere balk is gunstiger. Kies een ander uur in de grafiek op het hoofdscherm.</p>`
}

function moonViewInner() {
  const t = addDays(Date.now(), S.moonDay) + 22 * 3600000
  const m = moonInfo(t)
  const sn = springNeap(t)
  const tij = sn != null ? sn : m.tij
  const mt = SunCalc.getMoonTimes(new Date(dayStart(t) + 12 * 3600000), S.loc!.lat, S.loc!.lon)
  return `${moonImg(t, 'big')}
    <div class="mtext">
      <div class="mdate">${S.moonDay === 0 ? 'Vanavond' : dayLong(t)}</div>
      <div class="big">${fmt(m.frac * 100)}<small>% verlicht</small></div>
      <div class="sub">${m.name}${tij ? ` · ${tij.toLowerCase()}` : ''}</div>
      <div class="foot">${mt.rise ? `<span>op ${hhmm(mt.rise.getTime())}</span>` : ''}${mt.set ? `<span>onder ${hhmm(mt.set.getTime())}</span>` : ''}</div>
    </div>`
}

function nextPhases() {
  const out: { t: number; name: string }[] = []
  let prev = SunCalc.getMoonIllumination(new Date()).phase
  for (let t = Date.now(); t < Date.now() + 36 * 86400000 && out.length < 4; t += 3600000) {
    const p = SunCalc.getMoonIllumination(new Date(t)).phase
    if (prev < 0.5 && p >= 0.5) out.push({ t, name: 'Volle maan' })
    if (prev > 0.9 && p < 0.1) out.push({ t, name: 'Nieuwe maan' })
    if (prev < 0.25 && p >= 0.25) out.push({ t, name: 'Eerste kwartier' })
    if (prev < 0.75 && p >= 0.75) out.push({ t, name: 'Laatste kwartier' })
    prev = p
  }
  return out
}

function moonDetail() {
  return `<div class="moonview">${moonViewInner()}</div>
    <input class="slider" type="range" min="0" max="29" step="1" value="${S.moonDay}" data-act="moonday" aria-label="Dag kiezen">
    <div class="sliderlabels"><span>vandaag</span><span>over 2 weken</span><span>over 4 weken</span></div>
    <h3>Komende fasen</h3>
    <div class="phases">${nextPhases().map(p => `<div><span>${p.name}</span><b>${dayLong(p.t)}</b></div>`).join('')}</div>
    <p class="dnote">Rond volle en nieuwe maan is het springtij: meer stroming aan zee. De maan zelf telt maar licht mee in de score. Foto's: NASA.</p>`
}

function pressureDetail() {
  const W = D.weather!
  const now = Math.floor(Date.now() / 3600000) * 3600000
  const from = addDays(now, -6), to = W.time[W.time.length - 1]
  const idx = W.time.map((t, i) => [t, i] as const).filter(([t]) => t >= from && t <= to)
  const vals = idx.map(([, i]) => W.pressure[i])
  const times = idx.map(([t]) => t)
  const nowI = times.indexOf(now)
  const at = (t: number) => { const i = W.time.indexOf(t); return i >= 0 ? W.pressure[i] : null }
  const past24 = (at(now) ?? 0) - (at(now - 86400000) ?? 0)
  const next24 = (at(now + 86400000) ?? 0) - (at(now) ?? 0)
  return chart({
    id: 'druk', series: [{ vals, cls: 'pline', area: true }], nowI, selI: nowI,
    bands: [{ a: nowI, b: vals.length - 1, cls: 'fcband' }],
    xTicks: midnightTicks(from, to, 3600000),
    bubble: i => `${when(times[i])} · <b>${Math.round(vals[i])} hPa</b>${i >= 3 ? ` · ${signed(vals[i] - vals[i - 3])} in 3 u` : ''}`,
  }) + `<div class="facts">
      <div><span>Afgelopen 24 uur</span><b>${signed(past24)} hPa</b></div>
      <div><span>Komende 24 uur</span><b>${signed(next24)} hPa</b></div>
      <div><span>Laagste en hoogste</span><b>${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))} hPa</b></div>
    </div>
    <p class="dnote">Zes dagen terug tot drie dagen vooruit; het lichte deel is verwachting. Rustig dalende druk is gunstig, een snelle stijging na een front niet. Luchtdruk telt maar licht mee.</p>`
}

function tempDetail() {
  const W = D.weather!
  const now = Math.floor(Date.now() / 3600000) * 3600000
  const from = addDays(now, -3), to = addDays(now, 3)
  const hrs = D.hoursWide.filter(h => h.t >= from && h.t < to)
  const air = hrs.map(h => airAt(h.t))
  const water = hrs.map(h => h.waterTemp)
  const nowI = hrs.findIndex(h => h.t === now)
  const ts = D.tempStation
  return chart({
    id: 'temp', series: [{ vals: air, cls: 'airline' }, { vals: water, cls: 'waterline' }], nowI, selI: nowI,
    bands: [...nightBands(from, to, 3600000), { a: nowI, b: hrs.length - 1, cls: 'fcband' }],
    xTicks: midnightTicks(from, to, 3600000),
    bubble: i => `${when(hrs[i].t)} · lucht <b>${air[i] != null ? fmt(air[i]!) : '–'}°</b>${water[i] != null ? ` · water <b class="wc">${fmt(water[i]!, 1)}°</b>` : ''}`,
  }) + `<div class="legend"><span class="lg lg-air">lucht</span><span class="lg lg-water">water</span></div>
    <div class="facts">
      <div><span>Water nu</span><b>${D.hours.find(h => h.t === now)?.waterTemp != null ? fmt(D.hours.find(h => h.t === now)!.waterTemp!, 1) + '°' : '–'}</b></div>
      <div><span>Bron</span><b>${ts ? `${esc(ts.n)}, ${fmt(ts.d)} km` : waterSrc().replace('water ', '')}</b></div>
      ${ts ? `<div><span>Gemeten om</span><b>${hhmm(ts.at)}</b></div>` : ''}
    </div>
    <p class="dnote">De watertemperatuur is gemeten door Rijkswaterstaat${ts ? '' : ' (hier geen meetpunt in de buurt, dus geschat)'}. Terug en vooruit is ze geschat uit de luchttemperatuur${S.water === 'zout' ? ' en het zeemodel' : ''}.</p>`
}

function tideDetail() {
  if (!D.tide || !D.tideStation) return '<p class="dnote">Geen getijstation gevonden.</p>'
  const td = D.tide
  const from = dayStart(Date.now()), to = addDays(from, 3), step = 1200000
  const vals: (number | null)[] = [], times: number[] = []
  for (let t = from; t <= to; t += step) { vals.push(tideAt(td, t)); times.push(t) }
  const ext = td.ext.filter(e => e.t >= from && e.t <= to)
  const nowI = Math.round((Date.now() - from) / step)
  const opts = D.tideList.slice(0, 40).map(s => `<option value="${s.c}" ${s.c === D.tideStation!.c ? 'selected' : ''}>${esc(s.n)} · ${fmt(s.d, s.d < 10 ? 1 : 0)} km</option>`).join('')
  const days = [0, 1, 2].map(k => {
    const a = addDays(from, k), b = addDays(from, k + 1)
    return `<div class="tday"><b>${k === 0 ? 'Vandaag' : k === 1 ? 'Morgen' : dayShort(a + 12 * 3600000)}</b>${td.ext.filter(e => e.t >= a && e.t < b).map(e => `<span class="${e.hw ? 'hw' : 'lw'}">${e.hw ? 'HW' : 'LW'} ${hhmm(e.t)} <small>${signed(e.h, 0)}</small></span>`).join('')}</div>`
  }).join('')
  return `<label class="station big">
      <span>${esc(D.tideStation.n)}</span><small>${fmt(D.tideStation.d, D.tideStation.d < 10 ? 1 : 0)} km</small>
      <svg class="chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>
      <select data-act="tide" aria-label="Kies getijstation">${opts}</select>
    </label>` + chart({
    id: 'getij', series: [{ vals, cls: 'tline', area: true }], nowI, selI: nowI,
    bands: nightBands(from, to, step),
    marks: ext.map(e => ({ i: Math.round((e.t - from) / step), label: hhmm(e.t), top: e.hw })),
    xTicks: midnightTicks(from, to, step),
    bubble: i => `${when(times[i])} · <b>${vals[i] != null ? signed(vals[i]!, 0) : '–'} cm</b> · ${tideState(times[i])}`,
  }) + `<div class="tdays">${days}</div>
    <p class="dnote">Astronomisch getij van Rijkswaterstaat, in cm ten opzichte van NAP. Wind kan het echte water hoger of lager maken.</p>`
}

function hoursDetail(v: DayView) {
  const W = D.weather!
  const zout = S.water === 'zout'
  const rows = v.hours.map((h, i) => {
    const k = W.time.indexOf(h.t)
    const s = v.scores[i]
    return `<tr class="${i === v.si ? 'sel' : ''} ${S.day === 0 && h.t < v.nowH ? 'past' : ''}">
      <td>${hhmm(h.t)}</td>
      <td><img src="${icon(wxIcon(W.code[k], !!W.isDay[k], h.sunFrac))}" alt=""></td>
      <td>${fmt(W.temp[k])}°</td>
      <td class="${h.rainProb >= 30 ? 'rc' : ''}">${h.rainProb >= 10 ? `${h.rainProb}%${h.rainMm >= 0.1 ? ` <small>${fmt(h.rainMm, 1)}</small>` : ''}` : '–'}</td>
      <td><span class="hwind"><svg viewBox="0 0 10 10" style="transform:rotate(${h.windDir + 180}deg)"><path d="M5 1l3 7-3-1.6L2 8z"/></svg>${bft(h.windKmh)}</span> <small>${fmt(h.gustKmh)}</small></td>
      <td>${fmt(h.cloud)}%</td>
      ${zout ? `<td>${h.waves != null ? fmt(h.waves, 1) : '–'}</td>` : ''}
      <td>${h.waterTemp != null ? fmt(h.waterTemp, 1) + '°' : '–'}</td>
      <td class="fs">${fmt(s.fish, s.fish % 1 ? 1 : 0)}</td>
    </tr>`
  }).join('')
  return `<div class="tablewrap"><table class="htable">
    <thead><tr><th>Tijd</th><th></th><th>Lucht</th><th>Regen</th><th>Wind <small>stoot km/u</small></th><th>Wolken</th>${zout ? '<th>Golf m</th>' : ''}<th>Water</th><th>Vis</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

function welcome() {
  return `<div class="screen welcome">
    <span class="hello"></span>
    <h1>Visvangst</h1>
    <p>Hoe groot is de kans op actieve vis, hier en nu? Getij, maan, luchtdruk, temperatuur, regen en zon op één scherm.</p>
    <button class="btn primary" data-act="gps">${S.locating ? 'Locatie zoeken…' : 'Gebruik mijn locatie'}</button>
    <button class="btn" data-act="sheet-loc">Kies een plek</button>
    ${S.error ? `<p class="err">${S.error}</p>` : ''}
  </div>${S.sheet === 'loc' ? locSheet() : ''}`
}

function locSheet() {
  return `<div class="sheetbg" data-act="close"></div>
  <div class="sheet" role="dialog" aria-label="Locatie kiezen">
    <div class="grab"></div>
    <h2>Waar ga je vissen?</h2>
    <button class="btn primary" data-act="gps">${S.locating ? 'Locatie zoeken…' : 'Gebruik mijn locatie'}</button>
    <input class="search" type="search" placeholder="Zoek een plaats of water…" data-act="search" autocomplete="off" />
    <div class="results">${S.search.map((r, i) => `<button data-act="pick" data-v="${i}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('')}</div>
  </div>`
}

function menuSheet() {
  return `<div class="sheetbg" data-act="close"></div>
  <div class="sheet info" role="dialog" aria-label="Menu">
    <div class="sheethead"><h2>Menu</h2><button class="round" data-act="close" aria-label="Sluiten"><svg viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg></button></div>
    <h3>Weergave</h3>
    <div class="water theme" role="tablist">
      <span class="pill ${S.theme === 'light' ? 'right' : ''}"></span>
      <button role="tab" aria-selected="${S.theme === 'dark'}" data-act="theme" data-v="dark">Donker</button>
      <button role="tab" aria-selected="${S.theme === 'light'}" data-act="theme" data-v="light">Licht</button>
    </div>
    <h3>Hoe werkt de score?</h3>
    <p>Per uur kijkt Visvangst naar wat vis actief maakt. Wat het zwaarst weegt, staat bovenaan.</p>
    <ul>
      <li><b>Watertemperatuur.</b> Elke soort heeft een eigen fijne temperatuur. Gemeten door Rijkswaterstaat, of geschat.</li>
      <li><b>Getijstroming</b> (zout). Vis eet als het water loopt. Bij kentering is het stil.</li>
      <li><b>Licht.</b> Schemer is vaak het beste moment. Felle zon remt rovers.</li>
      <li><b>Wind en golven.</b> Matige wind is goed, storm niet. Aan zee helpt aanlandige wind.</li>
      <li><b>Regen.</b> Lichte regen is prima. Bij onweer: kansloos, en niet veilig.</li>
      <li><b>Luchtdruk en maan</b> tellen maar licht mee. Het bewijs daarvoor is zwak.</li>
      <li><b>Seizoen.</b> Makreel in de winter is kansloos, kabeljauw juist niet.</li>
    </ul>
    <p>Bij een groep (roofvis, zeevis) telt de soort met de beste kans. Morgen en overmorgen zijn een verwachting.</p>
    <p class="small">Een score is een onderbouwde schatting, geen garantie. Let op de regels van je viswater.</p>
    <h3>Bronnen</h3>
    <p class="small">Weer, golven en rivierafvoer: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0). Getij en watertemperatuur: Rijkswaterstaat. Maanfoto's: NASA Scientific Visualization Studio. Locatienaam: © OpenStreetMap. Iconen: Microsoft Fluent Emoji (MIT). Vissilhouetten: PhyloPic (publiek domein / CC0).</p>
    <p class="small">Bijgewerkt: getij en watertemperatuur ${D.index ? hhmm(D.index.generated) : '–'}, weer bij het openen.</p>
    <p class="small">Op je beginscherm zetten: iPhone via Deel → "Zet op beginscherm", Android via het menu → "Toevoegen aan startscherm".</p>
    <button class="btn" data-act="close">Sluiten</button>
  </div>`
}

// ---------- bediening ----------
let searchTimer = 0
$app.addEventListener('click', async e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!el) return
  const act = el.dataset.act, v = el.dataset.v
  if (act === 'water' && v !== S.water) { S.water = v as Water; S.sel = null; persist(); pickTemp(); rebuild(); render() }
  else if (act === 'choice') { S.choice[S.water!] = v!; persist(); render() }
  else if (act === 'day') { S.day = Math.max(0, Math.min(2, S.day + Number(v))); S.sel = null; render() }
  else if (act === 'hour') { const t = Number(v); S.sel = S.sel === t ? null : t; render() }
  else if (act === 'open') { if (v === 'moon') S.moonDay = 0; setDetail(v!) }
  else if (act === 'close-detail') setDetail(null)
  else if (act === 'sheet-loc') { S.sheet = 'loc'; S.search = []; render(); $app.querySelector<HTMLInputElement>('.search')?.focus() }
  else if (act === 'sheet-menu') { S.sheet = 'menu'; render() }
  else if (act === 'theme') { S.theme = v === 'light' ? 'light' : 'dark'; persist(); applyTheme()
// Het visje als vorm voor alle visjes, ook in de vensters
document.documentElement.style.setProperty('--fishm', `url(${BASE}fish/voorn.svg)`); render() }
  else if (act === 'close') { S.sheet = null; render() }
  else if (act === 'retry') loadAll()
  else if (act === 'gps') {
    S.locating = true; render()
    const l = await locate()
    S.locating = false
    if (l) { S.sheet = null; await useLocation(l) } else { S.error = 'Je locatie is niet beschikbaar. Kies een plek.'; S.sheet = 'loc'; render() }
  } else if (act === 'pick') {
    const r = S.search[Number(v)]
    S.sheet = null
    await useLocation({ lat: r.lat, lon: r.lon, name: r.name, gps: false })
  }
})
$app.addEventListener('input', e => {
  const el = e.target as HTMLInputElement
  if (el.dataset.act === 'moonday') {
    // Alleen de maan bijwerken, zodat de schuifbalk niet opnieuw getekend wordt tijdens het schuiven
    S.moonDay = Number(el.value)
    const mv = $app.querySelector('.moonview')
    if (mv) mv.innerHTML = moonViewInner()
    return
  }
  if (el.dataset.act !== 'search') return
  clearTimeout(searchTimer)
  searchTimer = window.setTimeout(async () => {
    const q = el.value.trim()
    S.search = q.length >= 2 ? await searchPlace(q).catch(() => []) : []
    const box = $app.querySelector('.results')
    if (box) box.innerHTML = S.search.map((r, i) => `<button data-act="pick" data-v="${i}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('')
  }, 250)
})
$app.addEventListener('change', async e => {
  const el = e.target as HTMLSelectElement
  if (el.dataset.act !== 'tide' || !S.loc) return
  S.tideOverride = { key: locKey(S.loc), code: el.value }
  persist()
  await pickTide()
  render()
})
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (S.sheet) { S.sheet = null; render() } else if (S.detail) setDetail(null)
})

// Venster openen en sluiten; waar het kan groeit de tegel vloeiend uit (View Transitions)
function setDetail(k: string | null) {
  const go = () => { S.detail = k; render() }
  const doc = document as any
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(go)
  else go()
}

// Schuiven over grafieken. De dag-grafiek kiest het uur (het hele scherm volgt), de rest toont alleen een label.
let drag: { el: HTMLElement; scrub: string; rect: DOMRect; n: number; last: number } | null = null
let swipe: { y0: number; el: HTMLElement; dy: number } | null = null
let raf = 0
function dragMove(x: number) {
  if (!drag) return
  const i = Math.max(0, Math.min(drag.n - 1, Math.round(((x - drag.rect.left) / drag.rect.width) * (drag.n - 1))))
  if (drag.scrub === 'hour') {
    if (i === drag.last) return
    drag.last = i
    const v = dayView()
    if (!v || !v.hours[i]) return
    S.sel = v.hours[i].t
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => render())
  } else scrubTo(drag.el, i)
}
$app.addEventListener('pointerdown', e => {
  const t = e.target as HTMLElement
  const el = t.closest<HTMLElement>('.ichart')
  if (el && el.dataset.chart) {
    const plot = el.querySelector('.plot')!
    const v = el.dataset.scrub === 'hour' ? dayView() : null
    drag = { el, scrub: el.dataset.scrub!, rect: plot.getBoundingClientRect(), n: v ? v.hours.length : indexAt(el, plot.getBoundingClientRect().right) + 1, last: -1 }
    dragMove(e.clientX)
    return
  }
  const top = t.closest<HTMLElement>('.dtop')
  if (top && !t.closest('button')) swipe = { y0: e.clientY, el: top.parentElement!, dy: 0 }
})
window.addEventListener('pointermove', e => {
  if (drag) dragMove(e.clientX)
  if (swipe) {
    swipe.dy = Math.max(0, e.clientY - swipe.y0)
    swipe.el.style.transform = `translateY(${swipe.dy}px)`
  }
})
const endPointer = () => {
  drag = null
  if (swipe) {
    // Naar beneden vegen sluit het venster
    if (swipe.dy > 90) setDetail(null)
    else { swipe.el.style.transition = 'transform .2s'; swipe.el.style.transform = '' }
    swipe = null
  }
}
window.addEventListener('pointerup', endPointer)
window.addEventListener('pointercancel', endPointer)

// Ververs als de app weer in beeld komt na een tijdje
let lastLoad = Date.now()
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && Date.now() - lastLoad > 20 * 60000) {
    lastLoad = Date.now()
    if (S.loc?.gps) { const l = await locate(); if (l && km(l, S.loc) > 2) return useLocation(l) }
    loadAll()
  }
})

// Voor de testscripts
;(window as any).__vv = { S, D, CHOICES, scoreHour, dayView }

// ---------- start ----------
;(async () => {
  render()
  if (S.loc) {
    loadAll()
    if (S.loc.gps) {
      const l = await locate()
      if (l && km(l, S.loc) > 2) useLocation(l)
    }
  } else {
    S.locating = true; render()
    const l = await locate()
    S.locating = false
    if (l) useLocation(l); else render()
  }
})()
