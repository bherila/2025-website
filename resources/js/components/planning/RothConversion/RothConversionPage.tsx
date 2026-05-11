import { Copy, GitFork, Save } from 'lucide-react'
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from './defaults'
import { computeRothConversion, saveRothConversionScenario, updateRothConversionScenario } from './rothConversionApi'
import RothConversionForm from './RothConversionForm'
import RothConversionResults from './RothConversionResults'
import { parseRothConversionUrlState, serializeRothConversionUrlState } from './rothConversionUrlState'
import type { RothConversionInitialData, RothConversionInputs, RothConversionProjection, RothConversionScenarioMeta } from './types'

interface RothConversionPageProps {
  initialData: RothConversionInitialData
}

function currentQueryString(): string {
  return window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search
}

function initialInputs(initialData: RothConversionInitialData): RothConversionInputs {
  const base = initialData.inputs ?? DEFAULT_ROTH_CONVERSION_INPUTS

  return window.location.search
    ? parseRothConversionUrlState(window.location.search, base)
    : base
}

export default function RothConversionPage({ initialData }: RothConversionPageProps): ReactElement {
  const [inputs, setInputs] = useState<RothConversionInputs>(() => initialInputs(initialData))
  const [projection, setProjection] = useState<RothConversionProjection | null>(initialData.projection)
  const [savedScenario, setSavedScenario] = useState<RothConversionScenarioMeta | null>(initialData.scenario)
  const [title, setTitle] = useState(initialData.scenario?.title ?? 'Roth conversion plan')
  const [canEdit, setCanEdit] = useState(initialData.canEdit)
  const [loading, setLoading] = useState(initialData.projection === null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const shareUrl = savedScenario?.shareUrl ?? window.location.href
  const isSharedView = savedScenario !== null
  const saveLabel = useMemo(() => {
    if (savedScenario && canEdit) {
      return 'Update'
    }

    if (savedScenario && !canEdit) {
      return 'Fork'
    }

    return 'Save'
  }, [canEdit, savedScenario])

  useEffect(() => {
    const queryString = serializeRothConversionUrlState(inputs)

    if (!isSharedView || !canEdit) {
      const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`
      if (currentQueryString() !== queryString) {
        window.history.replaceState(null, '', nextUrl)
      }
    }
  }, [canEdit, inputs, isSharedView])

  useEffect(() => {
    let active = true
    setLoading(true)
    const timeout = window.setTimeout(() => {
      computeRothConversion(inputs)
        .then((nextProjection) => {
          if (active) {
            setProjection(nextProjection)
            setStatus(null)
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setStatus(error instanceof Error ? error.message : String(error))
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false)
          }
        })
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [inputs])

  async function handleSave(): Promise<void> {
    if (!initialData.authenticated) {
      setStatus('Log in to save a short-code link.')
      return
    }

    setSaving(true)
    setStatus(null)

    try {
      const response = savedScenario && canEdit
        ? await updateRothConversionScenario(savedScenario.shortCode, title, inputs)
        : await saveRothConversionScenario(title, inputs)
      const nextScenario: RothConversionScenarioMeta = {
        id: response.id,
        shortCode: response.shortCode,
        title,
        shareUrl: response.shareUrl,
        ownerUserId: null,
      }
      setSavedScenario(nextScenario)
      setCanEdit(true)
      setProjection(response.projection)
      window.history.replaceState(null, '', response.shareUrl)
      setStatus(savedScenario && canEdit ? 'Updated.' : 'Saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function copyShareUrl(): Promise<void> {
    await navigator.clipboard.writeText(shareUrl)
    setStatus('Share link copied.')
  }

  return (
    <Container className="grid gap-6 py-8 md:py-10">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-end">
        <div className="grid gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Financial planning</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Roth Conversion Planner</h1>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4">
            <div className="grid gap-2">
              <Label htmlFor="scenario-title">Scenario title</Label>
              <Input id="scenario-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={saving}>
                {savedScenario && !canEdit ? <GitFork className="size-4" /> : <Save className="size-4" />}
                {saving ? 'Saving...' : saveLabel}
              </Button>
              <Button type="button" variant="secondary" onClick={copyShareUrl}>
                <Copy className="size-4" />
                Copy link
              </Button>
            </div>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="xl:max-h-[calc(100vh-7rem)] xl:overflow-auto xl:pr-1">
          <RothConversionForm inputs={inputs} onChange={setInputs} />
        </aside>
        <main className="min-w-0">
          <RothConversionResults projection={projection} loading={loading} />
        </main>
      </div>
    </Container>
  )
}
