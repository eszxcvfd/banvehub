'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { Radio, Slider, Space, Typography, type RadioChangeEvent } from 'antd'

const MAX_PRICE = 2000000
const MIN_PRICE = 0
const STEP = 50000

export function PriceFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isFreeParam = searchParams.get('isFree')
  const priceTypeParam = searchParams.get('priceType')
  const minPriceParam = searchParams.get('minPrice')
  const maxPriceParam = searchParams.get('maxPrice')

  const currentPriceType = useMemo(() => {
    if (isFreeParam === 'true' || priceTypeParam === 'free') return 'free'
    if (isFreeParam === 'false' || priceTypeParam === 'paid') return 'paid'
    return 'all'
  }, [isFreeParam, priceTypeParam])

  const parsedMin = minPriceParam ? parseInt(minPriceParam, 10) : MIN_PRICE
  const parsedMax = maxPriceParam ? parseInt(maxPriceParam, 10) : MAX_PRICE
  const [sliderRange, setSliderRange] = useState<[number, number]>([
    isNaN(parsedMin) ? MIN_PRICE : parsedMin,
    isNaN(parsedMax) ? MAX_PRICE : parsedMax,
  ])

  const [prevParams, setPrevParams] = useState({ minPriceParam, maxPriceParam })
  if (prevParams.minPriceParam !== minPriceParam || prevParams.maxPriceParam !== maxPriceParam) {
    setPrevParams({ minPriceParam, maxPriceParam })
    const newMin = minPriceParam ? parseInt(minPriceParam, 10) : MIN_PRICE
    const newMax = maxPriceParam ? parseInt(maxPriceParam, 10) : MAX_PRICE
    setSliderRange([
      isNaN(newMin) ? MIN_PRICE : newMin,
      isNaN(newMax) ? MAX_PRICE : newMax,
    ])
  }

  const handlePriceTypeChange = useCallback(
    (e: RadioChangeEvent) => {
      const type = e.target.value
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      params.delete('priceType')

      if (type === 'free') {
        params.set('isFree', 'true')
        params.set('priceType', 'free')
        params.delete('minPrice')
        params.delete('maxPrice')
      } else if (type === 'paid') {
        params.set('isFree', 'false')
        params.set('priceType', 'paid')
      } else {
        params.delete('isFree')
        params.delete('priceType')
      }

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const handleSliderAfterChange = useCallback(
    (values: number[]) => {
      const [min, max] = values
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')

      if (min > MIN_PRICE) {
        params.set('minPrice', String(min))
      } else {
        params.delete('minPrice')
      }

      if (max < MAX_PRICE) {
        params.set('maxPrice', String(max))
      } else {
        params.delete('maxPrice')
      }

      if (min > 0) {
        params.set('isFree', 'false')
        params.set('priceType', 'paid')
      }

      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const marks = {
    0: '0₫',
    500000: '500k',
    1000000: '1tr',
    2000000: '2tr₫',
  }

  return (
    <div>
      <Typography.Text strong className="block mb-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Loại giá
      </Typography.Text>

      <Radio.Group value={currentPriceType} onChange={handlePriceTypeChange} className="w-full mb-3">
        <Space orientation="vertical" className="w-full">
          <Radio value="all" className="text-sm">
            Tất cả
          </Radio>
          <Radio value="free" className="text-sm">
            Miễn phí
          </Radio>
          <Radio value="paid" className="text-sm">
            Có phí
          </Radio>
        </Space>
      </Radio.Group>

      {currentPriceType !== 'free' && (
        <div className="pt-2 px-1">
          <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
            <span>Khoảng giá:</span>
            <span className="font-semibold text-[#1677ff]">
              {sliderRange[0].toLocaleString('vi-VN')}₫ – {sliderRange[1].toLocaleString('vi-VN')}₫
            </span>
          </div>
          <Slider
            range
            min={MIN_PRICE}
            max={MAX_PRICE}
            step={STEP}
            marks={marks}
            value={sliderRange}
            onChange={(val) => setSliderRange(val as [number, number])}
            onChangeComplete={handleSliderAfterChange}
            tooltip={{
              formatter: (val) => `${val?.toLocaleString('vi-VN')} ₫`,
            }}
          />
        </div>
      )}
    </div>
  )
}
