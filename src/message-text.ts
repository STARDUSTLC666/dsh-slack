/**
 * 从 Slack Block Kit blocks 与传统 attachments 提取可读纯文本的兜底模块。
 *
 * 真实线上 Slack 中，机器人告警（GitHub / Sentry / PagerDuty / Workflow）、转发消息与
 * 纯 Block Kit 消息经常携带空的顶层 `text: ""`，正文完全在 `blocks` 或 `attachments` 中。
 * 本模块仅在顶层 `text` 为空时作为兜底提取，避免对正常消息产生重复拼接。
 */

const MAX_TRAVERSE_DEPTH = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed !== '' ? trimmed : undefined
}

function extractTextObject(value: unknown): string | undefined {
  if (typeof value === 'string') return nonBlankString(value)
  if (!isRecord(value)) return undefined
  return nonBlankString(value.text)
}

function extractRichTextElement(node: unknown, depth: number): string {
  if (depth > MAX_TRAVERSE_DEPTH || !isRecord(node)) return ''
  const type = typeof node.type === 'string' ? node.type : ''

  if (type === 'text') {
    return typeof node.text === 'string' ? node.text : ''
  }
  if (type === 'link') {
    const label = typeof node.text === 'string' && node.text.trim() !== '' ? node.text : undefined
    const url = typeof node.url === 'string' && node.url.trim() !== '' ? node.url.trim() : undefined
    if (label && url && label !== url) return `${label} (${url})`
    return label ?? url ?? ''
  }
  if (type === 'user') {
    const userId = nonBlankString(node.user_id)
    return userId ? `<@${userId}>` : ''
  }
  if (type === 'channel') {
    const channelId = nonBlankString(node.channel_id)
    return channelId ? `<#${channelId}>` : ''
  }
  if (type === 'usergroup') {
    const groupId = nonBlankString(node.usergroup_id)
    return groupId ? `<!subteam^${groupId}>` : ''
  }
  if (type === 'broadcast') {
    const range = nonBlankString(node.range)
    return range ? `@${range}` : ''
  }
  if (type === 'emoji') {
    const name = nonBlankString(node.name)
    return name ? `:${name}:` : ''
  }
  if (type === 'date') {
    const fallback = nonBlankString(node.fallback)
    if (fallback !== undefined) return fallback
    if (typeof node.timestamp === 'number' && Number.isFinite(node.timestamp)) {
      const date = new Date(node.timestamp * 1000)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    }
    return ''
  }

  if (Array.isArray(node.elements)) {
    if (type === 'rich_text_list') {
      const style = node.style === 'ordered' ? 'ordered' : 'bullet'
      const offset = typeof node.offset === 'number' && Number.isSafeInteger(node.offset) && node.offset >= 0
        ? node.offset
        : 0
      const lines: string[] = []
      let itemNumber = offset + 1
      for (const child of node.elements) {
        const text = extractRichTextElement(child, depth + 1).trim()
        if (text !== '') {
          lines.push(style === 'ordered' ? `${itemNumber++}. ${text}` : `- ${text}`)
        }
      }
      return lines.join('\n')
    }
    if (type === 'rich_text_section' || type === 'rich_text_preformatted' || type === 'rich_text_quote') {
      const joined = node.elements
        .map((child) => extractRichTextElement(child, depth + 1))
        .join('')
      const trimmed = joined.trim()
      if (trimmed === '') return ''
      if (type === 'rich_text_quote') {
        return trimmed
          .split(/\r?\n/)
          .map((line) => `> ${line}`)
          .join('\n')
      }
      return trimmed
    }
    const parts = node.elements
      .map((child) => extractRichTextElement(child, depth + 1).trim())
      .filter((part) => part !== '')
    return parts.join('\n')
  }

  return ''
}

