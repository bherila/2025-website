import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { fetchWrapper } from '@/fetchWrapper';

// --- Mocks ----------------------------------------------------------------

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Lightweight stubs for UI primitives — keeps tests fast & focused on logic.
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('@/components/ui/table', () => ({
  Table: ({ children, ...p }: React.ComponentProps<'table'>) => <table {...p}>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({ children, ...p }: React.ComponentProps<'tr'>) => <tr {...p}>{children}</tr>,
  TableCell: ({ children, ...p }: React.ComponentProps<'td'>) => <td {...p}>{children}</td>,
}));

jest.mock('@/components/ui/tooltip', () => {
  const TooltipTrigger = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'> & { asChild?: boolean }>(
    ({ children, asChild: _asChild, ...p }, ref) => <span ref={ref} {...p}>{children}</span>
  );
  TooltipTrigger.displayName = 'TooltipTrigger';
  return {
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger,
  };
});

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/shared/FileManager', () => ({
  DeleteFileModal: () => null,
  FileList: () => <div data-testid="file-list" />,
  FileUploadButton: ({ onUpload, label = 'Upload File' }: MockFileUploadButtonProps) => (
    <button
      aria-label={label}
      onClick={() => {
        void onUpload(new File(['statement'], 'statement.pdf', { type: 'application/pdf' }));
      }}
    >
      {label}
    </button>
  ),
  useFileManagement: () => ({
    files: [],
    loading: false,
    error: null,
    fetchFiles: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: null,
    deleteModalOpen: false,
    isDeleting: false,
    handleDeleteRequest: jest.fn(),
    handleDeleteConfirm: jest.fn(),
    closeDeleteModal: jest.fn(),
  }),
}));

interface MockFileUploadButtonProps {
  onUpload: (file: File) => Promise<unknown>
  label?: string
}

jest.mock('../../StatementDetailsModal', () => ({
  StatementDetailsModal: () => <div data-testid="statement-details-modal" />,
}));

jest.mock('../AccountStatementsChart', () => {
  const Chart = () => <div data-testid="chart" />;
  Chart.displayName = 'AccountStatementsChart';
  return { __esModule: true, default: Chart };
});

jest.mock('../AllStatementsView', () => {
  const Modal = () => <div data-testid="all-statements-modal" />;
  Modal.displayName = 'AllStatementsView';
  return { __esModule: true, default: Modal };
});

jest.mock('../PdfViewer', () => {
  const PdfViewer = () => <div data-testid="pdf-viewer" />;
  PdfViewer.displayName = 'PdfViewer';
  return { __esModule: true, default: PdfViewer };
});

// --- Helpers ---------------------------------------------------------------

const SAMPLE_STATEMENTS = [
  { statement_id: 1, statement_opening_date: null, statement_closing_date: '2025-01-31', balance: '100000.00', cost_basis: 90000, is_cost_basis_override: false, lineItemCount: 0 },
  { statement_id: 2, statement_opening_date: null, statement_closing_date: '2025-02-28', balance: '110000.00', cost_basis: 95000, is_cost_basis_override: false, lineItemCount: 3 },
  // entry with missing closing date - should display '-' instead of date
  { statement_id: 3, statement_opening_date: null, statement_closing_date: null, balance: '120000.00', cost_basis: 100000, is_cost_basis_override: true, lineItemCount: 1 },
];

// --- Tests -----------------------------------------------------------------

// Lazy import so mocks are in place before the module loads.
let FinanceAccountStatementsPage: React.ComponentType<{ id: number }>;

beforeAll(async () => {
  const mod = await import('../FinanceAccountStatementsPage');
  FinanceAccountStatementsPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FinanceAccountStatementsPage', () => {
  it('renders statements table after loading', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(SAMPLE_STATEMENTS);

    render(<FinanceAccountStatementsPage id={32} />);

    // Initially shows spinner
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    // After data loads, the table should appear with balance values
    // (dates may shift ±1 day depending on timezone, so match on balances instead)
    await waitFor(() => {
      // 100000.00 appears as both balance and change for the first row
      expect(screen.getAllByText('100000.00').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('110000.00')).toBeInTheDocument();
    // the null-date row should render a hyphen or empty placeholder in the date column
    const row = screen.getByText('120000.00').closest('tr');
    expect(row).toBeTruthy();
    if (row) {
      expect(row.textContent).toMatch(/-/);
    }
  });

  it('shows empty state when no statements', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce([]);

    render(<FinanceAccountStatementsPage id={32} />);

    await waitFor(() => {
      expect(screen.getByText('No Statements Found')).toBeInTheDocument();
    });
  });

  it('does NOT cause an infinite fetch loop', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValue(SAMPLE_STATEMENTS);

    render(<FinanceAccountStatementsPage id={32} />);

    // Wait for initial render to stabilize
    await waitFor(() => {
      expect(screen.getAllByText('100000.00').length).toBeGreaterThanOrEqual(1);
    });

    // Wait a tick to catch any re-fetches
    await new Promise((r) => setTimeout(r, 100));

    // balance-timeseries should be called exactly ONCE (initial mount)
    const balanceCalls = (fetchWrapper.get as jest.Mock).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('balance-timeseries')
    );
    expect(balanceCalls).toHaveLength(1);
  });

  it('renders toolbar buttons and per-row attach buttons, chart hidden by default', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(SAMPLE_STATEMENTS);

    render(<FinanceAccountStatementsPage id={32} />);

    await waitFor(() => {
      expect(screen.getByText('View All Statements')).toBeInTheDocument();
    });

    // Chart is hidden by default
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();

    // Show Chart toggle is present
    expect(screen.getByText('Show Chart')).toBeInTheDocument();

    expect(screen.getByText('Download CSV')).toBeInTheDocument();
    expect(screen.queryByTestId('file-list')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Attach PDF' })).toHaveLength(SAMPLE_STATEMENTS.length);
  });

  it('uploads statement files with the row statement_id', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValue(SAMPLE_STATEMENTS);
    (fetchWrapper.post as jest.Mock).mockResolvedValue({});

    render(<FinanceAccountStatementsPage id={32} />);

    const attachButtons = await screen.findAllByRole('button', { name: 'Attach PDF' });
    fireEvent.click(attachButtons[1]);

    await waitFor(() => {
      expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/32/files', expect.any(FormData));
    });

    const formData = (fetchWrapper.post as jest.Mock).mock.calls[0][1] as FormData;
    expect(formData.get('statement_id')).toBe('2');
    expect(formData.get('file')).toBeInstanceOf(File);
  });

  it('shows chart when Show Chart toggle is enabled', async () => {
    (fetchWrapper.get as jest.Mock).mockResolvedValueOnce(SAMPLE_STATEMENTS);

    render(<FinanceAccountStatementsPage id={32} />);

    await waitFor(() => {
      expect(screen.getByText('Show Chart')).toBeInTheDocument();
    });

    // Click the switch to show chart
    fireEvent.click(screen.getByRole('switch', { name: /show chart/i }));

    await waitFor(() => {
      expect(screen.getByTestId('chart')).toBeInTheDocument();
    });
  });
});
