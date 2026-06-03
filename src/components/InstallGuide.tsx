import { useState, useEffect } from 'react'
import './InstallGuide.css'

interface InstallGuideProps {
  isOpen: boolean
  onClose: () => void
}

export function InstallGuide({ isOpen, onClose }: InstallGuideProps) {
  const [currentStep, setCurrentStep] = useState(0)

  // Reset step when reopening
  useEffect(() => {
    if (isOpen) setCurrentStep(0)
  }, [isOpen])

  if (!isOpen) return null

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)

  const steps = isIOS ? [
    {
      icon: '🌐',
      title: 'Open in Safari',
      detail: 'This won\'t work in other browsers. Open this page in Safari on your iPhone.',
      subdetail: 'If you\'re already in Safari, you\'re all set for the next step.',
    },
    {
      icon: '📤',
      title: 'Tap the Share button',
      detail: 'Look for the Share icon at the bottom of the screen — a square with an arrow pointing up.',
      subdetail: 'It\'s in the toolbar at the bottom center (iPhone) or top right (iPad).',
    },
    {
      icon: '📋',
      title: 'Scroll and tap "Add to Home Screen"',
      detail: 'In the share menu that appears, scroll down past the apps row until you find "Add to Home Screen".',
      subdetail: 'It has a plus icon inside a rounded square.',
    },
    {
      icon: '✅',
      title: 'Tap "Add" to confirm',
      detail: 'You can rename the app if you\'d like, then tap "Add" in the top-right corner.',
      subdetail: 'The app will appear on your home screen and work just like a native app — full screen, offline, and always up to date.',
    },
  ] : isAndroid ? [
    {
      icon: '🌐',
      title: 'Open in Chrome',
      detail: 'Open this page in Chrome on your Android device.',
      subdetail: 'Other browsers may not support PWA installation.',
    },
    {
      icon: '⋮',
      title: 'Tap the menu (⋮)',
      detail: 'Tap the three-dot menu in the top-right corner of Chrome.',
      subdetail: '',
    },
    {
      icon: '📲',
      title: 'Tap "Install app" or "Add to Home Screen"',
      detail: 'Look for the install option in the menu and tap it.',
      subdetail: 'A confirmation dialog will appear.',
    },
    {
      icon: '✅',
      title: 'Tap "Install" to confirm',
      detail: 'The app will be added to your home screen for quick access.',
      subdetail: 'It works offline and stays up to date automatically.',
    },
  ] : [
    {
      icon: '💻',
      title: 'Install on your device',
      detail: 'On desktop, click the install icon in the address bar (usually a monitor with a down arrow or a plus sign).',
      subdetail: 'On mobile, use Safari (iPhone) or Chrome (Android) for the best PWA experience.',
    },
    {
      icon: '✅',
      title: 'Ready to go',
      detail: 'Once installed, the app works offline, loads instantly, and stays up to date automatically.',
      subdetail: '',
    },
  ]

  return (
    <div className="install-guide-overlay" onClick={onClose}>
      <div className="install-guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ig-header">
          <h2>📲 Install to Home Screen</h2>
          <p>Get the full app experience — offline, full screen, and always up to date</p>
          <button className="ig-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Step indicator */}
        <div className="ig-steps-indicator">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`ig-step-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}
              onClick={() => setCurrentStep(i)}
            />
          ))}
        </div>

        {/* Current step */}
        <div className="ig-step-card">
          <div className="ig-step-number">Step {currentStep + 1} of {steps.length}</div>
          <div className="ig-step-icon">{steps[currentStep].icon}</div>
          <h3>{steps[currentStep].title}</h3>
          <p className="ig-step-detail">{steps[currentStep].detail}</p>
          {steps[currentStep].subdetail && (
            <p className="ig-step-subdetail">{steps[currentStep].subdetail}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="ig-nav">
          {currentStep > 0 ? (
            <button className="ig-btn-secondary" onClick={() => setCurrentStep(s => s - 1)}>
              ← Previous
            </button>
          ) : (
            <div />
          )}
          {currentStep < steps.length - 1 ? (
            <button className="ig-btn-primary" onClick={() => setCurrentStep(s => s + 1)}>
              Next →
            </button>
          ) : (
            <button className="ig-btn-primary ig-btn-done" onClick={onClose}>
              Got it! 🎉
            </button>
          )}
        </div>

        {/* Platform hint */}
        <div className="ig-platform-hint">
          {isIOS ? '🍎 iPhone/iPad guide' : isAndroid ? '🤖 Android guide' : '💻 Desktop guide'}
        </div>
      </div>
    </div>
  )
}

/**
 * Hook: detects if the app is running in standalone mode (installed as PWA).
 * Returns true if already installed — the install guide should not be shown.
 */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Check display-mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    // iOS Safari standalone check
    if ('standalone' in navigator && (navigator as any).standalone === true) {
      setInstalled(true)
      return
    }

    const mql = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setInstalled(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return installed
}

/**
 * Hook: detects if the user is on iOS Safari (where install guide is most relevant).
 */
export function useIsIOS(): boolean {
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua)
    const safari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua)
    setIsIOS(ios && safari)
  }, [])

  return isIOS
}
