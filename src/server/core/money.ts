// Only Admin sees money. These helpers take amounts out of what other people read, and ignore amounts they send.
import type { AuthUser } from './auth'
import type { NextFunction, Request, Response } from './router'

/** The money fields found on leads, deals, projects, milestones, invoices, payments and staff records. */
export const MONEY_KEYS = [
  'amount', 'amountPaid', 'balanceDue', 'basePrice', 'billingAmount', 'budget', 'cgstAmount', 'cost', 'creditLimit', 'creditedAmount',
  'ctcAnnual', 'discountAmount', 'discountTotal', 'estimatedValue', 'gross', 'hourlyCost', 'igstAmount', 'lineTotal', 'maxAmount', 'minAmount',
  'monthlySalary', 'netPay', 'openingBalance', 'price', 'purchaseCost', 'renewalCost', 'sgstAmount', 'subtotal', 'taxAmount', 'taxableAmount',
  'tdsAmount', 'totalAmount', 'totalDeductions', 'totalGross', 'totalNet', 'unitPrice',
] as const

/** A copy of `v` without the given keys, at any depth. Dates and other objects that are not plain stay as they are. */
export function stripKeys(v: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => stripKeys(x, keys))
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) if (!keys.has(k)) out[k] = stripKeys(x, keys)
    return out
  }
  return v
}

/**
 * Router middleware: for anyone but Admin, the named money fields are removed from every answer,
 * and the same fields in what they send are ignored, so saving a form never wipes an amount they cannot see.
 */
export const hideMoney = (keys: readonly string[] = MONEY_KEYS, allowed?: (u: AuthUser) => boolean) => {
  const set = new Set(keys)
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user && !req.user.admin && !allowed?.(req.user)) {
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body = stripKeys(req.body, set)
      const json = res.json.bind(res)
      res.json = (value: unknown) => json(stripKeys(value, set))
    }
    next()
  }
}
