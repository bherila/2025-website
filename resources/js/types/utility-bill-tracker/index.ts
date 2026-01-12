export interface UtilityAccount {
  id: number;
  user_id: number;
  account_name: string;
  account_type: 'Electricity' | 'General';
  notes: string | null;
  bills_count?: number;
  bills_sum_total_cost?: string | null; // Sum of all bill total_cost values
  created_at: string;
  updated_at: string;
}

export interface UtilityBill {
  id: number;
  utility_account_id: number;
  bill_start_date: string;
  bill_end_date: string;
  due_date: string;
  total_cost: string; // Stored as decimal string
  taxes: string | null; // Tax amount
  fees: string | null; // Fees amount
  status: 'Paid' | 'Unpaid';
  notes: string | null;
  // Electricity-specific fields
  power_consumed_kwh: string | null;
  total_generation_fees: string | null;
  total_delivery_fees: string | null;
  // Transaction linking
  t_id: number | null; // Linked FinAccountLineItem t_id
  linked_transaction?: FinAccountLineItemSummary | null;
  // PDF storage
  pdf_original_filename: string | null;
  pdf_stored_filename: string | null;
  pdf_s3_path: string | null;
  pdf_file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

// Summary of a linked finance transaction
export interface FinAccountLineItemSummary {
  t_id: number;
  t_date: string;
  t_amt: string;
  t_desc: string | null;
  account_name?: string;
}

// Linkable transaction search result
export interface LinkableTransaction {
  t_id: number;
  t_date: string;
  t_amt: string;
  t_desc: string | null;
  account_name: string;
  account_id: number;
}

export interface CreateUtilityAccountRequest {
  account_name: string;
  account_type: 'Electricity' | 'General';
}

export interface UpdateUtilityAccountNotesRequest {
  notes: string | null;
}

export interface CreateUtilityBillRequest {
  bill_start_date: string;
  bill_end_date: string;
  due_date: string;
  total_cost: number;
  taxes?: number | null;
  fees?: number | null;
  status: 'Paid' | 'Unpaid';
  notes?: string | null;
  power_consumed_kwh?: number | null;
  total_generation_fees?: number | null;
  total_delivery_fees?: number | null;
}

export interface UpdateUtilityBillRequest extends CreateUtilityBillRequest {}

export interface ImportBillResponse {
  success: boolean;
  message: string;
  bill: UtilityBill;
  extracted_data: Record<string, unknown>;
}

export interface ToggleStatusResponse {
  success: boolean;
  bill: UtilityBill;
}

export interface LinkTransactionRequest {
  t_id: number;
}

export interface LinkTransactionResponse {
  success: boolean;
  bill: UtilityBill;
}

export interface UnlinkTransactionResponse {
  success: boolean;
  bill: UtilityBill;
}

export interface DeletePdfResponse {
  success: boolean;
  bill: UtilityBill;
}
