import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText, Download, Plus, Trash2, ArrowRight, RotateCcw, Check,
  Calculator, AlertCircle, CheckCircle, RefreshCw, Compass
} from 'lucide-react'
import { TEMPLATE_EXPEDIENTE_UNIFICADO_B64, ROW_TEMPLATE_XML } from '@/lib/expedienteTemplate'
import {
  cap, metrosLetras, anguloLetras,
  superficieM2Letras, superficieHaFormato,
  rumboCorto, fechaALetras, horaALetras
} from '@/lib/agrimensura'
import {
  Lado, FilaCalculo, Resultado, Rumbo,
  calcularPlanilla, generarLadosIniciales,
  formatearLadosMemoria, formatearAngulosMemoria, formatearFilasPlanilla,
  calcularPuntosSvg
} from '@/lib/gauss'

// ─── DOCX ENGINE ──────────────────────────────────────────────────────────────
function escapeXml(str: any): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function makeParagraphXml(text: string): string {
  return `<w:p><w:pPr><w:ind w:right="49"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function generarExpedienteDocx(campos: Record<string, any>): Promise<Uint8Array> {
  const PizZip = (await import('pizzip')).default
  const Docxtemplater = (await import('docxtemplater')).default
  const data = base64ToUint8Array(TEMPLATE_EXPEDIENTE_UNIFICADO_B64)
  const zip = new PizZip(data)

  // 1. Table rows for Planilla de Coordenadas
  let rowsXml = ''
  const colKeys = ['desig', 'lado', 'ai_g', 'ai_m', 'ai_s', 'ac_g', 'ac_m', 'ac_s', 'dx', 'dy', 'dx_c', 'dy_c', 'x', 'y']
  if (campos.filas && campos.filas.length > 0) {
    rowsXml = campos.filas.map((f: any) => {
      let r = ROW_TEMPLATE_XML
      for (const k of colKeys) {
        const val = f[k] !== undefined && f[k] !== null ? String(f[k]) : '—'
        r = r.replaceAll(`{{${k}}}`, escapeXml(val))
      }
      return r
    }).join('')
  } else {
    let r = ROW_TEMPLATE_XML
    for (const k of colKeys) {
      r = r.replaceAll(`{{${k}}}`, '—')
    }
    rowsXml = r
  }

  // 2. Memoria descriptiva Lados and Angulos paragraphs
  const ladosXml = campos.lados && campos.lados.length > 0
    ? campos.lados.map((l: any) => makeParagraphXml(l.linea)).join('')
    : makeParagraphXml('—')

  const angulosXml = campos.angulos && campos.angulos.length > 0
    ? campos.angulos.map((a: any) => makeParagraphXml(a.linea)).join('')
    : makeParagraphXml('—')

  // 3. Inject rows, lados and angulos into document.xml
  let docXml = zip.files['word/document.xml'].asText()
    .replace('<!--TABLE_ROWS_PLACEHOLDER-->', rowsXml)
    .replace('<!--LADOS_PARAGRAPHS_PLACEHOLDER-->', ladosXml)
    .replace('<!--ANGULOS_PARAGRAPHS_PLACEHOLDER-->', angulosXml)

  zip.file('word/document.xml', docXml)

  // 4. Render all remaining text placeholders with Docxtemplater
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => ''
  })
  doc.render(campos)

  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
}

function descargar(bytes: Uint8Array, nombre: string): Promise<void> {
  return new Promise((resolve) => {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
      resolve()
    }, 1000)
  })
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type Comitente = {
  nombre: string
  dni: string
  telefono: string
  domicilio: string
}

type Form = {
  mes: string
  año: string
  objeto: string
  ubicacion: string
  departamento: string
  superficie_m2: string
  superficie_letras: string
  folio_matricula: string
  propiedad_municipal: string
  partida_inmobiliaria: string
  mensuras_relacionadas: string
  lindero_norte: string
  lindero_sur: string
  lindero_este: string
  lindero_oeste: string
  fecha: string
  hora: string
  fecha2: string
  hora2: string
  linderos_ausentes: string
  parcela: string
  rumbo_linea: string
}

const FORM_INICIAL: Form = {
  mes: '',
  año: new Date().getFullYear().toString(),
  objeto: 'Mensura Particular',
  ubicacion: '',
  departamento: 'Capital',
  superficie_m2: '',
  superficie_letras: '',
  folio_matricula: '…..',
  propiedad_municipal: 'No se encontró.',
  partida_inmobiliaria: '..',
  mensuras_relacionadas: '…',
  lindero_norte: '',
  lindero_sur: '',
  lindero_este: '',
  lindero_oeste: '',
  fecha: '',
  hora: '',
  fecha2: '',
  hora2: '',
  linderos_ausentes: '',
  parcela: '1',
  rumbo_linea: '',
}

const COMITENTE_VACIO: Comitente = { nombre: '', dni: '', telefono: '', domicilio: '' }

const MESES_LISTA = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const S = {
  errorBox: { background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991B1B', marginBottom: '12px' } as React.CSSProperties,
  section: { fontSize: '11px', fontWeight: '600' as const, color: 'var(--color-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginTop: '20px', marginBottom: '10px' },
  comiteCard: { border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px', padding: '14px', marginBottom: '10px', background: 'var(--color-background-secondary)' } as React.CSSProperties,
  comiteHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } as React.CSSProperties,
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export function ExpedienteTab() {
  const [form, setForm] = useState<Form>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_draft')
      if (saved) return { ...FORM_INICIAL, ...JSON.parse(saved) }
    } catch {}
    const mesActual = MESES_LISTA[new Date().getMonth()]
    return { ...FORM_INICIAL, mes: mesActual }
  })

  const [comitentes, setComitentes] = useState<Comitente[]>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_comitentes')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [{ ...COMITENTE_VACIO }]
  })

  // ─── ESTADO DEL POLÍGONO INTEGRADO (HASTA 20 LADOS) ──────────────────────────
  const [numLados, setNumLados] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_poligono')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.numLados && parsed.numLados >= 3 && parsed.numLados <= 20) return parsed.numLados
      }
    } catch {}
    return 4
  })

  const [formatoVertices, setFormatoVertices] = useState<'numeros' | 'letras'>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_poligono')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.formatoVertices) return parsed.formatoVertices
      }
    } catch {}
    return 'numeros'
  })

  const [lados, setLados] = useState<Lado[]>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_poligono')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed?.lados) && parsed.lados.length >= 3) return parsed.lados
      }
    } catch {}
    return generarLadosIniciales(4, 'numeros')
  })

  const [rumbo, setRumbo] = useState<Rumbo>(() => {
    try {
      const saved = localStorage.getItem('jobflow_expediente_poligono')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.rumbo) return parsed.rumbo
      }
    } catch {}
    return { desig: '1-2', q1: 'S', g: '', m: '', q2: 'E' }
  })

  const [calc, setCalc] = useState<Resultado | null>(null)

  const [datosTecnicos, setDatosTecnicos] = useState<{
    lados: Array<{ linea: string }>
    angulos: Array<{ linea: string }>
    filas: Array<any>
    perimetro: string
    error_x: string
    error_y: string
    error_total: string
  }>({
    lados: [],
    angulos: [],
    filas: [],
    perimetro: '0,00',
    error_x: '0,0000',
    error_y: '0,0000',
    error_total: '0,0000',
  })

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  // Guardado automático del borrador completo
  useEffect(() => {
    try {
      localStorage.setItem('jobflow_expediente_draft', JSON.stringify(form))
      localStorage.setItem('jobflow_expediente_comitentes', JSON.stringify(comitentes))
      localStorage.setItem('jobflow_expediente_poligono', JSON.stringify({
        numLados,
        formatoVertices,
        lados,
        rumbo,
      }))
    } catch {}
  }, [form, comitentes, numLados, formatoVertices, lados, rumbo])

  function setF(k: keyof Form, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function handleSuperficieChange(val: string) {
    const clean = val.replace(',', '.')
    setForm(p => {
      const num = parseFloat(clean)
      const letras = !isNaN(num) && num > 0 ? superficieM2Letras(num) : p.superficie_letras
      return { ...p, superficie_m2: val, superficie_letras: letras }
    })
  }

  function setComitente(i: number, k: keyof Comitente, v: string) {
    setComitentes(prev => prev.map((c, idx) => idx === i ? { ...c, [k]: v } : c))
  }

  function agregarComitente() {
    setComitentes(prev => [...prev, { ...COMITENTE_VACIO }])
  }

  function eliminarComitente(i: number) {
    if (comitentes.length === 1) return
    setComitentes(prev => prev.filter((_, idx) => idx !== i))
  }

  function formatearComitentes(): { comitente: string; dni: string; telefono: string; domicilio: string; propietario_label: string } {
    const validos = comitentes.filter(c => c.nombre.trim())
    const esPlural = validos.length > 1
    const propietario_label = esPlural ? 'PROPIETARIOS' : 'PROPIETARIO'

    if (validos.length === 0) {
      return { comitente: '', dni: '', telefono: '', domicilio: '', propietario_label: 'PROPIETARIO' }
    }
    if (validos.length === 1) {
      const c = validos[0]
      return { comitente: c.nombre.trim(), dni: c.dni.trim(), telefono: c.telefono.trim(), domicilio: c.domicilio.trim(), propietario_label }
    }
    return {
      comitente: validos.map(c => c.nombre.trim()).join(' y '),
      dni: validos.map(c => c.dni.trim()).filter(Boolean).join(' / '),
      telefono: validos.map(c => c.telefono.trim()).filter(Boolean).join(' / '),
      domicilio: validos.map(c => c.domicilio.trim()).filter(Boolean).join(' / '),
      propietario_label,
    }
  }

  // ─── CONTROL DE POLÍGONO (HASTA 20 LADOS) ───────────────────────────────────
  function cambiarNumLados(nuevoN: number) {
    const n = Math.max(3, Math.min(20, nuevoN))
    setNumLados(n)
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

    setLados(prev => {
      return Array.from({ length: n }, (_, i) => {
        let desig = ''
        if (formatoVertices === 'numeros') {
          desig = `${i + 1}-${((i + 1) % n) + 1}`
        } else {
          desig = `${letras[i % letras.length]}-${letras[(i + 1) % n]}`
        }

        if (prev[i]) {
          return { ...prev[i], desig }
        }
        return { desig, lado: '', ang_g: '', ang_m: '', ang_s: '0' }
      })
    })

    if (!rumbo.desig || rumbo.desig === '1-2' || rumbo.desig === 'A-B') {
      setRumbo(r => ({ ...r, desig: formatoVertices === 'numeros' ? '1-2' : 'A-B' }))
    }
  }

  function cambiarFormatoVertices(nuevoFormato: 'numeros' | 'letras') {
    setFormatoVertices(nuevoFormato)
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    setLados(prev => {
      const n = prev.length
      return prev.map((l, i) => {
        const desig = nuevoFormato === 'numeros'
          ? `${i + 1}-${((i + 1) % n) + 1}`
          : `${letras[i % letras.length]}-${letras[(i + 1) % n]}`
        return { ...l, desig }
      })
    })
    setRumbo(r => ({
      ...r,
      desig: nuevoFormato === 'numeros' ? '1-2' : 'A-B'
    }))
  }

  function updateLado(index: number, campo: keyof Lado, valor: string) {
    setLados(prev => prev.map((l, idx) => idx === index ? { ...l, [campo]: valor } : l))
  }

  function handleCalcularPoligono() {
    setError('')
    const conLado = lados.filter(l => parseFloat(l.lado.replace(',', '.')) > 0)
    if (conLado.length < 3) {
      setError('Debes ingresar al menos 3 lados con su longitud en metros.')
      return
    }

    const res = calcularPlanilla(lados)
    if (!res) {
      setError('Error en el cálculo. Verificá los lados y ángulos ingresados.')
      return
    }

    setCalc(res)

    const m2Str = res.superficie_m2.toFixed(2).replace('.', ',')
    const letrasStr = superficieM2Letras(res.superficie_m2)

    const rg = parseInt(rumbo.g) || 0
    const rm = parseInt(rumbo.m) || 0
    const rumboStr = rumbo.desig && rumbo.q1 && rumbo.q2 && rumbo.g
      ? rumboCorto(rumbo.desig, rumbo.q1, rg, rm, rumbo.q2)
      : form.rumbo_linea

    const ladosFmt = formatearLadosMemoria(res.filas)
    const angulosFmt = formatearAngulosMemoria(res.filas)
    const filasFmt = formatearFilasPlanilla(res.filas)

    setDatosTecnicos({
      lados: ladosFmt,
      angulos: angulosFmt,
      filas: filasFmt,
      perimetro: res.perimetro.toFixed(2).replace('.', ','),
      error_x: res.error_x.toFixed(4).replace('.', ','),
      error_y: res.error_y.toFixed(4).replace('.', ','),
      error_total: res.error_total.toFixed(4).replace('.', ','),
    })

    setForm(prev => ({
      ...prev,
      superficie_m2: m2Str,
      superficie_letras: letrasStr,
      rumbo_linea: rumboStr || prev.rumbo_linea,
    }))

    // Guardar para que la pestaña Superficie también lo tenga disponible
    try {
      localStorage.setItem('jobflow_superficie_latest', JSON.stringify({
        calc: res,
        campos: {
          propietario: comitentes[0]?.nombre || '',
          ubicacion: form.ubicacion,
          profesional: 'Augusto Nahuel Valentinotti',
          parcela: form.parcela
        },
        rumbo,
        timestamp: Date.now()
      }))
    } catch {}

    setMensajeExito(`¡Polígono de ${lados.length} lados calculado con éxito! Superficie: ${m2Str} m² (${res.superficie_ha.toFixed(4)} Ha.)`)
    setTimeout(() => setMensajeExito(''), 4500)
  }

  // Helper para copiar linderos a ausentes
  function sincronizarLinderosAusentes(incluirNorte = false) {
    const lineas: string[] = []
    if (incluirNorte && form.lindero_norte.trim()) lineas.push(`NORTE: ${form.lindero_norte.trim()}`)
    if (form.lindero_sur.trim()) lineas.push(`SUR: ${form.lindero_sur.trim()}`)
    if (form.lindero_este.trim()) lineas.push(`ESTE: ${form.lindero_este.trim()}`)
    if (form.lindero_oeste.trim()) lineas.push(`OESTE: ${form.lindero_oeste.trim()}`)

    setF('linderos_ausentes', lineas.join('\n'))
  }

  async function handleGenerar() {
    if (!comitentes[0].nombre.trim()) { setError('El nombre del primer comitente es obligatorio.'); return }
    if (!form.ubicacion.trim()) { setError('El campo Ubicación es obligatorio.'); return }
    setError('')
    setGenerating(true)

    try {
      const { comitente, dni, telefono, domicilio, propietario_label } = formatearComitentes()

      // Formato prolijo para el encabezado de ubicación
      const rawUbicacion = (form.ubicacion || '').trim().replace(/\.+$/, '')
      const depto = (form.departamento || '').trim().replace(/\.+$/, '')
      let ubicacionHeader = rawUbicacion
      if (depto && !ubicacionHeader.toLowerCase().includes(depto.toLowerCase())) {
        ubicacionHeader += `, ${depto}`
      }
      if (!ubicacionHeader.toLowerCase().includes('corrientes')) {
        ubicacionHeader += ', Corrientes'
      }

      // Rumbo de la línea dinámico
      let rumboLinea = form.rumbo_linea
      if (!rumboLinea && rumbo.desig && rumbo.q1 && rumbo.q2 && rumbo.g) {
        rumboLinea = rumboCorto(rumbo.desig, rumbo.q1, parseInt(rumbo.g) || 0, parseInt(rumbo.m) || 0, rumbo.q2)
      }

      // Extensión textual de superficie
      let supExtension = '........................ según Mensura.'
      let supLinea = '........................ según Mensura.'
      if (form.superficie_m2.trim()) {
        const m2Fmt = form.superficie_m2.trim()
        const letrasFmt = form.superficie_letras.trim() || superficieM2Letras(parseFloat(m2Fmt.replace(',', '.')))
        supExtension = `(${m2Fmt} m2 s/M.) ${letrasFmt} según Mensura.`
        supLinea = `${m2Fmt} m2 s/M. - ${letrasFmt} según Mensura.`
      }

      const linderosAusentesTxt = form.linderos_ausentes.trim()
        ? form.linderos_ausentes.trim()
        : [
            form.lindero_sur ? `SUR: ${form.lindero_sur}` : '',
            form.lindero_este ? `ESTE: ${form.lindero_este}` : '',
            form.lindero_oeste ? `OESTE: ${form.lindero_oeste}` : '',
          ].filter(Boolean).join('\n')

      const camposDocx = {
        propietario_label,
        ubicacion_header: ubicacionHeader,
        mes: form.mes || '……………………',
        año: form.año || new Date().getFullYear().toString(),
        objeto: form.objeto || 'Mensura Particular',
        ubicacion: form.ubicacion,
        departamento: form.departamento || 'Capital',
        comitente,
        dni,
        telefono,
        domicilio,
        superficie_extension_linea: supExtension,
        superficie_m2: form.superficie_m2 || '—',
        superficie_letras: form.superficie_letras || '—',
        superficie_linea: supLinea,
        lindero_norte: form.lindero_norte || '………………………………',
        lindero_sur: form.lindero_sur || '………………………………',
        lindero_este: form.lindero_este || '………………………………',
        lindero_oeste: form.lindero_oeste || '………………………………',
        folio_matricula: form.folio_matricula || '….. .',
        propiedad_municipal: form.propiedad_municipal || 'No se encontró.',
        partida_inmobiliaria: form.partida_inmobiliaria || '..',
        mensuras_relacionadas: form.mensuras_relacionadas || '…',
        fecha: form.fecha,
        hora: form.hora,
        fecha_texto: fechaALetras(form.fecha),
        hora_texto: horaALetras(form.hora),
        fecha2: form.fecha2,
        hora2: form.hora2,
        fecha2_texto: fechaALetras(form.fecha2),
        hora2_texto: horaALetras(form.hora2),
        rumbo_linea: rumboLinea || form.rumbo_linea || '—',
        lados: datosTecnicos.lados,
        angulos: datosTecnicos.angulos,
        parcela: form.parcela || '1',
        perimetro: datosTecnicos.perimetro,
        error_x: datosTecnicos.error_x,
        error_y: datosTecnicos.error_y,
        error_total: datosTecnicos.error_total,
        filas: datosTecnicos.filas,
        linderos_ausentes: linderosAusentesTxt,
      }

      const bytes = await generarExpedienteDocx(camposDocx)
      const nombreBase = comitente.replace(/\s+/g, '_').substring(0, 40)
      await descargar(bytes, `${nombreBase}_Expediente_Completo.docx`)
      setMensajeExito('¡Expediente único generado y descargado con éxito!')
      setTimeout(() => setMensajeExito(''), 4000)
    } catch (e: any) {
      setError('Error al generar: ' + (e.message ?? String(e)))
    } finally {
      setGenerating(false)
    }
  }

  function handleLimpiar() {
    if (!window.confirm('¿Deseas reiniciar todos los campos del expediente y polígono?')) return
    localStorage.removeItem('jobflow_expediente_draft')
    localStorage.removeItem('jobflow_expediente_comitentes')
    localStorage.removeItem('jobflow_expediente_poligono')
    setForm(FORM_INICIAL)
    setComitentes([{ ...COMITENTE_VACIO }])
    setNumLados(4)
    setFormatoVertices('numeros')
    setLados(generarLadosIniciales(4, 'numeros'))
    setRumbo({ desig: '1-2', q1: 'S', g: '', m: '', q2: 'E' })
    setCalc(null)
    setDatosTecnicos({
      lados: [],
      angulos: [],
      filas: [],
      perimetro: '0,00',
      error_x: '0,0000',
      error_y: '0,0000',
      error_total: '0,0000',
    })
    setError('')
  }

  const rumboPreview = rumbo.desig && rumbo.q1 && rumbo.g && rumbo.q2
    ? rumboCorto(rumbo.desig, rumbo.q1, parseInt(rumbo.g) || 0, parseInt(rumbo.m) || 0, rumbo.q2)
    : null

  const cierreOk = calc ? calc.error_total < 0.05 : false
  const svgData = calc ? calcularPuntosSvg(calc.filas, 240) : null

  return (
    <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText style={{ width: '20px', height: '20px', color: '#0F6E56' }} />
              Expediente de Mensura Integral
            </CardTitle>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Crea tu expediente completo en un <strong>único documento Word (.docx)</strong> con Nota de Encabezamiento, Geometría (hasta 20 lados), Ubicación, Actas, Memoria y Planilla de Coordenadas sincronizada.
            </p>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {error && <div style={S.errorBox}>{error}</div>}
            {mensajeExito && (
              <div style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#0F6E56', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check style={{ width: '16px', height: '16px' }} />
                {mensajeExito}
              </div>
            )}

            {/* 1. DATOS GENERALES */}
            <div>
              <div style={S.section}>1. Datos Generales & Nota de Encabezamiento</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <F label="Mes de presentación">
                  <select
                    value={form.mes}
                    onChange={e => setF('mes', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
                  >
                    <option value="">Seleccioná…</option>
                    {MESES_LISTA.map(m => <option key={m} value={m}>{cap(m)}</option>)}
                  </select>
                </F>
                <F label="Año">
                  <Input value={form.año} onChange={e => setF('año', e.target.value)} placeholder="2026" />
                </F>
                <F label="Objeto de mensura">
                  <Input value={form.objeto} onChange={e => setF('objeto', e.target.value)} placeholder="Mensura Particular y División" />
                </F>
              </div>
            </div>

            {/* 2. INMUEBLE & CATASTRO */}
            <div>
              <div style={S.section}>2. Ubicación & Catastro</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <F label="Ubicación del Inmueble *">
                    <Input value={form.ubicacion} onChange={e => setF('ubicacion', e.target.value)} placeholder="Calle Las Heras 450" />
                  </F>
                </div>
                <F label="Departamento">
                  <Input value={form.departamento} onChange={e => setF('departamento', e.target.value)} placeholder="Capital" />
                </F>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                <F label="Parcela Nº">
                  <Input value={form.parcela} onChange={e => setF('parcela', e.target.value)} placeholder="1" />
                </F>
                <F label="Folio Real Matrícula">
                  <Input value={form.folio_matricula} onChange={e => setF('folio_matricula', e.target.value)} placeholder="12.345" />
                </F>
                <F label="Partida Inmobiliaria">
                  <Input value={form.partida_inmobiliaria} onChange={e => setF('partida_inmobiliaria', e.target.value)} placeholder="A1-43162-1" />
                </F>
                <F label="Mensuras Relacionadas">
                  <Input value={form.mensuras_relacionadas} onChange={e => setF('mensuras_relacionadas', e.target.value)} placeholder="Plano N° 12.340-C" />
                </F>
              </div>
            </div>

            {/* 3. GEOMETRÍA, POLÍGONO Y PLANILLA DE COORDENADAS (HASTA 20 LADOS) */}
            <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calculator style={{ width: '18px', height: '18px', color: '#0F6E56' }} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    3. Geometría, Polígono y Planilla de Coordenadas
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Vértices:</span>
                  <div style={{ display: 'inline-flex', background: 'var(--color-background-primary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '6px', padding: '2px' }}>
                    <button
                      type="button"
                      onClick={() => cambiarFormatoVertices('numeros')}
                      style={{
                        padding: '3px 8px', fontSize: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: formatoVertices === 'numeros' ? '#0F6E56' : 'transparent',
                        color: formatoVertices === 'numeros' ? 'white' : 'var(--color-text-secondary)',
                      }}
                    >
                      1-2, 2-3…
                    </button>
                    <button
                      type="button"
                      onClick={() => cambiarFormatoVertices('letras')}
                      style={{
                        padding: '3px 8px', fontSize: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        background: formatoVertices === 'letras' ? '#0F6E56' : 'transparent',
                        color: formatoVertices === 'letras' ? 'white' : 'var(--color-text-secondary)',
                      }}
                    >
                      A-B, B-C…
                    </button>
                  </div>
                </div>
              </div>

              {/* Selector de cantidad de lados */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', background: 'var(--color-background-primary)', padding: '10px 14px', borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Label style={{ fontSize: '13px', fontWeight: '500' }}>Cantidad de lados (3 a 20):</Label>
                  <select
                    value={numLados}
                    onChange={e => cambiarNumLados(parseInt(e.target.value))}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', fontWeight: 'bold', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)' }}
                  >
                    {Array.from({ length: 18 }, (_, i) => i + 3).map(n => (
                      <option key={n} value={n}>{n} lados</option>
                    ))}
                  </select>
                </div>

                {/* Accesos rápidos de lados */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginRight: '4px' }}>Rápido:</span>
                  {[3, 4, 5, 6, 8, 10, 12, 16, 20].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => cambiarNumLados(n)}
                      style={{
                        padding: '3px 7px', fontSize: '11px', borderRadius: '4px',
                        border: '1px solid var(--color-border-tertiary)',
                        background: numLados === n ? '#0F6E5615' : 'transparent',
                        color: numLados === n ? '#0F6E56' : 'var(--color-text-secondary)',
                        fontWeight: numLados === n ? '600' : 'normal',
                        cursor: 'pointer'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rumbo inicial */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Compass style={{ width: '14px', height: '14px', color: '#0F6E56' }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Rumbo Inicial de Referencia</span>
                </div>
                <div className="overflow-x-auto hide-scrollbar w-full pb-1">
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 70px 80px 70px 70px', gap: '8px', alignItems: 'flex-end', minWidth: '400px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Label style={{ fontSize: '11px' }}>Designación</Label>
                      <Input value={rumbo.desig} onChange={e => setRumbo(p => ({ ...p, desig: e.target.value }))} placeholder="1-2" style={{ fontSize: '12px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Label style={{ fontSize: '11px' }}>Cuad. 1</Label>
                      <Select value={rumbo.q1} onValueChange={v => setRumbo(p => ({ ...p, q1: v }))}>
                        <SelectTrigger style={{ fontSize: '12px', height: '36px' }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="N">Norte</SelectItem>
                          <SelectItem value="S">Sur</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Label style={{ fontSize: '11px' }}>Grados °</Label>
                      <Input type="number" value={rumbo.g} onChange={e => setRumbo(p => ({ ...p, g: e.target.value }))} placeholder="83" min={0} max={90} style={{ fontSize: '12px', textAlign: 'right' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Label style={{ fontSize: '11px' }}>Minutos '</Label>
                      <Input type="number" value={rumbo.m} onChange={e => setRumbo(p => ({ ...p, m: e.target.value }))} placeholder="16" min={0} max={59} style={{ fontSize: '12px', textAlign: 'right' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Label style={{ fontSize: '11px' }}>Cuad. 2</Label>
                      <Select value={rumbo.q2} onValueChange={v => setRumbo(p => ({ ...p, q2: v }))}>
                        <SelectTrigger style={{ fontSize: '12px', height: '36px' }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="E">Este</SelectItem>
                          <SelectItem value="O">Oeste</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {rumboPreview && (
                  <div style={{ background: '#E1F5EE', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#0F6E56', marginTop: '8px' }}>
                    {rumboPreview}
                  </div>
                )}
              </div>

              {/* Tabla interactiva de lados y ángulos */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    Lados y Ángulos Interiores ({lados.length} vértices)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    ℹ️ Vértice 1 define el acimut inicial
                  </span>
                </div>

                <div className="overflow-x-auto hide-scrollbar w-full pb-2">
                  <div style={{ minWidth: '420px', maxHeight: lados.length > 8 ? '360px' : 'auto', overflowY: lados.length > 8 ? 'auto' : 'visible', paddingRight: lados.length > 8 ? '4px' : '0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 95px 70px 65px 65px', gap: '6px', marginBottom: '6px', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2, paddingBottom: '4px' }}>
                      {['Designación', 'Lado (m)', 'Ángulo °', 'min \'', 'seg "'].map(h => (
                        <div key={h} style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-secondary)', textAlign: 'center' }}>{h}</div>
                      ))}
                    </div>
                    {lados.map((l, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 95px 70px 65px 65px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                        <Input
                          value={l.desig}
                          onChange={e => updateLado(i, 'desig', e.target.value)}
                          style={{ fontSize: '12px', textAlign: 'center', fontWeight: '600', height: '34px' }}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={l.lado}
                          onChange={e => updateLado(i, 'lado', e.target.value)}
                          placeholder="0.00"
                          style={{ fontSize: '12px', textAlign: 'right', height: '34px' }}
                        />
                        <Input
                          type="number"
                          value={l.ang_g}
                          onChange={e => updateLado(i, 'ang_g', e.target.value)}
                          placeholder="90"
                          min={0}
                          max={359}
                          style={{ fontSize: '12px', textAlign: 'right', height: '34px' }}
                        />
                        <Input
                          type="number"
                          value={l.ang_m}
                          onChange={e => updateLado(i, 'ang_m', e.target.value)}
                          placeholder="0"
                          min={0}
                          max={59}
                          style={{ fontSize: '12px', textAlign: 'right', height: '34px' }}
                        />
                        <Input
                          type="number"
                          value={l.ang_s}
                          onChange={e => updateLado(i, 'ang_s', e.target.value)}
                          placeholder="0"
                          min={0}
                          max={59}
                          style={{ fontSize: '12px', textAlign: 'right', height: '34px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Botón calcular */}
                <Button
                  onClick={handleCalcularPoligono}
                  style={{ background: '#0F6E56', color: 'white', width: '100%', marginTop: '6px' }}
                >
                  <Calculator style={{ width: '15px', height: '15px', marginRight: '6px' }} />
                  Calcular Polígono y Actualizar Expediente
                </Button>
              </div>

              {/* RESULTADOS DEL CÁLCULO GAUSS & PREVIEW SVG */}
              {calc && (
                <div style={{ background: 'var(--color-background-primary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '10px', padding: '16px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {cierreOk ? (
                        <>
                          <CheckCircle style={{ width: '16px', height: '16px', color: '#1D9E75' }} />
                          <span style={{ fontSize: '13px', color: '#1D9E75', fontWeight: '600' }}>Cierre geométrico aceptable</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle style={{ width: '16px', height: '16px', color: '#D85A30' }} />
                          <span style={{ fontSize: '13px', color: '#D85A30', fontWeight: '600' }}>Error de cierre elevado — verificar mediciones</span>
                        </>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      Error total: <strong>{calc.error_total.toFixed(4)} m</strong> (Ex: {calc.error_x.toFixed(4)}, Ey: {calc.error_y.toFixed(4)})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* Superficie y Métricas */}
                    <div className="md:col-span-7 flex flex-col gap-2">
                      <div style={{ background: '#E1F5EE', borderRadius: '8px', padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#0F6E56', fontWeight: '600', textTransform: 'uppercase' }}>Superficie Resultante</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#0F6E56', marginTop: '2px' }}>
                          {calc.superficie_m2.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
                        </div>
                        <div style={{ fontSize: '13px', color: '#0F6E56', fontWeight: '500' }}>
                          {superficieHaFormato(calc.superficie_m2)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#0F6E56', marginTop: '4px', fontStyle: 'italic' }}>
                          {superficieM2Letras(calc.superficie_m2)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Perímetro total:</span>
                        <strong>{calc.perimetro.toFixed(2).replace('.', ',')} m</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background-secondary)', borderRadius: '6px', fontSize: '12px' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Vértices calculados:</span>
                        <strong>{calc.filas.length} tramos</strong>
                      </div>
                    </div>

                    {/* Vista Gráfica SVG */}
                    <div className="md:col-span-5 flex flex-col items-center justify-center p-2 bg-[var(--color-background-secondary)] rounded-lg border border-[var(--color-border-tertiary)]">
                      <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Geometría del Lote
                      </div>
                      {svgData && (
                        <svg width={svgData.boxSize} height={svgData.boxSize} viewBox={`0 0 ${svgData.boxSize} ${svgData.boxSize}`} className="max-w-full h-auto">
                          {/* Polígono relleno */}
                          <polygon
                            points={svgData.pointsStr}
                            fill="#0F6E5615"
                            stroke="#0F6E56"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          {/* Vértices */}
                          {svgData.projected.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#0F6E56" stroke="#FFFFFF" strokeWidth="1" />
                          ))}
                          {/* Etiquetas de vértices */}
                          {svgData.labels.map((l, i) => (
                            <text
                              key={i}
                              x={l.x}
                              y={l.y}
                              fontSize="10"
                              fontWeight="600"
                              fill="var(--color-text-primary)"
                              textAnchor="middle"
                            >
                              {l.name}
                            </text>
                          ))}
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. LINDEROS DINÁMICOS */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>4. Límites y Linderos del Inmueble</span>
                <span style={{ fontSize: '11px', textTransform: 'none', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>
                  Impacta automáticamente en Ubicación, Acta de Mensura y Ausencia
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <F label="Límite NORTE">
                  <textarea
                    value={form.lindero_norte}
                    onChange={e => setF('lindero_norte', e.target.value)}
                    placeholder="Calle Publica Mariano Moreno."
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
                  />
                </F>
                <F label="Límite SUR">
                  <textarea
                    value={form.lindero_sur}
                    onChange={e => setF('lindero_sur', e.target.value)}
                    placeholder="A1-43162-1: Llovet Rafael."
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
                  />
                </F>
                <F label="Límite ESTE">
                  <textarea
                    value={form.lindero_este}
                    onChange={e => setF('lindero_este', e.target.value)}
                    placeholder="A1-3370-1: Suc. Espinoza Pedro Pascual."
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
                  />
                </F>
                <F label="Límite OESTE (soporta múltiples líneas)">
                  <textarea
                    value={form.lindero_oeste}
                    onChange={e => setF('lindero_oeste', e.target.value)}
                    placeholder="A1-40614-1: Espinoza Juan Ramon.&#10;A1-3369-1: Sosa Delfor Osvaldo.&#10;A1-3383-1: PH: Conal S.A."
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
                  />
                </F>
              </div>
            </div>

            {/* 5. COMITENTES */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>5. Comitentes</span>
                <button
                  type="button"
                  onClick={agregarComitente}
                  style={{ background: '#0F6E56', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus style={{ width: '11px', height: '11px' }} />
                  Agregar comitente
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {comitentes.map((c, i) => (
                  <div key={i} style={S.comiteCard}>
                    <div style={S.comiteHeader}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                        Comitente {comitentes.length > 1 ? i + 1 : ''}
                      </span>
                      {comitentes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarComitente(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        >
                          <Trash2 style={{ width: '13px', height: '13px' }} />
                          Eliminar
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <F label={i === 0 ? 'Nombre y apellido *' : 'Nombre y apellido'}>
                        <Input value={c.nombre} onChange={e => setComitente(i, 'nombre', e.target.value)} placeholder="García Juan Carlos" />
                      </F>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <F label="DNI">
                          <Input value={c.dni} onChange={e => setComitente(i, 'dni', e.target.value)} placeholder="32.456.789" />
                        </F>
                        <F label="Teléfono">
                          <Input value={c.telefono} onChange={e => setComitente(i, 'telefono', e.target.value)} placeholder="3794112233" />
                        </F>
                      </div>
                      <F label="Domicilio">
                        <Input value={c.domicilio} onChange={e => setComitente(i, 'domicilio', e.target.value)} placeholder="San Martín 120" />
                      </F>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 6. ACTAS Y NOTIFICACIÓN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div style={S.section}>6. Acta de Mensura</div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Fecha (dd/mm/aaaa)">
                    <Input value={form.fecha} onChange={e => setF('fecha', e.target.value)} placeholder="01/12/2026" />
                  </F>
                  <F label="Hora (hh:mm)">
                    <Input value={form.hora} onChange={e => setF('hora', e.target.value)} placeholder="16:00" />
                  </F>
                </div>
              </div>

              <div>
                <div style={S.section}>Acta de Ausencia de Linderos</div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Fecha (dd/mm/aaaa)">
                    <Input value={form.fecha2} onChange={e => setF('fecha2', e.target.value)} placeholder="05/12/2026" />
                  </F>
                  <F label="Hora (hh:mm)">
                    <Input value={form.hora2} onChange={e => setF('hora2', e.target.value)} placeholder="09:30" />
                  </F>
                </div>
              </div>
            </div>

            {/* 7. LINDEROS NO NOTIFICADOS */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Linderos no notificados (Acta de Ausencia)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => sincronizarLinderosAusentes(false)}
                    style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  >
                    Copiar Sur, Este, Oeste
                  </button>
                  <button
                    type="button"
                    onClick={() => sincronizarLinderosAusentes(true)}
                    style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  >
                    Copiar Todos
                  </button>
                </div>
              </div>
              <textarea
                value={form.linderos_ausentes}
                onChange={e => setF('linderos_ausentes', e.target.value)}
                placeholder="SUR: A1-43162-1: Llovet Rafael.&#10;ESTE: A1-3370-1: Suc. Espinoza Pedro Pascual.&#10;OESTE: A1-40614-1: Espinoza Juan Ramon..."
                rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-tertiary)', fontSize: '13px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Indica aquí los linderos que no pudieron ser notificados. Los comitentes no son incluidos por ser los propietarios del inmueble.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PANEL LATERAL DE GENERACIÓN */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <Card>
          <CardHeader style={{ padding: '16px' }}>
            <CardTitle style={{ fontSize: '15px' }}>Documento Unificado</CardTitle>
            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Se compilarán todas las piezas en un solo archivo Word (.docx).
            </p>
          </CardHeader>
          <CardContent style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Lista de Secciones Incluidas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { title: 'Nota de Encabezamiento', sub: 'Pág 1: Solicitud formal a Catastro' },
                { title: 'Ubicación, Extensión y Límites', sub: 'Pág 2: Datos catastrales y linderos' },
                { title: 'Acta de Mensura', sub: 'Formalidad técnica y testigos' },
                { title: 'Memoria de las Operaciones', sub: datosTecnicos.lados.length > 0 ? `${datosTecnicos.lados.length} lados en letras` : 'Rumbo y lados calculados' },
                { title: 'Planilla de Coordenadas', sub: datosTecnicos.filas.length > 0 ? `${datosTecnicos.filas.length} filas calculadas` : 'Tabla dinámica' },
                { title: 'Acta de Ausencia de Linderos', sub: 'Notificaciones y constancias' },
              ].map((s, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F6E5615', color: '#0F6E56', width: '28px', height: '28px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                    {idx + 1}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600' }}>{s.title}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{s.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview de conversiones */}
            {(form.fecha || form.hora || form.fecha2 || form.hora2 || form.superficie_m2) && (
              <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0F6E56', marginBottom: '2px' }}>Traducción a Letras</div>
                {form.superficie_m2 && <span>📐 Sup: <strong>{form.superficie_letras || superficieM2Letras(parseFloat(form.superficie_m2))}</strong></span>}
                {form.fecha && <span>📅 Mensura: <strong>{fechaALetras(form.fecha)}</strong></span>}
                {form.hora && <span>🕐 Hora Mensura: <strong>{horaALetras(form.hora)}</strong></span>}
                {form.fecha2 && <span>📅 Ausencia: <strong>{fechaALetras(form.fecha2)}</strong></span>}
                {form.hora2 && <span>🕐 Hora Ausencia: <strong>{horaALetras(form.hora2)}</strong></span>}
              </div>
            )}

            {/* BOTONES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <Button onClick={handleGenerar} disabled={generating} style={{ background: '#0F6E56', color: 'white', width: '100%' }}>
                <Download style={{ width: '15px', height: '15px', marginRight: '6px' }} />
                {generating ? 'Compilando Expediente…' : 'Descargar Expediente Completo (.docx)'}
              </Button>
              <Button variant="outline" onClick={handleLimpiar} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RotateCcw style={{ width: '13px', height: '13px' }} />
                Limpiar formulario
              </Button>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: '1.4' }}>
              Todos los datos, linderos y tablas se exportarán dentro de un único archivo Word (.docx) perfectamente sincronizado.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Label style={{ fontSize: '13px' }}>{label}</Label>
      {children}
    </div>
  )
}
