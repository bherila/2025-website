'use client'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription, FormLabel } from '@/components/ui/form'
import { Checkbox } from '@/components/ui/checkbox'

const formSchema = z.object({
  accountName: z.string().min(1, 'Account name is required'),
  isDebt: z.boolean().optional().default(false),
  isRetirement: z.boolean().optional().default(false),
})

export default function NewAccountForm({ onUpdate }: { onUpdate: () => void }) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: '',
      isDebt: false,
      isRetirement: false,
    },
  })

  const onSubmit = async (values: { accountName: string; isDebt: boolean; isRetirement: boolean }) => {
    try {
      const response = await fetch('/api/finance/accounts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify(values),
      })
      if (response.ok) {
        form.reset()
        onUpdate()
      } else {
        throw new Error('Failed to create account')
      }
    } catch (error) {
      form.setError('accountName', {
        type: 'manual',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="accountName"
          render={({ field }) => (
            <FormItem>
              <Label>Account Name</Label>
              <FormControl>
                <Input placeholder="Enter account name" {...field} autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isDebt"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4">
              <FormControl>
                <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Account is a Liability (e.g., Credit Card)</FormLabel>
                <FormDescription>Check this box if the account represents a debt or liability</FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isRetirement"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4">
              <FormControl>
                <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Account is a Retirement Account</FormLabel>
                <FormDescription>
                  Check this box if the account is a retirement account (e.g., 401k, IRA)
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        {form.formState.errors.accountName && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{form.formState.errors.accountName.message}</AlertDescription>
          </Alert>
        )}
        <CardFooter className="flex justify-end p-0 pt-4">
          <Button type="submit">{form.formState.isSubmitting ? 'Creating...' : 'Create Account'}</Button>
        </CardFooter>
      </form>
    </Form>
  )
}