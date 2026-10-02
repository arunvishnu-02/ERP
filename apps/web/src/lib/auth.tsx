'use client'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, refreshSession, setToken } from './api'

export interface Me {
  id: string
  name: string
  email: string
  employeeId: string | null
  departmentId: string | null
  mustChangePassword: boolean
  roles: { id: string; key: string; name: string }[]
  perms: Record<string, Record<string, 'OWN' | 'TEAM' | 'DEPARTMENT' | 'ALL'>>
}
export type Action = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'IMPORT'
interface Ctx {
  me: Me
  lookups: any
  can: (module: string, action?: Action) => boolean
  scope: (module: string, action?: Action) => string | undefined
  reloadLookups: () => Promise<void>
  reloadMe: () => Promise<void>
  logout: () => Promise<void>
}
const AuthContext = createContext<Ctx | null>(null)
export const useAuth = () => {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth must be used inside the signed-in area')
  return c
}

/** Wraps the signed-in area: restores the session, loads the user and the reference lists, or sends them to the login page. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [lookups, setLookups] = useState<any>(null)

  const reloadLookups = useCallback(async () => setLookups(await api('/lookups')), [])
  const reloadMe = useCallback(async () => setMe(await api('/auth/me')), [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!(await refreshSession())) return router.replace('/login')
      try {
        const [m, l] = await Promise.all([api<Me>('/auth/me'), api('/lookups')])
        if (alive) { setMe(m); setLookups(l) }
      } catch {
        router.replace('/login')
      }
    })()
    return () => { alive = false }
  }, [router])

  const value = useMemo<Ctx | null>(() => {
    if (!me || !lookups) return null
    return {
      me, lookups, reloadLookups, reloadMe,
      can: (module, action = 'VIEW') => !!me.perms[module]?.[action],
      scope: (module, action = 'VIEW') => me.perms[module]?.[action],
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {})
        setToken(null)
        window.location.href = '/login'
      },
    }
  }, [me, lookups, reloadLookups, reloadMe])

  if (!value) return <div className="grid min-h-screen place-items-center text-muted">Loading your workspace…</div>
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
