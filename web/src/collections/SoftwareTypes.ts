import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { publicAccess } from '@/access/publicAccess'

export const SoftwareTypes: CollectionConfig = {
  labels: {
    singular: 'Software type',
    plural: 'Software types',
  },
  slug: 'software_types',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'fileExtensions', 'sortOrder', 'updatedAt'],
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
      name: 'icon',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'fileExtensions',
      type: 'text',
      hasMany: true,
      admin: {
        description: 'File extensions supported by this software type (e.g. .dwg, .rvt, .skp)',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        step: 1,
      },
    },
  ],
}
