'use client'
// HR documents in the house style: the monthly payslip and the appointment letter.
import { InfoStrip, Label, Paper, PaperHeader, Signatures } from './paper'
import { amountInWords, fmtDate, human, inr, personName, todayStr } from '@/lib/format'

type Line = { name: string; amount: number }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** A navy-headed two-column table of names and amounts, with a total row. */
function AmountTable({ title, rows, total, empty }: { title: string; rows: Line[]; total: number; empty: string }) {
  return (
    <table className="w-full self-start border-separate border-spacing-0 text-[12.5px]">
      <thead><tr className="text-left text-[11px] text-white"><th className="rounded-l-md bg-[var(--doc-navy)] px-3 py-2.5 font-semibold">{title}</th><th className="rounded-r-md bg-[var(--doc-navy)] px-3 py-2.5 text-right font-semibold">Amount</th></tr></thead>
      <tbody>
        {rows.length ? rows.map((r, i) => <tr key={i}><td className="border-b border-[var(--doc-line)] px-3 py-2.5">{r.name}</td><td className="num border-b border-[var(--doc-line)] px-3 py-2.5 text-right">{inr(r.amount, true)}</td></tr>)
          : <tr><td colSpan={2} className="border-b border-[var(--doc-line)] px-3 py-2.5 text-[var(--doc-muted)]">{empty}</td></tr>}
        <tr className="font-semibold"><td className="px-3 py-2.5">Total</td><td className="num px-3 py-2.5 text-right">{inr(total, true)}</td></tr>
      </tbody>
    </table>
  )
}

