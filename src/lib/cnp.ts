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
  else century = 1900

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
  'str',
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
  'prenumei',
  'prenumele',
  'locul',
  'munca',
  'muncă',
  'eliberat',
  'eliberata',
  'carte',
  'carnet',
  'legea',
  'com',
  'comuna',
  'oras',
  'oraș',
  'lun',
  'luna',
  'eee',
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
  'transcriere',
  'nopics',
  'pagina',
  'pagini',
  'scanat',
  'scanata',
  'copie',
  'final',
  'original',
  'document',
  'adeverinta',
  'adeverință',
])

/** Corecții tipice OCR → nume românești (inclusiv stilou pe carnet). */
const OCR_NAME_FIXES: Record<string, string> = {
  oinea: 'VOINEA',
  '0inea': 'VOINEA',
  voinea: 'VOINEA',
  v0inea: 'VOINEA',
  vo1nea: 'VOINEA',
  mihai: 'MIHAI',
  m1hai: 'MIHAI',
  miha1: 'MIHAI',
  mhiai: 'MIHAI',
}

const NUME_PRENUME_LABEL =
  'nume(?:le)?\\s*(?:[sșş][iìí]|si|&|\\+|s[,.]?i|[^\\n]{0,4})\\s*prenu?m(?:e|ele|ei|i)?'

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

export function sanitizeOcrNameToken(token: string): string {
  let t = token.replace(/0/g, 'O').replace(/^rn/i, 'M')
  // 1 în mijlocul/sfârșitul cuvântului → I (nu la început: 15)
  t = t.replace(/([A-Za-zĂÂÎȘȚăâîșț])1/g, '$1I')
  const fix = OCR_NAME_FIXES[t.toLowerCase()]
  if (fix) return fix
  // OiNEA / OINEA / 0INEA → VOINEA (OCR lipește V de etichetă)
  if (/^[o0]?i?nea$/i.test(t) || /^oine[aă]$/i.test(t) || /^[o0]inea$/i.test(t)) {
    return 'VOINEA'
  }
  return t.toUpperCase()
}

/** Respinge „Lun Eee”, tokeni prea scurți, triplete de litere etc. */
export function looksLikePersonName(raw: string): boolean {
  const parts = raw
    .trim()
    .replace(/[ \t]+/g, ' ')
    .split(' ')
    .filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return false
  if (parts.some((p) => NAME_STOP.has(p.toLowerCase()))) return false
  if (parts.some((p) => /\d/.test(p))) return false
  // minim 3 litere / token (blochează Lun/Eee de 3 dar cu repetări)
  if (parts.some((p) => p.length < 3)) return false
  // cel puțin un token ≥ 4 (numele de familie)
  if (!parts.some((p) => p.length >= 4)) return false
  // triplete identice (Eee, Aaa)
  if (parts.some((p) => /(.)\1\1/i.test(p))) return false
  // prea puține vocale / doar consoane ciudate
  for (const p of parts) {
    const vowels = (p.match(/[aeiouăâî]/gi) ?? []).length
    if (vowels === 0 || vowels / p.length > 0.75) return false
  }
  return parts.every((p) => /^[A-ZĂÂÎȘȚa-zăâîșț'’-]+$/u.test(p))
}

function cleanupCapturedName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/[.|·•_/\\]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split(' ')
    .map(sanitizeOcrNameToken)
    .filter((p) => p.length >= 3 && !NAME_STOP.has(p.toLowerCase()))
    .join(' ')
  if (!looksLikePersonName(cleaned)) return null
  return titleCaseName(cleaned)
}

/**
 * Desparte eticheta lipită de nume: „preniviOiNEA MIHAI” → „OiNEA MIHAI”.
 */
export function splitGluedHandwrittenName(fragment: string): string | null {
  // tranziție lower→Upper în mijlocul cuvântului
  const camel = fragment.match(
    /[a-zăâîșț]([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]*(?:[ \t]+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]*){1,3})/,
  )
  if (camel) {
    const hit = cleanupCapturedName(camel[1])
    if (hit) return hit
  }

  // secvență majuscule / almost-caps după resturi de etichetă
  const caps = fragment.match(
    /\b([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]{2,}(?:[ \t]+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]{2,}){1,3})\b/,
  )
  if (caps) {
    const hit = cleanupCapturedName(caps[1])
    if (hit) return hit
  }

  return cleanupCapturedName(fragment)
}

const FILENAME_STOP =
  /^(carte|carnet|munca|muncă|de|scan|foto|img|image|pdf|document|revisal|extras|transcriere|nopics|copie|copy|final|original|text|tabele|poze|pics|hand|scris)$/i

/**
 * Extrage nume din numele fișierului: Carte_Munca_Voinea_Mihai (1).pdf
 * Preferă tokenii de imediat după „carte/munca”, nu sufixe tip „transcriere_nopics”.
 */
export function extractPersonNameFromFilename(filename: string): string | null {
  const base = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const rawTokens = base.split(' ').map((t) => t.trim()).filter(Boolean)

  // Carte_Munca_Voinea_Mihai_transcriere… → ia Voinea Mihai (după munca)
  const muncaIdx = rawTokens.findIndex((t) => /^(munca|muncă|carnet)$/i.test(t))
  if (muncaIdx >= 0) {
    const after = rawTokens.slice(muncaIdx + 1).filter((t) => !FILENAME_STOP.test(t))
    for (let n = Math.min(3, after.length); n >= 2; n--) {
      const hit = cleanupCapturedName(after.slice(0, n).join(' '))
      if (hit) return hit
    }
  }

  const tokens = rawTokens.filter((t) => !FILENAME_STOP.test(t))
  if (tokens.length < 2) return null
  for (let n = Math.min(3, tokens.length); n >= 2; n--) {
    const candidate = tokens.slice(0, n).join(' ')
    const hit = cleanupCapturedName(candidate)
    if (hit) return hit
  }
  return null
}