function extractTableBlockText(block: Record<string, unknown>, depth: number): string {
  if (!Array.isArray(block.rows) || block.rows.length === 0) return ''
  const lines: string[] = []
  for (const row of block.rows) {
    if (!Array.isArray(row)) continue
    const cells: string[] = []
    for (const cell of row) {
      if (!isRecord(cell)) continue
      const raw = nonBlankString(cell.text)
        ?? nonBlankString(cell.raw_text)
        ?? (typeof cell.value === 'number' && Number.isFinite(cell.value) ? String(cell.value) : undefined)
        ?? (Array.isArray(cell.elements) ? nonBlankString(extractRichTextElement(cell, depth + 1)) : undefined)
      if (raw !== undefined) cells.push(raw.replace(/\s+/g, ' '))
    }
    if (cells.length > 0) lines.push(cells.join(' | '))
  }
  return lines.join('\n')
}

function extractBlockText(block: unknown, depth: number): string {
  if (depth > MAX_TRAVERSE_DEPTH || !isRecord(block)) return ''
  const type = typeof block.type === 'string' ? block.type : ''

  if (type === 'markdown') {
    return nonBlankString(block.text) ?? ''
  }
  if (type === 'header') {
    return extractTextObject(block.text) ?? ''
  }
  if (type === 'section') {
    const parts: string[] = []
    const main = extractTextObject(block.text)
    if (main !== undefined) parts.push(main)
    if (Array.isArray(block.fields)) {
      for (const field of block.fields) {
        const text = extractTextObject(field)
        if (text !== undefined) parts.push(text)
      }
    }
    return parts.join('\n')
  }
  if (type === 'context' && Array.isArray(block.elements)) {
    const parts: string[] = []
    for (const elem of block.elements) {
      if (!isRecord(elem)) continue
      const text = extractTextObject(elem) ?? nonBlankString(elem.alt_text)
      if (text !== undefined) parts.push(text)
    }
    return parts.join(' · ')
  }
  if (type === 'rich_text') {
    return extractRichTextElement(block, depth + 1).trim()
  }
  if (type === 'image') {
    return extractTextObject(block.title) ?? nonBlankString(block.alt_text) ?? ''
  }
  if (type === 'video') {
    const parts: string[] = []
    const title = extractTextObject(block.title)
    if (title !== undefined) parts.push(title)
    const description = extractTextObject(block.description)
    if (description !== undefined) parts.push(description)
    if (parts.length === 0) {
      const alt = nonBlankString(block.alt_text)
      if (alt !== undefined) parts.push(alt)
    }
    return parts.join('\n')
  }
  if (type === 'table') {
    return extractTableBlockText(block, depth + 1)
  }
  if (type === 'task_card') {
    const parts: string[] = []
    const title = nonBlankString(block.title)
    if (title !== undefined) parts.push(title)
    const details = extractBlockText(block.details, depth + 1).trim()
    if (details !== '') parts.push(details)
    const output = extractBlockText(block.output, depth + 1).trim()
    if (output !== '') parts.push(output)
    return parts.join('\n')
  }
  if (type === 'plan') {
    const parts: string[] = []
    const title = nonBlankString(block.title)
    if (title !== undefined) parts.push(title)
    const tasksText = extractBlocksText(block.tasks, depth + 1)
    if (tasksText !== '') parts.push(tasksText)
    return parts.join('\n')
  }
  return ''
}

function extractBlocksText(rawBlocks: unknown, depth: number): string {
  if (depth > MAX_TRAVERSE_DEPTH || !Array.isArray(rawBlocks) || rawBlocks.length === 0) return ''
  const parts: string[] = []
  for (const block of rawBlocks) {
    const text = extractBlockText(block, depth + 1).trim()
    if (text !== '') parts.push(text)
  }
  return parts.join('\n')
}

function isUnfurlAttachment(attachment: Record<string, unknown>): boolean {
  return (
    attachment.is_msg_unfurl === true
    || attachment.is_app_unfurl === true
    || nonBlankString(attachment.app_unfurl_url) !== undefined
  )
}

