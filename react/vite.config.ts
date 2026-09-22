import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/Doc-signing-and-workflow/react/',
  plugins: [react()],
})
