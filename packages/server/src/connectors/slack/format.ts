/**
 * Convert standard markdown to Slack mrkdwn format.
 *
 * Slack uses its own markdown subset:
 *   - Bold:          *text*   (not **text**)
 *   - Italic:        _text_   (same as markdown)
 *   - Strikethrough: ~text~   (not ~~text~~)
 *   - Code:          `code`   (same)
 *   - Code block:    ```code``` (same)
 *   - Headings are flattened to bold
 */
export function toSlackMarkdown(text: string): string {
  return text
    // **bold** → *bold* (must come before heading rule to avoid double-star issues)
    .replace(/\*\*(.+?)\*\*/gs, '*$1*')
    // ~~strikethrough~~ → ~strikethrough~
    .replace(/~~(.+?)~~/gs, '~$1~')
    // # Heading (any level) → *Heading*
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
}
