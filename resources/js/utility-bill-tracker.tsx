import { createRoot } from 'react-dom/client';

import { UtilityAccountListPage } from '@/components/utility-bill-tracker/UtilityAccountListPage';
import { UtilityBillListPage } from '@/components/utility-bill-tracker/UtilityBillListPage';

document.addEventListener('DOMContentLoaded', () => {
  const accountListDiv = document.getElementById('UtilityAccountListPage');
  if (accountListDiv) {
    const root = createRoot(accountListDiv);
    root.render(<UtilityAccountListPage />);
  }

  const billListDiv = document.getElementById('UtilityBillListPage');
  if (billListDiv) {
    const root = createRoot(billListDiv);
    root.render(
      <UtilityBillListPage 
        accountId={parseInt(billListDiv.dataset.accountId!)}
        accountName={billListDiv.dataset.accountName!}
        accountType={billListDiv.dataset.accountType as 'Electricity' | 'General'}
      />
    );
  }
});
