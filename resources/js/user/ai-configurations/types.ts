export type Provider = 'gemini' | 'anthropic' | 'bedrock';

export interface UsagePeriod {
  input_tokens: number;
  output_tokens: number;
}

export interface AiConfigUsage {
  this_month: UsagePeriod;
  total: UsagePeriod;
}

export interface AiConfig {
  id: number;
  name: string;
  provider: Provider;
  model: string;
  masked_key: string;
  region: string | null;
  is_active: boolean;
  is_expired: boolean;
  expires_at: string | null;
  has_invalid_api_key: boolean;
  api_key_invalid_at: string | null;
  api_key_invalid_reason: string | null;
  created_at: string | null;
  usage: AiConfigUsage;
}

export interface FormState {
  name: string;
  provider: Provider;
  api_key: string;
  region: string;
  session_token: string;
  model: string;
  expires_at: string;
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  bedrock: 'Bedrock',
};

export const PROVIDER_BADGE_CLASS: Record<Provider, string> = {
  gemini: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  bedrock: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

export const EMPTY_FORM: FormState = {
  name: '',
  provider: 'gemini',
  api_key: '',
  region: 'us-east-1',
  session_token: '',
  model: '',
  expires_at: '',
};
