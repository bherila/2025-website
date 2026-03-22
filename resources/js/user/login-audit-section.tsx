import { AlertTriangle, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { getCsrfToken } from './webauthn-utils';

interface AuditEntry {
  id: number;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  method: string;
  is_suspicious: boolean;
  created_at: string;
}

interface PaginatedResponse {
  data: AuditEntry[];
  current_page: number;
  last_page: number;
  total: number;
}

interface LoginAuditSectionProps {
  onError: (field: string, message: string) => void;
}

export const LoginAuditSection: React.FC<LoginAuditSectionProps> = ({ onError }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/login-audit?page=${p}`);
        if (!res.ok) throw new Error('Failed to load audit log');
        const data: PaginatedResponse = await res.json();
        setEntries(data.data);
        setPage(data.current_page);
        setLastPage(data.last_page);
        setTotal(data.total);
      } catch {
        onError('audit', 'Failed to load login audit log');
      } finally {
        setLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    fetchEntries(1);
  }, [fetchEntries]);

  const toggleSuspicious = async (id: number) => {
    try {
      const res = await fetch(`/api/login-audit/${id}/suspicious`, {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': getCsrfToken() },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_suspicious: data.is_suspicious } : e)),
      );
    } catch {
      onError('audit', 'Failed to update entry');
    }
  };

  const methodBadge = (method: string) => {
    switch (method) {
      case 'passkey':
        return <Badge variant="outline">Passkey</Badge>;
      case 'dev':
        return <Badge variant="secondary">Dev</Badge>;
      default:
        return <Badge variant="outline">Password</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Login History
        </CardTitle>
        <CardDescription>
          Your recent login attempts. Mark anything suspicious to keep track.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No login history found.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className={entry.is_suspicious ? 'bg-red-50 dark:bg-red-950/20' : undefined}
                  >
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{methodBadge(entry.method)}</TableCell>
                    <TableCell className="text-sm font-mono">{entry.ip_address ?? '—'}</TableCell>
                    <TableCell>
                      {entry.success ? (
                        <Badge className="bg-green-600 text-white hover:bg-green-700">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleSuspicious(entry.id)}
                        title={entry.is_suspicious ? 'Unmark suspicious' : 'Mark as suspicious'}
                        className={
                          entry.is_suspicious
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-muted-foreground hover:text-red-600'
                        }
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {lastPage > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} of {lastPage} ({total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    onClick={() => fetchEntries(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= lastPage}
                    onClick={() => fetchEntries(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
