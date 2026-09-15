'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import React, { useSyncExternalStore } from 'react'

import { useTheme } from '..'
import { themeLocalStorageKey } from '../shared'
import { themeIsValid } from '../types'

const subscribePreference = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener('theme-change', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('theme-change', callback)
  }
}

const getPreferenceSnapshot = (): string => {
  if (typeof window === 'undefined') return 'auto'
  return window.localStorage.getItem(themeLocalStorageKey) ?? 'auto'
}

const getPreferenceServerSnapshot = (): string => 'auto'

export const ThemeSelector: React.FC = () => {
  const { setTheme } = useTheme()
  const value = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  )

  const onThemeChange = (themeToSet: string) => {
    if (themeToSet === 'auto') {
      setTheme(null)
    } else if (themeIsValid(themeToSet)) {
      setTheme(themeToSet)
    }
  }

  return (
    <Select onValueChange={onThemeChange} value={value}>
      <SelectTrigger className="w-auto bg-transparent gap-2 md:pl-3 border-none">
        <SelectValue placeholder="Theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto</SelectItem>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
      </SelectContent>
    </Select>
  )
}
