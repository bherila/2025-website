
// Schema for a tag
export interface AccountLineItemTag {
  tag_id?: number;
  tag_userid: string;
  tag_color: string;
  tag_label: string;
};

// Schema validation for the account_line_items table
export interface AccountLineItem {
  t_id?: number;
  t_account?: number | null;
  t_date: string;
  t_date_posted?: string | null;
  t_type?: string | null;
  t_schc_category?: string | null;
  t_amt?: string;
  t_symbol?: string | null;
  t_cusip?: string | null;
  t_qty?: number;
  t_price?: string;
  t_commission?: string;
  t_fee?: string;
  t_method?: string | null;
  t_source?: string | null;
  t_origin?: string | null;
  opt_expiration?: string;
  opt_type?: 'call' | 'put' | null;
  opt_strike?: string | null;
  t_description?: string | null;
  t_comment?: string | null;
  t_from?: string | null;
  t_to?: string | null;
  t_interest_rate?: string | null;
  t_harvested_amount?: string | null;
  parent_t_id?: number | null;
  tags?: AccountLineItemTag[];
};
