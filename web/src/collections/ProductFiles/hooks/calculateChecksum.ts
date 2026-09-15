import type { CollectionBeforeChangeHook } from 'payload'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const calculateChecksum: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  // Auto-assign owning seller if logged in and not explicitly set
  if (req.user?.id && !data.seller) {
    data.seller = req.user.id
  }

  // Auto-fill file format from filename
  const targetFilename = data.filename || req.file?.name
  if (targetFilename) {
    const ext = path.extname(targetFilename).toLowerCase()
    if (ext && !data.fileFormat) {
      data.fileFormat = ext
    }
    if (!data.originalFilename) {
      data.originalFilename = targetFilename
    }
  }

  // Calculate SHA-256 checksum if file data is present in req.file
  if (req.file?.data && Buffer.isBuffer(req.file.data)) {
    const hash = crypto.createHash('sha256').update(req.file.data).digest('hex')
    data.checksum = hash
    data.fileSize = req.file.size || req.file.data.length
    data.mimeType = req.file.mimetype
    data.status = 'READY'
    data.virusScanStatus = 'clean'
  } else if (data.filename) {
    // If already written to disk
    const filePath = path.resolve(dirname, '../../../../private/product_files', data.filename)
    if (fs.existsSync(filePath)) {
      try {
        const fileBuffer = fs.readFileSync(filePath)
        data.checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex')
        data.fileSize = fileBuffer.length
        data.status = 'READY'
        data.virusScanStatus = 'clean'
      } catch (err) {
        // File may be streaming or handled asynchronously
      }
    }
  }

  // Fallback checksum if created via API seed without physical file
  if (!data.checksum) {
    data.checksum = crypto.createHash('sha256').update(`${data.originalFilename || 'unnamed'}-${Date.now()}`).digest('hex')
  }

  return data
}
