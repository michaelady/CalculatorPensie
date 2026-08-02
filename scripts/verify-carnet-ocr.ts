import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { extractPersonNameFromText, splitGluedHandwrittenName } from '../src/lib/cnp'
import { parseEmploymentDocument } from '../src/lib/ocr'

const img = resolve('testdata/carnet_voinea_mihai.png')
const ocrText = execFileSync('tesseract', [img, 'stdout', '-l', 'ron', '--psm', '6'], {
  encoding: 'utf8',
})

console.log('--- OCR tesseract ---')
console.log(ocrText)
console.log('glued:', splitGluedHandwrittenName('preniviOiNEA MIHAI'))
console.log('extract:', extractPersonNameFromText(ocrText))

const parsed = parseEmploymentDocument(ocrText, {
  filenames: ['Carte_Munca_Voinea_Mihai (1).pdf'],
})
console.log('NUME PARSAT:', parsed.nume)

if (parsed.nume !== 'Voinea Mihai') {
  // fără filename — trebuie totuși să meargă din OCR lipit
  const onlyOcr = parseEmploymentDocument(ocrText)
  console.log('fără filename:', onlyOcr.nume)
  if (onlyOcr.nume !== 'Voinea Mihai') {
    process.exit(1)
  }
}

console.log('VERIFY OK: VOINEA MIHAI')
