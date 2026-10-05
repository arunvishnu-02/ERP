'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Acts once on a query parameter, then removes it from the address bar.
 * Search and the New menu use this: /leads?open=<id> opens a lead, /leads?new=lead opens the add form.
 */
export function useUrlParam(name: string, act: (value: string) => void, when = true) {
  const sp = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const fn = useRef(act)
  fn.current = act
  const value = sp.get(name)
  useEffect(() => {
    if (!value || !when) return
    fn.current(value)
    const next = new URLSearchParams(sp.toString())
    next.delete(name)
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false })
  }, [value, when, name, path, router, sp])
}
