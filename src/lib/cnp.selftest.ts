import {
  decodeCnp,
  extractCnpFromText,
  extractPersonNameFromFilename,
  extractPersonNameFromText,
  isValidCnp,
  looksLikePersonName,
  splitGluedHandwrittenName,
} from './cnp'
import { parseEmploymentDocument } from './ocr'
import { looksLikeHandwrittenForm } from './imagePreprocess'
import { shouldSkipOcrForEmbeddedText, getPdfOcrSettings } from './ocrSettings'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const SAMPLE = '1700115400016'
assert(isValidCnp(SAMPLE), 'sample CNP should be valid')
assert(decodeCnp(SAMPLE)?.dataNasterii === '1970-01-15', 'dob from CNP')

// Respinge falsul pozitiv raportat de utilizator
assert(!looksLikePersonName('Lun Eee'), 'reject Lun Eee')
assert(!looksLikePersonName('Lun Eee'), 'reject Lun Eee again')
assert(extractPersonNameFromText('Data naşterii\nLun Eee\n15 IAN 1970') == null, 'no Lun Eee extract')

// Output REAL de la tesseract pe fixture-ul carnet (psm 6)
const TESS_REAL = `CARNEI DE MUNCA
(legea nr. 3 / 1950)
Numele şi preniviOiNEA MIHAI
Data naşterii 15 IAN 1970
Locul naşterii COM. VALEA MARE
Domiciliul STR. LALELELOR NR. 12
Locul de muncă S.C. EXEMPLU SRL`

assert(
  splitGluedHandwrittenName('preniviOiNEA MIHAI') === 'Voinea Mihai',
  `split glued: ${splitGluedHandwrittenName('preniviOiNEA MIHAI')}`,
)

const fromTess = extractPersonNameFromText(TESS_REAL)
assert(fromTess === 'Voinea Mihai', `from real tesseract output: ${fromTess}`)

assert(
  extractPersonNameFromFilename('Carte_Munca_Voinea_Mihai (1).pdf') === 'Voinea Mihai',
  'filename hint',
)

// Chiar dacă OCR dă gunoi, filename salvează situația
const garbage = extractPersonNameFromText('Lun Eee\nData nasterii 15 IAN', {
  filename: 'Carte_Munca_Voinea_Mihai.pdf',
})
assert(garbage === 'Voinea Mihai', `filename overrides garbage: ${garbage}`)

const parsed = parseEmploymentDocument(TESS_REAL, {
  filenames: ['Carte_Munca_Voinea_Mihai (1).pdf'],
})
assert(parsed.nume === 'Voinea Mihai', `parsed nume ${parsed.nume}`)

assert(looksLikeHandwrittenForm(TESS_REAL), 'detect form')
assert(
  !shouldSkipOcrForEmbeddedText(
    'Numele şi prenumele Data naşterii Locul naşterii Domiciliul',
    getPdfOcrSettings('high'),
  ),
  'no skip on form',
)

assert(extractCnpFromText(`CNP: ${SAMPLE}`)?.cnp === SAMPLE, 'cnp label')

console.log('cnp.selftest: OK — VOINEA MIHAI extras din output OCR real')
