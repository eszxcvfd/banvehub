import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React from 'react'
import { LogoutPage } from './LogoutPage'

export default async function Logout() {
  return (
    <main className="w-full min-h-[calc(100vh-200px)] py-12 md:py-20 px-4 sm:px-6 flex items-center justify-center bg-muted/20">
      <div className="w-full max-w-xl bg-card border border-border/80 rounded-2xl p-6 sm:p-10 shadow-xs">
        <LogoutPage />
      </div>
    </main>
  )
}

export const metadata: Metadata = {
  description: 'Bạn đã đăng xuất an toàn khỏi hệ thống KienTaoHub.',
  openGraph: mergeOpenGraph({
    title: 'Đăng xuất',
    url: '/logout',
    description: 'Bạn đã đăng xuất an toàn khỏi hệ thống KienTaoHub.',
  }),
  title: 'Đăng xuất',
}
