import {
  calculeazaPensie,
  calculeazaPuncteStabilitate,
  defaultAsimilate,
  VPR_2026,
} from './pension'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// Exemplu Digi: 35 ani, 22 pct contributivitate, 1.5 stabilitate? 
// Actually Digi said 22 + 1.5 + 0.5 = 24 → 1944
// For 35 ani at avg salary: punctaj 1 * 35 = 35 contributivitate
// Stabilitate 35 ani: 5*0.5 + 5*0.75 = 2.5+3.75 = 6.25

const stab35 = calculeazaPuncteStabilitate(35)
assert(stab35.puncte === 6.25, `expected 6.25 got ${stab35.puncte}`)

const stab30 = calculeazaPuncteStabilitate(30)
assert(stab30.puncte === 2.5, `expected 2.5 got ${stab30.puncte}`)

const r = calculeazaPensie({
  sex: 'M',
  dataNasterii: '1960-01-01',
  stagiuCotizareAni: 35,
  stagiuCotizareLuni: 0,
  salariuBrutMediu: 8750,
  punctajAnualMediu: null,
  asimilate: defaultAsimilate(),
  salariuMediuEconomie: 8750,
  vpr: VPR_2026,
})

// 35 + 6.25 = 41.25 * 81 = 3341.25
assert(r.puncteContributivitate === 35, `contrib ${r.puncteContributivitate}`)
assert(r.puncteStabilitate === 6.25, `stab ${r.puncteStabilitate}`)
assert(r.totalPuncte === 41.25, `total ${r.totalPuncte}`)
assert(r.pensieBruta === 3341.25, `pensie ${r.pensieBruta}`)
assert(r.eligibilComplet === true, 'should be complete')

const withAsim = calculeazaPensie({
  sex: 'F',
  dataNasterii: '1965-06-01',
  stagiuCotizareAni: 22,
  stagiuCotizareLuni: 0,
  salariuBrutMediu: 8750,
  punctajAnualMediu: 1,
  asimilate: { ...defaultAsimilate(), studiiUniversitareAni: 4 },
  salariuMediuEconomie: 8750,
  vpr: VPR_2026,
})
assert(withAsim.puncteAsimilate === 1, `asim ${withAsim.puncteAsimilate}`)
assert(withAsim.eligibilMinim === true, 'min ok')
assert(withAsim.eligibilComplet === false, 'not complete')

console.log('Toate testele de calcul au trecut.')
