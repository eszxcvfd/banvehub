import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { link } from '@/fields/link'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
    },
    {
      name: 'contactEmail',
      type: 'email',
      label: 'Email liên hệ',
      admin: {
        description:
          'Địa chỉ email công khai để người mua liên hệ với người vận hành (Decision 0012 §2).',
      },
    },
    {
      name: 'contactPhone',
      type: 'text',
      label: 'Số điện thoại / hotline',
      admin: {
        description: 'Số điện thoại hoặc hotline hỗ trợ hiển thị công khai trên website.',
      },
    },
    {
      name: 'contactNote',
      type: 'textarea',
      label: 'Ghi chú liên hệ',
      admin: {
        description:
          'Thời gian hỗ trợ và hướng dẫn gửi yêu cầu hoàn tiền (yêu cầu hoàn tiền được gửi ngoài hệ thống, không có nút tự phục vụ).',
      },
    },
  ],
}
