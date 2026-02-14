import { createRoot } from 'react-dom/client';

import Navbar from '@/components/navbar';

const mount = document.getElementById('navbar');
if (mount) {
  // Prefer the global head JSON (`#app-initial-data`) for Navbar bootstrap data.
  // This removes dependency on `data-*` props and centralizes app-level hydration.
  let authenticated = false
  let isAdmin = false
  let clientCompanies: any[] = []
  let currentUser: any = null

  try {
    const script = document.getElementById('app-initial-data') as HTMLScriptElement | null
    const serverData = script && script.textContent ? JSON.parse(script.textContent) : null
    if (serverData) {
      authenticated = !!serverData.authenticated
      isAdmin = !!serverData.isAdmin
      clientCompanies = serverData.clientCompanies ?? []
      currentUser = serverData.currentUser ?? null
    }
  } catch (e) {
    console.error('Failed to parse app initial data for Navbar', e)
  }

  createRoot(mount).render(<Navbar authenticated={authenticated} isAdmin={isAdmin} clientCompanies={clientCompanies} currentUser={currentUser} />);
}
