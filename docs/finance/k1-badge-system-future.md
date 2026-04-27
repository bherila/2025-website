# K-1/K-3 Badge System — Future Improvements

## Current Implementation (2026-04)

Tax treatment badges (NII, ORDINARY, PASSIVE, etc.) are currently derived by parsing
the free-text `notes` field on each `K1CodeItem`. The `parseBadges()` function in
`K1ReviewPanel.tsx` searches for keywords like "NII", "ordinary", "passive" and
renders colored inline badges next to line items.

When no specific keyword is detected but notes exist, a generic "Note" badge is shown
that can be clicked to reveal the full note text.

### Limitations

1. **Fragile keyword matching**: Parsing depends on specific phrasing in the AI
   extraction output. Changes to prompt templates or model behavior can break badge
   detection.
2. **No structured semantics**: There's no way for the UI to reliably distinguish
   e.g. "NII per Treas. Reg. 1.1411-4" from a casual mention of NII in a footnote.
3. **No persistence of badge state**: Badge visibility can't be manually overridden
   or suppressed by the user.

## Proposed Future Improvement: Structured Tags

Add an optional `tags` array to `K1CodeItem` in `@/types/finance/k1-data.ts`:

```typescript
export interface K1CodeItem {
  code: string
  value: string
  notes?: string
  confidence?: number
  manualOverride?: boolean
  /** Structured tax treatment tags for badge rendering. */
  tags?: Array<{
    label: string        // e.g. "NII", "ORDINARY", "PASSIVE", "STMT"
    category?: string    // e.g. "income_character", "form_reference", "basket"
    source?: 'ai' | 'manual'
  }>
}
```

### Benefits

- **Reliable rendering**: UI reads `tags[]` directly — no text parsing needed.
- **AI extraction integration**: The extraction prompt can populate `tags` as a
  structured field, reducing ambiguity.
- **User overrides**: Users could add/remove tags in the codes modal editor.
- **Filtering/aggregation**: Tags enable filtering items by treatment (e.g. "show
  all NII items") and cross-fund aggregation.

### Migration Path

1. Add `tags?: ...` to `K1CodeItem` (backward compatible — optional field).
2. Update AI extraction prompt to populate `tags` alongside `notes`.
3. Update `parseBadges()` to prefer `tags` when present, fall back to notes parsing.
4. Add tag editing UI to `K1CodesModal`.
5. Optional: backfill existing documents via a one-time migration script that runs
   the notes parser and writes structured tags.

### Badge Color Palette

| Tag Label | Light Mode | Dark Mode | Meaning |
|-----------|------------|-----------|---------|
| NII | `bg-blue-600 text-white` | `bg-blue-500` | Net Investment Income per §1411 |
| ORDINARY | `bg-amber-600 text-white` | `bg-amber-500` | Ordinary income character (not capital) |
| PASSIVE | `bg-purple-600 text-white` | `bg-purple-500` | Passive category per §904 |
| STMT | `bg-muted text-muted-foreground` | same | Statement attached (see detail) |
| MII | `bg-green-600 text-white` | `bg-green-500` | Miscellaneous itemized (§67(g) suspended) |
