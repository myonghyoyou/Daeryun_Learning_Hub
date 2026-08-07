import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // ProblemImageServiceImpl이 반환하는 imageUrl(/uploads/images/{uuid}.ext)은 백엔드가
      // 정적 리소스로 서빙한다(Task 5). ProblemFormPage가 그 값을 <img src>로 그대로 렌더링하므로
      // /api와 동일하게 프록시해야 로컬 dev에서 업로드 직후 미리보기가 뜬다.
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
