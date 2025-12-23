import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ClientManagementCreatePage() {
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyName.trim()) return

    setLoading(true)
    try {
      const response = await fetch('/client/mgmt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        },
        body: JSON.stringify({ company_name: companyName })
      })

      if (response.ok) {
        // If server returned JSON (for fetch), use redirect field; otherwise use response.url when redirected
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const data = await response.json()
          if (data.redirect) window.location.href = data.redirect
        } else if (response.redirected && response.url) {
          window.location.href = response.url
        }
      }
    } catch (error) {
      console.error('Error creating company:', error)
      alert('Failed to create company')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">New Client Company</h1>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name"
                required
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !companyName.trim()}>
                {loading ? 'Creating...' : 'Create Company'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => window.location.href = '/client/mgmt'}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
