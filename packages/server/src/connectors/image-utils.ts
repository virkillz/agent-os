import sharp from 'sharp'

const MAX_IMAGE_DIMENSION = 2048
const MAX_BASE64_SIZE_MB = 5
const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]

export interface ImageAttachment {
  type: 'image'
  mimeType: string
  data: string // base64
}

/**
 * Download an image from a URL and return it as a base64-encoded string.
 * Optionally provide headers for authenticated requests.
 */
export async function downloadImageAsBase64(
  url: string,
  headers?: Record<string, string>,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.warn(`[image-utils] failed to download image: ${res.status} ${res.statusText}`)
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'image/png'
    return { mimeType: contentType, data: buffer.toString('base64') }
  } catch (err) {
    console.warn('[image-utils] download error:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Resize an image if it exceeds the maximum dimension, and ensure it's under the size limit.
 * Returns null if the image can't be processed or is too large.
 */
export async function processImage(
  mimeType: string,
  base64Data: string,
): Promise<ImageAttachment | null> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType)) {
    console.warn(`[image-utils] unsupported mime type: ${mimeType}`)
    return null
  }

  try {
    const inputBuffer = Buffer.from(base64Data, 'base64')
    const originalSizeMb = inputBuffer.length / (1024 * 1024)

    if (originalSizeMb > MAX_BASE64_SIZE_MB) {
      console.warn(`[image-utils] image too large (${originalSizeMb.toFixed(1)}MB), skipping`)
      return null
    }

    let pipeline = sharp(inputBuffer)
    const metadata = await pipeline.metadata()

    // Resize if dimensions are too large
    if (
      metadata.width &&
      metadata.height &&
      (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION)
    ) {
      pipeline = pipeline.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    // Convert to JPEG for consistency and smaller size
    const outputBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer()
    const processedSizeMb = outputBuffer.length / (1024 * 1024)

    if (processedSizeMb > MAX_BASE64_SIZE_MB) {
      console.warn(`[image-utils] processed image still too large (${processedSizeMb.toFixed(1)}MB), skipping`)
      return null
    }

    return {
      type: 'image',
      mimeType: 'image/jpeg',
      data: outputBuffer.toString('base64'),
    }
  } catch (err) {
    console.warn('[image-utils] processing error:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Convenience function to download and process an image in one step.
 */
export async function downloadAndProcessImage(
  url: string,
  headers?: Record<string, string>,
): Promise<ImageAttachment | null> {
  const downloaded = await downloadImageAsBase64(url, headers)
  if (!downloaded) return null
  return processImage(downloaded.mimeType, downloaded.data)
}
