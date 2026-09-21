/**
 * Challenger spec (t33): the buyer order surfaces show a product's version only when the record
 * carries one (decision `docs/decisions/0018-product-attributes-come-from-the-record.md`, clause 2).
 *
 * The order page used to build the value as
 * `technicalSpecs.softwareVersion || technicalSpecs.version || (product.softwareSupport ? … : 'Tất cả
 * phiên bản')` — two of those three branches name fields that do not exist on the Products schema
 * (`technicalSpecs` is exactly fileFormat/softwareVersion/fileSize/unit), so every versionless product
 * was printed as `Tất cả phiên bản`. This spec renders both directions at the client boundary:
 *
 *   1. an item whose product carries a version renders exactly that value;
 *   2. an item whose product carries none renders no version claim at all — the cell says
 *      'Chưa khai báo' (the honest statement chosen for the table) and the fabricated literal is absent.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrderDetailClient, type OrderDetailItem } from '@/components/orders/OrderDetailClient'
import { AntdConfigProvider } from '@/providers/Antd'

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = MockResizeObserver

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/orders/1',
  useSearchParams: () => new URLSearchParams(),
}))

const baseItem = {
  key: 'item-1',
  id: 1,
  productId: 159,
  productTitle: 'Bản vẽ cảnh quan khu lăng mộ',
  productSlug: 'san-pham-159',
  format: '.dwg',
  salePrice: 320000,
}

const renderOrder = (items: OrderDetailItem[]) =>
  render(
    <AntdConfigProvider>
      <OrderDetailClient
        order={{ id: 1, code: 'ORD-1', createdAt: '2026-09-21T00:00:00.000Z', status: 'COMPLETED', totalAmount: 320000, currency: 'VND' }}
        user={{ id: 9, email: 'buyer01@kientaohub.vn', name: 'Nguyễn Văn An' }}
        orderItems={items}
        productsList={[]}
        tickets={[]}
      />
    </AntdConfigProvider>,
  )

describe('t33: the order surfaces claim a version only when the record holds one', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the record own version exactly', () => {
    renderOrder([{ ...baseItem, softwareVersion: 'AutoCAD 2022+' }])

    expect(screen.getByText('AutoCAD 2022+')).toBeDefined()
    // the fabricated chain value must never appear, whatever the record holds
    expect(screen.queryByText('Tất cả phiên bản')).toBeNull()
  })

  it('renders no version claim for a product whose record has none', () => {
    renderOrder([{ ...baseItem, key: 'item-2', id: 2, softwareVersion: undefined }])

    // no fabricated literal, and no Tag standing in for a version
    expect(screen.queryByText('Tất cả phiên bản')).toBeNull()
    expect(screen.queryByText(/^(AutoCAD|Revit|SketchUp)/)).toBeNull()
    expect(screen.getByText('Chưa khai báo')).toBeDefined()
  })

  it('labels the Định dạng cell from the record, not from a default', () => {
    // `.skp` and `.max` used to fall through getFormatTag's CAD / DWG default (t38-F1)
    renderOrder([{ ...baseItem, format: '.skp' }])
    expect(screen.getByText('SKETCHUP')).toBeDefined()
    expect(screen.queryByText('CAD / DWG')).toBeNull()
  })

  it('maps every format the record stores to its own tag', () => {
    // one case per distinct stored value: .dwg, .rvt, .skp, .max, .pdf, .ls
    const cases: Array<[string, string]> = [
      ['.dwg', 'CAD / DWG'],
      ['.rvt', 'BIM / REVIT'],
      ['.skp', 'SKETCHUP'],
      ['.max', '3DS MAX'],
      ['.pdf', 'TÀI LIỆU'],
      ['.ls', 'LUMION'],
    ]
    for (const [format, expected] of cases) {
      cleanup()
      renderOrder([{ ...baseItem, format }])
      expect(screen.getByText(expected)).toBeDefined()
      for (const [, other] of cases) {
        if (other !== expected) expect(screen.queryByText(other)).toBeNull()
      }
    }
  })

  it('never reads a free-text value as LUMION', () => {
    // `technicalSpecs.fileFormat` is seller-written free text; 'LS' as a bare substring captured these
    for (const value of ['Models', 'Tools', 'CAD Models']) {
      cleanup()
      renderOrder([{ ...baseItem, format: value }])
      expect(screen.queryByText('LUMION')).toBeNull()
      // the same honest absence an empty record gets (the version cell may render it too)
      expect(screen.getAllByText('Chưa khai báo').length).toBeGreaterThan(0)
    }
    // …while the record's real LUMION token still maps
    cleanup()
    renderOrder([{ ...baseItem, format: '.ls' }])
    expect(screen.getByText('LUMION')).toBeDefined()
  })

  it('renders the honest absence when the record carries no format', () => {
    renderOrder([{ ...baseItem, format: undefined }])
    expect(screen.queryByText('CAD / DWG')).toBeNull()
    expect(screen.getAllByText('Chưa khai báo').length).toBeGreaterThan(0)
  })

  it('handles a mixed order: one item with a version, one without', () => {
    renderOrder([
      { ...baseItem, softwareVersion: 'SketchUp 2022+' },
      { ...baseItem, key: 'item-3', id: 3, productTitle: 'Bản vẽ khác', softwareVersion: undefined },
    ])

    expect(screen.getByText('SketchUp 2022+')).toBeDefined()
    expect(screen.getByText('Chưa khai báo')).toBeDefined()
    expect(screen.queryByText('Tất cả phiên bản')).toBeNull()
  })
})
