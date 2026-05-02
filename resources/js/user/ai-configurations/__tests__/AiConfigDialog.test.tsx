import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';

import { AiConfigDialog } from '@/user/ai-configurations/AiConfigDialog';
import { type AiConfig, EMPTY_FORM, type FormState } from '@/user/ai-configurations/types';

interface DialogHarnessProps {
  editingConfig?: AiConfig | null;
  initialForm?: FormState;
  models?: string[];
  detailsVisible?: boolean;
  requiresKeySave?: boolean;
}

const editingGeminiConfig: AiConfig = {
  id: 1,
  name: 'Saved Gemini',
  provider: 'gemini',
  model: 'gemini-2.5-pro',
  masked_key: '••••1234',
  region: null,
  is_active: false,
  is_expired: false,
  expires_at: null,
  has_invalid_api_key: false,
  api_key_invalid_at: null,
  api_key_invalid_reason: null,
  created_at: null,
  usage: {
    this_month: { input_tokens: 0, output_tokens: 0 },
    total: { input_tokens: 0, output_tokens: 0 },
  },
};

function DialogHarness({
  editingConfig = null,
  initialForm = EMPTY_FORM,
  models = ['gemini-2.5-pro'],
  detailsVisible = editingConfig !== null,
  requiresKeySave = !detailsVisible,
}: DialogHarnessProps = {}): React.ReactElement {
  const [form, setForm] = useState<FormState>(initialForm);

  return (
    <AiConfigDialog
      open
      onOpenChange={jest.fn()}
      editingConfig={editingConfig}
      form={form}
      setForm={setForm}
      formError={null}
      saving={false}
      models={models}
      fetchingModels={false}
      modelsError={null}
      fetchModelsDisabled={false}
      detailsVisible={detailsVisible}
      requiresKeySave={requiresKeySave}
      onFetchModels={jest.fn()}
      onSave={(event) => event.preventDefault()}
    />
  );
}

describe('AiConfigDialog', () => {
  it('updates provider-specific fields from the provider dropdown', async () => {
    render(<DialogHarness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Provider' }));
    const bedrockOption = screen.getByRole('option', { name: 'Bedrock' });
    const dialogContent = screen.getByRole('dialog');
    const dialogPortal = document.querySelector('[data-slot="dialog-portal"]');

    expect(dialogContent).not.toContainElement(bedrockOption);
    expect(dialogPortal).toContainElement(bedrockOption);

    fireEvent.pointerEnter(bedrockOption, { pointerType: 'mouse' });
    fireEvent.mouseMove(bedrockOption);
    fireEvent.click(bedrockOption);

    expect(await screen.findByLabelText('Bedrock API Key (Bearer token)')).toBeInTheDocument();
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fetch models' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    expect(screen.getByRole('option', { name: 'US West (Oregon) (us-west-2)' })).toBeInTheDocument();
  });

  it('keeps model entry editable when no fetched models are available', () => {
    render(
      <DialogHarness
        editingConfig={editingGeminiConfig}
        initialForm={{
          ...EMPTY_FORM,
          name: editingGeminiConfig.name,
          provider: editingGeminiConfig.provider,
          model: editingGeminiConfig.model,
        }}
        models={[]}
      />,
    );

    const modelInput = screen.getByLabelText('Model');
    fireEvent.change(modelInput, { target: { value: 'custom.model-id' } });

    expect(modelInput).toHaveValue('custom.model-id');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('requires saving a new key before model options are shown', () => {
    render(<DialogHarness />);

    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'new-key' } });

    expect(screen.getByRole('button', { name: 'Save key' })).toBeEnabled();
  });

  it('hides model options again when a saved configuration key is changed', () => {
    render(
      <DialogHarness
        editingConfig={editingGeminiConfig}
        initialForm={{
          ...EMPTY_FORM,
          name: editingGeminiConfig.name,
          provider: editingGeminiConfig.provider,
          model: editingGeminiConfig.model,
        }}
        detailsVisible={false}
        requiresKeySave
      />,
    );

    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'replacement-key' } });

    expect(screen.getByRole('button', { name: 'Save key' })).toBeEnabled();
  });

  it('does not allow provider changes when editing an existing configuration', () => {
    render(
      <DialogHarness
        editingConfig={editingGeminiConfig}
        initialForm={{
          ...EMPTY_FORM,
          name: editingGeminiConfig.name,
          provider: editingGeminiConfig.provider,
          model: editingGeminiConfig.model,
        }}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeDisabled();
  });
});
