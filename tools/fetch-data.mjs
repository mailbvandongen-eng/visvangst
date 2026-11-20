// Haalt getij, watertemperatuur en maanfoto's op en zet ze als statische bestanden in public/data.
// Rijkswaterstaat stuurt geen CORS-header mee, dus de browser kan de API niet zelf aanroepen.
// Dit script draait in GitHub Actions (elke paar uur) en lokaal met `npm run data`.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import sharp from 'sharp'

const RWS = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl'
const OUT = new URL('../public/data/', import.meta.url).pathname
const DAY = 86400000

async function post(path, body, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(RWS + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (r.status === 204) return { WaarnemingenLijst: [] }
      if (!r.ok) throw new Error(`${path} ${r.status}`)
      return await r.json()
    } catch (e) {
      if (i >= tries - 1) throw e
      await new Promise(res => setTimeout(res, 2000 * (i + 1)))
    }
  }
}

async function pool(items, n, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++
      try { out[k] = await fn(items[k]) } catch (e) { console.warn('mislukt:', items[k].code ?? items[k], e.message) }
    }
  }))
  return out
}

// Middernacht in Nederland, als UTC-tijd
function amsterdamMidnight(date) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(date)
  const guess = new Date(ymd + 'T00:00:00Z')
  const offH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' }).format(guess))
  return new Date(guess.getTime() - offH * 3600000)
}
const ymdNL = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(d)

// ---------- catalogus ----------
console.log('catalogus ophalen…')
const cat = await post('/METADATASERVICES/OphalenCatalogus', { CatalogusFilter: { Grootheden: true, Compartimenten: true, ProcesTypes: true } })
const locById = new Map(cat.LocatieLijst.map(l => [l.Locatie_MessageID, l]))
const metaId = (grootheid, proces) => cat.AquoMetadataLijst.find(m => m.Grootheid.Code === grootheid && m.Compartiment.Code === 'OW' && m.ProcesType === proces)?.AquoMetadata_MessageID
const locsFor = id => cat.AquoMetadataLocatieLijst.filter(a => a.AquoMetaData_MessageID === id).map(a => locById.get(a.Locatie_MessageID)).filter(Boolean)

// Alleen stations in en rond Nederland (geen Bonaire, geen verre platforms)
const nearNL = l => l.Lat > 50.6 && l.Lat < 53.9 && l.Lon > 2.9 && l.Lon < 7.4

// ---------- getij ----------
const tideLocs = locsFor(metaId('WATHTE', 'astronomisch')).filter(nearNL)
const start = new Date(amsterdamMidnight(new Date()).getTime() - DAY)
const end = new Date(start.getTime() + 5 * DAY)
console.log(`getij voor ${tideLocs.length} stations, ${start.toISOString()} – ${end.toISOString()}`)

rmSync(OUT + 'tide', { recursive: true, force: true })
mkdirSync(OUT + 'tide', { recursive: true })

function extremes(t0, v) {
  // Hoog- en laagwater: lokaal max/min binnen ±2 uur, daarna ontdubbelen
  const W = 12, out = []
  for (let i = W; i < v.length - W; i++) {
    if (v[i] == null) continue
    let isMax = true, isMin = true
    for (let j = i - W; j <= i + W; j++) {
      if (v[j] == null || j === i) continue
      if (v[j] > v[i] || (v[j] === v[i] && j < i)) isMax = false
      if (v[j] < v[i] || (v[j] === v[i] && j < i)) isMin = false
    }
    if (isMax) out.push({ t: t0 + i * 600000, h: v[i], hw: true })
    if (isMin) out.push({ t: t0 + i * 600000, h: v[i], hw: false })
  }
  return out
}

const tideIndex = (await pool(tideLocs, 6, async l => {
  const d = await post('/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', {
    Locatie: { Code: l.Code },
    AquoPlusWaarnemingMetadata: { AquoMetadata: { Compartiment: { Code: 'OW' }, Grootheid: { Code: 'WATHTE' }, ProcesType: 'astronomisch' } },
    Periode: { Begindatumtijd: start.toISOString(), Einddatumtijd: end.toISOString() },
  })
  const m = (d.WaarnemingenLijst ?? [])[0]?.MetingenLijst ?? []
  if (m.length < 300) return null
  const t0 = start.getTime()
  const v = new Array(Math.round((end - start) / 600000) + 1).fill(null)
  for (const x of m) {
    const k = Math.round((new Date(x.Tijdstip).getTime() - t0) / 600000)
    const val = x.Meetwaarde?.Waarde_Numeriek
    if (k >= 0 && k < v.length && val != null && Math.abs(val) < 2000) v[k] = Math.round(val)
  }
  while (v.length && v[v.length - 1] == null) v.pop()
  const ext = extremes(t0, v)
  const range = Math.max(...v.filter(x => x != null)) - Math.min(...v.filter(x => x != null))
  // Stations zonder echt tij (stuwpanden, rivieren ver landinwaarts) weglaten
  if (range < 15 || ext.length < 4) return null
  writeFileSync(`${OUT}tide/${l.Code}.json`, JSON.stringify({ t0, step: 10, v, ext }))
  return { c: l.Code, n: l.Naam, lat: +l.Lat.toFixed(4), lon: +l.Lon.toFixed(4), r: range }
})).filter(Boolean)
console.log(`getij: ${tideIndex.length} stations opgeslagen`)

