import * as React from 'react';
import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateAccountModal } from './CreateAccountModal';
import type { UtilityAccount } from '@/types/utility-bill-tracker';
import { formatCurrency } from '@/lib/formatCurrency';

export function UtilityAccountListPage() {
  const [accounts, setAccounts] = useState<UtilityAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/utility-bill-tracker/accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAccountCreated = () => {
    setShowCreateModal(false);
    fetchAccounts();
  };

  const handleRowClick = (accountId: number) => {
    window.location.href = `/utility-bill-tracker/${accountId}/bills`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="border-none shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-0">
          <div>
            <CardTitle className="text-2xl">Utility Bill Tracker</CardTitle>
            <CardDescription>Manage your utility accounts and bills</CardDescription>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <p>{error}</p>
              <Button variant="outline" onClick={fetchAccounts} className="mt-4">
                Retry
              </Button>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No utility accounts yet.</p>
              <p className="text-sm mt-2">Click "Add Account" to create your first utility account.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow 
                    key={account.id} 
                    className="cursor-pointer"
                    onClick={() => handleRowClick(account.id)}
                  >
                    <TableCell className="font-medium">{account.account_name}</TableCell>
                    <TableCell>{account.account_type}</TableCell>
                    <TableCell className="text-right">{account.bills_count ?? 0}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(account.bills_sum_total_cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateAccountModal 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal}
        onAccountCreated={handleAccountCreated}
      />
    </div>
  );
}
