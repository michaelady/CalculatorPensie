import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  getPdfOcrSettings,
  shouldSkipOcrForEmbeddedText,
  type PdfOcrSettings,
} from './ocrSettings'

export type { DeviceTier, PdfOcrSettings } from './ocrSettings'
export {
  detectDeviceTier,
  getPdfOcrSettings,
  MAX_PDF_PAGES,
  shouldSkipOcrForEmbeddedText,
} from './ocrSettings'

GlobalWorkerOptions.workerSrc = pdfWorker

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

export interface PdfPagePayload {
  pageNumber: number
  pageCount: number
  pagesToProcess: number
  embeddedText: string
  /** null când textul digital e suficient și sărim randarea */
  canvas: HTMLCanvasElement | null
  settings: PdfOcrSettings
}

export function isPdfUpload(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

/** Eliberează memoria bitmap-ului canvas cât de agresiv permite browserul. */
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return
  try {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  } catch {
    /* ignore */
  }
  canvas.width = 0
  canvas.height = 0
}

/** Cedează thread-ul principal ca UI-ul să rămână responsiv pe telefoane lente. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0))
    } else {
      setTimeout(resolve, 0)
    }
  })
}

async function extractPageText(page: PDFPageProxy): Promise<string> {
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

function resolveRenderScale(
  page: PDFPageProxy,
  settings: PdfOcrSettings,
): { scale: number; viewport: ReturnType<PDFPageProxy['getViewport']> } {
  const base = page.getViewport({ scale: 1 })
  const longest = Math.max(base.width, base.height) || 1
  const scaleByEdge = settings.maxCanvasEdge / longest
  const scale = Math.min(settings.renderScale, scaleByEdge)
  return { scale, viewport: page.getViewport({ scale }) }
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  settings: PdfOcrSettings,
): Promise<HTMLCanvasElement> {
  const { viewport } = resolveRenderScale(page, settings)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))

  // willReadFrequently ajută la exporturi repetate, dar pe low-end crește RAM —
  // pe low folosim contextul default (GPU) și un singur toBlob.
  const ctx = canvas.getContext(
    '2d',
    settings.lowMemory ? undefined : { willReadFrequently: true },
  )
  if (!ctx) throw new Error('Nu s-a putut crea contextul canvas pentru PDF')

  // Fundal alb — scanările transparente / dark nu derutează OCR-ul
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const task = page.render({
    canvas,
    canvasContext: ctx,
    viewport,
  })
  try {
    await task.promise
  } catch (err) {
    releaseCanvas(canvas)
    throw err
  }

  return canvas
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.88,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Conversia paginii PDF a eșuat'))
      },
      type,
      quality,
    )
  })
}

export async function canvasToPreviewDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.72,
): Promise<string> {
  // pe low-end toDataURL pe canvas mare poate bloca — downscale pentru preview
  const maxEdge = 720
  const longest = Math.max(canvas.width, canvas.height)
  if (longest <= maxEdge) {
    return canvas.toDataURL('image/jpeg', quality)
  }

  const scale = maxEdge / longest
  const w = Math.max(1, Math.floor(canvas.width * scale))
  const h = Math.max(1, Math.floor(canvas.height * scale))
  const preview = document.createElement('canvas')
  preview.width = w
  preview.height = h
  const ctx = preview.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/jpeg', quality)
  ctx.drawImage(canvas, 0, 0, w, h)
  const url = preview.toDataURL('image/jpeg', quality)
  releaseCanvas(preview)
  return url
}

type ProgressFn = (status: string, progress: number) => void

/**
 * Parcurge PDF-ul pagină cu pagină: extrage text → (opțional) randează →
 * apelează handler-ul → eliberează canvas-ul imediat.
 * Nu păstrează toate paginile în memorie (critic pe Android low-RAM).
 */
