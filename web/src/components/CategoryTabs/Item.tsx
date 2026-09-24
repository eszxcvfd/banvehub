'use client'

import React from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  href: string
  title: string
}

export function Item({ href, title }: Props) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <li className="mt-2 flex text-sm text-black dark:text-white">
      <Link
        className={clsx(
          'w-full font-mono uppercase text-primary/50 px-2 text-sm py-1 rounded-md hover:bg-white/5 hover:text-primary transition-colors',
          {
            'bg-white/5 text-primary font-bold': active,
          },
        )}
        href={href}
      >
        {title}
      </Link>
    </li>
  )
}
