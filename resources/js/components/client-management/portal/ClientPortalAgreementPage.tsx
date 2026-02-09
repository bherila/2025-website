import { AlertCircle, Check, FileText, HelpCircle } from 'lucide-react'
import { useCallback, useEffect,useState } from 'react'

import { DeleteFileModal, FileHistoryModal, FileList, FileUploadButton, useFileManagement } from '@/components/shared/FileManager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter,CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ClientAgreement } from '@/types/client-management/client-agreement'

import ClientPortalNav from './ClientPortalNav'

interface ClientPortalAgreementPageProps {
  slug: string
  companyName: string
  companyId: number
  agreementId: number
  isAdmin: boolean
}

export default function ClientPortalAgreementPage({ slug, companyName, companyId, agreementId, isAdmin }: ClientPortalAgreementPageProps) {
  const [agreement, setAgreement] = useState<ClientAgreement | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showSignForm, setShowSignForm] = useState(false)
  const [signName, setSignName] = useState('')
  const [signTitle, setSignTitle] = useState('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)

  // File management
  const fileManager = useFileManagement({
    listUrl: `/api/client/portal/${slug}/agreements/${agreementId}/files`,
    uploadUrl: `/api/client/portal/${slug}/agreements/${agreementId}/files`,
    downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/agreements/${agreementId}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/agreements/${agreementId}/files/${fileId}`,
  })

  const fetchAgreement = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/agreements/${agreementId}`)
      if (response.ok) {
        const data = await response.json()
        setAgreement(data)
      } else {
        setError('Failed to load agreement')
      }
    } catch (error) {
      console.error('Error fetching agreement:', error)
      setError('Failed to load agreement')
    } finally {
      setLoading(false)
    }
  }, [slug, agreementId])

  const fetchInvoices = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/invoices`)
      if (response.ok) {
        const data = await response.json()
        // Filter invoices for this agreement
        const agreementInvoices = data.filter((inv: any) => inv.client_agreement_id === agreementId)
        setInvoices(agreementInvoices)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoadingInvoices(false)
    }
  }, [slug, agreementId])

  useEffect(() => {
    fetchAgreement()
    fileManager.fetchFiles()
    fetchInvoices()
  }, [agreementId, fetchAgreement, fetchInvoices, fileManager])

  useEffect(() => {
    if (agreement) {
      document.title = `Agreement | Client Portal`
    }
  }, [agreement])

  const handleSign = async () => {
    if (!signName.trim() || !signTitle.trim()) {
      setError('Please enter your name and title')
      return
    }

    setSigning(true)
    setError(null)

    try {
      const response = await fetch(`/api/client/portal/${slug}/agreements/${agreementId}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({
          name: signName.trim(),
          title: signTitle.trim(),
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess('Agreement signed successfully!')
        setAgreement(data.agreement)
        setShowSignForm(false)
      } else {
        setError(data.error || 'Failed to sign agreement')
      }
    } catch (error) {
      setError('An error occurred while signing')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} isAdmin={isAdmin} currentPage="agreement" />
        <div className="container mx-auto px-8 max-w-4xl">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-64 w-full mt-4" />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (!agreement) {
    return <div className="p-8">Agreement not found</div>
  }

  const isSigned = !!agreement.client_company_signed_date
  const isTerminated = !!agreement.termination_date

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} companyId={companyId} isAdmin={isAdmin} currentPage="agreement" />
      <div className="container mx-auto px-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold">Service Agreement</h1>
          </div>
          <div className="ml-auto flex gap-2">
            {isSigned && <Badge className="bg-green-600 hover:bg-green-700"><Check className="mr-1 h-3 w-3" /> Signed</Badge>}
            {isTerminated && <Badge variant="destructive">Terminated</Badge>}
            {!isSigned && !isTerminated && <Badge variant="secondary">Awaiting Signature</Badge>}
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Agreement Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1">
                  Effective Date
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">The date when this service agreement becomes active and billing begins.</p>
                    </TooltipContent>
                  </Tooltip>
                </dt>
                <dd className="font-medium">{new Date(agreement.active_date).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1">
                  Monthly Retainer
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">The fixed monthly fee that covers the contracted hours of service each month.</p>
                    </TooltipContent>
                  </Tooltip>
                </dt>
                <dd className="font-medium">${parseFloat(agreement.monthly_retainer_fee).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1">
                  Hours Included
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">The number of service hours included with your monthly retainer fee.</p>
                    </TooltipContent>
                  </Tooltip>
                </dt>
                <dd className="font-medium">{agreement.monthly_retainer_hours} hours/month</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground flex items-center gap-1">
                  Hourly Rate (Additional)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">The rate charged for any hours worked beyond your monthly retainer hours and available rollover hours.</p>
                    </TooltipContent>
                  </Tooltip>
                </dt>
                <dd className="font-medium">${parseFloat(agreement.hourly_rate).toLocaleString()}/hour</dd>
              </div>
              {agreement.rollover_months > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground flex items-center gap-1">
                    Rollover Period
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">The number of months that unused retainer hours can be carried forward. After this period, unused hours expire.</p>
                      </TooltipContent>
                    </Tooltip>
                  </dt>
                  <dd className="font-medium">{agreement.rollover_months} month(s)</dd>
                </div>
              )}
              {agreement.agreement_link && (
                <div>
                  <dt className="text-sm text-muted-foreground">Full Agreement</dt>
                  <dd>
                    <a href={agreement.agreement_link} target="_blank" rel="noopener noreferrer" 
                       className="text-blue-600 hover:underline">
                      View Document →
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </TooltipProvider>
        </CardContent>
      </Card>

      {agreement.agreement_text && agreement.agreement_text.trim() !== '' && agreement.agreement_text.toUpperCase() !== 'TBA' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Agreement Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {agreement.agreement_text}
            </div>
          </CardContent>
        </Card>
      )}

      {isSigned && (
        <Card className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-300">✓ Agreement Signed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-green-700 dark:text-green-300">
            <p><strong>Signed by:</strong> {agreement.client_company_signed_name}</p>
            <p><strong>Title:</strong> {agreement.client_company_signed_title}</p>
            <p><strong>Date:</strong> {new Date(agreement.client_company_signed_date!).toLocaleDateString()}</p>
          </CardContent>
        </Card>
      )}

      {!isSigned && !isTerminated && (
        <Card>
          <CardHeader>
            <CardTitle>Sign Agreement</CardTitle>
            <CardDescription>
              By signing, you agree to the terms outlined in this agreement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showSignForm ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signName">Your Full Name</Label>
                  <Input
                    id="signName"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signTitle">Your Title</Label>
                  <Input
                    id="signTitle"
                    value={signTitle}
                    onChange={(e) => setSignTitle(e.target.value)}
                    placeholder="CEO, Director, etc."
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Click the button below to proceed with signing this agreement.
              </p>
            )}
          </CardContent>
          <CardFooter>
            {showSignForm ? (
              <div className="flex gap-2">
                <Button onClick={handleSign} disabled={signing}>
                  {signing ? 'Signing...' : 'Confirm & Sign'}
                </Button>
                <Button variant="outline" onClick={() => setShowSignForm(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button onClick={() => setShowSignForm(true)}>
                Sign Agreement
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Agreement Files Section */}
      <FileList
        className="mt-6"
        files={fileManager.files}
        loading={fileManager.loading}
        isAdmin={isAdmin}
        onDownload={fileManager.downloadFile}
        onDelete={fileManager.handleDeleteRequest}
        title="Agreement Files"
        actions={isAdmin && <FileUploadButton onUpload={fileManager.uploadFile} />}
      />

      {/* Invoices Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Invoices generated under this service agreement</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices have been issued yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <a
                  key={invoice.client_invoice_id}
                  href={`/client/portal/${slug}/invoice/${invoice.client_invoice_id}`}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">
                      {invoice.invoice_number || `Invoice #${invoice.client_invoice_id}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {invoice.period_start && invoice.period_end && (
                        <>{new Date(invoice.period_start).toLocaleDateString()} - {new Date(invoice.period_end).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-medium">${parseFloat(invoice.invoice_total).toFixed(2)}</div>
                      <Badge variant={invoice.status === 'paid' ? 'default' : 'outline'} className={invoice.status === 'paid' ? 'bg-green-600' : ''}>
                        {invoice.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FileHistoryModal
        file={fileManager.historyFile}
        history={fileManager.historyData}
        isOpen={fileManager.historyModalOpen}
        onClose={fileManager.closeHistoryModal}
      />

      <DeleteFileModal
        file={fileManager.deleteFile}
        isOpen={fileManager.deleteModalOpen}
        isDeleting={fileManager.isDeleting}
        onClose={fileManager.closeDeleteModal}
        onConfirm={fileManager.handleDeleteConfirm}
      />
      </div>
    </>
  )
}
