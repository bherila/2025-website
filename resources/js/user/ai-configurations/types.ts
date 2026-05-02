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

export const BEDROCK_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ca-central-1', label: 'Canada (Central)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-central-2', label: 'Europe (Zurich)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-south-1', label: 'Europe (Milan)' },
  { value: 'eu-south-2', label: 'Europe (Spain)' },
  { value: 'eu-north-1', label: 'Europe (Stockholm)' },
  { value: 'sa-east-1', label: 'South America (Sao Paulo)' },
  { value: 'us-gov-east-1', label: 'AWS GovCloud (US-East)' },
  { value: 'us-gov-west-1', label: 'AWS GovCloud (US-West)' },
] as const;

export const EMPTY_FORM: FormState = {
  name: '',
  provider: 'gemini',
  api_key: '',
  region: 'us-east-1',
  session_token: '',
  model: '',
  expires_at: '',
};
