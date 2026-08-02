import { PDFDocument } from 'pdf-lib'
import { getPdfOcrSettings, MAX_PDF_PAGES, type PdfOcrSettings } from './ocrSettings'
import { saveTempFile, type TempFileHandle } from './tempStorage'

export interface PdfChunkRef {
  handle: TempFileHandle
  /** Index 1-based al primei pagini din PDF-ul original */
  startPage: number
  /** Index 1-based al ultimei pagini din PDF-ul original */
  endPage: number
  pageCount: number
}

export interface PdfSplitResult {
  pageCount: number
  pagesQueued: number
  chunks: PdfChunkRef[]
  /** true dacă PDF-ul a fost împărțit în mai multe fișiere temporare */
  split: boolean
  sessionId: string
}

/**
 * Împarte un PDF în fișiere mai mici (chunk-uri), le salvează temporar pe dispozitiv
 * și returnează handle-urile pentru procesare secvențială.
 * Nu reduce sub MAX_PDF_PAGES — pe low-end doar micșorează dimensiunea chunk-ului.
 */
export async function splitPdfToTempChunks(
  file: File,
  settings: PdfOcrSettings = getPdfOcrSettings(),
  onProgress?: (status: string, progress: number) => void,
): Promise<PdfSplitResult> {
  onProgress?.('Se analizează PDF-ul…', 0.02)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageCount = source.getPageCount()
  const pagesQueued = Math.min(pageCount, settings.maxPages || MAX_PDF_PAGES)
  const chunkSize = Math.max(1, Math.min(settings.chunkPages, pagesQueued))
  const sessionId = `sess-${Date.now().toString(36)}`
  const baseName = file.name.replace(/\.pdf$/i, '') || 'document'
  const chunks: PdfChunkRef[] = []

  // Un singur chunk — tot salvăm temporar ca să eliberăm buffer-ul original din RAM
  const totalChunks = Math.ceil(pagesQueued / chunkSize)

  for (let c = 0; c < totalChunks; c++) {
    const start = c * chunkSize // 0-based
    const end = Math.min(start + chunkSize, pagesQueued) // exclusive
    onProgress?.(
      totalChunks > 1
        ? `Se salvează temporar partea ${c + 1}/${totalChunks} (pag. ${start + 1}–${end})…`
        : 'Se pregătește fișierul temporar…',
      0.04 + (0.12 * c) / totalChunks,
    )

    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const part = await PDFDocument.create()
    const copied = await part.copyPages(source, indices)
    for (const page of copied) part.addPage(page)
    const partBytes = await part.save({ useObjectStreams: false })

    const name = `${baseName}.${sessionId}.p${start + 1}-${end}.pdf`
    const handle = await saveTempFile(name, partBytes, 'application/pdf')
    chunks.push({
      handle,
      startPage: start + 1,
      endPage: end,
      pageCount: end - start,
    })

    // Cedează thread-ul după fiecare chunk
    await new Promise((r) => setTimeout(r, 0))
  }

  return {
    pageCount,
    pagesQueued,
    chunks,
    split: chunks.length > 1,
    sessionId,
  }
}
