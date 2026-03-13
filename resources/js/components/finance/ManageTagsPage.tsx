'use client'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { TagTotalsView } from '@/components/finance/TagTotalsView'
import { type FinanceTag, useFinanceTags } from '@/components/finance/useFinanceTags'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

export default function ManageTagsPage() {
  const { tags, isLoading, error: tagsError, refreshTags } = useFinanceTags({ includeCounts: true, includeTotals: true })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // New tag form state
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState('blue')
  const [newTagTaxChar, setNewTagTaxChar] = useState<string>('none')
  const [isCreating, setIsCreating] = useState(false)
  
  // Edit state
  const [editingTag, setEditingTag] = useState<FinanceTag | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editTaxChar, setEditTaxChar] = useState<string>('none')
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Delete confirmation state
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<FinanceTag | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCreateTag = async () => {
    if (!newTagLabel.trim()) {
      setError('Tag label is required')
      return
    }

    try {
      setIsCreating(true)
      setError(null)
      await fetchWrapper.post('/api/finance/tags', {
        tag_label: newTagLabel.trim(),
        tag_color: newTagColor,
        tax_characteristic: newTagTaxChar === 'none' ? null : newTagTaxChar,
      })
      setSuccessMessage('Tag created successfully')
      setNewTagLabel('')
      setNewTagColor('blue')
      setNewTagTaxChar('none')
      await refreshTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartEdit = (tag: FinanceTag) => {
    setEditingTag(tag)
    setEditLabel(tag.tag_label)
    setEditColor(tag.tag_color)
    setEditTaxChar(tag.tax_characteristic || 'none')
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
    setEditLabel('')
    setEditColor('')
    setEditTaxChar('none')
  }

  const handleUpdateTag = async () => {
    if (!editingTag || !editLabel.trim()) {
      setError('Tag label is required')
      return
    }

    try {
      setIsUpdating(true)
      setError(null)
      await fetchWrapper.put(`/api/finance/tags/${editingTag.tag_id}`, {
        tag_label: editLabel.trim(),
        tag_color: editColor,
        tax_characteristic: editTaxChar === 'none' ? null : editTaxChar,
      })
      setSuccessMessage('Tag updated successfully')
      setEditingTag(null)
      await refreshTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag')
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

  const ColorPicker = ({ 
    selectedColor, 
    onColorChange 
  }: { 
    selectedColor: string
    onColorChange: (color: string) => void 
  }) => (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`w-8 h-8 rounded-full border-2 transition-all ${
            selectedColor === color 
              ? 'border-black dark:border-white scale-110' 
              : 'border-transparent hover:border-gray-400'
          } bg-${color}-500`}
          style={{ backgroundColor: getTagColorHex(color) }}
          onClick={() => onColorChange(color)}
          aria-label={`Select ${color} color`}
        />
      ))}
    </div>
  )

  const TaxCharacteristicSelect = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-sm">
        <SelectValue placeholder="None (no tax characteristic)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        <SelectGroup>
          <SelectLabel>Schedule C: Expense</SelectLabel>
          {SCHEDULE_C_EXPENSE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Schedule C: Home Office Item</SelectLabel>
          {SCHEDULE_C_HOME_OFFICE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="large" />
        <span className="ml-2">Loading tags...</span>
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
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || tagsError}</AlertDescription>
        </Alert>
      )}
      
      {successMessage && (
        <Alert className="mb-4 bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800">
          <AlertDescription className="text-green-800 dark:text-green-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Create New Tag Section */}
      <div className="mb-8 p-4 border rounded-lg bg-muted/50">
        <h2 className="text-lg font-semibold mb-4">Create New Tag</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tag Label</label>
            <Input
              type="text"
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              placeholder="Enter tag name"
              maxLength={50}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Tag Color</label>
            <ColorPicker selectedColor={newTagColor} onColorChange={setNewTagColor} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tax Characteristic</label>
            <TaxCharacteristicSelect value={newTagTaxChar} onChange={setNewTagTaxChar} />
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleCreateTag} 
              disabled={isCreating || !newTagLabel.trim()}
            >
              {isCreating ? (
                <>
                  <Spinner size="small" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Tag'
              )}
            </Button>
            <div className="text-sm text-muted-foreground">
              Preview: 
              <Badge 
                className={`ml-2 bg-${newTagColor}-200 text-${newTagColor}-800 dark:bg-${newTagColor}-800 dark:text-${newTagColor}-200`}
                style={{ 
                  backgroundColor: getTagColorLight(newTagColor),
                  color: getTagColorDark(newTagColor)
                }}
              >
                {newTagLabel || 'Tag Name'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Existing Tags Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Your Tags ({tags.length})</h2>
        {tags.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            You haven't created any tags yet. Create one above to get started!
          </div>
        ) : (
          <TooltipProvider>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead>Tax Characteristic</TableHead>
                    <TableHead className="w-[150px]">Transactions</TableHead>
                    <TableHead className="w-[150px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.map((tag) => (
                    <TableRow key={tag.tag_id}>
                      <TableCell>
                        {editingTag?.tag_id === tag.tag_id ? (
                          <div className="space-y-3 py-2">
                            <div className="flex items-center gap-4">
                              <Input
                                type="text"
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                placeholder="Tag name"
                                maxLength={50}
                                className="max-w-xs"
                              />
                            </div>
                            <ColorPicker selectedColor={editColor} onColorChange={setEditColor} />
                            <div>
                              <label className="block text-xs font-medium mb-1 text-muted-foreground">Tax Characteristic</label>
                              <TaxCharacteristicSelect value={editTaxChar} onChange={setEditTaxChar} />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                onClick={handleUpdateTag}
                                disabled={isUpdating || !editLabel.trim()}
                              >
                                {isUpdating ? 'Saving...' : 'Save'}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={handleCancelEdit}
                                disabled={isUpdating}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Badge 
                            className={`bg-${tag.tag_color}-200 text-${tag.tag_color}-800 dark:bg-${tag.tag_color}-800 dark:text-${tag.tag_color}-200`}
                            style={{ 
                              backgroundColor: getTagColorLight(tag.tag_color),
                              color: getTagColorDark(tag.tag_color)
                            }}
                          >
                            {tag.tag_label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {editingTag?.tag_id !== tag.tag_id && getTaxCharacteristicLabel(tag.tax_characteristic)}
                      </TableCell>
                      <TableCell>
                        {tag.transaction_count !== undefined && (
                          <span className="text-sm text-muted-foreground">
                            {tag.transaction_count}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                asChild
                              >
                                <a href={`/finance/all-transactions?tag=${encodeURIComponent(tag.tag_label)}`}>
                                  <Search className="h-4 w-4" />
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
                                disabled={editingTag !== null}
                              >
                                <Pencil className="h-4 w-4" />
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
                                disabled={editingTag !== null}
                              >
                                <Trash2 className="h-4 w-4" />
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
            </div>
          </TooltipProvider>
        )}
      </div>

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
        <a href={accountsUrl()} className="text-blue-600 hover:underline">
          ← Back to Accounts
        </a>
      </div>
    </div>
  )
}

