import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { adminOrSeller } from '@/access/adminOrSeller'
import { publicAccess } from '@/access/publicAccess'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: {
    create: adminOrSeller,
    delete: adminOnly,
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    group: 'Catalog',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
