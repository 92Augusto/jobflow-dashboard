import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Download, Plus, Trash2, Sparkles, ArrowRight, RotateCcw, Check } from 'lucide-react'
import { TEMPLATE_EXPEDIENTE_UNIFICADO_B64 } from '@/lib/expedienteTemplate'
import {
  cap, metrosLetras, anguloLetras,
  superficieM2Letras, superficieHaFormato,
  rumboCorto, fechaALetras, horaALetras
} from '@/lib/agrimensura'

// ─── DOCX ENGINE ──────────────────────────────────────────────────────────────
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

  const [superficieImportada, setSuperficieImportada] = useState<{
    calc: any
    campos: any
    rumbo: any
    timestamp: number
  } | null>(null)

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

  // Check for recent calculation in SuperficieTab
  useEffect(() => {
    try {
      const raw = localStorage.getItem('jobflow_superficie_latest')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.calc) {
          setSuperficieImportada(parsed)
        }
      }
    } catch {}
  }, [])

  // Auto-save draft
  useEffect(() => {
    try {
      localStorage.setItem('jobflow_expediente_draft', JSON.stringify(form))
      localStorage.setItem('jobflow_expediente_comitentes', JSON.stringify(comitentes))
    } catch {}
  }, [form, comitentes])

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

  function formatearComitentes(): { comitente: string; dni: string; telefono: string; domicilio: string } {
    if (comitentes.length === 1) {
      const c = comitentes[0]
      return { comitente: c.nombre, dni: c.dni, telefono: c.telefono, domicilio: c.domicilio }
    }
    return {
      comitente: comitentes.map(c => c.nombre).filter(Boolean).join(' y '),
      dni: comitentes.map(c => c.dni).filter(Boolean).join(' / '),
      telefono: comitentes.map(c => c.telefono).filter(Boolean).join(' / '),
      domicilio: comitentes.map(c => c.domicilio).filter(Boolean).join(' / '),
    }
  }

  // Import calculation from SuperficieTab
  function importarCalculoSuperficie() {
    if (!superficieImportada?.calc) return
    const { calc, campos, rumbo } = superficieImportada

    const supNum = calc.superficie_m2 || 0
    const m2Str = supNum.toFixed(2).replace('.', ',')
    const letrasStr = superficieM2Letras(supNum)

    // Build lados format
    const ladosFormateados = (calc.filas || [])
      .filter((f: any) => f.lado > 0)
      .map((f: any) => ({
        linea: `${f.desig}: ${f.lado.toFixed(2).replace('.', ',')} m – ${metrosLetras(f.lado)}.`
      }))

    // Build angulos format
    const angulosFormateados = (calc.filas || [])
      .filter((f: any) => f.lado > 0)
      .map((f: any) => {
        const vertice = f.desig.split('-')[0] || f.desig
        const angFmt = `${f.ai_g}°${String(f.ai_m).padStart(2, '0')}'`
        return { linea: `${vertice}: ${angFmt} – ${anguloLetras(f.ai_g, f.ai_m)}.` }
      })

    // Build filas for coordinates table
    const r = (v: number | string, dec = 2) => typeof v === 'number' ? v.toFixed(dec).replace('.', ',') : (v || '0')
    const filasTabla = (calc.filas || []).map((f: any) => ({
      desig: f.desig,
      lado: r(f.lado),
      ai_g: String(f.ai_g), ai_m: String(f.ai_m), ai_s: String(f.ai_s),
      ac_g: String(f.ac_g), ac_m: String(f.ac_m), ac_s: String(f.ac_s),
      dx: r(f.dx), dy: r(f.dy),
      dx_c: r(f.dx_c), dy_c: r(f.dy_c),
      x: r(f.x), y: r(f.y),
    }))

    const rg = parseInt(rumbo?.g) || 0
    const rm = parseInt(rumbo?.m) || 0
    const rumboStr = rumbo?.desig && rumbo?.q1 && rumbo?.q2
      ? rumboCorto(rumbo.desig, rumbo.q1, rg, rm, rumbo.q2)
      : form.rumbo_linea

    setDatosTecnicos({
      lados: ladosFormateados,
      angulos: angulosFormateados,
      filas: filasTabla,
      perimetro: (calc.perimetro || 0).toFixed(2).replace('.', ','),
      error_x: (calc.error_x || 0).toFixed(4).replace('.', ','),
      error_y: (calc.error_y || 0).toFixed(4).replace('.', ','),
      error_total: (calc.error_total || 0).toFixed(4).replace('.', ','),
    })

    setForm(prev => ({
      ...prev,
      superficie_m2: m2Str,
      superficie_letras: letrasStr,
      parcela: campos?.parcela || prev.parcela,
      ubicacion: prev.ubicacion || campos?.ubicacion || '',
      rumbo_linea: rumboStr,
    }))

    if (campos?.propietario && !comitentes[0]?.nombre) {
      setComitentes([{ ...comitentes[0], nombre: campos.propietario }])
    }

    setMensajeExito(`¡Se importaron ${ladosFormateados.length} lados y ${m2Str} m² desde Superficie!`)
    setTimeout(() => setMensajeExito(''), 4000)
  }

  // Helper to copy linderos to absent linderos
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
      const { comitente, dni, telefono, domicilio } = formatearComitentes()

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
        propiedad_municipal: form.propiedad_municipal || 'No se encontro.',
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
        rumbo_linea: form.rumbo_linea || '—',
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
    if (!window.confirm('¿Deseas reiniciar todos los campos del expediente?')) return
    localStorage.removeItem('jobflow_expediente_draft')
    localStorage.removeItem('jobflow_expediente_comitentes')
    setForm(FORM_INICIAL)
    setComitentes([{ ...COMITENTE_VACIO }])
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
              Crea tu expediente completo en un <strong>único documento Word (.docx)</strong> con Nota de Encabezamiento, Ubicación y Límites, Actas, Memoria y Planilla sincronizada.
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

            {/* BANNER IMPORTAR DE SUPERFICIE */}
            {superficieImportada && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: '#DCFCE7', padding: '8px', borderRadius: '8px', color: '#0F6E56' }}>
                    <Sparkles style={{ width: '18px', height: '18px' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>
                      Cálculo de Superficie disponible
                    </div>
                    <div style={{ fontSize: '12px', color: '#15803D' }}>
                      {superficieHaFormato(superficieImportada.calc.superficie_m2)} ({superficieImportada.calc.superficie_m2.toFixed(2)} m²) con {superficieImportada.calc.filas?.length || 0} lados.
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={importarCalculoSuperficie} style={{ background: '#0F6E56', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowRight style={{ width: '14px', height: '14px' }} />
                  Importar al Expediente
                </Button>
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
              <div style={S.section}>2. Ubicación, Catastro & Extensión</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <F label="Ubicación del Inmueble *">
                  <Input value={form.ubicacion} onChange={e => setF('ubicacion', e.target.value)} placeholder="Calle Las Heras 450" />
                </F>
                <F label="Departamento">
                  <Input value={form.departamento} onChange={e => setF('departamento', e.target.value)} placeholder="Capital" />
                </F>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <F label="Superficie s/M (m²)">
                  <Input
                    value={form.superficie_m2}
                    onChange={e => handleSuperficieChange(e.target.value)}
                    placeholder="624,16"
                  />
                </F>
                <F label="Superficie en Letras">
                  <Input
                    value={form.superficie_letras}
                    onChange={e => setF('superficie_letras', e.target.value)}
                    placeholder="Seiscientos veinticuatro con dieciséis metros cuadrados"
                  />
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

            {/* 3. LINDEROS DINÁMICOS */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>3. Límites y Linderos del Inmueble</span>
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

            {/* 4. COMITENTES */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>4. Comitentes</span>
                <button
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

            {/* 5. ACTAS Y NOTIFICACIÓN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div style={S.section}>5. Acta de Mensura</div>
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

            {/* 6. LINDEROS NO NOTIFICADOS */}
            <div>
              <div style={{ ...S.section, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Linderos no notificados (Acta de Ausencia)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => sincronizarLinderosAusentes(false)}
                    style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  >
                    Copiar Sur, Este, Oeste
                  </button>
                  <button
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
                rows={4}
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
