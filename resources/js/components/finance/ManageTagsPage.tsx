'use client'
import { ChevronsUpDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { TagTotalsView } from '@/components/finance/TagTotalsView'
import { type FinanceTag, useFinanceTags } from '@/components/finance/useFinanceTags'
import CustomLink from '@/components/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'
import { cn } from '@/lib/utils'
import { getTagColorDark, getTagColorHex, getTagColorLight } from '@/lib/finance/tagColorUtils'
import { accountsUrl } from '@/lib/financeRouteBuilder'

const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
]

const SCHEDULE_C_INCOME_OPTIONS: { value: string; label: string }[] = [
  { value: 'business_income', label: 'Gross receipts or sales (Business Income)' },
  { value: 'business_returns', label: 'Returns and allowances' },
]

const SCHEDULE_C_EXPENSE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sce_advertising', label: 'Advertising' },
  { value: 'sce_car_truck', label: 'Car and truck expenses' },
  { value: 'sce_commissions_fees', label: 'Commissions and fees' },
  { value: 'sce_contract_labor', label: 'Contract labor' },
  { value: 'sce_depletion', label: 'Depletion' },
  { value: 'sce_depreciation', label: 'Depreciation and Section 179 expense' },
  { value: 'sce_employee_benefits', label: 'Employee benefit programs' },
  { value: 'sce_insurance', label: 'Insurance (other than health)' },
  { value: 'sce_interest_mortgage', label: 'Interest (mortgage)' },
  { value: 'sce_interest_other', label: 'Interest (other)' },
  { value: 'sce_legal_professional', label: 'Legal and professional services' },
  { value: 'sce_office_expenses', label: 'Office expenses' },
  { value: 'sce_pension', label: 'Pension and profit-sharing plans' },
  { value: 'sce_rent_vehicles', label: 'Rent or lease (vehicles, machinery, equipment)' },
  { value: 'sce_rent_property', label: 'Rent or lease (other business property)' },
  { value: 'sce_repairs_maintenance', label: 'Repairs and maintenance' },
  { value: 'sce_supplies', label: 'Supplies' },
  { value: 'sce_taxes_licenses', label: 'Taxes and licenses' },
  { value: 'sce_travel', label: 'Travel' },
  { value: 'sce_meals', label: 'Meals' },
  { value: 'sce_utilities', label: 'Utilities' },
  { value: 'sce_wages', label: 'Wages' },
  { value: 'sce_other', label: 'Other expenses' },
]

const SCHEDULE_C_HOME_OFFICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'scho_rent', label: 'Rent' },
  { value: 'scho_mortgage_interest', label: 'Mortgage interest (business-use portion)' },
  { value: 'scho_real_estate_taxes', label: 'Real estate taxes' },
  { value: 'scho_insurance', label: 'Homeowners or renters insurance' },
  { value: 'scho_utilities', label: 'Utilities' },
  { value: 'scho_repairs_maintenance', label: 'Repairs and maintenance' },
  { value: 'scho_security', label: 'Security system costs' },
  { value: 'scho_depreciation', label: 'Depreciation' },
  { value: 'scho_cleaning', label: 'Cleaning services' },
  { value: 'scho_hoa', label: 'HOA fees' },
  { value: 'scho_casualty_losses', label: 'Casualty losses (business-use portion)' },
]

const ALL_TAX_OPTIONS = [
  ...SCHEDULE_C_INCOME_OPTIONS,
  ...SCHEDULE_C_EXPENSE_OPTIONS,
  ...SCHEDULE_C_HOME_OFFICE_OPTIONS,
]

const TAX_OPTION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALL_TAX_OPTIONS.map((o) => [o.value, o.label])
)

function getTaxCharacteristicLabel(value: string | null | undefined): string {
  if (!value || value === 'none') return '—'
  return TAX_OPTION_LABEL_MAP[value] ?? value
}

function ColorPicker({ 
  selectedColor, 
  onColorChange 
}: { 
  selectedColor: string
  onColorChange: (color: string) => void 
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`w-8 h-8 rounded-full border-2 transition-all ${
            selectedColor === color 
              ? 'border-black dark:border-white scale-110' 
              : 'border-transparent hover:border-gray-400'
          }`}
          style={{ backgroundColor: getTagColorHex(color) }}
          onClick={() => onColorChange(color)}
          aria-label={`Select ${color} color`}
          aria-pressed={selectedColor === color}
        />
      ))}
    </div>
  )
}

