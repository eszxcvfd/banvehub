'use client'

import React, { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

import type { Theme, ThemeContextType } from './types'

import { defaultTheme, getImplicitPreference, themeLocalStorageKey } from './shared'
import { themeIsValid } from './types'

const initialContext: ThemeContextType = {
  setTheme: () => null,
  theme: undefined,
}

const ThemeContext = createContext(initialContext)

const subscribe = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {}

  const handleExternalChange = () => {
    const preference = window.localStorage.getItem(themeLocalStorageKey)
    let themeToSet: Theme = defaultTheme

    if (themeIsValid(preference)) {
      themeToSet = preference
    } else {
      const implicitPreference = getImplicitPreference()
      if (implicitPreference) {
        themeToSet = implicitPreference
      }
    }

    document.documentElement.setAttribute('data-theme', themeToSet)
    callback()
  }

  window.addEventListener('storage', handleExternalChange)
  window.addEventListener('theme-change', callback)

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener?.('change', handleExternalChange)

  return () => {
    window.removeEventListener('storage', handleExternalChange)
    window.removeEventListener('theme-change', callback)
    mediaQuery.removeEventListener?.('change', handleExternalChange)
  }
}

const getSnapshot = (): Theme | undefined => {
  if (typeof document === 'undefined') return undefined
  const docTheme = document.documentElement.getAttribute('data-theme')
  if (themeIsValid(docTheme)) return docTheme
  return defaultTheme
}

const getServerSnapshot = (): Theme | undefined => undefined

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setTheme = useCallback((themeToSet: Theme | null) => {
    if (themeToSet === null) {
      window.localStorage.removeItem(themeLocalStorageKey)
      const implicitPreference = getImplicitPreference()
      const theme = implicitPreference || defaultTheme
      document.documentElement.setAttribute('data-theme', theme)
    } else {
      window.localStorage.setItem(themeLocalStorageKey, themeToSet)
      document.documentElement.setAttribute('data-theme', themeToSet)
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [])

  return <ThemeContext.Provider value={{ setTheme, theme }}>{children}</ThemeContext.Provider>
}

export const useTheme = (): ThemeContextType => useContext(ThemeContext)
