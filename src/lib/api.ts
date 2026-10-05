'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: { field: string; message: string }[]) {
    super(message)
  }
}

interface Options { method?: string; body?: unknown; form?: FormData; raw?: boolean }

/**
 * Calls the REST API. The session is an httpOnly cookie the browser sends by itself,
 * so there is no token to keep in the page. The X-Requested-With header proves the
 * request comes from our own pages; the server refuses changing requests without it.
 */
export async function api<T = any>(path: string, o: Options = {}): Promise<T> {
  const res = await fetch('/api/v1' + path, {
    method: o.method ?? (o.body !== undefined || o.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'cx-web', ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
  })
  // The session ended: send the person to the sign-in page, unless this call was itself about signing in.
  if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/') && !path.startsWith('/portal/auth/') && typeof window !== 'undefined') window.location.href = path.startsWith('/portal/') ? '/portal/login' : '/login'
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
