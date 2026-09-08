import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/index.js'
import { useWaterfallStore } from '../store/waterfallStore.js'
import { useSocket } from '../hooks/useSocket.js'
import WhiteboardCanvas from '../components/WhiteboardCanvas.jsx'
import Toolbar from '../components/Toolbar.jsx'
import CursorOverlay from '../components/CursorOverlay.jsx'
import UserList from '../components/UserList.jsx'
import { WaterfallCanvas, WaterfallPanel } from '../components/Waterfall/index.js'

export default function WhiteboardPage() {
  const { roomId } = useParams()
  const { token, room } = useStore()
  const { active: waterfallActive, setActive: setWaterfallActive } = useWaterfallStore()
  const canvasRef = useRef(null)
  const navigate = useNavigate()

  // Redirect nếu chưa auth
  useEffect(() => {
    if (!token) navigate('/', { replace: true })
  }, [token, navigate])

  // Kết nối socket
  useSocket(roomId, canvasRef)

  const handleExport = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `whiteboard-${roomId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    alert('Đã copy link! Gửi cho bạn bè để vẽ cùng.')
  }

  if (!token) return null

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#fafafa', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12,
        padding: '8px 16px', zIndex: 100,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <span style={{ fontSize: 18 }}>🎨</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{room?.name || roomId}</span>
        <button
          onClick={handleCopyLink}
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.12)', background: 'transparent',
            cursor: 'pointer', color: '#378ADD',
          }}
        >📋 Copy link</button>
        <button
          onClick={() => setWaterfallActive(!waterfallActive)}
          title="Vẽ hoạ tiết gửi sang màn nước"
          style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 6,
            border: '1px solid rgba(0,0,0,0.12)',
            background: waterfallActive ? '#378ADD' : 'transparent',
            color: waterfallActive ? '#fff' : '#378ADD',
            cursor: 'pointer', fontWeight: 600,
          }}
        >🌊 {waterfallActive ? 'Đang ở màn nước' : 'Màn nước'}</button>
      </div>

      {/* Canvas vẽ chung — giữ mounted (không unmount) để không mất nét khi
          chuyển qua lại mode màn nước; chỉ ẩn bằng display. */}
      <div style={{ position: 'relative', width: '100%', height: '100%', display: waterfallActive ? 'none' : 'block' }}>
        <WhiteboardCanvas canvasRef={canvasRef} />
        <CursorOverlay canvasRef={canvasRef} />
      </div>

      {waterfallActive ? (
        <>
          <div style={{ position: 'absolute', inset: 0, right: 312 }}>
            <WaterfallCanvas />
          </div>
          <WaterfallPanel onExit={() => setWaterfallActive(false)} />
        </>
      ) : (
        <>
          <UserList />
          <Toolbar onExport={handleExport} />
        </>
      )}
    </div>
  )
}
