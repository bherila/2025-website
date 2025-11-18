'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Edit } from 'lucide-react'
import { createRef, useState } from 'react'
import currency from 'currency.js'

export default function EditBalanceDisplay({ acct_id, defaultBalance, onUpdate }: { acct_id: number; defaultBalance: string; onUpdate: () => void }) {
  const [balance, setBalance] = useState(defaultBalance)
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = createRef<HTMLInputElement>()

  const handleClick = () => {
    setIsEditing(true)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }, 100)
  }

  const handleSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setBalance(currency(balance).toString())
      setIsSubmitting(true)
      try {
        const response = await fetch('/api/finance/accounts/balance', {
          credentials: 'same-origin',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
          },
          body: JSON.stringify({ acct_id, balance }),
        })
        if (response.ok) {
          onUpdate()
        }
      } catch (error) {
        console.error('Error updating balance:', error)
      }
      setIsSubmitting(false)
      setIsEditing(false)
    } else if (e.key === 'Escape') {
      setBalance(defaultBalance)
      setIsEditing(false)
    }
  }

  return (
    <div>
      {isEditing ? (
        <div>
          <Input
            autoFocus
            className="w-60 text-right"
            disabled={isSubmitting}
            onBlur={() => setIsEditing(false)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBalance(e.target.value)}
            onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
            onKeyPress={handleSubmit}
            ref={inputRef}
            type="text"
            value={balance}
          />
        </div>
      ) : (
        <div>
          {balance}{' '}
          <Button onClick={handleClick} variant="outline" size="sm">
            <Edit className="cursor-pointer" />
          </Button>
        </div>
      )}
    </div>
  )
}