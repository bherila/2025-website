import { createRoot } from 'react-dom/client'
import FinanceStatementDetailPage from './components/finance/FinanceStatementDetailPage'

document.addEventListener('DOMContentLoaded', () => {
    const statementDetailDiv = document.getElementById('FinanceStatementDetailPage')
    if(statementDetailDiv) {
        const root = createRoot(statementDetailDiv)
        root.render(<FinanceStatementDetailPage snapshotId={parseInt(statementDetailDiv.dataset.snapshotId!)} />)
    }
})
