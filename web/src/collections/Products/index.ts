import { CallToAction } from '@/blocks/CallToAction/config'
import { Content } from '@/blocks/Content/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { slugField } from 'payload'
import type { CollectionConfig } from 'payload'
import { generatePreviewPath } from '@/utilities/generatePreviewPath'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { adminOnly } from '@/access/adminOnly'
import { adminOrModerator } from '@/access/adminOrModerator'
import { adminSellerModeratorOrPublished } from '@/access/adminSellerModeratorOrPublished'
import { adminOrSeller } from '@/access/adminOrSeller'
import { enforceModerationState } from './hooks/enforceModerationState'
import { announceModerationVerdict } from './hooks/announceModerationVerdict'

export const Products: CollectionConfig = {
  slug: 'products',
  access: {
    create: adminOrSeller,
    delete: adminOnly,
    read: adminSellerModeratorOrPublished,
    readVersions: adminOrModerator,
    update: adminOrModerator,
  },
  admin: {
    defaultColumns: ['title', 'seller', 'price', 'isFree', 'moderationStatus', '_status', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'products',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'products',
        req,
      }),
    useAsTitle: 'title',
    group: 'Catalog',
  },
  defaultPopulate: {
    title: true,
    slug: true,
    price: true,
    isFree: true,
    seller: true,
    originalFiles: true,
    moderationStatus: true,
    copyrightDeclared: true,
    previewGallery: true,
    gallery: true,
    categories: true,
    software_types: true,
    tags: true,
    technicalSpecs: true,
    meta: true,
  },
  hooks: {
    beforeChange: [enforceModerationState],
    // §13: the seller is told about an approved/rejected verdict only AFTER the write landed
    // (decision 0011, decision 6). Keep the announcement in `afterChange`; a `beforeChange`
    // emit can describe a verdict the database then rejects (review finding F1).
    afterChange: [announceModerationVerdict],
  },
  versions: {
    drafts: {
      autosave: true,
    },
    maxPerDoc: 50,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'description',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  FixedToolbarFeature(),
                  InlineToolbarFeature(),
                  HorizontalRuleFeature(),
                ],
              }),
              label: false,
              required: false,
            },
            {
              name: 'previewGallery',
              type: 'relationship',
              relationTo: 'product_previews',
              hasMany: true,
              admin: {
                description: 'Public watermarked previews (images, PDF sample sheets, 3D models)',
              },
            },
            {
              name: 'gallery',
              type: 'array',
              label: 'Direct Gallery Images',
              fields: [
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  required: true,
                },
                {
                  name: 'caption',
                  type: 'text',
                },
              ],
            },
            {
              name: 'layout',
              type: 'blocks',
              blocks: [CallToAction, Content, MediaBlock],
            },
          ],
        },
        {
          label: 'Specifications & Pricing',
          fields: [
            {
              name: 'price',
              type: 'number',
              required: true,
              defaultValue: 0,
              min: 0,
              admin: {
                description: 'Price in Vietnamese Dong (VND). Set to 0 if free.',
                step: 1000,
              },
            },
            {
              name: 'isFree',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description: 'Mark as free asset (displays "Tải miễn phí" CTA)',
              },
            },
            {
              name: 'technicalSpecs',
              type: 'group',
              label: 'Technical Specifications',
              fields: [
                {
                  name: 'fileFormat',
                  type: 'text',
                  admin: {
                    placeholder: '.dwg, .rvt, .skp, .max',
                  },
                },
                {
                  name: 'softwareVersion',
                  type: 'text',
                  admin: {
                    placeholder: 'AutoCAD 2021+, Revit 2024',
                  },
                },
                {
                  name: 'fileSize',
                  type: 'text',
                  admin: {
                    placeholder: '45.2 MB',
                  },
                },
                {
                  name: 'unit',
                  type: 'select',
                  defaultValue: 'metric',
                  options: [
                    { label: 'Metric (mm / m)', value: 'metric' },
                    { label: 'Imperial (inch / ft)', value: 'imperial' },
                    { label: 'Other', value: 'other' },
                  ],
                },
              ],
            },
            {
              name: 'relatedProducts',
              type: 'relationship',
              hasMany: true,
              relationTo: 'products',
              filterOptions: ({ id }) => {
                if (id) {
                  return {
                    id: {
                      not_in: [id],
                    },
                  }
                }
                return {
                  id: {
                    exists: true,
                  },
                }
              },
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'categories',
      type: 'relationship',
      admin: {
        position: 'sidebar',
        sortOptions: 'title',
      },
      hasMany: true,
      relationTo: 'categories',
    },
    {
      name: 'software_types',
      type: 'relationship',
      admin: {
        position: 'sidebar',
        sortOptions: 'title',
      },
      hasMany: true,
      relationTo: 'software_types',
    },
    {
      name: 'tags',
      type: 'relationship',
      admin: {
        position: 'sidebar',
        sortOptions: 'title',
      },
      hasMany: true,
      relationTo: 'tags',
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        description: 'Tài khoản người bán sở hữu tài nguyên này',
      },
    },
    {
      name: 'originalFiles',
      type: 'relationship',
      relationTo: 'product_files',
      hasMany: true,
      admin: {
        description: 'Tệp bản vẽ gốc riêng tư (Private originals - BR-06)',
      },
    },
    {
      name: 'moderationStatus',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft (Bản nháp)', value: 'draft' },
        { label: 'Submitted (Chờ duyệt)', value: 'submitted' },
        { label: 'In Review (Đang duyệt)', value: 'in_review' },
        { label: 'Changes Requested (Cần sửa)', value: 'changes_requested' },
        { label: 'Approved (Đã duyệt)', value: 'approved' },
        { label: 'Rejected (Từ chối)', value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Trạng thái quy trình kiểm duyệt (FR-28 & BR-08)',
      },
    },
    {
      name: 'moderationNotes',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description: 'Lý do yêu cầu sửa hoặc từ chối từ ban kiểm duyệt',
      },
    },
    {
      name: 'moderationHistory',
      type: 'array',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      fields: [
        {
          name: 'reviewer',
          type: 'relationship',
          relationTo: 'users',
        },
        {
          name: 'action',
          type: 'select',
          options: [
            { label: 'Submitted', value: 'submitted' },
            { label: 'In Review', value: 'in_review' },
            { label: 'Changes Requested', value: 'changes_requested' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
          ],
        },
        {
          name: 'note',
          type: 'text',
        },
        {
          name: 'timestamp',
          type: 'date',
        },
      ],
    },
    {
      name: 'copyrightDeclared',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Cam kết có quyền sở hữu hợp pháp đối với tài nguyên số này',
      },
    },
    slugField(),
  ],
}
