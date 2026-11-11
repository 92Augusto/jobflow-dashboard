import { metrosLetras, anguloLetras, superficieM2Letras, superficieHaFormato } from './agrimensura'

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export type Lado = {
  desig: string
  lado: string
  ang_g: string
  ang_m: string
  ang_s: string
}

export type FilaCalculo = {
  desig: string
  lado: number
  ai_g: number
  ai_m: number
  ai_s: number
  ac_g: number
  ac_m: number
  ac_s: number
  dx: number
  dy: number
  dx_c: number
  dy_c: number
  x: number
  y: number
  ai_v: number
  ych: number
  acv: number
  sup: number
}

export type Resultado = {
  filas: FilaCalculo[]
  perimetro: number
  error_x: number
  error_y: number
  error_total: number
  superficie_m2: number
  superficie_ha: number
  sum_dx: number
  sum_dy: number
  sum_dxc: number
  sum_dyc: number
}

export type Rumbo = {
  desig: string
  q1: string
  g: string
  m: string
  q2: string
}

// ─── GENERADOR DE LADOS INICIALES (HASTA 20 LADOS O MÁS) ──────────────────────
export function generarLadosIniciales(n: number, formato: 'numeros' | 'letras' = 'numeros'): Lado[] {
  const count = Math.max(3, Math.min(n, 20))
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return Array.from({ length: count }, (_, i) => {
    let desig = ''
    if (formato === 'numeros') {
      const v1 = i + 1
      const v2 = ((i + 1) % count) + 1
      desig = `${v1}-${v2}`
    } else {
      const v1 = letras[i % letras.length]
      const v2 = letras[(i + 1) % count]
      desig = `${v1}-${v2}`
    }

    return {
      desig,
      lado: '',
      ang_g: '',
      ang_m: '',
      ang_s: '0',
    }
  })
}

// ─── CÁLCULO DE POLÍGONO Y PLANILLA (MÉTODO GAUSS) ───────────────────────────
export function calcularPlanilla(lados: Lado[]): Resultado | null {
  const n = lados.length
  if (n < 3) return null

  const angDec = lados.map(l => {
    const g = parseFloat(l.ang_g) || 0
    const m = parseFloat(l.ang_m) || 0
    const s = parseFloat(l.ang_s) || 0
    return g + m / 60 + s / 3600
  })
  const ladoNum = lados.map(l => parseFloat(l.lado.replace(',', '.')) || 0)
  const perimetro = ladoNum.reduce((a, b) => a + b, 0)
  if (perimetro <= 0) return null

  const ych: number[] = new Array(n).fill(0)
  const acv: number[] = new Array(n).fill(0)
  ych[0] = angDec[0]
  acv[0] = ych[0] >= 360 ? ych[0] - 360 : ych[0]
  for (let i = 1; i < n; i++) {
    const prev = ych[i - 1] >= 360 ? ych[i - 1] - 360 : ych[i - 1]
    const sum = prev + angDec[i]
    ych[i] = sum > 180 ? sum - 180 : sum + 180
    acv[i] = ych[i] >= 360 ? ych[i] - 360 : ych[i]
  }

  const dx_raw = ladoNum.map((b, i) => b === 0 ? 0 : Math.round(b * Math.cos(acv[i] * Math.PI / 180) * 100) / 100)
  const dy_raw = ladoNum.map((b, i) => b === 0 ? 0 : Math.round(b * Math.sin(acv[i] * Math.PI / 180) * 100) / 100)

  const sum_dx = dx_raw.reduce((a, b) => a + b, 0)
  const sum_dy = dy_raw.reduce((a, b) => a + b, 0)
  const error_x = Math.round(sum_dx * 10000) / 10000
  const error_y = Math.round(sum_dy * 10000) / 10000
  const error_total = Math.round(Math.sqrt(error_x ** 2 + error_y ** 2) * 10000) / 10000

  const dx_c = ladoNum.map((b, i) => b === 0 ? 0 : Math.round((dx_raw[i] - b * error_x / (perimetro || 1)) * 100) / 100)
  const dy_c = ladoNum.map((b, i) => b === 0 ? 0 : Math.round((dy_raw[i] - b * error_y / (perimetro || 1)) * 100) / 100)
  const sum_dxc = Math.round(dx_c.reduce((a, b) => a + b, 0) * 100) / 100
  const sum_dyc = Math.round(dy_c.reduce((a, b) => a + b, 0) * 100) / 100

  const X: number[] = new Array(n).fill(0)
  const Y: number[] = new Array(n).fill(0)
  let currX = 0
  let currY = 0
  for (let i = 0; i < n; i++) {
    currX = Math.round((currX + dx_c[i]) * 100) / 100
    currY = Math.round((currY + dy_c[i]) * 100) / 100
    X[i] = i === n - 1 ? 0 : currX
    Y[i] = i === n - 1 ? 0 : currY
  }

  // Vértices del polígono para cálculo de Gauss (P0=(0,0), P1=(X0,Y0), ..., Pn-1=(Xn-2,Yn-2))
  const verticesX = [0, ...X.slice(0, n - 1)]
  const verticesY = [0, ...Y.slice(0, n - 1)]

  const sups: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    sups[i] = verticesX[i] * verticesY[j] - verticesX[j] * verticesY[i]
  }
  const superficie_m2 = Math.round(Math.abs(sups.reduce((a, b) => a + b, 0)) / 2 * 10000) / 10000
  const superficie_ha = Math.round(superficie_m2 / 10000 * 1000000) / 1000000

  function toGMS(dec: number) {
    const g = Math.floor(dec)
    const rem_m = (dec - g) * 60
    const m = Math.floor(rem_m)
    const s = Math.round((rem_m - m) * 60)
    return { g, m, s }
  }

  const filas: FilaCalculo[] = lados.map((l, i) => {
    const ai = { g: parseFloat(l.ang_g) || 0, m: parseFloat(l.ang_m) || 0, s: parseFloat(l.ang_s) || 0 }
    const ac = toGMS(acv[i])
    return {
      desig: l.desig,
      lado: ladoNum[i],
      ai_g: ai.g,
      ai_m: ai.m,
      ai_s: ai.s,
      ac_g: ac.g,
      ac_m: ac.m,
      ac_s: ac.s,
      dx: dx_raw[i],
      dy: dy_raw[i],
      dx_c: dx_c[i],
      dy_c: dy_c[i],
      x: X[i],
      y: Y[i],
      ai_v: angDec[i],
      ych: Math.round(ych[i] * 1000) / 1000,
      acv: Math.round(acv[i] * 1000) / 1000,
      sup: Math.round(sups[i] * 10000) / 10000,
    }
  })

  return {
    filas,
    perimetro,
    error_x,
    error_y,
    error_total,
    superficie_m2,
    superficie_ha,
    sum_dx,
    sum_dy,
    sum_dxc,
    sum_dyc,
  }
}

