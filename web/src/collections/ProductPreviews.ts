import type { CollectionConfig } from 'payload'

import { adminOrModerator } from '@/access/adminOrModerator'
import { adminOrSeller } from '@/access/adminOrSeller'
import { publicAccess } from '@/access/publicAccess'

export const ProductPreviews: CollectionConfig = {
  slug: 'product_previews',
  access: {
    create: adminOrSeller,
    delete: adminOrModerator,
    read: publicAccess,
    update: adminOrModerator,
  },
  admin: {
    defaultColumns: ['title', 'previewType', 'isWatermarked', 'createdAt'],
    group: 'Catalog',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'previewImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'previewType',
      type: 'select',
      defaultValue: 'image',
      options: [
        { label: 'Image', value: 'image' },
        { label: 'PDF Preview', value: 'pdf' },
        { label: '3D Model Viewer', value: 'model_viewer' },
      ],
      required: true,
    },
    {
      name: 'isWatermarked',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'caption',
      type: 'text',
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
