import { useEffect, useMemo, useRef, useState } from 'react'

import { saveMarkdownDocument, updateMarkdownDocument } from './markdownApi'
import { Preview } from './Preview'
import { createPreviewRenderRegistry } from './previewRenderRegistry'
import { prepareAndPrint } from './printExport'
import type { MarkdownDocumentDto, MarkdownInitialData } from './types'

interface MarkdownRendererPageProps {
  initialData: MarkdownInitialData
}

const PREVIEW_DEBOUNCE_MS = 150

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

export function MarkdownRendererPage({ initialData }: MarkdownRendererPageProps): React.JSX.Element {
  const [markdown, setMarkdown] = useState<string>(initialData.markdown)
  const [title, setTitle] = useState<string>(initialData.title ?? '')
  const [document, setDocument] = useState<MarkdownDocumentDto | null>(initialData.document)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [printPreparing, setPrintPreparing] = useState<boolean>(false)

  const registry = useMemo(() => createPreviewRenderRegistry(), [])
  const previewRef = useRef<HTMLDivElement | null>(null)
  const debouncedMarkdown = useDebouncedValue(markdown, PREVIEW_DEBOUNCE_MS)

  useEffect(() => {
    registry.resetForRevision(`rev-${Date.now()}`)
  }, [debouncedMarkdown, registry])

  const isOwner = initialData.canEdit
  const hasDocument = document !== null
  const canSave = initialData.authenticated && !hasDocument
  const canUpdate = initialData.authenticated && hasDocument && isOwner

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
        window.history.replaceState(null, '', `/tools/markdown/s/${response.shortCode}`)
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : 'Could not save document'
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
      await prepareAndPrint(registry, previewRef.current)
    } finally {
      setPrintPreparing(false)
    }
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
          className="flex-1 min-w-[12rem] rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <div className="markdown-actions flex flex-wrap items-center gap-2">
          {hasDocument && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              {copyState === 'copied' ? 'Copied!' : 'Copy link'}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            disabled={printPreparing}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
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
            <span className="text-sm text-neutral-500">
              <a href="/login" className="underline">Sign in</a> to share
            </span>
          )}
          {hasDocument && !canUpdate && initialData.authenticated && (
            <span className="text-sm text-neutral-500">Viewing shared document</span>
          )}
        </div>
      </header>

      {saveError !== null && (
        <div className="mb-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="markdown-editor-pane">
          <label className="mb-2 block text-sm font-medium text-neutral-700">Markdown</label>
          <textarea
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            spellCheck={false}
            placeholder="# Hello&#10;&#10;Paste Markdown here. Fenced code blocks get syntax highlighting; ```mermaid blocks render diagrams."
            className="h-[70vh] w-full resize-y rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm leading-relaxed"
          />
        </div>
        <div className="markdown-preview-pane">
          <label className="mb-2 block text-sm font-medium text-neutral-700">Preview</label>
          <Preview ref={previewRef} markdown={debouncedMarkdown} registry={registry} />
        </div>
      </div>
    </div>
  )
}
