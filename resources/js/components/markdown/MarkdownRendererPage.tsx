import { useEffect, useMemo, useRef, useState } from 'react'

import { CodeEditor } from '@/components/ui/code-editor'

import { saveMarkdownDocument, updateMarkdownDocument } from './markdownApi'
import { Preview } from './Preview'
import { createPreviewRenderRegistry } from './previewRenderRegistry'
import { prepareAndPrint } from './printExport'
import type { MarkdownDocumentDto, MarkdownInitialData } from './types'

interface MarkdownRendererPageProps {
  initialData: MarkdownInitialData
}

type MarkdownTab = 'markdown' | 'preview'

const PREVIEW_DEBOUNCE_MS = 150

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

function waitForNextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

export function MarkdownRendererPage({ initialData }: MarkdownRendererPageProps): React.JSX.Element {
  const [markdown, setMarkdown] = useState<string>(initialData.markdown)
  const [title, setTitle] = useState<string>(initialData.title ?? '')
  const [document, setDocument] = useState<MarkdownDocumentDto | null>(initialData.document)
  const [activeTab, setActiveTab] = useState<MarkdownTab>(initialData.document ? 'preview' : 'markdown')
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [printPreparing, setPrintPreparing] = useState<boolean>(false)
  const [ownsCurrentDocument, setOwnsCurrentDocument] = useState<boolean>(initialData.canEdit)

  const previewRef = useRef<HTMLDivElement | null>(null)
  const debouncedMarkdown = useDebouncedValue(markdown, PREVIEW_DEBOUNCE_MS)
  const registry = useMemo(() => createPreviewRenderRegistry(), [debouncedMarkdown])

  const hasDocument = document !== null
  const canSave = initialData.authenticated && !hasDocument
  const canUpdate = initialData.authenticated && hasDocument && ownsCurrentDocument

  const handleSave = async (): Promise<void> => {
    if (saving) {
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const trimmedTitle = title.trim() === '' ? null : title.trim()
      if (document) {
        const response = await updateMarkdownDocument(document.shortCode, trimmedTitle, markdown)
        setDocument({ ...document, title: response.title, shareUrl: response.shareUrl })
      } else {
        const response = await saveMarkdownDocument(trimmedTitle, markdown)
        setDocument({
          id: response.id,
          shortCode: response.shortCode,
          title: response.title,
          shareUrl: response.shareUrl,
          ownerUserId: null,
        })
        setOwnsCurrentDocument(true)
        window.history.replaceState(null, '', `/tools/markdown/s/${response.shortCode}`)
      }
    } catch (error) {
      let message = 'Could not save document'
      if (typeof error === 'string' && error.trim() !== '') {
        message = error
      } else if (error instanceof Error && error.message !== '') {
        message = error.message
      }
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyLink = async (): Promise<void> => {
    if (!document) {
      return
    }
    try {
      await navigator.clipboard.writeText(document.shareUrl)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('idle')
    }
  }

  const handlePrint = async (): Promise<void> => {
    if (printPreparing) {
      return
    }
    setPrintPreparing(true)
    try {
      if (activeTab !== 'preview') {
        setActiveTab('preview')
        await waitForNextFrame()
        await waitForNextFrame()
      }
      await prepareAndPrint(registry, previewRef.current)
    } finally {
      setPrintPreparing(false)
    }
  }

  const tabButtonClass = (tab: MarkdownTab): string => {
    const isActive = activeTab === tab
    return [
      'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    ].join(' ')
  }

  return (
    <div className="markdown-tool-shell mx-auto max-w-7xl px-4 py-6">
      <header className="markdown-toolbar mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Markdown Renderer</h1>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Document title (optional)"
          maxLength={120}
          className="flex-1 min-w-[12rem] rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        />
        <div className="markdown-actions flex flex-wrap items-center gap-2">
          {hasDocument && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              {copyState === 'copied' ? 'Copied!' : 'Copy link'}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={printPreparing}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            {printPreparing ? 'Preparing…' : 'Print / Save as PDF'}
          </button>
          {canSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Share'}
            </button>
          )}
          {canUpdate && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          )}
          {!initialData.authenticated && (
            <span className="text-sm text-muted-foreground">
              <a href="/login" className="underline">Sign in</a> to share
            </span>
          )}
          {hasDocument && !canUpdate && initialData.authenticated && (
            <span className="text-sm text-muted-foreground">Viewing shared document</span>
          )}
        </div>
      </header>

      <div className="no-print mb-4 flex w-fit gap-1 rounded-md border border-border bg-card p-1" role="tablist" aria-label="Markdown renderer views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'markdown'}
          aria-controls="markdown-tab-panel"
          id="markdown-tab"
          className={tabButtonClass('markdown')}
          onClick={() => setActiveTab('markdown')}
        >
          Markdown
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'preview'}
          aria-controls="preview-tab-panel"
          id="preview-tab"
          className={tabButtonClass('preview')}
          onClick={() => setActiveTab('preview')}
        >
          Preview
        </button>
      </div>

      {saveError !== null && (
        <div className="mb-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div>
        {activeTab === 'markdown' && (
          <div
            className="markdown-editor-pane"
            role="tabpanel"
            id="markdown-tab-panel"
            aria-labelledby="markdown-tab"
          >
            <label id="markdown-editor-label" className="mb-2 block text-sm font-medium text-foreground">Markdown</label>
            <CodeEditor
              value={markdown}
              onChange={setMarkdown}
              language="markdown"
              height="70vh"
              placeholder={'# Hello\n\nPaste Markdown here. Fenced code blocks get syntax highlighting; ```mermaid blocks render diagrams.'}
              className="w-full rounded-md border border-border overflow-hidden"
              ariaLabelledBy="markdown-editor-label"
            />
          </div>
        )}
        {activeTab === 'preview' && (
          <div
            className="markdown-preview-pane"
            role="tabpanel"
            id="preview-tab-panel"
            aria-labelledby="preview-tab"
          >
            <label className="mb-2 block text-sm font-medium text-foreground">Preview</label>
            <Preview ref={previewRef} markdown={debouncedMarkdown} registry={registry} />
          </div>
        )}
      </div>
    </div>
  )
}
