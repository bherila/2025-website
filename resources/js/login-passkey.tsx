import { PasskeyLoginButton } from 'bwh-auth';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { getCsrfToken } from './auth/shared-components';
import { Button } from './components/ui/button';

const mount = document.getElementById('passkey-login-mount');
if (mount) {
  createRoot(mount).render(
    <PasskeyLoginButton components={{ Button }} endpoints={{ csrfToken: getCsrfToken() }} />,
  );
}
