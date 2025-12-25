'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchWrapper } from '@/fetchWrapper'

interface Props {
  accountId: number
  accountName: string
  whenClosed: string | null
}

export default function AccountMaintenanceClient({ accountId, accountName, whenClosed: initialWhenClosed }: Props) {
  const [newName, setNewName] = useState(accountName)
  const [error, setError] = useState('')
  const [whenClosed, setWhenClosed] = useState<Date | null>(initialWhenClosed ? new Date(initialWhenClosed) : null)
  const [isAccountClosed, setIsAccountClosed] = useState(!!initialWhenClosed)
  const [isClosed, setIsClosed] = useState(!!initialWhenClosed)

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/rename`, { newName })
      window.location.reload()
    } catch (err) {
      setError('Failed to rename account')
    }
  }

  const handleAccountClosedChange = (checked: boolean) => {
    setIsAccountClosed(checked)
    setIsClosed(checked)
    if (!checked) {
      setWhenClosed(null)
    }
  }

  const handleSaveClosedStatus = async () => {
    try {
      await fetchWrapper.post(`/api/finance/${accountId}/update-closed`, { closedDate: isClosed && whenClosed ? format(whenClosed, 'yyyy-MM-dd') : null })
      window.location.reload()
    } catch (err) {
      setError('Failed to update account closed status')
    }
  }

  return (
    <>
      <Card className="shadow-sm mb-6 w-100">
        <CardHeader>
          <CardTitle>Rename Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRename} className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="account-name">Account Name</Label>
              <Input id="account-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <Button type="submit">Save New Name</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm mb-6 w-100">
        <CardHeader>
          <CardTitle>Account Closed Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="account-closed"
              checked={isAccountClosed}
              onCheckedChange={(checked) => handleAccountClosedChange(!!checked)}
            />
            <Label htmlFor="account-closed">Mark Account as Closed</Label>
          </div>

          {isAccountClosed && (
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label>Closed Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn('w-[240px] justify-start text-left font-normal', !whenClosed && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {whenClosed ? format(whenClosed, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={whenClosed || undefined}
                    onSelect={(date) => {
                      setWhenClosed(date || null)
                      setIsClosed(true)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {(isAccountClosed !== !!initialWhenClosed || (isAccountClosed && whenClosed !== initialWhenClosed)) && (
            <Button onClick={handleSaveClosedStatus}>Save Closed Status</Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}
