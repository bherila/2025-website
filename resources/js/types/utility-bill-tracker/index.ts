export interface UtilityAccount {
  id: number;
  user_id: number;
  account_name: string;
  account_type: 'Electricity' | 'General';
  notes: string | null;
  bills_count?: number;
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
  status: 'Paid' | 'Unpaid';
  notes: string | null;
  // Electricity-specific fields
  power_consumed_kwh: string | null;
  total_generation_fees: string | null;
  total_delivery_fees: string | null;
  created_at: string;
  updated_at: string;
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
