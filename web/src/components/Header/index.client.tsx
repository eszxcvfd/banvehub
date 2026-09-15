'use client'
import { CMSLink } from '@/components/Link'
import Link from 'next/link'
import React, { Suspense } from 'react'

import { MobileMenu } from './MobileMenu'
import type { Header } from 'src/payload-types'

import { LogoIcon } from '@/components/icons/logo'
import { usePathname } from 'next/navigation'
import { cn } from '@/utilities/cn'

type Props = {
  header: Header
}

export function HeaderClient({ header }: Props) {
  const menu = header.navItems || []
  const pathname = usePathname()

  return (
    <div className="relative z-20 border-b">
      <nav className="flex items-center md:items-end justify-between container pt-2">
        <div className="block flex-none md:hidden">
          <Suspense fallback={null}>
            <MobileMenu menu={menu} />
          </Suspense>
        </div>
        <div className="flex w-full items-end justify-between">
          <div className="flex w-full items-end gap-6 md:w-1/3">
            <Link className="flex w-full items-center justify-center pt-4 pb-4 md:w-auto" href="/">
              <LogoIcon className="w-6 h-auto" />
            </Link>
            {menu.length ? (
              <ul className="hidden gap-4 text-sm md:flex md:items-center">
                {menu.map((item) => (
                  <li key={item.id}>
                    <CMSLink
                      {...item.link}
                      size={'clear'}
                      className={cn('relative navLink', {
                        active:
                          item.link.url && item.link.url !== '/'
                            ? pathname.includes(item.link.url)
                            : false,
                      })}
                      appearance="nav"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center justify-end md:w-1/3 gap-3 pb-3">
            <Link
              href="/wallet"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors flex items-center gap-1"
            >
              Ví tiền
            </Link>
            <Link
              href="/seller"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            >
              Kênh người bán
            </Link>
            <Link
              href="/account"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Tài khoản
            </Link>
          </div>
        </div>
      </nav>
    </div>
  )
}
