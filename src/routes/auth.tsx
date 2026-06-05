import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, Shield, Mail, Lock } from 'lucide-react'

export const Route = createFileRoute('/auth')({
  component: AuthPage,
})

// ─── LISTA DE EMAILS AUTORIZADOS ──────────────────────────────────────────────
// Solo estos emails pueden registrarse y acceder a la app.
// Para agregar alguien: añadí su email a este array y hacé deploy.
const EMAILS_AUTORIZADOS: string[] = [
  'valentinottiaugusto@gmail.com',
  // 'otroemail@ejemplo.com',  ← así agregás más si querés
]

function emailAutorizado(email: string): boolean {
  return EMAILS_AUTORIZADOS.map(e => e.toLowerCase().trim())
    .includes(email.toLowerCase().trim())
}

// ─── CONTROL DE INTENTOS FALLIDOS ────────────────────────────────────────────
const MAX_INTENTOS = 5
const BLOQUEO_MS = 15 * 60 * 1000

function getIntentos(): { count: number; bloqueadoHasta: number } {
  try {
    const raw = localStorage.getItem('_auth_intentos')
    return raw ? JSON.parse(raw) : { count: 0, bloqueadoHasta: 0 }
  } catch { return { count: 0, bloqueadoHasta: 0 } }
}
function registrarIntentoFallido() {
  const data = getIntentos()
  const count = data.count + 1
  const bloqueadoHasta = count >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : data.bloqueadoHasta
  localStorage.setItem('_auth_intentos', JSON.stringify({ count, bloqueadoHasta }))
  return { count, bloqueadoHasta }
}
function resetIntentos() { localStorage.removeItem('_auth_intentos') }
function estaBloqueado(): { bloqueado: boolean; minutosRestantes: number } {
  const { count, bloqueadoHasta } = getIntentos()
  if (count >= MAX_INTENTOS && bloqueadoHasta > Date.now()) {
    return { bloqueado: true, minutosRestantes: Math.ceil((bloqueadoHasta - Date.now()) / 60000) }
  }
  if (bloqueadoHasta && bloqueadoHasta <= Date.now()) resetIntentos()
  return { bloqueado: false, minutosRestantes: 0 }
}

// ─── TRADUCCIÓN DE ERRORES ────────────────────────────────────────────────────
function traducirError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'Email inválido.',
    'auth/user-not-found': 'No existe una cuenta con ese email.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/network-request-failed': 'Error de conexión. Verificá tu internet.',
    'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
  }
  return map[code] ?? 'Ocurrió un error. Intentá de nuevo.'
}

type Mode = 'login' | 'register' | 'reset' | 'verify'

