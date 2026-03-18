export interface FinRuleCondition {
  id?: number
  type: string
  operator: string
  value: string | null
  value_extra: string | null
}

export interface FinRuleAction {
  id?: number
  type: string
  target: string | null
  payload: string | null
  order: number
}

export interface FinRule {
  id: number
  user_id: number
  order: number
  title: string
  is_disabled: boolean
  stop_processing_if_match: boolean
  conditions: FinRuleCondition[]
  actions: FinRuleAction[]
  created_at: string
  updated_at: string
}

export interface RuleFormData {
  title: string
  is_disabled: boolean
  stop_processing_if_match: boolean
  conditions: FinRuleCondition[]
  actions: FinRuleAction[]
}

export const CONDITION_TYPES = [
  { value: 'amount', label: 'Amount' },
  { value: 'stock_symbol_presence', label: 'Stock Symbol' },
  { value: 'option_type', label: 'Option Type' },
  { value: 'account_id', label: 'Account' },
  { value: 'direction', label: 'Direction' },
  { value: 'description_contains', label: 'Description/Memo Contains' },
] as const

export const CONDITION_OPERATORS: Record<string, { value: string; label: string }[]> = {
  amount: [
    { value: 'ABOVE', label: 'Above' },
    { value: 'BELOW', label: 'Below' },
    { value: 'EXACTLY', label: 'Exactly' },
    { value: 'BETWEEN', label: 'Between' },
  ],
  stock_symbol_presence: [
    { value: 'HAVE', label: 'Has Symbol' },
    { value: 'DO_NOT_HAVE', label: 'No Symbol' },
  ],
  option_type: [
    { value: 'ANY', label: 'Any Option' },
    { value: 'CALL', label: 'Call' },
    { value: 'PUT', label: 'Put' },
  ],
  account_id: [
    { value: 'EQUALS', label: 'Is Account' },
  ],
  direction: [
    { value: 'INCOME', label: 'Income (Credit)' },
    { value: 'EXPENSE', label: 'Expense (Debit)' },
  ],
  description_contains: [
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'NOT_CONTAINS', label: 'Does Not Contain' },
  ],
}

export const ACTION_TYPES = [
  { value: 'add_tag', label: 'Add Tag' },
  { value: 'remove_tag', label: 'Remove Tag' },
  { value: 'remove_all_tags', label: 'Remove All Tags' },
  { value: 'find_replace', label: 'Find & Replace' },
  { value: 'set_description', label: 'Set Description' },
  { value: 'set_memo', label: 'Set Memo' },
  { value: 'negate_amount', label: 'Negate Amount' },
  { value: 'stop_processing_if_match', label: 'Stop Processing' },
] as const
