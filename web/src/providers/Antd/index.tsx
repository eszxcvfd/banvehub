'use client'

import React from 'react'
import {
  ConfigProvider,
  App as AntdApp,
  theme as antdTheme,
  message as defaultMessage,
  notification as defaultNotification,
  Modal as defaultModal,
} from 'antd'
import viVN from 'antd/locale/vi_VN'
import { useTheme } from '@/providers/Theme'

// Type-safe reference to static instances captured from AntdApp.useApp()
type AppHookReturnType = ReturnType<typeof AntdApp.useApp>

let staticMessage: AppHookReturnType['message'] | undefined
let staticNotification: AppHookReturnType['notification'] | undefined
let staticModal: AppHookReturnType['modal'] | undefined

/**
 * Bridge component that mounts inside <AntdApp> to capture context-aware
 * message, notification, and modal instances for static access across the application.
 */
const AntdStaticBridge: React.FC = () => {
  const { message, notification, modal } = AntdApp.useApp()
  React.useEffect(() => {
    staticMessage = message
    staticNotification = notification
    staticModal = modal
    return () => {
      if (staticMessage === message) staticMessage = undefined
      if (staticNotification === notification) staticNotification = undefined
      if (staticModal === modal) staticModal = undefined
    }
  }, [message, notification, modal])
  return null
}

/**
 * Context-aware static message bridge with fallback to standard Ant Design static method.
 */
export const message = new Proxy({} as AppHookReturnType['message'], {
  get: (_target, prop: keyof AppHookReturnType['message']) => {
    if (staticMessage) {
      return staticMessage[prop]
    }
    return defaultMessage[prop]
  },
})

/**
 * Context-aware static notification bridge with fallback to standard Ant Design static method.
 */
export const notification = new Proxy({} as AppHookReturnType['notification'], {
  get: (_target, prop: keyof AppHookReturnType['notification']) => {
    if (staticNotification) {
      return staticNotification[prop]
    }
    return defaultNotification[prop]
  },
})

/**
 * Context-aware static modal bridge with fallback to standard Ant Design static method.
 */
export const modal = new Proxy({} as AppHookReturnType['modal'], {
  get: (_target, prop: keyof AppHookReturnType['modal']) => {
    if (staticModal) {
      return staticModal[prop]
    }
    return (defaultModal as unknown as Record<string, unknown>)[
      prop as string
    ] as AppHookReturnType['modal'][keyof AppHookReturnType['modal']]
  },
})

/**
 * Direct export of Ant Design's useApp hook for components.
 */
export const useAntdApp = AntdApp.useApp

export interface AntdConfigProviderProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * AntdConfigProvider:
 * 1. Primary color: #1677ff (Engineering / Tech Blue)
 * 2. Vietnamese locale: vi_VN from antd/locale/vi_VN
 * 3. Typography: Geist Sans font token via var(--font-geist-sans)
 * 4. Dynamic light/dark theme synchronization via useTheme() (antdTheme.defaultAlgorithm vs antdTheme.darkAlgorithm)
 * 5. Wrapped with Ant Design <App> component for complete static and hook message/notification context.
 */
export const AntdConfigProvider: React.FC<AntdConfigProviderProps> = ({
  children,
  className,
  style,
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const resolvedLocale =
    (viVN as unknown as { default?: typeof viVN })?.default || viVN

  return (
    <ConfigProvider
      locale={resolvedLocale}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily:
            'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontFamilyCode: 'var(--font-geist-mono), monospace',
          colorLink: '#1677ff',
          colorLinkHover: '#4096ff',
        },
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <AntdApp
        className={className ?? 'min-h-screen flex flex-col flex-1'}
        style={style}
      >
        <AntdStaticBridge />
        {children}
      </AntdApp>
    </ConfigProvider>
  )
}
