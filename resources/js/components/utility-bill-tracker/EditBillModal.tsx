import * as React from 'react';
import { useState, useEffect } from 'react';
import { FileText, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { UtilityBill } from '@/types/utility-bill-tracker';
import { formatDateForInput } from '@/lib/DateHelper';

interface EditBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  accountType: 'Electricity' | 'General';
  bill: UtilityBill | null;
  isNew: boolean;
  onSaved: () => void;
}

export function EditBillModal({
  open,
  onOpenChange,
  accountId,
  accountType,
  bill,
  isNew,
  onSaved
}: EditBillModalProps) {
  const [formData, setFormData] = useState({
    bill_start_date: '',
    bill_end_date: '',
    due_date: '',
    total_cost: '',
    taxes: '',
    fees: '',
    discounts: '',
    credits: '',
    payments_received: '',
    previous_unpaid_balance: '',
    status: 'Unpaid' as 'Paid' | 'Unpaid',
    notes: '',
    power_consumed_kwh: '',
    total_generation_fees: '',
    total_delivery_fees: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const [currentBill, setCurrentBill] = useState<UtilityBill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isElectricity = accountType === 'Electricity';

  useEffect(() => {
    if (open) {
      if (bill && !isNew) {
        setCurrentBill(bill);
        setFormData({
          bill_start_date: formatDateForInput(bill.bill_start_date),
          bill_end_date: formatDateForInput(bill.bill_end_date),
          due_date: formatDateForInput(bill.due_date),
          total_cost: bill.total_cost,
          taxes: bill.taxes || '',
          fees: bill.fees || '',
          discounts: bill.discounts || '',
          credits: bill.credits || '',
          payments_received: bill.payments_received || '',
          previous_unpaid_balance: bill.previous_unpaid_balance || '',
          status: bill.status,
          notes: bill.notes || '',
          power_consumed_kwh: bill.power_consumed_kwh || '',
          total_generation_fees: bill.total_generation_fees || '',
          total_delivery_fees: bill.total_delivery_fees || '',
        });
      } else {
        setCurrentBill(null);
        setFormData({
          bill_start_date: '',
          bill_end_date: '',
          due_date: '',
          total_cost: '',
          taxes: '',
          fees: '',
          discounts: '',
          credits: '',
          payments_received: '',
          previous_unpaid_balance: '',
          status: 'Unpaid',
          notes: '',
          power_consumed_kwh: '',
          total_generation_fees: '',
          total_delivery_fees: '',
        });
      }
      setError(null);
    }
  }, [open, bill, isNew]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        bill_start_date: formData.bill_start_date,
        bill_end_date: formData.bill_end_date,
        due_date: formData.due_date,
        total_cost: parseFloat(formData.total_cost) || 0,
        taxes: formData.taxes ? parseFloat(formData.taxes) : null,
        fees: formData.fees ? parseFloat(formData.fees) : null,
        discounts: formData.discounts ? parseFloat(formData.discounts) : null,
        credits: formData.credits ? parseFloat(formData.credits) : null,
        payments_received: formData.payments_received ? parseFloat(formData.payments_received) : null,
        previous_unpaid_balance: formData.previous_unpaid_balance ? parseFloat(formData.previous_unpaid_balance) : null,
        status: formData.status,
        notes: formData.notes || null,
      };

      if (isElectricity) {
        payload.power_consumed_kwh = formData.power_consumed_kwh ? parseFloat(formData.power_consumed_kwh) : null;
        payload.total_generation_fees = formData.total_generation_fees ? parseFloat(formData.total_generation_fees) : null;
        payload.total_delivery_fees = formData.total_delivery_fees ? parseFloat(formData.total_delivery_fees) : null;
      }

      const url = isNew 
        ? `/api/utility-bill-tracker/accounts/${accountId}/bills`
        : `/api/utility-bill-tracker/accounts/${accountId}/bills/${bill!.id}`;

      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || Object.values(data.errors || {}).flat().join(', ') || 'Failed to save bill');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDeletePdf = async () => {
    if (!currentBill) return;
    
    setDeletingPdf(true);
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${currentBill.id}/pdf`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete PDF');
      }

      const data = await response.json();
      setCurrentBill(data.bill);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete PDF');
    } finally {
      setDeletingPdf(false);
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex > 0 ? 2 : 0)} ${units[unitIndex]}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add Bill' : 'Edit Bill'}</DialogTitle>
            <DialogDescription>
              {isNew ? 'Enter the details for the new bill.' : 'Update the bill details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bill_start_date">Bill Start Date</Label>
                <Input
                  id="bill_start_date"
                  type="date"
                  value={formData.bill_start_date}
                  onChange={(e) => handleInputChange('bill_start_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bill_end_date">Bill End Date</Label>
                <Input
                  id="bill_end_date"
                  type="date"
                  value={formData.bill_end_date}
                  onChange={(e) => handleInputChange('bill_end_date', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleInputChange('due_date', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => handleInputChange('status', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_cost">Total Cost ($)</Label>
              <Input
                id="total_cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.total_cost}
                onChange={(e) => handleInputChange('total_cost', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="taxes">Taxes ($)</Label>
                <Input
                  id="taxes"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.taxes}
                  onChange={(e) => handleInputChange('taxes', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fees">Fees ($)</Label>
                <Input
                  id="fees"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fees}
                  onChange={(e) => handleInputChange('fees', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discounts">Discounts ($)</Label>
                <Input
                  id="discounts"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.discounts}
                  onChange={(e) => handleInputChange('discounts', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="credits">Credits ($)</Label>
                <Input
                  id="credits"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.credits}
                  onChange={(e) => handleInputChange('credits', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payments_received">Payments Received ($)</Label>
                <Input
                  id="payments_received"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.payments_received}
                  onChange={(e) => handleInputChange('payments_received', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="previous_unpaid_balance">Prev. Unpaid Balance ($)</Label>
                <Input
                  id="previous_unpaid_balance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.previous_unpaid_balance}
                  onChange={(e) => handleInputChange('previous_unpaid_balance', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {isElectricity && (
              <>
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-4">Electricity Details</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="power_consumed_kwh">Power Consumed (kWh)</Label>
                  <Input
                    id="power_consumed_kwh"
                    type="number"
                    step="0.00001"
                    min="0"
                    value={formData.power_consumed_kwh}
                    onChange={(e) => handleInputChange('power_consumed_kwh', e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_generation_fees">Generation Fees ($)</Label>
                    <Input
                      id="total_generation_fees"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.total_generation_fees}
                      onChange={(e) => handleInputChange('total_generation_fees', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="total_delivery_fees">Delivery Fees ($)</Label>
                    <Input
                      id="total_delivery_fees"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.total_delivery_fees}
                      onChange={(e) => handleInputChange('total_delivery_fees', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Optional notes about this bill..."
                rows={3}
              />
            </div>

            {/* PDF Information Section */}
            {currentBill?.pdf_s3_path && (
              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Attached PDF</p>
                <div className="flex items-center justify-between p-3 rounded bg-muted/50">
                  <div className="flex items-center space-x-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{currentBill.pdf_original_filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(currentBill.pdf_file_size_bytes)}
                      </p>
                    </div>
                  </div>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="sm" 
                    onClick={handleDeletePdf}
                    disabled={deletingPdf}
                    className="text-destructive hover:text-destructive"
                  >
                    {deletingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : isNew ? 'Add Bill' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
