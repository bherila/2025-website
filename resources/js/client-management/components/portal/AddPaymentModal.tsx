import { useEffect, useState } from "react"

import type { ClientInvoicePayment } from "@/client-management/types"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface AddPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    payment: ClientInvoicePayment | null
    defaultAmount?: string
    /** Remaining balance on the invoice, used to warn about overpayment. Optional. */
    remainingBalance?: number
    onSave: (payment: Partial<ClientInvoicePayment>) => void
    onDelete?: (payment: ClientInvoicePayment) => void
}

export default function AddPaymentModal({ isOpen, onClose, payment, defaultAmount, remainingBalance, onSave, onDelete }: AddPaymentModalProps) {
    const [amount, setAmount] = useState('0')
    const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]!)
    const [paymentMethod, setPaymentMethod] = useState<string>('Credit Card')
    const [notes, setNotes] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (isOpen) {
            if (payment) {
                // Editing existing payment
                setAmount(payment.amount)
                // Handle both date and datetime strings
                const dateStr = payment.payment_date.includes('T') 
                    ? payment.payment_date.split('T')[0]! 
                    : payment.payment_date.split(' ')[0]!
                setPaymentDate(dateStr)
                setPaymentMethod(payment.payment_method)
                setNotes(payment.notes || '')
            } else {
                // Adding new payment
                setAmount(defaultAmount || '0')
                setPaymentDate(new Date().toISOString().split('T')[0]!)
                setPaymentMethod('Credit Card')
                setNotes('')
            }
        }
    }, [isOpen, payment, defaultAmount])

    const handleSave = () => {
        setIsSaving(true)
        const update: Partial<ClientInvoicePayment> = {
            amount,
            payment_date: paymentDate,
            payment_method: paymentMethod as any,
            notes,
        }
        if (payment?.client_invoice_payment_id) {
            update.client_invoice_payment_id = payment.client_invoice_payment_id
        }
        if (payment?.client_invoice_id) {
            update.client_invoice_id = payment.client_invoice_id
        }
        onSave(update)
        setIsSaving(false)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{payment ? 'Edit' : 'Add'} Payment</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">
                            Amount
                        </Label>
                        <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="col-span-3" />
                    </div>
                    {(() => {
                        if (remainingBalance === undefined) return null
                        const entered = parseFloat(amount || '0')
                        if (!Number.isFinite(entered) || entered <= remainingBalance) return null
                        const overpay = (entered - remainingBalance).toFixed(2)
                        return (
                            <div className="col-span-4 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                                This creates an overpayment of <strong>${overpay}</strong>. The excess will be
                                applied as a credit on the next invoice and rolls forward until used up.
                            </div>
                        )
                    })()}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="payment-date" className="text-right">
                            Date
                        </Label>
                        <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="payment-method" className="text-right">
                            Method
                        </Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select a method" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Credit Card">Credit Card</SelectItem>
                                <SelectItem value="ACH">ACH</SelectItem>
                                <SelectItem value="Wire">Wire</SelectItem>
                                <SelectItem value="Check">Check</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="notes" className="text-right">
                            Notes
                        </Label>
                        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    {onDelete && payment && (
                        <Button variant="destructive" onClick={() => onDelete(payment)} disabled={isSaving}>
                            Delete
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={isSaving}>Save Payment</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
