import type { AccountLineItem } from '@/data/finance/AccountLineItem'

export interface TransactionTag {
  tag_id: number
  tag_label: string
  tag_color: string
}

export function collectTagsFromRows(rows: AccountLineItem[]): TransactionTag[] {
  const tagMap = new Map<number, TransactionTag>()

  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      if (tag.tag_id != null && !tagMap.has(tag.tag_id)) {
        tagMap.set(tag.tag_id, {
          tag_id: tag.tag_id,
          tag_label: tag.tag_label,
          tag_color: tag.tag_color,
        })
      }
    }
  }

  return [...tagMap.values()]
}
