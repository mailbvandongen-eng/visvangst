// Wateren in de buurt herkennen met TOP10NL (Kadaster, via PDOK). Geen keuze nodig: de plek bepaalt het.
// Per groep (ondiep, middel, diep) het dichtstbijzijnde water, zodat een kanaal naast een sloot twee kansen geeft.
import type { WaterKind } from './score'
import { depthFromWidth } from './watertemp'

export type Group = 'ondiep' | 'middel' | 'diep'
export interface WaterBody {
  id: string
  kind: WaterKind
  group: Group
  name: string          // eigen naam of soort ("Sloot")
  ownName: boolean
  tidal: boolean        // getijdeinvloed volgens TOP10NL
  width: string | null  // breedteklasse zoals TOP10NL hem geeft
  depth: number | null  // effectieve diepte (m); null = onbekend
  areaKm2: number
  dist: number          // meter
}

const API = 'https://api.pdok.nl/brt/top10nl/ogc/v1/collections'
// Grote meren met bekende gemiddelde diepte (m) — Rijkswaterstaat
const BIG_LAKES: Record<string, number> = { IJsselmeer: 4.5, Markermeer: 3.6, IJmeer: 3.5, Gooimeer: 3, Eemmeer: 2, Veluwemeer: 1.5, Wolderwijd: 1.8, Drontermeer: 1.5, Ketelmeer: 3, Zwarte_Meer: 1.5, Volkerak: 5, Zoommeer: 4, Grevelingenmeer: 6, Veerse_Meer: 5, Haringvliet: 6, Hollandsch_Diep: 6, Lauwersmeer: 1.8 }
const RIVER = /\b(rijn|waal|lek|maas|ijssel|merwede|noord|kil|amer|oude maas|nieuwe maas|spui|dordtsche kil|zwarte water|vecht|schelde)\b/i
const AREA_BY_WIDTH: Record<string, number> = { '0,5 - 3 meter': 0.005, '3 - 6 meter': 0.01, '6 - 12 meter': 0.05, '12 - 50 meter': 0.2, '50 - 125 meter': 1, '> 125 meter': 5 }

const M = 111320
function toXY(lat0: number) { const kx = Math.cos(lat0 * Math.PI / 180) * M; return (c: number[], lon0: number) => [(c[0] - lon0) * kx, (c[1] - lat0) * M] }

function distance(lat: number, lon: number, g: any): number {
  const xy = toXY(lat)
  const seg = (a: number[], b: number[]) => {
    const [ax, ay] = xy(a, lon), [bx, by] = xy(b, lon)
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0
    return Math.hypot(ax + t * dx, ay + t * dy)
  }
  const inside = (ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c } return c }
  const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  if (polys.some(p => inside(p[0]))) return 0
  const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : polys.flat()
  let best = Infinity
  for (const l of lines) for (let i = 1; i < l.length; i++) best = Math.min(best, seg(l[i - 1], l[i]))
  return best
}

function areaKm2(lat: number, g: any): number {
  const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  const xy = toXY(lat)
  let a = 0
  for (const p of polys) {
    const r = p[0].map(c => xy(c, p[0][0][0]))
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]) / 2
  }
  return Math.abs(a) / 1e6
}

