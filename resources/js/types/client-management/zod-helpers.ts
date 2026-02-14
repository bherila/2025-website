import { z } from 'zod'
import currency from 'currency.js'

/**
 * Coerces a value to a string with 2 decimal places using currency.js.
 * Useful for money fields.
 */
export const coerceMoney = (fallback = '0.00') => 
  z.preprocess((val) => {
    if (val === null || val === undefined) return fallback
    // currency() accepts string, number, or currency object. 
    // We cast to any for the library call to handle various input types safely.
    return currency(val as any).value.toFixed(2)
  }, z.string())

/**
 * Coerces a value to its string representation using currency.js to ensure safe parsing.
 * Useful for number-like fields that are stored as strings (e.g. hours).
 */
export const coerceNumberLike = (fallback = '0') => 
  z.preprocess((val) => {
    if (val === null || val === undefined) return fallback
    // Use a high precision for number-like fields to avoid unintended rounding (e.g. for hours)
    return currency(val as any, { precision: 8 }).value.toString()
  }, z.string())
