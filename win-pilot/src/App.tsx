import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

type PowerAction = 'shutdown' | 'restart' | 'hibernate' | 'sleep'
type TimeMode = 'countdown' | 'scheduled'

interface ActionConfig {
  id: PowerAction
  label: string
  icon: string
  color: string
  description: string
}

const ACTIONS: ActionConfig[] = [
  { id: 'shutdown', label: '关机', icon: '⏻', color: '#e81123', description: '完全关闭计算机' },
  { id: 'restart', label: '重启', icon: '↻', color: '#0078D4', description: '重新启动计算机' },
  { id: 'hibernate', label: '休眠', icon: '⏼', color: '#8764b8', description: '保存状态后断电' },
  { id: 'sleep', label: '睡眠', icon: '☽', color: '#00b7c3', description: '低功耗待机状态' },
]

const QUICK_TIMES = [
  { label: '15分钟', seconds: 900 },
  { label: '30分钟', seconds: 1800 },
  { label: '1小时', seconds: 3600 },
  { label: '2小时', seconds: 7200 },
]

function App() {
  const [selectedAction, setSelectedAction] = useState<PowerAction>('shutdown')
  const [timeMode, setTimeMode] = useState<TimeMode>('countdown')
  const [hours, setHours] = useState(1)
  const [minutes, setMinutes] = useState(0)
  const [scheduledHour, setScheduledHour] = useState(23)
  const [scheduledMinute, setScheduledMinute] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const endTimeRef = useRef<number>(0)

  // Test mode
  const [isTestMode, setIsTestMode] = useState(false)
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<number | null>(null)

  const handleLogoClick = useCallback(() => {
    clickCountRef.current += 1
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      if (clickCountRef.current >= 5) {
        setIsTestMode(prev => !prev)
      }
      clickCountRef.current = 0
    }, 800)
  }, [])

  // Countdown timer: only depends on isActive
  useEffect(() => {
    if (!isActive) return

    const id = window.setInterval(() => {
      const diff = Math.max(0, Math.floor((endTimeRef.current - Date.now()) / 1000))
      setRemaining(diff)
      if (diff <= 0) {
        clearInterval(id)
        intervalRef.current = null
        setIsActive(false)
        setRemaining(0)
      }
    }, 1000)

    intervalRef.current = id

    return () => {
      clearInterval(id)
      intervalRef.current = null
    }
  }, [isActive])

  const getCountdownSeconds = useCallback((): number => {
    if (timeMode === 'countdown') {
      return hours * 3600 + minutes * 60
    } else {
      const now = new Date()
      const target = new Date()
      target.setHours(scheduledHour, scheduledMinute, 0, 0)
      let diff = Math.floor((target.getTime() - now.getTime()) / 1000)
      if (diff <= 0) diff += 86400
      return diff
    }
  }, [timeMode, hours, minutes, scheduledHour, scheduledMinute])

  const handleStart = async () => {
    const seconds = getCountdownSeconds()
    if (seconds <= 0) {
      setMessage('请设置有效时间')
      setIsError(true)
      return
    }

    const label = ACTIONS.find(a => a.id === selectedAction)?.label ?? selectedAction

    if (isTestMode) {
      endTimeRef.current = Date.now() + seconds * 1000
      setRemaining(seconds)
      setTotalSeconds(seconds)
      setIsActive(true)
      setMessage(`[测试模式] 已计划${seconds}秒后${label}（未执行真实命令）`)
      setIsError(false)
      return
    }

    try {
      const result = await invoke<string>('schedule_power', {
        action: selectedAction,
        seconds,
      })
      endTimeRef.current = Date.now() + seconds * 1000
      setRemaining(seconds)
      setTotalSeconds(seconds)
      setIsActive(true)
      setMessage(result)
      setIsError(false)
    } catch (e) {
      setMessage(`${e}`)
      setIsError(true)
    }
  }

  const handleCancel = async () => {
    // Stop frontend timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsActive(false)
    setRemaining(0)
    setTotalSeconds(0)

    if (isTestMode) {
      setMessage('[测试模式] 已取消定时操作（未执行真实命令）')
      setIsError(false)
      return
    }

    try {
      const result = await invoke<string>('cancel_power')
      setMessage(result)
      setIsError(false)
    } catch (e) {
      setMessage(`${e}`)
      setIsError(true)
    }
  }

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const currentAction = ACTIONS.find(a => a.id === selectedAction)!

  return (
    <div className="app">
      {/* Animated background */}
      <div className="bg-layer">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <div className="app-container">
        {/* Header */}
        <header className="header" data-tauri-drag-region>
          <div className="logo" onClick={handleLogoClick}>
            <div className="logo-icon">✦</div>
            <div className="logo-text">
              <h1>翼航</h1>
              <span className="logo-sub">Windows 助手</span>
            </div>
          </div>
          {isTestMode && (
            <div className="test-badge" onClick={() => setIsTestMode(false)}>
              <span className="test-dot" />
              测试模式 · 点击退出
            </div>
          )}
        </header>

        <main className="main">
          {/* Countdown Display */}
          <section className={`countdown-section ${isActive ? 'active' : ''}`}>
            <div className="countdown-ring">
              <svg viewBox="0 0 200 200" className="countdown-svg">
                <circle cx="100" cy="100" r="90" className="ring-bg" />
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  className="ring-progress"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 90}`,
                    strokeDashoffset: isActive
                      ? `${2 * Math.PI * 90 * (1 - remaining / (totalSeconds || 1))}`
                      : `${2 * Math.PI * 90}`,
                    stroke: currentAction.color,
                  }}
                />
              </svg>
              <div className="countdown-inner">
                {isActive ? (
                  <>
                    <div className="countdown-time">{formatTime(remaining)}</div>
                    <div className="countdown-label" style={{ color: currentAction.color }}>
                      {currentAction.label}倒计时
                    </div>
                  </>
                ) : (
                  <div className="countdown-idle">
                    <span className="idle-icon">⏱</span>
                    <span className="idle-text">选择操作开始</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Action Selection */}
          <section className="actions-section">
            <h2 className="section-title">选择操作</h2>
            <div className="action-grid">
              {ACTIONS.map((action) => (
                <button
                  key={action.id}
                  className={`action-card ${selectedAction === action.id ? 'selected' : ''}`}
                  onClick={() => !isActive && setSelectedAction(action.id)}
                  disabled={isActive}
                  style={{
                    '--action-color': action.color,
                  } as React.CSSProperties}
                >
                  <div className="action-icon">{action.icon}</div>
                  <div className="action-info">
                    <span className="action-label">{action.label}</span>
                    <span className="action-desc">{action.description}</span>
                  </div>
                  {selectedAction === action.id && (
                    <div className="action-check">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Time Configuration */}
          <section className="time-section">
            <div className="time-mode-toggle">
              <button
                className={`mode-btn ${timeMode === 'countdown' ? 'active' : ''}`}
                onClick={() => setTimeMode('countdown')}
                disabled={isActive}
              >
                倒计时
              </button>
              <button
                className={`mode-btn ${timeMode === 'scheduled' ? 'active' : ''}`}
                onClick={() => setTimeMode('scheduled')}
                disabled={isActive}
              >
                定时
              </button>
              <div
                className="mode-slider"
                style={{ transform: `translateX(${timeMode === 'scheduled' ? '100%' : '0'})` }}
              />
            </div>

            {timeMode === 'countdown' ? (
              <div className="time-picker">
                <div className="time-unit">
                  <button className="time-arrow" onClick={() => !isActive && setHours(Math.min(99, hours + 1))} disabled={isActive}>▲</button>
                  <div className="time-value">{String(hours).padStart(2, '0')}</div>
                  <button className="time-arrow" onClick={() => !isActive && setHours(Math.max(0, hours - 1))} disabled={isActive}>▼</button>
                  <span className="time-label">时</span>
                </div>
                <div className="time-separator">:</div>
                <div className="time-unit">
                  <button className="time-arrow" onClick={() => !isActive && setMinutes(Math.min(59, minutes + 5))} disabled={isActive}>▲</button>
                  <div className="time-value">{String(minutes).padStart(2, '0')}</div>
                  <button className="time-arrow" onClick={() => !isActive && setMinutes(Math.max(0, minutes - 5))} disabled={isActive}>▼</button>
                  <span className="time-label">分</span>
                </div>
              </div>
            ) : (
              <div className="time-picker">
                <div className="time-unit">
                  <button className="time-arrow" onClick={() => !isActive && setScheduledHour(Math.min(23, scheduledHour + 1))} disabled={isActive}>▲</button>
                  <div className="time-value">{String(scheduledHour).padStart(2, '0')}</div>
                  <button className="time-arrow" onClick={() => !isActive && setScheduledHour(Math.max(0, scheduledHour - 1))} disabled={isActive}>▼</button>
                  <span className="time-label">时</span>
                </div>
                <div className="time-separator">:</div>
                <div className="time-unit">
                  <button className="time-arrow" onClick={() => !isActive && setScheduledMinute(Math.min(59, scheduledMinute + 5))} disabled={isActive}>▲</button>
                  <div className="time-value">{String(scheduledMinute).padStart(2, '0')}</div>
                  <button className="time-arrow" onClick={() => !isActive && setScheduledMinute(Math.max(0, scheduledMinute - 5))} disabled={isActive}>▼</button>
                  <span className="time-label">分</span>
                </div>
              </div>
            )}

            {/* Quick time buttons */}
            {timeMode === 'countdown' && !isActive && (
              <div className="quick-times">
                {QUICK_TIMES.map((qt) => (
                  <button
                    key={qt.seconds}
                    className="quick-btn"
                    onClick={() => {
                      setHours(Math.floor(qt.seconds / 3600))
                      setMinutes((qt.seconds % 3600) / 60)
                    }}
                  >
                    {qt.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Control Buttons */}
          <section className="controls">
            {!isActive ? (
              <button
                className="start-btn"
                onClick={handleStart}
                style={{ '--btn-color': currentAction.color } as React.CSSProperties}
              >
                <span className="btn-icon">▶</span>
                开始{currentAction.label}
              </button>
            ) : (
              <button className="cancel-btn" onClick={handleCancel}>
                <span className="btn-icon">✕</span>
                取消操作
              </button>
            )}
          </section>

          {/* Status Message */}
          {message && (
            <div className={`message ${isError ? 'error' : 'success'}`}>
              <span className="message-icon">{isError ? '⚠' : '✓'}</span>
              {message}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
