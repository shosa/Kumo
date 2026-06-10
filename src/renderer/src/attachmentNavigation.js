export function isPreviewableAttachment(attachment = {}) {
  const name = String(attachment.filename || attachment.name || '').toLowerCase()
  const type = String(attachment.type || attachment.content_type || '').toLowerCase()
  return type === 'application/pdf' ||
    type.startsWith('image/') ||
    /\.(pdf|jpe?g|png|gif|webp|bmp|svg)$/.test(name)
}

export function getPreviewableAttachmentIndexes(attachments = []) {
  return attachments.reduce((indexes, attachment, index) => {
    if (isPreviewableAttachment(attachment)) indexes.push(index)
    return indexes
  }, [])
}

export function getAdjacentPreviewIndex(indexes, currentIndex, direction) {
  const position = indexes.indexOf(currentIndex)
  if (position < 0) return null
  return indexes[position + direction] ?? null
}
