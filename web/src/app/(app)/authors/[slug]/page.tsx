import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'
import type { Media, Product, SellerProfile, User } from '@/payload-types'
import { getProductStats } from '@/components/product/productStats'
import { storefrontVisibilityWhere } from '@/utilities/storefrontVisibility'
import { AuthorProfileView } from './AuthorProfileView'

type PageArgs = {
  params: Promise<{
    slug: string
  }>
}

async function getAuthorData(payload: Payload, rawSlug: string) {
  const decodedSlug = decodeURIComponent(rawSlug).trim()
  const isNumeric = /^\d+$/.test(decodedSlug) && Number(decodedSlug) <= 2147483647
  const num = isNumeric ? Number(decodedSlug) : null

  // 1. Try finding seller_profile by slug, id, or user
  const profileRes = await payload.find({
    collection: 'seller_profiles',
    where: num !== null
      ? {
          or: [
            { slug: { equals: decodedSlug } },
            { id: { equals: num } },
            { user: { equals: num } },
          ],
        }
      : { slug: { equals: decodedSlug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  if (profileRes.docs.length > 0) {
    const profile = profileRes.docs[0] as SellerProfile
    const authorUserId = typeof profile.user === 'object' && profile.user !== null
      ? profile.user.id
      : Number(profile.user)

    const avatarUrl =
      typeof profile.avatar === 'object' && profile.avatar !== null
        ? (profile.avatar as Media).url ?? null
        : null

    return {
      profile,
      userId: authorUserId,
      displayName: profile.displayName,
      bio: profile.bio ?? null,
      avatarUrl,
      createdAt: profile.createdAt,
    }
  }

  // 2. Fallback: check users collection by numeric ID if profile is absent
  if (num !== null) {
    const userRes = await payload.find({
      collection: 'users',
      where: { id: { equals: num } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (userRes.docs.length > 0) {
      const user = userRes.docs[0] as User
      return {
        profile: null,
        userId: user.id,
        displayName: user.name || `Tác giả #${user.id}`,
        bio: null,
        avatarUrl: null,
        createdAt: user.createdAt,
      }
    }
  }

  return null
}

export async function generateMetadata({ params }: PageArgs): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const author = await getAuthorData(payload, slug)

  if (!author) {
    return {
      title: 'Không tìm thấy tác giả | KienTaoHub',
      description: 'Hồ sơ tác giả không tồn tại hoặc đã bị gỡ bỏ.',
    }
  }

  const title = `${author.displayName} - Thông tin tác giả | KienTaoHub`
  const description =
    author.bio ||
    `Xem thông tin tác giả ${author.displayName} và các bản vẽ thiết kế, mô hình 3D chất lượng cao tại KienTaoHub.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `/authors/${slug}`,
    },
  }
}

export default async function AuthorProfilePage({ params }: PageArgs) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const author = await getAuthorData(payload, slug)

  if (!author) {
    return notFound()
  }

  // Query real published products by this author
  const productsRes = await payload.find({
    collection: 'products',
    where: {
      and: [
        { seller: { equals: author.userId } },
        storefrontVisibilityWhere(),
      ],
    },
    limit: 100,
    sort: '-createdAt',
    overrideAccess: true,
  })

  const authorProducts = productsRes.docs as Product[]
  const productIds = authorProducts.map((p) => p.id)

  // Real stats per product
  const statsMap = await getProductStats(productIds)

  return (
    <AuthorProfileView
      author={{
        userId: author.userId,
        displayName: author.displayName,
        bio: author.bio,
        avatarUrl: author.avatarUrl,
        createdAt: author.createdAt,
      }}
      products={authorProducts}
      statsMap={statsMap}
    />
  )
}