// ---------- watertemperatuur ----------
const tLocs = locsFor(metaId('T', 'meting')).filter(nearNL)
console.log(`watertemperatuur: ${tLocs.length} meetpunten bevragen…`)
const fresh = new Map()
for (let i = 0; i < tLocs.length; i += 100) {
  const batch = tLocs.slice(i, i + 100)
  try {
    const d = await post('/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen', {
      LocatieLijst: batch.map(l => ({ Code: l.Code })),
      AquoPlusWaarnemingMetadataLijst: [{ AquoMetadata: { Compartiment: { Code: 'OW' }, Grootheid: { Code: 'T' } } }],
    })
    for (const w of d.WaarnemingenLijst ?? []) {
      const m = w.MetingenLijst.at(-1)
      const t = new Date(m.Tijdstip).getTime()
      const val = m.Meetwaarde?.Waarde_Numeriek
      if (Date.now() - t > 12 * 3600000 || val == null || val < -2 || val > 32) continue
      const e = fresh.get(w.Locatie.Code) ?? { l: w.Locatie, vals: [], t }
      e.vals.push(val); e.t = Math.max(e.t, t)
      fresh.set(w.Locatie.Code, e)
    }
  } catch (e) { console.warn('temperatuur-batch mislukt', e.message) }
}
const temps = [...fresh.values()].map(e => {
  const s = e.vals.sort((a, b) => a - b)
  return { c: e.l.Code, n: e.l.Naam, lat: +e.l.Lat.toFixed(4), lon: +e.l.Lon.toFixed(4), t: s[Math.floor(s.length / 2)], at: e.t }
})

// Zout of zoet: ligt het meetpunt in het zeemodel van Open-Meteo en scheelt de temperatuur weinig, dan is het zout.
const FRESH_WORDS = /ijsselmeer|markermeer|binnen|boven|beneden|kanaal|lek|maas|rijn|waal|ijssel|merwede|spui|vossemeer|volkerak|amsterdam|maarssen|diemen|hengelo|delden|eefde|sambeek|grave|lith|driel|amerongen|hagestein|echt|linne|roermond|belfeld|eijsden|borgharen|lobith|zwartsluis|leeuwarden|stavoren|makkum|gemaal|spaarndam|velsenzuid|kinderdijk|brienenoord|lekhaven|haringvliet\.\d|kier|stellendam\.binnen|bommenede|middelharnis|plaatvanoudetonge|sintphilipsland|slaak|nieuwegein|andijk|friesekust|rotterdamsehoek|trintelzand|wieringen\.ijsselmeer|laagbekken|krammerput/i
for (let i = 0; i < temps.length; i += 50) {
  const b = temps.slice(i, i + 50)
  try {
    const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${b.map(x => x.lat).join(',')}&longitude=${b.map(x => x.lon).join(',')}&current=sea_surface_temperature`)
    const d = await r.json()
    const arr = Array.isArray(d) ? d : [d]
    arr.forEach((x, k) => {
      const sst = x.current?.sea_surface_temperature
      b[k].z = sst != null && Math.abs(sst - b[k].t) < 2 && !FRESH_WORDS.test(b[k].c) ? 1 : 0
    })
  } catch (e) { console.warn('zeemodel mislukt', e.message) }
}
console.log(`watertemperatuur: ${temps.length} actuele meetpunten (${temps.filter(x => x.z).length} zout)`)

// ---------- maan (NASA Dial-A-Moon): een foto per dag voor de komende 30 dagen ----------
mkdirSync(OUT + 'moon', { recursive: true })
const moon = {}
for (let k = 0; k < 30; k++) {
  const day = new Date(amsterdamMidnight(new Date()).getTime() + k * DAY + 22 * 3600000)
  const key = ymdNL(day)
  const iso = day.toISOString().slice(0, 16)
  try {
    const meta = await (await fetch(`https://svs.gsfc.nasa.gov/api/dialamoon/${iso}`, { signal: AbortSignal.timeout(30000) })).json()
    const url = meta.image.url.replace('http://', 'https://')
    const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer())
    await sharp(buf).resize(240, 240).webp({ quality: 84 }).toFile(`${OUT}moon/${key}.webp`)
    moon[key] = { f: `moon/${key}.webp`, phase: meta.phase, age: meta.age, dist: meta.distance }
  } catch (e) { console.warn('maanfoto mislukt', key, e.message) }
}
console.log('maan:', Object.keys(moon).join(', '))

writeFileSync(OUT + 'index.json', JSON.stringify({ generated: Date.now(), tide: tideIndex, temp: temps, moon }))
console.log('klaar')
