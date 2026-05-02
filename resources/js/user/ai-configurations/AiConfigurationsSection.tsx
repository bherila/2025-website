import React, { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchWrapper } from '@/fetchWrapper';

import { AiConfigCard } from './AiConfigCard';
import { AiConfigDialog } from './AiConfigDialog';
import type { AiConfig, FormState } from './types';
import { EMPTY_FORM } from './types';

interface AiConfigSaveResponse extends AiConfig {
  available_models?: string[] | null;
}

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
      expires_at: config.expires_at ? config.expires_at.slice(0, 10) : '',
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
      const payload: Record<string, string | number> = { provider: form.provider };
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to fetch models';
      setModelsError(msg);
      setModels([]);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedApiKey = form.api_key.trim();
    const requiresKeySave = editingConfig === null || trimmedApiKey !== '';
    const detailsVisible = editingConfig !== null && !requiresKeySave;

    if (detailsVisible && !form.model) {
      setFormError('Please select a model.');
      return;
    }
    if (requiresKeySave && !trimmedApiKey) {
      setFormError('API key is required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: Record<string, string> = {
        name: form.name,
        provider: form.provider,
      };
      if (form.model) payload.model = form.model;
      if (trimmedApiKey) payload.api_key = trimmedApiKey;
      if (form.provider === 'bedrock') {
        payload.region = form.region;
        if (form.session_token) payload.session_token = form.session_token;
      }
      if (form.expires_at) payload.expires_at = form.expires_at;

      if (editingConfig) {
        const savedConfig = (await fetchWrapper.put(`/api/user/ai-prefs/${editingConfig.id}`, payload)) as AiConfigSaveResponse;
        if (requiresKeySave) {
          setEditingConfig(savedConfig);
          setForm({
            name: savedConfig.name,
            provider: savedConfig.provider,
            api_key: '',
            region: savedConfig.region ?? 'us-east-1',
            session_token: '',
            model: savedConfig.model,
            expires_at: savedConfig.expires_at ? savedConfig.expires_at.slice(0, 10) : '',
          });
          setModels(savedConfig.available_models ?? [savedConfig.model]);
          setModelsError(null);
          onSuccess('API key saved.');
          await loadConfigs();
          return;
        }
        onSuccess('Configuration updated.');
      } else {
        payload.api_key = trimmedApiKey;
        const savedConfig = (await fetchWrapper.post('/api/user/ai-prefs', payload)) as AiConfigSaveResponse;
        setEditingConfig(savedConfig);
        setForm({
          name: savedConfig.name,
          provider: savedConfig.provider,
          api_key: '',
          region: savedConfig.region ?? 'us-east-1',
          session_token: '',
          model: savedConfig.model,
          expires_at: savedConfig.expires_at ? savedConfig.expires_at.slice(0, 10) : '',
        });
        setModels(savedConfig.available_models ?? [savedConfig.model]);
        setModelsError(null);
        onSuccess('API key saved.');
        await loadConfigs();
        return;
      }
      setDialogOpen(false);
      await loadConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to save configuration';
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
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to activate configuration';
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
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to delete configuration';
      onError('aiConfig', msg);
    } finally {
      setDeletingId(null);
    }
  };

  const requiresKeySave = editingConfig === null || form.api_key.trim() !== '';
  const detailsVisible = editingConfig !== null && !requiresKeySave;
  const fetchModelsDisabled = fetchingModels || !detailsVisible;

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
                <AiConfigCard
                  key={config.id}
                  config={config}
                  activatingId={activatingId}
                  deletingId={deletingId}
                  onActivate={handleActivate}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AiConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingConfig={editingConfig}
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        models={models}
        fetchingModels={fetchingModels}
        modelsError={modelsError}
        fetchModelsDisabled={fetchModelsDisabled}
        detailsVisible={detailsVisible}
        requiresKeySave={requiresKeySave}
        onFetchModels={handleFetchModels}
        onSave={handleSave}
      />
    </>
  );
};
