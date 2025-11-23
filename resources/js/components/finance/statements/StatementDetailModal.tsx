'use client'

import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect } from "react";
import { fetchWrapper } from "@/fetchWrapper";
import { Spinner } from "@/components/ui/spinner";
import currency from 'currency.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StatementDetail {
    section: string;
    line_item: string;
    statement_period_value: number;
    ytd_value: number;
    is_percentage: boolean;
}

interface StatementDetailModalProps {
    snapshotId: number;
    isOpen: boolean;
    onClose: () => void;
}

export default function StatementDetailModal({ snapshotId, isOpen, onClose }: StatementDetailModalProps) {
    const [isImporting, setIsImporting] = useState(false);
    const [details, setDetails] = useState<StatementDetail[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const fetchedData = await fetchWrapper.get(`/api/finance/statement/${snapshotId}/details`);
            setDetails(fetchedData.details.map((item: any) => ({
                ...item,
                statement_period_value: parseFloat(item.statement_period_value),
                ytd_value: parseFloat(item.ytd_value),
            })));
        } catch (error) {
            console.error('Error fetching statement details:', error);
            setDetails([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchDetails();
        }
    }, [snapshotId, isOpen]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            await fetchWrapper.post(`/api/finance/statement/${snapshotId}/import`, formData);
            fetchDetails(); // Re-fetch details after import
        } catch (error) {
            console.error('Error importing statement:', error);
        } finally {
            setIsImporting(false);
        }
    };

    const groupedDetails = details?.reduce((acc: Record<string, StatementDetail[]>, detail) => {
        if (!acc[detail.section]) {
            acc[detail.section] = [];
        }
        acc[detail.section]!.push(detail);
        return acc;
    }, {});

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>Statement Details</DialogTitle>
                </DialogHeader>
                <div className="flex justify-end items-center mb-4">
                    <Button onClick={handleImportClick} disabled={isImporting}>
                        {isImporting ? 'Importing...' : 'Import PDF'}
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="application/pdf"
                    />
                </div>

                {isLoading && <Spinner />}

                {!isLoading && groupedDetails && Object.entries(groupedDetails).map(([section, items]) => (
                    <div key={section} className="mb-8">
                        <h2 className="text-xl font-semibold mb-2">{section}</h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Line Item</TableHead>
                                <TableHead className="text-right w-50">Statement Period</TableHead>
                                <TableHead className="text-right w-50">YTD</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell>{item.line_item}</TableCell>
                                    <TableCell className="text-right">
                                        {item.is_percentage ? `${item.statement_period_value.toFixed(2)}%` : currency(item.statement_period_value).format()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.is_percentage ? `${item.ytd_value.toFixed(2)}%` : currency(item.ytd_value).format()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                ))}
                 {!isLoading && !details?.length && <p>No details found for this statement.</p>}
            </DialogContent>
        </Dialog>
    );
}
