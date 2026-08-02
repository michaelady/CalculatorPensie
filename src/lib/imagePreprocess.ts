/**
 * Preprocesare canvas pentru OCR pe scris de mână / scanuri de carnet de muncă.
 * Crește contrastul, normalizează luminanța și reduce fondul gri al hârtiei.
 */

export interface PreprocessOptions {
  /** Upscale suplimentar (1 = fără). Util pentru scris mic cu stiloul. */
  upscale?: number
  /** Prag de binarizare adaptivă (0–255); null = doar contrast, fără threshold. */
  threshold?: number | null
  lowMemory?: boolean
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/**
 * Îmbunătățește un canvas pentru Tesseract: grayscale, contrast, (opțional) threshold.
 * Returnează un canvas nou; originalul rămâne intact (poate fi folosit la preview).
 */
export function enhanceCanvasForOcr(
  source: HTMLCanvasElement,
  options: PreprocessOptions = {},
): HTMLCanvasElement {
  const upscale = options.upscale ?? 1.25
  const threshold = options.threshold === undefined ? 168 : options.threshold
  const w = Math.max(1, Math.floor(source.width * upscale))
  const h = Math.max(1, Math.floor(source.height * upscale))

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d', { willReadFrequently: !options.lowMemory })
  if (!ctx) return source

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = options.lowMemory ? 'medium' : 'high'
  ctx.drawImage(source, 0, 0, w, h)

  let image: ImageData
  try {
    image = ctx.getImageData(0, 0, w, h)
  } catch {
    return out
  }

  const data = image.data
  const gray = new Uint8ClampedArray(w * h)

  // 1) grayscale + stretch contrast pe baza percentilenor (evită hârtia gri)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // luminanță perceptivă
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
  }

  // histogramă pentru percentila ~5 / ~95
  const hist = new Uint32Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let lo = 0
  let hi = 255
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= total * 0.05) {
      lo = i
      break
    }
  }
  acc = 0
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]
    if (acc >= total * 0.05) {
      hi = i
      break
    }
  }
  if (hi <= lo + 8) {
    lo = 40
    hi = 220
  }
  const span = hi - lo

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let v = ((gray[p] - lo) * 255) / span
    // accentuează cerneala (mai închis)
    v = 255 - Math.pow((255 - clamp(v)) / 255, 0.85) * 255
    v = clamp(v)

    if (threshold != null) {
      // threshold blând: păstrează griuri intermediare lângă prag (mai bun pe stilou)
      if (v > threshold + 18) v = 255
      else if (v < threshold - 28) v = 0
      else v = v < threshold ? (v * 0.55) | 0 : 220 + ((v - threshold) / 2) | 0
    }

    const outV = clamp(v) | 0
    data[i] = outV
    data[i + 1] = outV
    data[i + 2] = outV
    data[i + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
  return out
}

/** Heuristică: pagină tip formular / carnet (etichete tipărite + spații pentru scris). */
export function looksLikeHandwrittenForm(text: string): boolean {
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  return (
    (lower.includes('numele') && lower.includes('prenume')) ||
    lower.includes('carnet de munca') ||
    lower.includes('carte de munca') ||
    lower.includes('locul nasterii') ||
    lower.includes('locul de munca') ||
    (lower.includes('domiciliul') && lower.includes('naster')) ||
    lower.includes('seria') && lower.includes('nr') && lower.includes('eliberat')
  )
}
