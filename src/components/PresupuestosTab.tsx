import { useState, useEffect } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Save, FileText, Calculator, ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

// ─── FORMATO ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const APORTES_CPACH_PCT = 0.04
const GASTO_MIN_ADMIN = 19878

// ─── CÁLCULOS BASE (verificados contra PDF) ───────────────────────────────────
function calcDeslinde11(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 496951.56
  if (n <= 5)  return 496951.56  + (n - 1) * (496951.56  * 0.30)
  if (n <= 10) return 1093293.43 + (n - 5) * (1093293.43 * 0.16)
  if (n <= 20) return 1967928.18 + (n - 10) * (1967928.18 * 0.09)
  return 3739063.54 + (n - 20) * (1967928.18 * 0.09)
}
function calcDeslinde12(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 372713.67
  if (n <= 5)  return 372713.67  + (n - 1) * (372713.67  * 0.30)
  if (n <= 10) return 819970.08  + (n - 5) * (819970.08  * 0.16)
  if (n <= 20) return 1475946.14 + (n - 10) * (1475946.14 * 0.09)
  return 2804297.66 + (n - 20) * (1475946.14 * 0.09)
}
function calcMensuraUrb21(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 777453.11
  if (n <= 5)   return 777453.11   + (n - 1)  * (777453.11   * 0.20)
  if (n <= 10)  return 1399415.60  + (n - 5)  * (1399415.60  * 0.16)
  if (n <= 20)  return 2518948.07  + (n - 10) * (2518948.07  * 0.09)
  if (n <= 50)  return 4786001.34  + (n - 20) * (4786001.34  * 0.04)
  if (n <= 100) return 10529202.94 + (n - 50) * (10529202.94 * 0.015)
  if (n <= 200) return 18426105.15 + (n - 100) * (18426105.15 * 0.008)
  if (n <= 500) return 33166989.26 + (n - 200) * (33166989.26 * 0.004)
  return 72967376.38 + (n - 500) * (72967376.38 * 0.0016)
}
function calcMensuraUrb22(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 583089.83
  if (n <= 5)   return 583089.83   + (n - 1)  * (583089.83   * 0.20)
  if (n <= 10)  return 1049561.70  + (n - 5)  * (1049561.70  * 0.16)
  if (n <= 20)  return 1889211.05  + (n - 10) * (1889211.05  * 0.09)
  if (n <= 50)  return 3589501.00  + (n - 20) * (3589501.00  * 0.04)
  if (n <= 100) return 7896902.21  + (n - 50) * (7896902.21  * 0.01)
  if (n <= 200) return 11845353.31 + (n - 100) * (11845353.31 * 0.0065)
  if (n <= 500) return 19544832.96 + (n - 200) * (19544832.96 * 0.0035)
  return 40066907.56 + (n - 500) * (40066907.56 * 0.0015)
}
function calcPH31(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 1045438.84
  if (n <= 5)  return 777453.11 + 370173.70 * n
  if (n <= 10) return 777453.11 + 340430.22 * n
  if (n <= 20) return 777453.11 + 323349.82 * n
  if (n <= 50) return 777453.11 + 314279.53 * n
  return 777453.11 + 307329.57 * n
}
function calcPH32(n: number): number {
  if (n < 1) return 0
  if (n === 1) return 816914.74
  if (n <= 5)  return 583089.83 + 303913.49 * n
  if (n <= 10) return 583089.83 + 276231.45 * n
  if (n <= 20) return 583089.83 + 260623.49 * n
  if (n <= 50) return 583089.83 + 252201.08 * n
  return 583089.83 + 246252.38 * n
}
function calcMensuraSuburbana(ha: number): number {
  if (ha <= 0) return 0
  if (ha <= 1)  return 929704.34
  if (ha <= 5)  return 929704.34  + (ha - 1)  * (929704.34  * 0.02)
  if (ha <= 10) return 1004080.69 + (ha - 5)  * (1004080.69 * 0.016)
  if (ha <= 15) return 1084407.14 + (ha - 10) * (1084407.14 * 0.019)
  if (ha <= 20) return 1187425.82 + (ha - 15) * (1187425.82 * 0.017)
  if (ha <= 25) return 1288357.02 + (ha - 20) * (1288357.02 * 0.016)
  if (ha <= 50) return 1391425.58 + (ha - 25) * (1391425.58 * 0.007)
  return 1634925.06
}
function calcMensuraRural(ha: number): number {
  if (ha <= 50)    return calcMensuraSuburbana(ha)
  if (ha <= 100)   return 1634925.06  + (ha - 50)   * (1634925.06  * 0.005)
  if (ha <= 250)   return 2043656.32  + (ha - 100)  * (2043656.32  * 0.004)
  if (ha <= 500)   return 3269850.11  + (ha - 250)  * (3269850.11  * 0.0022)
  if (ha <= 1000)  return 5068267.68  + (ha - 500)  * (5068267.68  * 0.0008)
  if (ha <= 2500)  return 7095574.75  + (ha - 1000) * (7095574.75  * 0.0003)
  if (ha <= 5000)  return 10288583.38 + (ha - 2500) * (10288583.38 * 0.0001)
  if (ha <= 10000) return 12860729.23 + (ha - 5000) * (12860729.23 * 0.00008)
  return 18005020.92 + (ha - 10000) * (18005020.92 * 0.00006)
}
function calcSubdivisionSuburbana(ha: number, parcelas: number): number {
  const mensura = calcMensuraSuburbana(ha)
  let pct: number; let base: number
  if (ha <= 1)       { pct = 0.25; base = 929704.34  }
  else if (ha <= 5)  { pct = 0.22; base = 1004080.69 }
  else if (ha <= 10) { pct = 0.18; base = 1004080.69 }
  else if (ha <= 15) { pct = 0.15; base = 1084407.14 }
  else if (ha <= 20) { pct = 0.13; base = 1187425.82 }
  else if (ha <= 25) { pct = 0.11; base = 1288357.02 }
  else               { pct = 0.10; base = 1391425.58 }
  return mensura + parcelas * pct * base
}
function calcSubdivisionRural(ha: number, parcelas: number): number {
  if (ha <= 50) return calcSubdivisionSuburbana(ha, parcelas)
  const ranges = [
    { min: 51,    max: 100,   base: 1557875.97  },
    { min: 101,   max: 250,   base: 1947344.96  },
    { min: 251,   max: 500,   base: 3115751.66  },
    { min: 501,   max: 1000,  base: 4829415.31  },
    { min: 1001,  max: 2500,  base: 6761181.35  },
    { min: 2501,  max: 5000,  base: 9803712.92  },
    { min: 5001,  max: 10000, base: 12254641.36 },
    { min: 10001, max: 20000, base: 17156497.64 },
  ]
  const r = ranges.find(r => ha >= r.min && ha <= r.max) ?? ranges[ranges.length - 1]
  return r.base + (ha - r.min) * (r.base * 0.005) + parcelas * 0.10 * r.base
}
function calcNivelacion61(ha: number): number {
  if (ha <= 0)   return 0
  if (ha <= 1)   return 1030714.35
  if (ha <= 5)   return 1030714.35 + (ha - 1)  * (1030714.35 * 0.02)
  if (ha <= 10)  return 1113171.50 + (ha - 5)  * (1113171.50 * 0.02)
  if (ha <= 15)  return 1224488.65 + (ha - 10) * (1224488.65 * 0.02)
  if (ha <= 20)  return 1346937.51 + (ha - 15) * (1346937.51 * 0.02)
  if (ha <= 25)  return 1481631.26 + (ha - 20) * (1481631.26 * 0.02)
  if (ha <= 50)  return 1629794.39 + (ha - 25) * (1629794.39 * 0.02)
  if (ha <= 100) return 2444691.58 + (ha - 50) * (2444691.58 * 0.02)
  return 4889383.16 + (ha - 100) * (4889383.16 * 0.02)
}
function calcDrones(ha: number): number {
  if (ha <= 0)   return 0
  if (ha <= 1)   return 471183.70
  if (ha <= 5)   return 471183.70  + (ha - 1)   * 19564.74
  if (ha <= 100) return 549442.66  + (ha - 5)   * 10760.58
  if (ha <= 500) return 1571697.76 + (ha - 100) * 3912.92
  return 3136865.76 + (ha - 500) * 2120.10
}
function calcTasacion(valor: number): number {
  const MIN = 88338
  let h: number
  if (valor <= 500000)     h = valor * 0.01
  else if (valor <= 1e6)   h = valor * 0.0075
  else if (valor <= 5e6)   h = valor * 0.005
  else if (valor <= 1e7)   h = valor * 0.0035
  else if (valor <= 1.5e7) h = valor * 0.003
  else h = valor * 0.002
  return Math.max(MIN, h)
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
        desglose.push({ concepto: 'Base 1 parcela', monto: 496951.56 })
        desglose.push({ concepto: `${n - 1} parcela${n > 2 ? 's' : ''} adicional × 30% de $496.951,56`, monto: total - 496951.56 })
      } else if (n <= 10) {
        desglose.push({ concepto: 'Base acumulada 5 parcelas', monto: 1093293.43 })
        desglose.push({ concepto: `${n - 5} parcela${n > 6 ? 's' : ''} adicional × 16% de $1.093.293,43`, monto: total - 1093293.43 })
      } else if (n <= 20) {
        desglose.push({ concepto: 'Base acumulada 10 parcelas', monto: 1967928.18 })
        desglose.push({ concepto: `${n - 10} parcelas adicionales × 9% de $1.967.928,18`, monto: total - 1967928.18 })
      } else {
        desglose.push({ concepto: 'Base acumulada 20 parcelas', monto: 3739063.54 })
        desglose.push({ concepto: `${n - 20} parcelas adicionales × 9%`, monto: total - 3739063.54 })
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
      const desglose: LineaDetalle[] = [{ concepto: `Deslinde Resto Chaco — ${n} parcela${n > 1 ? 's' : ''}`, monto: n <= 1 ? total : 372713.67 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 372713.67 })
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
      const desglose: LineaDetalle[] = [{ concepto: `Mensura urbana GR — ${n} parcela${n > 1 ? 's' : ''}`, monto: n === 1 ? total : 777453.11 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 777453.11 })
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
      const desglose: LineaDetalle[] = [{ concepto: `Mensura urbana Resto Chaco — ${n} parcela${n > 1 ? 's' : ''}`, monto: n === 1 ? total : 583089.83 }]
      if (n > 1) desglose.push({ concepto: 'Incremento por parcelas adicionales', monto: total - 583089.83 })
      return { honorario: total, desglose }
    },
  },
  // ── VERIFICACIÓN PARCELARIA (NUEVO) ─────────────────────────────────────────
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
  // ── REPLANTEO (NUEVO) ────────────────────────────────────────────────────────
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
      return { honorario: total, desglose: [{ concepto: `Base fija K`, monto: 777453.11 }, { concepto: `${n} UF × valor unitario por tramo`, monto: total - 777453.11 }] }
    },
  },
  {
    id: 'ph_vertical_resto', label: 'PH Edificios Verticales — Resto Chaco',
    category: '3. Propiedad Horizontal',
    inputs: [{ key: 'uf', label: 'Unidades Funcionales (UF)', min: 1 }],
    calcular: p => {
      const n = p.uf ?? 0; const total = calcPH32(n)
      return { honorario: total, desglose: [{ concepto: `Base fija K`, monto: 583089.83 }, { concepto: `${n} UF × valor unitario por tramo`, monto: total - 583089.83 }] }
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
  // ── VERIFICACIÓN RURAL (NUEVO) ───────────────────────────────────────────────
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
  // ── REPLANTEO RURAL (NUEVO) ───────────────────────────────────────────────────
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
  // ── SUBDIVISIÓN S/MENSURA REGISTRADA (NUEVO) ─────────────────────────────────
  {
    id: 'subdivision_smr', label: 'Subdivisión según Mensura Registrada',
    category: '5. Subdivisión',
    inputs: [{ key: 'hectareas', label: 'Superficie total (Ha)', min: 0.01, step: 0.01 }, { key: 'parcelas_creadas', label: 'Parcelas creadas', min: 1 }],
    nota: 'Ya existe mensura registrada: NO se cobra mensura completa. Solo subdivisión y tareas adicionales.',
    calcular: p => {
      const ha = p.hectareas ?? 0; const pc = p.parcelas_creadas ?? 0
      let pct: number; let base: number
      if (ha <= 1)       { pct = 0.25; base = 929704.34  }
      else if (ha <= 5)  { pct = 0.22; base = 1004080.69 }
      else if (ha <= 10) { pct = 0.18; base = 1004080.69 }
      else if (ha <= 15) { pct = 0.15; base = 1084407.14 }
      else if (ha <= 20) { pct = 0.13; base = 1187425.82 }
      else if (ha <= 25) { pct = 0.11; base = 1288357.02 }
      else               { pct = 0.10; base = 1391425.58 }
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
    id: 'nivel_planialti', label: 'Nivelación — Planialtimétrico',
    category: '6. Nivelaciones',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = calcNivelacion61(p.hectareas ?? 0); return { honorario: total, desglose: [{ concepto: `Nivelación planialtimétrica — ${p.hectareas} ha`, monto: total }] } },
  },
  {
    id: 'nivel_perfil_long', label: 'Nivelación — Perfil Longitudinal',
    category: '6. Nivelaciones',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 588979.63; return { honorario: total, desglose: [{ concepto: `${p.km} km × $588.979,63/km`, monto: total }] } },
  },
  {
    id: 'nivel_pl_pt', label: 'Nivelación — PL + PT + Puntos Fijos c/500m',
    category: '6. Nivelaciones',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 530081.66; return { honorario: total, desglose: [{ concepto: `${p.km} km × $530.081,66/km`, monto: total }] } },
  },
  {
    id: 'nivel_curvas', label: 'Nivelación — Curvas de Nivel',
    category: '6. Nivelaciones',
    inputs: [{ key: 'hectareas', label: 'Superficie (Ha)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.hectareas ?? 0) * 147244.91; return { honorario: total, desglose: [{ concepto: `${p.hectareas} ha × $147.244,91/ha`, monto: total }] } },
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
    calcular: p => { const total = (p.puntos ?? 0) * 250316.34; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $250.316,34/pto`, monto: total }] } },
  },
  {
    id: 'gps_10km', label: 'Traslado GPS — Radio 10 km', category: '7. Drones y GPS', inputs: [{ key: 'puntos', label: 'Número de puntos', min: 1 }],
    calcular: p => { const total = (p.puntos ?? 0) * 353387.78; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $353.387,78/pto`, monto: total }] } },
  },
  {
    id: 'gps_30km', label: 'Traslado GPS — Radio 30 km', category: '7. Drones y GPS', inputs: [{ key: 'puntos', label: 'Número de puntos', min: 1 }],
    calcular: p => { const total = (p.puntos ?? 0) * 530081.66; return { honorario: total, desglose: [{ concepto: `${p.puntos} puntos GPS × $530.081,66/pto`, monto: total }] } },
  },
  // ── TASACIÓN ─────────────────────────────────────────────────────────────────
  {
    id: 'tasacion', label: 'Tasación de Inmueble', category: '9. Tasación',
    inputs: [{ key: 'valor', label: 'Valor de tasación ($)', min: 0, step: 1000, placeholder: 'Ingresá el valor en pesos' }],
    nota: 'Honorario mínimo: $88.338',
    calcular: p => {
      const valor = p.valor ?? 0; const total = calcTasacion(valor)
      const pct = valor <= 500000 ? 1.00 : valor <= 1e6 ? 0.75 : valor <= 5e6 ? 0.50 : valor <= 1e7 ? 0.35 : valor <= 1.5e7 ? 0.30 : 0.20
      return { honorario: total, desglose: [{ concepto: `${pct}% sobre valor tasado ${fmt(valor)}`, monto: total }] }
    },
  },
  // ── APERTURA DE RUMBO ─────────────────────────────────────────────────────────
  {
    id: 'apertura_rumbo', label: 'Apertura de Rumbo y Desmonte (ancho 2m)', category: '12. Otros',
    inputs: [{ key: 'km', label: 'Distancia (km)', min: 0.01, step: 0.01 }],
    calcular: p => { const total = (p.km ?? 0) * 839295.97; return { honorario: total, desglose: [{ concepto: `${p.km} km × $839.295,97/km`, monto: total }] } },
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
    return onSnapshot(q, snap => setPresupuestos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Presupuesto))))
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

  async function handleSave() {
    if (!canSave || !selectedTipo) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'presupuestos'), {
        userId, clienteNombre: clienteNombre.trim(),
        clienteDireccion: clienteDireccion.trim(),
        tipoTrabajoId: selectedTipo.id, tipoTrabajoLabel: selectedTipo.label,
        honorario, adicionales: totalAdicionales,
        aportesCpach, gastoAdmin: GASTO_MIN_ADMIN, totalFinal,
        createdAt: serverTimestamp(),
      })
      setClienteNombre(''); setClienteDireccion('')
      setTipoId(''); setParams({}); setAdicionales([])
    } catch (e: any) { setError('Error al guardar: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />Nuevo presupuesto
          </CardTitle>
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
            <Select value={tipoId} onValueChange={id => { setTipoId(id); setParams({}); setAdicionales([]); setMostrarPagos(false) }}>
              <SelectTrigger><SelectValue placeholder="Seleccioná el tipo de trabajo…" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <div key={cat}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40">{cat}</div>
                    {TIPOS.filter(t => t.category === cat).map(tipo => (
                      <SelectItem key={tipo.id} value={tipo.id} className="pl-4">{tipo.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
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
                      ⚠️ <strong>Recomendación:</strong> incluir cláusula de actualización inflacionaria. Los honorarios se actualizan trimestralmente según tabla CPACH.
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