import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import { Ban, PlusCircle, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import type { Invoice } from "@/types/client-management";

interface ClientPortalInvoiceActionButtonRowProps {
    invoice: Invoice;
    isAdmin: boolean;
    isEditable: boolean;
    isRefreshing: boolean;
    canVoid: boolean;
    onIssue: () => void;
    onAddPayment: () => void;
    onAddLineItem: () => void;
    onVoid: () => void;
    onUnVoid: (status: 'issued' | 'draft') => void;
    onDelete: () => void;
}

export default function ClientPortalInvoiceActionButtonRow({
    invoice,
    isAdmin,
    isEditable,
    isRefreshing,
    canVoid,
    onIssue,
    onAddPayment,
    onAddLineItem,
    onVoid,
    onUnVoid,
    onDelete
}: ClientPortalInvoiceActionButtonRowProps) {
    if (!isAdmin) return null;

    return (
        <div className="mb-8 flex justify-between items-center gap-4 flex-wrap print:hidden">
            <ButtonGroup>
                {invoice.status === 'draft' && (
                    <Button
                        onClick={onIssue}
                        disabled={isRefreshing}
                        className="bg-green-600 hover:bg-green-700 text-white border-green-700 rounded-r-none"
                    >
                        <Send className="mr-2 h-4 w-4" />
                        Issue Invoice
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={onAddPayment}
                    disabled={isRefreshing}
                    className={cn(
                        invoice.status === 'draft' && "rounded-none border-l-0",
                        invoice.status !== 'draft' && "rounded-r-none"
                    )}
                >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Payment
                </Button>
                {isEditable && (
                    <Button
                        variant="outline"
                        onClick={onAddLineItem}
                        disabled={isRefreshing}
                        className="rounded-l-none border-l-0"
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Line Item
                    </Button>
                )}
                {invoice.status === 'void' && (
                    <>
                        <Button variant="outline" onClick={() => onUnVoid('issued')} disabled={isRefreshing} className="rounded-l-none border-l-0">
                            <Undo2 className="mr-2 h-4 w-4" />
                            Restore as Issued
                        </Button>
                        <Button variant="outline" onClick={() => onUnVoid('draft')} disabled={isRefreshing} className="rounded-l-none border-l-0">
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restore as Draft
                        </Button>
                    </>
                )}
            </ButtonGroup>

            <div className="flex gap-2 items-center">
                {canVoid && (
                    <Button
                        variant="outline"
                        onClick={onVoid}
                        disabled={isRefreshing}
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                    >
                        <Ban className="mr-2 h-4 w-4" />
                        Void Invoice
                    </Button>
                )}
                {isEditable && (
                    <Button variant="ghost" onClick={onDelete} disabled={isRefreshing} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Invoice
                    </Button>
                )}
            </div>
        </div>
    );
}
