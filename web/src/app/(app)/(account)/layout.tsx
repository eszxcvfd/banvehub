import type { ReactNode } from 'react'

import { headers as getHeaders } from 'next/headers.js'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RenderParams } from '@/components/RenderParams'
import { AccountNav } from '@/components/AccountNav'
import { NotificationsNavLink } from './NotificationsNavLink'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  return (
    <div>
      <div className="container">
        <RenderParams className="" />
      </div>

      <div className="container mt-16 pb-8 flex gap-8">
        {user && (
          // §25 #21 entry point. The notifications link is rendered as a sibling of the shared
          // `AccountNav` (which this increment may not edit) inside the same aside column, with
          // the same Button/link idiom, so the account area keeps one visual navigation.
          <div className="max-w-62 grow flex-col items-start gap-4 hidden md:flex">
            <NotificationsNavLink className="w-full" />
            <AccountNav className="w-full" />
          </div>
        )}

        <div className="flex flex-col gap-12 grow">{children}</div>
      </div>
    </div>
  )
}
