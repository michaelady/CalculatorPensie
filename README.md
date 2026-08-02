# PensieRO — Calculator estimare pensie România

Aplicație web în română pentru estimarea pensiei din sistemul public, conform **Legii 360/2023** (VPR 81 lei în 2026).

## Funcții

- Formular cu toate datele necesare: sex, data nașterii, stagiu de cotizare, salariu/punctaj, perioade asimilate, VPR
- Calcul: puncte contributivitate + stabilitate + asimilate × VPR
- Încărcare **mai multe** foto/scan/**PDF** (carte de muncă scanată + extras Revisal etc.); PDF-urile lungi se împart în fișiere temporare pe dispozitiv și se procesează pe rând (până la 20 pagini, inclusiv pe Android slab)
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
