import type { Metadata } from 'next'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'
import { headers as getHeaders } from 'next/headers.js'
import configPromise from '@payload-config'
import { Order } from '@/payload-types'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import { AccountClientView } from './AccountClientView'

export default async function AccountPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  let orders: Order[] | null = null

  if (!user) {
    redirect(
      `/login?warning=${encodeURIComponent('Please login to access your account settings.')}`,
    )
  }

  try {
    const ordersResult = await payload.find({
      collection: 'orders',
      limit: 5,
      user,
      overrideAccess: false,
      pagination: false,
      where: {
        buyer: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
    })

    orders = ordersResult?.docs || []
  } catch (_error) {
    // Graceful fallback during static build
  }

  return <AccountClientView orders={orders} />
}

export const metadata: Metadata = {
  description: 'Manage your account settings and preferences.',
  openGraph: mergeOpenGraph({
    title: 'Account',
    url: '/account',
  }),
  title: 'Account',
}
