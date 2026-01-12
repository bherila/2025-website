import * as React from 'react';
import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Upload, Trash2, Pencil, Link2, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EditBillModal } from './EditBillModal';
import { ImportBillModal } from './ImportBillModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { LinkBillModal } from './LinkBillModal';
import type { UtilityAccount, UtilityBill } from '@/types/utility-bill-tracker';
import { formatDate } from '@/lib/DateHelper';
import { formatCurrency } from '@/lib/formatCurrency';

interface UtilityBillListPageProps {
  accountId: number;
  accountName: string;
  accountType: 'Electricity' | 'General';
}

export function UtilityBillListPage({ accountId, accountName, accountType }: UtilityBillListPageProps) {
  const [account, setAccount] = useState<UtilityAccount | null>(null);
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteBillModal, setShowDeleteBillModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<UtilityBill | null>(null);
  const [isNewBill, setIsNewBill] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState<number | null>(null);

  const isElectricity = accountType === 'Electricity';

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accountRes, billsRes] = await Promise.all([
        fetch(`/api/utility-bill-tracker/accounts/${accountId}`),
        fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills`),
      ]);

      if (!accountRes.ok || !billsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const accountData = await accountRes.json();
      const billsData = await billsRes.json();

      setAccount(accountData);
      // Sort bills by due date descending
      const sortedBills = billsData.sort((a: UtilityBill, b: UtilityBill) => 
        new Date(b.due_date).getTime() - new Date(a.due_date).getTime()
      );
      setBills(sortedBills);
      setNotes(accountData.notes || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accountId]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to save notes');
      }

      setNotesChanged(false);
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesChanged(true);
  };

  const handleEditBill = (bill: UtilityBill) => {
    setSelectedBill(bill);
    setIsNewBill(false);
    setShowEditModal(true);
  };

  const handleAddBill = () => {
    setSelectedBill(null);
    setIsNewBill(true);
    setShowEditModal(true);
  };

  const handleDeleteBill = (bill: UtilityBill) => {
    setSelectedBill(bill);
    setShowDeleteBillModal(true);
  };

  const handleToggleStatus = async (bill: UtilityBill) => {
    if (togglingStatus === bill.id) return;
    
    setTogglingStatus(bill.id);
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${bill.id}/toggle-status`, {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to toggle status');
      }

      const data = await response.json();
      // Update the bill in the local state
      setBills(prev => prev.map(b => b.id === bill.id ? data.bill : b));
    } catch (err) {
      console.error('Failed to toggle status:', err);
    } finally {
      setTogglingStatus(null);
    }
  };

  const handleLinkBill = (bill: UtilityBill) => {
    setSelectedBill(bill);
    setShowLinkModal(true);
  };

  const handleDownloadPdf = (bill: UtilityBill) => {
    window.open(`/api/utility-bill-tracker/accounts/${accountId}/bills/${bill.id}/download-pdf`, '_blank');
  };

  const confirmDeleteBill = async () => {
    if (!selectedBill) return;

    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}/bills/${selectedBill.id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete bill');
      }

      setShowDeleteBillModal(false);
      setSelectedBill(null);
      fetchData();
    } catch (err) {
      console.error('Failed to delete bill:', err);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch(`/api/utility-bill-tracker/accounts/${accountId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      window.location.href = '/utility-bill-tracker';
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete account');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-destructive">
              <p>{error}</p>
              <Button variant="outline" onClick={fetchData} className="mt-4">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => window.location.href = '/utility-bill-tracker'}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Card className="border-none shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-0">
          <div>
            <CardTitle className="text-2xl">{accountName}</CardTitle>
            <CardDescription>
              <Badge variant="outline">{accountType}</Badge>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import PDF
            </Button>
            <Button onClick={handleAddBill}>
              <Plus className="h-4 w-4 mr-2" />
              Add Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {bills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No bills yet for this account.</p>
              <p className="text-sm mt-2">Add a bill manually or import from a PDF.</p>
              <div className="mt-6">
                <Button variant="destructive" onClick={() => setShowDeleteAccountModal(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill Period</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Taxes</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  {isElectricity && (
                    <>
                      <TableHead className="text-right">Power (kWh)</TableHead>
                      <TableHead className="text-right">Generation</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                    </>
                  )}
                  <TableHead>Status</TableHead>
                  <TableHead>Linked</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>
                      {formatDate(bill.bill_start_date)} - {formatDate(bill.bill_end_date)}
                    </TableCell>
                    <TableCell>{formatDate(bill.due_date)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(bill.total_cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {bill.taxes ? formatCurrency(bill.taxes) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {bill.fees ? formatCurrency(bill.fees) : '-'}
                    </TableCell>
                    {isElectricity && (
                      <>
                        <TableCell className="text-right">
                          {bill.power_consumed_kwh ? parseFloat(bill.power_consumed_kwh).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {bill.total_generation_fees ? formatCurrency(bill.total_generation_fees) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {bill.total_delivery_fees ? formatCurrency(bill.total_delivery_fees) : '-'}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Badge 
                        variant={bill.status === 'Paid' ? 'outline' : 'destructive'}
                        className={cn(
                          "cursor-pointer hover:opacity-80 transition-opacity",
                          bill.status === 'Paid' && "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900"
                        )}
                        onClick={() => handleToggleStatus(bill)}
                      >
                        {togglingStatus === bill.id ? '...' : bill.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {bill.t_id ? (
                        <a 
                          href={bill.linked_transaction ? `/finance/accounts/${bill.linked_transaction.account_name ? '' : ''}` : '#'}
                          className="text-primary hover:underline text-xs"
                          title={bill.linked_transaction?.t_desc || 'Linked transaction'}
                        >
                          {bill.linked_transaction ? formatCurrency(bill.linked_transaction.t_amt) : 'Yes'}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={bill.notes || ''}>
                      {bill.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {bill.pdf_s3_path && (
                          <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(bill)} title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleLinkBill(bill)} title="Link to Transaction">
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEditBill(bill)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteBill(bill)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Account Notes Section */}
      <Card className="border-none shadow-none">
        <CardHeader className="px-0">
          <CardTitle className="text-lg">Account Notes</CardTitle>
          <CardDescription>Add any notes about this utility account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes about this account..."
            rows={4}
          />
          <div className="flex justify-end">
            <Button 
              onClick={handleSaveNotes} 
              disabled={!notesChanged || savingNotes}
            >
              {savingNotes ? 'Saving...' : 'Save Notes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <EditBillModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        accountId={accountId}
        accountType={accountType}
        bill={selectedBill}
        isNew={isNewBill}
        onSaved={fetchData}
      />

      <ImportBillModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        accountId={accountId}
        onImported={fetchData}
      />

      <DeleteConfirmModal
        open={showDeleteBillModal}
        onOpenChange={setShowDeleteBillModal}
        title="Delete Bill"
        description="Are you sure you want to delete this bill? This action cannot be undone."
        onConfirm={confirmDeleteBill}
      />

      <DeleteConfirmModal
        open={showDeleteAccountModal}
        onOpenChange={setShowDeleteAccountModal}
        title="Delete Account"
        description={`Are you sure you want to delete "${accountName}"? This action cannot be undone.`}
        onConfirm={handleDeleteAccount}
      />

      <LinkBillModal
        open={showLinkModal}
        onOpenChange={setShowLinkModal}
        accountId={accountId}
        bill={selectedBill}
        onLinked={fetchData}
      />
    </div>
  );
}
