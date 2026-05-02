import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';

import { AiConfigDialog } from '@/user/ai-configurations/AiConfigDialog';
import { EMPTY_FORM, type FormState } from '@/user/ai-configurations/types';

function DialogHarness(): React.ReactElement {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  return (
    <AiConfigDialog
      open
      onOpenChange={jest.fn()}
      editingConfig={null}
      form={form}
      setForm={setForm}
      formError={null}
      saving={false}
      models={['gemini-2.5-pro']}
      fetchingModels={false}
      modelsError={null}
      fetchModelsDisabled={false}
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
    expect(screen.getByLabelText('Model')).toHaveAttribute(
      'placeholder',
      'e.g. anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });
});
