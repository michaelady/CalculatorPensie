import {
  detectDeviceTier,
  getPdfOcrSettings,
  shouldSkipOcrForEmbeddedText,
} from './ocrSettings'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const low = getPdfOcrSettings('low')
assert(low.maxPages === 8, `low maxPages ${low.maxPages}`)
assert(low.renderScale < 1.5, `low scale ${low.renderScale}`)
assert(low.maxCanvasEdge <= 1280, `low edge ${low.maxCanvasEdge}`)
assert(low.tesseractLang === 'ron', `low lang ${low.tesseractLang}`)

const mid = getPdfOcrSettings('mid')
assert(mid.maxPages === 12, `mid maxPages ${mid.maxPages}`)
assert(mid.renderScale >= 1.5 && mid.renderScale < 2, `mid scale ${mid.renderScale}`)

const high = getPdfOcrSettings('high')
assert(high.maxPages === 20, `high maxPages ${high.maxPages}`)
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
