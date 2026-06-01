import ProposalBuilderPage from '@/client-management/components/ProposalBuilderPage'
import { mountElement, readRequiredDataset, readRequiredIntDataset } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('ProposalBuilderPage', (element) => (
    <ProposalBuilderPage
      proposalId={readRequiredIntDataset(element, 'proposalId')}
      companyId={readRequiredIntDataset(element, 'companyId')}
      companyName={readRequiredDataset(element, 'companyName')}
    />
  ))
})
