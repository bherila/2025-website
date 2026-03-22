import { collectTagsFromRows } from '@/components/finance/transactionsTableTags'

describe('transactionsTableTags', () => {
  it('collects unique tags from transaction rows as fallback', () => {
    const rows: any[] = [
      {
        tags: [
          { tag_id: 1, tag_label: 'Food', tag_color: 'blue', tag_userid: '1' },
          { tag_id: 2, tag_label: 'Travel', tag_color: 'green', tag_userid: '1' },
        ],
      },
      {
        tags: [
          { tag_id: 1, tag_label: 'Food', tag_color: 'blue', tag_userid: '1' },
        ],
      },
    ]

    expect(collectTagsFromRows(rows)).toEqual([
      { tag_id: 1, tag_label: 'Food', tag_color: 'blue' },
      { tag_id: 2, tag_label: 'Travel', tag_color: 'green' },
    ])
  })
})
