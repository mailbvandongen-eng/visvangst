// Toetst het watertemperatuurmodel aan metingen van HHNK (polderwater) en RWS (meren, kanalen).
// Fit op de ene helft van de meetpunten, toets op de andere helft. Vergelijkt met wat de app nu doet.
// Draaien: npx tsx tools/validatie/validate.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { simulate, depthFromWidth, type WTParams, type Met } from '../../src/watertemp'

interface Site { name: string; src: string; lat: number; lon: number; pts: [number, number][]; water: any; met: Met }
const sites: Site[] = JSON.parse(readFileSync(new URL('dataset.json', import.meta.url), 'utf8'))

// Bekende meren (diepte gemiddeld, oppervlak km²) — Rijkswaterstaat
const LAKES: Record<string, [number, number]> = { Markermeer: [3.6, 700], IJsselmeer: [4.5, 1100], 'Buiten-IJ': [5, 10] }
const AREA: Record<string, number> = { '0,5 - 3 meter': 0.005, '3 - 6 meter': 0.01, '6 - 12 meter': 0.05, '12 - 50 meter': 0.2, '50 - 125 meter': 1, '> 125 meter': 5 }

for (const s of sites) if (s.name === 'Andijk') s.water = { typewater: 'meer, plas', naam: 'IJsselmeer' }

function classify(s: Site) {
  const w = s.water ?? {}
  const lake = LAKES[w.naam]
  if (lake) return { depth: lake[0], area: lake[1], cls: 'meer (bekend)' }
  const d = depthFromWidth(w.typewater, w.breedte)
  if (d == null) return { depth: 1.5, area: 0.1, cls: 'plas (diepte onbekend)' }
  return { depth: d, area: AREA[w.breedte] ?? 0.05, cls: d <= 0.9 ? 'sloot (≤ 6 m breed)' : d <= 2.5 ? 'wetering/vaart (6–50 m)' : 'kanaal (> 50 m)' }
}

// Gemeten waarden naar uurgemiddelden op de tijdas van het weer
function hourly(s: Site) {
  const m = new Map<number, number[]>()
  for (const [t, v] of s.pts) { const h = Math.floor(t / 3600000) * 3600000; (m.get(h) ?? m.set(h, []).get(h)!).push(v) }
  return s.met.t.map(t => { const a = m.get(t); return a ? a.reduce((x, y) => x + y, 0) / a.length : null })
}

const now = Date.now()
const evalFrom = now - 30 * 86400000 // laatste 30 dagen toetsen (de eerste dagen dienen als aanloop)
const prepared = sites.map(s => ({ s, c: classify(s), obs: hourly(s) }))

function err(sim: (number | null)[], obs: (number | null)[], t: number[]) {
  let n = 0, abs = 0, bias = 0
  const dayMax = new Map<string, [number, number]>()
  for (let i = 0; i < t.length; i++) {
    if (t[i] < evalFrom || t[i] > now || obs[i] == null || sim[i] == null) continue
    const e = sim[i]! - obs[i]!
    n++; abs += Math.abs(e); bias += e
  }
  return { mae: abs / n, bias: bias / n, n }
}

// Wat de app nu doet
const rws = prepared.filter(p => p.s.src === 'RWS')
const km = (a: Site, b: Site) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos(a.lat * Math.PI / 180))
function baselineStation(p: typeof prepared[0]) {
  const near = rws.filter(r => r.s !== p.s).sort((a, b) => km(a.s, p.s) - km(b.s, p.s))[0]
  return { sim: near.obs, name: near.s.name, km: km(near.s, p.s) }
}
function baselineAir(p: typeof prepared[0]) {
  const ta = p.s.met.ta
  return ta.map((_, i) => { const a = ta.slice(Math.max(0, i - 168), i + 1); return a.reduce((x, y) => x + y, 0) / a.length + 0.5 })
}

// Fit: eenvoudige rasterzoektocht op de trainingshelft
// Het model is bedoeld voor polderwater (sloten, weteringen, vaarten, plassen); groot water gebruikt de RWS-meting
const polder = prepared.filter(p => p.s.src === 'HHNK' || p.c.cls.startsWith('wetering'))
const train = polder.filter((_, i) => i % 2 === 0), test = polder.filter((_, i) => i % 2 === 1)
function score(set: typeof prepared, p: WTParams) {
  let s = 0, n = 0
  for (const x of set) { const r = err(simulate(x.s.met, x.c.depth, x.c.area, p), x.obs, x.s.met.t); if (r.n) { s += r.mae; n++ } }
  return s / n
}
let best: WTParams = { swFactor: 0.7, kBed: 6, depthMul: 1, windMul: 1, gwMix: 0.5 }, bestS = score(train, best)
for (const swFactor of [0.3, 0.5, 0.7, 0.9])
  for (const kBed of [0, 4, 8, 14])
    for (const depthMul of [1])
      for (const windMul of [0.6, 0.8, 1, 1.25, 1.6]) for (const gwMix of [0, 0.3, 0.6, 0.9]) {
        const p = { swFactor, kBed, depthMul, windMul, gwMix }
        const sc = score(train, p)
        if (sc < bestS) { bestS = sc; best = p }
      }
