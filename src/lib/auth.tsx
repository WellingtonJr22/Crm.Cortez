import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { api } from './api'

export interface Perfil {
  id: string
  nome: string
  email: string
  role: 'admin' | 'atendente'
  status: 'pendente' | 'aprovado' | 'inativo'
}

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  sair: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregarPerfil(s: Session | null) {
    if (!s) {
      setPerfil(null)
      return
    }
    try {
      setPerfil(await api<Perfil>('users/me'))
    } catch {
      setPerfil(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, s) => {
      setSession(s)
      await carregarPerfil(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        carregando,
        sair: async () => {
          await supabase.auth.signOut()
        },
        recarregarPerfil: () => carregarPerfil(session),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
