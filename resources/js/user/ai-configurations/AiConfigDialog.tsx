import React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
            onValueChange={v => setForm(f => ({ ...f, provider: v as Provider, model: '' }))}
          >
            <SelectTrigger id="config-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="bedrock">Bedrock</SelectItem>
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
          {form.provider === 'bedrock' ? (
            <Input
              id="config-model"
              required
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="e.g. anthropic.claude-3-5-sonnet-20241022-v2:0"
            />
          ) : (
            <div className="flex gap-2">
              <select
                id="config-model"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              >
                <option value="">Select a model…</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
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
          )}
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
            After this date the key will not be used. Leave blank for no expiry.
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
