'use client'

import currency from 'currency.js';
import { ChevronLeft } from 'lucide-react';
import React from 'react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchWrapper } from '@/fetchWrapper';

interface AllStatementsViewProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: number;
  fullScreen?: boolean;
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

export default function AllStatementsView({ isOpen, onClose, accountId, fullScreen = false }: AllStatementsViewProps) {
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

  const content = (
    <>
      <div className={`${fullScreen ? 'mb-6' : ''}`}>
        {fullScreen && (
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h2 className="text-2xl font-bold">All Statements Comparison</h2>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] sticky left-0 bg-background z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Line Item
                  </TableHead>
                  {dates.map(date => (
                    <TableHead key={date} className="text-right whitespace-nowrap px-4">
                      {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap px-4 bg-muted/30 font-bold">Last YTD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(groupedData).map(([section, lineItems]) => (
                  <React.Fragment key={section}>
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={dates.length + 2} className="font-bold py-2 sticky left-0 z-10">{section}</TableCell>
                    </TableRow>
                    {Object.entries(lineItems).map(([lineItem, { is_percentage, values, last_ytd_value }]) => (
                      <TableRow key={lineItem}>
                        <TableCell className="sticky left-0 bg-background z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          {lineItem}
                        </TableCell>
                        {dates.map(date => (
                          <TableCell key={date} className="text-right px-4">
                            {values[date] !== undefined ? (is_percentage ? `${values[date].toFixed(2)}%` : currency(values[date]).format()) : '-'}
                          </TableCell>
                        ))}
                        <TableCell className="text-right px-4 bg-muted/10 font-medium">
                          {is_percentage ? `${last_ytd_value.toFixed(2)}%` : currency(last_ytd_value).format()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );

  if (!fullScreen) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>All Statements Comparison</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="px-4 md:px-8 py-4">
      {content}
    </div>
  );
}
