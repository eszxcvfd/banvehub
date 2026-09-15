import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { canEditMoney } from '@/access/canEditMoney'
import type { User } from '@/payload-types'

/**
 * PLAN.md §22 authorization matrix, exercised through the local API with
 * `overrideAccess: false` so the collection access rules actually run.
 *
 * Rows covered here:
 * - Create product: Seller, Admin
 * - Moderate product (update): Moderator, Admin
 * - Manage roles (another account's document): Admin only
 * - Balance adjustment: denied for every principal (decision 0002)
 *
 * Rows whose entities do not exist yet (purchase, download, ledger,
 * withdrawal) are not covered and are owned by their slices.
 */

let payload: Payload

const createdUserIDs: (number | string)[] = []
const createdProductIDs: (number | string)[] = []

// Product slugs are unique, so every created product needs its own title.
let productSequence = 0

type TestUser = Awaited<ReturnType<typeof createUser>>

const createUser = async (email: string, roles: User['roles']) => {
  const user = await payload.create({
    collection: 'users',
    data: { email, password: 'rbac-test-password', name: email, roles },
    overrideAccess: true,
  })
  createdUserIDs.push(user.id)
  return user
}

describe('PLAN.md §22 authorization matrix', () => {
  let admin: TestUser
  let buyer: TestUser
  let seller: TestUser
  let moderator: TestUser
  let financeAdmin: TestUser

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    admin = await createUser('rbac-admin@example.test', ['admin'])
    buyer = await createUser('rbac-buyer@example.test', ['buyer'])
    seller = await createUser('rbac-seller@example.test', ['seller'])
    moderator = await createUser('rbac-moderator@example.test', ['moderator'])
    financeAdmin = await createUser('rbac-finance@example.test', ['financeAdmin'])
  })

  afterAll(async () => {
    for (const id of createdProductIDs) {
      await payload
        .delete({ collection: 'products', id, overrideAccess: true })
        .catch(() => undefined)
    }
    for (const id of createdUserIDs) {
      await payload
        .delete({ collection: 'users', id, overrideAccess: true })
        .catch(() => undefined)
    }
  })

  const createProductAs = (user: unknown) => {
    productSequence += 1
    return payload.create({
      collection: 'products',
      // The products collection is draft-enabled, so a partial document is only
      // valid as a draft.
      draft: true,
      data: { title: `RBAC matrix product ${productSequence}` },
      overrideAccess: false,
      user: user as never,
    })
  }

  describe('Create product: Seller and Admin only', () => {
    it('denies an anonymous caller', async () => {
      await expect(createProductAs(undefined)).rejects.toThrow()
    })

    it('denies a buyer', async () => {
      await expect(createProductAs(buyer)).rejects.toThrow()
    })

    it('denies a moderator', async () => {
      await expect(createProductAs(moderator)).rejects.toThrow()
    })

    it('denies a finance admin', async () => {
      await expect(createProductAs(financeAdmin)).rejects.toThrow()
    })

    it('allows a seller', async () => {
      const product = await createProductAs(seller)
      createdProductIDs.push(product.id)
      expect(product.id).toBeDefined()
    })

    it('allows an admin', async () => {
      const product = await createProductAs(admin)
      createdProductIDs.push(product.id)
      expect(product.id).toBeDefined()
    })
  })

  describe('Moderate product (update): Moderator and Admin only', () => {
    let productID: number | string

    beforeAll(async () => {
      const product = await createProductAs(admin)
      createdProductIDs.push(product.id)
      productID = product.id
    })

    const updateProductAs = (user: unknown) =>
      payload.update({
        collection: 'products',
        id: productID,
        data: { title: 'Moderated' },
        overrideAccess: false,
        user: user as never,
      })

    it('denies a buyer', async () => {
      await expect(updateProductAs(buyer)).rejects.toThrow()
    })

    it('denies a seller', async () => {
      await expect(updateProductAs(seller)).rejects.toThrow()
    })

    it('allows a moderator', async () => {
      const updated = await updateProductAs(moderator)
      expect(updated.title).toBe('Moderated')
    })

    it('allows an admin', async () => {
      const updated = await updateProductAs(admin)
      expect(updated.title).toBe('Moderated')
    })
  })

  describe('Manage roles: Admin only', () => {
    it('denies a buyer updating another account', async () => {
      await expect(
        payload.update({
          collection: 'users',
          id: seller.id,
          data: { name: 'hijacked' },
          overrideAccess: false,
          user: buyer as never,
        }),
      ).rejects.toThrow()
    })

    it('denies a moderator updating another account', async () => {
      await expect(
        payload.update({
          collection: 'users',
          id: seller.id,
          data: { name: 'hijacked' },
          overrideAccess: false,
          user: moderator as never,
        }),
      ).rejects.toThrow()
    })

    it('allows an admin updating another account', async () => {
      const updated = await payload.update({
        collection: 'users',
        id: seller.id,
        data: { name: 'renamed by admin' },
        overrideAccess: false,
        user: admin as never,
      })
      expect(updated.name).toBe('renamed by admin')
    })
  })

  describe('Balance adjustment: denied for every principal', () => {
    it('denies administrators too, because only the money write path may move money', () => {
      expect(canEditMoney({ req: { user: admin } } as never)).toBe(false)
      expect(canEditMoney({ req: { user: financeAdmin } } as never)).toBe(false)
      expect(canEditMoney({ req: { user: null } } as never)).toBe(false)
    })
  })
})