function extractAttachmentText(attachment: Record<string, unknown>, depth: number): string {
  if (depth > MAX_TRAVERSE_DEPTH) return ''
  const parts: string[] = []
  const pretext = nonBlankString(attachment.pretext)
  if (pretext !== undefined) parts.push(pretext)

  const title = nonBlankString(attachment.title)
  if (title !== undefined) parts.push(title)

  const text = nonBlankString(attachment.text)
  if (text !== undefined) parts.push(text)

  if (Array.isArray(attachment.fields)) {
    for (const field of attachment.fields) {
      if (!isRecord(field)) continue
      const fieldTitle = nonBlankString(field.title)
      const fieldValue = nonBlankString(field.value)
      if (fieldTitle !== undefined && fieldValue !== undefined) {
        parts.push(`${fieldTitle}: ${fieldValue}`)
      } else if (fieldTitle !== undefined) {
        parts.push(fieldTitle)
      } else if (fieldValue !== undefined) {
        parts.push(fieldValue)
      }
    }
  }

  const nestedBlocks = extractBlocksText(attachment.blocks, depth + 1)
  if (nestedBlocks !== '' && !parts.includes(nestedBlocks)) {
    const joinedSoFar = parts.join('\n')
    if (joinedSoFar === '' || !joinedSoFar.includes(nestedBlocks)) {
      if (text !== undefined && nestedBlocks.includes(text) && parts.length === 1 && parts[0] === text) {
        parts[0] = nestedBlocks
      } else {
        parts.push(nestedBlocks)
      }
    }
  }

  if (parts.length === 0) {
    const fallback = nonBlankString(attachment.fallback)
    if (fallback !== undefined) parts.push(fallback)
  }

  return parts.join('\n')
}

function extractAttachmentsText(rawAttachments: unknown, depth: number, nonUnfurlOnly: boolean): string {
  if (depth > MAX_TRAVERSE_DEPTH || !Array.isArray(rawAttachments) || rawAttachments.length === 0) return ''
  const valid = rawAttachments.filter(isRecord)
  if (valid.length === 0) return ''

  const nonUnfurl = valid.filter((item) => !isUnfurlAttachment(item))
  const candidates = nonUnfurlOnly ? nonUnfurl : (nonUnfurl.length > 0 ? nonUnfurl : valid)
  if (candidates.length === 0) return ''

  const parts: string[] = []
  for (const attachment of candidates) {
    const text = extractAttachmentText(attachment, depth + 1).trim()
    if (text !== '') parts.push(text)
  }
  return parts.join('\n')
}

/**
 * 从 Slack 消息的 blocks 与 attachments 中提取兜底可读文本；均为空时返回空字符串。
 * - 同时存在顶层 blocks 与主业务 attachments（如带颜色侧栏的告警卡片）时合并去重，不丢失卡片正文；
 * - 顶层存在 blocks 时自动抑制链接预览（unfurl）附件，但纯转发（仅 unfurl 附件）仍兜底提取。
 */
export function extractFallbackMessageText(blocks: unknown, attachments: unknown): string {
  const fromBlocks = extractBlocksText(blocks, 0)
  const fromPrimaryAttachments = extractAttachmentsText(attachments, 0, true)

  if (fromBlocks !== '' && fromPrimaryAttachments !== '') {
    if (fromBlocks === fromPrimaryAttachments || fromBlocks.includes(fromPrimaryAttachments)) {
      return fromBlocks
    }
    if (fromPrimaryAttachments.includes(fromBlocks)) {
      return fromPrimaryAttachments
    }
    return `${fromBlocks}\n${fromPrimaryAttachments}`
  }
  if (fromBlocks !== '') return fromBlocks
  if (fromPrimaryAttachments !== '') return fromPrimaryAttachments
  return extractAttachmentsText(attachments, 0, false)
}
