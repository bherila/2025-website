import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClientInvoicePayment, Invoice, InvoiceLine } from "@/types/client-management";
import { format } from 'date-fns'
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchWrapper } from "@/fetchWrapper";

import AddPaymentModal from "./AddPaymentModal";
import ClientPortalNav from "./ClientPortalNav";
import LineItemEditModal from "./LineItemEditModal";
import ClientPortalInvoiceActionButtonRow from "./ClientPortalInvoiceActionButtonRow";
import TimeTrackingMonthSummaryRow from "./TimeTrackingMonthSummaryRow";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface ClientPortalInvoicePageProps {
    slug: string;
    companyName: string;
    invoiceId: number;
    isAdmin: boolean;
}

export default function ClientPortalInvoicePage({ slug, companyName, invoiceId, isAdmin }: ClientPortalInvoicePageProps) {
    const [invoice, setInvoice] = useState<Invoice | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isLineItemModalOpen, setLineItemModalOpen] = useState(false)
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false)
    const [selectedLineItem, setSelectedLineItem] = useState<InvoiceLine | null>(null)
    const [selectedPayment, setSelectedPayment] = useState<ClientInvoicePayment | null>(null)

    const fetchInvoice = async (isRefresh = false) => {
        if (isRefresh) {
            setIsRefreshing(true)
        } else {
            setIsLoading(true)
        }
        try {
            const data = await fetchWrapper.get(`/api/client/portal/${slug}/invoices/${invoiceId}`)
            setInvoice(data)
        } catch (error) {
            console.error("Failed to fetch invoice", error);
        } finally {
            if (isRefresh) {
                setIsRefreshing(false)
            } else {
                setIsLoading(false)
            }
        }
    }

    useEffect(() => {
        fetchInvoice()
    }, [invoiceId])

    const handleSaveLineItem = async (lineItem: InvoiceLine) => {
        const url = lineItem.client_invoice_line_id
            ? `/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/line-items/${lineItem.client_invoice_line_id}`
            : `/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/line-items`;
        const method = lineItem.client_invoice_line_id ? 'put' : 'post';

        try {
            await fetchWrapper[method](url, lineItem);
            fetchInvoice(true);
        } catch (error) {
            console.error("Failed to save line item", error);
        }
    }

    const handleDeleteLineItem = async (lineItem: InvoiceLine) => {
        try {
            await fetchWrapper.delete(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/line-items/${lineItem.client_invoice_line_id}`, {});
            fetchInvoice(true);
        } catch (error) {
            console.error("Failed to delete line item", error);
        }
    }
    
    const handleSavePayment = async (payment: Partial<ClientInvoicePayment>) => {
        const url = payment.client_invoice_payment_id
            ? `/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/payments/${payment.client_invoice_payment_id}`
            : `/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/payments`;
        const method = payment.client_invoice_payment_id ? 'put' : 'post';

        try {
            await fetchWrapper[method](url, payment);
            fetchInvoice(true);
        } catch (error) {
            console.error("Failed to save payment", error);
        }
    }

    const handleDeletePayment = async (payment: ClientInvoicePayment) => {
        try {
            await fetchWrapper.delete(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/payments/${payment.client_invoice_payment_id}`, {});
            // Close the modal and clear selected payment after successful delete
            setPaymentModalOpen(false);
            setSelectedPayment(null);
            fetchInvoice(true);
        } catch (error) {
            console.error("Failed to delete payment", error);
        }
    }

    const handleIssueInvoice = async () => {
        if (confirm('Are you sure you want to issue this invoice? This will set the issue date and make it visible to the client.')) {
            try {
                await fetchWrapper.post(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/issue`, {});
                fetchInvoice(true);
            } catch (error) {
                console.error("Failed to issue invoice", error);
            }
        }
    }

    const handleVoidInvoice = async () => {
        if (confirm('Are you sure you want to void this invoice?')) {
            try {
                await fetchWrapper.post(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/void`, {});
                fetchInvoice(true);
            } catch (error) {
                console.error("Failed to void invoice", error);
            }
        }
    }

    const handleUnVoidInvoice = async (targetStatus: 'issued' | 'draft') => {
        const statusLabel = targetStatus === 'issued' ? 'Issued' : 'Draft';
        if (confirm(`Are you sure you want to revert this invoice to ${statusLabel} status?`)) {
            try {
                await fetchWrapper.post(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}/unvoid`, { status: targetStatus });
                fetchInvoice(true);
            } catch (error) {
                console.error("Failed to un-void invoice", error);
            }
        }
    }

    const handleDeleteInvoice = async () => {
        if (confirm('Are you sure you want to delete this invoice? This cannot be undone.')) {
            try {
                await fetchWrapper.delete(`/api/client/mgmt/companies/${invoice!.client_company_id}/invoices/${invoiceId}`, {});
                window.location.href = `/client/portal/${slug}/invoices`;
            } catch (error) {
                console.error("Failed to delete invoice", error);
            }
        }
    }
    
    const isEditable = invoice?.status === 'draft';
    const hasPayments = invoice?.payments && invoice.payments.length > 0;
    const canVoid = !!(invoice && invoice.status !== 'void' && invoice.status !== 'paid' && !hasPayments);

    if (isLoading || !invoice) {
        return (
            <>
                <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoice" />
                <div className="container mx-auto px-8 max-w-5xl">
                    <div className="mb-6">
                        <Skeleton className="h-5 w-48" />
                    </div>
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <Skeleton className="h-8 w-48 mb-2" />
                            <Skeleton className="h-4 w-64 mb-1" />
                            <Skeleton className="h-4 w-56" />
                        </div>
                        <div className="text-right">
                            <Skeleton className="h-10 w-32 mb-2" />
                            <Skeleton className="h-6 w-16" />
                        </div>
                    </div>
                    <Skeleton className="h-48 w-full mb-4" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </>
        )
    }

    return (
        <>
            <ClientPortalNav slug={slug} companyName={companyName} currentPage="invoice" />
            
            <div className="container mx-auto px-8 max-w-5xl">
                <div className="mb-6">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/client/portal/${slug}`}>Home</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink href={`/client/portal/${slug}/invoices`}>Invoices</BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Invoice {invoice.invoice_number}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>

                <ClientPortalInvoiceActionButtonRow
                    invoice={invoice}
                    isAdmin={isAdmin}
                    isEditable={isEditable}
                    isRefreshing={isRefreshing}
                    canVoid={canVoid}
                    onIssue={handleIssueInvoice}
                    onAddPayment={() => { setSelectedPayment(null); setPaymentModalOpen(true); }}
                    onAddLineItem={() => { setSelectedLineItem(null); setLineItemModalOpen(true); }}
                    onVoid={handleVoidInvoice}
                    onUnVoid={handleUnVoidInvoice}
                    onDelete={handleDeleteInvoice}
                />

                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Invoice {invoice.invoice_number}</h1>
                        <p className="text-muted-foreground">
                            For {companyName} <br />
                            Period: {format(new Date(invoice.period_start!), 'MMM d, yyyy')} - {format(new Date(invoice.period_end!), 'MMM d, yyyy')}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-bold mb-2">${parseFloat(invoice.invoice_total).toFixed(2)}</div>
                        <Badge variant={invoice.status === 'paid' ? 'default' : 'outline'} className={invoice.status === 'paid' ? 'bg-green-600' : ''}>
                            {invoice.status.toUpperCase()}
                        </Badge>
                    </div>
                </div>

                <div className="space-y-8">
                    <section>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Unit Price</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    {isAdmin && (
                                        <TableHead className="w-[40px] py-2 text-right">
                                            <Pencil className="h-3 w-3 ml-auto text-muted-foreground/50" />
                                        </TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoice.line_items.map(item => (
                                    <TableRow 
                                        key={item.client_invoice_line_id}
                                        className={`group ${isAdmin && isEditable ? 'cursor-pointer' : ''}`}
                                        onClick={() => isAdmin && isEditable && !isRefreshing && (setSelectedLineItem(item), setLineItemModalOpen(true))}
                                    >
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell className="text-right">{parseFloat(item.quantity).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${parseFloat(item.unit_price).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">${parseFloat(item.line_total).toFixed(2)}</TableCell>
                                        {isAdmin && (
                                            <TableCell className="py-1 align-top text-right">
                                                {isEditable && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => { 
                                                            e.stopPropagation();
                                                            setSelectedLineItem(item); 
                                                            setLineItemModalOpen(true); 
                                                        }} 
                                                        disabled={isRefreshing}
                                                    >
                                                        <Pencil className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </section>

                    {/* Payments Section - only show table if there are payments */}
                    {hasPayments && (
                        <section>
                            <h3 className="text-xl font-semibold mb-4">Payments</h3>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead>Notes</TableHead>
                                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoice.payments.map(p => (
                                        <TableRow key={p.client_invoice_payment_id}>
                                            <TableCell>{format(new Date(p.payment_date), 'MMM d, yyyy')}</TableCell>
                                            <TableCell>${parseFloat(p.amount).toFixed(2)}</TableCell>
                                            <TableCell>{p.payment_method}</TableCell>
                                            <TableCell>{p.notes}</TableCell>
                                            {isAdmin && (
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" onClick={() => { setSelectedPayment(p); setPaymentModalOpen(true); }} disabled={isRefreshing}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p)} disabled={isRefreshing}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </section>
                    )}

                    <div className="flex flex-col items-end gap-2 border-t pt-4">
                        <div className="text-muted-foreground text-sm">
                            Total Billed: ${parseFloat(invoice.invoice_total).toFixed(2)}
                        </div>
                        <div className="text-muted-foreground text-sm">
                            Total Paid: ${parseFloat(invoice.payments_total || '0').toFixed(2)}
                        </div>
                        <div className="text-2xl font-bold">
                            Remaining Balance: ${parseFloat(invoice.remaining_balance).toFixed(2)}
                        </div>
                    </div>

                    <div className="pt-8 border-t">
                        <h3 className="text-lg font-semibold mb-2">Hourly Summary</h3>
                        <p className="text-sm text-muted-foreground mb-4">A breakdown of hours tracked and applied for this billing period. This is for informational purposes only.</p>
                        <TimeTrackingMonthSummaryRow 
                            openingAvailable={parseFloat(invoice.retainer_hours_included)}
                            hoursWorked={parseFloat(invoice.hours_worked)}
                            hoursUsedFromRollover={parseFloat(invoice.rollover_hours_used)}
                            excessHours={parseFloat(invoice.hours_billed_at_rate)}
                            negativeBalance={parseFloat(invoice.negative_hours_balance)}
                            remainingPool={parseFloat(invoice.unused_hours_balance)}
                        />
                    </div>
                </div>

                <LineItemEditModal
                    isOpen={isLineItemModalOpen}
                    onClose={() => setLineItemModalOpen(false)}
                    lineItem={selectedLineItem}
                    onSave={handleSaveLineItem}
                    onDelete={handleDeleteLineItem}
                />
                <AddPaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => { setPaymentModalOpen(false); setSelectedPayment(null); }}
                    payment={selectedPayment}
                    defaultAmount={invoice.remaining_balance}
                    onSave={handleSavePayment}
                    onDelete={handleDeletePayment}
                />
            </div>
        </>
    )
}