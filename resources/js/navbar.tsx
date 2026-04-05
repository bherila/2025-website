import { createRoot } from 'react-dom/client';

import Navbar from '@/components/navbar';
import type { NavItem } from '@/types/client-management/hydration-schemas';
import { AppInitialDataSchema } from '@/types/client-management/hydration-schemas';

const initNavbar = () => {
  const mount = document.getElementById('navbar');
  if (!mount) return;

  // Defaults
  let authenticated = false;
  let isAdmin = false;
  let currentUser: any = null;
  let navItems: NavItem[] = [];

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
      } else {
        console.error('Navbar: Invalid app initial data — falling back to raw payload', appParsed.error);
        // Fallback to raw data if parsing fails but object exists
        authenticated = !!appRaw.authenticated;
        isAdmin = !!appRaw.isAdmin;
        currentUser = appRaw.currentUser ?? null;
        navItems = appRaw.navItems ?? [];
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
    />
  );
};

// Use standard DOMContentLoaded to ensure the element is available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavbar);
} else {
  initNavbar();
}
