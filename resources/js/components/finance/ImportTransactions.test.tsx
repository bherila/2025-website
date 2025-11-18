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

describe('ImportTransactions', () => {
  it('parses CSV data and calls onImportClick with the correct data', () => {
    const onImportClickMock = jest.fn();
    const duplicates: AccountLineItem[] = [];

    render(<ImportTransactions onImportClick={onImportClickMock} duplicates={duplicates} />);

    const csvData = `date,time,description,amount,type
2025-01-01,10:00:00,DEPOSIT,1000.00,deposit
2025-01-02,14:30:00,GROCERY STORE,-75.50,withdrawal
2025-01-03,00:00:00,ONLINE PAYMENT,-25.00,withdrawal`;

    const textarea = screen.getByPlaceholderText(
      'date, [time], [settlement date|post date|as of[ date]], [description | desc], amount, [comment | memo, type, category]',
    );

    fireEvent.change(textarea, { target: { value: csvData } });

    const importButton = screen.getByText('Import 3');
    fireEvent.click(importButton);

    expect(onImportClickMock).toHaveBeenCalledWith([
      {
        t_date: '2025-01-01',
        t_date_posted: null,
        t_description: 'DEPOSIT',
        t_amt: '1000.00',
        t_comment: null,
        t_type: 'deposit',
        t_schc_category: null,
      },
      {
        t_date: '2025-01-02',
        t_date_posted: null,
        t_description: 'GROCERY STORE',
        t_amt: '-75.50',
        t_comment: null,
        t_type: 'withdrawal',
        t_schc_category: null,
      },
      {
        t_date: '2025-01-03',
        t_date_posted: null,
        t_description: 'ONLINE PAYMENT',
        t_amt: '-25.00',
        t_comment: null,
        t_type: 'withdrawal',
        t_schc_category: null,
      },
    ]);
  });
});
