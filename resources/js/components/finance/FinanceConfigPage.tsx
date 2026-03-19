'use client'

import EmploymentEntitySection from '@/components/finance/EmploymentEntitySection'
import MarriageStatusSection from '@/components/finance/MarriageStatusSection'
import RulesList from '@/components/finance/rules_engine/RulesList'

export default function FinanceConfigPage() {
  return (
    <div className="px-4 pb-8 space-y-8">
      <RulesList />
      <EmploymentEntitySection />
      <MarriageStatusSection />
    </div>
  )
}
