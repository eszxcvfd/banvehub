import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers as getHeaders } from 'next/headers'

export async function POST(req: Request) {
  try {
    const headers = await getHeaders()
    const payload = await getPayload({ config: configPromise })
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json({ error: 'Yêu cầu đăng nhập để thực hiện thao tác này.' }, { status: 401 })
    }

    const body = await req.json()
    const {
      displayName,
      bio,
      phone,
      bankName,
      accountNumber,
      accountHolderName,
      sellerTermsAccepted,
    } = body

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2) {
      return NextResponse.json({ error: 'Tên thương hiệu / người bán không hợp lệ (tối thiểu 2 ký tự).' }, { status: 400 })
    }

    if (!sellerTermsAccepted) {
      return NextResponse.json({ error: 'Bạn phải đồng ý với Điều khoản dành cho Người bán.' }, { status: 400 })
    }

    // Check if profile already exists
    const existing = await payload.find({
      collection: 'seller_profiles',
      where: {
        user: {
          equals: user.id,
        },
      },
      overrideAccess: true,
      limit: 1,
    })

    const cleanSlug = `${displayName
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}-${user.id}`

    let profileDoc
    if (existing.totalDocs > 0) {
      profileDoc = await payload.update({
        collection: 'seller_profiles',
        id: existing.docs[0].id,
        data: {
          displayName,
          slug: cleanSlug,
          bio: bio || '',
          phone: phone || '',
          payoutInfo: {
            bankName: bankName || '',
            accountNumber: accountNumber || '',
            accountHolderName: accountHolderName || '',
          },
          sellerTermsAccepted: true,
          status: 'active',
        },
        overrideAccess: true,
      })
    } else {
      profileDoc = await payload.create({
        collection: 'seller_profiles',
        data: {
          user: user.id,
          displayName,
          slug: cleanSlug,
          bio: bio || '',
          phone: phone || '',
          payoutInfo: {
            bankName: bankName || '',
            accountNumber: accountNumber || '',
            accountHolderName: accountHolderName || '',
          },
          sellerTermsAccepted: true,
          status: 'active',
        },
        overrideAccess: true,
      })
    }

    // Ensure user has seller role
    if (!user.roles?.includes('seller')) {
      const currentRoles = user.roles || ['buyer']
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          roles: [...currentRoles, 'seller'],
        },
        overrideAccess: true,
      })
    }

    return NextResponse.json({ success: true, profile: profileDoc }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi xử lý đăng ký người bán.' }, { status: 500 })
  }
}
