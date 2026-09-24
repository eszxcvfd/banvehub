import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'

import { AdminBar } from '@/components/AdminBar'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { ensureStartsWith } from '@/utilities/ensureStartsWith'
import { getServerSideURL } from '@/utilities/getURL'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { Providers } from '@/providers'
import { InitTheme } from '@/providers/Theme/InitTheme'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import React from 'react'
import './globals.css'

const serverUrl = getServerSideURL()
const rawSiteName = process.env.SITE_NAME
const siteName = !rawSiteName || rawSiteName === 'Payload Commerce' ? 'KienTaoHub' : rawSiteName
const twitterCreator = process.env.TWITTER_CREATOR
  ? ensureStartsWith(process.env.TWITTER_CREATOR, '@')
  : undefined
const twitterSite = process.env.TWITTER_SITE
  ? ensureStartsWith(process.env.TWITTER_SITE, 'https://')
  : undefined

export const metadata: Metadata = {
  metadataBase: new URL(serverUrl),
  title: {
    default: 'KienTaoHub - Sàn giao dịch tài nguyên bản vẽ & mô hình kỹ thuật số',
    template: `%s | ${siteName}`,
  },
  description:
    'Sàn thương mại và chia sẻ tài nguyên bản vẽ CAD, mô hình 3D kiến trúc, BIM, kết cấu và MEP chất lượng cao.',
  openGraph: mergeOpenGraph({
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description:
      'Sàn thương mại và chia sẻ tài nguyên bản vẽ CAD, mô hình 3D kiến trúc, BIM, kết cấu và MEP chất lượng cao.',
    url: '/',
    siteName,
    locale: 'vi_VN',
    type: 'website',
  }),
  ...(twitterCreator || twitterSite
    ? {
        twitter: {
          card: 'summary_large_image',
          ...(twitterCreator ? { creator: twitterCreator } : {}),
          ...(twitterSite ? { site: twitterSite } : {}),
        },
      }
    : {
        twitter: {
          card: 'summary_large_image',
        },
      }),
  robots: {
    follow: true,
    index: true,
  },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={[GeistSans.variable, GeistMono.variable].filter(Boolean).join(' ')}
      lang="vi"
      suppressHydrationWarning
    >
      <head>
        <InitTheme />
        <link href="/favicon.ico" rel="icon" sizes="32x32" />
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body>
        <AntdRegistry>
          <Providers>
            <AdminBar />
            <LivePreviewListener />

            <Header />
            <main>{children}</main>
            <Footer />
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  )
}
