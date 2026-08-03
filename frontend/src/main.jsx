import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from '@/App.jsx'
import { router } from '@/routers/routes.jsx'
import { registerSessionRedirects } from '@/routers/sessionRedirects.js'
import { markSessionExpired } from '@/store/sessionStore.js'

// API 클라이언트의 세션 만료(980)/비밀번호 변경 필요(1012) 리스너를 앱 진입점에서
// 딱 한 번 등록한다. 모듈 최상위이므로 React 19 StrictMode 의 이중 effect 실행과
// 무관하게 정확히 한 번만 실행된다.
registerSessionRedirects({ router, markSessionExpired })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
