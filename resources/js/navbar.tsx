import { createRoot } from 'react-dom/client';

import type { AppInitialData, NavDropdownChild, NavItem } from '@/client-management/types/hydration-schemas';
import { AppInitialDataSchema } from '@/client-management/types/hydration-schemas';
import Navbar from '@/components/navbar';

const initNavbar = () => {
  const mount = document.getElementById('navbar');
  if (!mount) return;

  // Defaults
  let authenticated = false;
  let isAdmin = false;
  let currentUser: AppInitialData['currentUser'] = null;
  let navItems: NavItem[] = [];
  let accountMenuItems: NavDropdownChild[] = [];

  try {
    const script = document.getElementById('app-initial-data') as HTMLScriptElement | null;
    const textContent = script?.textContent?.trim();
    
    if (textContent) {
      const appRaw = JSON.parse(textContent);
      const appParsed = AppInitialDataSchema.safeParse(appRaw);
      
      if (appParsed.success) {
        const data = appParsed.data;
        authenticated = !!data.authenticated;
        isAdmin = !!data.isAdmin;
        currentUser = data.currentUser ?? null;
        navItems = data.navItems ?? [];
        accountMenuItems = data.accountMenuItems ?? [];
      } else {
        console.error('Navbar: Invalid app initial data — falling back to raw payload', appParsed.error);
        // Fallback to raw data if parsing fails but object exists
        authenticated = !!appRaw.authenticated;
        isAdmin = !!appRaw.isAdmin;
        currentUser = appRaw.currentUser ?? null;
        navItems = appRaw.navItems ?? [];
        accountMenuItems = appRaw.accountMenuItems ?? [];
      }
    }
  } catch (e) {
    console.error('Failed to parse app initial data for Navbar', e);
  }

  createRoot(mount).render(
    <Navbar 
      authenticated={authenticated} 
      isAdmin={isAdmin} 
      currentUser={currentUser}
      navItems={navItems}
      accountMenuItems={accountMenuItems}
    />
  );
};

// Use standard DOMContentLoaded to ensure the element is available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavbar);
} else {
  initNavbar();
}
