import type { Footer } from '@/payload-types'
import { CMSLink } from '@/components/Link'
import React from 'react'

interface Props {
  menu: Footer['navItems']
  className?: string
}

export function FooterMenu({ menu, className }: Props) {
  if (!menu?.length) return null

  return (
    <ul className={className || 'space-y-2 list-none p-0 m-0'}>
      {menu.map((item) => {
        return (
          <li key={item.id}>
            <CMSLink
              appearance="inline"
              {...item.link}
              className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-primary hover:translate-x-1 inline-block transition-all"
            />
          </li>
        )
      })}
    </ul>
  )
}
