import { decodeCnp, extractCnpFromText, extractPersonNameFromText, isValidCnp } from './cnp'
import { parseEmploymentDocument } from './ocr'

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

const parsed = parseEmploymentDocument(`
Carte de muncă
Nume și prenume: Voinea Mihai
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
