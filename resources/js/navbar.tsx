import { createRoot } from 'react-dom/client';

import Navbar from '@/components/navbar';

const mount = document.getElementById('navbar');
if (mount) {
  const authenticated = (mount.getAttribute('data-authenticated') || 'false') === 'true';
  const isAdmin = (mount.getAttribute('data-is-admin') || 'false') === 'true';
  
  let clientCompanies = [];
  try {
    const companiesData = mount.getAttribute('data-client-companies');
    if (companiesData) {
      clientCompanies = JSON.parse(companiesData);
    }
  } catch (e) {
    console.error('Failed to parse client companies', e);
  }

  createRoot(mount).render(<Navbar authenticated={authenticated} isAdmin={isAdmin} clientCompanies={clientCompanies} />);
}
