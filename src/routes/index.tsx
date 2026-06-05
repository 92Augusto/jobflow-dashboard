import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut, User } from 'firebase/auth'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Pencil, Trash2, Plus, ChevronDown, ChevronUp, Clock, LogOut, Shield } from 'lucide-react'
import { Header } from '@/components/Header'
import { PresupuestosTab } from '@/components/PresupuestosTab'
import { ExpedienteTab } from '@/components/ExpedienteTab'
import { SuperficieTab } from '@/components/SuperficieTab'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

type EstadoObra = 'en_curso' | 'completado' | 'pendiente'
type Obra = { id: string; cliente: string; descripcion: string; presupuesto: number; fechaInicio: string; estado: EstadoObra; notas: string; userId: string; createdAt?: any }
type Pago = { id: string; obraId: string; numeroPago: number; fechaPago: string; monto: number; observaciones: string; userId: string }

const S = {
  page: { minHeight: '100vh', background: 'var(--color-background-tertiary)' } as React.CSSProperties,
  main: { maxWidth: '1200px', margin: '0 auto', padding: '16px' } as React.CSSProperties,
  statCard: { background: 'var(--color-background-primary)', borderRadius: '12px', padding: '14px 16px', border: '0.5px solid var(--color-border-tertiary)' } as React.CSSProperties,
  statLabel: { fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px', letterSpacing: '0.5px' } as React.CSSProperties,
  statValue: { fontSize: '20px', fontWeight: '500', color: 'var(--color-text-primary)', letterSpacing: '-0.5px' } as React.CSSProperties,
  card: { background: 'var(--color-background-primary)', borderRadius: '12px', border: '0.5px solid var(--color-border-tertiary)', padding: '16px', marginBottom: '8px' } as React.CSSProperties,
  divider: { height: '0.5px', background: 'var(--color-border-tertiary)', margin: '12px 0' } as React.CSSProperties,
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' } as React.CSSProperties,
  sectionCount: { fontSize: '13px', color: 'var(--color-text-secondary)' } as React.CSSProperties,
  empty: { textAlign: 'center' as const, color: 'var(--color-text-secondary)', padding: '48px 0', fontSize: '14px' },
  errorBox: { background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991B1B', marginBottom: '12px' } as React.CSSProperties,
}

const BADGE: Record<EstadoObra, React.CSSProperties> = {
  en_curso:   { background: '#E1F5EE', color: '#0F6E56', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
  completado: { background: '#EAF3DE', color: '#3B6D11', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
  pendiente:  { background: '#FAEEDA', color: '#854F0B', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
}
const ESTADOS: Record<EstadoObra, string> = { en_curso: 'En curso', completado: 'Completado', pendiente: 'Pendiente' }

// ─── ROOT ─────────────────────────────────────────────────────────────────────
function IndexPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      if (!u) { navigate({ to: '/auth' }); return }
      if (!u.emailVerified) { signOut(auth); navigate({ to: '/auth' }); return }
      setUser(u)
    })
  }, [navigate])

  if (user === undefined || !user) return null
  return <Dashboard user={user} />
}

