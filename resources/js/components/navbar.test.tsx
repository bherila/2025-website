import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from './navbar';

describe('Navbar', () => {
  const defaultProps = {
    authenticated: false,
    isAdmin: false,
    clientCompanies: [],
  };

  it('renders mobile menu button on mobile', () => {
    render(<Navbar {...defaultProps} />);
    const menuButton = screen.getByLabelText('Toggle menu');
    expect(menuButton).toBeInTheDocument();
  });

  it('toggles mobile menu when hamburger button is clicked', () => {
    render(<Navbar {...defaultProps} />);
    const menuButton = screen.getByLabelText('Toggle menu');
    
    // Menu should be closed initially (no mobile menu visible)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    
    // Click to open
    fireEvent.click(menuButton);
    
    // Menu should be visible
    expect(screen.getByRole('menu')).toBeInTheDocument();
    
    // Check that navigation items are present (getAllByText since they appear in both desktop and mobile)
    const recipesLinks = screen.getAllByText('Recipes');
    expect(recipesLinks.length).toBeGreaterThan(0);
    
    const projectsLinks = screen.getAllByText('Projects');
    expect(projectsLinks.length).toBeGreaterThan(0);
  });

  it('shows branding text', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('Ben Herila')).toBeInTheDocument();
  });

  it('shows sign in link when not authenticated', () => {
    render(<Navbar {...defaultProps} />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('shows my account link when authenticated', () => {
    render(<Navbar {...defaultProps} authenticated={true} />);
    expect(screen.getByText('My Account')).toBeInTheDocument();
  });

  it('shows admin options in mobile menu when user is admin', () => {
    render(<Navbar {...defaultProps} authenticated={true} isAdmin={true} />);
    const menuButton = screen.getByLabelText('Toggle menu');
    fireEvent.click(menuButton);
    
    // Find and expand Tools section first
    const toolsButtons = screen.getAllByText('Tools');
    const toolsButton = toolsButtons[1]; // Get the mobile one
    if (toolsButton) {
      fireEvent.click(toolsButton);
    }
    
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Client Management')).toBeInTheDocument();
  });

  it('shows client portal in mobile menu when client companies exist', () => {
    const clientCompanies = [
      { id: 1, company_name: 'Test Company', slug: 'test-company' },
    ];
    render(<Navbar {...defaultProps} authenticated={true} clientCompanies={clientCompanies} />);
    const menuButton = screen.getByLabelText('Toggle menu');
    fireEvent.click(menuButton);
    
    // Get all Client Portal buttons (one in desktop, one in mobile)
    const clientPortalButtons = screen.getAllByText('Client Portal');
    expect(clientPortalButtons.length).toBeGreaterThan(0);
    
    // Expand the mobile client portal section (last one)
    const mobileClientPortalButton = clientPortalButtons[clientPortalButtons.length - 1];
    if (mobileClientPortalButton) {
      fireEvent.click(mobileClientPortalButton);
    }
    expect(screen.getByText('Test Company')).toBeInTheDocument();
  });
});
