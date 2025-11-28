import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportTransactions from '@/components/finance/ImportTransactions';
import React from 'react';
import type { AccountLineItem } from '@/data/finance/AccountLineItem';

// Mock the child component
jest.mock('@/components/TransactionsTable', () => () => <div data-testid="transactions-table" />);

jest.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/spinner', () => ({
    Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('@/data/finance/AccountLineItem', () => ({
    AccountLineItemSchema: {
        parse: (data: any) => data,
    },
}));

jest.mock('@/lib/DateHelper', () => ({
    parseDate: (dateString: string) => ({
        formatYMD: () => dateString,
    }),
}));

jest.mock('@/fetchWrapper', () => ({
    fetchWrapper: {
        post: jest.fn(),
        get: jest.fn(),
    }
}));

describe('ImportTransactions', () => {
  it('parses CSV data and displays the import button', () => {
    const onImportFinishedMock = jest.fn();

    render(<ImportTransactions accountId={1} onImportFinished={onImportFinishedMock} />);

    const csvData = `date,time,description,amount,type
2025-01-01,10:00:00,DEPOSIT,1000.00,deposit
2025-01-02,14:30:00,GROCERY STORE,-75.50,withdrawal
2025-01-03,00:00:00,ONLINE PAYMENT,-25.00,withdrawal`;

    const textarea = screen.getByPlaceholderText(
      'Paste CSV, QFX, or HAR data here, or drag and drop a file.',
    );

    fireEvent.change(textarea, { target: { value: csvData } });

    const importButton = screen.getByText('Import 3');
    expect(importButton).toBeInTheDocument();
  });
});
