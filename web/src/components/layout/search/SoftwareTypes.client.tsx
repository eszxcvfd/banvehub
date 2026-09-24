'use client'

import React, { useCallback, useMemo } from 'react'
import type { SoftwareType } from '@/payload-types'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { Checkbox } from 'antd'

type Props = {
  software: SoftwareType
}

export const SoftwareTypeItem: React.FC<Props> = ({ software }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectedList = useMemo(() => {
    const current = searchParams.get('softwareType') || searchParams.get('software') || ''
    if (!current) return []
    return current.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  }, [searchParams])

  const slug = (software.slug || String(software.id)).toLowerCase()
  const isActive = useMemo(() => {
    return selectedList.includes(slug)
  }, [selectedList, slug])

  const toggleQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    params.delete('software') // Clean up legacy alias

    let updated: string[]
    if (isActive) {
      updated = selectedList.filter((s) => s !== slug)
    } else {
      updated = [...selectedList, slug]
    }

    if (updated.length > 0) {
      params.set('softwareType', updated.join(','))
    } else {
      params.delete('softwareType')
    }

    const newParams = params.toString()
    router.push(newParams ? `${pathname}?${newParams}` : pathname)
  }, [isActive, pathname, router, searchParams, selectedList, slug])

  return (
    <div
      onClick={toggleQuery}
      className="cursor-pointer py-1 flex items-center hover:text-[#1677ff] transition-colors"
    >
      <Checkbox checked={isActive} className="text-sm pointer-events-none">
        {software.title}
      </Checkbox>
    </div>
  )
}
