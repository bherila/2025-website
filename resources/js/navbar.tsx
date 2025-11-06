import { createRoot, hydrateRoot } from 'react-dom/client';
import Navbar from '@/components/navbar';

const mount = document.getElementById('navbar');
if (mount) {
  const authenticated = (mount.getAttribute('data-authenticated') || 'false') === 'true';
  if (mount.hasChildNodes()) {
    hydrateRoot(mount, <Navbar authenticated={authenticated} />);
  } else {
    createRoot(mount).render(<Navbar authenticated={authenticated} />);
  }
}
