import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TAURI_ENV_* — Tauri CLI прокидывает их в import.meta.env; без envPrefix
// Vite отдаёт клиенту только VITE_*-переменные.
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
