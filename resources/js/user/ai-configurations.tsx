import React, { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { fetchWrapper } from '@/fetchWrapper';

type Provider = 'gemini' | 'anthropic' | 'bedrock';

interface AiConfig {
  id: number;
  name: string;
  provider: Provider;
  model: string;
  masked_key: string;
  region: string | null;
  is_active: boolean;
  created_at: string | null;
}

interface FormState {
  name: string;
  provider: Provider;
  api_key: string;
  region: string;
  session_token: string;
  model: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  bedrock: 'Bedrock',
};

const PROVIDER_BADGE_CLASS: Record<Provider, string> = {
  gemini: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  bedrock: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const EMPTY_FORM: FormState = {
  name: '',
  provider: 'gemini',
  api_key: '',
  region: 'us-east-1',
  session_token: '',
  model: '',
};

interface AiConfigurationsSectionProps {
  onSuccess: (message: string) => void;
  onError: (field: string, message: string) => void;
}

export const AiConfigurationsSection: React.FC<AiConfigurationsSectionProps> = ({ onSuccess, onError }) => {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoadError(null);
    try {
      const data = (await fetchWrapper.get('/api/user/ai-prefs')) as AiConfig[];
      setConfigs(data);
    } catch {
      setLoadError('Failed to load AI configurations. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const openAdd = () => {
    setEditingConfig(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModels([]);
    setModelsError(null);
    setDialogOpen(true);
  };

  const openEdit = (config: AiConfig) => {
    setEditingConfig(config);
    setForm({
      name: config.name,
      provider: config.provider,
      api_key: '',
      region: config.region ?? 'us-east-1',
      session_token: '',
      model: config.model,
    });
    setFormError(null);
    setModels([config.model]);
    setModelsError(null);
    setDialogOpen(true);
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setModelsError(null);
    try {
      const payload: Record<string, string | number> = {
        provider: form.provider,
      };
      if (form.api_key) {
        payload.api_key = form.api_key;
      } else if (editingConfig) {
        payload.config_id = editingConfig.id;
      }
      if (form.provider === 'bedrock') {
        payload.region = form.region;
        if (form.session_token) payload.session_token = form.session_token;
      }
      const data = (await fetchWrapper.post('/api/user/ai-prefs/models', payload)) as { models: string[] };
      setModels(data.models);
      if (!data.models.includes(form.model)) {
        setForm(f => ({ ...f, model: '' }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch models';
      setModelsError(msg);
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.model) {
      setFormError('Please select a model.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, string> = {
        name: form.name,
        provider: form.provider,
        model: form.model,
      };
      if (form.api_key) payload.api_key = form.api_key;
      if (form.provider === 'bedrock') {
        payload.region = form.region;
        if (form.session_token) payload.session_token = form.session_token;
      }

      if (editingConfig) {
        await fetchWrapper.put(`/api/user/ai-prefs/${editingConfig.id}`, payload);
        onSuccess('Configuration updated.');
      } else {
        if (!form.api_key) {
          setFormError('API key is required.');
          return;
        }
        payload.api_key = form.api_key;
        await fetchWrapper.post('/api/user/ai-prefs', payload);
        onSuccess('Configuration added.');
      }
      setDialogOpen(false);
      await loadConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (config: AiConfig) => {
    setActivatingId(config.id);
    try {
      await fetchWrapper.post(`/api/user/ai-prefs/${config.id}/activate`, {});
      onSuccess(`"${config.name}" is now active.`);
      await loadConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to activate configuration';
      onError('aiConfig', msg);
    } finally {
      setActivatingId(null);
    }
  };

  const handleDelete = async (config: AiConfig) => {
    setDeletingId(config.id);
    try {
      await fetchWrapper.delete(`/api/user/ai-prefs/${config.id}`, {});
      onSuccess(`"${config.name}" deleted.`);
      await loadConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete configuration';
      onError('aiConfig', msg);
    } finally {
      setDeletingId(null);
    }
  };

  const fetchModelsDisabled = fetchingModels || (!form.api_key && !editingConfig);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>AI Configurations</CardTitle>
          <Button size="sm" onClick={openAdd}>Add configuration</Button>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {!loading && loadError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                {loadError}
                <Button variant="outline" size="sm" onClick={loadConfigs}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
          {!loading && !loadError && configs.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No AI configurations yet. Add one to use multi-provider document processing.
            </p>
          )}
          {!loading && !loadError && configs.length > 0 && (
            <div className="space-y-3">
              {configs.map(config => (
                <div key={config.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{config.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_BADGE_CLASS[config.provider]}`}>
                      {PROVIDER_LABELS[config.provider]}
                    </span>
                    <span className="text-sm text-muted-foreground">{config.model}</span>
                    {config.is_active && <Badge>Active</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Key: {config.masked_key}
                    {config.region && <span className="ml-3">Region: {config.region}</span>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {!config.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={activatingId !== null}
                        onClick={() => handleActivate(config)}
                      >
                        {activatingId === config.id ? <Spinner className="mr-1 size-3" /> : null}
                        Set active
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(config)}>Edit</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={deletingId === config.id}>
                          {deletingId === config.id ? <Spinner className="mr-1 size-3" /> : null}
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{config.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(config)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit configuration' : 'Add configuration'}</DialogTitle>
            <DialogDescription>
              {editingConfig ? 'Leave the API key blank to keep the existing key.' : 'Configure an AI provider for document processing.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
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
                  <Label htmlFor="config-session-token">Session Token <span className="text-muted-foreground text-xs">(optional)</span></Label>
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
                    onClick={handleFetchModels}
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

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.model || fetchingModels}>
                {saving ? <><Spinner className="mr-1 size-3" />Saving…</> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
