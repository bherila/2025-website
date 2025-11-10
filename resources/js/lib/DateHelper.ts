import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('Etc/GMT')

export class DateContainer {
  constructor(value: Date) {
    this.value = value
  }
  value: Date

  formatYMD(): string | null {
    const date = dayjs(this.value)
    return date.isValid() ? date.format('YYYY-MM-DD') : null
  }
}

export function parseDate(str: string | undefined | null | Date): DateContainer | null {
  if (!str) {
    return null
  }

  if (str instanceof Date) {
    return new DateContainer(str)
  }

  if (str.length > '2024-07-02 17:00:00.000'.length) {
    return null
  }

  // Handle various date formats
  let date: dayjs.Dayjs | null = null

  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = dayjs(str, 'YYYY-MM-DD')
  } else if (str.match(/^\d{1,2} [a-z]{3} \d{4}$/i)) {
    date = dayjs(str, 'DD MMM YYYY')
  } else if (str.match(/\d\d? [a-z]{3} '?`?\d{2}/i)) {
    const clean = str.replace(/['`]/g, '')
    date = dayjs(clean, 'DD MMM YY')
  } else if (str.match(/[a-z]{3} \d{1,2} `\d{2}$/i)) {
    const clean = str.replace(/['`]/g, '')
    date = dayjs(clean, 'MMM D YY')
  } else if (str.match(/[a-z]{3} \d{1,2} `\d{4}$/i)) {
    date = dayjs(str, 'MMM D `YYYY')
  } else if (str.match(/^\d{1,2}-[A-Z]{3}$/i)) {
    date = dayjs(str, 'DD-MMM')
  } else if (str.match(/^\d{2}[-/]\d{2}$/)) {
    date = dayjs(str, 'MM/DD')
  } else if (str.match(/\d{2}\/\d{2}\/\d{4}/)) {
    date = dayjs(str, 'MM/DD/YYYY')
  } else if (str.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    date = dayjs(str, 'M/D/YY')
  } else if (str.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)) {
    date = dayjs(str, 'YYYY-MM-DD HH:mm:ss.SSS')
  }

  return date?.isValid() ? new DateContainer(date.toDate()) : null
}
