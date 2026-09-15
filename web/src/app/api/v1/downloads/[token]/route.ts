import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Readable } from 'stream'
import {
  verifyAndStreamDownload,
  TokenExpiredError,
  InvalidTokenError,
  ForbiddenError,
  FileNotFoundError,
} from '@/services/download'

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await context.params
    const token = resolvedParams?.token

    if (!token) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Token tải xuống không được để trống.',
        },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config: configPromise })

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined
    const userAgent = req.headers.get('user-agent') || undefined

    const streamResult = await verifyAndStreamDownload(payload, token, {
      ipAddress,
      userAgent,
    })

    const webStream = Readable.toWeb(streamResult.stream as any) as ReadableStream

    const headers = new Headers()
    headers.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(streamResult.filename)}"`
    )
    headers.set('Content-Type', streamResult.mimeType || 'application/octet-stream')
    headers.set('Content-Length', String(streamResult.filesize))
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')

    return new Response(webStream, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    if (err instanceof TokenExpiredError) {
      return NextResponse.json(
        {
          error: 'TOKEN_EXPIRED',
          message: 'Link tải xuống đã hết hạn (giới hạn 5 phút). Vui lòng yêu cầu link mới.',
        },
        { status: 401 }
      )
    }

    if (err instanceof InvalidTokenError) {
      return NextResponse.json(
        {
          error: 'INVALID_TOKEN',
          message: 'Token tải xuống không hợp lệ hoặc đã bị thay đổi.',
        },
        { status: 400 }
      )
    }

    if (err instanceof ForbiddenError) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: err.message,
        },
        { status: 403 }
      )
    }

    if (err instanceof FileNotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: err.message,
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Đã xảy ra lỗi máy chủ trong quá trình tải tệp.',
      },
      { status: 500 }
    )
  }
}