// Fijner rond het beste punt
for (let round = 0; round < 3; round++)
  for (const k of (Object.keys(best) as (keyof WTParams)[]).filter(k => k !== 'depthMul'))
    for (const f of [0.85, 0.93, 1.07, 1.15]) {
      const p = { ...best, [k]: k === 'gwMix' ? Math.min(1, best[k] * f) : best[k] * f }
      const sc = score(train, p)
      if (sc < bestS) { bestS = sc; best = p }
    }
console.log('Beste parameters (training):', Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +v.toFixed(2)])), 'MAE', bestS.toFixed(2))

const rows: any[] = []
for (const x of prepared) {
  const set = train.includes(x) ? 'train' : test.includes(x) ? 'toets' : 'groot'
  const model = err(simulate(x.s.met, x.c.depth, x.c.area, best), x.obs, x.s.met.t)
  const b1 = baselineStation(x), e1 = err(b1.sim, x.obs, x.s.met.t)
  const e2 = err(baselineAir(x), x.obs, x.s.met.t)
  rows.push({ set, naam: x.s.name, bron: x.s.src, water: x.c.cls, diepte: x.c.depth, model: model.mae, bias: model.bias, rwsStation: e1.mae, rwsNaam: `${b1.name} (${b1.km.toFixed(0)} km)`, lucht7d: e2.mae })
}
const fmt = (v: number) => v.toFixed(2).padStart(5)
console.log('\nset   bron water                        model  (bias)  RWS-meetpunt  lucht-7d  naam')
for (const r of rows.sort((a, b) => a.water.localeCompare(b.water)))
  console.log(`${r.set.padEnd(5)} ${r.bron.padEnd(4)} ${r.water.padEnd(28)} ${fmt(r.model)} (${r.bias >= 0 ? '+' : ''}${r.bias.toFixed(2)})  ${fmt(r.rwsStation)}        ${fmt(r.lucht7d)}   ${r.naam}`)
const groups = [...new Set(rows.map(r => r.water))]
console.log('\nGemiddelde fout (°C) op de TOETSHELFT, per soort water:')
for (const g of groups) {
  const r = rows.filter(x => x.water === g && x.set === 'toets')
  if (!r.length) continue
  const avg = (k: string) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(2)
  console.log(`  ${g.padEnd(28)} n=${r.length}  model ${avg('model')}  RWS-meetpunt ${avg('rwsStation')}  lucht-7d ${avg('lucht7d')}`)
}
const all = rows.filter(x => x.set === 'toets'), avg = (k: string) => (all.reduce((s, x) => s + x[k], 0) / all.length).toFixed(2)
console.log(`  ${'ALLES'.padEnd(28)} n=${all.length}  model ${avg('model')}  RWS-meetpunt ${avg('rwsStation')}  lucht-7d ${avg('lucht7d')}`)
writeFileSync(new URL('uitslag.json', import.meta.url), JSON.stringify({ best, rows }, null, 1))

// Volgt het model de verandering? Verschil over 24 uur (opwarmen/afkoelen), gemeten vs berekend
function changeErr(sim: (number | null)[], obs: (number | null)[], t: number[]) {
  let n = 0, abs = 0, agree = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let i = 24; i < t.length; i++) {
    if (t[i] < evalFrom || obs[i] == null || obs[i - 24] == null || sim[i] == null || sim[i - 24] == null) continue
    const a = obs[i]! - obs[i - 24]!, b = sim[i]! - sim[i - 24]!
    n++; abs += Math.abs(a - b); if (Math.sign(a) === Math.sign(b) || Math.abs(a) < 0.3) agree++
    sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b
  }
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  return { mae: abs / n, agree: agree / n, r }
}
console.log('\nVerandering over 24 uur, TOETSHELFT (fout °C · zelfde richting · correlatie):')
for (const g of ['sloot', 'wetering', 'plas']) {
  const set = test.filter(x => x.c.cls.startsWith(g))
  if (!set.length) continue
  const agg = (f: (x: typeof prepared[0]) => { mae: number; agree: number; r: number }) => {
    const r = set.map(f)
    return `${(r.reduce((s, x) => s + x.mae, 0) / r.length).toFixed(2)} · ${(100 * r.reduce((s, x) => s + x.agree, 0) / r.length).toFixed(0)}% · r=${(r.reduce((s, x) => s + x.r, 0) / r.length).toFixed(2)}`
  }
  console.log(`  ${g.padEnd(9)} model ${agg(x => changeErr(simulate(x.s.met, x.c.depth, x.c.area, best), x.obs, x.s.met.t))}   RWS-meetpunt ${agg(x => changeErr(baselineStation(x).sim, x.obs, x.s.met.t))}   lucht-7d ${agg(x => changeErr(baselineAir(x), x.obs, x.s.met.t))}`)
}
