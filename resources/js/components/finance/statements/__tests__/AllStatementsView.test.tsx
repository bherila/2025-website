import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import AllStatementsView from '../AllStatementsView'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ComponentProps<'button'> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

jest.mock('@/components/ui/table', () => ({
  Table: ({ children, ...props }: React.ComponentProps<'table'>) => <table {...props}>{children}</table>,
  TableBody: ({ children, ...props }: React.ComponentProps<'tbody'>) => <tbody {...props}>{children}</tbody>,
  TableCell: ({ children, ...props }: React.ComponentProps<'td'>) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: React.ComponentProps<'th'>) => <th {...props}>{children}</th>,
  TableHeader: ({ children, ...props }: React.ComponentProps<'thead'>) => <thead {...props}>{children}</thead>,
  TableRow: ({ children, ...props }: React.ComponentProps<'tr'>) => <tr {...props}>{children}</tr>,
}))

const comparisonFixture = {
  dates: ['2025-01-31', '2025-02-28'],
  groupedData: {
    'Account, Summary': {
      'Cash "Settled"': {
        is_percentage: false,
        values: {
          '2025-01-31': 1234.5,
          '2025-02-28': 2345.67,
        },
        last_ytd_value: 3456.78,
      },
      'Return\nRate': {
        is_percentage: true,
        values: {
          '2025-01-31': 1.234,
        },
        last_ytd_value: 7.89,
      },
    },
  },
}

describe('AllStatementsView', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const getMock = fetchWrapper.get as jest.Mock
    getMock.mockResolvedValue(comparisonFixture)

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:statements-comparison'),
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
      writable: true,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders a CSV download button and downloads the loaded comparison grid', async () => {
    const clickedLink: { current: HTMLAnchorElement | null } = { current: null }
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement): void {
      clickedLink.current = this
    })

    render(<AllStatementsView isOpen onClose={jest.fn()} accountId={32} fullScreen />)

    await screen.findByText('Cash "Settled"')

    const downloadButton = screen.getByRole('button', { name: /download csv/i })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    fireEvent.click(downloadButton)

    const createObjectURL = URL.createObjectURL as jest.MockedFunction<typeof URL.createObjectURL>
    const exportedBlob = createObjectURL.mock.calls[0]?.[0]
    if (!(exportedBlob instanceof Blob)) {
      throw new Error('Expected CSV export to create a Blob')
    }

    await expect(readBlobText(exportedBlob)).resolves.toBe([
      'Section,Line Item,"Jan 31, 2025","Feb 28, 2025",Last YTD',
      '"Account, Summary","Cash ""Settled""","$1,234.50","$2,345.67","$3,456.78"',
      '"Account, Summary","Return\nRate",1.23%,-,7.89%',
    ].join('\r\n'))
    expect(clickedLink.current?.download).toMatch(/^statements-comparison-32-\d{8}\.csv$/)
    expect(clickedLink.current?.href).toBe('blob:statements-comparison')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:statements-comparison')
  })
})

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read Blob')))
    reader.readAsText(blob)
  })
}
