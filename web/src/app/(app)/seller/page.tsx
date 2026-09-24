import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { checkRole } from '@/access/utilities'
import { getSellerBalance } from '@/services/earnings'
import {
  SellerDashboardClient,
  type ProductEarningStat,
  type SellerProductItem,
} from './SellerDashboardClient'
import type { WithdrawalItem } from './WithdrawalHistoryTable'

export const metadata = {
  title: 'Kênh người bán | KienTaoHub',
  description: 'Quản lý tài chính, doanh thu, số dư và dữ liệu bán hàng của bạn tại đây.',
}

export default async function SellerDashboardPage() {
  const headers = await getHeaders()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect(`/login?warning=${encodeURIComponent('Vui lòng đăng nhập để truy cập Seller Dashboard.')}`)
  }

  // If not seller or admin, redirect to onboarding
  if (!checkRole(['seller', 'admin'], user)) {
    redirect('/seller/register')
  }

  // Load all dashboard data and taxonomies concurrently for speed & low memory footprint
  const [
    profileRes,
    balance,
    withdrawalsRes,
    earningsRes,
    productsRes,
    categoriesRes,
    softwareRes,
    tagsRes,
  ] = await Promise.all([
    payload.find({
      collection: 'seller_profiles',
      where: { user: { equals: user.id } },
      overrideAccess: true,
      limit: 1,
    }),
    getSellerBalance(payload, user.id),
    payload.find({
      collection: 'withdrawals',
      where: { seller: { equals: user.id } },
      sort: '-createdAt',
      limit: 50,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'seller_earnings',
      where: { seller: { equals: user.id } },
      limit: 1000,
      overrideAccess: true,
      depth: 1,
    }),
    payload.find({
      collection: 'products',
      where: { seller: { equals: user.id } },
      overrideAccess: true,
      sort: '-createdAt',
      limit: 100,
    }),
    payload.find({ collection: 'categories', limit: 100, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'software_types', limit: 100, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'tags', limit: 100, pagination: false, overrideAccess: true }),
  ])

  const profileDoc = profileRes.docs[0] as any

  const formattedWithdrawals: WithdrawalItem[] = withdrawalsRes.docs.map((w: any) => ({
    id: Number(w.id),
    code: w.code,
    amount: Number(w.amount),
    currency: w.currency,
    status: w.status,
    bankInfo: w.bankInfo || null,
    requestedAt: w.requestedAt,
    createdAt: w.createdAt,
  }))

  const productStatsMap = new Map<string | number, ProductEarningStat>()

  for (const doc of earningsRes.docs) {
    if (doc.status === 'REVERSED') continue
    const prod = doc.product
    const prodId = typeof prod === 'object' && prod !== null ? prod.id : prod || 'unknown'
    const prodTitle =
      typeof prod === 'object' && prod !== null && (prod as any).title
        ? (prod as any).title
        : `Sản phẩm #${prodId}`

    const existing = productStatsMap.get(prodId) || {
      productId: prodId,
      productTitle: prodTitle,
      salesCount: 0,
      grossRevenue: 0,
      platformFee: 0,
      netEarnings: 0,
    }

    existing.salesCount += 1
    existing.grossRevenue += Number(doc.salePrice || 0)
    existing.platformFee += Number(doc.platformFee || 0)
    existing.netEarnings += Number(doc.sellerAmount || 0)

    productStatsMap.set(prodId, existing)
  }

  const productEarningsList = Array.from(productStatsMap.values())

  const serializedProducts: SellerProductItem[] = productsRes.docs.map((p: any) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    price: p.price,
    isFree: p.isFree,
    moderationStatus: p.moderationStatus,
    moderationNotes: p.moderationNotes,
    _status: p._status,
    technicalSpecs: p.technicalSpecs
      ? {
          fileFormat: p.technicalSpecs.fileFormat,
          softwareVersion: p.technicalSpecs.softwareVersion,
        }
      : null,
    createdAt: p.createdAt,
  }))

  return (
    <SellerDashboardClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
      }}
      profile={
        profileDoc
          ? {
              displayName: profileDoc.displayName,
              bio: profileDoc.bio,
              status: profileDoc.status,
            }
          : null
      }
      balance={balance}
      withdrawals={formattedWithdrawals}
      productEarningsList={productEarningsList}
      products={serializedProducts}
      categories={categoriesRes.docs.map((c: any) => ({ id: c.id, title: c.title }))}
      softwareTypes={softwareRes.docs.map((s: any) => ({ id: s.id, title: s.title }))}
      tags={tagsRes.docs.map((t: any) => ({ id: t.id, title: t.title }))}
    />
  )
}
