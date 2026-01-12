import * as React from 'react';
import { useState, useEffect } from 'react';
import { Loader2, Search, Link2, Unlink, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { UtilityBill, LinkableTransaction } from '@/types/utility-bill-tracker';
import { formatDate } from '@/lib/DateHelper';
import { formatCurrency } from '@/lib/formatCurrency';

interface LinkBillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  bill: UtilityBill | null;
  onLinked: () => void;
}

export function LinkBillModal({ open, onOpenChange, accountId, bill, onLinked }: LinkBillModalProps) {
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [transactions, setTransactions] = useState<LinkableTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkableTransactions = async () => {
    if (!bill) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${bill.id}/linkable`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch linkable transactions');
      }
      
      const data = await response.json();
      // The API returns { potential_matches: [...], bill: {...}, current_link: ... }
      setTransactions(data.potential_matches || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && bill) {
      fetchLinkableTransactions();
    }
  }, [open, bill?.id]);

  const handleLink = async (tId: number) => {
    if (!bill) return;
    
    setLinking(true);
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${bill.id}/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({ t_id: tId }),
      });

      if (!response.ok) {
        throw new Error('Failed to link transaction');
      }

      onOpenChange(false);
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!bill) return;
    
    setUnlinking(true);
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${bill.id}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to unlink transaction');
      }

      onOpenChange(false);
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setUnlinking(false);
    }
  };

  const handleClose = () => {
    if (!linking && !unlinking) {
      setTransactions([]);
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link to Transaction</DialogTitle>
          <DialogDescription>
            {bill && (
              <>
                Link this bill ({formatCurrency(bill.total_cost)}, due {formatDate(bill.due_date)}) to a finance transaction.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {bill?.t_id ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center space-x-2 text-green-600">
              <CheckCircle className="h-6 w-6" />
              <span className="font-medium">This bill is linked to a transaction</span>
            </div>
            {bill.linked_transaction && (
              <div className="text-center text-sm text-muted-foreground">
                {formatDate(bill.linked_transaction.t_date)} - {formatCurrency(bill.linked_transaction.t_amt)}
                <br />
                {bill.linked_transaction.t_description}
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleUnlink}
                disabled={unlinking}
              >
                {unlinking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Unlinking...
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />
                    Unlink Transaction
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Searching for matching transactions...</p>
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={fetchLinkableTransactions} className="mt-4">
              Retry
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No matching transactions found.</p>
            <p className="text-sm mt-2">
              We searched for transactions within 90 days after the bill end date with amounts within 10% of the total cost.
            </p>
          </div>
        ) : (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Found {transactions.length} potential matching transaction(s):
            </p>
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.t_id}>
                      <TableCell>{formatDate(tx.t_date)}</TableCell>
                      <TableCell className="max-w-[100px] truncate" title={tx.acct_name}>
                        {tx.acct_name}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={tx.t_description || ''}>
                        {tx.t_description || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(tx.t_amt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          onClick={() => handleLink(tx.t_id)}
                          disabled={linking}
                        >
                          {linking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Link2 className="h-4 w-4 mr-1" />
                              Link
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {!bill?.t_id && !loading && transactions.length > 0 && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        )}

        {!bill?.t_id && !loading && transactions.length === 0 && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
