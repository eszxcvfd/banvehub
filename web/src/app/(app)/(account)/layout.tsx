import type { ReactNode } from 'react'
import { headers as getHeaders } from 'next/headers.js'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RenderParams } from '@/components/RenderParams'
import { AccountDashboardLayout } from '@/components/AccountNav/AccountDashboardLayout'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  return (
    <div className="min-h-screen py-6 sm:py-8 bg-[#f8fafc]">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <RenderParams className="mb-4" />
        {user ? (
          <AccountDashboardLayout initialUser={user as any}>
            {children}
          </AccountDashboardLayout>
        ) : (
          <div className="max-w-4xl mx-auto">{children}</div>
        )}
      </div>
    </div>
  )
}
