import { useEffect, useState } from 'react'

import type { ConvertResult } from '@/lib/toon/toonJsonConvert'
import { jsonToToon, toonToJson } from '@/lib/toon/toonJsonConvert'

import { saveToonDocument, updateToonDocument } from './toonApi'
import type { SaveToonResponse, ToonDocumentDto, ToonInitialData } from './types'

interface ToonJsonConverterPageProps {
  initialData: ToonInitialData
}

const DEBOUNCE_MS = 200
const MAX_BYTES = 5_000_000

function byteLength(value: string): number {
  let bytes = 0
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) {
      bytes += 1
    } else if (codePoint <= 0x7ff) {
      bytes += 2
    } else if (codePoint <= 0xffff) {
      bytes += 3
    } else {
      bytes += 4
    }
  }
  return bytes
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

function ErrorBlock({ result }: { result: ConvertResult | null }): React.JSX.Element | null {
  if (!result || result.ok || !result.error) {
    return null
  }
  const pos = [result.line !== undefined ? `line ${result.line}` : null, result.column !== undefined ? `col ${result.column}` : null]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="mt-1 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {result.error}
      {pos && <span className="ml-2 opacity-75">({pos})</span>}
    </div>
  )
}

export function ToonJsonConverterPage({ initialData }: ToonJsonConverterPageProps): React.JSX.Element {
  const initialJson = initialData.toon ? (toonToJson(initialData.toon).output ?? '') : ''

  const [toon, setToon] = useState<string>(initialData.toon)
  const [json, setJson] = useState<string>(initialJson)
  const [toonError, setToonError] = useState<ConvertResult | null>(null)
  const [jsonError, setJsonError] = useState<ConvertResult | null>(null)
  const [lastEdited, setLastEdited] = useState<'toon' | 'json' | null>(null)
  const [title, setTitle] = useState<string>(initialData.title ?? '')
  const [document, setDocument] = useState<ToonDocumentDto | null>(initialData.document)
  const [ownsCurrentDocument, setOwnsCurrentDocument] = useState<boolean>(initialData.canEdit)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const debouncedToon = useDebouncedValue(toon, DEBOUNCE_MS)
  const debouncedJson = useDebouncedValue(json, DEBOUNCE_MS)

  useEffect(() => {
    if (lastEdited !== 'toon') {
      return
    }
    const r = toonToJson(debouncedToon)
    if (r.ok) {
      setToonError(null)
      setJsonError(null)
      setJson(r.output ?? '')
    } else {
      setToonError(r)
    }
  }, [debouncedToon, lastEdited])

  useEffect(() => {
    if (lastEdited !== 'json') {
      return
    }
    const r = jsonToToon(debouncedJson)
    if (r.ok) {
      setJsonError(null)
      setToonError(null)
      setToon(r.output ?? '')
    } else {
      setJsonError(r)
    }
  }, [debouncedJson, lastEdited])

  const hasDocument = document !== null
  const activeInput = lastEdited === 'json' ? json : toon
  const isValid = !toonError && !jsonError && activeInput.trim() !== '' && (lastEdited === 'json' || byteLength(toon) <= MAX_BYTES)
  const canSave = initialData.authenticated && !hasDocument
  const canUpdate = initialData.authenticated && hasDocument && ownsCurrentDocument

  const getSaveableToon = (): string | null => {
    if (lastEdited === 'json') {
      const r = jsonToToon(json)
      if (!r.ok) {
        setJsonError(r)
        return null
      }

      const nextToon = r.output ?? ''
      setJsonError(null)
      setToonError(null)
      setToon(nextToon)
      return nextToon
    }

    const r = toonToJson(toon)
    if (!r.ok) {
      setToonError(r)
      return null
    }

    setToonError(null)
    setJsonError(null)
    setJson(r.output ?? '')
    return toon
  }

  const handleSave = async (): Promise<void> => {
    if (saving) {
      return
    }
    setSaveError(null)
    const toonToSave = getSaveableToon()
    if (toonToSave === null) {
      return
    }
    if (toonToSave.trim() === '') {
      setSaveError('TOON content is required.')
      return
    }
    if (byteLength(toonToSave) > MAX_BYTES) {
      setSaveError('TOON content must not exceed 5,000,000 bytes.')
      return
    }

    setSaving(true)
    try {
      const trimmedTitle = title.trim() === '' ? null : title.trim()
      let response: SaveToonResponse
      if (document) {
        response = await updateToonDocument(document.shortCode, trimmedTitle, toonToSave)
        setDocument({ ...document, title: response.title, shareUrl: response.shareUrl })
      } else {
        response = await saveToonDocument(trimmedTitle, toonToSave)
        setDocument({
          id: response.id,
          shortCode: response.shortCode,
          title: response.title,
          shareUrl: response.shareUrl,
          ownerUserId: null,
        })
        setOwnsCurrentDocument(true)
        window.history.replaceState(null, '', `/tools/toon-json/s/${response.shortCode}`)
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">TOON ↔ JSON Converter</h1>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Document title (optional)"
          maxLength={120}
          className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        />
        <div className="flex flex-wrap items-center gap-2">
          {hasDocument && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              {copyState === 'copied' ? 'Copied!' : 'Copy link'}
            </button>
          )}
          {canSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isValid}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Share'}
            </button>
          )}
          {canUpdate && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isValid}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          )}
        </div>
      </header>

      {saveError !== null && (
        <div className="mb-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">TOON</label>
          <textarea
            aria-label="TOON"
            value={toon}
            onChange={(event) => {
              setToon(event.target.value)
              setLastEdited('toon')
            }}
            spellCheck={false}
            placeholder="key: value&#10;nested:&#10;  inner: 42"
            className="h-[70vh] w-full resize-none rounded-md border border-border bg-card p-3 font-mono text-sm leading-relaxed text-foreground"
          />
          <ErrorBlock result={toonError} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">JSON</label>
          <textarea
            aria-label="JSON"
            value={json}
            onChange={(event) => {
              setJson(event.target.value)
              setLastEdited('json')
            }}
            spellCheck={false}
            placeholder='{"key": "value"}'
            className="h-[70vh] w-full resize-none rounded-md border border-border bg-card p-3 font-mono text-sm leading-relaxed text-foreground"
          />
          <ErrorBlock result={jsonError} />
        </div>
      </div>
    </div>
  )
}
