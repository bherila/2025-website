import type { ClientCompanyActivity } from '@/client-management/types/common'

export type ActivityTone = 'default' | 'green' | 'red' | 'blue'

export interface FormattedActivity {
  id: number
  title: string
  subtitle?: string | undefined
  actorLabel: string
  timestamp: string
  tone: ActivityTone
  isSystemNoise: boolean
}

const ACTION_TITLES: Record<string, string> = {
  'company.updated': 'Company updated',
  'agreement.created': 'Agreement created',
  'agreement.signed': 'Agreement signed',
  'agreement.transitioned': 'Agreement transitioned',
  'invoice.generated': 'Invoice generated',
  'invoice.updated': 'Invoice updated',
  'invoice.issued': 'Invoice issued',
  'invoice.voided': 'Invoice voided',
  'invoice.marked_paid': 'Invoice marked paid',
  'invoice.payment_received': 'Payment received',
  'invoice.payment_failed': 'Payment failed',
  'invoice.payment_disputed': 'Payment disputed',
  'invoice.payment_refunded': 'Payment refunded',
  'payment_method.added': 'Payment method added',
  'payment_method.removed': 'Payment method removed',
  'payment_method.default_changed': 'Default payment method changed',
}

/** Actions worth surfacing by default; everything else is collapsed as system noise. */
const MEANINGFUL_ACTIONS = new Set<string>([
  'company.updated',
  'agreement.created',
  'agreement.signed',
  'agreement.transitioned',
  'invoice.issued',
  'invoice.voided',
  'invoice.marked_paid',
  'invoice.payment_received',
  'invoice.payment_failed',
  'invoice.payment_disputed',
  'invoice.payment_refunded',
])

const RED_ACTIONS = new Set<string>(['invoice.voided', 'invoice.payment_failed', 'invoice.payment_disputed'])
const GREEN_ACTIONS = new Set<string>(['invoice.marked_paid', 'invoice.payment_received', 'agreement.signed'])
const BLUE_ACTIONS = new Set<string>(['invoice.issued', 'agreement.created'])

function toneForAction(action: string): ActivityTone {
  if (RED_ACTIONS.has(action)) {
    return 'red'
  }
  if (GREEN_ACTIONS.has(action)) {
    return 'green'
  }
  if (BLUE_ACTIONS.has(action)) {
    return 'blue'
  }

  return 'default'
}

function titleForAction(action: string): string {
  return ACTION_TITLES[action] ?? action.replaceAll('.', ' ').replaceAll('_', ' ')
}

function describeChange(field: string, change: unknown): string | null {
  if (Array.isArray(change) && change.length === 2) {
    return `${field.replaceAll('_', ' ')} ${String(change[0])} → ${String(change[1])}`
  }

  return null
}

function subtitleForActivity(activity: ClientCompanyActivity): string | undefined {
  const payload = activity.payload ?? {}
  const changes = payload.changes

  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    const parts = Object.entries(changes as Record<string, unknown>)
      .map(([field, change]) => describeChange(field, change))
      .filter((part): part is string => part !== null)
      .slice(0, 3)

    if (parts.length > 0) {
      return parts.join(', ')
    }
  }

  const invoiceKind = payload.invoice_kind
  if (typeof invoiceKind === 'string' && invoiceKind !== '') {
    return invoiceKind.replaceAll('_', ' ')
  }

  return undefined
}

/** Maps a raw activity record into a display-ready, tone-tagged view model. */
export function formatActivity(activity: ClientCompanyActivity): FormattedActivity {
  return {
    id: activity.id,
    title: titleForAction(activity.action),
    subtitle: subtitleForActivity(activity),
    actorLabel: activity.actor_name ? `By ${activity.actor_name}` : 'System',
    timestamp: activity.created_at ? new Date(activity.created_at).toLocaleString() : '',
    tone: toneForAction(activity.action),
    isSystemNoise: !MEANINGFUL_ACTIONS.has(activity.action),
  }
}