export async function processPdfPages(
  file: File,
  onPage: (page: PdfPagePayload) => Promise<void>,
  onProgress?: ProgressFn,
  settings: PdfOcrSettings = getPdfOcrSettings(),
): Promise<{ pageCount: number; pagesProcessed: number; previewUrl: string | null }> {
  if (!isPdfUpload(file)) {
    throw new Error('Fișierul nu este un PDF')
  }

  onProgress?.('Se încarcă PDF-ul…', 0.02)
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    // Reduce overhead pe dispozitive slabe
    disableAutoFetch: true,
    disableStream: true,
    verbosity: 0,
  })
  const pdf: PDFDocumentProxy = await loadingTask.promise
  const pageCount = pdf.numPages
  const limit = Math.min(pageCount, settings.maxPages)
  let previewUrl: string | null = null

  try {
    for (let i = 1; i <= limit; i++) {
      onProgress?.(
        `Se pregătește pagina ${i} din ${limit}${pageCount > limit ? ` (din ${pageCount})` : ''}…`,
        0.05 + (0.25 * (i - 1)) / limit,
      )

      const page = await pdf.getPage(i)
      let canvas: HTMLCanvasElement | null = null

      try {
        const embeddedText = await extractPageText(page)
        const skipRender = shouldSkipOcrForEmbeddedText(embeddedText, settings)

        if (!skipRender) {
          canvas = await renderPageToCanvas(page, settings)
          if (!previewUrl) {
            previewUrl = await canvasToPreviewDataUrl(canvas, 0.7)
          }
        } else if (!previewUrl) {
          // Tot generăm un preview mic pentru prima pagină digitală
          canvas = await renderPageToCanvas(page, {
            ...settings,
            renderScale: Math.min(1.1, settings.renderScale),
            maxCanvasEdge: Math.min(900, settings.maxCanvasEdge),
          })
          previewUrl = await canvasToPreviewDataUrl(canvas, 0.65)
          // Nu pasăm canvas-ul mai departe — OCR nu e necesar
          releaseCanvas(canvas)
          canvas = null
        }

        await onPage({
          pageNumber: i,
          pageCount,
          pagesToProcess: limit,
          embeddedText,
          canvas,
          settings,
        })
      } finally {
        releaseCanvas(canvas)
        canvas = null
        try {
          page.cleanup()
        } catch {
          /* ignore */
        }
      }

      await yieldToMain()
    }
  } finally {
    try {
      await pdf.cleanup()
    } catch {
      /* ignore */
    }
    try {
      await loadingTask.destroy()
    } catch {
      /* ignore */
    }
  }

  return {
    pageCount,
    pagesProcessed: limit,
    previewUrl,
  }
}

/**
 * @deprecated Preferă processPdfPages (streaming). Păstrat pentru compatibilitate.
 * Randează paginile PDF ca imagini — pe low-end poate consuma multă memorie.
 */
export async function renderPdfForOcr(
  file: File,
  onProgress?: ProgressFn,
  settings: PdfOcrSettings = getPdfOcrSettings(),
): Promise<PdfRenderResult> {
  const pages: PdfPageRender[] = []
  let previewUrl: string | null = null

  const meta = await processPdfPages(
    file,
    async (payload) => {
      if (payload.canvas) {
        // Clonăm pixelii într-un canvas nou fiindcă processPdfPages eliberează originalul
        const clone = document.createElement('canvas')
        clone.width = payload.canvas.width
        clone.height = payload.canvas.height
        const ctx = clone.getContext('2d')
        if (ctx) ctx.drawImage(payload.canvas, 0, 0)
        pages.push({
          pageNumber: payload.pageNumber,
          canvas: clone,
          embeddedText: payload.embeddedText,
        })
        if (!previewUrl) {
          previewUrl = await canvasToPreviewDataUrl(clone, 0.7)
        }
      } else {
        pages.push({
          pageNumber: payload.pageNumber,
          canvas: document.createElement('canvas'),
          embeddedText: payload.embeddedText,
        })
      }
    },
    onProgress,
    settings,
  )

  return {
    pageCount: meta.pageCount,
    pagesProcessed: meta.pagesProcessed,
    pages,
    previewUrl: previewUrl ?? meta.previewUrl,
  }
}
