import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import React, { Suspense } from 'react'
import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import { ForgotPasswordForm } from '@/components/forms/ForgotPasswordForm'
import { ShieldCheck, Headphones } from 'lucide-react'
import Link from 'next/link'

export default async function ForgotPasswordPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (user) {
    redirect(`/account?warning=${encodeURIComponent('Bạn đã đăng nhập vào hệ thống.')}`)
  }

  return (
    <div className="w-full min-h-[calc(100vh-140px)] py-8 md:py-12 lg:py-16 px-3 sm:px-6 lg:px-8 flex items-center justify-center bg-muted/20">
      <div className="w-full max-w-lg mx-auto bg-card border border-border/80 rounded-2xl p-5 sm:p-8 lg:p-10 shadow-xs">
        <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Đang tải form...</div>}>
          <ForgotPasswordForm />
        </Suspense>

        {/* Quick Customer Support & Trust Bar */}
        <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Headphones className="size-3.5 text-primary shrink-0" aria-hidden="true" />
            <span>
              Hỗ trợ:{' '}
              <a href="tel:19006868" className="text-foreground font-semibold hover:underline">
                1900 6868
              </a>
            </span>
          </span>
          <span className="hidden sm:inline text-muted-foreground/30">•</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Bảo mật 100%</span>
          </span>
          <span className="hidden sm:inline text-muted-foreground/30">•</span>
          <Link href="/shop" className="hover:text-foreground hover:underline transition-colors">
            Khám phá bản vẽ
          </Link>
        </div>
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Khôi phục mật khẩu tài khoản KienTaoHub an toàn và nhanh chóng.',
  openGraph: mergeOpenGraph({
    title: 'Quên mật khẩu | KienTaoHub',
    url: '/forgot-password',
    description: 'Khôi phục mật khẩu tài khoản KienTaoHub an toàn và nhanh chóng.',
  }),
  title: 'Quên mật khẩu | KienTaoHub',
}
