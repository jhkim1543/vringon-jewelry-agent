import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error — 서버 전용 .mjs (키를 브라우저 번들과 분리하기 위해 config에서만 로드)
import { openaiApiPlugin } from './server/openai-api.mjs'

// GitHub Pages는 저장소 이름이 경로에 들어간다. 배포 빌드에서만 base를 바꾼다.
//   npm run build        → 로컬/서버 배포용 (base '/')
//   npm run build:pages  → Pages용 (base '/vringon-jewelry-agent/', 결과는 docs/)
const pages = process.env.BUILD_TARGET === 'pages'

export default defineConfig({
  plugins: [react(), openaiApiPlugin()],
  base: pages ? '/vringon-jewelry-agent/' : '/',
  build: pages ? { outDir: 'docs', emptyOutDir: true } : {},
  server: { port: 5188 },
})
