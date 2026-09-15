import type { MetadataRoute } from 'next'
import { getServerSideURL } from '@/utilities/getURL'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SERVER_URL || getServerSideURL()).replace(/\/+$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/shop', '/products/', '/_next/static/'],
        disallow: [
          '/admin/',
          '/account/',
          '/api/',
          '/checkout/',
          '/orders/',
          '/find-order',
          '/next/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
