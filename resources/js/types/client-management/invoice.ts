import type { ClientInvoicePayment } from './invoice-payment';

export type { ClientInvoicePayment };

export interface InvoiceLine {
  client_invoice_line_id: number;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  line_type: string;
  hours: string | null;
}

export interface Invoice {
  client_invoice_id: number;
  client_company_id: number;
  invoice_number: string | null;
  invoice_total: string;
  issue_date: string | null;
  due_date: string | null;
  paid_date: string | null;
  status: 'draft' | 'issued' | 'paid' | 'void' | 'canceled';
  period_start: string | null;
  period_end: string | null;
  retainer_hours_included: string;
  hours_worked: string;
  rollover_hours_used: string;
  unused_hours_balance: string;
  negative_hours_balance: string;
  hours_billed_at_rate: string;
  notes: string | null;
  line_items: InvoiceLine[];
  payments: ClientInvoicePayment[];
  remaining_balance: string;
}

export interface InvoicePreview {
  period_start: string
  period_end: string
  time_entries_count: number
  hours_worked: number
  invoice_total: number
  delayed_billing_hours: number
  delayed_billing_entries_count: number
  agreement?: {
    monthly_retainer_hours: string
    monthly_retainer_fee: string
    hourly_rate: string
  }
  calculation?: {
    hours_covered_by_retainer: number
    rollover_hours_used: number
    hours_billed_at_rate: number
    unused_hours_balance: number
  }
}

export interface ClientAdminActionsProps {
  companyId: number
  onClose: () => void
  onSuccess?: () => void
}