import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ProposalMarkdownProps {
  children: string
  className?: string
}

/**
 * Lightweight markdown renderer for proposal narratives. Deliberately avoids
 * the heavier `components/markdown/Preview` (Shiki/Mermaid) — proposals only
 * need GitHub-flavoured prose.
 */
export default function ProposalMarkdown({ children, className }: ProposalMarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
