import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { adminOrSeller } from '@/access/adminOrSeller'
import {
  productFileDeleteAccess,
  productFileReadAccess,
  productFileUpdateAccess,
} from '@/access/productFileAccess'
import { calculateChecksum } from './hooks/calculateChecksum'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const ProductFiles: CollectionConfig = {
  labels: {
    singular: 'Product file',
    plural: 'Product files',
  },
  slug: 'product_files',
  access: {
    create: adminOrSeller,
    delete: productFileDeleteAccess,
    read: productFileReadAccess,
    update: productFileUpdateAccess,
  },
  admin: {
    defaultColumns: ['filename', 'seller', 'fileFormat', 'status', 'virusScanStatus', 'createdAt'],
    group: 'Catalog',
    useAsTitle: 'originalFilename',
  },
  fields: [
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'originalFilename',
      type: 'text',
      admin: {
        description: 'Tên file gốc người bán tải lên',
      },
    },
    {
      name: 'fileFormat',
      type: 'text',
      admin: {
        description: 'Định dạng tệp (ví dụ: .dwg, .rvt, .zip)',
      },
    },
    {
      name: 'checksum',
      type: 'text',
      admin: {
        description: 'Mã băm SHA-256 xác thực tính toàn vẹn của tệp',
        readOnly: true,
      },
    },
    {
      name: 'fileSize',
      type: 'number',
      admin: {
        description: 'Dung lượng tệp tính bằng bytes',
        readOnly: true,
      },
    },
    {
      name: 'virusScanStatus',
      type: 'select',
      defaultValue: 'clean',
      options: [
        { label: 'Pending (Đang quét)', value: 'pending' },
        { label: 'Clean (An toàn)', value: 'clean' },
        { label: 'Quarantined (Cách ly/Phát hiện mã độc)', value: 'quarantined' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'READY',
      options: [
        { label: 'UPLOADING', value: 'UPLOADING' },
        { label: 'PROCESSING', value: 'PROCESSING' },
        { label: 'READY', value: 'READY' },
        { label: 'FAILED', value: 'FAILED' },
        { label: 'QUARANTINED', value: 'QUARANTINED' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    beforeChange: [calculateChecksum],
  },
  upload: {
    staticDir: path.resolve(dirname, '../../../private/product_files'),
  },
}
