import { useMemo, useState } from 'react'
import { DocumentUpload } from './components/DocumentUpload'
import { NumberField, SelectField, TextField } from './components/Fields'
import { Results } from './components/Results'
import type { OcrExtraction } from './lib/ocr'
import {
  calculeazaPensie,
  defaultAsimilate,
  SALARIU_MEDIU_BRUT_2026,
  VPR_2026,
  type PensionInput,
  type Sex,
} from './lib/pension'
import './App.css'

const initial: PensionInput = {
  sex: 'M',
  dataNasterii: '1970-01-15',
  stagiuCotizareAni: 30,
  stagiuCotizareLuni: 0,
  salariuBrutMediu: 7000,
  punctajAnualMediu: null,
  asimilate: defaultAsimilate(),
  salariuMediuEconomie: SALARIU_MEDIU_BRUT_2026,
  vpr: VPR_2026,
}

export default function App() {
  const [form, setForm] = useState<PensionInput>(initial)
  const [usePunctaj, setUsePunctaj] = useState(false)
  const [ocrNotes, setOcrNotes] = useState<OcrExtraction | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const result = useMemo(() => {
    const input: PensionInput = {
      ...form,
      punctajAnualMediu: usePunctaj ? form.punctajAnualMediu : null,
    }
    return calculeazaPensie(input)
  }, [form, usePunctaj])

  const patch = <K extends keyof PensionInput>(key: K, value: PensionInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSubmitted(true)
  }

  const patchAsimilate = (key: keyof PensionInput['asimilate'], value: number) => {
    setForm((f) => ({
      ...f,
      asimilate: { ...f.asimilate, [key]: value },
    }))
    setSubmitted(true)
  }

  const applyOcr = (data: OcrExtraction) => {
    setOcrNotes(data)
    setForm((f) => ({
      ...f,
      stagiuCotizareAni:
        data.stagiuEstimatAni > 0 ? data.stagiuEstimatAni : f.stagiuCotizareAni,
      stagiuCotizareLuni:
        data.stagiuEstimatAni > 0 || data.stagiuEstimatLuni > 0
          ? data.stagiuEstimatLuni
          : f.stagiuCotizareLuni,
      salariuBrutMediu: data.salariuMediuEstimat ?? f.salariuBrutMediu,
    }))
    setSubmitted(true)
  }

  return (
    <div className="page">
      <div className="bg-atmosphere" aria-hidden="true" />

      <header className="hero">
        <p className="brand">PensieRO</p>
        <h1>Estimează pensia din sistemul public</h1>
        <p className="hero-lead">
          Introdu stagiul, veniturile și perioadele asimilate — sau scanează cartea de muncă.
          Calculul urmează Legea 360/2023 (VPR {VPR_2026} lei în 2026).
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#calculator">
            Completează datele
          </a>
          <a className="btn btn-ghost" href="#ocr">
            Încarcă document
          </a>
        </div>
      </header>

      <main id="calculator" className="main">
        <section className="panel form-panel" aria-labelledby="date-title">
          <div className="panel-head">
            <h2 id="date-title">Datele tale</h2>
            <p>Toate câmpurile influențează estimarea. Valorile pot fi ajustate oricând.</p>
          </div>

          <div className="form-grid">
            <SelectField
              label="Sex"
              value={form.sex}
              onChange={(v) => patch('sex', v as Sex)}
              options={[
                { value: 'M', label: 'Bărbat' },
                { value: 'F', label: 'Femeie' },
              ]}
              hint="Determină vârsta standard de pensionare"
            />

            <TextField
              label="Data nașterii"
              type="date"
              value={form.dataNasterii}
              onChange={(v) => patch('dataNasterii', v)}
            />

            <NumberField
              label="Stagiu de cotizare — ani"
              value={form.stagiuCotizareAni}
              min={0}
              max={55}
              onChange={(v) => patch('stagiuCotizareAni', v)}
              hint="Ani efectiv cotizați (contributivi)"
              suffix="ani"
            />

            <NumberField
              label="Stagiu de cotizare — luni"
              value={form.stagiuCotizareLuni}
              min={0}
              max={11}
              onChange={(v) => patch('stagiuCotizareLuni', Math.min(11, Math.max(0, v)))}
              hint="Luni în plus față de ani"
              suffix="luni"
            />
          </div>

          <div className="toggle-row">
            <button
              type="button"
              className={`chip ${!usePunctaj ? 'active' : ''}`}
              onClick={() => setUsePunctaj(false)}
            >
              După salariu brut mediu
            </button>
            <button
              type="button"
              className={`chip ${usePunctaj ? 'active' : ''}`}
              onClick={() => setUsePunctaj(true)}
            >
              După punctaj anual mediu
            </button>
          </div>

          <div className="form-grid">
            {!usePunctaj ? (
              <NumberField
                label="Salariu brut mediu pe carieră"
                value={form.salariuBrutMediu}
                min={0}
                step={100}
                onChange={(v) => patch('salariuBrutMediu', v)}
                hint="Media veniturilor brute pe care s-au plătit contribuții"
                suffix="lei"
              />
            ) : (
              <NumberField
                label="Punctaj anual mediu"
                value={form.punctajAnualMediu ?? 1}
                min={0}
                step={0.01}
                onChange={(v) => patch('punctajAnualMediu', v)}
                hint="1,00 = salariu egal cu media pe economie în acel an"
                suffix="pct/an"
              />
            )}

            <NumberField
              label="Salariu mediu brut pe economie (referință)"
              value={form.salariuMediuEconomie}
              min={1000}
              step={50}
              onChange={(v) => patch('salariuMediuEconomie', v)}
              hint={`Implicit ${SALARIU_MEDIU_BRUT_2026.toLocaleString('ro-RO')} lei (orientativ 2026)`}
              suffix="lei"
            />

            <NumberField
              label="Valoarea punctului de referință (VPR)"
              value={form.vpr}
              min={1}
              step={1}
              onChange={(v) => patch('vpr', v)}
              hint={`Implicit ${VPR_2026} lei în 2026`}
              suffix="lei"
            />
          </div>
        </section>

        <section className="panel form-panel" aria-labelledby="asimilate-title">
          <div className="panel-head">
            <h2 id="asimilate-title">Perioade asimilate</h2>
            <p>
              Facultate la zi, armată, șomaj, concediu creștere copil — în general 0,25 puncte pe
              an.
            </p>
          </div>

          <div className="form-grid">
            <NumberField
              label="Studii universitare (la zi)"
              value={form.asimilate.studiiUniversitareAni}
              min={0}
              max={10}
              step={0.5}
              onChange={(v) => patchAsimilate('studiiUniversitareAni', v)}
              suffix="ani"
            />
            <NumberField
              label="Serviciu militar"
              value={form.asimilate.serviciuMilitarLuni}
              min={0}
              max={36}
              onChange={(v) => patchAsimilate('serviciuMilitarLuni', v)}
              suffix="luni"
            />
            <NumberField
              label="Șomaj indemnizat"
              value={form.asimilate.somajLuni}
              min={0}
              max={120}
              onChange={(v) => patchAsimilate('somajLuni', v)}
              suffix="luni"
            />
            <NumberField
              label="Concediu creștere copil"
              value={form.asimilate.concediuCrestereCopilLuni}
              min={0}
              max={72}
              onChange={(v) => patchAsimilate('concediuCrestereCopilLuni', v)}
              suffix="luni"
            />
          </div>
        </section>

        <div id="ocr">
          <DocumentUpload onExtracted={applyOcr} />
        </div>

        {ocrNotes ? (
          <section className="panel ocr-notes" aria-labelledby="ocr-notes-title">
            <div className="panel-head">
              <h2 id="ocr-notes-title">Rezultat scanare</h2>
              <p>Am completat formularul cu valorile detectate. Verifică și corectează.</p>
            </div>
            {ocrNotes.indiciiGasiti.length > 0 ? (
              <ul className="note-list ok">
                {ocrNotes.indiciiGasiti.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {ocrNotes.avertismente.length > 0 ? (
              <ul className="note-list warn">
                {ocrNotes.avertismente.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {ocrNotes.angajari.length > 0 ? (
              <div className="jobs-table-wrap">
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>Început</th>
                      <th>Sfârșit</th>
                      <th>Angajator / linie</th>
                      <th>Salariu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocrNotes.angajari.slice(0, 12).map((a, i) => (
                      <tr key={`${a.rawLine}-${i}`}>
                        <td>{a.dataInceput ?? '—'}</td>
                        <td>{a.dataSfarsit ?? '—'}</td>
                        <td>{a.angajator ?? a.rawLine.slice(0, 80)}</td>
                        <td>
                          {a.salariu != null
                            ? `${a.salariu.toLocaleString('ro-RO')} lei`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {submitted ? <Results result={result} vpr={form.vpr} /> : null}

        {!submitted ? (
          <div className="calc-prompt">
            <button type="button" className="btn btn-primary" onClick={() => setSubmitted(true)}>
              Calculează pensia estimată
            </button>
          </div>
        ) : (
          <div className="calc-prompt sticky-result-hint">
            <p>Rezultatul se actualizează pe măsură ce modifici datele.</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          <strong>PensieRO</strong> — instrument informativ. Nu înlocuiește decizia CNPP. Stagiul
          minim: 15 ani · stagiul complet: 35 ani · puncte stabilitate peste 25 ani contributivi.
        </p>
      </footer>
    </div>
  )
}
