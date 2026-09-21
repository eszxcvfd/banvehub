import type { Metadata } from 'next'

import { RenderParams } from '@/components/RenderParams'
import Link from 'next/link'
import React, { Suspense } from 'react'

import { headers as getHeaders } from 'next/headers'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { LoginForm } from '@/components/forms/LoginForm'
import { redirect } from 'next/navigation'
import { LoginBanner } from './LoginBanner'
import { ArrowLeft, Headphones, ShieldCheck, FileCheck } from 'lucide-react'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { storefrontVisibilityWhere } from '@/utilities/storefrontVisibility'

export default async function Login() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })

  // Decision 0010: the visibility rule has exactly one owner. Ask it for the clause instead of
  // inlining the published literal, so the banner's count can never drift from the catalog.
  const publishedProducts = await payload.count({
    collection: 'products',
    where: storefrontVisibilityWhere(),
    overrideAccess: true,
  })
  const { user } = await payload.auth({ headers })

  if (user) {
    redirect(`/account?warning=${encodeURIComponent('You are already logged in.')}`)
  }

  return (
    <div className="w-full min-h-[calc(100vh-140px)] py-8 md:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center bg-[#f8fafc] relative overflow-hidden">
      {/* Background Decorative Tech Elements */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.4] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="w-full max-w-5xl mx-auto relative z-10">
        {/* Unified Two-Panel Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch min-h-[660px]">
          {/* Left Column: Form Section */}
          <div className="w-full lg:col-span-7 p-6 sm:p-8 lg:p-10 xl:p-12 flex flex-col justify-between bg-white">
            <div>
              {/* Back to Home navigation */}
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#1677ff] transition-colors mb-6 group"
              >
                <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1 text-[#1677ff]" aria-hidden="true" />
                <span>Về trang chủ</span>
              </Link>

              {/* Header / Title */}
              <div className="mb-6">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1677ff] mb-1.5">
                  Cổng đăng nhập KienTaoHub
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Đăng nhập tài khoản
                </h1>
                <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Truy cập kho tài nguyên bản vẽ CAD, BIM và quản lý đơn hàng của bạn trên KienTaoHub.
                </p>
              </div>

              {/* RenderParams (Query Messages / Warnings) */}
              <RenderParams />

              {/* Interactive Login Form */}
              <Suspense fallback={<div className="py-8 text-center text-sm text-slate-400">Đang tải form...</div>}>
                <LoginForm />
              </Suspense>

              {/* Admin Dashboard Access Link (Preserved from original) */}
              <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-400">
                Bạn là quản trị viên hệ thống?{' '}
                <Link
                  href="/admin/collections/users"
                  className="font-medium text-slate-600 underline underline-offset-2 hover:text-[#1677ff] transition-colors"
                >
                  Đăng nhập trang quản trị
                </Link>
              </div>
            </div>

            {/* Quick Customer Support & Trust Bar (Khobanve inspiration) */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Headphones className="size-3.5 text-[#1677ff] shrink-0" aria-hidden="true" />
                <span>
                  Hỗ trợ:{' '}
                  <a
                    href="tel:19006868"
                    className="text-slate-900 font-bold hover:text-[#1677ff] transition-colors"
                  >
                    1900 6868
                  </a>
                </span>
              </span>
              <span className="hidden sm:inline text-slate-300">•</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>Bảo mật 100%</span>
              </span>
              <span className="hidden sm:inline text-slate-300">•</span>
              <Link
                href="/shop"
                className="hover:text-slate-900 hover:underline transition-colors"
              >
                Khám phá bản vẽ
              </Link>
            </div>
          </div>

          {/* Right Column: Branding / Value Proposition Banner (Desktop only) */}
          <div className="hidden lg:flex lg:col-span-5 h-full">
            <LoginBanner totalProducts={publishedProducts.totalDocs} />
          </div>
        </div>

        {/* Mobile-Only Trust Badges Strip */}
        <div className="lg:hidden mt-6 max-w-lg mx-auto w-full grid grid-cols-3 gap-2 text-center text-xs text-slate-500 px-1 sm:px-2">
          <div className="py-2.5 px-1 sm:px-1.5 rounded-xl bg-white border border-slate-200/80 flex flex-col items-center gap-1 shadow-2xs">
            <FileCheck className="size-4 text-[#1677ff]" aria-hidden="true" />
            <span className="font-semibold text-slate-800 text-[10px] sm:text-[11px]">Bản vẽ chuẩn</span>
          </div>
          <div className="py-2.5 px-1 sm:px-1.5 rounded-xl bg-white border border-slate-200/80 flex flex-col items-center gap-1 shadow-2xs">
            <ShieldCheck className="size-4 text-emerald-500" aria-hidden="true" />
            <span className="font-semibold text-slate-800 text-[10px] sm:text-[11px]">Tải tức thì</span>
          </div>
          <div className="py-2.5 px-1 sm:px-1.5 rounded-xl bg-white border border-slate-200/80 flex flex-col items-center gap-1 shadow-2xs">
            <Headphones className="size-4 text-blue-500" aria-hidden="true" />
            <span className="font-semibold text-slate-800 text-[10px] sm:text-[11px]">Hỗ trợ 24/7</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Đăng nhập tài khoản KienTaoHub để quản lý kho tài nguyên bản vẽ CAD, mô hình 3D và lịch sử đơn hàng.',
  openGraph: mergeOpenGraph({
    title: 'Đăng nhập',
    url: '/login',
    description: 'Đăng nhập tài khoản KienTaoHub để quản lý kho tài nguyên bản vẽ CAD, mô hình 3D và lịch sử đơn hàng.',
  }),
  title: 'Đăng nhập',
}
