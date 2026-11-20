// Interactieve lijngrafiek: SVG voor lijnen en vlakken, HTML erboven voor labels (die vervormen dan niet).
// Schuiven met de vinger werkt via scrubTo(); de gegevens per grafiek staan in een register.

export interface Series { vals: (number | null)[]; cls: string; area?: boolean }
export interface ChartCfg {
  id: string
  series: Series[]
  yMin?: number
  yMax?: number
  yTicks?: { v: number; label: string }[]
  xTicks?: { i: number; label: string }[]
  bands?: { a: number; b: number; cls: string }[]
  marks?: { i: number; s?: number; label: string; top: boolean }[]
  events?: { i: number; html: string }[]
  nowI?: number
  selI?: number
  bubble?: (i: number) => string
  scrub?: 'hour' | 'local'
  pad?: number
}

const W = 1000, H = 100
const registry = new Map<string, ChartCfg & { lo: number; hi: number; n: number }>()

function monotonePath(pts: [number, number][]) {
  // Vloeiende lijn zonder doorschieten (Fritsch–Carlson)
  const n = pts.length
  if (n < 2) return ''
  if (n === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`
  const dx: number[] = [], m: number[] = [], t: number[] = []
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i] }
  t[0] = m[0]; t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(2)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(2)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(2)}`
  }
  return d
}

export function chart(cfg: ChartCfg): string {
  const n = Math.max(...cfg.series.map(s => s.vals.length))
  const all = cfg.series.flatMap(s => s.vals).filter((v): v is number => v != null)
  if (all.length < 2) return '<div class="ichart empty"></div>'
  let lo = cfg.yMin ?? Math.min(...all), hi = cfg.yMax ?? Math.max(...all)
  if (cfg.yMin == null && cfg.yMax == null) { const p = (hi - lo) * 0.08 || 1; lo -= p; hi += p }
  registry.set(cfg.id, { ...cfg, lo, hi, n })
  const pad = cfg.pad ?? 6
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (H - pad * 2)
  const xp = (i: number) => (x(i) / W) * 100
  const yp = (v: number) => (y(v) / H) * 100

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
  for (const b of cfg.bands ?? []) svg += `<rect x="${x(b.a)}" y="0" width="${Math.max(0, x(b.b) - x(b.a))}" height="${H}" class="${b.cls}"/>`
  for (const tk of cfg.yTicks ?? []) svg += `<line x1="0" x2="${W}" y1="${y(tk.v)}" y2="${y(tk.v)}" class="grid" vector-effect="non-scaling-stroke"/>`
  for (const s of cfg.series) {
    // Lijn per aaneengesloten stuk (gaten in de gegevens blijven gaten)
    let run: [number, number][] = []
    const runs: [number, number][][] = []
    s.vals.forEach((v, i) => { if (v == null) { if (run.length) runs.push(run); run = [] } else run.push([x(i), y(v)]) })
    if (run.length) runs.push(run)
    for (const r of runs) {
      const d = monotonePath(r)
      if (s.area) svg += `<path d="${d}L${r[r.length - 1][0]},${H}L${r[0][0]},${H}Z" class="area ${s.cls}"/>`
      svg += `<path d="${d}" class="line ${s.cls}" vector-effect="non-scaling-stroke"/>`
    }
  }
  if (cfg.nowI != null) svg += `<line x1="${x(cfg.nowI)}" x2="${x(cfg.nowI)}" y1="0" y2="${H}" class="now" vector-effect="non-scaling-stroke"/>`
  svg += '</svg>'

  let html = ''
  for (const tk of cfg.yTicks ?? []) html += `<i class="ytick" style="top:${yp(tk.v)}%">${tk.label}</i>`
  for (const m of cfg.marks ?? []) {
    const v = cfg.series[m.s ?? 0].vals[m.i]
    if (v == null) continue
    const p = xp(m.i)
    html += `<i class="cmark ${m.top ? 'top' : 'bot'} ${p > 90 ? 'r' : p < 10 ? 'l' : ''}" style="left:${p}%;top:${yp(v)}%"><em>${m.label}</em></i>`
  }
  for (const e of cfg.events ?? []) html += `<i class="cevent" style="left:${xp(e.i)}%">${e.html}</i>`
  // Kruisdraad, stippen en label voor het gekozen punt
  html += `<i class="cross"></i>${cfg.series.map((s, k) => `<i class="cdot ${s.cls}" data-k="${k}"></i>`).join('')}<div class="bubble"></div>`
  const xt = (cfg.xTicks ?? []).map(t => `<span style="left:${xp(t.i)}%">${t.label}</span>`).join('')
  return `<div class="ichart" data-chart="${cfg.id}" data-scrub="${cfg.scrub ?? 'local'}" ${cfg.selI != null ? `data-sel="${cfg.selI}"` : ''}>
    <div class="plot">${svg}${html}</div>${xt ? `<div class="xticks">${xt}</div>` : ''}
  </div>`
}

/** Zet kruisdraad, stippen en label op punt i */
export function scrubTo(el: HTMLElement, i: number) {
  const cfg = registry.get(el.dataset.chart!)
  if (!cfg) return
  i = Math.max(0, Math.min(cfg.n - 1, i))
  const pad = cfg.pad ?? 6
  const p = (i / (cfg.n - 1)) * 100
  const yp = (v: number) => (pad + (1 - (v - cfg.lo) / (cfg.hi - cfg.lo || 1)) * (H - pad * 2)) / H * 100
  el.classList.add('scrubbing')
  el.querySelector<HTMLElement>('.cross')!.style.left = p + '%'
  el.querySelectorAll<HTMLElement>('.cdot').forEach(d => {
    const v = cfg.series[Number(d.dataset.k)].vals[i]
    d.style.display = v == null ? 'none' : ''
    if (v != null) { d.style.left = p + '%'; d.style.top = yp(v) + '%' }
  })
  const b = el.querySelector<HTMLElement>('.bubble')!
  b.innerHTML = cfg.bubble ? cfg.bubble(i) : ''
  b.style.left = Math.max(14, Math.min(86, p)) + '%'
}

export function indexAt(el: HTMLElement, clientX: number) {
  const cfg = registry.get(el.dataset.chart!)
  if (!cfg) return 0
  const r = el.querySelector('.plot')!.getBoundingClientRect()
  return Math.round(((clientX - r.left) / r.width) * (cfg.n - 1))
}

/** Na het tekenen: het gekozen punt meteen tonen */
export function initCharts(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.ichart[data-sel]').forEach(el => scrubTo(el, Number(el.dataset.sel)))
}
