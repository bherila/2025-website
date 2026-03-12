import { fireEvent,render, screen } from '@testing-library/react'
import React from 'react'

import type { LotSale } from '@/lib/finance/washSaleEngine'

import { VariousTransactionsModal } from '../VariousTransactionsModal'

// Mock Radix Dialog components more accurately
jest.mock('@/components/ui/dialog', () => {
  const DialogContext = React.createContext({ isOpen: false, setIsOpen: (v: boolean) => {} });
  
  return {
    Dialog: ({ children }: any) => {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <DialogContext.Provider value={{ isOpen, setIsOpen }}>
          {children}
        </DialogContext.Provider>
      );
    },
    DialogTrigger: ({ children, asChild }: any) => {
      const { setIsOpen } = React.useContext(DialogContext);
      const child = React.Children.only(children);
      return React.cloneElement(child, {
        onClick: (e: any) => {
          if (child.props.onClick) child.props.onClick(e);
          setIsOpen(true);
        }
      });
    },
    DialogContent: ({ children }: any) => {
      const { isOpen } = React.useContext(DialogContext);
      return isOpen ? <div data-testid="dialog-content">{children}</div> : null;
    },
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
  };
});

// Mock Table components
jest.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
}))

describe('VariousTransactionsModal', () => {
  const baseLot: LotSale = {
    description: '100 sh. AAPL',
    symbol: 'AAPL',
    dateAcquired: null,
    dateSold: '2025-01-01',
    proceeds: 15000,
    costBasis: 10000,
    adjustmentCode: '',
    adjustmentAmount: 0,
    gainOrLoss: 5000,
    isShortTerm: true,
    quantity: 100,
    saleTransactionId: 1,
    washPurchaseTransactionId: undefined,
    isWashSale: false,
    originalLoss: 0,
    disallowedLoss: 0,
    isShortSale: false,
    acquiredTransactions: []
  }

  it('renders Unknown when no transactions are provided', () => {
    render(<VariousTransactionsModal lot={baseLot} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders the date when exactly one transaction is provided', () => {
    const lotWithOne = {
      ...baseLot,
      acquiredTransactions: [
        { id: 10, date: '2024-06-01', qty: 100, price: 100, description: 'Buy AAPL' }
      ]
    }
    render(<VariousTransactionsModal lot={lotWithOne} />)
    expect(screen.getByText('Jun 1, 2024')).toBeInTheDocument()
  })

  it('renders Various (N) when multiple transactions are provided', () => {
    const lotWithMultiple = {
      ...baseLot,
      acquiredTransactions: [
        { id: 10, date: '2024-06-01', qty: 50, price: 100, description: 'Buy AAPL' },
        { id: 11, date: '2024-06-02', qty: 50, price: 100, description: 'Buy AAPL' }
      ]
    }
    render(<VariousTransactionsModal lot={lotWithMultiple} />)
    expect(screen.getByText('Various (2)')).toBeInTheDocument()
  })

  it('opens modal and shows details when clicked', () => {
    const lotWithMultiple = {
      ...baseLot,
      acquiredTransactions: [
        { id: 10, date: '2024-06-01', qty: 50, price: 100, description: 'Buy AAPL' },
        { id: 11, date: '2024-06-02', qty: 50, price: 110, description: 'Buy AAPL' }
      ]
    }
    render(<VariousTransactionsModal lot={lotWithMultiple} />)
    
    const trigger = screen.getByText('Various (2)')
    fireEvent.click(trigger)
    
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
    expect(screen.getByText('Acquired Transactions Details')).toBeInTheDocument()
    expect(screen.getByText('Jun 1, 2024')).toBeInTheDocument()
    expect(screen.getByText('Jun 2, 2024')).toBeInTheDocument()
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
    expect(screen.getByText('$5,500.00')).toBeInTheDocument()
  })
})
