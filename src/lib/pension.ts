/** Constante și calcul pensie publică RO — Legea 360/2023 (estimare 2026) */

export const VPR_2026 = 81 // lei — valoarea punctului de referință
export const SALARIU_MEDIU_BRUT_2026 = 8750 // lei — referință orientativă
export const STAGIU_MINIM_ANI = 15
export const STAGIU_COMPLET_ANI = 35
export const PUNCTE_ASIMILATE_PE_AN = 0.25

export type Sex = 'M' | 'F'

export interface AsimilateInput {
  studiiUniversitareAni: number
  serviciuMilitarLuni: number
  somajLuni: number
  concediuCrestereCopilLuni: number
}

export interface PensionInput {
  sex: Sex
  dataNasterii: string // YYYY-MM-DD
  stagiuCotizareAni: number
  stagiuCotizareLuni: number
  /** Salariu brut mediu pe carieră (lei) — folosit dacă nu există punctaj mediu */
  salariuBrutMediu: number
  /** Punctaj anual mediu (opțional); dacă e setat, are prioritate */
  punctajAnualMediu?: number | null
  asimilate: AsimilateInput
  /** Salariu mediu brut pe economie folosit la estimare */
  salariuMediuEconomie: number
  vpr: number
}

export interface PensionResult {
  puncteContributivitate: number
  puncteStabilitate: number
  puncteAsimilate: number
  totalPuncte: number
  pensieBruta: number
  pensieNeta: number
  cass: number
  impozit: number
  stagiuTotalAni: number
  stagiuContributivAni: number
  varstaActuala: number
  varstaPensionareStandard: number
  aniPanaLaPensie: number
  eligibilMinim: boolean
  eligibilComplet: boolean
  detaliiStabilitate: string[]
  detaliiAsimilate: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function aniDinLuni(luni: number): number {
  return luni / 12
}

export function stagiuInAni(ani: number, luni: number): number {
  return ani + luni / 12
}

/** Vârsta standard de pensionare (aprox. 2026+): bărbați 65; femei ~62.5 crescând spre 65 */
export function varstaPensionareStandard(sex: Sex, anReferinta = 2026): number {
  if (sex === 'M') return 65
  // Femei: 62 ani + 6 luni în 2026, +2 luni/an până la 65 în 2035
  const aniDupa2026 = Math.max(0, anReferinta - 2026)
  const luniExtra = Math.min(30, aniDupa2026 * 2) // până la +30 luni = 65
  return 62.5 + luniExtra / 12
}

export function calculeazaVarsta(dataNasterii: string, laData = new Date()): number {
  const d = new Date(dataNasterii)
  if (Number.isNaN(d.getTime())) return 0
  let varsta = laData.getFullYear() - d.getFullYear()
  const m = laData.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && laData.getDate() < d.getDate())) varsta -= 1
  return varsta
}

/** Puncte de stabilitate pentru stagiu contributiv peste 25 ani */
export function calculeazaPuncteStabilitate(stagiuContributivAni: number): {
  puncte: number
  detalii: string[]
} {
  const detalii: string[] = []
  let puncte = 0
  if (stagiuContributivAni <= 25) {
    detalii.push('Sub 25 ani contributivi — fără puncte de stabilitate')
    return { puncte: 0, detalii }
  }

  const peste25 = Math.min(5, stagiuContributivAni - 25)
  const p25 = peste25 * 0.5
  puncte += p25
  detalii.push(`${formatAni(peste25)} între 25–30 ani × 0,50 = ${formatNr(p25)} pct`)

  if (stagiuContributivAni > 30) {
    const peste30 = Math.min(5, stagiuContributivAni - 30)
    const p30 = peste30 * 0.75
    puncte += p30
    detalii.push(`${formatAni(peste30)} între 30–35 ani × 0,75 = ${formatNr(p30)} pct`)
  }

  if (stagiuContributivAni > 35) {
    const peste35 = stagiuContributivAni - 35
    const p35 = peste35 * 1
    puncte += p35
    detalii.push(`${formatAni(peste35)} peste 35 ani × 1,00 = ${formatNr(p35)} pct`)
  }

  return { puncte: round2(puncte), detalii }
}

function formatAni(ani: number): string {
  const a = Math.floor(ani)
  const luni = Math.round((ani - a) * 12)
  if (luni === 0) return `${a} ani`
  if (a === 0) return `${luni} luni`
  return `${a} ani și ${luni} luni`
}

