import { type PhrTabKey,phrTabs } from '@/phr/navigation'

interface PhrNavbarProps {
  activeTab: PhrTabKey
  patientId?: number | null
}

export default function PhrNavbar({ activeTab, patientId }: PhrNavbarProps) {
  return (
    <nav aria-label="PHR tabs" className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        {phrTabs.map((tab) => {
          const href = tab.patientScoped && patientId ? `${tab.path}?patient_id=${patientId}` : tab.path
          const isActive = tab.key === activeTab

          return (
            <a
              key={tab.key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-primary bg-accent text-accent-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {tab.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
