import { createWorker } from 'tesseract.js'
import { extractCnpFromText, extractPersonNameFromText } from './cnp'
import { getPdfOcrSettings } from './ocrSettings'
import type { Sex } from './pension'

/** Evită coliziunea de tipuri cu DOM Worker din lib.dom. */
type TessWorker = {
  recognize: (image: File | Blob | string) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}

export interface OcrProgress {
  status: string
  progress: number
}

export interface ExtractedEmployment {
  angajator?: string
  dataInceput?: string
  dataSfarsit?: string
  functie?: string
  salariu?: number
  rawLine: string
}

export interface OcrExtraction {
  text: string
  angajari: ExtractedEmployment[]
  stagiuEstimatAni: number
  stagiuEstimatLuni: number
  salariuMediuEstimat: number | null
  /** Nume și prenume detectate în document */
  nume?: string
  /** CNP (13 cifre) dacă e valid */
  cnp?: string
  /** Sex dedus din CNP, dacă e disponibil */
  sex?: Sex
  /** Data nașterii (YYYY-MM-DD) din CNP sau document */
  dataNasterii?: string
  indiciiGasiti: string[]
  avertismente: string[]
}

const STATUS_MAP: Record<string, string> = {
  loading_tesseract_core: 'Se încarcă motorul OCR…',
  initializing_api: 'Inițializare…',
  loading_language: 'Se încarcă limba română…',
  initializing_tesseract: 'Pregătire Tesseract…',
  recognizing_text: 'Se citește documentul…',
}

export interface DocumentOcrResult {
  text: string
  previewUrl: string | null
  pageCount?: number
  pagesProcessed?: number
  filesProcessed?: number
  chunksProcessed?: number
}

