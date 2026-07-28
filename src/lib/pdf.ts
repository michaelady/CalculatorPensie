import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

export const MAX_PDF_PAGES = 20
/** Scale for rendering — higher = better OCR on scans, slower */
const RENDER_SCALE = 2.2

export interface PdfPageRender {
  pageNumber: number
  canvas: HTMLCanvasElement
  embeddedText: string
}

export interface PdfRenderResult {
  pageCount: number
  pagesProcessed: number
  pages: PdfPageRender[]
  /** Preview data URL of first page */
  previewUrl: string | null
}

export function isPdfUpload(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

async function extractPageText(page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>): Promise<string> {
  try {
    const content = await page.getTextContent()
    const parts: string[] = []
    for (const item of content.items) {
      if (item && typeof item === 'object' && 'str' in item) {
        const str = String((item as { str: string }).str ?? '').trim()
        if (str) parts.push(str)
      }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

async function renderPageToCanvas(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Nu s-a putut crea contextul canvas pentru PDF')

  // Fundal alb — scanările transparente / dark nu derutează OCR-ul
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
  }).promise

  return canvas
}

/**
 * Randează paginile PDF ca imagini (inclusiv PDF-uri scanate cu poze)
 * și extrage textul încorporat când există.
 */
export async function renderPdfForOcr(
  file: File,
  onProgress?: (status: string, progress: number) => void,
): Promise<PdfRenderResult> {
  if (!isPdfUpload(file)) {
    throw new Error('Fișierul nu este un PDF')
  }

  onProgress?.('Se încarcă PDF-ul…', 0.02)
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data, useSystemFonts: true })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages
  const limit = Math.min(pageCount, MAX_PDF_PAGES)
  const pages: PdfPageRender[] = []

  try {
    for (let i = 1; i <= limit; i++) {
      onProgress?.(
        `Se pregătește pagina ${i} din ${limit}${pageCount > limit ? ` (din ${pageCount})` : ''}…`,
        0.05 + (0.25 * (i - 1)) / limit,
      )
      const page = await pdf.getPage(i)
      const [embeddedText, canvas] = await Promise.all([
        extractPageText(page),
        renderPageToCanvas(page),
      ])
      pages.push({ pageNumber: i, canvas, embeddedText })
    }
  } finally {
    await pdf.cleanup()
    await loadingTask.destroy()
  }

  const previewUrl = pages[0]?.canvas.toDataURL('image/jpeg', 0.72) ?? null

  return {
    pageCount,
    pagesProcessed: pages.length,
    pages,
    previewUrl,
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Conversia paginii PDF a eșuat'))
      },
      'image/png',
      0.95,
    )
  })
}
