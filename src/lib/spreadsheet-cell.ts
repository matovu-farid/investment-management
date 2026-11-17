/** Quote a CSV cell and protect spreadsheet formula prefixes and long integers. */
export function spreadsheetCell(value: string | number | null | undefined, forceText = false): string {
  let text = value == null ? '' : String(value)
  if (forceText || /^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) || /^\d{16,}$/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
