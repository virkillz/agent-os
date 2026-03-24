/**
 * Format agent response text for Telegram.
 *
 * Telegram supports MarkdownV2 and HTML, but MarkdownV2 requires heavy
 * escaping of special characters. For group chats the doc recommends plain
 * text. We strip the common markdown constructs so the output reads cleanly
 * without raw asterisks/underscores.
 */
export function toTelegramText(text: string): string {
  return text
    // **bold** or *bold* → bold (strip markers)
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '$1')
    // _italic_ or __italic__ → italic text (strip markers)
    .replace(/__(.+?)__/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    // ~~strikethrough~~ → text
    .replace(/~~(.+?)~~/gs, '$1')
    // # Heading → text (strip the # prefix)
    .replace(/^#{1,6}\s+/gm, '')
    // ```code block``` → keep the content, drop the fences
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
}
