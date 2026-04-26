'use client'

import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { useState } from 'react'

import type { TaxTabId } from '@/components/finance/tax-tab-ids'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Semantics — must stay consistent across all form previews:
 * - `null` → structurally empty (no source data yet); the line should offer a
 *   path to fill it in (Go to source, or inline manual entry).
 * - `zero` → computed zero (source data exists but nets to zero); the line is
 *   already "resolved" and only needs an explanation tooltip.
 *
 * Non-zero numeric lines render via the existing `FormLine` component and
 * never appear in this disclosure.
 */
export interface EmptyLine {
  /** IRS line number, e.g. "2a", "4", "6". */
  lineNumber: string
  label: string
  state: 'null' | 'zero'
  /** Dock/tab id to navigate to when the user clicks "Go to source". */
  sourceTab?: TaxTabId
  /** Short human label for the source — e.g. "Capital Gains", "Schedule F". */
  sourceLabel?: string
  /** Inline manual-entry control (e.g. a currency input). Rendered when the line has no source form. */
  manualEntry?: React.ReactNode
  /** Tooltip shown on hover for zero-activity lines that just need an explanation. */
  tooltip?: string
}

export interface EmptyLinesDisclosureProps {
  lines: EmptyLine[]
  /** Optional section label rendered in the disclosure header (e.g. "Part I"). */
  sectionLabel?: string
  /** Callback to navigate to a source tab/form when a line's Go-to-source link is clicked. */
  onGoToSource?: (tab: TaxTabId) => void
}

/**
 * Collapsible "Show N empty lines" disclosure rendered at the bottom of a
 * form section. Hidden entirely when `lines` is empty.
 */
export function EmptyLinesDisclosure({
  lines,
  sectionLabel,
  onGoToSource,
}: EmptyLinesDisclosureProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)

  if (lines.length === 0) {
    return null
  }

  const prefix = sectionLabel ? `${sectionLabel} — ` : ''
  const headerLabel = expanded
    ? `${prefix}Hide empty lines`
    : `${prefix}Show ${lines.length} empty line${lines.length === 1 ? '' : 's'}`

  return (
    <div className="border-t border-dashed border-border/50 bg-muted/10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span className="font-mono tracking-wider uppercase">{headerLabel}</span>
      </button>
      {expanded && (
        <TooltipProvider>
          <div className="divide-y divide-dashed divide-border/50" role="list">
            {lines.map((line) => (
              <EmptyLineRow
                key={line.lineNumber}
                line={line}
                {...(onGoToSource ? { onGoToSource } : {})}
              />
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}

function EmptyLineRow({
  line,
  onGoToSource,
}: {
  line: EmptyLine
  onGoToSource?: (tab: TaxTabId) => void
}): React.ReactElement {
  const affordance = renderAffordance(line, onGoToSource)
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground"
      data-line={line.lineNumber}
      data-state={line.state}
      role="listitem"
    >
      <span className="font-mono text-[10px] w-14 shrink-0 select-none">{line.lineNumber}</span>
      <span className="flex-1">{line.label}</span>
      <span className="shrink-0">{affordance}</span>
    </div>
  )
}

function renderAffordance(
  line: EmptyLine,
  onGoToSource?: (tab: TaxTabId) => void,
): React.ReactNode {
  if (line.manualEntry) {
    return line.manualEntry
  }
  if (line.sourceTab && onGoToSource) {
    return (
      <button
        type="button"
        onClick={() => onGoToSource(line.sourceTab!)}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>Go to {line.sourceLabel ?? 'source'}</span>
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </button>
    )
  }
  if (line.state === 'zero' && line.tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-[11px] italic">no activity</span>
        </TooltipTrigger>
        <TooltipContent>{line.tooltip}</TooltipContent>
      </Tooltip>
    )
  }
  if (line.state === 'zero') {
    return <span className="text-[11px] italic">no activity</span>
  }
  return <span aria-hidden="true" className="text-[11px]">—</span>
}
