import { createRoot } from 'react-dom/client';

import BackToTop from '@/components/ui/back-to-top';
import { installNumberInputWheelGuard } from '@/lib/numberInputWheelGuard';

installNumberInputWheelGuard();

const mount = document.getElementById('back-to-top');
if (mount) {
  createRoot(mount).render(<BackToTop />);
}
