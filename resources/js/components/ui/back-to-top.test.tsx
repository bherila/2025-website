import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackToTop from './back-to-top';

describe('BackToTop', () => {
  beforeEach(() => {
    // Reset scrollTo mock before each test
    (window.scrollTo as jest.Mock).mockClear();
    // Reset scrollY
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  });

  it('does not render when scrollY is less than 300px', () => {
    Object.defineProperty(window, 'scrollY', { value: 100, writable: true });
    render(<BackToTop />);
    
    // Trigger scroll event
    fireEvent.scroll(window);
    
    // Button should not be visible
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders when scrollY is greater than 300px', async () => {
    render(<BackToTop />);
    
    // Simulate scrolling down
    Object.defineProperty(window, 'scrollY', { value: 400, writable: true });
    fireEvent.scroll(window);
    
    // Wait for button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
    });
  });

  it('calls scrollTo with correct parameters when clicked', async () => {
    render(<BackToTop />);
    
    // Simulate scrolling to make button visible
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true });
    fireEvent.scroll(window);
    
    // Wait for button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
    });
    
    const button = screen.getByRole('button', { name: 'Back to top' });
    fireEvent.click(button);
    
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });

  it('has correct aria-label and title attributes', async () => {
    render(<BackToTop />);
    
    // Simulate scrolling to make button visible
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true });
    fireEvent.scroll(window);
    
    // Wait for button to appear
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Back to top' });
      expect(button).toHaveAttribute('title', 'Back to top');
      expect(button).toHaveAttribute('aria-label', 'Back to top');
    });
  });
});
