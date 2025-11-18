'use client'

import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect } from "react";
import { fetchWrapper } from "@/fetchWrapper";
import { Spinner } from "@/components/ui/spinner";

interface StatementDetail {
    section: string;
    line_item: string;
    statement_period_value: number;
    ytd_value: number;
    is_percentage: boolean;
}

export default function FinanceStatementDetailPage({ snapshotId }: { snapshotId: number }) {
    const [isImporting, setIsImporting] = useState(false);
    const [details, setDetails] = useState<StatementDetail[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchDetails = async () => {
        try {
            const fetchedData = await fetchWrapper.get(`/api/finance/statement/${snapshotId}/details`);
            setDetails(fetchedData);
        } catch (error) {
            console.error('Error fetching statement details:', error);
            setDetails([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
    }, [snapshotId]);

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

    const groupedDetails = details?.reduce((acc, detail) => {
        if (!acc[detail.section]) {
            acc[detail.section] = [];
        }
        acc[detail.section].push(detail);
        return acc;
    }, {} as Record<string, StatementDetail[]>);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Statement Details</h1>
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
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                            <thead>
                                <tr>
                                    <th className="py-2 px-4 border-b">Line Item</th>
                                    <th className="py-2 px-4 border-b text-right">Statement Period</th>
                                    <th className="py-2 px-4 border-b text-right">YTD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="py-2 px-4 border-b">{item.line_item}</td>
                                        <td className="py-2 px-4 border-b text-right">
                                            {item.is_percentage ? `${item.statement_period_value.toFixed(2)}%` : item.statement_period_value.toFixed(2)}
                                        </td>
                                        <td className="py-2 px-4 border-b text-right">
                                            {item.is_percentage ? `${item.ytd_value.toFixed(2)}%` : item.ytd_value.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
