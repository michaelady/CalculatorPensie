import type { Sex } from './pension'

/** Cheie de control CNP (algoritm oficial). */
const CNP_CONTROL_KEY = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9] as const

export interface CnpDecoded {
  cnp: string
  sex: Sex
  dataNasterii: string // YYYY-MM-DD
}

export function isValidCnp(cnp: string): boolean {
  if (!/^[1-8]\d{12}$/.test(cnp)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(cnp[i]) * CNP_CONTROL_KEY[i]
  }
  let control = sum % 11
  if (control === 10) control = 1
  return control === Number(cnp[12])
}

/** Decodează sex + data nașterii din CNP valid. */
export function decodeCnp(cnp: string): CnpDecoded | null {
  const cleaned = cnp.replace(/\s+/g, '')
  if (!isValidCnp(cleaned)) return null

  const s = Number(cleaned[0])
  const yy = Number(cleaned.slice(1, 3))
  const mm = Number(cleaned.slice(3, 5))
  const dd = Number(cleaned.slice(5, 7))

  let century: number
  if (s === 1 || s === 2) century = 1900
  else if (s === 3 || s === 4) century = 1800
  else if (s === 5 || s === 6) century = 2000
  else century = 1900 // 7/8 rezidenți — cel mai frecvent secol XX

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null

  const year = century + yy
  const dataNasterii = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  const sex: Sex = s % 2 === 1 ? 'M' : 'F'

  return { cnp: cleaned, sex, dataNasterii }
}

/** Extrage primul CNP valid din text OCR. */
export function extractCnpFromText(text: string): CnpDecoded | null {
  const labeled = [
    ...text.matchAll(
      /(?:\bCNP\b|\bC\.?\s*N\.?\s*P\.?\b|cod(?:ul)?\s+numeric\s+personal)\s*[:-]?\s*([1-8][\d ]{12,16})/gi,
    ),
  ]
  for (const m of labeled) {
    const digits = m[1].replace(/\D/g, '')
    const decoded = decodeCnp(digits)
    if (decoded) return decoded
  }

  for (const m of text.matchAll(/\b([1-8]\d{12})\b/g)) {
    const decoded = decodeCnp(m[1])
    if (decoded) return decoded
  }

  return null
}

const NAME_STOP = new Set([
  'srl',
  'sa',
  'scn',
  'cnp',
  'cnpp',
  'revisal',
  'romania',
  'românia',
  'angajat',
  'angajata',
  'salariat',
  'titular',
  'domiciliu',
  'domiciliul',
  'adresa',
  'strada',
  'județ',
  'judet',
  'localitatea',
  'seria',
  'nr',
  'data',
  'nasterii',
  'nașterii',
  'sex',
  'masculin',
  'feminin',
  'numele',
  'prenumele',
  'nume',
  'prenume',
  'locul',
  'munca',
  'muncă',
  'eliberat',
  'eliberata',
  'carte',
  'carnet',
  'ian',
  'ianuarie',
  'feb',
  'februarie',
  'mar',
  'martie',
  'apr',
  'aprilie',
  'mai',
  'iun',
  'iunie',
  'iul',
  'iulie',
  'aug',
  'august',
  'sep',
  'septembrie',
  'oct',
  'octombrie',
  'noi',
  'noiembrie',
  'dec',
  'decembrie',
])

/** Token de nume pe o singură linie (fără \n). Acceptă și OCR-uri cu 0/O, 1/I. */
const NAME_TOKEN = "[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț'’-]{1,30}"
const NAME_CAPTURE = `(${NAME_TOKEN}(?:[ \\t]+${NAME_TOKEN}){1,3})`

/** Etichetă „Numele și prenumele” tolerând erori OCR (si/s,i/si,/şi). */
const NUME_PRENUME_LABEL =
  'nume(?:le)?\\s*(?:[sșş][iìí]|si|&|\\+|s[,.]?i)\\s*prenume(?:le)?'

function looksLikePersonName(raw: string): boolean {
  const parts = raw
    .trim()
    .replace(/[ \t]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return false
  if (parts.some((p) => NAME_STOP.has(p.toLowerCase()))) return false
  if (parts.some((p) => /\d/.test(p))) return false
  return parts.every((p) => new RegExp(`^${NAME_TOKEN}$`, 'u').test(p))
}

function titleCaseName(name: string): string {
  return name
    .trim()
    .replace(/[ \t]+/g, ' ')
    .split(' ')
    .map((p) => {
      const lower = p.toLocaleLowerCase('ro-RO')
      return lower.charAt(0).toLocaleUpperCase('ro-RO') + lower.slice(1)
    })
    .join(' ')
}

/**
 * Corectează greșeli tipice OCR pe majuscule (stilou): 0→O, 1→I, rn→m etc. pe tokeni de nume.
 */
export function sanitizeOcrNameToken(token: string): string {
  return token
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/^rn/i, 'M')
    .replace(/vv/gi, 'W')
}

