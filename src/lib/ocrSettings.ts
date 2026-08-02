export type DeviceTier = 'low' | 'mid' | 'high'

export interface PdfOcrSettings {
  /** Cap absolut de pagini procesate dintr-un PDF (minim 20 pe toate tier-urile). */
  maxPages: number
  /**
   * Câte pagini intră într-un fișier temporar pe dispozitiv.
   * Pe Android slab PDF-ul mare se împarte în chunk-uri de această dimensiune.
   */
  chunkPages: number
  renderScale: number
  /** Cap pe latura lungă a canvas-ului (px) — evită OOM pe telefoane vechi */
  maxCanvasEdge: number
  jpegQuality: number
  /** Dacă textul digital e suficient, sărim OCR-ul costisitor */
  skipOcrIfEmbeddedChars: number
  /** Limbi Tesseract — mai puține pe low = mai puțină memorie */
  tesseractLang: string
  /** Hint pentru context canvas / eliberare agresivă */
  lowMemory: boolean
}

/** Limită maximă de pagini OCR per PDF — valabilă și pe Android low-end. */
export const MAX_PDF_PAGES = 20

/**
 * Detectează capacitatea dispozitivului pentru a reduce consumul de memorie
 * pe Android-uri vechi / cu puțină RAM (prin chunk-uri mai mici, nu prin mai puține pagini).
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
        maxPages: MAX_PDF_PAGES,
        chunkPages: 4,
        // Scale mai mare pentru stilou pe carnet (upscale-ul din preprocess completează)
        renderScale: 1.55,
        maxCanvasEdge: 1400,
        jpegQuality: 0.82,
        skipOcrIfEmbeddedChars: 100,
        tesseractLang: 'ron',
        lowMemory: true,
      }
    case 'mid':
      return {
        maxPages: MAX_PDF_PAGES,
        chunkPages: 8,
        renderScale: 2.0,
        maxCanvasEdge: 1900,
        jpegQuality: 0.88,
        skipOcrIfEmbeddedChars: 160,
        tesseractLang: 'ron+eng',
        lowMemory: false,
      }
    default:
      return {
        maxPages: MAX_PDF_PAGES,
        chunkPages: MAX_PDF_PAGES,
        renderScale: 2.5,
        maxCanvasEdge: 2600,
        jpegQuality: 0.92,
        skipOcrIfEmbeddedChars: 220,
        tesseractLang: 'ron+eng',
        lowMemory: false,
      }
  }
}

/**
 * Decide dacă textul digital e suficient de bogat ca să sărim OCR-ul.
 * Nu sărim pe formulare/carnete — textul tipărit al etichetelor nu include scrisul de mână.
 */
export function shouldSkipOcrForEmbeddedText(
  embeddedText: string,
  settings: PdfOcrSettings,
): boolean {
  const text = embeddedText.trim()
  if (text.length < settings.skipOcrIfEmbeddedChars) return false

  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  // Carnet / formular tipărit: etichetele au multe cuvinte, dar numele e scris de mână
  if (
    (lower.includes('numele') && lower.includes('prenume')) ||
    lower.includes('carnet de munca') ||
    lower.includes('carte de munca') ||
    lower.includes('locul nasterii') ||
    lower.includes('locul de munca')
  ) {
    return false
  }

  const digitCount = (text.match(/\d/g) ?? []).length
  const wordCount = text.split(/\s+/).filter(Boolean).length
  return digitCount >= 4 && wordCount >= 12
}
