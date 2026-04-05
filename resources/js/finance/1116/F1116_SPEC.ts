/**
 * Form 1116 (Foreign Tax Credit) field specification.
 *
 * Subset of Form 1116 fields that are relevant for the apportionment worksheet
 * and K-3 data extraction.  This uses the same spec-driven rendering pattern
 * as K1_SPEC in the K-1 module.
 */

import type { K1FieldSpec } from '@/components/finance/k1'

/** Form 1116 field definitions for the Review Document panel. */
export const F1116_SPEC: K1FieldSpec[] = [
  {
    box: 'Category',
    label: 'Income category',
    concise: 'Category',
    fieldType: 'dropdown',
    dropdownItems: ['passive', 'general', 'section901j', 'sanctioned', 'lumpsum'],
    side: 'left',
    uiOrder: 1,
  },
  {
    box: 'Country',
    label: 'Name of country',
    concise: 'Country',
    fieldType: 'text',
    side: 'left',
    uiOrder: 2,
  },
  {
    box: '1a',
    label: 'Foreign gross income (passive category)',
    concise: 'Gross income (passive)',
    fieldType: 'text',
    side: 'right',
    uiOrder: 1,
  },
  {
    box: '1b',
    label: 'Foreign gross income (general category)',
    concise: 'Gross income (general)',
    fieldType: 'text',
    side: 'right',
    uiOrder: 2,
  },
  {
    box: '2',
    label: 'Pro-rata share of expenses allocable to foreign income',
    concise: 'Allocable expenses',
    fieldType: 'text',
    side: 'right',
    uiOrder: 3,
  },
  {
    box: '9',
    label: 'Foreign taxes paid or accrued',
    concise: 'Foreign taxes paid',
    fieldType: 'text',
    side: 'right',
    uiOrder: 4,
  },
  {
    box: '10',
    label: 'Carryover of foreign taxes',
    concise: 'Tax carryover',
    fieldType: 'text',
    side: 'right',
    uiOrder: 5,
  },
  {
    box: '20',
    label: 'Tentative credit (net foreign taxes / limitation)',
    concise: 'Tentative credit',
    fieldType: 'text',
    side: 'right',
    uiOrder: 6,
  },
  {
    box: 'notes',
    label: 'Supplemental narrative / footnotes',
    concise: 'Notes',
    fieldType: 'multiLineText',
    side: 'left',
    uiOrder: 10,
  },
]