/** One month's payslip. */
export function PayslipDoc({ p, org }: { p: any; org: any }) {
  const e = p.employee
  const earnings: Line[] = [...(p.earnings ?? []), ...(p.extraEarnings ?? [])]
  const deductions: Line[] = p.deductions ?? []
  const fyFrom = p.ytd?.from ? monthName(p.ytd.from) : ''
  return (
    <Paper org={org}>
      <PaperHeader org={org} title="PAYSLIP"><div className="mt-2 text-[13px] font-semibold text-[var(--doc-cyan)]">{monthName(p.month)}</div></PaperHeader>
      <div className="flex flex-wrap items-stretch justify-between gap-5">
        <div className="min-w-0 flex-1 text-[12.5px]">
          <Label>Employee</Label>
          <div className="mt-1 text-[15px] font-semibold">{personName(e)}</div>
          <div className="text-[var(--doc-muted)]">{[e.designation, e.department?.name].filter(Boolean).join(', ')}</div>
          <div className="mt-2 grid max-w-sm grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-[var(--doc-muted)]">Employee code</span><span className="num font-medium">{e.employeeCode}</span>
            <span className="text-[var(--doc-muted)]">Date of joining</span><span className="font-medium">{fmtDate(e.dateOfJoining)}</span>
            {e.branch?.name && <><span className="text-[var(--doc-muted)]">Branch</span><span className="font-medium">{e.branch.name}</span></>}
          </div>
        </div>
        <div className="flex w-full flex-col justify-center rounded-xl bg-[var(--doc-navy)] px-6 py-4 text-white sm:w-60">
          <div className="text-[11px] text-white/70">Net pay</div>
          <div className="num mt-0.5 text-[26px] leading-tight font-bold">{inr(p.netPay, true)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-white/80"><span className="h-1.5 w-1.5 rounded-full bg-[var(--doc-cyan)]" />{p.run?.paidOn ? `Paid on ${fmtDate(p.run.paidOn)}` : `For ${monthName(p.month)}`}</div>
        </div>
      </div>
      <InfoStrip items={[['Working days', days(p.workingDays)], ['Days paid', days(p.paidDays)], ['Loss of pay days', days(p.lopDays)], ['Monthly salary', inr(p.monthlySalary)]]} />
      <div className="grid gap-5 sm:grid-cols-2">
        <AmountTable title="Earnings" rows={earnings} total={p.gross} empty="No earnings" />
        <AmountTable title="Deductions" rows={deductions} total={p.totalDeductions} empty="No deductions this month" />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-[var(--doc-tint)] px-5 py-3.5">
        <div className="text-[12px]"><Label>Net pay in words</Label><div className="mt-1 font-semibold">{amountInWords(p.netPay)}</div></div>
        <div className="num text-[18px] font-bold text-[var(--doc-navy)]">{inr(p.netPay, true)}</div>
      </div>
      {p.notes && <div className="text-[12px]"><Label>Note</Label><div className="mt-1 whitespace-pre-line">{p.notes}</div></div>}
      <div className="grid gap-5 text-[12px] sm:grid-cols-2">
        {p.ytd && (
          <div>
            <Label>This financial year, from {fyFrom}</Label>
            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-y-1">
              <span className="text-[var(--doc-muted)]">Gross earnings</span><span className="num text-right">{inr(p.ytd.gross, true)}</span>
              <span className="text-[var(--doc-muted)]">Deductions</span><span className="num text-right">{inr(p.ytd.deductions, true)}</span>
              <span className="font-semibold">Net pay</span><span className="num text-right font-semibold">{inr(p.ytd.net, true)}</span>
            </div>
          </div>
        )}
        {!!p.leave?.length && (
          <div>
            <Label>Leave this year</Label>
            <table className="mt-1.5 w-full text-left">
              <thead><tr className="text-[10px] text-[var(--doc-muted)] uppercase"><th className="pb-1 font-medium">Type</th><th className="pb-1 text-right font-medium">Allowed</th><th className="pb-1 text-right font-medium">Taken</th><th className="pb-1 text-right font-medium">Left</th></tr></thead>
              <tbody>{p.leave.map((l: any) => <tr key={l.name}><td className="py-0.5">{l.name}</td><td className="num py-0.5 text-right">{days(l.allotted)}</td><td className="num py-0.5 text-right">{days(l.used)}</td><td className="num py-0.5 text-right font-semibold">{days(l.left)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-auto pt-6 text-center text-[10.5px] text-[var(--doc-muted)]">This is a computer-generated payslip and does not need a signature.</p>
    </Paper>
  )
}

/** The appointment letter for a new employee. `d` comes from GET /payroll/appointment/:employeeId. */
export function AppointmentLetter({ d, org, date = todayStr() }: { d: any; org: any; date?: string }) {
  const e = d.employee
  const s = d.settings
  const company = org.legalName || org.name
  const where = org.city ? ` at our office in ${org.city}` : ''
  const mgr = e.reportingManager
  const leave = (d.leaveTypes as { name: string; days: number }[]).map((t) => `${t.days} days of ${t.name.toLowerCase()}`)
  const leaveText = leave.length > 1 ? `${leave.slice(0, -1).join(', ')} and ${leave.at(-1)}` : leave[0]
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`
  const terms: [string, React.ReactNode][] = [
    ['Date of joining', <>You will join us on <b className="font-semibold">{fmtDate(e.dateOfJoining)}</b>{where}.</>],
    ...(mgr ? [['Reporting', <>You will report to {personName(mgr)}{mgr.designation ? `, ${mgr.designation}` : ''}, or to anyone the company names later.</>] as [string, React.ReactNode]] : []),
    ['Salary', d.annual > 0
      ? <>Your salary is <b className="num font-semibold">{inr(d.annual)}</b> a year, that is <span className="num">{inr(d.monthly)}</span> a month, paid every month{s.payDay ? ` by the ${ordinal(s.payDay)} of the following month` : ''}. The breakup is in Annexure A.</>
      : <>Your salary will be shared with you separately.</>],
    ...(s.probationMonths ? [['Probation', <>You will be on probation for {s.probationMonths} months from your date of joining. Your appointment will be confirmed in writing after it is completed successfully.</>] as [string, React.ReactNode]] : []),
    ...(s.workHours ? [['Working hours', <>{s.workHours}</>] as [string, React.ReactNode]] : []),
    ...(leaveText ? [['Leave', <>You are entitled to {leaveText} each calendar year, as per the company leave policy.</>] as [string, React.ReactNode]] : []),
    ['Notice period', <>Either you or the company may end this appointment by giving {s.noticeMonths} {s.noticeMonths === 1 ? "month's" : "months'"} notice in writing, or salary in place of the notice.</>],
    ['Confidentiality', <>You will keep the information of the company and its clients confidential, during and after your employment. All work you create for the company belongs to the company.</>],
    ['Documents', <>Please bring copies of your identity proof, address proof, educational certificates, PAN card and bank details on your first day.</>],
  ]
  return (
    <Paper org={org} dense>
      <PaperHeader org={org} title="APPOINTMENT LETTER" />
      <InfoStrip items={[['Reference', String(e.employeeCode).includes('/EMP/') ? e.employeeCode.replace('/EMP/', '/APT/') : `APT/${e.employeeCode}`], ['Date', fmtDate(date)], ['Employment', human(e.employmentType)], ['Joining on', fmtDate(e.dateOfJoining)]]} />
      <div className="text-[12.5px]">
        <Label>To</Label>
        <div className="mt-1 text-[15px] font-semibold">{personName(e)}</div>
        {e.address && <div className="max-w-sm whitespace-pre-line text-[var(--doc-muted)]">{e.address}</div>}
        {e.phone && <div className="text-[var(--doc-muted)]">{e.phone}</div>}
      </div>
      <div className="space-y-2 text-[11.5px] leading-[1.55]">
        <p className="font-semibold">Subject: Appointment as {e.designation}</p>
        <p>Dear {e.firstName},</p>
        <p>We are pleased to appoint you as <b className="font-semibold">{e.designation}</b>{e.department?.name ? <> in the {e.department.name} team</> : null} at {company}, on the following terms.</p>
        <ol className="space-y-0.5">
          {terms.map(([k, v], i) => (
            <li key={k} className="grid grid-cols-[22px_1fr] gap-1"><span className="num font-semibold text-[var(--doc-cyan)]">{i + 1}.</span><span><b className="font-semibold">{k}.</b> {v}</span></li>
          ))}
        </ol>
        <p>Please sign and return a copy of this letter to show that you accept these terms. We look forward to working with you.</p>
      </div>
      {d.annual > 0 && (
        <div className="break-inside-avoid">
          <Label>Annexure A: salary breakup</Label>
          <table className="mt-2 w-full border-separate border-spacing-0 text-[12.5px]">
            <thead><tr className="text-left text-[11px] text-white"><th className="rounded-l-md bg-[var(--doc-navy)] px-3 py-2.5 font-semibold">Component</th><th className="bg-[var(--doc-navy)] px-3 py-2.5 text-right font-semibold">Monthly</th><th className="rounded-r-md bg-[var(--doc-navy)] px-3 py-2.5 text-right font-semibold">Yearly</th></tr></thead>
            <tbody>
              {d.salary.map((l: any) => <tr key={l.name}><td className="border-b border-[var(--doc-line)] px-3 py-1">{l.name}</td><td className="num border-b border-[var(--doc-line)] px-3 py-1 text-right">{inr(l.amount)}</td><td className="num border-b border-[var(--doc-line)] px-3 py-1 text-right">{inr(l.annual)}</td></tr>)}
              <tr className="font-semibold"><td className="px-3 py-2">Total</td><td className="num px-3 py-2 text-right">{inr(d.monthly)}</td><td className="num px-3 py-2 text-right">{inr(d.annual)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1.5 text-[10.5px] text-[var(--doc-muted)]">No provident fund, ESI, professional tax or TDS is deducted at present.</p>
        </div>
      )}
      <Signatures org={org} client={`Accepted by ${personName(e)}`} />
    </Paper>
  )
}


/** A labelled line to write on. Shows the value instead when there is one. */
function Blank({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <div className="text-[9.5px] font-medium tracking-wider text-[var(--doc-muted)] uppercase">{label}</div>
      <div className="min-h-[24px] border-b border-[var(--doc-muted)]/50 pt-1 pb-0.5 text-[12.5px] font-medium">{value || ''}</div>
    </div>
  )
}
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`break-inside-avoid ${className ?? ''}`}>
      <div className="mb-2 flex items-center gap-2"><span className="h-3.5 w-1 rounded-full bg-[var(--doc-cyan)]" /><span className="text-[12px] font-bold tracking-wide text-[var(--doc-navy)] uppercase">{title}</span></div>
      {children}
    </section>
  )
}
function GridTable({ head, rows }: { head: string[]; rows: number }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-[11px]">
      <thead><tr className="text-left text-white">{head.map((h, i) => <th key={h} className={`bg-[var(--doc-navy)] px-2 py-1.5 font-semibold ${i === 0 ? 'rounded-l-md' : ''} ${i === head.length - 1 ? 'rounded-r-md' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{Array.from({ length: rows }, (_, r) => <tr key={r}>{head.map((h) => <td key={h} className="h-8 border-b border-[var(--doc-line)] px-2" />)}</tr>)}</tbody>
    </table>
  )
}

/** The joining form a new person fills in on their first day, with the company rules they sign. `d` comes from GET /payroll/joining/:id. */
export function JoiningForm({ d, org }: { d: any; org: any }) {
  const e = d.employee
  const s = d.settings
  const company = org.legalName || org.name
  const rules: string[] = String(s.terms ?? '').split('\n').map((t: string) => t.trim()).filter(Boolean)
  const leave = (d.leaveTypes as { name: string; days: number }[]).map((t) => `${t.days} days of ${t.name.toLowerCase()}`).join(', ')
  const facts = [
    leave && `Leave each calendar year: ${leave}.`,
    `Notice period: ${s.noticeMonths} ${s.noticeMonths === 1 ? 'month' : 'months'}.`,
    s.probationMonths && `Probation: ${s.probationMonths} months from the date of joining.`,
    s.workHours && `Working hours: ${s.workHours}.`,
  ].filter(Boolean) as string[]
  const g2 = 'grid grid-cols-2 gap-x-6 gap-y-2.5'
  return (
    <Paper org={org} dense>
      <PaperHeader org={org} title="JOINING FORM"><div className="mt-2 text-[11px] text-[var(--doc-muted)]">Please fill in clearly in capital letters</div></PaperHeader>
      <div className="flex gap-6">
        <div className={`${g2} flex-1`}>
          <Blank label="Full name" value={e && personName(e)} wide />
          <Blank label="Father's or spouse's name" />
          <Blank label="Date of birth" value={e?.dateOfBirth && fmtDate(e.dateOfBirth)} />
          <Blank label="Gender" value={e?.gender} />
          <Blank label="Blood group" />
          <Blank label="Mobile number" value={e?.phone} />
          <Blank label="Personal email" value={e?.personalEmail} />
        </div>
        <div className="grid h-[132px] w-[108px] shrink-0 place-items-center rounded-md border border-dashed border-[var(--doc-muted)] text-center text-[10px] text-[var(--doc-muted)]">Paste a<br />passport size<br />photo</div>
      </div>
      <Section title="Address">
        <div className={g2}><Blank label="Current address" value={e?.address} wide /><Blank label="Permanent address" wide /></div>
      </Section>
      <Section title="Identity and bank details">
        <div className={g2}>
          <Blank label="Aadhaar number" /><Blank label="PAN number" />
          <Blank label="Name as in bank account" /><Blank label="Bank and branch" />
          <Blank label="Account number" /><Blank label="IFSC code" />
        </div>
      </Section>
      <Section title="Emergency contact">
        <div className="grid grid-cols-3 gap-x-6"><Blank label="Name" /><Blank label="Relationship" /><Blank label="Phone" /></div>
      </Section>
      <Section title="Education"><GridTable head={['Qualification', 'School or college', 'Year', 'Marks %']} rows={3} /></Section>
      <Section title="Previous work, if any"><GridTable head={['Company', 'Role', 'From', 'To', 'Last salary']} rows={2} /></Section>
      <Section title="For office use">
        <div className="grid grid-cols-3 gap-x-6 gap-y-2.5">
          <Blank label="Employee code" value={e?.employeeCode} /><Blank label="Designation" value={e?.designation} /><Blank label="Department" value={e?.department?.name} />
          <Blank label="Date of joining" value={e?.dateOfJoining && fmtDate(e.dateOfJoining)} /><Blank label="Yearly salary" value={e?.ctcAnnual ? inr(e.ctcAnnual) : ''} /><Blank label="Reports to" value={e?.reportingManager && personName(e.reportingManager)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
          {['Aadhaar copy', 'PAN copy', '2 photos', 'Education certificates', 'Relieving letter', 'Bank passbook or cancelled cheque'].map((x) => <span key={x} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-[var(--doc-muted)]" />{x}</span>)}
        </div>
      </Section>
      <Section title="Terms and conditions">
        <ol className="space-y-1 text-[11.5px] leading-[1.55]">
          {[...facts, ...rules].map((t, i) => <li key={i} className="grid grid-cols-[20px_1fr]"><span className="num font-semibold text-[var(--doc-cyan)]">{i + 1}.</span><span>{t}</span></li>)}
        </ol>
      </Section>
      <Section title="Declaration">
        <p className="text-[11.5px] leading-[1.55]">I confirm that the details above are true. I have read the terms and conditions of {company} and agree to follow them. I will tell HR in writing if any of these details change.</p>
        <div className="mt-8 grid grid-cols-3 gap-6 text-[11px] text-[var(--doc-muted)]">
          <div className="border-t border-[var(--doc-muted)] pt-1.5">Employee signature</div>
          <div className="border-t border-[var(--doc-muted)] pt-1.5">Date and place</div>
          <div className="border-t border-[var(--doc-muted)] pt-1.5">HR, for {company}</div>
        </div>
      </Section>
    </Paper>
  )
}

// ── Letters and certificates. `opts` comes from the small form above the page on the print screen. ──

/** A reference number from the employee code: CMX/EMP/26-27/0002 becomes CMX/OFR/26-27/0002. */
const refFor = (code: string, kind: string) => (String(code).includes('/EMP/') ? code.replace('/EMP/', `/${kind}/`) : `${kind}/${code}`)
/** Pronouns from the gender HR saved on the employee; "they" when it is not set. */
const pron = (e: any) => {
  const g = String(e?.gender ?? '').trim().toLowerCase()
  if (g.startsWith('f')) return { sub: 'she', obj: 'her', pos: 'her', title: 'Ms.' }
  if (g.startsWith('m')) return { sub: 'he', obj: 'him', pos: 'his', title: 'Mr.' }
  return { sub: 'they', obj: 'them', pos: 'their', title: '' }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const Body = ({ children }: { children: React.ReactNode }) => <div className="space-y-3 text-[12.5px] leading-[1.7]">{children}</div>
function ToBlock({ e, label = 'To' }: { e: any; label?: string }) {
  return (
    <div className="text-[12.5px]">
      <Label>{label}</Label>
      <div className="mt-1 text-[15px] font-semibold">{personName(e)}</div>
      {e.address && <div className="max-w-sm whitespace-pre-line text-[var(--doc-muted)]">{e.address}</div>}
      {e.phone && <div className="text-[var(--doc-muted)]">{e.phone}</div>}
    </div>
  )
}

/** Offer letter, sent before joining. `d` comes from GET /payroll/appointment/:id (it has the salary breakup). */
export function OfferLetter({ d, org, opts }: { d: any; org: any; opts: { date: string; replyBy: string; joining: string } }) {
  const e = d.employee
  const s = d.settings
  const company = org.legalName || org.name
  return (
    <Paper org={org} dense>
      <PaperHeader org={org} title="OFFER LETTER" />
      <InfoStrip items={[['Reference', refFor(e.employeeCode, 'OFR')], ['Date', fmtDate(opts.date)], ['Position', e.designation], ['Reply by', fmtDate(opts.replyBy)]]} />
      <ToBlock e={e} />
      <Body>
        <p className="font-semibold">Subject: Offer of employment as {e.designation}</p>
        <p>Dear {e.firstName},</p>
        <p>Thank you for your interest in {company}. We are happy to offer you the position of <b className="font-semibold">{e.designation}</b>{e.department?.name ? <> in our {e.department.name} team</> : null}, on a {human(e.employmentType).toLowerCase()} basis.</p>
        <div className="grid grid-cols-[150px_1fr] gap-y-1.5 rounded-lg bg-[var(--doc-tint)] px-5 py-3.5">
          <span className="text-[var(--doc-muted)]">Joining date</span><span className="font-semibold">{fmtDate(opts.joining)}</span>
          <span className="text-[var(--doc-muted)]">Place of work</span><span className="font-semibold">{org.city || org.state || 'Our office'}</span>
          {d.annual > 0 && <><span className="text-[var(--doc-muted)]">Salary</span><span className="font-semibold"><span className="num">{inr(d.annual)}</span> a year (<span className="num">{inr(d.monthly)}</span> a month)</span></>}
          {s.probationMonths ? <><span className="text-[var(--doc-muted)]">Probation</span><span className="font-semibold">{s.probationMonths} months</span></> : null}
          <span className="text-[var(--doc-muted)]">Notice period</span><span className="font-semibold">{s.noticeMonths} {s.noticeMonths === 1 ? 'month' : 'months'}</span>
          {s.workHours && <><span className="text-[var(--doc-muted)]">Working hours</span><span className="font-semibold">{s.workHours}</span></>}
        </div>
        <p>This offer depends on the details and documents you give us being correct. A detailed appointment letter will be given to you when you join.</p>
        <p>Please sign and return a copy of this letter by <b className="font-semibold">{fmtDate(opts.replyBy)}</b> to accept the offer. After that date the offer lapses unless we agree otherwise in writing.</p>
        <p>We look forward to having you with us.</p>
      </Body>
      <Signatures org={org} client={`Accepted by ${personName(e)}`} />
    </Paper>
  )
}

/** Internship certificate. `d` comes from GET /payroll/joining/:id. */
export function InternshipCertificate({ d, org, opts }: { d: any; org: any; opts: { date: string; from: string; to: string; work: string } }) {
  const e = d.employee
  const p = pron(e)
  const company = org.legalName || org.name
  const name = [p.title, personName(e)].filter(Boolean).join(' ')
  return (
    <Paper org={org}>
      <PaperHeader org={org} title="INTERNSHIP CERTIFICATE" />
      <InfoStrip items={[['Certificate no.', refFor(e.employeeCode, 'INT')], ['Date', fmtDate(opts.date)], ['From', fmtDate(opts.from)], ['To', fmtDate(opts.to)]]} />
      <div className="py-4 text-center">
        <Label>To whom it may concern</Label>
        <div className="mt-6 text-[13px] text-[var(--doc-muted)]">This is to certify that</div>
        <div className="mt-2 text-[28px] leading-tight font-bold text-[var(--doc-navy)]">{name}</div>
        <div className="mx-auto mt-3 h-1 w-24 rounded-full bg-[var(--doc-cyan)]" />
        <p className="mx-auto mt-5 max-w-xl text-[13px] leading-[1.8]">
          has completed an internship as <b className="font-semibold">{e.designation}</b>{e.department?.name ? <> in the {e.department.name} team</> : null} at {company}, from <b className="font-semibold">{fmtDate(opts.from)}</b> to <b className="font-semibold">{fmtDate(opts.to)}</b>.
        </p>
      </div>
      <Body>
        {opts.work && <p>During the internship {p.sub} {opts.work.trim().replace(/\.$/, '')}.</p>}
        <p>We found {p.obj} sincere, hardworking and eager to learn, and {p.pos} conduct was good throughout. We wish {p.obj} every success.</p>
      </Body>
      <Signatures org={org} />
    </Paper>
  )
}

/** Experience letter for someone who has left. `d` comes from GET /payroll/joining/:id. */
export function ExperienceLetter({ d, org, opts }: { d: any; org: any; opts: { date: string; lastDay: string } }) {
  const e = d.employee
  const p = pron(e)
  const company = org.legalName || org.name
  const name = [p.title, personName(e)].filter(Boolean).join(' ')
  return (
    <Paper org={org}>
      <PaperHeader org={org} title="EXPERIENCE LETTER" />
      <InfoStrip items={[['Reference', refFor(e.employeeCode, 'EXP')], ['Date', fmtDate(opts.date)], ['Designation', e.designation], ['Last working day', fmtDate(opts.lastDay)]]} />
      <div className="text-[12.5px]"><Label>To whom it may concern</Label></div>
      <Body>
        <p>This is to certify that <b className="font-semibold">{name}</b> worked with {company} as <b className="font-semibold">{e.designation}</b>{e.department?.name ? <> in the {e.department.name} team</> : null}, from <b className="font-semibold">{fmtDate(e.dateOfJoining)}</b> to <b className="font-semibold">{fmtDate(opts.lastDay)}</b>.</p>
        <p>{cap(p.sub)} {p.sub === 'they' ? 'have' : 'has'} been relieved of {p.pos} duties. {cap(p.pos)} work and conduct during this time were good.</p>
        <p>We thank {p.obj} for {p.pos} contribution and wish {p.obj} success in the future.</p>
      </Body>
      <Signatures org={org} />
    </Paper>
  )
}

/** The company's terms and conditions for staff, on their own. `d` comes from GET /payroll/joining/new. */
export function StaffTerms({ d, org, opts }: { d: any; org: any; opts: { date: string } }) {
  const s = d.settings
  const company = org.legalName || org.name
  const leave = (d.leaveTypes as { name: string; days: number }[]).map((t) => `${t.days} days of ${t.name.toLowerCase()}`).join(', ')
  const rules = [
    leave && `Leave each calendar year: ${leave}.`,
    s.workHours && `Working hours: ${s.workHours}.`,
    s.probationMonths && `Probation: ${s.probationMonths} months from the date of joining.`,
    `Notice period: ${s.noticeMonths} ${s.noticeMonths === 1 ? 'month' : 'months'}, in writing, from either side.`,
    ...String(s.terms ?? '').split('\n').map((t: string) => t.trim()).filter(Boolean),
  ].filter(Boolean) as string[]
  return (
    <Paper org={org}>
      <PaperHeader org={org} title="TERMS AND CONDITIONS"><div className="mt-2 text-[11px] text-[var(--doc-muted)]">For everyone working at {company}</div></PaperHeader>
      <InfoStrip items={[['Applies from', fmtDate(opts.date)], ['Applies to', 'All staff and interns']]} />
      <ol className="space-y-2.5 text-[12.5px] leading-[1.65]">
        {rules.map((t, i) => <li key={i} className="grid grid-cols-[26px_1fr]"><span className="num font-semibold text-[var(--doc-cyan)]">{i + 1}.</span><span>{t}</span></li>)}
      </ol>
      <p className="text-[12px] leading-[1.6] text-[var(--doc-muted)]">The company may update these terms. Staff will be told in writing of any change.</p>
      <div className="mt-auto grid grid-cols-3 gap-6 pt-10 text-[11px] text-[var(--doc-muted)]">
        <div className="border-t border-[var(--doc-muted)] pt-1.5">Name of employee</div>
        <div className="border-t border-[var(--doc-muted)] pt-1.5">Signature and date</div>
        <div className="border-t border-[var(--doc-muted)] pt-1.5">HR, for {company}</div>
      </div>
    </Paper>
  )
}
