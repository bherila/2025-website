import { createRoot } from 'react-dom/client';

import Navbar from '@/components/navbar';
import { AppInitialDataSchema } from '@/types/client-management/hydration-schemas';

const initNavbar = () => {
  const mount = document.getElementById('navbar');
  if (!mount) return;

  // Defaults
  let authenticated = false;
  let isAdmin = false;
  let clientCompanies: any[] = [];
  let currentUser: any = null;

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
        clientCompanies = data.clientCompanies ?? [];
        currentUser = data.currentUser ?? null;
      } else {
        console.error('Navbar: Invalid app initial data — falling back to raw payload', appParsed.error);
        // Fallback to raw data if parsing fails but object exists
        authenticated = !!appRaw.authenticated;
        isAdmin = !!appRaw.isAdmin;
        clientCompanies = appRaw.clientCompanies ?? [];
        currentUser = appRaw.currentUser ?? null;
      }
    }
  } catch (e) {
    console.error('Failed to parse app initial data for Navbar', e);
  }

  createRoot(mount).render(
    <Navbar 
      authenticated={authenticated} 
      isAdmin={isAdmin} 
      clientCompanies={clientCompanies} 
      currentUser={currentUser} 
    />
  );
};

// Use standard DOMContentLoaded to ensure the element is available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavbar);
} else {
  initNavbar();
}
