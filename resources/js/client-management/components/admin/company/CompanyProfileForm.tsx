import { useState } from 'react'

import { getErrorMessage, isRecord, normalizeCompanyResponse } from '@/client-management/hooks/useClientCompanyDetail'
import type { ClientCompany } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'

interface CompanyFormData {
  company_name: string
  slug: string
  address: string
  website: string
  phone_number: string
  default_hourly_rate: string
  additional_notes: string
  is_active: boolean
  stripe_billing_enabled: boolean
}

function companyToFormData(company: ClientCompany): CompanyFormData {
  return {
    company_name: company.company_name,
    slug: company.slug || '',
    address: company.address || '',
    website: company.website || '',
    phone_number: company.phone_number || '',
    default_hourly_rate: company.default_hourly_rate || '',
    additional_notes: company.additional_notes || '',
    is_active: company.is_active ?? true,
    stripe_billing_enabled: company.stripe_billing_enabled ?? true,
  }
}

interface CompanyProfileFormProps {
  company: ClientCompany
  companyId: number
  onSaved: (company: ClientCompany) => void
  onError: (message: string) => void
}

/** Editable company profile form. Owns its form state and the update request. */
export default function CompanyProfileForm({ company, companyId, onSaved, onError }: CompanyProfileFormProps) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<CompanyFormData>(() => companyToFormData(company))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const data = await fetchWrapper.put(`/api/client/mgmt/companies/${companyId}`, formData)

      if (!isRecord(data) || !('company' in data)) {
        throw new Error('Unexpected response from the company update API.')
      }

      onSaved(normalizeCompanyResponse(data.company))
    } catch (error) {
      console.error('Error updating company:', error)
      onError(getErrorMessage(error, 'Failed to update company'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="company_name">Company Name *</Label>
          <Input
            id="company_name"
            value={formData.company_name}
            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
            required
          />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="slug">Slug (URL identifier)</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/client/portal/</span>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="company-slug"
              className="flex-1"
            />
          </div>
          {company.slug && (
            <a href={`/client/portal/${company.slug}`} className="text-sm text-blue-600 hover:underline">
              View Client Portal →
            </a>
          )}
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            placeholder="https://"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone_number">Phone Number</Label>
          <Input
            id="phone_number"
            type="tel"
            value={formData.phone_number}
            onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="default_hourly_rate">Default Hourly Rate ($)</Label>
          <Input
            id="default_hourly_rate"
            type="number"
            step="0.01"
            min="0"
            value={formData.default_hourly_rate}
            onChange={(e) => setFormData({ ...formData, default_hourly_rate: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked === true })}
            />
            <Label htmlFor="is_active" className="font-normal cursor-pointer">
              Is Active
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Stripe Billing</Label>
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <Checkbox
              id="stripe_billing_enabled"
              checked={formData.stripe_billing_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, stripe_billing_enabled: checked === true })}
              className="mt-1"
            />
            <div className="grid gap-1">
              <Label htmlFor="stripe_billing_enabled" className="font-normal cursor-pointer">
                Enable Stripe invoice payments
              </Label>
              <p className="text-xs text-muted-foreground">
                Hide Stripe payment options on this client's invoices when disabled.
              </p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="additional_notes">Additional Notes</Label>
          <Textarea
            id="additional_notes"
            value={formData.additional_notes}
            onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })}
            rows={4}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {company.last_activity && (
          <span className="text-sm text-muted-foreground">
            Last activity: {new Date(company.last_activity).toLocaleString()}
          </span>
        )}
      </div>
    </form>
  )
}
