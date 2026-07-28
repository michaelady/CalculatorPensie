import { createWorker } from 'tesseract.js'

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
  indiciiGasiti: string[]
  avertismente: string[]
}

export async function runOcr(
  file: File | Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  // Worker nou per apel ca să primim progress corect
  const worker = await createWorker('ron+eng', 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        const statusMap: Record<string, string> = {
          loading_tesseract_core: 'Se încarcă motorul OCR…',
          initializing_api: 'Inițializare…',
          loading_language: 'Se încarcă limba română…',
          initializing_tesseract: 'Pregătire Tesseract…',
          recognizing_text: 'Se citește documentul…',
        }
        onProgress({
          status: statusMap[String(m.status)] ?? String(m.status ?? 'Procesare…'),
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
 * Extrage din text OCR indicii despre angajări, stagiu și salarii.
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

  return {
    text,
    angajari,
    stagiuEstimatAni,
    stagiuEstimatLuni,
    salariuMediuEstimat,
    indiciiGasiti,
    avertismente,
  }
}
