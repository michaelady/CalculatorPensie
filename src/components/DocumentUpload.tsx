import { useCallback, useRef, useState } from 'react'
import { parseEmploymentDocument, runOcr, type OcrExtraction } from '../lib/ocr'

interface DocumentUploadProps {
  onExtracted: (data: OcrExtraction) => void
}

export function DocumentUpload({ onExtracted }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)

  const processFile = useCallback(
    async (file: File) => {
      setError(null)
      setBusy(true)
      setProgress(0)
      setStatus('Pregătire…')
      setLastText(null)

      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        setPreview(url)
      } else if (file.type === 'application/pdf') {
        setPreview(null)
        setError(
          'PDF-urile nu sunt citite direct aici. Exportează pagina ca imagine (JPG/PNG) sau fotografiază documentul.',
        )
        setBusy(false)
        return
      } else {
        setPreview(null)
      }

      try {
        const text = await runOcr(file, (p) => {
          setStatus(p.status)
          setProgress(Math.round(p.progress * 100))
        })
        setLastText(text)
        const extracted = parseEmploymentDocument(text)
        onExtracted(extracted)
        setStatus('Gata')
        setProgress(100)
      } catch (e) {
        console.error(e)
        setError(
          'Scanarea a eșuat. Încearcă o fotografie mai clară, bine luminată, fără reflexii.',
        )
      } finally {
        setBusy(false)
      }
    },
    [onExtracted],
  )

  const onFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void processFile(file)
  }

  return (
    <section className="panel ocr-panel" aria-labelledby="ocr-title">
      <div className="panel-head">
        <h2 id="ocr-title">Încarcă documente (OCR)</h2>
        <p>
          Fotografii sau scanări ale cărții de muncă, adeverințelor de vechime sau extraselor
          CNPP. Datele extrase completează formularul — verifică-le înainte de calcul.
        </p>
      </div>

      <div
        className={`dropzone ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          onFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp,.tif,.tiff"
          capture="environment"
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />

        {preview ? (
          <img src={preview} alt="Previzualizare document" className="ocr-preview" />
        ) : (
          <div className="dropzone-illus" aria-hidden="true">
            <span className="scan-frame" />
          </div>
        )}

        <p className="dropzone-title">Trage imaginea aici sau alege din dispozitiv</p>
        <p className="dropzone-meta">JPG, PNG, WEBP — text lizibil, pagină întreagă</p>

        <div className="dropzone-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Se scanează…' : 'Alege fotografie'}
          </button>
        </div>

        {busy ? (
          <div className="ocr-progress" role="status" aria-live="polite">
            <div className="ocr-progress-bar">
              <div style={{ width: `${progress}%` }} />
            </div>
            <span>
              {status} {progress > 0 ? `· ${progress}%` : ''}
            </span>
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
      </div>

      {lastText ? (
        <details className="ocr-raw">
          <summary>Text extras (OCR)</summary>
          <pre>{lastText}</pre>
        </details>
      ) : null}
    </section>
  )
}
