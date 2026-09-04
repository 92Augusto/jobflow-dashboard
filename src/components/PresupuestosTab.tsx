import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Save, FileText, Calculator, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

// ─── FORMATO ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const APORTES_CPACH_PCT = 0.04
const GASTO_MIN_ADMIN = 23167 // Actualizado según tabla CPACH 01/10/2026 al 31/01/2027 ($23.167)
const SMVM_VIGENTE = 391200   // SMVM Vigente Octubre 2026 ($391.200)

// ─── CÁLCULOS BASE (verificados contra PDF CPACH 01/10/2026 - 31/01/2027) ──────
function calcDeslinde11(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 579181.99
  if (n <= 5)  return 579181.99  + (n - 1) * (579181.99  * 0.30)
  if (n <= 10) return 1274200.38 + (n - 5) * (1274200.38 * 0.16)
  if (n <= 20) return 2293560.68 + (n - 10) * (2293560.68 * 0.09)
  return 4357765.30 + (n - 20) * (2293560.68 * 0.09)
}
function calcDeslinde12(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 434386.49
  if (n <= 5)  return 434386.49  + (n - 1) * (434386.49  * 0.30)
  if (n <= 10) return 955650.28  + (n - 5) * (955650.28  * 0.16)
  if (n <= 20) return 1720170.51 + (n - 10) * (1720170.51 * 0.09)
  return 3268323.97 + (n - 20) * (1720170.51 * 0.09)
}
function calcMensuraUrb21(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 906098.05
  if (n <= 5)   return 906098.05   + (n - 1)  * (906098.05   * 0.20)
  if (n <= 10)  return 1630976.48  + (n - 5)  * (1630976.48  * 0.16)
  if (n <= 20)  return 2935757.67  + (n - 10) * (2935757.67  * 0.09)
  if (n <= 50)  return 5577939.58  + (n - 20) * (5577939.58  * 0.04)
  if (n <= 100) return 12271467.07 + (n - 50) * (12271467.07 * 0.015)
  if (n <= 200) return 21475067.37 + (n - 100) * (21475067.37 * 0.008)
  if (n <= 500) return 38655121.27 + (n - 200) * (38655121.27 * 0.004)
  return 85041266.80 + (n - 500) * (85041266.80 * 0.0016)
}
function calcMensuraUrb22(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 679573.54
  if (n <= 5)   return 679573.54   + (n - 1)  * (679573.54   * 0.20)
  if (n <= 10)  return 1223232.36  + (n - 5)  * (1223232.36  * 0.16)
  if (n <= 20)  return 2201818.25  + (n - 10) * (2201818.25  * 0.09)
  if (n <= 50)  return 4183454.68  + (n - 20) * (4183454.68  * 0.04)
  if (n <= 100) return 9203600.30  + (n - 50) * (9203600.30  * 0.01)
  if (n <= 200) return 13805400.45 + (n - 100) * (13805400.45 * 0.0065)
  if (n <= 500) return 22778910.75 + (n - 200) * (22778910.75 * 0.0035)
  return 46696767.04 + (n - 500) * (46696767.04 * 0.0015)
}
function calcPH31(n: number): number {
  if (n < 1) return 0
  const K = 906098.05
  if (n === 1) return 1218427.30
  if (n <= 5)  return K + 431426.23 * n
  if (n <= 10) return K + 396761.11 * n
  if (n <= 20) return K + 376854.42 * n
  if (n <= 50) return K + 366283.27 * n
  return K + 358183.30 * n
}
function calcPH32(n: number): number {
  if (n < 1) return 0
  const K = 679573.54
  if (n === 1) return 952089.39
  if (n <= 5)  return K + 354201.96 * n
  if (n <= 10) return K + 321939.38 * n
  if (n <= 20) return K + 303748.78 * n
  if (n <= 50) return K + 293932.71 * n
  return K + 286999.69 * n
}
function calcMensuraSuburbana(ha: number): number {
  if (ha <= 0) return 0
  if (ha <= 1)  return 1083542.25
  if (ha <= 5)  return 1083542.25 + (ha - 1)  * (1083542.25 * 0.02)
  if (ha <= 10) return 1170225.63 + (ha - 5)  * (1170225.63 * 0.016)
  if (ha <= 15) return 1263843.68 + (ha - 10) * (1263843.68 * 0.019)
  if (ha <= 20) return 1383908.83 + (ha - 15) * (1383908.83 * 0.017)
  if (ha <= 25) return 1501541.08 + (ha - 20) * (1501541.08 * 0.016)
  if (ha <= 50) return 1621664.36 + (ha - 25) * (1621664.36 * 0.007)
  return 1905455.63
}
function calcMensuraRural(ha: number): number {
  if (ha <= 50)    return calcMensuraSuburbana(ha)
  if (ha <= 100)   return 1905455.63  + (ha - 50)   * (1905455.63  * 0.005)
  if (ha <= 250)   return 2381819.53  + (ha - 100)  * (2381819.53  * 0.004)
  if (ha <= 500)   return 3810911.26  + (ha - 250)  * (3810911.26  * 0.0022)
  if (ha <= 1000)  return 5906912.45  + (ha - 500)  * (5906912.45  * 0.0008)
  if (ha <= 2500)  return 8269677.42  + (ha - 1000) * (8269677.42  * 0.0003)
  if (ha <= 5000)  return 11991032.26 + (ha - 2500) * (11991032.26 * 0.0001)
  if (ha <= 10000) return 14988790.33 + (ha - 5000) * (14988790.33 * 0.00008)
  return 20984306.46 + (ha - 10000) * (20984306.46 * 0.00006)
}
function calcSubdivisionSuburbana(ha: number, parcelas: number): number {
  const mensura = calcMensuraSuburbana(ha)
  let pct: number; let base: number
  if (ha <= 1)       { pct = 0.25; base = 1083542.25 }
  else if (ha <= 5)  { pct = 0.22; base = 1170225.63 }
  else if (ha <= 10) { pct = 0.18; base = 1170225.63 }
  else if (ha <= 15) { pct = 0.15; base = 1263843.68 }
  else if (ha <= 20) { pct = 0.13; base = 1383908.83 }
  else if (ha <= 25) { pct = 0.11; base = 1501541.08 }
  else               { pct = 0.10; base = 1621664.36 }
  return mensura + parcelas * pct * base
}
function calcSubdivisionRural(ha: number, parcelas: number): number {
  if (ha <= 50) return calcSubdivisionSuburbana(ha, parcelas)
  const ranges = [
    { min: 51,    max: 100,   base: 1815657.25, pctHa: 0.0050, parcVal: 181565.73 },
    { min: 101,   max: 250,   base: 2269571.56, pctHa: 0.0040, parcVal: 226957.16 },
    { min: 251,   max: 500,   base: 3631314.18, pctHa: 0.0022, parcVal: 363131.42 },
    { min: 501,   max: 1000,  base: 5628537.25, pctHa: 0.0008, parcVal: 562853.72 },
    { min: 1001,  max: 2500,  base: 7879952.05, pctHa: 0.0003, parcVal: 787995.20 },
    { min: 2501,  max: 5000,  base: 11425930.43, pctHa: 0.0001, parcVal: 1142593.04 },
    { min: 5001,  max: 10000, base: 14282413.28, pctHa: 0.00008, parcVal: 1428241.33 },
    { min: 10001, max: 20000, base: 19995378.28, pctHa: 0.00006, parcVal: 1999537.83 },
  ]
  const r = ranges.find(r => ha >= r.min && ha <= r.max) ?? ranges[ranges.length - 1]
  return r.base + (ha - r.min) * (r.base * r.pctHa) + parcelas * r.parcVal
}
function calcNivelacion64(ha: number): number {
  if (ha <= 0)   return 0
  if (ha <= 1)   return 1201266.35
  if (ha <= 5)   return 1201266.35 + (ha - 1)  * (1201266.35 * 0.02)
  if (ha <= 10)  return 1297367.66 + (ha - 5)  * (1297367.66 * 0.02)
  if (ha <= 15)  return 1427104.42 + (ha - 10) * (1427104.42 * 0.02)
  if (ha <= 20)  return 1569814.87 + (ha - 15) * (1569814.87 * 0.02)
  if (ha <= 25)  return 1726796.35 + (ha - 20) * (1726796.35 * 0.02)
  if (ha <= 50)  return 1899475.99 + (ha - 25) * (1899475.99 * 0.02)
  if (ha <= 100) return 2849213.98 + (ha - 50) * (2849213.98 * 0.02)
  return 5698427.97 + (ha - 100) * (5698427.97 * 0.02)
}
function calcDrones(ha: number): number {
  if (ha <= 0)   return 0
  if (ha <= 1)   return 549150.33
  if (ha <= 5)   return 549150.33  + (ha - 1)   * 21228.27
  if (ha <= 100) return 634063.41  + (ha - 5)   * 11675.52
  if (ha <= 500) return 1743237.81 + (ha - 100) * 4245.62
  return 3441485.81 + (ha - 500) * 2300.37
}
function calcTasacion(valor: number): { total: number; smvm: number; pct: number; variable: number } {
  const smvm = SMVM_VIGENTE
  let pct = 2.00
  if (valor <= 500000)      pct = 3.00
  else if (valor <= 1e6)    pct = 2.80
  else if (valor <= 5e6)    pct = 2.60
  else if (valor <= 1e7)    pct = 2.40
  else if (valor <= 1.5e7)  pct = 2.20
  else                      pct = 2.00
  const variable = valor * (pct / 100)
  const total = smvm + variable
  return { total, smvm, pct, variable }
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type LineaDetalle = { concepto: string; monto: number }

type Adicional = {
  id: string
  tipo: 'viaticos' | 'urgencia' | 'dificultad' | 'vertices' | 'tramite' | 'personalizado'
  descripcion: string
  monto: number
}

// ─── DEFINICIÓN TIPOS DE TRABAJO ──────────────────────────────────────────────
type InputField = { key: string; label: string; min?: number; step?: number; placeholder?: string }
type TipoTrabajo = {
  id: string; label: string; category: string
  inputs: InputField[]
  nota?: string
  calcular: (p: Record<string, number>) => { honorario: number; desglose: LineaDetalle[] }
}

const TIPOS: TipoTrabajo[] = [
  // ── DESLINDE ────────────────────────────────────────────────────────────────
  {
    id: 'deslinde_gr', label: 'Deslinde y Amojonamiento — Gran Resistencia',
    category: '1. Deslinde y Amojonamiento',
    inputs: [{ key: 'parcelas', label: 'Número de parcelas', min: 1 }],
    nota: 'Fontana, Resistencia, Barranqueras y Puerto Vilelas',
    calcular: p => {
      const n = p.parcelas ?? 0
      const total = calcDeslinde11(n)
      const desglose: LineaDetalle[] = []
      if (n === 1) { desglose.push({ concepto: '1 parcela — tarifa base', monto: total }) }
      else if (n <= 5) {
        desglose.push({ concepto: 'Base 1 parcela', monto: 579181.99 })
        desglose.push({ concepto: `${n - 1} parcela${n > 2 ? 's' : ''} adicional × 30% de $579.181,99`, monto: total - 579181.99 })
      } else if (n <= 10) {
        desglose.push({ concepto: 'Base acumulada 5 parcelas', monto: 1274200.38 })
        desglose.push({ concepto: `${n - 5} parcela${n > 6 ? 's' : ''} adicional × 16% de $1.274.200,38`, monto: total - 1274200.38 })
      } else if (n <= 20) {
        desglose.push({ concepto: 'Base acumulada 10 parcelas', monto: 2293560.68 })
        desglose.push({ concepto: `${n - 10} parcelas adicionales × 9% de $2.293.560,68`, monto: total - 2293560.68 })
      } else {
        desglose.push({ concepto: 'Base acumulada 20 parcelas', monto: 4357765.30 })
        desglose.push({ concepto: `${n - 20} parcelas adicionales × 9%`, monto: total - 4357765.30 })
      }
      return { honorario: total, desglose }
    },
  },
  {
    id: 'deslinde_resto', label: 'Deslinde y Amojonamiento — Resto Chaco',
    category: '1. Deslinde y Amojonamiento',
    inputs: [{ key: 'parcelas', label: 'Número de parcelas', min: 1 }],
    calcular: p => {
      const n = p.parcelas ?? 0; const total = calcDeslinde12(n)
      const desglose: LineaDetalle[] = [{ concepto: `Deslinde Resto Chaco — ${n} parcela${n > 1 ? 's' : ''}`, monto: n <= 1 ? total : 434386.49 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 434386.49 })
      return { honorario: total, desglose }
    },
  },
  // ── MENSURA URBANA ──────────────────────────────────────────────────────────
  {
    id: 'mensura_urb_gr', label: 'Mensura Parcelas Urbanas — Gran Resistencia',
    category: '2. Mensura Urbana',
    inputs: [{ key: 'parcelas', label: 'Número de parcelas', min: 1 }],
    nota: 'Solo parcelas ≤ 10.000 m²',
    calcular: p => {
      const n = p.parcelas ?? 0; const total = calcMensuraUrb21(n)
      const desglose: LineaDetalle[] = [{ concepto: `Mensura urbana GR — ${n} parcela${n > 1 ? 's' : ''}`, monto: n === 1 ? total : 906098.05 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 906098.05 })
      return { honorario: total, desglose }
    },
  },
  {
    id: 'mensura_urb_resto', label: 'Mensura Parcelas Urbanas — Resto Chaco',
    category: '2. Mensura Urbana',
    inputs: [{ key: 'parcelas', label: 'Número de parcelas', min: 1 }],
    nota: 'Solo parcelas ≤ 10.000 m²',
    calcular: p => {
      const n = p.parcelas ?? 0; const total = calcMensuraUrb22(n)
      const desglose: LineaDetalle[] = [{ concepto: `Mensura urbana Resto Chaco — ${n} parcela${n > 1 ? 's' : ''}`, monto: n === 1 ? total : 679573.54 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 679573.54 })
      return { honorario: total, desglose }
    },
  },
  // ── VERIFICACIÓN PARCELARIA ─────────────────────────────────────────────────
  {
    id: 'verif_urb_gr', label: 'Verificación Parcelaria Urbana — Gran Resistencia',
    category: '2. Mensura Urbana',
    inputs: [
      { key: 'parcelas', label: 'Número de parcelas', min: 1 },
      { key: 'pct_verificacion', label: 'Porcentaje sobre mensura (30–50)', min: 30, step: 5 },
    ],
    nota: 'Control contra títulos, revisión de límites y mensura registrada. Se cobra 30%–50% del valor de mensura completa.',
    calcular: p => {
      const n = p.parcelas ?? 0
      const pct = Math.min(Math.max(p.pct_verificacion ?? 40, 30), 50) / 100
      const mensuraBase = calcMensuraUrb21(n)
      const total = mensuraBase * pct
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura urbana GR base (${n} parcela${n > 1 ? 's' : ''})`, monto: mensuraBase },
          { concepto: `Verificación parcelaria — ${Math.round(pct * 100)}% de la mensura`, monto: total - mensuraBase },
        ],
      }
    },
  },
  {
    id: 'verif_urb_resto', label: 'Verificación Parcelaria Urbana — Resto Chaco',
    category: '2. Mensura Urbana',
    inputs: [
      { key: 'parcelas', label: 'Número de parcelas', min: 1 },
      { key: 'pct_verificacion', label: 'Porcentaje sobre mensura (30–50)', min: 30, step: 5 },
    ],
    nota: 'Se cobra 30%–50% del valor de mensura completa.',
    calcular: p => {
      const n = p.parcelas ?? 0
      const pct = Math.min(Math.max(p.pct_verificacion ?? 40, 30), 50) / 100
      const mensuraBase = calcMensuraUrb22(n)
      const total = mensuraBase * pct
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura urbana Resto Chaco base (${n} parcela${n > 1 ? 's' : ''})`, monto: mensuraBase },
          { concepto: `Verificación parcelaria — ${Math.round(pct * 100)}% de la mensura`, monto: total - mensuraBase },
        ],
      }
    },
  },
  // ── REPLANTEO ───────────────────────────────────────────────────────────────
  {
    id: 'replanteo_urb', label: 'Replanteo Urbano',
    category: '2. Mensura Urbana',
    inputs: [
      { key: 'parcelas', label: 'Número de parcelas', min: 1 },
      { key: 'pct_replanteo', label: 'Porcentaje sobre mensura (30–60)', min: 30, step: 5 },
    ],
    nota: 'Ubicación física, marcación en campo, ejes y límites, estacado temporal. Se cobra 30%–60% del valor de mensura.',
    calcular: p => {
      const n = p.parcelas ?? 0
      const pct = Math.min(Math.max(p.pct_replanteo ?? 40, 30), 60) / 100
      const mensuraBase = calcMensuraUrb21(n)
      const total = mensuraBase * pct
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura urbana base referencia (${n} parcela${n > 1 ? 's' : ''})`, monto: mensuraBase },
          { concepto: `Replanteo — ${Math.round(pct * 100)}% de la mensura`, monto: total - mensuraBase },
        ],
      }
    },
  },
  // ── PH ──────────────────────────────────────────────────────────────────────
  {
    id: 'ph_vertical_gr', label: 'PH Edificios Verticales — Gran Resistencia',
    category: '3. Propiedad Horizontal',
    inputs: [{ key: 'uf', label: 'Unidades Funcionales (UF)', min: 1 }],
    calcular: p => {
      const n = p.uf ?? 0; const total = calcPH31(n)
      return { honorario: total, desglose: [{ concepto: `Base fija K`, monto: 906098.05 }, { concepto: `${n} UF × valor unitario por tramo`, monto: total - 906098.05 }] }
    },
  },
  {
    id: 'ph_vertical_resto', label: 'PH Edificios Verticales — Resto Chaco',
    category: '3. Propiedad Horizontal',
    inputs: [{ key: 'uf', label: 'Unidades Funcionales (UF)', min: 1 }],
    calcular: p => {
      const n = p.uf ?? 0; const total = calcPH32(n)
      return { honorario: total, desglose: [{ concepto: `Base fija K`, monto: 679573.54 }, { concepto: `${n} UF × valor unitario por tramo`, monto: total - 679573.54 }] }
    },
  },
  // ── RURAL / SUBURBANA ────────────────────────────────────────────────────────
  {
    id: 'mensura_suburbana', label: 'Mensura Suburbana — Chacras y Quintas',
    category: '4. Rural y Suburbana',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    calcular: p => {
      const ha = p.hectareas ?? 0; const total = calcMensuraSuburbana(ha)
      return { honorario: total, desglose: [{ concepto: `Mensura suburbana — ${ha} ha`, monto: total }] }
    },
  },
  {
    id: 'mensura_rural', label: 'Mensura Rural',
    category: '4. Rural y Suburbana',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    calcular: p => {
      const ha = p.hectareas ?? 0; const total = calcMensuraRural(ha)
      return { honorario: total, desglose: [{ concepto: `Mensura rural — ${ha} ha`, monto: total }] }
    },
  },
  // ── VERIFICACIÓN RURAL ───────────────────────────────────────────────────────
  {
    id: 'verif_rural', label: 'Verificación Parcelaria Rural',
    category: '4. Rural y Suburbana',
    inputs: [
      { key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 },
      { key: 'pct_verificacion', label: 'Porcentaje sobre mensura (30–50)', min: 30, step: 5 },
    ],
    nota: 'Control contra títulos y mensura registrada. Se cobra 30%–50% del valor de mensura rural.',
    calcular: p => {
      const ha = p.hectareas ?? 0
      const pct = Math.min(Math.max(p.pct_verificacion ?? 40, 30), 50) / 100
      const mensuraBase = calcMensuraRural(ha)
      const total = mensuraBase * pct
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura rural base — ${ha} ha`, monto: mensuraBase },
          { concepto: `Verificación parcelaria — ${Math.round(pct * 100)}% de la mensura`, monto: total - mensuraBase },
        ],
      }
    },
  },
  // ── REPLANTEO RURAL ──────────────────────────────────────────────────────────
  {
    id: 'replanteo_rural', label: 'Replanteo Rural',
    category: '4. Rural y Suburbana',
    inputs: [
      { key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 },
      { key: 'pct_replanteo', label: 'Porcentaje sobre mensura (30–60)', min: 30, step: 5 },
    ],
    nota: 'Ubicación física, marcación, ejes, estacado. Se cobra 30%–60% del valor de mensura rural.',
    calcular: p => {
      const ha = p.hectareas ?? 0
      const pct = Math.min(Math.max(p.pct_replanteo ?? 40, 30), 60) / 100
      const mensuraBase = calcMensuraRural(ha)
      const total = mensuraBase * pct
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura rural base referencia — ${ha} ha`, monto: mensuraBase },
          { concepto: `Replanteo — ${Math.round(pct * 100)}% de la mensura`, monto: total - mensuraBase },
        ],
      }
    },
  },
  // ── SUBDIVISIÓN ──────────────────────────────────────────────────────────────
  {
    id: 'subdivision_suburbana', label: 'Mensura y Subdivisión Suburbana',
    category: '5. Subdivisión',
    inputs: [{ key: 'hectareas', label: 'Superficie total (Ha)', min: 0.01, step: 0.01 }, { key: 'parcelas_creadas', label: 'Parcelas creadas', min: 1 }],
    calcular: p => {
      const ha = p.hectareas ?? 0; const pc = p.parcelas_creadas ?? 0
      const mensura = calcMensuraSuburbana(ha); const total = calcSubdivisionSuburbana(ha, pc)
      return { honorario: total, desglose: [{ concepto: `Mensura base — ${ha} ha`, monto: mensura }, { concepto: `Subdivisión — ${pc} parcelas creadas`, monto: total - mensura }] }
    },
  },
  {
    id: 'subdivision_rural', label: 'Mensura y Subdivisión Rural',
    category: '5. Subdivisión',
    inputs: [{ key: 'hectareas', label: 'Superficie total (Ha)', min: 0.01, step: 0.01 }, { key: 'parcelas_creadas', label: 'Parcelas creadas', min: 1 }],
    calcular: p => {
      const ha = p.hectareas ?? 0; const pc = p.parcelas_creadas ?? 0
      const mensura = calcMensuraRural(ha); const total = calcSubdivisionRural(ha, pc)
      return { honorario: total, desglose: [{ concepto: `Mensura rural base — ${ha} ha`, monto: mensura }, { concepto: `Subdivisión — ${pc} parcelas creadas`, monto: total - mensura }] }
    },
  },
  // ── SUBDIVISIÓN S/MENSURA REGISTRADA ─────────────────────────────────────────
  {
    id: 'subdivision_smr', label: 'Subdivisión según Mensura Registrada',
    category: '5. Subdivisión',
    inputs: [{ key: 'hectareas', label: 'Superficie total (Ha)', min: 0.01, step: 0.01 }, { key: 'parcelas_creadas', label: 'Parcelas creadas', min: 1 }],
    nota: 'Ya existe mensura registrada: NO se cobra mensura completa. Solo subdivisión y tareas adicionales.',
    calcular: p => {
      const ha = p.hectareas ?? 0; const pc = p.parcelas_creadas ?? 0
      let pct: number; let base: number
      if (ha <= 1)       { pct = 0.25; base = 1083542.25 }
      else if (ha <= 5)  { pct = 0.22; base = 1170225.63 }
      else if (ha <= 10) { pct = 0.18; base = 1170225.63 }
      else if (ha <= 15) { pct = 0.15; base = 1263843.68 }
      else if (ha <= 20) { pct = 0.13; base = 1383908.83 }
      else if (ha <= 25) { pct = 0.11; base = 1501541.08 }
      else               { pct = 0.10; base = 1621664.36 }
      const total = pc * pct * base
      return {
        honorario: total,
        desglose: [
          { concepto: `Mensura ya registrada (no se cobra)`, monto: 0 },
          { concepto: `${pc} parcelas × ${Math.round(pct * 100)}% de $${base.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, monto: total },
        ],
      }
    },
  },
  // ── NIVELACIONES ─────────────────────────────────────────────────────────────
  {
    id: 'nivel_planta_urbana', label: 'Relevamiento Planialtimétrico Planta Urbana (6.1)',
    category: '6. Nivelaciones',
    inputs: [{ key: 'parcelas', label: 'Número de parcelas', min: 1 }],
    calcular: p => {
      const n = p.parcelas ?? 0
      const total = n * 171609.48
      return { honorario: total, desglose: [{ concepto: `${n} parcela${n > 1 ? 's' : ''} × $171.609,48/parcela`, monto: total }] }
    },
  },
  {
    id: 'nivel_perfil_long', label: 'Nivelación — Perfil Longitudinal (6.2)',
    category: '6. Nivelaciones',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 686437.91; return { honorario: total, desglose: [{ concepto: `${p.km} km × $686.437,91/km`, monto: total }] } },
  },
  {
    id: 'nivel_pl_pt', label: 'Nivelación — PL + PT + Puntos Fijos c/500m (6.3)',
    category: '6. Nivelaciones',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 617794.12; return { honorario: total, desglose: [{ concepto: `${p.km} km × $617.794,12/km`, monto: total }] } },
  },
  {
    id: 'nivel_curvas', label: 'Nivelación — Curvas de Nivel por Ha (6.4)',
    category: '6. Nivelaciones',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    nota: 'Con 50 puntos en terreno firme y limpio',
    calcular: p => { const total = calcNivelacion64(p.hectareas ?? 0); return { honorario: total, desglose: [{ concepto: `Nivelación curvas de nivel — ${p.hectareas} ha`, monto: total }] } },
  },
  // ── DRONES / GPS ─────────────────────────────────────────────────────────────
  {
    id: 'drones', label: 'Relevamiento con Drones',
    category: '7. Drones y GPS',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = calcDrones(p.hectareas ?? 0); return { honorario: total, desglose: [{ concepto: `Relevamiento con drones — ${p.hectareas} ha`, monto: total }] } },
  },
  {
    id: 'gps_5km',  label: 'Traslado GPS — Radio 5 km',  category: '7. Drones y GPS', inputs: [{ key: 'puntos', label: 'Número de puntos', min: 1 }],
    calcular: p => { const total = (p.puntos ?? 0) * 291736.11; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $291.736,11/pto`, monto: total }] } },
  },
  {
    id: 'gps_10km', label: 'Traslado GPS — Radio 10 km', category: '7. Drones y GPS', inputs: [{ key: 'puntos', label: 'Número de puntos', min: 1 }],
    calcular: p => { const total = (p.puntos ?? 0) * 411862.75; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $411.862,75/pto`, monto: total }] } },
  },
  {
    id: 'gps_30km', label: 'Traslado GPS — Radio 30 km', category: '7. Drones y GPS', inputs: [{ key: 'puntos', label: 'Número de puntos', min: 1 }],
    calcular: p => { const total = (p.puntos ?? 0) * 617794.12; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $617.794,12/pto`, monto: total }] } },
  },
  // ── TASACIÓN ─────────────────────────────────────────────────────────────────
  {
    id: 'tasacion', label: 'Tasación de Inmueble', category: '9. Tasación',
    inputs: [{ key: 'valor', label: 'Valor de tasación ($)', min: 0, step: 1000, placeholder: 'Ingresá el valor en pesos' }],
    nota: 'Honorario Total = SMVM ($391.200) + (Valor Tasado × %)',
    calcular: p => {
      const valor = p.valor ?? 0
      const { total, smvm, pct, variable } = calcTasacion(valor)
      return {
        honorario: total,
        desglose: [
          { concepto: `Honorario mínimo orientativo (SMVM vigente)`, monto: smvm },
          { concepto: `${pct.toFixed(2).replace('.', ',')}% sobre valor tasado (${fmt(valor)})`, monto: variable },
        ],
      }
    },
  },
  // ── APERTURA DE RUMBO ─────────────────────────────────────────────────────────
  {
    id: 'apertura_rumbo', label: 'Apertura de Rumbo y Desmonte (ancho 2m)', category: '12. Otros',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 978174.03; return { honorario: total, desglose: [{ concepto: `${p.km} km × $978.174,03/km`, monto: total }] } },
  },
]

const CATEGORIES = [...new Set(TIPOS.map(t => t.category))]

// ─── ADICIONALES PREDEFINIDOS ─────────────────────────────────────────────────
const ADICIONALES_PREDEFINIDOS = [
  { tipo: 'viaticos' as const, label: 'Viáticos / Traslado al campo', placeholder: 'Monto estimado de traslado' },
  { tipo: 'urgencia' as const, label: 'Urgencia (% sobre honorario)', placeholder: 'Ej: 20 = 20% de recargo' },
  { tipo: 'dificultad' as const, label: 'Dificultad de terreno (monte/agua)', placeholder: 'Monto por condiciones especiales' },
  { tipo: 'vertices' as const, label: 'Vértices adicionales', placeholder: 'Monto por cantidad extra de vértices' },
  { tipo: 'tramite' as const, label: 'Gestión/trámite expeditado', placeholder: 'Monto por trámite urgente' },
  { tipo: 'personalizado' as const, label: 'Otro adicional', placeholder: 'Descripción y monto' },
]

// ─── TIPOS TS ─────────────────────────────────────────────────────────────────
type Presupuesto = {
  id: string; clienteNombre: string; clienteDireccion: string
  tipoTrabajoLabel: string; honorario: number; adicionales: number
  aportesCpach: number; gastoAdmin: number; totalFinal: number; createdAt: any
}

const S = {
  errorBox: { background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991B1B', marginBottom: '12px' } as React.CSSProperties,
  resultBox: { background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px', padding: '16px', marginTop: '16px' } as React.CSSProperties,
  lineRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 0', fontSize: '13px', gap: '12px' } as React.CSSProperties,
  divider: { height: '0.5px', background: 'var(--color-border-tertiary)', margin: '8px 0' } as React.CSSProperties,
  totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '16px', fontWeight: '600' } as React.CSSProperties,
  pagoCard: { border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '12px', marginTop: '8px', background: 'var(--color-background-primary)' } as React.CSSProperties,
  adicionalRow: { display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '8px' } as React.CSSProperties,
  sectionTitle: { fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: '10px', marginTop: '20px' },
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────
export function PresupuestosTab({ userId }: { userId: string }) {
  const [tipoId, setTipoId]           = useState('')
  const [params, setParams]           = useState<Record<string, string>>({})
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [honorario, setHonorario]     = useState(0)
  const [desglose, setDesglose]       = useState<LineaDetalle[]>([])
  const [adicionales, setAdicionales] = useState<Adicional[]>([])
  const [mostrarPagos, setMostrarPagos] = useState(false)
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const selectedTipo = TIPOS.find(t => t.id === tipoId)

  // Total adicionales
  const totalAdicionales = adicionales.reduce((s, a) => {
    if (a.tipo === 'urgencia') return s + (honorario * a.monto / 100)
    return s + a.monto
  }, 0)

  const aportesCpach = (honorario + totalAdicionales) * APORTES_CPACH_PCT
  const totalFinal = honorario + totalAdicionales + aportesCpach + GASTO_MIN_ADMIN
  const canSave = !!selectedTipo && honorario > 0 && clienteNombre.trim().length > 0 && !saving

  // Planes de pago
  const planes = [
    { label: '30 / 40 / 30', cuotas: [totalFinal * 0.30, totalFinal * 0.40, totalFinal * 0.30], etiquetas: ['Anticipo', 'Inicio campo', 'Entrega'] },
    { label: '50 / 50',      cuotas: [totalFinal * 0.50, totalFinal * 0.50], etiquetas: ['Anticipo', 'Entrega'] },
    { label: '40% + 6 cuotas', cuotas: [totalFinal * 0.40, ...Array(6).fill(totalFinal * 0.60 / 6)], etiquetas: ['Anticipo', ...Array(6).fill('').map((_, i) => `Cuota ${i + 1}`)] },
  ]

  useEffect(() => {
    if (!selectedTipo) { setHonorario(0); setDesglose([]); return }
    const numParams: Record<string, number> = {}
    for (const input of selectedTipo.inputs) numParams[input.key] = parseFloat(params[input.key] ?? '0') || 0
    const { honorario: h, desglose: d } = selectedTipo.calcular(numParams)
    setHonorario(h); setDesglose(d)
  }, [tipoId, params, selectedTipo])

  useEffect(() => {
    const q = query(collection(db, 'presupuestos'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q, 
      snap => setPresupuestos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Presupuesto))),
      err => console.error("Firestore offline sync warning:", err)
    )
  }, [userId])

  function agregarAdicional(tipo: Adicional['tipo']) {
    const pre = ADICIONALES_PREDEFINIDOS.find(a => a.tipo === tipo)
    setAdicionales(prev => [...prev, {
      id: Date.now().toString(),
      tipo,
      descripcion: pre?.label ?? 'Adicional',
      monto: 0,
    }])
  }

  function actualizarAdicional(id: string, field: 'descripcion' | 'monto', value: string) {
    setAdicionales(prev => prev.map(a => a.id === id ? { ...a, [field]: field === 'monto' ? parseFloat(value) || 0 : value } : a))
  }

  function eliminarAdicional(id: string) {
    setAdicionales(prev => prev.filter(a => a.id !== id))
  }

  function handleSave() {
    if (!canSave || !selectedTipo) return
    setSaving(true)
    try {
      addDoc(collection(db, 'presupuestos'), {
        userId, clienteNombre: clienteNombre.trim(),
        clienteDireccion: clienteDireccion.trim(),
        tipoTrabajoId: selectedTipo.id, tipoTrabajoLabel: selectedTipo.label,
        honorario, adicionales: totalAdicionales,
        aportesCpach, gastoAdmin: GASTO_MIN_ADMIN, totalFinal,
        createdAt: serverTimestamp(),
      }).catch(e => console.error("Error background sync:", e))
      
      setClienteNombre(''); setClienteDireccion('')
      setTipoId(''); setParams({}); setAdicionales([])
      setMostrarPagos(false)
    } catch (e: any) { 
      setError('Error al preparar guardado: ' + e.message) 
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />Nuevo presupuesto
          </CardTitle>
          <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-1 rounded-full font-medium w-fit">
            Aranceles CPACH: 01/10/2026 al 31/01/2027
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div style={S.errorBox}>{error}</div>}

          {/* Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre y apellido *</Label>
              <Input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección / Referencia</Label>
              <Input value={clienteDireccion} onChange={e => setClienteDireccion(e.target.value)} placeholder="Dirección o referencia" />
            </div>
          </div>

          {/* Tipo de trabajo */}
          <div className="space-y-1.5">
            <Label>Tipo de trabajo *</Label>
            <select 
              value={tipoId} 
              onChange={e => { setTipoId(e.target.value); setParams({}); setAdicionales([]); setMostrarPagos(false) }}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Seleccioná el tipo de trabajo…</option>
              {CATEGORIES.map(cat => (
                <optgroup key={cat} label={cat}>
                  {TIPOS.filter(t => t.category === cat).map(tipo => (
                    <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Inputs dinámicos */}
          {selectedTipo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedTipo.inputs.map(input => (
                <div key={input.key} className="space-y-1.5">
                  <Label>{input.label}</Label>
                  <Input type="number" min={input.min} step={input.step ?? 1}
                    placeholder={input.placeholder ?? '0'}
                    value={params[input.key] ?? ''}
                    onChange={e => setParams(prev => ({ ...prev, [input.key]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          {selectedTipo?.nota && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">ℹ️ {selectedTipo.nota}</p>
          )}

          {/* ADICIONALES */}
          {honorario > 0 && (
            <div>
              <div style={S.sectionTitle}>Adicionales y extras</div>
              {adicionales.map(a => {
                const esUrgencia = a.tipo === 'urgencia'
                const montoReal = esUrgencia ? (honorario * a.monto / 100) : a.monto
                return (
                  <div key={a.id} style={S.adicionalRow}>
                    <div style={{ flex: 2 }}>
                      <Label style={{ fontSize: '12px' }}>Concepto</Label>
                      <Input value={a.descripcion} onChange={e => actualizarAdicional(a.id, 'descripcion', e.target.value)} style={{ fontSize: '13px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Label style={{ fontSize: '12px' }}>{esUrgencia ? '% recargo' : 'Monto ($)'}</Label>
                      <Input type="number" value={a.monto || ''} onChange={e => actualizarAdicional(a.id, 'monto', e.target.value)} placeholder="0" style={{ fontSize: '13px' }} />
                    </div>
                    {esUrgencia && a.monto > 0 && (
                      <div style={{ flex: 1, alignSelf: 'flex-end', paddingBottom: '8px', fontSize: '12px', color: '#0F6E56', fontWeight: '500' }}>
                        = {fmt(montoReal)}
                      </div>
                    )}
                    <button onClick={() => eliminarAdicional(a.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', alignSelf: 'flex-end', paddingBottom: '10px' }}>
                      <X style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                )
              })}

              {/* Botones para agregar adicionales */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {ADICIONALES_PREDEFINIDOS.map(a => (
                  <button key={a.tipo} onClick={() => agregarAdicional(a.tipo)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                    <Plus style={{ width: '11px', height: '11px' }} />
                    {a.tipo === 'personalizado' ? 'Otro' : a.label.split(' ')[0] + (a.tipo === 'urgencia' ? ' (%)' : '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RESULTADO */}
          {honorario > 0 && (
            <div style={S.resultBox}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Desglose del presupuesto
              </p>

              {/* Líneas base */}
              {desglose.filter(l => l.monto > 0).map((l, i) => (
                <div key={i} style={S.lineRow}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{l.concepto}</span>
                  <span style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>{fmt(l.monto)}</span>
                </div>
              ))}

              {/* Honorario subtotal */}
              <div style={{ ...S.divider, marginTop: '6px' }} />
              <div style={{ ...S.lineRow, fontWeight: '500' }}>
                <span>Honorario profesional</span>
                <span>{fmt(honorario)}</span>
              </div>

              {/* Adicionales */}
              {adicionales.length > 0 && adicionales.map(a => {
                const montoReal = a.tipo === 'urgencia' ? honorario * a.monto / 100 : a.monto
                return montoReal > 0 ? (
                  <div key={a.id} style={S.lineRow}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{a.descripcion}{a.tipo === 'urgencia' ? ` (${a.monto}%)` : ''}</span>
                    <span style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>{fmt(montoReal)}</span>
                  </div>
                ) : null
              })}

              {totalAdicionales > 0 && (
                <div style={{ ...S.lineRow, fontWeight: '500', color: '#854F0B' }}>
                  <span>Total adicionales</span>
                  <span>{fmt(totalAdicionales)}</span>
                </div>
              )}

              <div style={S.divider} />

              {/* CPACH y gasto admin */}
              <div style={S.lineRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Aportes CPACH 4% (sobre honorario + adicionales)</span>
                <span style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>{fmt(aportesCpach)}</span>
              </div>
              <div style={S.lineRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Gasto mínimo administrativo</span>
                <span style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>{fmt(GASTO_MIN_ADMIN)}</span>
              </div>

              <div style={{ ...S.divider, background: '#0F6E56', opacity: 0.3 }} />
              <div style={S.totalRow}>
                <span style={{ color: '#0F6E56' }}>TOTAL A COBRAR</span>
                <span style={{ color: '#0F6E56', fontSize: '18px' }}>{fmt(totalFinal)}</span>
              </div>

              {/* Opciones de pago */}
              <div style={{ marginTop: '14px' }}>
                <button onClick={() => setMostrarPagos(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 0' }}>
                  {mostrarPagos ? <ChevronUp style={{ width: '14px', height: '14px' }} /> : <ChevronDown style={{ width: '14px', height: '14px' }} />}
                  Opciones de pago
                </button>

                {mostrarPagos && (
                  <div className="space-y-2 mt-2">
                    {planes.map(plan => (
                      <div key={plan.label} style={S.pagoCard}>
                        <p style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>{plan.label}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {plan.cuotas.map((c, i) => (
                            <div key={i} style={{ background: '#E1F5EE', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#0F6E56', fontWeight: '500' }}>
                              {plan.etiquetas[i]}: {fmt(c)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#854F0B', marginTop: '8px' }}>
                      ⚠️ <strong>Vigencia:</strong> Aranceles CPACH vigentes del 01/10/2026 al 31/01/2027 (Gasto Mínimo Administrativo: $23.167 · SMVM: $391.200). Se recomienda incluir cláusula de actualización inflacionaria.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSave} disabled={!canSave} className="w-full" style={{ background: '#0F6E56', color: 'white' }}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando…' : 'Guardar presupuesto'}
          </Button>
        </CardContent>
      </Card>

      {/* LISTA GUARDADOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />Presupuestos guardados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {presupuestos.length === 0
            ? <p className="text-center text-muted-foreground py-6">No hay presupuestos guardados todavía.</p>
            : (
              <div className="space-y-3">
                {presupuestos.map(p => (
                  <div key={p.id} className="flex items-start justify-between gap-4 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold leading-tight">{p.clienteNombre}</p>
                      {p.clienteDireccion && <p className="text-sm text-muted-foreground truncate">{p.clienteDireccion}</p>}
                      <p className="text-sm text-muted-foreground">{p.tipoTrabajoLabel}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Hon. {fmt(p.honorario)}</span>
                        {p.adicionales > 0 && <span>Adic. {fmt(p.adicionales)}</span>}
                        <span>CPACH {fmt(p.aportesCpach)}</span>
                        <span>G.Admin. {fmt(p.gastoAdmin ?? GASTO_MIN_ADMIN)}</span>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: '#0F6E56' }}>{fmt(p.totalFinal)}</p>
                      {p.createdAt?.toDate && (
                        <p className="text-xs text-muted-foreground">{p.createdAt.toDate().toLocaleDateString('es-AR')}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon"
                      onClick={() => { if (confirm('¿Eliminar?')) deleteDoc(doc(db, 'presupuestos', p.id)) }}
                      className="text-destructive hover:text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}