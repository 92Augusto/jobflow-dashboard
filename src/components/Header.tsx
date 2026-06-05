import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

type HeaderProps = {
  email?: string
}

export function Header({ email }: HeaderProps) {
  const initials = email ? email[0].toUpperCase() : 'A'

  return (
    <header className="flex items-center justify-between px-3 md:px-6 py-2.5 border-b border-[#E5E7EB]" style={{
      background: 'var(--color-background-primary)',
    }}>
      {/* LOGO */}
      <svg viewBox="0 0 320 52" role="img" className="w-auto h-8 sm:h-10 md:h-[52px] max-w-[65%] sm:max-w-[70%]">
        <title>Augusto Valentinotti Agrimensura</title>
        {/* Ícono cuadrado redondeado */}
        <rect x="0" y="1" width="50" height="50" rx="8" fill="#0F6E56"/>
        {/* Curvas de nivel */}
        <path d="M 0,38 Q 11,30 25,29 Q 39,28 50,35" fill="none" stroke="#1D9E75" stroke-width="1.2" opacity="0.5"/>
        <path d="M 0,44 Q 11,36 25,35 Q 39,34 50,41" fill="none" stroke="#1D9E75" stroke-width="0.8" opacity="0.3"/>
        <path d="M 0,32 Q 11,24 25,23 Q 39,22 50,29" fill="none" stroke="#1D9E75" stroke-width="0.8" opacity="0.25"/>
        {/* Trípode */}
        <line x1="25" y1="28" x2="15" y2="43" stroke="#9FE1CB" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="25" y1="28" x2="25" y2="44" stroke="#9FE1CB" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="25" y1="28" x2="35" y2="43" stroke="#9FE1CB" stroke-width="1.2" stroke-linecap="round"/>
        {/* Base trípode */}
        <rect x="20" y="26" width="10" height="2.5" rx="1" fill="#9FE1CB"/>
        {/* Cuerpo telescopio */}
        <rect x="21.5" y="17" width="7" height="10" rx="1.5" fill="white" opacity="0.92"/>
        {/* Ocular */}
        <rect x="27" y="18.5" width="6" height="3" rx="1" fill="#9FE1CB"/>
        {/* Lente */}
        <circle cx="21.5" cy="21" r="2.8" fill="#9FE1CB"/>
        <circle cx="21.5" cy="21" r="1.3" fill="#0F6E56"/>
        {/* Nivel burbuja */}
        <rect x="22.5" y="15" width="5" height="2" rx="1" fill="#9FE1CB" opacity="0.85"/>

        {/* Textos */}
        <text x="62" y="24" fontFamily="var(--font-sans)" fontSize="15" fontWeight="500" fill="#0F6E56" letterSpacing="1">VALENTINOTTI</text>
        <text x="63" y="36" fontFamily="var(--font-sans)" fontSize="7.5" fill="#1D9E75" letterSpacing="3">AGRIMENSURA</text>
        <line x1="63" y1="40" x2="318" y2="40" stroke="#1D9E75" stroke-width="0.4" opacity="0.35"/>
        <text x="64" y="48" fontFamily="var(--font-sans)" fontSize="6.5" fill="#1D9E75" letterSpacing="1.5" opacity="0.65">MENSURAS · DESLINDE · TOPOGRAFÍA</text>
      </svg>

      {/* Usuario + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'none' }}
          className="sm-show">{email}</span>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%',
          background: '#E1F5EE', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '12px', fontWeight: '500', color: '#0F6E56',
        }}>
          {initials}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut(auth)}
          style={{ width: '30px', height: '30px' }}
        >
          <LogOut style={{ width: '14px', height: '14px' }} />
        </Button>
      </div>
    </header>
  )
}