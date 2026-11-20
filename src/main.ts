import '@fontsource-variable/inter'
import './style.css'
import * as SunCalc from 'suncalc'
import {
  loadIndex, loadTide, loadWeather, loadMarine, loadRiver, placeName, searchPlace,
  buildHours, tideAt, km, ymd, hourNL, dayStart, addDays, seaBearing,
  type Index, type Tide, type Weather, type Marine, type River, type Station, type TempStation,
} from './data'
import { CHOICES, PROFILES, LABELS, closedSeason, scoreHour, bft, type Choice, type HourInput, type HourScore, type Water } from './score'

const BASE = import.meta.env.BASE_URL
const icon = (n: string) => `${BASE}icons/${n}.webp`
const $app = document.getElementById('app')!

// ---------- staat ----------
interface Loc { lat: number; lon: number; name: string; gps: boolean }
const saved = JSON.parse(localStorage.getItem('visvangst') ?? '{}')
const S = {
  loc: (saved.loc ?? null) as Loc | null,
  water: (saved.water ?? null) as Water | null,
  choice: (saved.choice ?? { zoet: 'roofvis', zout: 'zeevis' }) as Record<Water, string>,
  tideOverride: (saved.tideOverride ?? null) as { key: string; code: string } | null,
  day: 0,
  sel: null as number | null,
  sheet: null as null | 'loc' | 'info',
  search: [] as { name: string; sub: string; lat: number; lon: number }[],
  locating: false,
  error: '' as string,
}
const persist = () => localStorage.setItem('visvangst', JSON.stringify({ loc: S.loc, water: S.water, choice: S.choice, tideOverride: S.tideOverride }))

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
    if (!S.water) {
      // Eerste keer: aan de kust is zout de logische keuze
      const nearSalt = index.temp.filter(t => t.z).some(t => km(t, S.loc!) < 6) || seaBearing(lat, lon) != null
      S.water = nearSalt ? 'zout' : 'zoet'
      persist()
    }
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
  D.hours = buildHours({
    lat: S.loc.lat, lon: S.loc.lon, water: S.water, weather: D.weather, marine: D.marine, river: D.river,
    tide: D.tide, waterNow: waterNow(),
  }, from, addDays(from, 3))
}

// ---------- weergave ----------
function fishRow(n: number, size = 'lg') {
  let h = `<div class="fishrow ${size}" role="img" aria-label="${fmt(n, n % 1 ? 1 : 0)} van 5 visjes">`
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, n - i))
    const cls = fill >= 1 ? 'full' : fill > 0 ? 'half' : 'empty'
    h += `<span class="fish ${cls}" style="--i:${i}"><img class="ghost" src="${icon('fish')}" alt=""><img class="fill" src="${icon('fish')}" alt=""></span>`
  }
  return h + '</div>'
}

function describe(f: { key: string; f: number }, h: HourInput, s: HourScore): string {
  const good = f.f >= 0.75
  const prof = PROFILES.find(p => p.name === s.best)
  switch (f.key) {
    case 'temp': return good ? `Water ${fmt(h.waterTemp!, 0)}° is goed` : `Water ${fmt(h.waterTemp!, 0)}° is ${prof && h.waterTemp! < prof.temp[1] ? 'te koud' : 'te warm'}`
    case 'light': return h.twilight > 0.5 ? 'Schemer' : h.sunAlt < -6 ? (good ? 'Donker, vis jaagt' : 'Donker') : good ? 'Goed licht' : h.sunFrac > 0.5 ? 'Felle zon' : 'Weinig actie overdag'
    case 'tide': return good ? (h.tideRising ? 'Opkomend tij loopt' : 'Het tij loopt') : 'Stil water (kentering)'
    case 'waves': return good ? 'Mooie golfslag' : (h.waves ?? 0) > 1.5 ? 'Te ruwe zee' : 'Vlakke zee'
    case 'wind': return good ? (h.onshore ? 'Aanlandige wind' : 'Fijne wind') : bft(h.windKmh) >= 6 ? 'Harde wind' : 'Windstil'
    case 'rain': return h.thunder ? 'Onweer' : good ? (h.rainMm >= 0.1 ? 'Lichte regen' : 'Droog') : 'Flinke regen'
    case 'pressure': return good ? 'Dalende luchtdruk' : h.dp3 > 0.5 ? 'Stijgende luchtdruk' : 'Snel dalende druk'
    case 'river': return 'Hoog water in de rivier'
    case 'season': return good ? 'Volop seizoen' : 'Buiten het seizoen'
    default: return ''
  }
}

