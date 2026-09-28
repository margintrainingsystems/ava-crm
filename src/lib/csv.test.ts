import { buildCsv, csvCell } from './csv'

describe('CSV', () => {
  it('protege las celdas que Excel leería como fórmulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCell('-2+3')).toBe(`"'-2+3"`)
  })

  it('deja los teléfonos como están', () => {
    expect(csvCell('+54 9 (11) 5555-0000')).toBe('"+54 9 (11) 5555-0000"')
  })

  it('escribe vacío para null', () => {
    expect(csvCell(null)).toBe('""')
  })

  it('usa BOM, punto y coma y CRLF', () => {
    const csv = buildCsv(['A', 'B'], [[1, 'dos']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('"A";"B"\r\n"1";"dos"')
  })
})
