'use client'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

export type AccountType = 'asset' | 'liability' | 'retirement'

export interface EditAccountFlagsProps {
  accountId: string
  isDebt: boolean
  isRetirement: boolean
  acctNumber: string | null
}

function typeFromFlags(isDebt: boolean, isRetirement: boolean): AccountType {
  if (isDebt) return 'liability'
  if (isRetirement) return 'retirement'
  return 'asset'
}

export function EditAccountFlags({ accountId, isDebt, isRetirement, acctNumber }: EditAccountFlagsProps) {
  const [accountType, setAccountType] = useState<AccountType>(typeFromFlags(isDebt, isRetirement))
  const [accountNumber, setAccountNumber] = useState<string>(acctNumber ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/update-flags`, {
        isDebt: accountType === 'liability',
        isRetirement: accountType === 'retirement',
        acctNumber: accountNumber || null,
      })
      setSaved(true)
    } catch (err) {
      setError('Failed to save account settings.')
      console.error('Failed to update account settings:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="shadow-sm mt-8">
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="account-type">Account Type</Label>
            <Select value={accountType} onValueChange={(v) => { setAccountType(v as AccountType); setSaved(false) }}>
              <SelectTrigger id="account-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">Asset (e.g., Checking, Savings)</SelectItem>
                <SelectItem value="liability">Liability (e.g., Credit Card, Loan)</SelectItem>
                <SelectItem value="retirement">Retirement (e.g., 401k, IRA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-number">Account Number</Label>
            <Input
              id="account-number"
              type="text"
              placeholder="Full account number"
              value={accountNumber}
              onChange={(e) => { setAccountNumber(e.target.value); setSaved(false) }}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Stored securely. Only the last 4 digits are shared with AI services.</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && <p className="text-sm text-green-600">Settings saved.</p>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
