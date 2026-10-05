'use client'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useState } from 'react'
import { FormDialog } from '@/components/form'
import { PageTitle } from '@/components/portal'
import { Button, Card, Empty, Loading, Status } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { ago } from '@/lib/format'

export default function PortalSupport() {
  const router = useRouter()
  const { data } = useApi<{ items: any[] }>('/portal/tickets')
  const [add, setAdd] = useState(false)
  if (!data) return <Loading />
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2"><PageTitle title="Support" intro="Ask for help or report a problem. Our team replies here and by email." /><Button variant="primary" onClick={() => setAdd(true)}><Plus size={16} />New ticket</Button></div>
      <Card>
        {data.items.length ? <ul className="divide-y divide-line">
          {data.items.map((t) => <li key={t.id}><Link href={`/portal/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"><span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="text-xs text-muted"><span className="num">{t.ticketNumber}</span>, updated {ago(t.updatedAt)}</span></span><Status value={t.status} label={t.status === 'WAITING_ON_CUSTOMER' ? 'Waiting for you' : undefined} /></Link></li>)}
        </ul> : <Empty>No tickets yet.</Empty>}
      </Card>
      <FormDialog open={add} onClose={() => setAdd(false)} title="New ticket" submitLabel="Send ticket" initial={{ priority: 'MEDIUM' }}
        fields={[{ name: 'subject', label: 'Subject', required: true, full: true }, { name: 'priority', label: 'How urgent is it', type: 'select', required: true, options: [{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Normal' }, { value: 'HIGH', label: 'High' }, { value: 'URGENT', label: 'Urgent, something is down' }] }, { name: 'description', label: 'What do you need help with', type: 'textarea', required: true }]}
        onSubmit={async (v) => { const t = await api('/portal/tickets', { body: v }); toast.success(`Ticket ${t.ticketNumber} sent`); router.push(`/portal/support/${t.id}`) }} />
    </>
  )
}
