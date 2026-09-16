import type { GlobalConfig } from 'payload'
import { adminOnly } from '@/access/adminOnly'

export const CommissionSettings: GlobalConfig = {
  slug: 'commission_settings',
  label: 'Cài đặt hoa hồng nền tảng',
  access: {
    read: () => true,
    update: adminOnly,
  },
  fields: [
    {
      name: 'defaultRate',
      type: 'number',
      required: true,
      defaultValue: 0.30,
      min: 0,
      max: 1,
      label: 'Tỷ lệ hoa hồng mặc định',
      admin: {
        step: 0.01,
        description: 'Tỷ lệ hoa hồng mặc định của sàn (0.0 - 1.0, mặc định: 0.30 tức 30%)',
      },
    },
  ],
}
