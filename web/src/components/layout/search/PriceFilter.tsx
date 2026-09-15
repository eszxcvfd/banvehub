'use client'

import React, { useCallback, useMemo } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import clsx from 'clsx'

export function PriceFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isFreeParam = searchParams.get('isFree')
  const priceTypeParam = searchParams.get('priceType')

  const isFreeActive = useMemo(() => {
    return isFreeParam === 'true' || priceTypeParam === 'free'
  }, [isFreeParam, priceTypeParam])

  const isPaidActive = useMemo(() => {
    return isFreeParam === 'false' || priceTypeParam === 'paid'
  }, [isFreeParam, priceTypeParam])

  const isAllActive = useMemo(() => {
    return !isFreeActive && !isPaidActive
  }, [isFreeActive, isPaidActive])

  const selectPriceFilter = useCallback(
    (type: 'all' | 'free' | 'paid') => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('priceType')

      if (type === 'free') {
        params.set('isFree', 'true')
      } else if (type === 'paid') {
        params.set('isFree', 'false')
      } else {
        params.delete('isFree')
      }

      const newParams = params.toString()
      router.push(newParams ? `${pathname}?${newParams}` : pathname)
    },
    [pathname, router, searchParams],
  )

  return (
    <div>
      <h3 className="text-xs mb-2 text-neutral-500 dark:text-neutral-400">Price</h3>

      <ul className="space-y-1 text-sm">
        <li>
          <button
            onClick={() => selectPriceFilter('all')}
            className={clsx('hover:cursor-pointer text-left', {
              ' underline font-medium text-foreground': isAllActive,
              ' text-muted-foreground hover:text-foreground': !isAllActive,
            })}
          >
            All
          </button>
        </li>
        <li>
          <button
            onClick={() => selectPriceFilter('free')}
            className={clsx('hover:cursor-pointer text-left', {
              ' underline font-medium text-foreground': isFreeActive,
              ' text-muted-foreground hover:text-foreground': !isFreeActive,
            })}
          >
            Miễn phí (Free)
          </button>
        </li>
        <li>
          <button
            onClick={() => selectPriceFilter('paid')}
            className={clsx('hover:cursor-pointer text-left', {
              ' underline font-medium text-foreground': isPaidActive,
              ' text-muted-foreground hover:text-foreground': !isPaidActive,
            })}
          >
            Có phí (Paid)
          </button>
        </li>
      </ul>
    </div>
  )
}
