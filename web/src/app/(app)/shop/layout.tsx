import React, { Suspense } from 'react'
import Link from 'next/link'
import { Filter, RotateCcw } from 'lucide-react'
import { Categories } from '@/components/layout/search/Categories'
import { SoftwareTypes } from '@/components/layout/search/SoftwareTypes'
import { PriceFilter } from '@/components/layout/search/PriceFilter'
import { Search } from '@/components/Search'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Search className="mb-8" />

        <div className="flex flex-col lg:flex-row items-start gap-8">
          {/* Multi-Criteria Filter Sidebar */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="sticky top-24 shadow-xs rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800 mb-4">
                <span className="font-bold text-base flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <Filter className="w-4 h-4 text-[#1677ff]" /> Bộ lọc tìm kiếm
                </span>
              </div>

              <div className="flex flex-col gap-5">
                <Categories />
                <hr className="my-0 border-neutral-200 dark:border-neutral-800" />
                <SoftwareTypes />
                <hr className="my-0 border-neutral-200 dark:border-neutral-800" />
                <PriceFilter />
                <hr className="my-0 border-neutral-200 dark:border-neutral-800" />
                <Link href="/shop" className="block w-full">
                  <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Đặt lại bộ lọc</span>
                  </button>
                </Link>
              </div>
            </div>
          </aside>

          {/* Catalog Main Content */}
          <main className="w-full min-w-0 flex-grow">{children}</main>
        </div>
      </div>
    </Suspense>
  )
}
