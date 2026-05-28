'use client'

import { Check, Loader2, Search, UserCheck, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

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
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fetchWrapper } from '@/fetchWrapper'
import { cn } from '@/lib/utils'
import {
  type AccountCandidate,
  type AccountSuggestionLink,
  type AccountSuggestionResponse,
  accountSuggestionResponseSchema,
  bulkAccountUpdateResponseSchema,
} from '@/types/finance/account-suggestion'

interface MissingAccountResolverProps {
  link: AccountSuggestionLink
  taxDocumentId: number | null | undefined
  triggerLabel?: string
  onResolved?: (() => void) | undefined
}

export default function MissingAccountResolver({
  link,
  taxDocumentId,
  triggerLabel = 'Resolve',
  onResolved,
}: MissingAccountResolverProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false)
  const [response, setResponse] = useState<AccountSuggestionResponse | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [includeClosed, setIncludeClosed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSuggestions = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        document_id: String(link.document_id),
        link_id: String(link.id),
      })
      if (includeClosed) {
        params.set('include_closed', '1')
      }

      const data = accountSuggestionResponseSchema.parse(
        await fetchWrapper.get(`/api/finance/accounts/suggest?${params.toString()}`),
      )
      setResponse(data)
      setSelectedAccountId((current) => current ?? data.suggestions[0]?.account.acct_id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account suggestions')
    } finally {
      setIsLoading(false)
    }
  }, [includeClosed, link.document_id, link.id])

  useEffect(() => {
    if (open) {
      void loadSuggestions()
    }
  }, [loadSuggestions, open])

  const selectedCandidate = useMemo(() => (
    response?.suggestions.find((candidate) => candidate.account.acct_id === selectedAccountId) ?? null
  ), [response?.suggestions, selectedAccountId])

  const similarLinks = response?.similar_links ?? []
  const canResolve = taxDocumentId !== null && taxDocumentId !== undefined

  async function assignSelected(markReviewed: boolean): Promise<void> {
    if (!canResolve || selectedAccountId === null) {
      return
    }

    setIsSaving(true)
    try {
      await fetchWrapper.patch(`/api/finance/tax-documents/${taxDocumentId}/accounts/${link.id}`, {
        account_id: selectedAccountId,
        ...(markReviewed ? { is_reviewed: true } : {}),
      })
      toast.success(markReviewed ? 'Account assigned and marked reviewed.' : 'Account assigned.')
      setOpen(false)
      onResolved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign account')
    } finally {
      setIsSaving(false)
    }
  }

  async function clearAccount(): Promise<void> {
    if (!canResolve) {
      return
    }

    setIsSaving(true)
    try {
      await fetchWrapper.patch(`/api/finance/tax-documents/${taxDocumentId}/accounts/${link.id}`, {
        account_id: null,
      })
      toast.success('Account link cleared.')
      setOpen(false)
      onResolved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear account')
    } finally {
      setIsSaving(false)
    }
  }

  async function applyToSimilar(): Promise<void> {
    if (!canResolve || selectedAccountId === null || similarLinks.length === 0) {
      return
    }

    setIsSaving(true)
    try {
      const data = bulkAccountUpdateResponseSchema.parse(
        await fetchWrapper.post(`/api/finance/tax-documents/${taxDocumentId}/accounts/bulk-update`, {
          links: similarLinks.map((similarLink) => ({
            link_id: similarLink.id,
            account_id: selectedAccountId,
            is_reviewed: true,
          })),
        }),
      )
      toast.success(`Assigned ${data.affected_link_ids.length} account link${data.affected_link_ids.length === 1 ? '' : 's'}.`)
      setConfirmBulkOpen(false)
      setOpen(false)
      onResolved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply account assignment')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={!canResolve}
            onClick={(event) => event.stopPropagation()}
          >
            <UserCheck className="h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Resolve missing account</DialogTitle>
            <DialogDescription>
              Assign the extracted account section to one of your finance accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <HintGrid link={link} response={response} />

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="rounded-md border">
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  Account
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setIncludeClosed((current) => !current)}
                >
                  {includeClosed ? 'Hide closed' : 'Include closed'}
                </Button>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading suggestions...
                </div>
              ) : (
                <Command>
                  <CommandInput placeholder="Search accounts..." />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No accounts found.</CommandEmpty>
                    {(response?.suggestions ?? []).map((candidate) => (
                      <AccountCandidateItem
                        key={candidate.account.acct_id}
                        candidate={candidate}
                        isSelected={candidate.account.acct_id === selectedAccountId}
                        onSelect={() => setSelectedAccountId(candidate.account.acct_id)}
                      />
                    ))}
                  </CommandList>
                </Command>
              )}
            </div>

            {selectedCandidate && (
              <div className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-sm">
                <div className="font-medium">{selectedCandidate.account.acct_name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedCandidate.reasons.map((reason) => (
                    <Badge key={reason} variant="outline" className="border-info/30 text-info">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" disabled={isSaving} onClick={() => setOpen(false)}>
                Skip
              </Button>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => void clearAccount()}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || selectedAccountId === null || similarLinks.length <= 1}
                onClick={() => setConfirmBulkOpen(true)}
              >
                <Users className="h-4 w-4" />
                Apply to similar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || selectedAccountId === null}
                onClick={() => void assignSelected(false)}
              >
                Assign
              </Button>
              <Button
                type="button"
                disabled={isSaving || selectedAccountId === null}
                onClick={() => void assignSelected(true)}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Assign + review
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to similar links?</AlertDialogTitle>
            <AlertDialogDescription>
              This will assign {selectedCandidate?.account.acct_name ?? 'the selected account'} to link IDs{' '}
              {similarLinks.map((similarLink) => similarLink.id).join(', ')} and mark them reviewed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isSaving} onClick={() => void applyToSimilar()}>
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function HintGrid({
  link,
  response,
}: {
  link: AccountSuggestionLink
  response: AccountSuggestionResponse | null
}): React.ReactElement {
  const hints = response?.hints

  return (
    <dl className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
      <HintLine label="AI account" value={hints?.ai_account_name ?? link.ai_account_name ?? null} />
      <HintLine label="Identifier" value={hints?.ai_identifier ?? link.ai_identifier ?? null} />
      <HintLine label="Source" value={hints?.source_filename ?? link.source_filename ?? null} />
      <HintLine label="Form" value={hints?.form_type ?? link.form_type ?? null} />
    </dl>
  )
}

function HintLine({ label, value }: { label: string; value: string | number | null | undefined }): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="truncate">{value ?? 'Unknown'}</dd>
    </div>
  )
}

function AccountCandidateItem({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: AccountCandidate
  isSelected: boolean
  onSelect: () => void
}): React.ReactElement {
  const accountNumber = candidate.account.acct_number

  return (
    <CommandItem
      value={`${candidate.account.acct_name} ${accountNumber ?? ''} ${candidate.reasons.join(' ')}`}
      onSelect={onSelect}
      className={cn('items-start gap-3 py-2', isSelected && 'bg-accent')}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
        {isSelected && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{candidate.account.acct_name}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="secondary">Score {candidate.score}</Badge>
          {accountNumber && <Badge variant="outline">Acct {accountNumber}</Badge>}
          {candidate.is_closed && <Badge variant="outline">Closed</Badge>}
          {candidate.reasons.map((reason) => (
            <Badge key={reason} variant="outline" className="text-muted-foreground">
              {reason}
            </Badge>
          ))}
        </span>
      </span>
    </CommandItem>
  )
}
