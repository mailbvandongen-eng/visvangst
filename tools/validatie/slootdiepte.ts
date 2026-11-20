import { readFileSync } from 'node:fs'
import { simulate } from '../../src/watertemp'
const best = JSON.parse(readFileSync('./tools/validatie/uitslag.json', 'utf8')).best
const sites = JSON.parse(readFileSync('./tools/validatie/dataset.json', 'utf8')).filter((s: any) => s.src === 'HHNK' && s.water?.breedte === '0,5 - 3 meter')
const evalFrom = Date.now() - 30 * 86400000
for (const depth of [0.4, 0.6, 0.8, 1.0, 1.3, 1.7]) {
  let mae = 0, ch = 0, r = 0, k = 0
  for (const s of sites) {
    const m = new Map<number, number[]>(); for (const [t, v] of s.pts) { const h = Math.floor(t / 3600000) * 3600000; (m.get(h) ?? m.set(h, []).get(h)!).push(v) }
    const obs = s.met.t.map((t: number) => { const a = m.get(t); return a ? a.reduce((x: number, y: number) => x + y, 0) / a.length : null })
    const sim = simulate(s.met, depth, 0.005, { ...best, depthMul: 1 })
    let n = 0, a = 0, c = 0, xs: number[] = [], ys: number[] = []
    for (let i = 24; i < obs.length; i++) { if (s.met.t[i] < evalFrom || obs[i] == null || obs[i - 24] == null) continue; n++; a += Math.abs(sim[i] - obs[i]); const d1 = obs[i] - obs[i - 24], d2 = sim[i] - sim[i - 24]; c += Math.abs(d1 - d2); xs.push(d1); ys.push(d2) }
    const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length
    const rr = xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((p, x) => p + (x - mx) ** 2, 0) * ys.reduce((p, y) => p + (y - my) ** 2, 0))
    mae += a / n; ch += c / n; r += rr; k++
  }
  console.log(`diepte ${depth} m: fout ${(mae / k).toFixed(2)} °C · verandering-fout ${(ch / k).toFixed(2)} · r ${(r / k).toFixed(2)}  (${k} sloten)`)
}
