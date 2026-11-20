// Haalt 45 dagen watertemperatuur (uurwaarden) op van de meetpunten van HHNK (Lizard, openbaar)
import { writeFileSync } from 'node:fs'
const B = 'https://hhnk.lizard.net/api/v4'
const get = async u => (await fetch(u, { signal: AbortSignal.timeout(60000) })).json()
const from = new Date(Date.now() - 45 * 86400000).toISOString()
const list = await get(`${B}/timeseries/?observation_type=473&end__gte=2026-11-15T00:00:00Z&page_size=100`)
const out = []
for (const ts of list.results) {
  const loc = await get(ts.location.url)
  const geom = loc.geometry?.coordinates
  const ev = await get(`${B}/timeseries/${ts.uuid}/events/?time__gte=${from}&page_size=5000`)
  const pts = (ev.results ?? []).filter(e => e.value != null).map(e => [Date.parse(e.time), e.value])
  out.push({ name: loc.name, code: loc.code, lon: geom?.[0], lat: geom?.[1], n: pts.length, pts })
  console.log(loc.name, geom, pts.length)
}
writeFileSync('hhnk.json', JSON.stringify(out))
