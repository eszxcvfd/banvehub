import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'

describe('Seller Onboarding & Profiles Integration Tests (PLAN.md FR-24, FLOW-U10)', () => {
  let payload: Payload

  const cleanup = {
    sellerProfiles: [] as (number | string)[],
    users: [] as (number | string)[],
  }

  let seq = 0
  const getSeq = () => ++seq

  const createUser = async (email: string, roles: User['roles']): Promise<User> => {
    const user = await payload.create({
      collection: 'users',
      data: {
        email,
        password: 'test-password-seller-123',
        name: email.split('@')[0],
        roles,
      },
      overrideAccess: true,
    })
    cleanup.users.push(user.id)
    return user
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    for (const id of cleanup.sellerProfiles) {
      try {
        await payload.delete({ collection: 'seller_profiles', id, overrideAccess: true })
      } catch (_err) {}
    }
    for (const id of cleanup.users) {
      try {
        await payload.delete({ collection: 'users', id, overrideAccess: true })
      } catch (_err) {}
    }
  })

  it('allows an authenticated buyer to submit a seller profile with terms accepted', async () => {
    const buyerUser = await createUser(`buyer-onboard-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])
    const slug = `bim-studio-pro-${Date.now()}-${getSeq()}`

    const profile = await payload.create({
      collection: 'seller_profiles',
      data: {
        user: buyerUser.id,
        displayName: `BIM Studio Pro ${getSeq()}`,
        slug,
        bio: 'Chuyên cung cấp bản vẽ kiến trúc kết cấu Revit và AutoCAD',
        phone: '0987654321',
        payoutInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN BUYER',
        },
        sellerTermsAccepted: true,
        status: 'active',
      },
      overrideAccess: false,
      user: buyerUser,
    })
    cleanup.sellerProfiles.push(profile.id)

    expect(profile.id).toBeDefined()
    expect(profile.displayName).toContain('BIM Studio Pro')
    expect(profile.sellerTermsAccepted).toBe(true)
    expect(profile.sellerTermsAcceptedAt).toBeDefined()

    // Verify afterChange elevated the buyer to seller role
    const refreshedUser = await payload.findByID({
      collection: 'users',
      id: buyerUser.id,
      overrideAccess: true,
    })
    expect(refreshedUser.roles).toContain('seller')
  })

  it('denies an unauthenticated guest from creating a seller profile', async () => {
    const dummyUser = await createUser(`dummy-user-${Date.now()}-${getSeq()}@kientaohub.local`, ['buyer'])

    await expect(
      payload.create({
        collection: 'seller_profiles',
        data: {
          user: dummyUser.id,
          displayName: 'Anonymous Hacked Studio',
          slug: `anon-hacked-${Date.now()}-${getSeq()}`,
          sellerTermsAccepted: true,
        },
        overrideAccess: false,
        user: null,
      }),
    ).rejects.toThrow()
  })

  it('allows public guest to read active seller profiles for store attribution', async () => {
    const sellerUser = await createUser(`active-seller-${Date.now()}-${getSeq()}@kientaohub.local`, ['seller'])
    const slug = `public-studio-${Date.now()}-${getSeq()}`

    const activeProfile = await payload.create({
      collection: 'seller_profiles',
      data: {
        user: sellerUser.id,
        displayName: `Public Studio ${getSeq()}`,
        slug,
        sellerTermsAccepted: true,
        status: 'active',
      },
      overrideAccess: true,
    })
    cleanup.sellerProfiles.push(activeProfile.id)

    const guestRead = await payload.find({
      collection: 'seller_profiles',
      where: {
        id: {
          equals: activeProfile.id,
        },
      },
      overrideAccess: false,
      user: null,
    })

    expect(guestRead.totalDocs).toBe(1)
    expect(guestRead.docs[0].displayName).toBe(activeProfile.displayName)
  })

  it('prevents a seller from escalating their rating or sales numbers', async () => {
    const honestSeller = await createUser(`honest-seller-${Date.now()}-${getSeq()}@kientaohub.local`, ['seller'])
    const slug = `seller-honesty-${Date.now()}-${getSeq()}`

    const profile = await payload.create({
      collection: 'seller_profiles',
      data: {
        user: honestSeller.id,
        displayName: `Seller Honesty Test ${getSeq()}`,
        slug,
        sellerTermsAccepted: true,
        status: 'active',
        rating: 4.8,
        totalSales: 10,
      },
      overrideAccess: true,
    })
    cleanup.sellerProfiles.push(profile.id)

    // Seller attempts to fake 5.0 rating and 9999 sales
    await payload.update({
      collection: 'seller_profiles',
      id: profile.id,
      data: {
        rating: 5.0,
        totalSales: 9999,
        displayName: 'Renamed Studio',
      },
      overrideAccess: false,
      user: honestSeller,
    })

    const freshDoc = await payload.findByID({
      collection: 'seller_profiles',
      id: profile.id,
      overrideAccess: true,
    })

    // DisplayName changed, but administrative fields remained protected
    expect(freshDoc.displayName).toBe('Renamed Studio')
    expect(freshDoc.totalSales).toBe(10)
    expect(freshDoc.rating).toBe(4.8)
  })
})
