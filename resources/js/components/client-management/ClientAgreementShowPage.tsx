import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, ArrowLeft, FileText, Check, X } from 'lucide-react'
import type { ClientAgreement } from '@/types/client-management/client-agreement'

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

  const [formData, setFormData] = useState({
    active_date: '',
    agreement_text: '',
    agreement_link: '',
    monthly_retainer_hours: '',
    rollover_months: 1,
    hourly_rate: '',
    monthly_retainer_fee: '',
    is_visible_to_client: false,
  })

  useEffect(() => {
    fetchAgreement()
  }, [agreementId])

  const fetchAgreement = async () => {
    try {
      const response = await fetch(`/api/client/mgmt/agreements/${agreementId}`)
      if (response.ok) {
        const data = await response.json()
        setAgreement(data)
        setFormData({
          active_date: data.active_date?.split('T')[0] || '',
          agreement_text: data.agreement_text || '',
          agreement_link: data.agreement_link || '',
          monthly_retainer_hours: data.monthly_retainer_hours || '',
          rollover_months: data.rollover_months || 1,
          hourly_rate: data.hourly_rate || '',
          monthly_retainer_fee: data.monthly_retainer_fee || '',
          is_visible_to_client: data.is_visible_to_client || false,
        })
      }
    } catch (error) {
      console.error('Error fetching agreement:', error)
      setError('Failed to load agreement')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/client/mgmt/agreements/${agreementId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess('Agreement saved successfully')
        setAgreement(data.agreement)
      } else {
        setError(data.error || 'Failed to save agreement')
      }
    } catch (error) {
      setError('An error occurred while saving')
    } finally {
      setSaving(false)
    }
  }

  const handleTerminate = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/client/mgmt/agreements/${agreementId}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ termination_date: terminationDate || null })
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess('Agreement terminated')
        setAgreement(data.agreement)
        setShowTerminateForm(false)
      } else {
        setError(data.error || 'Failed to terminate agreement')
      }
    } catch (error) {
      setError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this agreement?')) return

    try {
      const response = await fetch(`/api/client/mgmt/agreements/${agreementId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        window.location.href = `/client/mgmt/${companyId}`
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to delete agreement')
      }
    } catch (error) {
      setError('An error occurred')
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
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
        <div className="ml-auto flex gap-2">
          {isSigned && <Badge variant="default"><Check className="mr-1 h-3 w-3" /> Signed</Badge>}
          {isTerminated && <Badge variant="destructive"><X className="mr-1 h-3 w-3" /> Terminated</Badge>}
          {!isSigned && !isTerminated && <Badge variant="secondary">Draft</Badge>}
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
              <Input
                id="active_date"
                type="date"
                value={formData.active_date}
                onChange={(e) => setFormData({ ...formData, active_date: e.target.value })}
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_retainer_fee">Monthly Retainer Fee ($)</Label>
              <Input
                id="monthly_retainer_fee"
                type="number"
                step="0.01"
                value={formData.monthly_retainer_fee}
                onChange={(e) => setFormData({ ...formData, monthly_retainer_fee: e.target.value })}
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
              <Input
                id="hourly_rate"
                type="number"
                step="0.01"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
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
        </CardContent>
        {isEditable && (
          <CardFooter className="flex justify-between">
            <Button 
              variant="destructive" 
              onClick={handleDelete}
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
    </div>
  )
}