// ─── COMPONENTE ───────────────────────────────────────────────────────────────
function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [intentosRestantes, setIntentosRestantes] = useState(MAX_INTENTOS)
  const [bloqueadoMin, setBloqueadoMin] = useState(0)

  useEffect(() => {
    function checkBloqueo() {
      const { bloqueado, minutosRestantes } = estaBloqueado()
      setBloqueadoMin(bloqueado ? minutosRestantes : 0)
      const { count } = getIntentos()
      setIntentosRestantes(Math.max(0, MAX_INTENTOS - count))
    }
    checkBloqueo()
    const interval = setInterval(checkBloqueo, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user?.emailVerified && emailAutorizado(user.email ?? '')) {
        navigate({ to: '/' })
      } else if (user && !user.emailVerified) {
        setMode('verify')
      }
    })
    return unsub
  }, [navigate])

  const isBloqueado = bloqueadoMin > 0

  async function handleSubmit() {
    setError(''); setMessage('')

    const { bloqueado, minutosRestantes } = estaBloqueado()
    if (bloqueado) {
      setError(`Cuenta bloqueada. Esperá ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''}.`)
      return
    }
    if (!email.trim()) { setError('Ingresá tu email.'); return }
    if (mode !== 'reset' && !password) { setError('Ingresá tu contraseña.'); return }

    // ── Verificar whitelist ANTES de cualquier acción ──
    if (mode === 'register' || mode === 'login') {
      if (!emailAutorizado(email)) {
        setError('Este email no tiene autorización para acceder. Contactá al administrador.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email, password)
        if (!cred.user.emailVerified) {
          await signOut(auth)
          setMode('verify')
          setError('Tu email no está verificado. Revisá tu bandeja de entrada.')
        } else {
          resetIntentos()
          navigate({ to: '/' })
        }
      } else if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await sendEmailVerification(cred.user)
        await signOut(auth)
        setMode('verify')
        setMessage('Cuenta creada. Te enviamos un email de verificación. Verificá y después ingresá.')
      } else if (mode === 'reset') {
        if (!emailAutorizado(email)) {
          setError('Este email no tiene autorización.')
          return
        }
        await sendPasswordResetEmail(auth, email)
        setMessage('Te enviamos un email para restablecer tu contraseña.')
      }
    } catch (e: any) {
      if (mode === 'login') {
        const { count } = registrarIntentoFallido()
        const restantes = MAX_INTENTOS - count
        if (restantes <= 0) {
          setBloqueadoMin(15)
          setError('Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.')
        } else {
          setError(`${traducirError(e.code)} (${restantes} intento${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''})`)
          setIntentosRestantes(restantes)
        }
      } else {
        setError(traducirError(e.code))
      }
    } finally {
      setLoading(false)
    }
  }

  async function reenviarVerificacion() {
    if (!email || !password) { setError('Ingresá email y contraseña para reenviar la verificación.'); return }
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(cred.user)
      await signOut(auth)
      setMessage('Email de verificación reenviado.')
      setError('')
    } catch (e: any) {
      setError('No se pudo reenviar: ' + traducirError(e.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--color-background-tertiary)', padding: '16px',
    }}>
      <Card style={{ width: '100%', maxWidth: '380px' }}>
        <CardHeader style={{ textAlign: 'center', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: '#0F6E56', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield style={{ width: '26px', height: '26px', color: 'white' }} />
            </div>
          </div>
          <CardTitle style={{ fontSize: '20px' }}>Augusto Agrimensura</CardTitle>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {mode === 'login'    && 'Acceso restringido'}
            {mode === 'register' && 'Crear cuenta'}
            {mode === 'reset'    && 'Recuperar contraseña'}
            {mode === 'verify'   && 'Verificá tu email'}
          </p>
        </CardHeader>

        <CardContent style={{ paddingTop: '8px' }}>

          {/* PANTALLA VERIFICACIÓN */}
          {mode === 'verify' ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Mail style={{ width: '40px', height: '40px', color: '#0F6E56', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                Revisá tu bandeja de entrada y hacé clic en el link de verificación para activar tu cuenta.
              </p>
              {message && <Msg tipo="ok">{message}</Msg>}
              {error && <Msg tipo="error">{error}</Msg>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Label style={{ fontSize: '13px', textAlign: 'left' }}>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Label style={{ fontSize: '13px', textAlign: 'left' }}>Contraseña</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
              </div>
              <Button onClick={reenviarVerificacion} disabled={loading} variant="outline" style={{ width: '100%', marginBottom: '8px' }}>
                {loading ? 'Enviando…' : 'Reenviar email de verificación'}
              </Button>
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }}
                style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Volver al login
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Bloqueo */}
              {isBloqueado && (
                <Msg tipo="warn">
                  🔒 Bloqueado por {bloqueadoMin} min por demasiados intentos fallidos.
                </Msg>
              )}

              {/* Advertencia de intentos */}
              {mode === 'login' && intentosRestantes < MAX_INTENTOS && intentosRestantes > 0 && !isBloqueado && (
                <Msg tipo="warn">
                  ⚠️ {intentosRestantes} intento{intentosRestantes > 1 ? 's' : ''} restante{intentosRestantes > 1 ? 's' : ''} antes del bloqueo.
                </Msg>
              )}

              {error && !isBloqueado && <Msg tipo="error">{error}</Msg>}
              {message && <Msg tipo="ok">{message}</Msg>}

              {/* Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Label style={{ fontSize: '13px' }}>Email</Label>
                <Input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  disabled={isBloqueado}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {/* Contraseña */}
              {mode !== 'reset' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Label style={{ fontSize: '13px' }}>Contraseña</Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isBloqueado}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      style={{ paddingRight: '40px' }}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                      {showPassword ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                    </button>
                  </div>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading || isBloqueado}
                style={{ background: '#0F6E56', color: 'white', width: '100%', marginTop: '4px' }}
              >
                {loading ? 'Cargando…' : mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Enviar email'}
              </Button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'center' }}>
                {mode === 'login' && (
                  <>
                    <button onClick={() => { setMode('register'); setError(''); setMessage('') }}
                      style={{ fontSize: '13px', color: '#0F6E56', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Crear cuenta nueva
                    </button>
                    <button onClick={() => { setMode('reset'); setError(''); setMessage('') }}
                      style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Olvidé mi contraseña
                    </button>
                  </>
                )}
                {(mode === 'register' || mode === 'reset') && (
                  <button onClick={() => { setMode('login'); setError(''); setMessage('') }}
                    style={{ fontSize: '13px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Volver al login
                  </button>
                )}
              </div>

              {/* Indicador de seguridad */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', paddingTop: '12px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <Lock style={{ width: '11px', height: '11px', color: '#0F6E56' }} />
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  Acceso solo para usuarios autorizados
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── HELPER MENSAJES ──────────────────────────────────────────────────────────
function Msg({ tipo, children }: { tipo: 'error' | 'ok' | 'warn'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    error: { background: '#FEE2E2', border: '0.5px solid #FCA5A5', color: '#991B1B' },
    ok:    { background: '#E1F5EE', border: '0.5px solid #6EE7B7', color: '#065F46' },
    warn:  { background: '#FAEEDA', border: '0.5px solid #FCD34D', color: '#854F0B' },
  }
  return (
    <div style={{ ...styles[tipo], borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
      {children}
    </div>
  )
}