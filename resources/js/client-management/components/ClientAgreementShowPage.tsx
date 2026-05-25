import { AlertCircle, ArrowLeft, Check, FileText, Repeat, Shuffle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import CadenceTransitionModal from '@/client-management/components/admin/CadenceTransitionModal'
import { AgreementStatusBadges, CadenceBadge } from '@/client-management/components/admin/ClientBadges'
import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import DateInput from '@/client-management/components/admin/DateInput'
import RecurringItemsEditor from '@/client-management/components/admin/RecurringItemsEditor'
import type { ClientAgreement } from '@/client-management/types/client-agreement'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

interface ClientAgreementShowPageProps {
  agreementId: number
  companyId: number
  companyName: string
}

export default function ClientAgreementShowPage({ agreementId, companyId, companyName }: ClientAgreementShowPageProps) {
  const [agreement, setAgreement] = useState<ClientAgreement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [terminationDate, setTerminationDate] = useState('')
  const [showTerminateForm, setShowTerminateForm] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [transitionOpen, setTransitionOpen] = useState(false)

  const [formData, setFormData] = useState({
    active_date: '',
    agreement_text: '',
    agreement_link: '',
    monthly_retainer_hours: '',
    catch_up_threshold_hours: '1',
    rollover_months: 1,
    hourly_rate: '',
    monthly_retainer_fee: '',
    is_visible_to_client: false,
    billing_cadence: 'monthly',
    bill_overage_interim: false,
    first_cycle_proration: 'prorate_hours',
  })

  const fetchAgreement = useCallback(async () => {
    try {
        const data = await fetchWrapper.get(`/api/client/mgmt/agreements/${agreementId}`)
        setAgreement(data)
        setFormData({
          active_date: data.active_date?.split(/[ T]/)[0] || '',
          agreement_text: data.agreement_text || '',
          agreement_link: data.agreement_link || '',
          monthly_retainer_hours: data.monthly_retainer_hours || '',
          catch_up_threshold_hours: data.catch_up_threshold_hours || '1',
          rollover_months: data.rollover_months || 1,
          hourly_rate: data.hourly_rate || '',
          monthly_retainer_fee: data.monthly_retainer_fee || '',
          is_visible_to_client: data.is_visible_to_client || false,
          billing_cadence: data.billing_cadence || 'monthly',
          bill_overage_interim: Boolean(data.bill_overage_interim),
          first_cycle_proration: data.first_cycle_proration || 'prorate_hours',
        })
    } catch (error) {
      console.error('Error fetching agreement:', error)
      setError('Failed to load agreement')
    } finally {
      setLoading(false)
    }
  }, [agreementId])

  useEffect(() => {
    fetchAgreement()
  }, [fetchAgreement])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const data = await fetchWrapper.put(`/api/client/mgmt/agreements/${agreementId}`, formData)
      setSuccess('Agreement saved successfully')
      setAgreement(data.agreement)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [agreementId, formData])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  const handleTerminate = async () => {
    setSaving(true)
    setError(null)

    try {
      const data = await fetchWrapper.post(`/api/client/mgmt/agreements/${agreementId}/terminate`, {
        termination_date: terminationDate || null,
      })
      setSuccess('Agreement terminated')
      setAgreement(data.agreement)
      setShowTerminateForm(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await fetchWrapper.delete(`/api/client/mgmt/agreements/${agreementId}`, {})
      window.location.href = `/client/mgmt/${companyId}`
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-4xl">
        <Skeleton className="h-10 w-32 mb-4" />
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-8 w-8" />
          <div>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
          <Skeleton className="h-6 w-20 ml-auto" />
        </div>
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!agreement) {
    return <div className="p-8">Agreement not found</div>
  }

  const isSigned = !!agreement.client_company_signed_date
  const isTerminated = !!agreement.termination_date
  const isEditable = !isSigned

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <Button variant="ghost" className="mb-4" onClick={() => window.location.href = `/client/mgmt/${companyId}`}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to {companyName}
      </Button>

      <div className="flex items-center gap-4 mb-6">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Agreement</h1>
          <p className="text-muted-foreground">{companyName}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <CadenceBadge value={agreement.billing_cadence} />
          <AgreementStatusBadges
            signedAt={agreement.client_company_signed_date}
            terminatedAt={agreement.termination_date}
            visible={agreement.is_visible_to_client}
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      {isSigned && (
        <Card className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-300">Signature Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-green-700 dark:text-green-300">
            <p><strong>Signed by:</strong> {agreement.client_company_signed_name}</p>
            <p><strong>Title:</strong> {agreement.client_company_signed_title}</p>
            <p><strong>Date:</strong> {new Date(agreement.client_company_signed_date!).toLocaleDateString()}</p>
            {agreement.signed_by_user && (
              <p><strong>User:</strong> {agreement.signed_by_user.name} ({agreement.signed_by_user.email})</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Cycle Preview</CardTitle>
            <Button variant="outline" onClick={() => setTransitionOpen(true)}>
              <Shuffle className="mr-2 h-4 w-4" />
              Change cadence
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Cadence</div>
            <div className="mt-2"><CadenceBadge value={agreement.billing_cadence} /></div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Retainer</div>
            <div className="mt-1 text-xl font-semibold">{agreement.monthly_retainer_hours} hrs/mo</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Hourly rate</div>
            <div className="mt-1 text-xl font-semibold">${agreement.hourly_rate}/hr</div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Agreement Terms</CardTitle>
          <CardDescription>
            {isEditable 
              ? 'Configure the agreement terms before making it visible to the client.' 
              : 'This agreement has been signed and cannot be edited.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="active_date">Effective Date</Label>
              <DateInput
                id="active_date"
                value={formData.active_date}
                onValueChange={(value) => setFormData({ ...formData, active_date: value })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label>Billing Cadence</Label>
              <Select
                value={formData.billing_cadence}
                onValueChange={(value) => setFormData({
                  ...formData,
                  billing_cadence: value,
                  bill_overage_interim: value === 'monthly' ? false : formData.bill_overage_interim,
                })}
                disabled={!isEditable}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi_annual">Semiannual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_retainer_fee">Monthly Retainer Fee ($)</Label>
              <CurrencyInput
                id="monthly_retainer_fee"
                value={formData.monthly_retainer_fee}
                onValueChange={(value) => setFormData({ ...formData, monthly_retainer_fee: String(value) })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_retainer_hours">Monthly Retainer Hours</Label>
              <Input
                id="monthly_retainer_hours"
                type="number"
                step="0.01"
                value={formData.monthly_retainer_hours}
                onChange={(e) => setFormData({ ...formData, monthly_retainer_hours: e.target.value })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
              <CurrencyInput
                id="hourly_rate"
                value={formData.hourly_rate}
                onValueChange={(value) => setFormData({ ...formData, hourly_rate: String(value) })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rollover_months">Rollover Months</Label>
              <Input
                id="rollover_months"
                type="number"
                min="0"
                value={formData.rollover_months}
                onChange={(e) => setFormData({ ...formData, rollover_months: parseInt(e.target.value) || 0 })}
                disabled={!isEditable}
              />
              <p className="text-xs text-muted-foreground">Number of months unused hours can roll over</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catch_up_threshold_hours">Catch-up Threshold Hours</Label>
              <Input
                id="catch_up_threshold_hours"
                type="number"
                min="0"
                step="0.01"
                value={formData.catch_up_threshold_hours}
                onChange={(e) => setFormData({ ...formData, catch_up_threshold_hours: e.target.value })}
                disabled={!isEditable}
              />
              <p className="text-xs text-muted-foreground">
                Minimum availability hours after retainer allocation (0 to {formData.monthly_retainer_hours || 'retainer hours'})
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agreement_link">Agreement Link</Label>
              <Input
                id="agreement_link"
                type="url"
                value={formData.agreement_link}
                onChange={(e) => setFormData({ ...formData, agreement_link: e.target.value })}
                placeholder="https://..."
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label>First Cycle</Label>
              <Select
                value={formData.first_cycle_proration}
                onValueChange={(value) => setFormData({ ...formData, first_cycle_proration: value })}
                disabled={!isEditable}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prorate_hours">Prorate hours</SelectItem>
                  <SelectItem value="full_period">Full period</SelectItem>
                  <SelectItem value="align_next_cycle">Align next cycle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agreement_text">Agreement Text</Label>
            <Textarea
              id="agreement_text"
              value={formData.agreement_text}
              onChange={(e) => setFormData({ ...formData, agreement_text: e.target.value })}
              rows={10}
              placeholder="Enter the full agreement text..."
              disabled={!isEditable}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_visible_to_client"
              checked={formData.is_visible_to_client}
              onCheckedChange={(checked) => setFormData({ ...formData, is_visible_to_client: checked as boolean })}
              disabled={!isEditable}
            />
            <Label htmlFor="is_visible_to_client">
              Visible to client (client can view and sign when visible)
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="bill_overage_interim"
              checked={formData.bill_overage_interim}
              onCheckedChange={(checked) => setFormData({ ...formData, bill_overage_interim: Boolean(checked) })}
              disabled={!isEditable || formData.billing_cadence === 'monthly'}
            />
            <Label htmlFor="bill_overage_interim">
              Bill overage interim
            </Label>
          </div>
        </CardContent>
        {isEditable && (
          <CardFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isSigned}
            >
              Delete Agreement
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurring Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecurringItemsEditor companyId={companyId} agreement={agreement} onChanged={fetchAgreement} />
        </CardContent>
      </Card>

      {isSigned && !isTerminated && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-orange-600">Terminate Agreement</CardTitle>
            <CardDescription>
              Once terminated, this agreement will no longer be active. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showTerminateForm ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="termination_date">Termination Date (leave blank for today)</Label>
                  <Input
                    id="termination_date"
                    type="date"
                    value={terminationDate}
                    onChange={(e) => setTerminationDate(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={handleTerminate} disabled={saving}>
                    Confirm Termination
                  </Button>
                  <Button variant="outline" onClick={() => setShowTerminateForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowTerminateForm(true)}>
                Terminate Agreement
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <CadenceTransitionModal
        companyId={companyId}
        agreement={agreement}
        open={transitionOpen}
        onOpenChange={setTransitionOpen}
        onSuccess={(successorAgreementId) => {
          window.location.href = `/client/mgmt/agreement/${successorAgreementId}`
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agreement</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the draft agreement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
