import React from 'react';
import { createRoot } from 'react-dom/client';

import { PasskeyLoginButton } from './passkey-login-button';

const mount = document.getElementById('passkey-login-mount');
if (mount) {
  createRoot(mount).render(<PasskeyLoginButton />);
}
