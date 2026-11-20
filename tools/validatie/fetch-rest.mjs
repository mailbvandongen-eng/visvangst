// Bouwt de toetsset: per meetpunt het type water (TOP10NL), gemeten watertemperatuur en het weer
import { readFileSync, writeFileSync } from 'node:fs'
const hhnk = JSON.parse(readFileSync('hhnk.json', 'utf8')).filter(s => s.lat && s.n > 2000)
const seen = new Set()
const sites = hhnk.filter(s => { const k = s.lat.toFixed(4) + s.lon.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true })
  .map(s => ({ name: s.name, src: 'HHNK', lat: s.lat, lon: s.lon, pts: s.pts }))

// RWS: middel en diep water ter vergelijking
const RWS = [['markermeer.midden'], ['markermeer.trintelzand'], ['andijk'], ['friesekust.ijsselmeer'], ['maarssen.kanaal'], ['leeuwarden.vanharinxmakanaal'], ['spaarndam.zijkanaalc'], ['amsterdam.schellingwouderbrug'], ['diemen']]
const idx = JSON.parse(readFileSync('../../public/data/index.json', 'utf8'))
const from = new Date(Date.now() - 45 * 86400000)
for (const [code] of RWS) {
  const st = idx.temp.find(t => t.c === code)
  const r = await fetch('https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Locatie: { Code: code }, AquoPlusWaarnemingMetadata: { AquoMetadata: { Compartiment: { Code: 'OW' }, Grootheid: { Code: 'T' } } }, Periode: { Begindatumtijd: from.toISOString(), Einddatumtijd: new Date().toISOString() } }),
  })
  const d = r.status === 204 ? {} : await r.json()
  const w = (d.WaarnemingenLijst ?? [])[0]
  const pts = (w?.MetingenLijst ?? []).map(m => [Date.parse(m.Tijdstip), m.Meetwaarde?.Waarde_Numeriek]).filter(p => p[1] != null && p[1] > -2 && p[1] < 35)
  sites.push({ name: st?.n ?? code, src: 'RWS', lat: st?.lat ?? w?.Locatie?.Lat, lon: st?.lon ?? w?.Locatie?.Lon, pts })
  console.log('RWS', code, pts.length)
}

// TOP10NL: dichtstbijzijnde water bij het meetpunt
const m2deg = 1 / 111320
function dist(lat, lon, geom) {
  const kx = Math.cos(lat * Math.PI / 180) / m2deg, ky = 1 / m2deg
  const segD = (a, b) => {
    const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky, bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0
    return Math.hypot(ax + t * dx, ay + t * dy)
  }
  const inside = ring => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c } return c }
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : []
  if ((geom.type === 'Polygon' && inside(geom.coordinates[0])) || (geom.type === 'MultiPolygon' && geom.coordinates.some(p => inside(p[0])))) return 0
  let best = Infinity
  for (const l of lines) for (let i = 1; i < l.length; i++) best = Math.min(best, segD(l[i - 1], l[i]))
  return best
}
for (const s of sites) {
  const d = 0.0008
  const feats = []
  for (const c of ['waterdeel_vlak', 'waterdeel_lijn']) {
    const r = await (await fetch(`https://api.pdok.nl/brt/top10nl/ogc/v1/collections/${c}/items?f=json&bbox=${s.lon - d * 1.6},${s.lat - d},${s.lon + d * 1.6},${s.lat + d}&limit=200`)).json()
    for (const f of r.features ?? []) feats.push({ ...f.properties, geom: f.geometry, d: dist(s.lat, s.lon, f.geometry) })
  }
  feats.sort((a, b) => a.d - b.d)
  const f = feats[0]
  s.water = f ? { typewater: f.typewater, breedte: f.breedteklasse, naam: f.naamnl ?? f.naamofficieel, functie: f.functie, d: Math.round(f.d) } : null
  console.log(s.name, s.water)
}

// Weer: lucht, wind, zon, bewolking per uur
for (const s of sites) {
  const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&hourly=temperature_2m,wind_speed_10m,shortwave_radiation,cloud_cover,relative_humidity_2m&past_days=61&forecast_days=1&timeformat=unixtime`)).json()
  const h = r.hourly
  s.met = { t: h.time.map(x => x * 1000), ta: h.temperature_2m, u: h.wind_speed_10m, sw: h.shortwave_radiation, cc: h.cloud_cover, rh: h.relative_humidity_2m }
}
writeFileSync('dataset.json', JSON.stringify(sites))
console.log('klaar', sites.length)
