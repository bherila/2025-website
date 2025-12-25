'use client'

import { useEffect, useState } from 'react';
import { fetchWrapper } from '@/fetchWrapper';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import currency from 'currency.js';

interface AllDetails {
  statement_closing_date: string;
  section: string;
  line_item: string;
  statement_period_value: number;
  is_percentage: boolean;
}

interface AllStatementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: number;
}

interface GroupedData {
    [section: string]: {
        [line_item: string]: {
            is_percentage: boolean;
            values: { [date: string]: number };
            last_ytd_value: number;
        };
    };
}

export default function AllStatementsModal({ isOpen, onClose, accountId }: AllStatementsModalProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [groupedData, setGroupedData] = useState<GroupedData>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchWrapper.get(`/api/finance/${accountId}/all-statement-details`)
        .then(fetchedData => {
            setDates(fetchedData.dates);
            setGroupedData(fetchedData.groupedData);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, accountId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>All Statements</DialogTitle>
        </DialogHeader>
        {isLoading ? <Spinner /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                {dates.map(date => (
                  <TableHead key={date} className="text-right">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </TableHead>
                ))}
                <TableHead className="text-right">Last YTD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedData).map(([section, lineItems]) => (
                <>
                  <TableRow key={section} className="bg-muted/50">
                    <TableCell colSpan={dates.length + 2} className="font-bold">{section}</TableCell>
                  </TableRow>
                  {Object.entries(lineItems).map(([lineItem, { is_percentage, values, last_ytd_value }]) => (
                    <TableRow key={lineItem}>
                      <TableCell>{lineItem}</TableCell>
                      {dates.map(date => (
                        <TableCell key={date} className="text-right">
                          {values[date] !== undefined ? (is_percentage ? `${values[date].toFixed(2)}%` : currency(values[date]).format()) : '-'}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        {is_percentage ? `${last_ytd_value.toFixed(2)}%` : currency(last_ytd_value).format()}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
