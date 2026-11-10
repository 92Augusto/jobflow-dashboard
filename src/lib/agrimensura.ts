// ─── UTILIDADES Y CONVERSIONES PARA AGRIMENSURA ─────────────────────────────────

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']

const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']

const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

export function numLetras(n: number, genero: 'm' | 'f' | 'n' = 'n'): string {
  if (!isFinite(n) || n < 0) return '—'
  n = Math.floor(n)
  if (n === 0) return 'cero'
  if (n === 100) return 'cien'

  if (n === 1) {
    if (genero === 'm') return 'un'
    if (genero === 'f') return 'una'
    return 'uno'
  }
  if (n === 21) {
    if (genero === 'm') return 'veintiún'
    if (genero === 'f') return 'veintiuna'
    return 'veintiuno'
  }

  if (n < 30) return UNIDADES[n]

  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10
    if (u === 0) return DECENAS[d]
    let unidadStr = UNIDADES[u]
    if (u === 1) {
      if (genero === 'm') unidadStr = 'un'
      else if (genero === 'f') unidadStr = 'una'
      else unidadStr = 'uno'
    }
    return DECENAS[d] + ' y ' + unidadStr
  }

  if (n < 1000) {
    const c = Math.floor(n / 100), r = n % 100
    return r === 0 ? CENTENAS[c] : CENTENAS[c] + ' ' + numLetras(r, genero)
  }

  if (n < 1000000) {
    const m = Math.floor(n / 1000), r = n % 1000
    const base = m === 1 ? 'mil' : numLetras(m, 'm') + ' mil'
    return r === 0 ? base : base + ' ' + numLetras(r, genero)
  }

  return String(n)
}

export function cap(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Metros a letras: "547,63 m – Quinientos cuarenta y siete metros, sesenta y tres centímetros"
export function metrosLetras(metros: number): string {
  const entero = Math.floor(metros)
  const dec = Math.round((metros - entero) * 100)
  let texto = cap(numLetras(entero, 'm')) + (entero === 1 ? ' metro' : ' metros')
  if (dec > 0) texto += ', ' + numLetras(dec, 'm') + (dec === 1 ? ' centímetro' : ' centímetros')
  return texto
}

// Ángulo a letras: "90°00' – Noventa grados, cero minutos"
export function anguloLetras(g: number, m: number): string {
  return cap(numLetras(g, 'm')) + (g === 1 ? ' grado' : ' grados') + ', ' + numLetras(m, 'm') + (m === 1 ? ' minuto' : ' minutos')
}

// Superficie en m2 a letras: "624,16 -> Seiscientos veinticuatro con dieciséis metros cuadrados"
export function superficieM2Letras(m2: number): string {
  if (!isFinite(m2) || m2 <= 0) return ''
  const entero = Math.floor(m2)
  const dec = Math.round((m2 - entero) * 100)
  let texto = cap(numLetras(entero, 'm'))
  if (dec > 0) {
    texto += ' con ' + numLetras(dec, 'm') + ' metros cuadrados'
  } else {
    texto += (entero === 1 ? ' metro cuadrado' : ' metros cuadrados')
  }
  return texto
}

// Superficie en ha/a/ca a letras
export function superficieHaLetras(m2: number): string {
  const ha = Math.floor(m2 / 10000)
  const resto_a = (m2 - ha * 10000)
  const a = Math.floor(resto_a / 100)
  const ca = Math.round((resto_a - a * 100) * 100) / 100

  const ha_ent = Math.floor(ca)
  const ca_dec = Math.round((ca - ha_ent) * 100)

  let texto = ''
  if (ha > 0) texto += cap(numLetras(ha, 'f')) + (ha === 1 ? ' hectárea' : ' hectáreas')
  if (a > 0) texto += (texto ? ', ' : '') + numLetras(a, 'm') + (a === 1 ? ' área' : ' áreas')
  if (ca > 0) {
    const caStr = ca_dec > 0
      ? numLetras(ha_ent, 'f') + ' con ' + numLetras(ca_dec, 'f') + ' centiáreas'
      : numLetras(Math.round(ca), 'f') + (Math.round(ca) === 1 ? ' centiárea' : ' centiáreas')
    texto += (texto ? ' y ' : '') + caStr
  }
  return texto || 'cero centiáreas'
}

// Superficie en formato "42 Ha. 23 a. 38,66 ca."
export function superficieHaFormato(m2: number): string {
  const ha = Math.floor(m2 / 10000)
  const resto = m2 - ha * 10000
  const a = Math.floor(resto / 100)
  const ca = Math.round((resto - a * 100) * 100) / 100
  const caStr = ca.toFixed(2).replace('.', ',')
  return `${ha} Ha. ${a} a. ${caStr} ca.`
}

const CARDINALS: Record<string, string> = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' }

export function rumboLetras(q1: string, g: number, m: number, q2: string): string {
  return `${CARDINALS[q1] || q1} ${numLetras(g)} grados, ${numLetras(m)} minutos ${CARDINALS[q2] || q2}`
}

export function rumboCorto(desig: string, q1: string, g: number, m: number, q2: string): string {
  if (!desig || !q1 || !g) return ''
  return `(${desig}): ${q1} ${g}°${String(m).padStart(2, '0')}' ${q2} – ${cap(rumboLetras(q1, g, m, q2))}.`
}

const DIAS = ['', 'primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno']

const MESES_MAP = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fechaALetras(s: string): string {
  if (!s) return ''
  const [d, m, a] = s.split('/').map(Number)
  if (!d || !m || !a) return s
  return `${DIAS[d] || numLetras(d)} de ${MESES_MAP[m] || ''} de ${numLetras(a)}`
}

export function horaALetras(s: string): string {
  if (!s) return ''
  const [h, m] = s.split(':').map(Number)
  if (isNaN(h)) return s
  if (!m) return `${numLetras(h)} horas`
  return `${numLetras(h)} horas y ${numLetras(m)} minutos`
}
