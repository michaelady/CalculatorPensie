import { useCallback, useRef, useState } from 'react'
import { parseEmploymentDocument, runOcrOnDocument, type OcrExtraction } from '../lib/ocr'

interface DocumentUploadProps {
  onExtracted: (data: OcrExtraction) => void
}

const MAX_PDF_PAGES_HINT = 20

function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function DocumentUpload({ onExtracted }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)
  const [pdfInfo, setPdfInfo] = useState<string | null>(null)

  const processFile = useCallback(
    async (file: File) => {
      setError(null)
      setBusy(true)
      setProgress(0)
      setStatus('Pregătire…')
      setLastText(null)
      setPdfInfo(null)

      const isPdf = looksLikePdf(file)
      const isImage = file.type.startsWith('image/')

      if (!isPdf && !isImage && !/\.(jpe?g|png|webp|tif{1,2}|gif|bmp)$/i.test(file.name)) {
        setError('Format nesuportat. Folosește JPG, PNG, WEBP sau PDF.')
        setBusy(false)
        return
      }

      if (isImage) {
        setPreview(URL.createObjectURL(file))
      } else {
        setPreview(null)
      }

      try {
        const result = await runOcrOnDocument(file, (p) => {
          setStatus(p.status)
          setProgress(Math.round(Math.min(100, Math.max(0, p.progress * 100))))
        })

        if (result.previewUrl) {
          setPreview(result.previewUrl)
        }

        if (result.pageCount != null) {
          const processed = result.pagesProcessed ?? result.pageCount
          setPdfInfo(
            processed < result.pageCount
              ? `PDF: ${processed} din ${result.pageCount} pagini procesate (limită ${MAX_PDF_PAGES_HINT})`
              : `PDF: ${result.pageCount} ${result.pageCount === 1 ? 'pagină' : 'pagini'} procesate`,
          )
        }

        setLastText(result.text)
        const extracted = parseEmploymentDocument(result.text)
        onExtracted(extracted)
        setStatus('Gata')
        setProgress(100)
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : ''
        setError(
          msg ||
            'Scanarea a eșuat. Pentru PDF-uri cu poze, asigură-te că paginile sunt clare și lizibile.',
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
          Fotografii, scanări sau PDF-uri (inclusiv PDF cu poze) ale cărții de muncă,
          adeverințelor de vechime sau extraselor CNPP. Datele extrase completează formularul —
          verifică-le înainte de calcul.
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
          accept="image/*,.jpg,.jpeg,.png,.webp,.tif,.tiff,.pdf,application/pdf"
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

        <p className="dropzone-title">Trage fișierul aici sau alege din dispozitiv</p>
        <p className="dropzone-meta">
          JPG, PNG, WEBP, PDF (text sau scanat cu poze) — max. {MAX_PDF_PAGES_HINT} pagini OCR
        </p>

        <div className="dropzone-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Se scanează…' : 'Alege imagine sau PDF'}
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

        {pdfInfo && !busy ? <p className="ocr-pdf-info">{pdfInfo}</p> : null}
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
