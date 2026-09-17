import type { CollectionAfterChangeHook } from 'payload'

/**
 * Automatically cascade status changes from parent comments to their replies:
 * - When a parent comment is hidden (status = 'hidden'), cascade status = 'hidden'
 *   to all nested replies to prevent orphaned published replies from skewing counts
 *   or lingering in database queries.
 */
export const cascadeCommentStatus: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  if (operation !== 'update' || !previousDoc || doc.status === previousDoc.status) {
    return doc
  }

  try {
    if (doc.status === 'hidden' && previousDoc.status !== 'hidden') {
      await req.payload.update({
        collection: 'comments',
        where: {
          and: [
            { parent: { equals: doc.id } },
            { status: { not_equals: 'hidden' } },
          ],
        },
        data: {
          status: 'hidden',
        },
        context: {
          cascadeOperation: true,
        },
        overrideAccess: true,
      })
    } else if (doc.status === 'pending' && previousDoc.status === 'published') {
      await req.payload.update({
        collection: 'comments',
        where: {
          and: [
            { parent: { equals: doc.id } },
            { status: { equals: 'published' } },
          ],
        },
        data: {
          status: 'pending',
        },
        context: {
          cascadeOperation: true,
        },
        overrideAccess: true,
      })
    } else if (doc.status === 'published' && previousDoc.status === 'pending') {
      await req.payload.update({
        collection: 'comments',
        where: {
          and: [
            { parent: { equals: doc.id } },
            { status: { equals: 'pending' } },
          ],
        },
        data: {
          status: 'published',
        },
        context: {
          cascadeOperation: true,
        },
        overrideAccess: true,
      })
    }
  } catch (err) {
    req.payload.logger?.error?.(`Failed to cascade status (${doc.status}) for comment ${doc.id}: ${err}`)
  }

  return doc
}
