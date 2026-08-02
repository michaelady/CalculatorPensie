import {
  detectDeviceTier,
  getPdfOcrSettings,
  MAX_PDF_PAGES,
  shouldSkipOcrForEmbeddedText,
} from './ocrSettings'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const low = getPdfOcrSettings('low')
assert(low.maxPages === MAX_PDF_PAGES, `low maxPages must be ${MAX_PDF_PAGES}, got ${low.maxPages}`)
assert(low.chunkPages < low.maxPages, `low chunkPages ${low.chunkPages}`)
assert(low.chunkPages === 4, `low chunkPages ${low.chunkPages}`)
assert(low.renderScale < 1.5, `low scale ${low.renderScale}`)
assert(low.lowMemory === true, 'low should be lowMemory')
assert(low.tesseractLang === 'ron', `low lang ${low.tesseractLang}`)

const mid = getPdfOcrSettings('mid')
assert(mid.maxPages === MAX_PDF_PAGES, `mid maxPages ${mid.maxPages}`)
assert(mid.chunkPages === 8, `mid chunkPages ${mid.chunkPages}`)
assert(mid.renderScale >= 1.5 && mid.renderScale < 2, `mid scale ${mid.renderScale}`)

const high = getPdfOcrSettings('high')
assert(high.maxPages === MAX_PDF_PAGES, `high maxPages ${high.maxPages}`)
assert(high.chunkPages === MAX_PDF_PAGES, `high chunkPages ${high.chunkPages}`)
assert(high.renderScale >= 2, `high scale ${high.renderScale}`)
assert(high.tesseractLang.includes('ron'), 'high includes ron')

assert(
  shouldSkipOcrForEmbeddedText(
    'Angajat la S.C. Exemplu SRL din 01.03.2010 pana in 15.08.2020 salariu 4500 lei vechime document oficial CNPP stagiu cotizare',
    low,
  ),
  'should skip OCR for rich embedded text',
)

assert(
  !shouldSkipOcrForEmbeddedText('scan pagina', low),
  'should not skip OCR for short text',
)

const tier = detectDeviceTier()
assert(tier === 'low' || tier === 'mid' || tier === 'high', `tier ${tier}`)

console.log('ocrSettings.selftest: OK')