export async function runOcr(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await createWorker('ron+eng', 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress({
          status: STATUS_MAP[String(m.status)] ?? String(m.status ?? 'Procesare…'),
          progress: m.progress,
        })
      }
    },
  })

  try {
    const { data } = await worker.recognize(file)
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

function combinePageText(embedded: string, ocrText: string): string {
  const parts = [embedded, ocrText].filter((t) => t.length > 0)
  if (parts.length === 0) return ''
  if (
    parts.length === 2 &&
    embedded.length > 80 &&
    ocrText.length < embedded.length * 0.3
  ) {
    return embedded
  }
  return [...new Set(parts)].join('\n')
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function mapProgress(
  local: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  return rangeStart + (rangeEnd - rangeStart) * Math.min(1, Math.max(0, local))
}

/**
 * OCR pe un fișier PDF (sau o parte din el, via fromPage/toPage).
 * Între chunk-uri se redeschide PDF-ul ca să eliberăm memoria pdf.js.
 */
async function runOcrOnPdfFile(
  file: File,
  settings: ReturnType<typeof getPdfOcrSettings>,
  onProgress?: (p: OcrProgress) => void,
  options?: {
    fromPage?: number
    toPage?: number
    totalPagesHint?: number
    progressStart?: number
    progressEnd?: number
    sharedWorker?: { current: TessWorker | null }
  },
): Promise<DocumentOcrResult> {
  const {
    processPdfPages,
    canvasToBlob,
    shouldSkipOcrForEmbeddedText,
    yieldToMain,
  } = await import('./pdf')

  const progressStart = options?.progressStart ?? 0.2
  const progressEnd = options?.progressEnd ?? 1
  const pageTexts: string[] = []
  const workerRef = options?.sharedWorker ?? { current: null }
  const ownsWorker = !options?.sharedWorker

  const ensureWorker = async (): Promise<TessWorker> => {
    if (workerRef.current) return workerRef.current
    onProgress?.({
      status: 'Se încarcă motorul OCR…',
      progress: mapProgress(0.05, progressStart, progressEnd),
    })
    const created = await createWorker(settings.tesseractLang, 1, {
      logger: (m) => {
        if (m.status && onProgress && m.status !== 'recognizing text') {
          onProgress({
            status: STATUS_MAP[String(m.status)] ?? String(m.status),
            progress: mapProgress(
              typeof m.progress === 'number' ? 0.05 + m.progress * 0.05 : 0.08,
              progressStart,
              progressEnd,
            ),
          })
        }
      },
    })
    workerRef.current = created as unknown as TessWorker
    return workerRef.current
  }

  try {
    const meta = await processPdfPages(
      file,
      async (page) => {
        const embedded = page.embeddedText.trim()
        const n = options?.totalPagesHint ?? page.pagesToProcess
        const absolutePage = page.pageNumber
        const idx = absolutePage - 1

        onProgress?.({
          status: `OCR pagină ${absolutePage}${n ? ` din ${n}` : ''}…`,
          progress: mapProgress(0.1 + (0.85 * idx) / Math.max(1, n), progressStart, progressEnd),
        })

        let ocrText = ''
        const skipOcr =
          !page.canvas || shouldSkipOcrForEmbeddedText(embedded, page.settings)

        if (!skipOcr && page.canvas) {
          const w = await ensureWorker()
          const blob = await canvasToBlob(
            page.canvas,
            page.settings.jpegQuality,
            'image/jpeg',
          )
          const { data } = await w.recognize(blob)
          ocrText = (data.text ?? '').trim()
        }

        const combined = combinePageText(embedded, ocrText)
        if (combined.trim()) {
          pageTexts.push(`--- Pagina ${absolutePage} ---\n${combined.trim()}`)
        }

        await yieldToMain()
      },
      (status, progress) => {
        onProgress?.({
          status,
          progress: mapProgress(progress * 0.1, progressStart, progressEnd),
        })
      },
      settings,
      {
        fromPage: options?.fromPage,
        toPage: options?.toPage,
      },
    )

    return {
      text: pageTexts.join('\n\n'),
      previewUrl: meta.previewUrl,
      pageCount: meta.pageCount,
      pagesProcessed: meta.pagesProcessed,
    }
  } finally {
    if (ownsWorker) {
      const activeWorker = workerRef.current
      workerRef.current = null
      if (activeWorker) {
        try {
          await activeWorker.terminate()
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/**
 * PDF: împarte în chunk-uri temporare pe dispozitiv (OPFS/IDB), apoi OCR pe rând.
 * Imagini: OCR direct.
 */
export async function runOcrOnDocument(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<DocumentOcrResult> {
  if (isPdfFile(file)) {
    const settings = getPdfOcrSettings()
    const { splitPdfToTempChunks } = await import('./pdfSplit')
    const { readTempFile, deleteTempFile, clearTempSession } = await import('./tempStorage')

    let split
    try {
      split = await splitPdfToTempChunks(file, settings, (status, progress) => {
        onProgress?.({ status, progress: progress * 0.15 })
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        msg.includes('Pages') || msg.includes('catalog')
          ? 'PDF-ul nu a putut fi citit (format de scan atipic). Încearcă re-salvarea ca PDF sau fotografii JPG ale paginilor.'
          : msg || 'Nu am putut deschide PDF-ul.',
      )
    }

    const pageTexts: string[] = []
    let previewUrl: string | null = null
    let pagesProcessed = 0
    const workerRef: { current: TessWorker | null } = { current: null }
    const tempHandle = split.chunks[0]?.handle

    try {
      const nChunks = split.chunks.length
      for (let i = 0; i < nChunks; i++) {
        const chunk = split.chunks[i]
        const rangeStart = 0.15 + (0.8 * i) / nChunks
        const rangeEnd = 0.15 + (0.8 * (i + 1)) / nChunks

        onProgress?.({
          status:
            nChunks > 1
              ? `Se procesează partea ${i + 1}/${nChunks} (pag. ${chunk.startPage}–${chunk.endPage})…`
              : 'Se citește PDF-ul…',
          progress: rangeStart,
        })

        // Reîncărcăm din stocarea temporară la fiecare parte — eliberează memoria pdf.js
        const chunkFile = await readTempFile(chunk.handle)
        const part = await runOcrOnPdfFile(chunkFile, settings, onProgress, {
          fromPage: chunk.startPage,
          toPage: chunk.endPage,
          totalPagesHint: split.pagesQueued,
          progressStart: rangeStart,
          progressEnd: rangeEnd,
          sharedWorker: workerRef,
        })
        if (part.text.trim()) pageTexts.push(part.text.trim())
        if (!previewUrl && part.previewUrl) previewUrl = part.previewUrl
        pagesProcessed += part.pagesProcessed ?? chunk.pageCount
      }
    } finally {
      const activeWorker = workerRef.current
      workerRef.current = null
      if (activeWorker) {
        try {
          await activeWorker.terminate()
        } catch {
          /* ignore */
        }
      }
      if (tempHandle) {
        try {
          await deleteTempFile(tempHandle)
        } catch {
          /* ignore */
        }
      }
      await clearTempSession(split.sessionId)
    }

    onProgress?.({ status: 'Gata', progress: 1 })

    if (pageTexts.length === 0) {
      throw new Error(
        'Nu am putut citi text din PDF. Încearcă un scan mai clar sau o fotografie a paginii.',
      )
    }

    let note = ''
    if (split.pageCount > split.pagesQueued) {
      note = `\n\n[Notă: au fost procesate ${split.pagesQueued} din ${split.pageCount} pagini (limită ${settings.maxPages})]`
    } else if (split.split) {
      note = `\n\n[Notă: PDF procesat în ${split.chunks.length} părți × max. ${settings.chunkPages} pagini (fișier temporar pe dispozitiv)]`
    }

    return {
      text: pageTexts.join('\n\n') + note,
      previewUrl,
      pageCount: split.pageCount,
      pagesProcessed,
      chunksProcessed: split.chunks.length,
    }
  }

  // Imagine clasică — pe low-end folosim doar română ca să reducem modelul
  const lang = getPdfOcrSettings().tesseractLang
  const text = await runOcrWithLang(file, lang, onProgress)
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
  return { text, previewUrl, filesProcessed: 1 }
}

/**
 * OCR pe mai multe fișiere (ex. scan carte de muncă + extras Revisal).
 * Procesează pe rând și unește textul pentru completarea perioadei lucrate.
 */
export async function runOcrOnDocuments(
  files: File[],
  onProgress?: (p: OcrProgress) => void,
): Promise<DocumentOcrResult> {
  if (files.length === 0) {
    throw new Error('Nu ai selectat niciun fișier')
  }
  if (files.length === 1) {
    return runOcrOnDocument(files[0], onProgress)
  }

  const texts: string[] = []
  let previewUrl: string | null = null
  let pageCount = 0
  let pagesProcessed = 0
  let chunksProcessed = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const rangeStart = i / files.length
    const rangeEnd = (i + 1) / files.length

    onProgress?.({
      status: `Fișier ${i + 1}/${files.length}: ${file.name}`,
      progress: rangeStart,
    })

    const result = await runOcrOnDocument(file, (p) => {
      onProgress?.({
        status: `Fișier ${i + 1}/${files.length}: ${p.status}`,
        progress: mapProgress(p.progress, rangeStart, rangeEnd),
      })
    })

    if (result.text.trim()) {
      texts.push(`===== Sursă ${i + 1}: ${file.name} =====\n${result.text.trim()}`)
    }
    if (!previewUrl && result.previewUrl) previewUrl = result.previewUrl
    pageCount += result.pageCount ?? (isPdfFile(file) ? 0 : 1)
    pagesProcessed += result.pagesProcessed ?? (isPdfFile(file) ? 0 : 1)
    chunksProcessed += result.chunksProcessed ?? 0
  }

  onProgress?.({ status: 'Gata', progress: 1 })

  if (texts.length === 0) {
    throw new Error('Nu am putut citi text din fișierele selectate.')
  }

  return {
    text: texts.join('\n\n'),
    previewUrl,
    pageCount: pageCount || undefined,
    pagesProcessed: pagesProcessed || undefined,
    filesProcessed: files.length,
    chunksProcessed: chunksProcessed || undefined,
  }
}

/**
 * Unește extragerile din mai multe surse (scan + Revisal etc.)
 * și recalculează stagiul pe baza perioadelor combinate.
 */
export function mergeOcrExtractions(parts: OcrExtraction[]): OcrExtraction {
  if (parts.length === 0) {
    return {
      text: '',
      angajari: [],
      stagiuEstimatAni: 0,
      stagiuEstimatLuni: 0,
      salariuMediuEstimat: null,
      indiciiGasiti: [],
      avertismente: ['Nicio extragere de unit.'],
    }
  }
  if (parts.length === 1) return parts[0]

  // Re-parse pe textul combinat — evită dublarea logică de stagiu
  const combinedText = parts.map((p) => p.text).join('\n\n')
  const merged = parseEmploymentDocument(combinedText)
  merged.indiciiGasiti = [
    `Surse combinate: ${parts.length} fișiere`,
    ...merged.indiciiGasiti,
  ]
  return merged
}

async function runOcrWithLang(
  file: File | Blob,
  lang: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress({
          status: STATUS_MAP[String(m.status)] ?? String(m.status ?? 'Procesare…'),
          progress: m.progress,
        })
      }
    },
  })

  try {
    const { data } = await worker.recognize(file)
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

const MONTH_MAP: Record<string, string> = {
  ian: '01',
  ianuarie: '01',
  feb: '02',
  februarie: '02',
  mar: '03',
  martie: '03',
  apr: '04',
  aprilie: '04',
  mai: '05',
  iun: '06',
  iunie: '06',
  iul: '07',
  iulie: '07',
  aug: '08',
  august: '08',
  sep: '09',
  septembrie: '09',
  oct: '10',
  octombrie: '10',
  noi: '11',
  noiembrie: '11',
  dec: '12',
  decembrie: '12',
}

function normalizeDate(raw: string): string | undefined {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ')

  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
  let m = cleaned.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    let y = m[3]
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`
    return `${y}-${mo}-${d}`
  }

  // yyyy-mm-dd
  m = cleaned.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }

  // 15 ianuarie 2010
  m = cleaned.match(/(\d{1,2})\s+([a-zăâîșț]+)\.?\s+(\d{4})/i)
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()]
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`
  }

  return undefined
}

function parseSalary(text: string): number | null {
  // Doar contexte explicite de salariu / monedă — evită confuzia cu date (ex. 01.03.2010)
  const patterns = [
    /salari(?:u|ul|ului)?[^0-9]{0,24}(\d{1,3}(?:[.\s]\d{3})+|\d{3,6})(?:[.,]\d{2})?/i,
    /(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*(?:lei|ron|leu)\b/i,
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const raw = m[1].replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
      const n = Number.parseFloat(raw)
      if (!Number.isNaN(n) && n >= 800 && n <= 200000) return Math.round(n)
    }
  }
  return null
}

function monthsBetween(start: string, end: string): number {
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(
    0,
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()),
  )
}

/**
 * Extrage din text OCR indicii despre angajări, stagiu, salarii, nume și CNP.
 * Cartea de muncă variază ca format — rezultatul e o estimare de completat manual.
 */
export function parseEmploymentDocument(text: string): OcrExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2)

  const angajari: ExtractedEmployment[] = []
  const salarii: number[] = []
  const indiciiGasiti: string[] = []
  const avertismente: string[] = []

  const dateRegex =
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+(?:ian|feb|mar|apr|mai|iun|iul|aug|sep|oct|noi|dec)[a-zăâîșț]*\.?\s+\d{4})/gi

  // Identitate: CNP + nume
  const cnpDecoded = extractCnpFromText(text)
  const nume = extractPersonNameFromText(text)
  if (cnpDecoded) {
    indiciiGasiti.push(`CNP detectat: ${cnpDecoded.cnp}`)
    indiciiGasiti.push(
      `Din CNP: ${cnpDecoded.sex === 'M' ? 'bărbat' : 'femeie'}, născut(ă) ${cnpDecoded.dataNasterii}`,
    )
  }
  if (nume) {
    indiciiGasiti.push(`Nume detectat: ${nume}`)
  }

  // Detect document type hints
  const lower = text.toLowerCase()
  if (
    lower.includes('carte de muncă') ||
    lower.includes('cartea de munca') ||
    lower.includes('carnet de muncă')
  ) {
    indiciiGasiti.push('Document identificat: carte / carnet de muncă')
  }
  if (lower.includes('adeverință') || lower.includes('adeverinta')) {
    indiciiGasiti.push('Document identificat: adeverință')
  }
  if (lower.includes('casă de pensii') || lower.includes('cnpp') || lower.includes('stagiu')) {
    indiciiGasiti.push('Document identificat: extras / stagiu CNPP')
  }
  if (
    lower.includes('revisal') ||
    lower.includes('registrul general de evidență a salariaților') ||
    lower.includes('registrul general de evidenta a salariatilor')
  ) {
    indiciiGasiti.push('Document identificat: extras Revisal')
  }

  for (const line of lines) {
    const dates = [...line.matchAll(dateRegex)].map((m) => normalizeDate(m[0])).filter(Boolean) as string[]
    const salariu = parseSalary(line)

    if (dates.length >= 1 || salariu) {
      const entry: ExtractedEmployment = {
        rawLine: line,
        dataInceput: dates[0],
        dataSfarsit: dates[1],
        salariu: salariu ?? undefined,
      }

      if (dates.length >= 1) {
        const scSrl = line.match(
          /\bS\.?\s*C\.?\s+([A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț.-]*(?:\s+[A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț.-]*){0,3})\s+S\.?R\.?L\.?\b/i,
        )
        const scSa = line.match(
          /\bS\.?\s*C\.?\s+([A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț.-]*(?:\s+[A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț.-]*){0,3})\s+S\.?A\.?\b/i,
        )
        const trailingSrl = line.match(
          /\b([A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț.-]{1,30})\s+S\.?R\.?L\.?\b/i,
        )
        const inst = line.match(
          /\b((?:Regia|Institut(?:ul)?|Minister(?:ul)?|Primăria|Spital(?:ul)?)\s+[A-Za-zĂÂÎȘȚăâîșț][\wĂÂÎȘȚăâîșț .-]{2,40}?)(?=\s+(?:angajat|început|de la|din|,|\d)|$)/i,
        )
        if (scSrl) entry.angajator = `S.C. ${scSrl[1].trim()} SRL`
        else if (scSa) entry.angajator = `S.C. ${scSa[1].trim()} SA`
        else if (trailingSrl) entry.angajator = `${trailingSrl[1].trim()} SRL`
        else if (inst) entry.angajator = inst[1].trim()
      }

      angajari.push(entry)
      if (salariu) salarii.push(salariu)
    }
  }

  // Aggregate tenure from date pairs
  let totalLuni = 0
  for (const a of angajari) {
    if (a.dataInceput && a.dataSfarsit) {
      totalLuni += monthsBetween(a.dataInceput, a.dataSfarsit)
    } else if (a.dataInceput && !a.dataSfarsit) {
      // Assume still employed until today for open-ended
      totalLuni += monthsBetween(a.dataInceput, new Date().toISOString().slice(0, 10))
    }
  }

  // Prefer explicit vechime mention over summed date spans when both exist
  const vechimeMatch = text.match(
    /(?:vechime|stagiu(?:\s+de\s+cotizare)?)[^\d]{0,30}(\d{1,2})\s*(?:ani|an)(?:[^\d]{0,10}(\d{1,2})\s*(?:luni|lun))?/i,
  )
  let stagiuDinVechime: number | null = null
  if (vechimeMatch) {
    const ani = Number(vechimeMatch[1])
    const luni = vechimeMatch[2] ? Number(vechimeMatch[2]) : 0
    stagiuDinVechime = ani * 12 + luni
    indiciiGasiti.push(`Vechime menționată în document: ${ani} ani${luni ? ` și ${luni} luni` : ''}`)
  }

  const luniFinal = stagiuDinVechime != null && stagiuDinVechime > 0 ? stagiuDinVechime : totalLuni
  const stagiuEstimatAni = Math.floor(luniFinal / 12)
  const stagiuEstimatLuni = luniFinal % 12
  const salariuMediuEstimat =
    salarii.length > 0
      ? Math.round(salarii.reduce((s, x) => s + x, 0) / salarii.length)
      : null

  if (angajari.length === 0 && !vechimeMatch) {
    avertismente.push(
      'Nu am putut extrage automat perioade de angajare. Verifică textul OCR și completează manual.',
    )
  }
  if (luniFinal === 0) {
    avertismente.push(
      'Stagiul estimat este 0 — introdu manual anii și lunile de cotizare.',
    )
  }
  if (!salariuMediuEstimat) {
    avertismente.push(
      'Nu am găsit salarii clare în document. Introdu salariul brut mediu manual.',
    )
  }

  if (stagiuEstimatAni > 0) {
    indiciiGasiti.push(
      `Stagiu estimat din date: ${stagiuEstimatAni} ani${stagiuEstimatLuni ? ` și ${stagiuEstimatLuni} luni` : ''}`,
    )
  }
  if (salariuMediuEstimat) {
    indiciiGasiti.push(`Salariu mediu detectat: ${salariuMediuEstimat.toLocaleString('ro-RO')} lei`)
  }
  if (!nume) {
    avertismente.push('Nu am găsit numele în document — completează-l manual dacă e nevoie.')
  }
  if (!cnpDecoded) {
    avertismente.push('Nu am găsit un CNP valid în document — completează-l manual dacă e nevoie.')
  }

  return {
    text,
    angajari,
    stagiuEstimatAni,
    stagiuEstimatLuni,
    salariuMediuEstimat,
    nume: nume ?? undefined,
    cnp: cnpDecoded?.cnp,
    sex: cnpDecoded?.sex,
    dataNasterii: cnpDecoded?.dataNasterii,
    indiciiGasiti,
    avertismente,
  }
}
