export type DeviceTier = 'low' | 'mid' | 'high'

export interface PdfOcrSettings {
  maxPages: number
  renderScale: number
  /** Cap pe latura lungă a canvas-ului (px) — evită OOM pe telefoane vechi */
  maxCanvasEdge: number
  jpegQuality: number
  /** Dacă textul digital e suficient, sărim OCR-ul costisitor */
  skipOcrIfEmbeddedChars: number
  /** Limbi Tesseract — mai puține pe low = mai puțină memorie */
  tesseractLang: string
}

/** Limită maximă absolută (high-end). */
export const MAX_PDF_PAGES = 20

/**
 * Detectează capacitatea dispozitivului pentru a reduce consumul de memorie
 * pe Android-uri vechi / cu puțină RAM.
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'mid'

  const nav = navigator as Navigator & { deviceMemory?: number }
  const memory = nav.deviceMemory
  const cores = navigator.hardwareConcurrency ?? 4
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)
  const smallScreen =
    typeof screen !== 'undefined' && Math.min(screen.width, screen.height) <= 400

  // deviceMemory e în GB (Chrome); pe multe telefoane Android e 0.5–4
  if (memory != null && memory <= 2) return 'low'
  if (isAndroid && cores <= 4 && (memory == null || memory <= 4)) return 'low'
  if (isAndroid && smallScreen && cores <= 6) return 'low'
  if (cores <= 2) return 'low'

  if (memory != null && memory <= 4) return 'mid'
  if (isAndroid && cores <= 6) return 'mid'

  return 'high'
}

export function getPdfOcrSettings(tier: DeviceTier = detectDeviceTier()): PdfOcrSettings {
  switch (tier) {
    case 'low':
      return {
        maxPages: 8,
        renderScale: 1.35,
        maxCanvasEdge: 1280,
        jpegQuality: 0.8,
        skipOcrIfEmbeddedChars: 100,
        tesseractLang: 'ron',
      }
    case 'mid':
      return {
        maxPages: 12,
        renderScale: 1.7,
        maxCanvasEdge: 1680,
        jpegQuality: 0.86,
        skipOcrIfEmbeddedChars: 160,
        tesseractLang: 'ron+eng',
      }
    default:
      return {
        maxPages: MAX_PDF_PAGES,
        renderScale: 2.2,
        maxCanvasEdge: 2200,
        jpegQuality: 0.9,
        skipOcrIfEmbeddedChars: 220,
        tesseractLang: 'ron+eng',
      }
  }
}

/**
 * Decide dacă textul digital e suficient de bogat ca să sărim OCR-ul.
 * PDF-urile digitale (nu scanuri) au de obicei multe caractere + cifre/date.
 */
export function shouldSkipOcrForEmbeddedText(
  embeddedText: string,
  settings: PdfOcrSettings,
): boolean {
  const text = embeddedText.trim()
  if (text.length < settings.skipOcrIfEmbeddedChars) return false
  const digitCount = (text.match(/\d/g) ?? []).length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return digitCount >= 4 && wordCount >= 12
}
