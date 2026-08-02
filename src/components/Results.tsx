import {
  formatLei,
  formatNr,
  STAGIU_COMPLET_ANI,
  STAGIU_MINIM_ANI,
  type PensionResult,
} from '../lib/pension'

interface ResultsProps {
  result: PensionResult
  vpr: number
}

export function Results({ result, vpr }: ResultsProps) {
  return (
    <section className="panel results-panel" aria-labelledby="rezultat-title">
      <div className="panel-head">
        <h2 id="rezultat-title">Pensia estimată</h2>
        <p>
          Estimare orientativă conform Legii 360/2023. Calculul oficial îl face Casa Națională de
          Pensii Publice.
        </p>
      </div>

      <div className="result-hero">
        <div className="result-amount animate-rise">
          <span className="result-label">Pensie brută estimată</span>
          <strong>{formatLei(result.pensieBruta)}</strong>
          <span className="result-sub">
            net ≈ {formatLei(result.pensieNeta)}
            {result.cass > 0 || result.impozit > 0
              ? ` (CASS ${formatLei(result.cass)}, impozit ${formatLei(result.impozit)})`
              : ''}
          </span>
        </div>
        <div className="result-formula">
          <span>
            {formatNr(result.totalPuncte)} puncte × {formatNr(vpr, 0)} lei VPR
          </span>
        </div>
      </div>

      <ul className="result-badges" aria-label="Eligibilitate">
        <li className={result.eligibilMinim ? 'ok' : 'warn'}>
          {result.eligibilMinim
            ? `Stagiu minim atins (≥ ${STAGIU_MINIM_ANI} ani contributivi)`
            : `Sub stagiul minim (${STAGIU_MINIM_ANI} ani) — pensia pentru limită de vârstă nu e încă eligibilă`}
        </li>
        <li className={result.eligibilComplet ? 'ok' : 'info'}>
          {result.eligibilComplet
            ? `Stagiu complet atins (≥ ${STAGIU_COMPLET_ANI} ani)`
            : `Stagiu complet: ${STAGIU_COMPLET_ANI} ani (acum ${formatNr(result.stagiuContributivAni)} ani contributivi)`}
        </li>
        <li className="info">
          Vârsta actuală ≈ {result.varstaActuala} ani · pensionare standard ≈{' '}
          {formatNr(result.varstaPensionareStandard, 1)} ani
          {result.aniPanaLaPensie > 0
            ? ` · ≈ ${formatNr(result.aniPanaLaPensie, 1)} ani rămași`
            : ' · poți fi aproape de vârsta standard'}
        </li>
      </ul>

      <div className="result-grid">
        <article>
          <h3>Puncte de contributivitate</h3>
          <p className="big">{formatNr(result.puncteContributivitate)}</p>
          <p className="muted">Salariu / media pe economie × ani cotizați</p>
        </article>
        <article>
          <h3>Puncte de stabilitate</h3>
          <p className="big">{formatNr(result.puncteStabilitate)}</p>
          <ul className="tiny-list">
            {result.detaliiStabilitate.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>Puncte perioade asimilate</h3>
          <p className="big">{formatNr(result.puncteAsimilate)}</p>
          <ul className="tiny-list">
            {result.detaliiAsimilate.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>Total puncte</h3>
          <p className="big">{formatNr(result.totalPuncte)}</p>
          <p className="muted">
            Stagiu contributiv {formatNr(result.stagiuContributivAni)} ani · total cu asimilate{' '}
            {formatNr(result.stagiuTotalAni)} ani
          </p>
        </article>
      </div>
    </section>
  )
}