function cleanupCapturedName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/[.|·•_/\\]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split(' ')
    .map(sanitizeOcrNameToken)
    .filter((p) => p.length >= 2 && !NAME_STOP.has(p.toLowerCase()))
    .join(' ')
  if (!looksLikePersonName(cleaned)) return null
  return titleCaseName(cleaned)
}

/**
 * Extrage numele de pe linia de după eticheta de carnet, inclusiv când
 * scrisul de mână e pe rândul următor (puncte …… + VOINEA MIHAI).
 */
function extractNameAfterCarnetLabel(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const labelRe = new RegExp(`^${NUME_PRENUME_LABEL}\\b`, 'i')
    if (!labelRe.test(line) && !/nume(?:le)?\s*.{0,6}\s*prenume/i.test(line)) {
      continue
    }

    // Același rând: după etichetă / puncte
    const sameLine = line
      .replace(new RegExp(`^${NUME_PRENUME_LABEL}\\b`, 'i'), '')
      .replace(/^[:.\-–—_\s·•]+/, '')
      .trim()
    const same = cleanupCapturedName(sameLine)
    if (same) return same

    // Rândul următor (scris pe puncte)
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const next = lines[j]
        .replace(/^[:.\-–—_\s·•]+/, '')
        .replace(/[.]{2,}/g, ' ')
        .trim()
      // Preferă linii FULL CAPS (tipic stilou pe carnet)
      const caps = next.match(/\b([A-ZĂÂÎȘȚ]{2,}(?:[ \t]+[A-ZĂÂÎȘȚ]{2,}){1,3})\b/)
      if (caps) {
        const hit = cleanupCapturedName(caps[1])
        if (hit) return hit
      }
      const hit = cleanupCapturedName(next)
      if (hit) return hit
    }
  }

  return null
}

/** Caută nume FULL CAPS tipic pe prima pagină de carnet (ex. VOINEA MIHAI). */
function extractProminentCapsName(text: string): string | null {
  const candidates: string[] = []
  for (const m of text.matchAll(/\b([A-ZĂÂÎȘȚ]{3,}(?:[ \t]+[A-ZĂÂÎȘȚ]{3,}){1,3})\b/g)) {
    const hit = cleanupCapturedName(m[1])
    if (hit) candidates.push(hit)
  }
  // Preferă 2 tokeni (nume + prenume) față de 3–4
  candidates.sort((a, b) => {
    const da = Math.abs(a.split(' ').length - 2)
    const db = Math.abs(b.split(' ').length - 2)
    return da - db || b.length - a.length
  })
  return candidates[0] ?? null
}

/** Extrage numele persoanei din text OCR (etichete tipice + linii majuscule lângă CNP). */
export function extractPersonNameFromText(text: string): string | null {
  // 1) Specific carnet de muncă: „Numele şi prenumele”
  const fromCarnet = extractNameAfterCarnetLabel(text)
  if (fromCarnet) return fromCarnet

  const patterns = [
    new RegExp(
      `(?:${NUME_PRENUME_LABEL}|nume\\s*(?:și|si)?\\s*prenume)\\s*[:\\-]?\\s*${NAME_CAPTURE}`,
      'i',
    ),
    new RegExp(`(?:\\bnume\\b|\\bprenume\\b)\\s*[:\\-]?\\s*${NAME_CAPTURE}`, 'i'),
    new RegExp(
      `(?:titular(?:ul)?|angajat(?:ul|a)?|salariat(?:ul|a)?|beneficiar(?:ul)?)\\s*[:\\-]?\\s*${NAME_CAPTURE}`,
      'i',
    ),
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const hit = cleanupCapturedName(m[1])
      if (hit) return hit
    }
  }

  const numeM = text.match(new RegExp(`\\bnume(?:le)?\\s*[:\\-]\\s*(${NAME_TOKEN})`, 'i'))
  const prenumeM = text.match(
    new RegExp(
      `\\bprenume(?:le)?\\s*[:\\-]\\s*(${NAME_TOKEN}(?:[ \\t]+${NAME_TOKEN}){0,2})`,
      'i',
    ),
  )
  if (numeM && prenumeM) {
    const hit = cleanupCapturedName(`${numeM[1]} ${prenumeM[1]}`)
    if (hit) return hit
  }

  const nearCnp = text.match(
    new RegExp(
      `${NAME_CAPTURE}\\s*(?:\\n|\\r|,|;|\\s){0,40}(?:CNP|C\\.?\\s*N\\.?\\s*P\\.?)`,
      'i',
    ),
  )
  if (nearCnp) {
    const hit = cleanupCapturedName(nearCnp[1])
    if (hit) return hit
  }

  const afterCnp = text.match(
    new RegExp(
      `(?:CNP|C\\.?\\s*N\\.?\\s*P\\.?)\\s*[:\\-]?\\s*[1-8]\\d{12}\\s*(?:\\n|\\r|,|;|\\s){0,40}${NAME_CAPTURE}`,
      'i',
    ),
  )
  if (afterCnp) {
    const hit = cleanupCapturedName(afterCnp[1])
    if (hit) return hit
  }

  // 2) Fallback: nume majuscule proeminente (VOINEA MIHAI)
  return extractProminentCapsName(text)
}
