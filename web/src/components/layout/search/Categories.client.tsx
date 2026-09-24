'use client'

import React, { useCallback, useMemo } from 'react'
import type { Category } from '@/payload-types'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { Radio } from 'antd'

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

  const toggleQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')

    if (isActive) {
      params.delete('category')
    } else {
      params.set('category', category.slug || String(category.id))
    }

    const newParams = params.toString()
    router.push(newParams ? `${pathname}?${newParams}` : pathname)
  }, [category.id, category.slug, isActive, pathname, router, searchParams])

  return (
    <div
      onClick={toggleQuery}
      className="cursor-pointer py-1 flex items-center hover:text-[#1677ff] transition-colors"
    >
      <Radio checked={isActive} className="text-sm pointer-events-none">
        {category.title}
      </Radio>
    </div>
  )
}
