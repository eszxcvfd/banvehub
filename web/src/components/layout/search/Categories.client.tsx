'use client'
import React, { useCallback, useMemo } from 'react'

import { Category } from '@/payload-types'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import clsx from 'clsx'

type Props = {
  category: Category
}

export const CategoryItem: React.FC<Props> = ({ category }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = useMemo(() => {
    const current = searchParams.get('category')
    return current === category.slug || current === String(category.id)
  }, [category.id, category.slug, searchParams])

  const setQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (isActive) {
      params.delete('category')
    } else {
      params.set('category', category.slug || String(category.id))
    }

    const newParams = params.toString()

    router.push(newParams ? `${pathname}?${newParams}` : pathname)
  }, [category.id, category.slug, isActive, pathname, router, searchParams])

  return (
    <button
      onClick={() => setQuery()}
      className={clsx('hover:cursor-pointer text-left', {
        ' underline font-medium text-foreground': isActive,
        ' text-muted-foreground hover:text-foreground': !isActive,
      })}
    >
      {category.title}
    </button>
  )
}
