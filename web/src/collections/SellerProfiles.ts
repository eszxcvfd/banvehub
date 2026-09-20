import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import {
  adminOrFinanceAdminFieldAccess,
  adminOrModeratorFieldAccess,
  commissionRateReadAccess,
  sellerProfileReadAccess,
  sellerProfileUpdateAccess,
} from '@/access/sellerProfileAccess'

export const SellerProfiles: CollectionConfig = {
  labels: {
    singular: 'Seller profile',
    plural: 'Seller profiles',
  },
  slug: 'seller_profiles',
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: adminOnly,
    read: sellerProfileReadAccess,
    update: sellerProfileUpdateAccess,
  },
  admin: {
    defaultColumns: ['displayName', 'user', 'status', 'createdAt'],
    group: 'Users',
    useAsTitle: 'displayName',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'displayName',
      type: 'text',
      required: true,
      label: 'Tên thương hiệu / Shop của người bán',
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Giới thiệu bản thân / Đội ngũ thiết kế',
    },
    {
      name: 'avatar',
      type: 'relationship',
      relationTo: 'media',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Số điện thoại liên hệ',
    },
    {
      name: 'payoutInfo',
      type: 'group',
      label: 'Thông tin tài khoản nhận thanh toán',
      fields: [
        {
          name: 'bankName',
          type: 'text',
          label: 'Tên ngân hàng (ví dụ: Vietcombank, MBBank, Techcombank)',
        },
        {
          name: 'accountNumber',
          type: 'text',
          label: 'Số tài khoản ngân hàng',
        },
        {
          name: 'accountHolderName',
          type: 'text',
          label: 'Tên chủ tài khoản (viết hoa không dấu)',
        },
      ],
    },
    {
      name: 'sellerTermsAccepted',
      type: 'checkbox',
      defaultValue: false,
      required: true,
      label: 'Đồng ý với Điều khoản và Quy chế hoạt động dành cho Người bán (Seller Terms)',
    },
    {
      name: 'sellerTermsAcceptedAt',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
    {
      name: 'commissionRate',
      type: 'number',
      label: 'Tỷ lệ hoa hồng sàn riêng (Commission Rate Override)',
      min: 0,
      max: 1,
      admin: {
        position: 'sidebar',
        step: 0.01,
        description:
          'Tỷ lệ hoa hồng sàn áp dụng riêng cho người bán (0.00 - 1.00, VD: 0.20 = 20%). Nếu để trống sẽ sử dụng tỷ lệ mặc định toàn sàn (30%).',
      },
      access: {
        read: commissionRateReadAccess,
        update: adminOrFinanceAdminFieldAccess,
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Pending (Chờ duyệt)', value: 'pending' },
        { label: 'Active (Đang hoạt động)', value: 'active' },
        { label: 'Suspended (Tạm ngưng)', value: 'suspended' },
        { label: 'Rejected (Từ chối)', value: 'rejected' },
      ],
      access: {
        update: adminOrModeratorFieldAccess,
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'totalSales',
      type: 'number',
      defaultValue: 0,
      access: {
        update: adminOrModeratorFieldAccess,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'rating',
      type: 'number',
      defaultValue: 5.0,
      access: {
        update: adminOrModeratorFieldAccess,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    slugField({ fieldToUse: 'displayName' }),
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        // Auto-assign user if authenticated and not explicitly passed
        if (req.user?.id && !data.user) {
          data.user = req.user.id
        }
        if (data.sellerTermsAccepted && !data.sellerTermsAcceptedAt) {
          data.sellerTermsAcceptedAt = new Date().toISOString()
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Auto-elevate user to seller role when profile is active
        if (doc.user && (doc.status === 'active' || !doc.status)) {
          const userId = typeof doc.user === 'object' ? doc.user.id : doc.user
          try {
            const user = await req.payload.findByID({
              collection: 'users',
              id: userId,
              overrideAccess: true,
              req,
            })
            if (user && !user.roles?.includes('seller')) {
              const currentRoles = user.roles || ['buyer']
              await req.payload.update({
                collection: 'users',
                id: userId,
                data: {
                  roles: [...currentRoles, 'seller'],
                },
                overrideAccess: true,
                req,
              })
            }
          } catch (err) {
            // Ignore error if in detached test runner
          }
        }
      },
    ],
  },
}
