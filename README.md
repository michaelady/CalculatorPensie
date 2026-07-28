# PensieRO — Calculator estimare pensie România

Aplicație web în română pentru estimarea pensiei din sistemul public, conform **Legii 360/2023** (VPR 81 lei în 2026).

## Funcții

- Formular cu toate datele necesare: sex, data nașterii, stagiu de cotizare, salariu/punctaj, perioade asimilate, VPR
- Calcul: puncte contributivitate + stabilitate + asimilate × VPR
- Încărcare foto/scan (OCR cu Tesseract.js, limba română) pentru carte de muncă / adeverințe
- Estimare pensie brută și netă (CASS / impozit orientativ)

## Pornire

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
