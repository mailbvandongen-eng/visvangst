import { findWaters } from '../src/waters'
const P: [string, number, number, number][] = [
  ['Voorburg (Vliet bij Leidschendam)', 52.0805, 4.3913, 250], ['Vlietlanden', 52.105, 4.441, 250], ['Polder Jisp', 52.5078, 4.848, 250],
  ['Scheveningen haven', 52.1035, 4.2665, 300], ['Utrecht Vecht', 52.11, 5.08, 250], ['Lemmer', 52.84, 5.71, 400], ['Nijmegen Waal', 51.851, 5.865, 300], ['Zoetermeerse Plas', 52.065, 4.474, 300],
]
for (const [n, lat, lon, r] of P) {
  const w = await findWaters(lat, lon, r)
  console.log(n.padEnd(36), w.map(b => `${b.name} [${b.kind}/${b.group}${b.width ? ' ' + b.width : ''}${b.depth != null ? ' ~' + b.depth + 'm' : ''}] ${Math.round(b.dist)} m`).join('  |  ') || 'niets')
}
