/**
 * Validează pipeline-ul de extragere pe un PDF real (fără browser).
 * Folosește pdf.js pentru text încorporat + parseEmploymentDocument.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPersonNameFromText } from '../src/lib/cnp'
import { parseEmploymentDocument } from '../src/lib/ocr'
import { shouldSkipOcrForEmbeddedText, getPdfOcrSettings } from '../src/lib/ocrSettings'

const pdfPath =
  process.argv[2] ||
  resolve('testdata/validation/Carte_Munca_Voinea_Mihai_transcriere_nopics_1483.pdf')
const filename = pdfPath.split(/[/\\]/).pop() || 'document.pdf'

GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href

async function extractPdfText(path: string): Promise<{ pageCount: number; text: string }> {
  const data = new Uint8Array(readFileSync(path))
  const task = getDocument({ data, useSystemFonts: true, verbosity: 0 })
  const pdf = await task.promise
  const parts: string[] = []
  const limit = Math.min(pdf.numPages, 20)
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it) => ('str' in it ? String((it as { str: string }).str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (pageText) parts.push(`--- Pagina ${i} ---\n${pageText}`)
  }
  const pageCount = pdf.numPages
  try {
    await pdf.cleanup()
  } catch {
    /* ignore */
  }
  return { pageCount, text: parts.join('\n\n') }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const { pageCount, text } = await extractPdfText(pdfPath)
console.log(`PDF: ${filename}`)
console.log(`Pagini: ${pageCount}`)
console.log(`Caractere text extras (pdf.js): ${text.length}`)
console.log('--- fragment ---')
console.log(text.slice(0, 600))
console.log('---')

const settings = getPdfOcrSettings('high')
const skipOcr = shouldSkipOcrForEmbeddedText(text, settings)
console.log(`Skip OCR (text digital suficient)? ${skipOcr}`)
assert(skipOcr, 'PDF-ul de transcriere trebuie să sară OCR-ul (text digital bogat)')

const nameOnly = extractPersonNameFromText(text, { filename })
console.log(`Nume (extract): ${nameOnly}`)

const parsed = parseEmploymentDocument(text, { filenames: [filename] })
console.log('\n=== REZULTAT parseEmploymentDocument ===')
console.log({
  nume: parsed.nume,
  cnp: parsed.cnp,
  sex: parsed.sex,
  dataNasterii: parsed.dataNasterii,
  stagiuEstimatAni: parsed.stagiuEstimatAni,
  stagiuEstimatLuni: parsed.stagiuEstimatLuni,
  salariuMediuEstimat: parsed.salariuMediuEstimat,
  angajari: parsed.angajari.length,
  indiciiGasiti: parsed.indiciiGasiti,
  avertismente: parsed.avertismente,
})
console.log('\nPrimele angajări:')
for (const a of parsed.angajari.slice(0, 8)) {
  console.log(`  ${a.dataInceput ?? '?'} → ${a.dataSfarsit ?? '?'} | ${a.angajator ?? a.rawLine.slice(0, 70)} | ${a.salariu ?? '-'}`)
}

// Criterii de validare pentru acest document
assert(
  !!parsed.nume && /voinea/i.test(parsed.nume) && /mihai/i.test(parsed.nume),
  `nume trebuie Voinea Mihai, got ${parsed.nume}`,
)
assert(!/transcriere|nopics/i.test(parsed.nume ?? ''), `nume contaminat de filename: ${parsed.nume}`)
assert(text.toLowerCase().includes('voinea mihai'), 'textul PDF conține Voinea Mihai')
assert(pageCount >= 1, 'cel puțin o pagină')
assert(
  parsed.stagiuEstimatAni >= 5,
  `stagiu trebuie >0 din date yyyy.mm.dd, got ${parsed.stagiuEstimatAni}a ${parsed.stagiuEstimatLuni}l`,
)
assert(
  !!parsed.dataNasterii && parsed.dataNasterii.startsWith('1961'),
  `data nașterii ~1961, got ${parsed.dataNasterii}`,
)
assert(
  parsed.salariuMediuEstimat != null &&
    parsed.salariuMediuEstimat >= 800 &&
    parsed.salariuMediuEstimat <= 20_000,
  `salariu RON rezonabil, got ${parsed.salariuMediuEstimat}`,
)
assert(
  parsed.angajari.some((a) => a.dataInceput && a.dataInceput.startsWith('19')),
  'cel puțin o angajare cu an 19xx (format yyyy.mm.dd)',
)

console.log('\nVALIDARE OK — Voinea Mihai + stagiu + DOB + salariu din PDF transcriere')
