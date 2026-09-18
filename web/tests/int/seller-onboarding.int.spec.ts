import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@/payload-types'

describe('Seller Onboarding & Profiles Integration Tests (PLAN.md FR-24, FLOW-U10)', () => {
  let payload: Payload
  let bootstrapUser: User

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
    const timestamp = Date.now()

    // `ensureFirstUserIsAdmin` (src/collections/Users/hooks) appends 'admin' to the roles of the
    // FIRST user created while the users table is EMPTY - which is exactly the CI state: CI applies
    // only the versioned migrations and every spec's afterAll deletes its own users, so each spec
    // file can start from an empty table. This suite builds its fixtures inside the tests below, so
    // the very first `createUser()` of the file would be promoted; absorb the promotion here with a
    // throwaway user BEFORE any test runs, otherwise `buyerUser` is silently ['buyer', 'admin'] and
    // the onboarding eligibility rule this suite proves is evaluated against an admin account.
    bootstrapUser = await createUser(
      `bootstrap-onboard-${timestamp}-${getSeq()}@kientaohub.local`,
      ['buyer'],
    )
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
    // Guard: the fixture must hold EXACTLY the role it declares, whether or not the users table
    // started empty (the bootstrap user in beforeAll owns the first-user promotion). If the
    // promotion ever lands here again this fails loudly instead of silently exercising the
    // onboarding flow as an admin.
    expect(buyerUser.roles).toEqual(['buyer'])
    expect(buyerUser.roles).not.toContain('admin')

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
