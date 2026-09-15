'use client'
import React, { useCallback, useMemo } from 'react'

import type { SoftwareType } from '@/payload-types'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import clsx from 'clsx'

type Props = {
  software: SoftwareType
}

export const SoftwareTypeItem: React.FC<Props> = ({ software }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = useMemo(() => {
    const current = searchParams.get('softwareType') || searchParams.get('software')
    return current === software.slug || current === String(software.id)
  }, [software.id, software.slug, searchParams])

  const setQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (isActive) {
      params.delete('softwareType')
      params.delete('software')
    } else {
      params.set('softwareType', software.slug || String(software.id))
      params.delete('software')
    }

    const newParams = params.toString()

    router.push(newParams ? `${pathname}?${newParams}` : pathname)
  }, [software.id, software.slug, isActive, pathname, router, searchParams])

  return (
    <button
      onClick={() => setQuery()}
      className={clsx('hover:cursor-pointer text-left', {
        ' underline font-medium text-foreground': isActive,
        ' text-muted-foreground hover:text-foreground': !isActive,
      })}
    >
      {software.title}
    </button>
  )
}
