/**
 * Tag color utilities.
 *
 * Tailwind's JIT compiler cannot detect dynamically built class names such as
 * `bg-${color}-200`, so we use inline styles with explicit hex values instead.
 */

const TAG_COLOR_HEX: Record<string, string> = {
  gray: '#6b7280',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  indigo: '#6366f1',
  purple: '#a855f7',
  pink: '#ec4899',
}

const TAG_COLOR_LIGHT: Record<string, string> = {
  gray: '#e5e7eb',
  red: '#fecaca',
  orange: '#fed7aa',
  yellow: '#fef08a',
  green: '#bbf7d0',
  teal: '#99f6e4',
  blue: '#bfdbfe',
  indigo: '#c7d2fe',
  purple: '#e9d5ff',
  pink: '#fbcfe8',
}

const TAG_COLOR_DARK: Record<string, string> = {
  gray: '#1f2937',
  red: '#991b1b',
  orange: '#9a3412',
  yellow: '#854d0e',
  green: '#166534',
  teal: '#115e59',
  blue: '#1e40af',
  indigo: '#3730a3',
  purple: '#6b21a8',
  pink: '#9d174d',
}

export function getTagColorHex(color: string): string {
  return TAG_COLOR_HEX[color] ?? '#3b82f6'
}

export function getTagColorLight(color: string): string {
  return TAG_COLOR_LIGHT[color] ?? '#bfdbfe'
}

export function getTagColorDark(color: string): string {
  return TAG_COLOR_DARK[color] ?? '#1e40af'
}

/** Returns inline style for a tag badge (light background, dark text). */
export function tagBadgeStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: getTagColorLight(color),
    color: getTagColorDark(color),
  }
}