export function formatNr(n: number, decimals = 2): string {
  return n.toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatLei(n: number): string {
  return `${formatNr(n, 0)} lei`
}

function totalAsimilateAni(a: AsimilateInput): {
  totalAni: number
  detalii: string[]
} {
  const detalii: string[] = []
  let totalAni = 0

  if (a.studiiUniversitareAni > 0) {
    totalAni += a.studiiUniversitareAni
    detalii.push(
      `Studii universitare: ${formatAni(a.studiiUniversitareAni)} → ${formatNr(a.studiiUniversitareAni * PUNCTE_ASIMILATE_PE_AN)} pct`,
    )
  }
  if (a.serviciuMilitarLuni > 0) {
    const ani = aniDinLuni(a.serviciuMilitarLuni)
    totalAni += ani
    detalii.push(
      `Serviciu militar: ${a.serviciuMilitarLuni} luni → ${formatNr(ani * PUNCTE_ASIMILATE_PE_AN)} pct`,
    )
  }
  if (a.somajLuni > 0) {
    const ani = aniDinLuni(a.somajLuni)
    totalAni += ani
    detalii.push(`Șomaj: ${a.somajLuni} luni → ${formatNr(ani * PUNCTE_ASIMILATE_PE_AN)} pct`)
  }
  if (a.concediuCrestereCopilLuni > 0) {
    const ani = aniDinLuni(a.concediuCrestereCopilLuni)
    totalAni += ani
    detalii.push(
      `Concediu creștere copil: ${a.concediuCrestereCopilLuni} luni → ${formatNr(ani * PUNCTE_ASIMILATE_PE_AN)} pct`,
    )
  }

  if (detalii.length === 0) {
    detalii.push('Nicio perioadă asimilată introdusă')
  }

  return { totalAni, detalii }
}

/** CASS 10% pe ce depășește 4000 lei; impozit 10% pe ce depășește 3000 lei (după CASS) — estimare */
export function calculeazaPensieNeta(pensieBruta: number): {
  neta: number
  cass: number
  impozit: number
} {
  const cass = pensieBruta > 4000 ? round2((pensieBruta - 4000) * 0.1) : 0
  const bazaImpozit = pensieBruta - cass
  const impozit = bazaImpozit > 3000 ? round2((bazaImpozit - 3000) * 0.1) : 0
  return { neta: round2(pensieBruta - cass - impozit), cass, impozit }
}

export function calculeazaPensie(input: PensionInput): PensionResult {
  const stagiuContributivAni = stagiuInAni(
    input.stagiuCotizareAni,
    input.stagiuCotizareLuni,
  )

  const punctajAnual =
    input.punctajAnualMediu != null && input.punctajAnualMediu > 0
      ? input.punctajAnualMediu
      : input.salariuMediuEconomie > 0
        ? input.salariuBrutMediu / input.salariuMediuEconomie
        : 0

  const puncteContributivitate = round2(punctajAnual * stagiuContributivAni)
  const { puncte: puncteStabilitate, detalii: detaliiStabilitate } =
    calculeazaPuncteStabilitate(stagiuContributivAni)

  const { totalAni: aniAsimilate, detalii: detaliiAsimilate } = totalAsimilateAni(
    input.asimilate,
  )
  const puncteAsimilate = round2(aniAsimilate * PUNCTE_ASIMILATE_PE_AN)

  const totalPuncte = round2(
    puncteContributivitate + puncteStabilitate + puncteAsimilate,
  )
  const pensieBruta = round2(totalPuncte * input.vpr)
  const { neta, cass, impozit } = calculeazaPensieNeta(pensieBruta)

  const varstaActuala = calculeazaVarsta(input.dataNasterii)
  const varstaPensionare = varstaPensionareStandard(input.sex)
  const aniPanaLaPensie = Math.max(0, round2(varstaPensionare - varstaActuala))

  return {
    puncteContributivitate,
    puncteStabilitate,
    puncteAsimilate,
    totalPuncte,
    pensieBruta,
    pensieNeta: neta,
    cass,
    impozit,
    stagiuTotalAni: round2(stagiuContributivAni + aniAsimilate),
    stagiuContributivAni: round2(stagiuContributivAni),
    varstaActuala,
    varstaPensionareStandard: round2(varstaPensionare),
    aniPanaLaPensie,
    eligibilMinim: stagiuContributivAni >= STAGIU_MINIM_ANI,
    eligibilComplet: stagiuContributivAni >= STAGIU_COMPLET_ANI,
    detaliiStabilitate,
    detaliiAsimilate,
  }
}

export const defaultAsimilate = (): AsimilateInput => ({
  studiiUniversitareAni: 0,
  serviciuMilitarLuni: 0,
  somajLuni: 0,
  concediuCrestereCopilLuni: 0,
})
