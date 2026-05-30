import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// UTF-8-safe base64 (the IPC save channel takes base64 and writes the bytes).
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function rowsToCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

// Returns just the base64 payload of the generated PDF.
export function tableToPdfBase64(
  title: string,
  head: string[],
  body: (string | number)[][]
): string {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [head],
    body: body.map((r) => r.map((c) => String(c ?? ''))),
    startY: 22,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] }
  })
  const uri = doc.output('datauristring')
  const marker = 'base64,'
  return uri.substring(uri.indexOf(marker) + marker.length)
}