// ─── FORMATEO PARA WORD Y VISTA PREVIA ─────────────────────────────────────────

export function formatearLadosMemoria(filas: FilaCalculo[]): Array<{ linea: string }> {
  return filas
    .filter(f => f.lado > 0)
    .map(f => ({
      linea: `${f.desig}: ${f.lado.toFixed(2).replace('.', ',')} m – ${metrosLetras(f.lado)}.`
    }))
}

export function formatearAngulosMemoria(filas: FilaCalculo[]): Array<{ linea: string }> {
  return filas
    .filter(f => f.lado > 0)
    .map(f => {
      const vertice = f.desig.split('-')[0] || f.desig
      const angFmt = `${f.ai_g}°${String(f.ai_m).padStart(2, '0')}'`
      return { linea: `${vertice}: ${angFmt} – ${anguloLetras(f.ai_g, f.ai_m)}.` }
    })
}

export function formatearFilasPlanilla(filas: FilaCalculo[]): Array<any> {
  const r = (v: number | string, dec = 2) =>
    typeof v === 'number' ? v.toFixed(dec).replace('.', ',') : (v || '0')

  return filas.map(f => ({
    desig: f.desig,
    lado: r(f.lado),
    ai_g: String(f.ai_g),
    ai_m: String(f.ai_m),
    ai_s: String(f.ai_s),
    ac_g: String(f.ac_g),
    ac_m: String(f.ac_m),
    ac_s: String(f.ac_s),
    dx: r(f.dx),
    dy: r(f.dy),
    dx_c: r(f.dx_c),
    dy_c: r(f.dy_c),
    x: r(f.x),
    y: r(f.y),
    ai_v: r(f.ai_v, 6),
    ych: r(f.ych, 3),
    acv: r(f.acv, 3),
    sup: r(f.sup, 4),
  }))
}

// ─── PROYECCIÓN SVG PARA VISTA GRÁFICA DEL POLÍGONO ────────────────────────────
export function calcularPuntosSvg(filas: FilaCalculo[], boxSize = 260, padding = 32) {
  if (!filas || filas.length < 3) return null
  const points = filas.map(f => ({ x: f.x, y: f.y }))
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  const usableSize = boxSize - padding * 2
  const scale = Math.min(usableSize / width, usableSize / height)

  const projected = points.map(p => {
    const cx = (p.x - minX - width / 2) * scale + boxSize / 2
    const cy = -(p.y - minY - height / 2) * scale + boxSize / 2
    return { x: cx, y: cy }
  })

  const pointsStr = projected.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const labels = projected.map((p, i) => {
    const dx = p.x - boxSize / 2
    const dy = p.y - boxSize / 2
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const labelX = p.x + (dx / len) * 14
    const labelY = p.y + (dy / len) * 14 + 4
    const name = filas[i].desig.split('-')[0] || String(i + 1)
    return { x: labelX, y: labelY, name }
  })

  return { pointsStr, labels, projected, boxSize }
}
