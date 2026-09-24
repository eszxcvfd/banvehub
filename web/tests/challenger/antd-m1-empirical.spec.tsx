import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  AntdConfigProvider,
  message,
  notification,
  modal,
  useAntdApp,
} from '@/providers/Antd'
import { ThemeProvider, useTheme } from '@/providers/Theme'
import { Button, theme as antdTheme } from 'antd'

// Test harness component to inspect Ant Design tokens and useAntdApp
const TokenInspector: React.FC<{ onInspect: (data: any) => void }> = ({ onInspect }) => {
  const { theme } = useTheme()
  const { token } = antdTheme.useToken()
  const app = useAntdApp()

  React.useEffect(() => {
    onInspect({
      theme,
      token,
      hasAppMessage: typeof app.message?.success === 'function',
      hasAppNotification: typeof app.notification?.info === 'function',
      hasAppModal: typeof app.modal?.confirm === 'function',
    })
  }, [theme, token, app, onInspect])

  return (
    <div>
      <span data-testid="current-theme">{theme ?? 'default'}</span>
      <span data-testid="color-primary">{token.colorPrimary}</span>
      <span data-testid="bg-container">{token.colorBgContainer}</span>
      <Button type="primary">Test Button</Button>
    </div>
  )
}

describe('M1 Challenger: Ant Design System & Theme Provider Empirical Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('verifies primary color token is #1677ff and typography is Geist', () => {
    let inspected: any = null
    render(
      <ThemeProvider>
        <AntdConfigProvider>
          <TokenInspector onInspect={(data) => (inspected = data)} />
        </AntdConfigProvider>
      </ThemeProvider>,
    )

    expect(inspected).not.toBeNull()
    expect(inspected.token.colorPrimary).toBe('#1677ff')
    expect(inspected.token.colorLink).toBe('#1677ff')
    expect(inspected.token.borderRadius).toBe(6)
    expect(inspected.token.fontFamily).toContain('var(--font-geist-sans)')
    expect(inspected.token.fontFamilyCode).toContain('var(--font-geist-mono)')
  })

  it('verifies dynamic theme switching updates Ant Design algorithm from light to dark', () => {
    let inspected: any = null

    const ThemeSwitcher = () => {
      const { setTheme } = useTheme()
      return (
        <div>
          <button data-testid="switch-dark" onClick={() => setTheme('dark')}>
            Dark
          </button>
          <button data-testid="switch-light" onClick={() => setTheme('light')}>
            Light
          </button>
        </div>
      )
    }

    render(
      <ThemeProvider>
        <AntdConfigProvider>
          <ThemeSwitcher />
          <TokenInspector onInspect={(data) => (inspected = data)} />
        </AntdConfigProvider>
      </ThemeProvider>,
    )

    // Initial state: light theme
    const lightBg = inspected.token.colorBgContainer
    expect(inspected.token.colorPrimary).toBe('#1677ff')

    // Switch to dark
    act(() => {
      screen.getByTestId('switch-dark').click()
    })

    expect(inspected.theme).toBe('dark')
    const darkBg = inspected.token.colorBgContainer
    // Under darkAlgorithm, container background should be dark (#141414 or dark token)
    expect(darkBg).not.toBe(lightBg)
    expect(darkBg.toLowerCase()).toBe('#141414')

    // Switch back to light
    act(() => {
      screen.getByTestId('switch-light').click()
    })

    expect(inspected.theme).toBe('light')
    expect(inspected.token.colorBgContainer).toBe(lightBg)
  })

  it('verifies useAntdApp() hook provides message, notification, and modal without undefined errors', () => {
    let inspected: any = null
    render(
      <ThemeProvider>
        <AntdConfigProvider>
          <TokenInspector onInspect={(data) => (inspected = data)} />
        </AntdConfigProvider>
      </ThemeProvider>,
    )

    expect(inspected.hasAppMessage).toBe(true)
    expect(inspected.hasAppNotification).toBe(true)
    expect(inspected.hasAppModal).toBe(true)
  })

  it('verifies static bridge (message, notification, modal) does not throw undefined errors', () => {
    render(
      <ThemeProvider>
        <AntdConfigProvider>
          <div data-testid="mounted">App Mounted</div>
        </AntdConfigProvider>
      </ThemeProvider>,
    )

    // Test message static methods
    expect(() => {
      const res = message.success('Challenger test success message')
      expect(res).toBeDefined()
    }).not.toThrow()

    expect(() => {
      message.error('Challenger test error message')
      message.warning('Challenger test warning message')
      message.info('Challenger test info message')
    }).not.toThrow()

    // Test notification static methods
    expect(() => {
      notification.info({
        title: 'Notification Title',
        description: 'Notification description body',
      })
      notification.success({
        title: 'Notification Success',
      })
    }).not.toThrow()

    // Test modal static methods
    expect(() => {
      const confirmInstance = modal.confirm({
        title: 'Confirm Title',
        content: 'Confirm content',
      })
      expect(confirmInstance).toBeDefined()
      confirmInstance?.destroy?.()
    }).not.toThrow()
  })

  it('verifies static bridge falls back gracefully even before provider mounting', () => {
    // Calling message before or outside AntdConfigProvider
    expect(() => {
      message.info('Fallback message call')
    }).not.toThrow()

    expect(() => {
      notification.open({ title: 'Fallback notification call' })
    }).not.toThrow()
  })
})
