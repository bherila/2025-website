import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { X, ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import ClientAdminActions from './ClientAdminActions'
import type { User, ClientCompany, Agreement } from '@/types/client-management/common'

interface ClientManagementShowPageProps {
  companyId: number
}

export default function ClientManagementShowPage({ companyId }: ClientManagementShowPageProps) {
  const [company, setCompany] = useState<ClientCompany | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runInvoicingOpen, setRunInvoicingOpen] = useState(false)
  const [alertInfo, setAlertInfo] = useState<{
    show: boolean
    message: string
    variant: 'default' | 'destructive'
  } | null>(null)

  const [formData, setFormData] = useState({
    company_name: '',
    slug: '',
    address: '',
    website: '',
    phone_number: '',
    default_hourly_rate: '',
    additional_notes: '',
    is_active: true
  })

  useEffect(() => {
    if (alertInfo?.show) {
      const timer = setTimeout(() => {
        setAlertInfo(null)
      }, 5000) // 5 seconds
      return () => clearTimeout(timer)
    }
  }, [alertInfo])

  useEffect(() => {
    fetchCompany()
  }, [companyId])

  const fetchCompany = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}`);
      if (!response.ok) throw new Error('Failed to fetch company data');
      
      const found = await response.json();
      
      if (found) {
        setCompany(found)
        setFormData({
          company_name: found.company_name,
          slug: found.slug || '',
          address: found.address || '',
          website: found.website || '',
          phone_number: found.phone_number || '',
          default_hourly_rate: found.default_hourly_rate || '',
          additional_notes: found.additional_notes || '',
          is_active: found.is_active
        })
      }
    } catch (error) {
      console.error('Error fetching company:', error)
      setAlertInfo({ show: true, message: 'Failed to load company details.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json();

      if (!response.ok) {
        if (data.errors) {
            console.error('Validation errors:', data.errors);
            const errorMessages = Object.values(data.errors).flat().join('; ');
            setAlertInfo({ show: true, message: `Failed to update company: ${errorMessages}`, variant: 'destructive' })
        } else {
            throw new Error(data.message || 'Failed to update company');
        }
      } else {
        setCompany(data.company);
        setAlertInfo({ show: true, message: 'Company updated successfully', variant: 'default' })
      }
    } catch (error) {
      console.error('Error updating company:', error)
      setAlertInfo({ show: true, message: 'Failed to update company', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveUser = async (userId: number) => {
    if (!confirm('Remove this user from the company?')) return

    try {
      const response = await fetch(`/api/client/mgmt/${companyId}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        fetchCompany()
      } else {
        throw new Error('Failed to remove user');
      }
    } catch (error) {
      console.error('Error removing user:', error)
      setAlertInfo({ show: true, message: 'Failed to remove user', variant: 'destructive' })
    }
  }

  const handleCreateAgreement = async () => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('client_company_id', companyId.toString())
      
      const response = await fetch('/client/mgmt/agreement', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
          'Accept': 'application/json' // We want to handle the redirect ourselves if possible or just let it redirect
        },
        body: formData
      })

      if (response.redirected) {
        window.location.href = response.url
      } else if (response.ok) {
        // If it didn't redirect but was successful, we might need to find the new agreement ID
        // But the controller always redirects.
        const text = await response.text()
        // If we got HTML back, it might be the page it redirected to but fetch followed it.
        if (response.url) {
            window.location.href = response.url
        }
      } else {
        throw new Error('Failed to create agreement')
      }
    } catch (error) {
      console.error('Error creating agreement:', error)
      setAlertInfo({ show: true, message: 'Failed to create agreement', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  if (!company) {
    return (
      <div className="p-8">
        {alertInfo?.show && (
          <Alert variant={alertInfo.variant} className="mb-4 relative">
            <AlertTitle>{alertInfo.variant === 'destructive' ? 'Error' : 'Success'}</AlertTitle>
            <AlertDescription>{alertInfo.message}</AlertDescription>
            <button onClick={() => setAlertInfo(null)} className="absolute top-2 right-2 p-1">
              <X className="h-4 w-4" />
            </button>
          </Alert>
        )}
        Company not found
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      {alertInfo?.show && (
        <Alert variant={alertInfo.variant} className="mb-4 relative">
          <AlertTitle>{alertInfo.variant === 'destructive' ? 'Error' : 'Success'}</AlertTitle>
          <AlertDescription>{alertInfo.message}</AlertDescription>
          <button onClick={() => setAlertInfo(null)} className="absolute top-2 right-2 p-1">
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Client Company Details</h1>
        <div className="flex gap-2">
          <Button 
            variant="secondary"
            onClick={() => setRunInvoicingOpen(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Run Invoicing
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/client/mgmt'}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>
          {company.slug && (
            <Button
              variant="outline"
              onClick={() => window.location.href = `/client/portal/${company.slug}`}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Client Portal
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>

                <div className="col-span-2 space-y-2">
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
                  {company?.slug && (
                    <a 
                      href={`/client/portal/${company.slug}`} 
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Client Portal →
                    </a>
                  )}
                </div>

                <div className="col-span-2 space-y-2">
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
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, is_active: checked as boolean })
                      }
                    />
                    <Label htmlFor="is_active" className="font-normal cursor-pointer">
                      Is Active
                    </Label>
                  </div>
                </div>

                <div className="col-span-2 space-y-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Associated Users</CardTitle>
          </CardHeader>
          <CardContent>
            {company.users.length === 0 ? (
              <p className="text-muted-foreground">No users assigned to this company yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {company.users.map(user => (
                  <Badge key={user.id} variant="secondary" className="flex items-center gap-1 pr-1">
                    <span>{user.name}</span>
                    <button
                      onClick={() => handleRemoveUser(user.id)}
                      className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                      title="Remove user"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-4">
              Use "Invite People" from the main list page to add users to this company.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Agreements</CardTitle>
            </div>
            <Button size="sm" onClick={handleCreateAgreement} disabled={saving}>
              Create New Agreement
            </Button>
          </CardHeader>
          <CardContent>
            {company.agreements.length === 0 ? (
              <p className="text-muted-foreground text-sm">No agreements found for this company.</p>
            ) : (
              <div className="space-y-3">
                {company.agreements.map(agreement => (
                  <div 
                    key={agreement.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => window.location.href = `/client/mgmt/agreement/${agreement.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {new Date(agreement.active_date).toLocaleDateString()}
                        </span>
                        {agreement.client_company_signed_date ? (
                          <Badge variant="default" className="bg-green-600">Signed</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                        {agreement.termination_date && (
                          <Badge variant="destructive">Terminated</Badge>
                        )}
                        {agreement.is_visible_to_client && (
                          <Badge variant="outline">Visible to Client</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agreement.monthly_retainer_hours} hrs/mo @ ${agreement.monthly_retainer_fee}/mo
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">View →</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">ID:</span> {company.id}
              </div>
              <div>
                <span className="font-medium">Created:</span>{' '}
                {new Date(company.created_at).toLocaleDateString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {runInvoicingOpen && (
        <ClientAdminActions 
          companyId={companyId}
          onClose={() => setRunInvoicingOpen(false)}
          onSuccess={() => {
            setRunInvoicingOpen(false)
            fetchCompany()
          }}
        />
      )}
    </div>
  )
}
