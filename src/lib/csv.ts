// CSV para Excel en español: separado por ";", con BOM y saltos CRLF.
// Las celdas que empiezan con = + - @ se protegen con un apóstrofo: los datos vienen de
// formularios públicos y Excel podría ejecutarlos como fórmulas. Un teléfono (+54 11 ...) queda igual.

const BOM = '\uFEFF'

export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s()-]+$/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'))
  return BOM + lines.join('\r\n')
}

export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 0)
}

export function todayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}
