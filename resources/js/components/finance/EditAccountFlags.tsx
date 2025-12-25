'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { fetchWrapper } from '@/fetchWrapper'

export interface EditAccountFlagsProps {
  accountId: string
  isDebt: boolean
  isRetirement: boolean
}

export function EditAccountFlags({ accountId, isDebt, isRetirement }: EditAccountFlagsProps) {
  const [debt, setDebt] = useState(isDebt);
  const [retirement, setRetirement] = useState(isRetirement);

  const handleUpdateFlags = async (flag: 'isDebt' | 'isRetirement', value: boolean) => {
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/update-flags`, { [flag]: value });
      if (flag === 'isDebt') {
        setDebt(value);
      } else {
        setRetirement(value);
      }
    } catch (error) {
      console.error('Failed to update account flags:', error);
    }
  };

  return (
    <Card className="shadow-sm mt-8">
      <CardHeader>
        <CardTitle>Account Flags</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDebt"
              name="isDebt"
              checked={debt}
              onCheckedChange={(checked) => {
                handleUpdateFlags('isDebt', !!checked);
              }}
            />
            <Label htmlFor="isDebt">Account is a Liability (e.g., Credit Card)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isRetirement"
              name="isRetirement"
              checked={retirement}
              onCheckedChange={(checked) => {
                handleUpdateFlags('isRetirement', !!checked);
              }}
            />
            <Label htmlFor="isRetirement">Account is a Retirement Account</Label>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