function whyChips(s: HourScore, h: HourInput) {
  const scored = s.factors.filter(f => f.key !== 'moon')
  const pos = scored.filter(f => f.f >= 0.8).sort((a, b) => b.w * b.f - a.w * a.f).slice(0, 2)
  const neg = scored.filter(f => f.f <= 0.5).sort((a, b) => a.f * a.w - b.f * b.w - (b.w - a.w)).slice(0, 2)
  const chip = (f: { key: string; f: number }, ok: boolean) => `<span class="chip ${ok ? 'pos' : 'neg'}"><b>${ok ? '+' : '−'}</b>${esc(describe(f, h, s))}</span>`
  const list = [...pos.map(f => chip(f, true)), ...neg.map(f => chip(f, false))]
  // Hoogstens drie, zodat het op smalle schermen op één of twee regels past
  if (list.length > 3) list.splice(pos.length > 1 ? 1 : 3, 1)
  return list.join('')
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

function render() {
  if (!S.loc) { $app.innerHTML = welcome(); return }
  const ready = D.weather && D.hours.length
  const c = choice()
  const dayFrom = addDays(Date.now(), S.day)
  const dayTo = addDays(Date.now(), S.day + 1)
  const nowH = Math.floor(Date.now() / 3600000) * 3600000
  const hours = D.hours.filter(h => h.t >= dayFrom && h.t < dayTo)
  const scores = hours.map(h => scoreHour(c, h))
  const future = scores.filter(s => S.day > 0 || s.t >= nowH)
  const best = future.reduce<HourScore | null>((b, s) => !b || s.fish > b.fish || (s.fish === b.fish && s.raw > b.raw) ? s : b, null)
  let win = ''
  if (best) {
    const i = scores.indexOf(best)
    let a = i, b = i
    while (a > 0 && scores[a - 1].fish >= best.fish && (S.day > 0 || scores[a - 1].t >= nowH)) a--
    while (b < scores.length - 1 && scores[b + 1].fish >= best.fish) b++
    win = `${hhmm(scores[a].t)}–${hhmm(scores[b].t + 3600000)}`
  }
  const selT = S.sel ?? (S.day === 0 ? nowH : best?.t ?? dayFrom)
  const si = Math.max(0, hours.findIndex(h => h.t === selT))
  const sh = hours[si], ss = scores[si]
  const closed = closedSeason(c, new Date(dayFrom + 12 * 3600000))

  const label = ss ? (ss.cap ? `${LABELS[String(ss.fish)]} · ${ss.cap.toLowerCase()}` : LABELS[String(ss.fish)]) : ''
  const heroWhen = !sh ? '' : S.sel != null ? `Om ${hhmm(sh.t)}` : S.day === 0 ? 'Nu' : 'Beste moment'
  const tone = ss ? Math.round(ss.fish * 2) : 0

  $app.innerHTML = `
  <div class="screen tone-${tone}">
    <header class="top">
      <button class="place" data-act="sheet-loc">
        <img src="${icon('round_pushpin')}" alt="">
        <span class="pname">${esc(S.loc.name || 'Locatie…')}</span>
        <svg class="chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>
      </button>
      <div class="water" role="tablist">
        <span class="pill ${S.water === 'zout' ? 'right' : ''}"></span>
        <button role="tab" aria-selected="${S.water === 'zoet'}" data-act="water" data-v="zoet">Zoet</button>
        <button role="tab" aria-selected="${S.water === 'zout'}" data-act="water" data-v="zout">Zout</button>
      </div>
      <button class="round" data-act="sheet-info" aria-label="Uitleg">i</button>
    </header>

    <div class="species">
      ${CHOICES.filter(x => x.water === S.water).map(x => `
        <button class="sp ${x.id === c.id ? 'on' : ''} ${x.members.length > 1 ? 'grp' : ''}" data-act="choice" data-v="${x.id}">
          <i style="--m:url(${BASE}fish/${x.icon}.svg)"></i><span>${x.name}</span>
        </button>`).join('')}
    </div>

    ${!ready ? `<section class="card hero loading">${S.error ? `<p class="err">${S.error}</p><button class="btn" data-act="retry">Opnieuw</button>` : '<div class="spinner"></div><p>Water, weer en getij ophalen…</p>'}</section>` : `
    <section class="card hero">
      <div class="daynav">
        <button class="round" data-act="day" data-v="-1" ${S.day === 0 ? 'disabled' : ''} aria-label="Vorige dag"><svg viewBox="0 0 12 12"><path d="M7.5 2.5L4 6l3.5 3.5"/></svg></button>
        <div class="dayname"><b>${['Vandaag', 'Morgen', 'Overmorgen'][S.day]}</b> <small>${dayName(dayFrom + 12 * 3600000)}${S.day > 0 ? ' · <em>verwachting</em>' : ''}</small></div>
        <button class="round" data-act="day" data-v="1" ${S.day === 2 ? 'disabled' : ''} aria-label="Volgende dag"><svg viewBox="0 0 12 12"><path d="M4.5 2.5L8 6l-3.5 3.5"/></svg></button>
      </div>
      ${fishRow(ss.fish)}
      <h1 class="verdict">${label}</h1>
      <div class="meta">
        <span class="when">${heroWhen}${c.members.length > 1 && ss ? ` · vooral <b>${esc(ss.best.toLowerCase())}</b>` : ''}</span>
        ${best ? `<span class="bestline"><img src="${icon('fishing_pole')}" alt="">Beste moment <b>${win}</b><span class="score">${fmt(best.fish, best.fish % 1 ? 1 : 0)}<img class="mini" src="${icon('fish')}" alt="visjes"></span></span>` : ''}
      </div>
      <div class="why">${whyChips(ss, sh)}</div>
      ${closed ? `<div class="notice"><img src="${icon('high_voltage')}" alt=""> ${closed}</div>` : ''}
    </section>

    <section class="tiles">
      ${moonTile(sh.t)}
      ${pressureTile(hours, si)}
      ${tempTile(hours, si)}
      ${tideTile(dayFrom, dayTo, sh.t)}
    </section>

    ${hourStrip(hours, scores, si, nowH)}
    <footer>Bijgewerkt ${D.index ? hhmm(D.index.generated) : ''} · Open-Meteo · Rijkswaterstaat · NASA</footer>
    `}
  </div>
  ${S.sheet === 'loc' ? locSheet() : ''}
  ${S.sheet === 'info' ? infoSheet() : ''}`

  const strip = $app.querySelector<HTMLElement>('.strip')
  const selEl = strip?.querySelector<HTMLElement>('.col.sel')
  if (strip && selEl && !strip.dataset.user) strip.scrollLeft = Math.max(0, selEl.offsetLeft - strip.clientWidth / 2 + selEl.clientWidth / 2)
}

function springNeap(t: number): string | null {
  if (!D.tide) return null
  const byDay: Record<string, number[]> = {}
  for (const e of D.tide.ext) (byDay[ymd(e.t)] ??= []).push(e.h)
  const range = (hs: number[]) => Math.max(...hs) - Math.min(...hs)
  const all = Object.values(byDay).filter(h => h.length >= 3).map(range)
  const day = byDay[ymd(t)]
  if (!day || all.length < 3) return null
  // Vergelijk met een normaal getij voor dit station (gemiddelde van de bekende dagen, bijgesteld met de maan)
  const mean = all.reduce((s, x) => s + x, 0) / all.length
  const r = range(day) / mean
  return r > 1.07 ? 'Springtij' : r < 0.9 ? 'Doodtij' : ''
}

function moonTile(t: number) {
  const m = moonInfo(t)
  const sn = springNeap(t)
  if (sn != null) m.tij = sn
  const nasa = D.index?.moon[ymd(t)]
  const mt = SunCalc.getMoonTimes(new Date(dayStart(t)), S.loc!.lat, S.loc!.lon)
  const img = nasa ? `<img class="moonimg nasa" src="${BASE}data/${nasa.f}" alt="Foto van de maan (NASA)">` : `<img class="moonimg" src="${icon(m.file)}" alt="">`
  return `<div class="tile moon">
    <div class="th">Maan</div>
    ${img}
    <div class="big">${fmt(m.frac * 100)}<small>%</small></div>
    <div class="sub">${m.name}</div>
    <div class="foot">${m.tij ? `<span class="tag">${m.tij}</span>` : ''}${mt.rise ? `<span>op ${hhmm(mt.rise.getTime())}</span>` : ''}</div>
  </div>`
}

function pressureTile(hours: HourInput[], si: number) {
  const h = hours[si]
  const d = h.dp3
  const trend = Math.abs(d) < 0.5 ? 'stabiel' : d < 0 ? 'dalend' : 'stijgend'
  const arrow = Math.abs(d) < 0.5 ? '→' : d < 0 ? '↘' : '↗'
  return `<div class="tile">
    <div class="th"><img src="${icon(d < -0.5 ? 'chart_decreasing' : 'chart_increasing')}" alt="">Luchtdruk</div>
    <div class="big">${Math.round(h.pressure)}<small> hPa</small></div>
    <div class="sub">${arrow} ${trend}${Math.abs(d) >= 0.5 ? ` · ${fmt(Math.abs(d), 1)} in 3 u` : ''}</div>
    ${sparkline(hours.map(x => x.pressure), { w: 100, h: 26, sel: si })}
  </div>`
}

function tempTile(hours: HourInput[], si: number) {
  const h = hours[si]
  const i = D.weather!.time.indexOf(h.t)
  const air = D.weather!.temp[i]
  const temps = hours.map(x => D.weather!.temp[D.weather!.time.indexOf(x.t)])
  const wn = waterNow()
  const src = !wn ? '' : wn.src === 'geschat' ? 'water geschat uit de lucht' : wn.src === 'zeemodel' ? 'water uit zeemodel' : `water: ${esc(wn.src)}${wn.dist != null ? ` · ${fmt(wn.dist)} km` : ''}`
  return `<div class="tile">
    <div class="th"><img src="${icon('thermometer')}" alt="">Temperatuur</div>
    <div class="duo">
      <div><div class="big">${fmt(air)}<small>°</small></div><div class="sub">lucht</div></div>
      <div><div class="big wtemp">${h.waterTemp != null ? fmt(h.waterTemp, 1) : '–'}<small>°</small></div><div class="sub">water</div></div>
    </div>
    ${sparkline(temps, { w: 100, h: 22, sel: si })}
    <div class="foot src">${fmt(Math.min(...temps))}° tot ${fmt(Math.max(...temps))}° · ${src}</div>
  </div>`
}

function tideTile(from: number, to: number, selT: number) {
  if (!D.tide || !D.tideStation) return `<div class="tile tide"><div class="th"><img src="${icon('water_wave')}" alt="">Getij</div><div class="sub">Geen getijstation gevonden</div></div>`
  const td = D.tide
  const vals: (number | null)[] = []
  for (let t = from; t <= to; t += 1200000) vals.push(tideAt(td, t))
  const ext = td.ext.filter(e => e.t >= from && e.t < to)
  const marks = ext.map(e => ({ i: Math.round((e.t - from) / 1200000), label: hhmm(e.t), top: e.hw }))
  const next = td.ext.filter(e => e.t > selT).slice(0, 2)
  const a = tideAt(td, selT - 1200000), b = tideAt(td, selT + 1200000)
  const state = a == null || b == null ? '' : Math.abs(b - a) < 3 ? 'kentering' : b > a ? 'opkomend' : 'afgaand'
  const cur = tideAt(td, selT)
  const opts = D.tideList.slice(0, 40).map(s => `<option value="${s.c}" ${s.c === D.tideStation!.c ? 'selected' : ''}>${esc(s.n)} · ${fmt(s.d, s.d < 10 ? 1 : 0)} km</option>`).join('')
  return `<div class="tile tide">
    <div class="th"><img src="${icon('water_wave')}" alt="">Getij <span class="state">${state}</span></div>
    <label class="station">
      <span>${esc(D.tideStation.n)}</span><small>${fmt(D.tideStation.d, D.tideStation.d < 10 ? 1 : 0)} km</small>
      <svg class="chev" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3"/></svg>
      <select data-act="tide" aria-label="Kies getijstation">${opts}</select>
    </label>
    ${sparkline(vals, { w: 100, h: 34, sel: Math.round((selT - from) / 1200000), area: true, marks })}
    <div class="foot">${next.map(e => `<span><b>${e.hw ? 'HW' : 'LW'}</b> ${hhmm(e.t)}</span>`).join('')}${cur != null ? `<span>${cur > 0 ? '+' : ''}${fmt(cur)} cm NAP</span>` : ''}</div>
  </div>`
}

function hourStrip(hours: HourInput[], scores: HourScore[], si: number, nowH: number) {
  const W = D.weather!
  const times = SunCalc.getTimes(new Date(hours[0].t + 12 * 3600000), S.loc!.lat, S.loc!.lon)
  const riseH = Math.floor(times.sunrise!.getTime() / 3600000) * 3600000
  const setH = Math.floor(times.sunset!.getTime() / 3600000) * 3600000
  const cols = hours.map((h, i) => {
    const k = W.time.indexOf(h.t)
    const s = scores[i]
    const sunPct = Math.round(h.sunFrac * 100)
    const b = bft(h.windKmh)
    const past = S.day === 0 && h.t < nowH
    const ev = h.t === riseH ? `<img class="ev" src="${icon('sunrise')}" alt="zonsopkomst" title="Zon op ${hhmm(times.sunrise!.getTime())}">` : h.t === setH ? `<img class="ev" src="${icon('sunset')}" alt="zonsondergang" title="Zon onder ${hhmm(times.sunset!.getTime())}">` : ''
    return `<button class="col ${i === si ? 'sel' : ''} ${past ? 'past' : ''} ${h.sunAlt < -6 ? 'night' : h.twilight > 0.45 ? 'dusk' : ''}" data-act="hour" data-v="${h.t}">
      <span class="hh">${ev}${h.t === nowH ? 'nu' : hourNL(h.t)}</span>
      <img class="wx" src="${icon(wxIcon(W.code[k], !!W.isDay[k], h.sunFrac))}" alt="">
      <span class="bar"><i style="height:${(s.fish / 5) * 100}%;--q:${s.fish / 5}"></i></span>
      <span class="num fishn">${fmt(s.fish, s.fish % 1 ? 1 : 0)}</span>
      <span class="num rain ${h.rainProb >= 50 ? 'hi' : ''}">${h.rainProb}<small>%</small></span>
      <span class="num sun ${sunPct >= 50 ? 'hi' : ''}">${sunPct}<small>%</small></span>
      <span class="num wind"><svg viewBox="0 0 10 10" style="transform:rotate(${h.windDir + 180}deg)"><path d="M5 1l3 7-3-1.6L2 8z"/></svg>${b}</span>
    </button>`
  }).join('')
  return `<section class="card hours">
    <div class="labels">
      <span class="hh"></span><span class="wx"></span>
      <span class="bar">Vis</span><span class="num"></span>
      <span class="num"><img src="${icon('droplet')}" alt="">Regen</span>
      <span class="num"><img src="${icon('sun')}" alt="">Zon</span>
      <span class="num"><img src="${icon('dashing_away')}" alt="">Bft</span>
    </div>
    <div class="strip">${cols}</div>
  </section>`
}

function welcome() {
  return `<div class="screen welcome">
    <img class="hello" src="${icon('fish')}" alt="">
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
    <button class="btn primary" data-act="gps"><img src="${icon('round_pushpin')}" alt=""> ${S.locating ? 'Locatie zoeken…' : 'Gebruik mijn locatie'}</button>
    <input class="search" type="search" placeholder="Zoek een plaats of water…" data-act="search" autocomplete="off" />
    <div class="results">${S.search.map((r, i) => `<button data-act="pick" data-v="${i}"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></button>`).join('')}</div>
  </div>`
}

function infoSheet() {
  return `<div class="sheetbg" data-act="close"></div>
  <div class="sheet info" role="dialog" aria-label="Uitleg">
    <div class="grab"></div>
    <h2>Hoe werkt de score?</h2>
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
    <p class="small">Zet Visvangst op je beginscherm: tik op Deel en kies "Zet op beginscherm".</p>
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
  else if (act === 'hour') { const t = Number(v); S.sel = S.sel === t ? null : t; const s = $app.querySelector<HTMLElement>('.strip'); const x = s?.scrollLeft; render(); const s2 = $app.querySelector<HTMLElement>('.strip'); if (s2 && x != null) s2.scrollLeft = x }
  else if (act === 'sheet-loc') { S.sheet = 'loc'; S.search = []; render(); $app.querySelector<HTMLInputElement>('.search')?.focus() }
  else if (act === 'sheet-info') { S.sheet = 'info'; render() }
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
$app.addEventListener('scroll', e => { const el = e.target as HTMLElement; if (el.classList?.contains('strip')) el.dataset.user = '1' }, true)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) { S.sheet = null; render() } })

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
;(window as any).__vv = { S, D, CHOICES, scoreHour }

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