function classify(p: any, g: any, lat: number): Omit<WaterBody, 'dist' | 'id' | 'tidal'> | null {
  const naam: string | null = p.naamnl ?? p.naamofficieel ?? null
  const tw: string = p.typewater ?? ''
  if (tw.startsWith('greppel')) return null
  if (p.functie === 'haven') return { kind: 'haven', group: 'diep', name: naam ?? 'Haven', ownName: !!naam, width: p.breedteklasse, depth: 4, areaKm2: 0.2 }
  if (tw === 'zee' || tw.startsWith('droogvallend')) return { kind: 'zee', group: 'diep', name: naam ?? 'Zee', ownName: !!naam, width: null, depth: null, areaKm2: 1000 }
  if (tw === 'meer, plas') {
    const big = naam ? BIG_LAKES[naam.replace(/ /g, '_')] : undefined
    const area = g ? areaKm2(lat, g) : 0.1
    if (big != null || area > 5) return { kind: 'meer', group: 'diep', name: naam ?? 'Meer', ownName: !!naam, width: null, depth: big ?? null, areaKm2: Math.max(area, 5) }
    return { kind: 'plas', group: 'middel', name: naam ?? 'Plas', ownName: !!naam, width: null, depth: null, areaKm2: Math.max(0.001, area) }
  }
  const b: string | null = p.breedteklasse
  const depth = depthFromWidth(tw, b)
  const area = AREA_BY_WIDTH[b ?? ''] ?? 0.05
  if (b === '0,5 - 3 meter') return { kind: 'sloot', group: 'ondiep', name: naam ?? 'Sloot', ownName: !!naam, width: b, depth, areaKm2: area }
  if (b === '3 - 6 meter' || b === '6 - 12 meter') return { kind: 'watergang', group: 'middel', name: naam ?? (b === '3 - 6 meter' ? 'Brede sloot' : 'Watergang'), ownName: !!naam, width: b, depth, areaKm2: area }
  if ((b === '50 - 125 meter' || b === '> 125 meter') && (p.getijdeinvloed === 'ja' || (naam && RIVER.test(naam) && !/kanaal/i.test(naam))))
    return { kind: 'rivier', group: 'diep', name: naam ?? 'Rivier', ownName: !!naam, width: b, depth, areaKm2: area }
  if (b) return { kind: 'kanaal', group: 'diep', name: naam ?? (b === '12 - 50 meter' ? 'Vaart' : 'Kanaal'), ownName: !!naam, width: b, depth, areaKm2: area }
  return null
}

const cache = new Map<string, WaterBody[]>()

/** Wateren rond een punt; per groep het dichtstbijzijnde, gesorteerd op afstand */
export async function findWaters(lat: number, lon: number, radius = 250): Promise<WaterBody[]> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return cache.get(key)!
  const dLat = radius / M, dLon = radius / (M * Math.cos(lat * Math.PI / 180))
  const bbox = `${(lon - dLon).toFixed(6)},${(lat - dLat).toFixed(6)},${(lon + dLon).toFixed(6)},${(lat + dLat).toFixed(6)}`
  const feats: { p: any; g: any }[] = []
  await Promise.all(['waterdeel_vlak', 'waterdeel_lijn'].map(async c => {
    let url: string | null = `${API}/${c}/items?f=json&bbox=${bbox}&limit=500`
    for (let page = 0; url && page < 4; page++) {
      const r = await fetch(url)
      if (!r.ok) throw new Error('TOP10NL ' + r.status)
      const d = await r.json()
      for (const f of d.features ?? []) feats.push({ p: f.properties, g: f.geometry })
      url = (d.links ?? []).find((l: any) => l.rel === 'next')?.href ?? null
    }
  }))
  const bodies: WaterBody[] = []
  for (const { p, g } of feats) {
    const c = classify(p, g, lat)
    if (!c) continue
    const dist = distance(lat, lon, g)
    if (dist > radius) continue
    bodies.push({ ...c, dist, tidal: p.getijdeinvloed === 'ja' || c.kind === 'zee', id: `${c.kind}:${c.name}:${p.lokaal_id ?? ''}` })
  }
  // Per groep het dichtstbijzijnde. Een groot water binnen een paar meter gaat voor (meetpunt op de dijk ≠ slootje)
  const order: Group[] = ['diep', 'middel', 'ondiep']
  const pick: WaterBody[] = []
  for (const gr of order) {
    const best = bodies.filter(b => b.group === gr).sort((a, b) => a.dist - b.dist)[0]
    if (best) pick.push(best)
  }
  const out = pick.sort((a, b) => a.dist - b.dist)
  cache.set(key, out)
  return out
}

export function widthLabel(w: string | null) {
  if (!w) return ''
  return w.replace(' meter', ' m').replace('0,5 - 3', '< 3').replace(' - ', '–').replace('> 125', '> 125')
}
