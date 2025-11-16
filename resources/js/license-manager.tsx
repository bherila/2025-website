import './bootstrap';
import { createRoot } from 'react-dom/client';
import LicenseManager from './components/license-manager/license-manager';

const el = document.getElementById('license-manager');
if (el) {
  createRoot(el).render(<LicenseManager />);
}