// ─── AVISO INACTIVIDAD ────────────────────────────────────────────────────────
function AvisoInactividad({ onContinuar, onSalir }: { onContinuar: () => void; onSalir: () => void }) {
  const [segundos, setSegundos] = useState(60)
  useEffect(() => {
    const iv = setInterval(() => setSegundos(s => { if (s <= 1) { onSalir(); return 0 } return s - 1 }), 1000)
    return () => clearInterval(iv)
  }, [onSalir])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
      <div style={{ background: 'var(--color-background-primary)', borderRadius: '16px', padding: '28px 24px', maxWidth: '360px', width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#FAEEDA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Clock style={{ width: '26px', height: '26px', color: '#854F0B' }} />
        </div>
        <h3 style={{ fontSize: '17px', fontWeight: '600', marginBottom: '8px' }}>¿Seguís ahí?</h3>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
          La sesión se cerrará en <strong style={{ color: '#854F0B' }}>{segundos}s</strong> por inactividad.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button onClick={onSalir} variant="outline" style={{ flex: 1 }}>
            <LogOut style={{ width: '14px', height: '14px', marginRight: '6px' }} />Salir
          </Button>
          <Button onClick={onContinuar} style={{ flex: 1, background: '#0F6E56', color: 'white' }}>Continuar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ user }: { user: User }) {
  const navigate = useNavigate()
  const [obras, setObras] = useState<Obra[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [dbError, setDbError] = useState('')
  const [mostrarAviso, setMostrarAviso] = useState(false)
  const [timerRef] = useState<{ logout: any; aviso: any }>({ logout: null, aviso: null })

  const handleLogout = useCallback(async () => {
    setMostrarAviso(false)
    await signOut(auth)
    navigate({ to: '/auth' })
  }, [navigate])

  // Auto-logout 20 min
  const resetTimers = useCallback(() => {
    clearTimeout(timerRef.logout); clearTimeout(timerRef.aviso)
    timerRef.aviso = setTimeout(() => setMostrarAviso(true), 19 * 60 * 1000)
    timerRef.logout = setTimeout(handleLogout, 20 * 60 * 1000)
  }, [handleLogout, timerRef])

  useEffect(() => {
    resetTimers()
    const eventos = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    eventos.forEach(e => window.addEventListener(e, resetTimers, { passive: true }))
    return () => {
      clearTimeout(timerRef.logout); clearTimeout(timerRef.aviso)
      eventos.forEach(e => window.removeEventListener(e, resetTimers))
    }
  }, [resetTimers, timerRef])

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'obras'), where('userId', '==', user.uid)),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Obra))
        data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
        setObras(data); setDbError('')
      },
      err => setDbError('Error al cargar obras: ' + err.message)
    )
  }, [user.uid])

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'pagos'), where('userId', '==', user.uid)),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Pago))
        data.sort((a, b) => (b.fechaPago > a.fechaPago ? 1 : -1))
        setPagos(data)
      },
      err => setDbError('Error al cargar pagos: ' + err.message)
    )
  }, [user.uid])

  const totalPresupuestado = obras.reduce((s, o) => s + (o.presupuesto ?? 0), 0)
  const totalCobrado = pagos.reduce((s, p) => s + (p.monto ?? 0), 0)
  const deuda = totalPresupuestado - totalCobrado

  return (
    <div style={S.page}>
      {mostrarAviso && (
        <AvisoInactividad
          onContinuar={() => { setMostrarAviso(false); resetTimers() }}
          onSalir={handleLogout}
        />
      )}

      <Header email={user.email ?? ''} />

      <main style={S.main}>
        {dbError && <div style={S.errorBox}>{dbError}</div>}

        {/* Indicador seguridad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          <Shield style={{ width: '12px', height: '12px', color: '#0F6E56' }} />
          <span>Sesión segura · Auto-cierre por inactividad a los 20 min</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Obras', value: obras.length.toString(), color: undefined },
            { label: 'Presupuestado', value: fmt(totalPresupuestado), color: undefined },
            { label: 'Cobrado', value: fmt(totalCobrado), color: '#1D9E75' },
            { label: 'Deuda', value: fmt(deuda), color: deuda > 0 ? '#D85A30' : '#1D9E75' },
          ].map(stat => (
            <div key={stat.label} style={S.statCard}>
              <div style={S.statLabel}>{stat.label}</div>
              <div style={{ ...S.statValue, color: stat.color ?? 'var(--color-text-primary)' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="obras">
          <TabsList className="mb-4 flex overflow-x-auto justify-start w-full snap-x snap-mandatory hide-scrollbar">
            <TabsTrigger value="obras" className="snap-start shrink-0">Obras</TabsTrigger>
            <TabsTrigger value="pagos" className="snap-start shrink-0">Pagos</TabsTrigger>
            <TabsTrigger value="presupuestos" className="snap-start shrink-0">Presupuestos</TabsTrigger>
            <TabsTrigger value="expediente" className="snap-start shrink-0">Expediente</TabsTrigger>
            <TabsTrigger value="superficie" className="snap-start shrink-0">Superficie</TabsTrigger>
          </TabsList>

          {/* OBRAS */}
          <TabsContent value="obras">
            <div style={S.sectionHeader}>
              <span style={S.sectionCount}>{obras.length} {obras.length === 1 ? 'obra' : 'obras'}</span>
              <NuevaObraDialog userId={user.uid} />
            </div>
            {obras.length === 0
              ? <p style={S.empty}>No hay obras cargadas todavía.</p>
              : obras.map(o => (
                <ObraCard key={o.id} obra={o} pagos={pagos.filter(p => p.obraId === o.id)} />
              ))
            }
          </TabsContent>

          {/* PAGOS */}
          <TabsContent value="pagos">
            <div style={S.sectionHeader}>
              <span style={S.sectionCount}>{pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'} en total</span>
            </div>
            {obras.length === 0
              ? <p style={S.empty}>No hay obras cargadas todavía.</p>
              : obras.map(o => (
                <ObraConPagos
                  key={o.id}
                  obra={o}
                  pagos={pagos.filter(p => p.obraId === o.id)}
                  userId={user.uid}
                  allPagos={pagos}
                />
              ))
            }
          </TabsContent>

          {/* PRESUPUESTOS */}
          <TabsContent value="presupuestos">
            <PresupuestosTab userId={user.uid} />
          </TabsContent>

          {/* EXPEDIENTE */}
          <TabsContent value="expediente" className="mt-4">
            <ExpedienteTab />
          </TabsContent>

          {/* SUPERFICIE */}
          <TabsContent value="superficie" className="mt-4">
            <SuperficieTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

// ─── OBRA CARD ────────────────────────────────────────────────────────────────
function ObraCard({ obra, pagos }: { obra: Obra; pagos: Pago[] }) {
  const cobrado = pagos.reduce((s, p) => s + p.monto, 0)
  const saldo = obra.presupuesto - cobrado
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ fontWeight: '500', fontSize: '15px', marginBottom: '3px' }}>{obra.cliente}</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{obra.descripcion}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={BADGE[obra.estado ?? 'pendiente']}>{ESTADOS[obra.estado ?? 'pendiente']}</span>
          <EditarObraDialog obra={obra} />
          <button
            onClick={() => { if (confirm('¿Eliminar esta obra?')) deleteDoc(doc(db, 'obras', obra.id)) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', display: 'flex' }}
          >
            <Trash2 style={{ width: '13px', height: '13px' }} />
          </button>
        </div>
      </div>
      <div style={S.divider} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {[
          { label: 'Presupuesto', value: fmt(obra.presupuesto), color: undefined },
          { label: 'Cobrado', value: fmt(cobrado), color: '#1D9E75' },
          { label: 'Saldo', value: fmt(saldo), color: saldo > 0 ? '#D85A30' : '#1D9E75' },
          ...(obra.fechaInicio ? [{ label: 'Inicio', value: obra.fechaInicio, color: undefined }] : []),
        ].map(item => (
          <div key={item.label} style={{ fontSize: '13px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{item.label} </span>
            <span style={{ fontWeight: '500', color: item.color ?? 'var(--color-text-primary)' }}>{item.value}</span>
          </div>
        ))}
      </div>
      {obra.notas && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{obra.notas}</div>}
    </div>
  )
}

// ─── EDITAR OBRA ──────────────────────────────────────────────────────────────
function EditarObraDialog({ obra }: { obra: Obra }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    cliente: obra.cliente, descripcion: obra.descripcion,
    presupuesto: obra.presupuesto.toString(), fechaInicio: obra.fechaInicio,
    estado: obra.estado, notas: obra.notas,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function guardar() {
    if (!form.cliente.trim()) { setError('El campo Cliente es obligatorio.'); return }
    setError(''); setSaving(true)
    try {
      await updateDoc(doc(db, 'obras', obra.id), {
        cliente: form.cliente.trim(), descripcion: form.descripcion.trim(),
        presupuesto: parseFloat(form.presupuesto) || 0,
        fechaInicio: form.fechaInicio, estado: form.estado, notas: form.notas.trim(),
      })
      setOpen(false)
    } catch (e: any) { setError('Error: ' + e.message) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setError('') }}>
      <DialogTrigger asChild>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex' }}>
          <Pencil style={{ width: '13px', height: '13px' }} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar obra</DialogTitle></DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {error && <div style={S.errorBox}>{error}</div>}
          <F label="Cliente *"><Input value={form.cliente} onChange={e => set('cliente', e.target.value)} /></F>
          <F label="Descripción"><Input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} /></F>
          <F label="Presupuesto ($)"><Input type="number" value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} /></F>
          <F label="Fecha de inicio"><Input type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} /></F>
          <F label="Estado">
            <Select value={form.estado} onValueChange={v => set('estado', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Notas"><Textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2} /></F>
          <Button onClick={guardar} disabled={saving} style={{ background: '#0F6E56', color: 'white', width: '100%' }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── OBRA CON PAGOS ───────────────────────────────────────────────────────────
function ObraConPagos({ obra, pagos, userId, allPagos }: { obra: Obra; pagos: Pago[]; userId: string; allPagos: Pago[] }) {
  const [expanded, setExpanded] = useState(false)
  const cobrado = pagos.reduce((s, p) => s + p.monto, 0)
  const saldo = obra.presupuesto - cobrado

  return (
    <div style={{ ...S.card, padding: '0', marginBottom: '10px' }}>
      <div
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontWeight: '500', fontSize: '14px' }}>{obra.cliente}</span>
            <span style={BADGE[obra.estado ?? 'pendiente']}>{ESTADOS[obra.estado ?? 'pendiente']}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{obra.descripcion}</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { label: 'Presupuesto', value: fmt(obra.presupuesto), color: undefined },
              { label: 'Cobrado', value: fmt(cobrado), color: '#1D9E75' },
              { label: 'Saldo', value: fmt(saldo), color: saldo > 0 ? '#D85A30' : '#1D9E75' },
            ].map(item => (
              <span key={item.label} style={{ fontSize: '12px' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{item.label} </span>
                <span style={{ fontWeight: '500', color: item.color ?? 'inherit' }}>{item.value}</span>
              </span>
            ))}
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div onClick={e => e.stopPropagation()}>
            <NuevoPagoDialog
              userId={userId}
              obraId={obra.id}
              obraLabel={`${obra.cliente} — ${obra.descripcion}`}
              allPagos={allPagos}
            />
          </div>
          {expanded
            ? <ChevronUp style={{ width: '16px', height: '16px', color: 'var(--color-text-secondary)' }} />
            : <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--color-text-secondary)' }} />
          }
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          {pagos.length === 0
            ? <p style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' }}>No hay pagos registrados para esta obra.</p>
            : pagos.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px',
                  borderBottom: i < pagos.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                  background: 'var(--color-background-secondary)',
                }}
              >
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', flex: 1 }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', minWidth: '80px' }}>Pago #{p.numeroPago}</span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{p.fechaPago}</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#1D9E75' }}>{fmt(p.monto)}</span>
                  {p.observaciones && <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{p.observaciones}</span>}
                </div>
                <button
                  onClick={() => { if (confirm('¿Eliminar este pago?')) deleteDoc(doc(db, 'pagos', p.id)) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', display: 'flex', marginLeft: '8px' }}
                >
                  <Trash2 style={{ width: '13px', height: '13px' }} />
                </button>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ─── NUEVO PAGO ───────────────────────────────────────────────────────────────
function NuevoPagoDialog({ userId, obraId, obraLabel, allPagos }: { userId: string; obraId: string; obraLabel: string; allPagos: Pago[] }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ fechaPago: '', monto: '', observaciones: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function guardar() {
    if (!form.monto) { setError('El campo Monto es obligatorio.'); return }
    setError(''); setSaving(true)
    try {
      await addDoc(collection(db, 'pagos'), {
        userId, obraId,
        numeroPago: allPagos.filter(p => p.obraId === obraId).length + 1,
        fechaPago: form.fechaPago,
        monto: parseFloat(form.monto) || 0,
        observaciones: form.observaciones.trim(),
        createdAt: serverTimestamp(),
      })
      setForm({ fechaPago: '', monto: '', observaciones: '' })
      setOpen(false)
    } catch (e: any) { setError('Error al guardar: ' + e.message) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setError('') }}>
      <DialogTrigger asChild>
        <Button style={{ background: '#0F6E56', color: 'white', fontSize: '12px', height: '28px', padding: '0 10px' }}>
          <Plus style={{ width: '12px', height: '12px', marginRight: '4px' }} />Pago
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{obraLabel}</p>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {error && <div style={S.errorBox}>{error}</div>}
          <F label="Fecha de pago"><Input type="date" value={form.fechaPago} onChange={e => set('fechaPago', e.target.value)} /></F>
          <F label="Monto ($) *"><Input type="number" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0" /></F>
          <F label="Observaciones"><Textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Opcional" rows={2} /></F>
          <Button onClick={guardar} disabled={saving} style={{ background: '#0F6E56', color: 'white', width: '100%' }}>
            {saving ? 'Guardando…' : 'Guardar pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── NUEVA OBRA ───────────────────────────────────────────────────────────────
function NuevaObraDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    cliente: '', descripcion: '', presupuesto: '',
    fechaInicio: '', estado: 'pendiente' as EstadoObra, notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function guardar() {
    if (!form.cliente.trim()) { setError('El campo Cliente es obligatorio.'); return }
    if (!form.presupuesto) { setError('El campo Presupuesto es obligatorio.'); return }
    setError(''); setSaving(true)
    try {
      await addDoc(collection(db, 'obras'), {
        userId, cliente: form.cliente.trim(), descripcion: form.descripcion.trim(),
        presupuesto: parseFloat(form.presupuesto) || 0,
        fechaInicio: form.fechaInicio, estado: form.estado,
        notas: form.notas.trim(), createdAt: serverTimestamp(),
      })
      setForm({ cliente: '', descripcion: '', presupuesto: '', fechaInicio: '', estado: 'pendiente', notas: '' })
      setOpen(false)
    } catch (e: any) { setError('Error al guardar: ' + e.message) }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setError('') }}>
      <DialogTrigger asChild>
        <Button style={{ background: '#0F6E56', color: 'white', fontSize: '13px' }}>
          <Plus style={{ width: '14px', height: '14px', marginRight: '6px' }} />Nueva obra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva obra</DialogTitle></DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {error && <div style={S.errorBox}>{error}</div>}
          <F label="Cliente *"><Input value={form.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nombre del cliente" /></F>
          <F label="Descripción"><Input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Descripción del trabajo" /></F>
          <F label="Presupuesto ($) *"><Input type="number" value={form.presupuesto} onChange={e => set('presupuesto', e.target.value)} placeholder="0" /></F>
          <F label="Fecha de inicio"><Input type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} /></F>
          <F label="Estado">
            <Select value={form.estado} onValueChange={v => set('estado', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Notas"><Textarea value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Notas adicionales" rows={2} /></F>
          <Button onClick={guardar} disabled={saving} style={{ background: '#0F6E56', color: 'white', width: '100%' }}>
            {saving ? 'Guardando…' : 'Guardar obra'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Label style={{ fontSize: '13px' }}>{label}</Label>
      {children}
    </div>
  )
}