/** Titular: / CI: / Carte de muncă — Nume */
function extractLabeledIdentityName(text: string): string | null {
  const patterns = [
    /(?:titular(?:ul)?|beneficiar(?:ul)?)\s*[:—-]?\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+){1,3})/i,
    /\bCI\s*[:—-]\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+){1,3})/i,
    /carte\s+de\s+munc[aă]\s*[—–:-]\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț-]+){1,3})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (!m) continue
    // taie la virgulă / „fiul”
    const raw = m[1].split(/,|\bfiul\b|\bfiica\b/i)[0]
    const hit = cleanupCapturedName(raw)
    if (hit) return hit
  }
  return null
}

function extractNameAfterCarnetLabel(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const hasLabel =
      new RegExp(NUME_PRENUME_LABEL, 'i').test(line) ||
      /nume(?:le)?\s*.{0,8}\s*prenu/i.test(line)
    if (!hasLabel) continue

    // Scoate eticheta (chiar fragmentată) și încearcă deslipirea
    const after = line
      .replace(new RegExp(`^.*?${NUME_PRENUME_LABEL}`, 'i'), ' ')
      .replace(/^.*?nume(?:le)?\s*.{0,8}\s*prenu[a-zăâîșț]*/i, ' ')
      .trim()

    const glued = splitGluedHandwrittenName(after || line)
    if (glued) return glued

    // pe același rând, caută direct VOINEA MIHAI-like chiar lipit
    const inline = splitGluedHandwrittenName(line)
    if (inline) return inline

    for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
      const next = lines[j].replace(/^[:.\-–—_\s·•]+/, '').replace(/[.]{2,}/g, ' ').trim()
      if (/data\s*na[sș]/i.test(next) || /locul\s*na/i.test(next)) break
      const hit = splitGluedHandwrittenName(next)
      if (hit) return hit
    }
  }

  return null
}

function scoreNameCandidate(name: string, context: 'label' | 'filename' | 'caps' | 'other'): number {
  let score = 0
  const parts = name.split(' ')
  if (parts.length === 2) score += 4
  if (parts.length === 3) score += 2
  if (parts.some((p) => p.length >= 5)) score += 2
  if (parts.every((p) => p === p.toUpperCase() || /^[A-ZĂÂÎȘȚ][a-zăâîșț]+$/.test(p))) score += 1
  if (context === 'label') score += 8
  if (context === 'filename') score += 6
  if (context === 'caps') score += 2
  // penalizează tokeni foarte scurți
  score -= parts.filter((p) => p.length <= 3).length
  return score
}

function extractProminentCapsName(text: string): string | null {
  const candidates: { name: string; score: number }[] = []
  for (const m of text.matchAll(
    /\b([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]{2,}(?:[ \t]+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț0-9]{2,}){1,3})\b/g,
  )) {
    const hit = cleanupCapturedName(m[1])
    if (hit) candidates.push({ name: hit, score: scoreNameCandidate(hit, 'caps') })
  }
  // și variante lipite pe linii cu etichete
  for (const line of text.split(/\r?\n/)) {
    if (/nume|prenu/i.test(line)) {
      const hit = splitGluedHandwrittenName(line)
      if (hit) candidates.push({ name: hit, score: scoreNameCandidate(hit, 'label') })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.name ?? null
}

export interface NameExtractOptions {
  /** Nume fișier încărcat — ex. Carte_Munca_Voinea_Mihai.pdf */
  filename?: string
}

/** Extrage numele persoanei din text OCR (+ opțional din numele fișierului). */
export function extractPersonNameFromText(
  text: string,
  options: NameExtractOptions = {},
): string | null {
  const candidates: { name: string; score: number }[] = []

  const fromIdentity = extractLabeledIdentityName(text)
  if (fromIdentity) {
    candidates.push({ name: fromIdentity, score: scoreNameCandidate(fromIdentity, 'label') + 4 })
  }

  const fromCarnet = extractNameAfterCarnetLabel(text)
  if (fromCarnet) candidates.push({ name: fromCarnet, score: scoreNameCandidate(fromCarnet, 'label') })

  if (options.filename) {
    const fromFile = extractPersonNameFromFilename(options.filename)
    if (fromFile) candidates.push({ name: fromFile, score: scoreNameCandidate(fromFile, 'filename') })
  }

  const fromCaps = extractProminentCapsName(text)
  if (fromCaps) candidates.push({ name: fromCaps, score: scoreNameCandidate(fromCaps, 'caps') })

  for (const m of text.matchAll(/\b([A-Z0-9ĂÂÎȘȚ]{4,})\s+([A-ZĂÂÎȘȚ]{3,})\b/g)) {
    const hit = cleanupCapturedName(`${m[1]} ${m[2]}`)
    if (hit) candidates.push({ name: hit, score: scoreNameCandidate(hit, 'other') })
  }

  candidates.sort((a, b) => b.score - a.score)
  if (candidates.length === 0) return null

  const best = candidates[0]
  if (best.score >= 4) return best.name

  return null
}
