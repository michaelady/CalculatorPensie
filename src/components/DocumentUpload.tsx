import { useCallback, useMemo, useRef, useState } from 'react'
import {
  parseEmploymentDocument,
  runOcrOnDocuments,
  type OcrExtraction,
} from '../lib/ocr'
import { getPdfOcrSettings, MAX_PDF_PAGES } from '../lib/ocrSettings'

interface DocumentUploadProps {
  onExtracted: (data: OcrExtraction) => void
}

function isSupportedFile(file: File): boolean {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|tif{1,2}|gif|bmp)$/i.test(file.name)
  return isPdf || isImage
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
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const settings = useMemo(() => getPdfOcrSettings(), [])

  const processFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      const files = [...(fileList ?? [])].filter(isSupportedFile)
      if (files.length === 0) {
        setError('Format nesuportat. Folosește JPG, PNG, WEBP sau PDF.')
        return
      }

      setError(null)
      setBusy(true)
      setProgress(0)
      setStatus('Pregătire…')
      setLastText(null)
      setPdfInfo(null)
      setSelectedNames(files.map((f) => f.name))

      const firstImage = files.find((f) => f.type.startsWith('image/'))
      if (firstImage) {
        setPreview(URL.createObjectURL(firstImage))
      } else {
        setPreview(null)
      }

      try {
        const result = await runOcrOnDocuments(files, (p) => {
          setStatus(p.status)
          setProgress(Math.round(Math.min(100, Math.max(0, p.progress * 100))))
        })

        if (result.previewUrl) {
          setPreview(result.previewUrl)
        }

        const infoParts: string[] = []
        if (files.length > 1) {
          infoParts.push(`${files.length} fișiere combinate`)
        }
        if (result.pageCount != null) {
          const processed = result.pagesProcessed ?? result.pageCount
          infoParts.push(
            processed < result.pageCount
              ? `${processed}/${result.pageCount} pagini PDF (limită ${MAX_PDF_PAGES})`
              : `${result.pageCount} ${result.pageCount === 1 ? 'pagină' : 'pagini'} PDF`,
          )
        }
        if (result.chunksProcessed && result.chunksProcessed > 1) {
          infoParts.push(
            `împărțit în ${result.chunksProcessed} fișiere temporare (×${settings.chunkPages} pag.)`,
          )
        }
        setPdfInfo(infoParts.length > 0 ? infoParts.join(' · ') : null)

        setLastText(result.text)
        const extracted = parseEmploymentDocument(result.text)
        if (files.length > 1) {
          extracted.indiciiGasiti = [
            `Surse combinate: ${files.length} fișiere (scan / Revisal / altele)`,
            ...extracted.indiciiGasiti,
          ]
        }
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
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [onExtracted, settings.chunkPages],
  )

  return (
    <section className="panel ocr-panel" aria-labelledby="ocr-title">
      <div className="panel-head">
        <h2 id="ocr-title">Încarcă documente (OCR)</h2>
        <p>
          Poți selecta mai multe fișiere — de exemplu scanul cărții de muncă (poze / scris de
          mână) și extrasul digital din Revisal — ca să completeze împreună perioada lucrată.
          PDF-urile lungi se împart automat în fișiere temporare pe telefon și se procesează pe
          rând (până la {MAX_PDF_PAGES} pagini).
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
          void processFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp,.tif,.tiff,.pdf,application/pdf"
          multiple
          hidden
          onChange={(e) => void processFiles(e.target.files)}
        />

        {preview ? (
          <img src={preview} alt="Previzualizare document" className="ocr-preview" />
        ) : (
          <div className="dropzone-illus" aria-hidden="true">
            <span className="scan-frame" />
          </div>
        )}

        <p className="dropzone-title">Trage fișierele aici sau alege din dispozitiv</p>
        <p className="dropzone-meta">
          JPG, PNG, WEBP, PDF (text, scan sau Revisal) — mai multe surse odată · max.{' '}
          {MAX_PDF_PAGES} pagini/PDF · pe dispozitiv slab: chunk-uri de {settings.chunkPages}{' '}
          pagini
        </p>

        {selectedNames.length > 0 && !busy ? (
          <ul className="ocr-file-list">
            {selectedNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : null}

        <div className="dropzone-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Se scanează…' : 'Alege imagini sau PDF-uri'}
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
