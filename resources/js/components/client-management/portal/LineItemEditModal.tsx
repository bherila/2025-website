import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

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
                        <Input id="quantity" type="text" placeholder="1 or 1:30" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="unit-price" className="text-right">
                            Unit Price
                        </Label>
                        <Input id="unit-price" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                    <div className="flex-1">
                        {onDelete && lineItem?.client_invoice_line_id && lineItem.line_type !== 'retainer' && (
                            <Button 
                                type="button"
                                variant="ghost" 
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                    if (confirm('Are you sure you want to delete this line item?')) {
                                        onDelete(lineItem);
                                        onClose();
                                    }
                                }} 
                                disabled={isSaving}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Item
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSaving}>Save changes</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
