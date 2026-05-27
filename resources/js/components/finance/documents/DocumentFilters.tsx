import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { DEFAULT_DOCUMENT_FILTERS, type DocumentFilterState, KIND_FILTERS } from './types'

interface DocumentFiltersProps {
  activeKind: string
  filters: DocumentFilterState
  onKindChange: (kind: string) => void
  onFilterChange: (key: keyof DocumentFilterState, value: string) => void
  onClear: () => void
}

export default function DocumentFilters({
  activeKind,
  filters,
  onKindChange,
  onFilterChange,
  onClear,
}: DocumentFiltersProps) {
  const hasAdvancedFilter = Object.entries(filters).some(([key, value]) => {
    return value !== DEFAULT_DOCUMENT_FILTERS[key as keyof DocumentFilterState]
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {KIND_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={activeKind === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onKindChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FilterInput
          label="Tax Year"
          type="number"
          value={filters.tax_year}
          onChange={(value) => onFilterChange('tax_year', value)}
        />
        <FilterInput
          label="Account ID"
          type="number"
          value={filters.account_id}
          onChange={(value) => onFilterChange('account_id', value)}
        />
        <FilterInput
          label="Form Type"
          value={filters.form_type}
          onChange={(value) => onFilterChange('form_type', value)}
        />
        <FilterInput
          label="Source Job ID"
          type="number"
          value={filters.source_job_id}
          onChange={(value) => onFilterChange('source_job_id', value)}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label="GenAI"
          value={filters.genai_status}
          onChange={(value) => onFilterChange('genai_status', value)}
          options={[
            ['', 'Any GenAI status'],
            ['pending', 'Pending'],
            ['processing', 'Processing'],
            ['parsed', 'Parsed'],
            ['completed', 'Completed'],
            ['failed', 'Failed'],
          ]}
        />
        <FilterSelect
          label="Processing"
          value={filters.processing_status}
          onChange={(value) => onFilterChange('processing_status', value)}
          options={[
            ['', 'Any processing status'],
            ['pending', 'Pending'],
            ['processing', 'Processing'],
            ['parsed', 'Parsed'],
            ['completed', 'Completed'],
            ['failed', 'Failed'],
            ['needs_review', 'Needs review'],
            ['reviewed', 'Reviewed'],
            ['unreviewed', 'Unreviewed'],
          ]}
        />
        <FilterSelect
          label="Reviewed"
          value={filters.is_reviewed}
          onChange={(value) => onFilterChange('is_reviewed', value)}
          options={[
            ['', 'Any review state'],
            ['1', 'Reviewed'],
            ['0', 'Unreviewed'],
          ]}
        />
        <FilterSelect
          label="Sort"
          value={filters.sort}
          onChange={(value) => onFilterChange('sort', value)}
          options={[
            ['default', 'Default order'],
            ['created_desc', 'Newest first'],
            ['period_end_desc', 'Period end'],
            ['tax_year_desc', 'Tax year'],
            ['name_asc', 'Name'],
            ['kind_asc', 'Kind'],
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterToggle label="Missing account" value={filters.missing_account} onChange={(value) => onFilterChange('missing_account', value)} />
        <FilterToggle label="Has tax document" value={filters.has_tax_document} onChange={(value) => onFilterChange('has_tax_document', value)} />
        <FilterToggle label="Has statement" value={filters.has_statement} onChange={(value) => onFilterChange('has_statement', value)} />
        <FilterToggle label="Has lots" value={filters.has_lots} onChange={(value) => onFilterChange('has_lots', value)} />
        {(activeKind !== 'all' || hasAdvancedFilter) && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}

interface FilterInputProps {
  label: string
  type?: 'text' | 'number'
  value: string
  onChange: (value: string) => void
}

function FilterInput({ label, type = 'text', value, onChange }: FilterInputProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-sm"
      />
    </label>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

interface FilterToggleProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function FilterToggle({ label, value, onChange }: FilterToggleProps) {
  return (
    <Button
      variant={value === '1' ? 'default' : 'outline'}
      size="sm"
      onClick={() => onChange(value === '1' ? '' : '1')}
    >
      {label}
    </Button>
  )
}
