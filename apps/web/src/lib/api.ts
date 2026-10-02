'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: { field: string; message: string }[]) {
    super(message)
  }
}

let token: string | null = null
let refreshing: Promise<boolean> | null = null
export const setToken = (t: string | null) => { token = t }

/** Swaps the refresh cookie for a new access token. Calls made at the same moment share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) { token = null; return false }
      token = (await r.json()).accessToken
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

interface Options { method?: string; body?: unknown; form?: FormData; raw?: boolean }
export async function api<T = any>(path: string, o: Options = {}): Promise<T> {
  const run = () =>
    fetch('/api/v1' + path, {
      method: o.method ?? (o.body !== undefined || o.form ? 'POST' : 'GET'),
      credentials: 'include',
      headers: { ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    })
  let res = await run()
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/') && (await refreshSession())) res = await run()
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/') && typeof window !== 'undefined') window.location.href = '/login'
  if (o.raw) return res as any
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Something went wrong. Try again.', data?.errors)
  return data
}

/** Loads data for a screen. Pass null to skip. reload() fetches again without flashing the loading state. */
export function useApi<T = any>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: !!path })
  const [tick, setTick] = useState(0)
  const latest = useRef(0)
  useEffect(() => {
    if (!path) { setState({ loading: false }); return }
    const id = ++latest.current
    setState((s) => ({ ...s, loading: true }))
    api<T>(path)
      .then((data) => { if (id === latest.current) setState({ data, loading: false }) })
      .catch((error) => { if (id === latest.current) setState({ error, loading: false }) })
  }, [path, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

export async function downloadFile(fileId: string, fileName: string) {
  const res: Response = await api(`/files/${fileId}/download`, { raw: true })
  if (!res.ok) throw new ApiError(res.status, 'The file could not be downloaded')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
