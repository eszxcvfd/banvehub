import type { Access, Where } from 'payload'
import { checkRole } from '@/access/utilities'

/**
 * Read access for comments:
 * - Admin and Moderator can view all comments (published, pending, hidden).
 * - Authenticated users can view published comments OR their own comments.
 * - Public / Unauthenticated users can view published comments.
 */
export const commentReadAccess: Access = ({ req: { user } }) => {
  if (user && checkRole(['admin', 'moderator'], user)) {
    return true
  }

  if (user) {
    const query: Where = {
      or: [
        {
          status: {
            equals: 'published',
          },
        },
        {
          user: {
            equals: user.id,
          },
        },
      ],
    }
    return query
  }

  return {
    status: {
      equals: 'published',
    },
  }
}

/**
 * Create access for comments:
 * - Only authenticated users (buyers, visitors, sellers, admins) can create comments.
 */
export const commentCreateAccess: Access = ({ req: { user } }) => {
  return Boolean(user)
}

/**
 * Update access for comments:
 * - Admin and Moderator can update any comment.
 * - Comment author can update their own comment.
 */
export const commentUpdateAccess: Access = ({ req: { user } }) => {
  if (!user) return false

  if (checkRole(['admin', 'moderator'], user)) {
    return true
  }

  return {
    user: {
      equals: user.id,
    },
  }
}

/**
 * Delete access for comments:
 * - Only Admin can hard-delete comment records from the database.
 * - Author soft-delete / hide is managed via status update ('hidden').
 */
export const commentDeleteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  return checkRole(['admin'], user)
}
