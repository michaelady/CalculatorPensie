# PensieRO — Calculator estimare pensie România

Aplicație web în română pentru estimarea pensiei din sistemul public, conform **Legii 360/2023** (VPR 81 lei în 2026).

## Funcții

- Formular cu toate datele necesare: sex, data nașterii, stagiu de cotizare, salariu/punctaj, perioade asimilate, VPR
- Calcul: puncte contributivitate + stabilitate + asimilate × VPR
- Încărcare foto/scan/**PDF** (OCR Tesseract.js + PDF.js; inclusiv PDF-uri cu poze/scanate) pentru carte de muncă / adeverințe
- Estimare pensie brută și netă (CASS / impozit orientativ)

## Site public (GitHub Pages)

După deploy: **https://michaelady.github.io/CalculatorPensie/**

În Settings → Pages, sursa trebuie să fie **GitHub Actions** (o singură dată).

## Pornire locală

```bash
npm install
npm run dev
```

Build producție:

```bash
npm run build
npm run preview
```

## Notă

Rezultatul este **orientativ**. Calculul oficial aparține Casei Naționale de Pensii Publice (CNPP).
