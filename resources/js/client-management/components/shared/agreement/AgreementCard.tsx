import { AgreementStatusBadges, CadenceBadge } from '@/client-management/components/admin/ClientBadges'
import type { Agreement } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'

interface AgreementCardProps {
  agreement: Agreement
  onOpen?: ((agreement: Agreement) => void) | undefined
  actionLabel?: string
}

/**
 * A single agreement row: active date, cadence/status badges, retainer summary
 * and an open action. Shared by the overview and the agreements timeline so the
 * badge and layout logic lives in one place.
 */
export default function AgreementCard({ agreement, onOpen, actionLabel = 'Open' }: AgreementCardProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 hover:bg-muted/40 ${onOpen ? 'cursor-pointer' : ''}`}
      onClick={onOpen ? () => onOpen(agreement) : undefined}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{new Date(agreement.active_date).toLocaleDateString()}</span>
          <CadenceBadge value={agreement.billing_cadence ?? 'monthly'} />
          <AgreementStatusBadges
            signedAt={agreement.client_company_signed_date}
            terminatedAt={agreement.termination_date}
            visible={agreement.is_visible_to_client}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {`${agreement.monthly_retainer_hours} hrs/mo at $${agreement.monthly_retainer_fee}/mo`}
        </p>
      </div>
      {onOpen && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(agreement)
          }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
