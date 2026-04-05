import { fireEvent,render, screen } from '@testing-library/react';

import Navbar from './navbar';

const baseNavItems = [
  { type: 'link' as const, label: 'Recipes', href: '/recipes' },
  { type: 'link' as const, label: 'Projects', href: '/projects' },
];

const toolsDropdown = {
  type: 'dropdown' as const,
  label: 'Tools',
  items: [
    { type: 'group' as const, label: 'Utilities' },
    { type: 'link' as const, label: 'License Manager', href: '/tools/license-manager' },
  ],
};

const toolsDropdownWithAdmin = {
  type: 'dropdown' as const,
  label: 'Tools',
  items: [
    { type: 'group' as const, label: 'Utilities' },
    { type: 'link' as const, label: 'License Manager', href: '/tools/license-manager' },
    { type: 'group' as const, label: 'Admin' },
    { type: 'link' as const, label: 'User Management', href: '/admin/users' },
    { type: 'link' as const, label: 'Client Management', href: '/client/mgmt' },
  ],
};

describe('Navbar', () => {
  const defaultProps = {
    authenticated: false,
    isAdmin: false,
    navItems: [...baseNavItems, toolsDropdown],
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

  it('shows admin options in mobile menu when navItems includes them', () => {
    render(<Navbar {...defaultProps} authenticated={true} isAdmin={true} navItems={[...baseNavItems, toolsDropdownWithAdmin]} />);
    const menuButton = screen.getByLabelText('Toggle menu');
    fireEvent.click(menuButton);
    
    // Find and expand Tools section first
    const toolsButtons = screen.getAllByText('Tools');
    const toolsButton = toolsButtons[toolsButtons.length - 1]; // Get the mobile one
    if (toolsButton) {
      fireEvent.click(toolsButton);
    }
    
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Client Management')).toBeInTheDocument();
  });

  it('shows client portal in mobile menu when navItems includes it', () => {
    const navItemsWithClientPortal = [
      ...baseNavItems,
      toolsDropdown,
      {
        type: 'dropdown' as const,
        label: 'Client Portal',
        items: [
          { type: 'link' as const, label: 'Test Company', href: '/client/portal/test-company' },
        ],
      },
    ];
    render(<Navbar {...defaultProps} authenticated={true} navItems={navItemsWithClientPortal} />);
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

  it('accepts a hydrated currentUser prop and shows the user name', () => {
    render(<Navbar {...defaultProps} authenticated={true} currentUser={{ id: 5, name: 'Joe', email: 'joe@example.com' }} />)
    expect(screen.getByText('Joe')).toBeInTheDocument()
  })
});
