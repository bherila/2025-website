export interface ClientInvoicePayment {
  client_invoice_payment_id: number;
  client_invoice_id: number;
  amount: string;
  payment_date: string;
  payment_method: 'Credit Card' | 'ACH' | 'Wire' | 'Check' | 'Other';
  notes: string | null;
  created_at: string;
  updated_at: string;
}
