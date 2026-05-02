import React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import type { AiConfig, FormState, Provider } from './types';

interface AiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingConfig: AiConfig | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  formError: string | null;
  saving: boolean;
  models: string[];
  fetchingModels: boolean;
  modelsError: string | null;
  fetchModelsDisabled: boolean;
  onFetchModels: () => void;
  onSave: (e: React.FormEvent) => void;
}

const tomorrow = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().slice(0, 10);
const providerOptions: { value: Provider; label: string }[] = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'Bedrock' },
];

export const AiConfigDialog: React.FC<AiConfigDialogProps> = ({
  open,
  onOpenChange,
  editingConfig,
  form,
  setForm,
  formError,
  saving,
  models,
  fetchingModels,
  modelsError,
  fetchModelsDisabled,
  onFetchModels,
  onSave,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editingConfig ? 'Edit configuration' : 'Add configuration'}</DialogTitle>
        <DialogDescription>
          {editingConfig
            ? 'Leave the API key blank to keep the existing key.'
            : 'Configure an AI provider for document processing.'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSave} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="config-name">Name</Label>
          <Input
            id="config-name"
            required
            maxLength={255}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="My Gemini Key"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="config-provider">Provider</Label>
          <Select
            value={form.provider}
            onValueChange={value => setForm(f => ({ ...f, provider: value as Provider, model: '' }))}
          >
            <SelectTrigger id="config-provider" className="w-full">
              <SelectValue>
                {(value: Provider | null) => providerOptions.find(provider => provider.value === value)?.label ?? ''}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map(provider => (
                <SelectItem key={provider.value} value={provider.value}>{provider.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="config-api-key">
            {form.provider === 'bedrock' ? 'Bedrock API Key (Bearer token)' : 'API Key'}
            {editingConfig && <span className="text-muted-foreground text-xs ml-1">(leave blank to keep current)</span>}
          </Label>
          <Input
            id="config-api-key"
            type="password"
            required={!editingConfig}
            value={form.api_key}
            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder={editingConfig ? '••••••••' : ''}
          />
        </div>

        {form.provider === 'bedrock' && (
          <>
            <div className="space-y-1">
              <Label htmlFor="config-region">Region</Label>
              <Input
                id="config-region"
                required
                value={form.region}
                onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                placeholder="us-east-1"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="config-session-token">
                Session Token <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="config-session-token"
                type="password"
                value={form.session_token}
                onChange={e => setForm(f => ({ ...f, session_token: e.target.value }))}
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label htmlFor="config-model">Model</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                items={models}
                value={form.model}
                onValueChange={value => setForm(f => ({ ...f, model: String(value ?? '') }))}
                autoHighlight
              >
                <ComboboxInput
                  id="config-model"
                  required
                  className="w-full min-w-0"
                  placeholder={models.length > 0 ? 'Search models…' : 'Fetch models to select…'}
                  showClear
                />
                <ComboboxContent align="start">
                  <ComboboxEmpty>No models found.</ComboboxEmpty>
                  <ComboboxList>
                    {models.map(model => (
                      <ComboboxItem key={model} value={model}>
                        {model}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fetchModelsDisabled}
              onClick={onFetchModels}
              className="shrink-0"
            >
              {fetchingModels ? <><Spinner className="mr-1 size-3" />Fetching…</> : 'Fetch models'}
            </Button>
          </div>
          {modelsError && (
            <Alert variant="destructive" className="mt-1 py-2">
              <AlertDescription className="text-xs">{modelsError}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="config-expires-at">
            Expiry date <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="config-expires-at"
            type="date"
            value={form.expires_at}
            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
            min={tomorrow}
          />
          <p className="text-xs text-muted-foreground">
            Starting on this date the key will not be used. Leave blank for no expiry.
          </p>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !form.model || fetchingModels}>
            {saving ? <><Spinner className="mr-1 size-3" />Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
