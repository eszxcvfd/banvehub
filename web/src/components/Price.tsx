'use client'
import React from 'react'

type BaseProps = {
  className?: string
  currencyCodeClassName?: string
  as?: 'span' | 'p'
}

type PriceFixed = {
  amount: number
  currencyCode?: string
  highestAmount?: never
  lowestAmount?: never
}

type PriceRange = {
  amount?: never
  currencyCode?: string
  highestAmount: number
  lowestAmount: number
}

type Props = BaseProps & (PriceFixed | PriceRange)

/**
 * Standardize VND price formatting across KienTaoHub:
 * e.g. 390000 -> "390.000 ₫"
 */
export function formatVND(value?: number | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0 ₫'
  }
  return `${Number(value).toLocaleString('vi-VN')} ₫`
}

export const Price = ({
  amount,
  className,
  highestAmount,
  lowestAmount,
  currencyCode: currencyCodeFromProps,
  as = 'p',
}: Props & React.ComponentProps<'p'>) => {
  const Element = as

  // If a non-VND currency is explicitly passed (e.g. USD)
  if (currencyCodeFromProps && currencyCodeFromProps.toUpperCase() !== 'VND') {
    const isUSD = currencyCodeFromProps.toUpperCase() === 'USD'
    const formatter = new Intl.NumberFormat(isUSD ? 'en-US' : 'vi-VN', {
      style: 'currency',
      currency: currencyCodeFromProps,
    })

    if (typeof amount === 'number') {
      return (
        <Element className={className} suppressHydrationWarning>
          {formatter.format(amount)}
        </Element>
      )
    }

    if (highestAmount && highestAmount !== lowestAmount) {
      return (
        <Element className={className} suppressHydrationWarning>
          {`${formatter.format(lowestAmount)} - ${formatter.format(highestAmount)}`}
        </Element>
      )
    }

    if (lowestAmount) {
      return (
        <Element className={className} suppressHydrationWarning>
          {formatter.format(lowestAmount)}
        </Element>
      )
    }

    return null
  }

  // Default currency is Vietnamese Dong (VND)
  if (typeof amount === 'number') {
    return (
      <Element className={className} suppressHydrationWarning>
        {formatVND(amount)}
      </Element>
    )
  }

  if (highestAmount && highestAmount !== lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {`${formatVND(lowestAmount)} - ${formatVND(highestAmount)}`}
      </Element>
    )
  }

  if (lowestAmount) {
    return (
      <Element className={className} suppressHydrationWarning>
        {formatVND(lowestAmount)}
      </Element>
    )
  }

  return null
}

