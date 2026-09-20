'use client'

import { Button } from '@/components/ui/button'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * §25 #21 entry point for the account area.
 *
 * Why this lives inside `(account)/` instead of `components/AccountNav`: this increment's
 * allowed paths cover the account area only, and a sibling component that speaks the exact
 * visual language of `AccountNav` (same `Button variant="link"` + `text-primary/50
 * hover:text-primary` active-state idiom) keeps the column consistent without editing a file
 * outside the task's scope.
 */
type Props = {
  className?: string
}

export const NotificationsNavLink: React.FC<Props> = ({ className }) => {
  const pathname = usePathname()
  const isActive = pathname === '/notifications' || pathname.startsWith('/notifications/')

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <Button asChild variant="link">
        <Link
          href="/notifications"
          data-testid="nav-notifications"
          className={clsx(
            'text-primary/50 hover:text-primary hover:no-underline flex items-center gap-2',
            {
              'text-primary': isActive,
            },
          )}
        >
          <span aria-hidden="true">🔔</span>
          Thông báo
        </Link>
      </Button>
    </div>
  )
}
