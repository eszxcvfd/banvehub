import type { Metadata } from 'next'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description:
    'KienTaoHub - Nền tảng thương mại và chia sẻ tài nguyên bản vẽ CAD, mô hình 3D, BIM, Revit và hồ sơ kỹ thuật số.',
  images: [
    {
      url: 'https://payloadcms.com/images/og-image.jpg',
    },
  ],
  siteName: 'KienTaoHub',
  title: 'KienTaoHub - Sàn chia sẻ bản vẽ & mô hình kỹ thuật số',
  locale: 'vi_VN',
}

export const mergeOpenGraph = (og?: Partial<Metadata['openGraph']>): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
