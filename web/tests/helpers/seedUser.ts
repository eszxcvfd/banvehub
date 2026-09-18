import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user.
  //
  // The role MUST be set explicitly: the e2e suite runs against the seeded dev database, where the
  // users table is already populated, so the `ensureFirstUserIsAdmin` hook in
  // src/collections/Users/hooks/ (which only promotes the FIRST user created while the table is
  // EMPTY) never fires here. Without `roles` the fixture is a role-less user and Payload answers
  // "Unauthorized, this user does not have access to the admin panel" on every login.
  await payload.create({
    collection: 'users',
    data: {
      ...testUser,
      roles: ['admin'],
    },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
