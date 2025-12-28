import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { InvoiceLine } from "@/types/client-management"
import { useEffect, useState } from "react"

interface LineItemEditModalProps {
    isOpen: boolean
    onClose: () => void
    lineItem: InvoiceLine | null
    onSave: (lineItem: InvoiceLine) => void
    onDelete?: (lineItem: InvoiceLine) => void
}

export default function LineItemEditModal({ isOpen, onClose, lineItem, onSave, onDelete }: LineItemEditModalProps) {
    const [description, setDescription] = useState('')
    const [quantity, setQuantity] = useState('1')
    const [unitPrice, setUnitPrice] = useState('0')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (lineItem) {
            setDescription(lineItem.description)
            setQuantity(lineItem.quantity)
            setUnitPrice(lineItem.unit_price)
        } else {
            setDescription('')
            setQuantity('1')
            setUnitPrice('0')
        }
    }, [lineItem])

    const handleSave = () => {
        setIsSaving(true)
        onSave({
            ...lineItem,
            description,
            quantity,
            unit_price: unitPrice,
        } as InvoiceLine)
        setIsSaving(false)
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{lineItem ? 'Edit' : 'Add'} Line Item</DialogTitle>
                    <DialogDescription>
                        Make changes to the line item here. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-right">
                            Description
                        </Label>
                        <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="quantity" className="text-right">
                            Quantity
                        </Label>
                        <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="unit-price" className="text-right">
                            Unit Price
                        </Label>
                        <Input id="unit-price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    {onDelete && lineItem && (
                        <Button variant="destructive" onClick={() => onDelete(lineItem)} disabled={isSaving}>
                            Delete
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={isSaving}>Save changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
