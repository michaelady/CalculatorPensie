import { decodeCnp, extractCnpFromText, extractPersonNameFromText, isValidCnp } from './cnp'
import { parseEmploymentDocument } from './ocr'
import { looksLikeHandwrittenForm } from './imagePreprocess'
import { shouldSkipOcrForEmbeddedText, getPdfOcrSettings } from './ocrSettings'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// CNP valid generat: M, 15.01.1970, jud. 40, seq 001, control 6
const SAMPLE = '1700115400016'
assert(isValidCnp(SAMPLE), 'sample CNP should be valid')
assert(!isValidCnp('1700115400010'), 'wrong control digit')

const decoded = decodeCnp(SAMPLE)
assert(!!decoded, 'decode ok')
assert(decoded!.sex === 'M', `sex ${decoded!.sex}`)
assert(decoded!.dataNasterii === '1970-01-15', `dob ${decoded!.dataNasterii}`)

const fromLabel = extractCnpFromText(`Titular: VOINEA MIHAI\nCNP: ${SAMPLE}\nStagiu 30 ani`)
assert(fromLabel?.cnp === SAMPLE, 'extract labeled CNP')

const name = extractPersonNameFromText(
  'Nume și prenume: Voinea Mihai\nCNP: 1700115400016\nAngajat la S.C. Exemplu SRL',
)
assert(name === 'Voinea Mihai', `name ${name}`)

// Carnet de muncă: etichetă tipărită + nume pe același rând / rândul următor
const carnetSame = extractPersonNameFromText(
  'Numele şi prenumele ........ VOINEA MIHAI\nData naşterii 15 IAN 1970',
)
assert(carnetSame === 'Voinea Mihai', `carnet same line: ${carnetSame}`)

const carnetNext = extractPersonNameFromText(`Numele si prenumele
....................
VOINEA MIHAI
Data nasterii`)
assert(carnetNext === 'Voinea Mihai', `carnet next line: ${carnetNext}`)

const carnetOcrNoise = extractPersonNameFromText(
  'Numele s,i prenumele VOINEA MIHAI\nLocul nasterii',
)
assert(carnetOcrNoise === 'Voinea Mihai', `carnet OCR noise: ${carnetOcrNoise}`)

assert(
  looksLikeHandwrittenForm('Numele şi prenumele\nData naşterii\nLocul de muncă'),
  'should detect carnet form',
)

const settings = getPdfOcrSettings('high')
assert(
  !shouldSkipOcrForEmbeddedText(
    'Numele şi prenumele Data naşterii Locul naşterii Domiciliul Locul de muncă Seria Nr',
    settings,
  ),
  'must NOT skip OCR on carnet form labels',
)

const parsed = parseEmploymentDocument(`
Carte de muncă
Numele şi prenumele VOINEA MIHAI
CNP: 1700115400016
Angajat la S.C. Exemplu SRL din 01.03.2010 pana in 15.08.2020 salariu 4500 lei
Vechime 10 ani 5 luni
`)
assert(parsed.nume === 'Voinea Mihai', `parsed nume ${parsed.nume}`)
assert(parsed.cnp === SAMPLE, `parsed cnp ${parsed.cnp}`)
assert(parsed.sex === 'M', `parsed sex ${parsed.sex}`)
assert(parsed.dataNasterii === '1970-01-15', `parsed dob ${parsed.dataNasterii}`)
assert(parsed.stagiuEstimatAni === 10, `stagiu ani ${parsed.stagiuEstimatAni}`)
assert(parsed.stagiuEstimatLuni === 5, `stagiu luni ${parsed.stagiuEstimatLuni}`)
assert(parsed.salariuMediuEstimat === 4500, `salariu ${parsed.salariuMediuEstimat}`)

console.log('cnp.selftest: OK')
