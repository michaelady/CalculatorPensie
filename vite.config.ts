import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Necesar pentru GitHub Pages: https://michaelady.github.io/CalculatorPensie/
  base: '/CalculatorPensie/',
})
