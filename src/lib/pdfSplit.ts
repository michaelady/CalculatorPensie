import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getPdfOcrSettings, MAX_PDF_PAGES, type PdfOcrSettings } from './ocrSettings'
import { saveTempFile, type TempFileHandle } from './tempStorage'

// Worker-ul e setat și în pdf.ts; idempotent dacă ambele module se încarcă.
GlobalWorkerOptions.workerSrc = pdfWorker

export interface PdfChunkRef {
  /** Fișierul temporar de pe dispozitiv (copia PDF-ului original, neschimbată). */
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
  /** true dacă procesarea e împărțită în mai multe părți */
  split: boolean
  sessionId: string
}

async function countPagesFromBytes(data: Uint8Array): Promise<number> {
  const task = getDocument({
    data,
    useSystemFonts: true,
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
  })
  try {
    const pdf = await task.promise
    return pdf.numPages
  } finally {
    try {
      await task.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** Numără paginile cu PDF.js (tolerează scanuri fără /Type /Catalog). */
export async function countPdfPages(file: File): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer())
  return countPagesFromBytes(data)
}

/**
 * Salvează PDF-ul original temporar pe dispozitiv și întoarce intervale de pagini
 * (chunk-uri) pentru procesare pe rând — fără re-encodare (care eșua pe scanuri
 * cu `catalog.Pages is not a function`).
 */
export async function splitPdfToTempChunks(
  file: File,
  settings: PdfOcrSettings = getPdfOcrSettings(),
  onProgress?: (status: string, progress: number) => void,
): Promise<PdfSplitResult> {
  onProgress?.('Se analizează PDF-ul…', 0.02)
  const originalBytes = new Uint8Array(await file.arrayBuffer())
  // Copiem buffer-ul pentru numărare — getDocument poate transfera/detach ArrayBuffer-ul
  const countBytes = originalBytes.slice()
  const pageCount = await countPagesFromBytes(countBytes)
  const pagesQueued = Math.min(pageCount, settings.maxPages || MAX_PDF_PAGES)
  const chunkSize = Math.max(1, Math.min(settings.chunkPages, pagesQueued))
  const sessionId = `sess-${Date.now().toString(36)}`
  const baseName = file.name.replace(/\.pdf$/i, '') || 'document'

  onProgress?.('Se salvează temporar PDF-ul pe dispozitiv…', 0.06)
  const handle = await saveTempFile(
    `${baseName}.${sessionId}.source.pdf`,
    originalBytes,
    'application/pdf',
  )

  const totalChunks = Math.ceil(pagesQueued / chunkSize)
  const chunks: PdfChunkRef[] = []

  for (let c = 0; c < totalChunks; c++) {
    const start = c * chunkSize // 0-based
    const end = Math.min(start + chunkSize, pagesQueued) // exclusive
    chunks.push({
      handle,
      startPage: start + 1,
      endPage: end,
      pageCount: end - start,
    })
  }

  onProgress?.(
    totalChunks > 1
      ? `PDF pregătit: ${pagesQueued} pagini în ${totalChunks} părți (×${chunkSize})…`
      : 'PDF pregătit pentru citire…',
    0.12,
  )

  return {
    pageCount,
    pagesQueued,
    chunks,
    split: chunks.length > 1,
    sessionId,
  }
}
