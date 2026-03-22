import { render, screen } from '@testing-library/react';
import React from 'react';

import { StatementDetailsModal } from '../StatementDetailsModal';

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({children}: any) => <div>{children}</div>,
  DialogContent: ({children}: any) => <div>{children}</div>,
  DialogDescription: ({children}: any) => <div>{children}</div>,
  DialogHeader: ({children}: any) => <div>{children}</div>,
  DialogTitle: ({children}: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/table', () => ({
  Table: ({children}: any) => <table>{children}</table>,
  TableBody: ({children}: any) => <tbody>{children}</tbody>,
  TableCell: ({children}: any) => <td>{children}</td>,
  TableHead: ({children}: any) => <th>{children}</th>,
  TableHeader: ({children}: any) => <thead>{children}</thead>,
  TableRow: ({children}: any) => <tr>{children}</tr>,
}));

describe('StatementDetailsModal', () => {
  it('renders dash for null numeric values', () => {
    const details = [
      { section: 'Test', line_item: 'Foo', statement_period_value: null as unknown as number, ytd_value: undefined as unknown as number, is_percentage: false },
    ];
    render(
      <StatementDetailsModal
        isOpen={true}
        onClose={() => {}}
        statementInfo={{ brokerName: 'X' }}
        statementDetails={details}
      />
    );

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });
});