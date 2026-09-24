'use client'

import React, { useSyncExternalStore } from 'react'
import { Dropdown, Tooltip, type MenuProps } from 'antd'
import {
  SunOutlined,
  MoonOutlined,
  SettingOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useTheme } from '@/providers/Theme'
import { themeLocalStorageKey } from '@/providers/Theme/shared'
import { themeIsValid } from '@/providers/Theme/types'

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

export const ThemeNavSetting: React.FC = () => {
  const { theme, setTheme } = useTheme()
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  )

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'auto') {
      setTheme(null)
    } else if (themeIsValid(key)) {
      setTheme(key)
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'header-title',
      type: 'group',
      label: (
        <span className="text-[11px] font-semibold tracking-wide text-neutral-400 dark:text-neutral-500 uppercase">
          Chế độ hiển thị
        </span>
      ),
      children: [
        {
          key: 'light',
          icon: <SunOutlined className="text-amber-500" />,
          label: (
            <div className="flex items-center justify-between gap-6 py-0.5">
              <span className="text-xs font-medium">Giao diện Sáng</span>
              {preference === 'light' ? (
                <CheckOutlined className="text-[#1677ff] text-xs" />
              ) : null}
            </div>
          ),
        },
        {
          key: 'dark',
          icon: <MoonOutlined className="text-blue-400" />,
          label: (
            <div className="flex items-center justify-between gap-6 py-0.5">
              <span className="text-xs font-medium">Giao diện Tối</span>
              {preference === 'dark' ? (
                <CheckOutlined className="text-[#1677ff] text-xs" />
              ) : null}
            </div>
          ),
        },
        {
          key: 'auto',
          icon: <SettingOutlined className="text-neutral-400" />,
          label: (
            <div className="flex items-center justify-between gap-6 py-0.5">
              <span className="text-xs font-medium">Tự động (Hệ thống)</span>
              {preference === 'auto' ? (
                <CheckOutlined className="text-[#1677ff] text-xs" />
              ) : null}
            </div>
          ),
        },
      ],
    },
  ]

  // Determine active icon based on user preference or effective theme
  const currentIcon =
    preference === 'dark' ? (
      <MoonOutlined className="text-[15px] text-blue-400" />
    ) : preference === 'light' ? (
      <SunOutlined className="text-[15px] text-amber-500" />
    ) : theme === 'dark' ? (
      <MoonOutlined className="text-[15px] text-blue-400" />
    ) : (
      <SunOutlined className="text-[15px] text-amber-500" />
    )

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick }}
      trigger={['click', 'hover']}
      placement="bottomRight"
    >
      <Tooltip title="Chế độ hiển thị" placement="bottom">
        <button
          type="button"
          aria-label="Chế độ hiển thị"
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200/80 dark:border-neutral-700/80 focus:outline-none"
        >
          {currentIcon}
        </button>
      </Tooltip>
    </Dropdown>
  )
}
