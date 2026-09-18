/**
 * FR-22 (`PLAN.md:797-810`) — the seven report reasons and nothing else.
 *
 * This module is the single source of truth for the reason vocabulary: the
 * collection field, the `POST /api/v1/products/[id]/reports` route and the
 * storefront report dialog all read it from here, so a new reason can never be
 * accepted by one surface and rejected by another.
 *
 * It deliberately has no `payload` import so a client component may use it.
 */
export type ModerationCaseReason =
  | 'FILE_CORRUPTED'
  | 'CONTENT_MISMATCH'
  | 'COPYRIGHT_VIOLATION'
  | 'SPAM'
  | 'PROHIBITED_CONTENT'
  | 'MISLEADING_PREVIEW'
  | 'OTHER'

export const MODERATION_CASE_REASON_OPTIONS: { label: string; value: ModerationCaseReason }[] = [
  { label: 'File lỗi (không mở / giải nén được)', value: 'FILE_CORRUPTED' },
  { label: 'Nội dung không đúng', value: 'CONTENT_MISMATCH' },
  { label: 'Vi phạm bản quyền', value: 'COPYRIGHT_VIOLATION' },
  { label: 'Spam', value: 'SPAM' },
  { label: 'Nội dung cấm', value: 'PROHIBITED_CONTENT' },
  { label: 'Preview gây hiểu nhầm', value: 'MISLEADING_PREVIEW' },
  { label: 'Khác', value: 'OTHER' },
]

export const MODERATION_CASE_REASONS: ModerationCaseReason[] = MODERATION_CASE_REASON_OPTIONS.map(
  (option) => option.value,
)

export const isModerationCaseReason = (value: unknown): value is ModerationCaseReason =>
  typeof value === 'string' && (MODERATION_CASE_REASONS as string[]).includes(value)
