/**
 * Provider account pool — selects available accounts and manages cooldowns.
 *
 * Cooldown is set when a session receives a 429 / rate-limit error.
 * Any account with cooldown_until > now is skipped during selection.
 * clearExpiredCooldowns() is run at startup and can be called periodically.
 */
import { getDb, getSetting, getAvailableAccountsForProvider, setAccountCooldown, clearAccountCooldown, type ProviderAccountRow } from './db.js'

export type { ProviderAccountRow }

const DEFAULT_COOLDOWN_MINUTES = 10

function cooldownMinutes(): number {
  const stored = getSetting('account_cooldown_minutes')
  if (stored) {
    const n = parseInt(stored, 10)
    if (!isNaN(n) && n > 0) return n
  }
  return DEFAULT_COOLDOWN_MINUTES
}

/**
 * Pick an account for the given provider.
 *
 * - If preferredAccountId is set and the account is available, use it.
 * - Otherwise, return the first available (non-cooldown) account for the provider.
 * - Returns null if no accounts are configured or all are on cooldown
 *   (caller should fall back to env-var auth).
 */
export function pickAccount(providerId: string, preferredAccountId?: string): ProviderAccountRow | null {
  const db = getDb()
  const now = new Date().toISOString()

  if (preferredAccountId) {
    const account = db.prepare(
      `SELECT * FROM provider_accounts
       WHERE id = ? AND is_active = 1
         AND (cooldown_until IS NULL OR cooldown_until <= ?)`
    ).get(preferredAccountId, now) as ProviderAccountRow | undefined
    if (account) return account
  }

  const available = getAvailableAccountsForProvider(providerId)
  return available[0] ?? null
}

/**
 * Mark an account as on cooldown for N minutes (default: account_cooldown_minutes setting).
 */
export function markCooldown(accountId: string, minutes?: number): void {
  const mins = minutes ?? cooldownMinutes()
  const until = new Date(Date.now() + mins * 60 * 1000).toISOString()
  setAccountCooldown(accountId, until)
}

/**
 * Manually clear an account's cooldown.
 */
export function removeCooldown(accountId: string): void {
  clearAccountCooldown(accountId)
}

/**
 * Clear all expired cooldowns. Run at startup and periodically.
 */
export function clearExpiredCooldowns(): void {
  const now = new Date().toISOString()
  getDb()
    .prepare("UPDATE provider_accounts SET cooldown_until = NULL WHERE cooldown_until IS NOT NULL AND cooldown_until <= ?")
    .run(now)
}

/**
 * Get cooldown duration in minutes (for display / event payloads).
 */
export function getCooldownMinutes(): number {
  return cooldownMinutes()
}