function TaxCharacteristicCombobox({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const GROUPED_OPTIONS = [
    { label: 'Schedule C: Income', options: SCHEDULE_C_INCOME_OPTIONS },
    { label: 'Schedule C: Expense', options: SCHEDULE_C_EXPENSE_OPTIONS },
    { label: 'Schedule C: Home Office Item', options: SCHEDULE_C_HOME_OFFICE_OPTIONS },
  ]

  const NONE_OPTION = { value: 'none', label: 'None (no tax characteristic)' }

  const q = search.toLowerCase()
  const filteredGroups = GROUPED_OPTIONS.map((group) => ({
    ...group,
    options: group.options.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.includes(q)),
  })).filter((g) => g.options.length > 0)
  const showNone = !q || NONE_OPTION.label.toLowerCase().includes(q)

  const selectedLabel =
    value === 'none' || !value
      ? NONE_OPTION.label
      : (ALL_TAX_OPTIONS.find((o) => o.value === value)?.label ?? value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full max-w-sm justify-between font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-w-sm p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search tax characteristics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {showNone && (
            <button
              type="button"
              className={cn(
                'w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-sm',
                (value === 'none' || !value) && 'bg-accent font-medium',
              )}
              onClick={() => { onChange('none'); setOpen(false); setSearch('') }}
            >
              None
            </button>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {group.label}
              </div>
              {group.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-sm',
                    value === opt.value && 'bg-accent font-medium',
                  )}
                  onClick={() => { onChange(opt.value); setOpen(false); setSearch('') }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
          {!showNone && filteredGroups.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matching characteristics found.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function ManageTagsPage() {
  const { tags, setTags, isLoading, error: tagsError, refreshTags } = useFinanceTags({ includeCounts: true, includeTotals: true })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState('blue')
  const [newTagTaxChar, setNewTagTaxChar] = useState<string>('none')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  
  // Edit dialog state
  const [editingTag, setEditingTag] = useState<FinanceTag | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editTaxChar, setEditTaxChar] = useState<string>('none')
  const [isUpdating, setIsUpdating] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  
  // Delete confirmation state
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<FinanceTag | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCreateTag = async () => {
    if (!newTagLabel.trim()) {
      setCreateError('Tag label is required')
      return
    }

    try {
      setIsCreating(true)
      setCreateError(null)
      await fetchWrapper.post('/api/finance/tags', {
        tag_label: newTagLabel.trim(),
        tag_color: newTagColor,
        tax_characteristic: newTagTaxChar === 'none' ? null : newTagTaxChar,
      })
      setSuccessMessage('Tag created successfully')
      setNewTagLabel('')
      setNewTagColor('blue')
      setNewTagTaxChar('none')
      setCreateDialogOpen(false)
      await refreshTags()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartEdit = (tag: FinanceTag) => {
    setEditingTag(tag)
    setEditLabel(tag.tag_label)
    setEditColor(tag.tag_color)
    setEditTaxChar(tag.tax_characteristic || 'none')
    setEditError(null)
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
    setEditLabel('')
    setEditColor('')
    setEditTaxChar('none')
    setEditError(null)
  }

  const handleUpdateTag = async () => {
    if (!editingTag || !editLabel.trim()) {
      setEditError('Tag label is required')
      return
    }

    try {
      setIsUpdating(true)
      setEditError(null)
      const updatedTaxChar = editTaxChar === 'none' ? null : editTaxChar
      await fetchWrapper.put(`/api/finance/tags/${editingTag.tag_id}`, {
        tag_label: editLabel.trim(),
        tag_color: editColor,
        tax_characteristic: updatedTaxChar,
      })
      // Patch the updated tag into local state to avoid page flicker from re-querying
      setTags((prev) =>
        prev.map((t) =>
          t.tag_id === editingTag.tag_id
            ? { ...t, tag_label: editLabel.trim(), tag_color: editColor, tax_characteristic: updatedTaxChar }
            : t,
        ),
      )
      setSuccessMessage('Tag updated successfully')
      setEditingTag(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update tag')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteTag = async () => {
    if (!deleteConfirmTag) return

    try {
      setIsDeleting(true)
      setError(null)
      await fetchWrapper.delete(`/api/finance/tags/${deleteConfirmTag.tag_id}`, {})
      setSuccessMessage('Tag deleted successfully')
      setDeleteConfirmTag(null)
      await refreshTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 max-w-3xl mx-auto space-y-4" aria-busy="true" aria-label="Loading tags">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Manage Tags</h1>
      <p className="text-muted-foreground mb-6">
        Tags help you organize and categorize your transactions. Create tags here and then apply them to transactions from the transactions table.
      </p>
      
      {(error || tagsError) && (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertDescription>{error || tagsError}</AlertDescription>
        </Alert>
      )}
      
      {successMessage && (
        <Alert className="mb-4 bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800" role="status">
          <AlertDescription className="text-green-800 dark:text-green-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Your Tags Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Your Tags ({tags.length})</h2>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
            onClick={() => setCreateDialogOpen(true)}
            aria-label="Create new tag"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Create Tag
          </Button>
        </div>
        {tags.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" role="status">
            You haven't created any tags yet. Click "Create Tag" above to get started!
          </div>
        ) : (
          <TooltipProvider>
            <Table aria-label="Your tags">
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Tax Characteristic</TableHead>
                  <TableHead className="w-[120px]">Transactions</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.map((tag) => (
                  <TableRow key={tag.tag_id}>
                    <TableCell className="py-2">
                      <Badge 
                        style={{ 
                          backgroundColor: getTagColorLight(tag.tag_color),
                          color: getTagColorDark(tag.tag_color)
                        }}
                      >
                        {tag.tag_label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-sm text-muted-foreground">
                      {getTaxCharacteristicLabel(tag.tax_characteristic)}
                    </TableCell>
                    <TableCell className="py-2">
                      {tag.transaction_count !== undefined && (
                        <span className="text-sm text-muted-foreground">
                          {tag.transaction_count}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              asChild
                              aria-label={`View all transactions tagged ${tag.tag_label}`}
                            >
                              <a href={`/finance/all-transactions?tag=${encodeURIComponent(tag.tag_label)}`}>
                                <Search className="h-4 w-4" aria-hidden="true" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View all transactions with this tag</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              onClick={() => handleStartEdit(tag)}
                              aria-label={`Edit tag ${tag.tag_label}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit tag</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => setDeleteConfirmTag(tag)}
                              aria-label={`Delete tag ${tag.tag_label}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete tag</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </div>

      {/* Create Tag Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
            <DialogDescription>
              Enter a label, choose a color, and optionally assign a tax characteristic.
            </DialogDescription>
          </DialogHeader>
          {createError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="create-tag-label">Tag Label</Label>
              <Input
                id="create-tag-label"
                type="text"
                value={newTagLabel}
                onChange={(e) => setNewTagLabel(e.target.value)}
                placeholder="Enter tag name"
                maxLength={50}
                className="mt-1"
                aria-required="true"
              />
            </div>
            <div>
              <span id="create-color-label" className="text-sm font-medium">Tag Color</span>
              <div className="mt-1" role="group" aria-labelledby="create-color-label">
                <ColorPicker selectedColor={newTagColor} onColorChange={setNewTagColor} />
              </div>
            </div>
            <div>
              <Label htmlFor="create-tax-char">Tax Characteristic</Label>
              <div className="mt-1">
                <TaxCharacteristicCombobox id="create-tax-char" value={newTagTaxChar} onChange={setNewTagTaxChar} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Preview:</span>
              <Badge 
                style={{ 
                  backgroundColor: getTagColorLight(newTagColor),
                  color: getTagColorDark(newTagColor)
                }}
                aria-label={`Tag preview: ${newTagLabel || 'Tag Name'}`}
              >
                {newTagLabel || 'Tag Name'}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCreateDialogOpen(false); setCreateError(null) }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTag} 
              disabled={isCreating || !newTagLabel.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              {isCreating ? (
                <>
                  <Spinner size="small" className="mr-2" aria-hidden="true" />
                  Creating...
                </>
              ) : (
                'Create Tag'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tag Dialog */}
      <Dialog open={!!editingTag} onOpenChange={(open) => { if (!open) handleCancelEdit() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>
              Update the label, color, or tax characteristic for this tag.
            </DialogDescription>
          </DialogHeader>
          {editError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-tag-label">Tag Label</Label>
              <Input
                id="edit-tag-label"
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Tag name"
                maxLength={50}
                className="mt-1"
                aria-required="true"
              />
            </div>
            <div>
              <span id="edit-color-label" className="text-sm font-medium">Tag Color</span>
              <div className="mt-1" role="group" aria-labelledby="edit-color-label">
                <ColorPicker selectedColor={editColor} onColorChange={setEditColor} />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-tax-char">Tax Characteristic</Label>
              <div className="mt-1">
                <TaxCharacteristicCombobox id="edit-tax-char" value={editTaxChar} onChange={setEditTaxChar} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Preview:</span>
              <Badge 
                style={{ 
                  backgroundColor: getTagColorLight(editColor),
                  color: getTagColorDark(editColor)
                }}
                aria-label={`Tag preview: ${editLabel || 'Tag Name'}`}
              >
                {editLabel || 'Tag Name'}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelEdit}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateTag} 
              disabled={isUpdating || !editLabel.trim()}
            >
              {isUpdating ? (
                <>
                  <Spinner size="small" className="mr-2" aria-hidden="true" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmTag} onOpenChange={() => setDeleteConfirmTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the tag "{deleteConfirmTag?.tag_label}"? 
              This will remove the tag from all transactions that currently have it applied.
              {deleteConfirmTag?.transaction_count !== undefined && deleteConfirmTag.transaction_count > 0 && (
                <span className="block mt-2 font-medium text-orange-600 dark:text-orange-400">
                  This tag is currently applied to {deleteConfirmTag.transaction_count} transaction{deleteConfirmTag.transaction_count !== 1 ? 's' : ''}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteTag}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Totals by Tag Section */}
      {tags.some((t) => t.totals) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Totals by Tag</h2>
          <TagTotalsView tags={tags} isLoading={isLoading} error={tagsError} />
        </div>
      )}

      {/* Back to accounts link */}
      <div className="mt-8 pt-4 border-t">
        <CustomLink href={accountsUrl()}>← Back to Accounts</CustomLink>
      </div>
    </div>
  )
}

