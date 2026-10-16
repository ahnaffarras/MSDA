/**
 * Label hasil akses DNS.
 *
 * `action: "blocked"` di ip_access_dns berarti "cocok dengan blocklist" (kompatibilitas n8n),
 * BUKAN bukti domain benar-benar diblokir. Hanya `enforced === true` yang boleh tampil "Blocked".
 */
export type ActionTone = 'blocked' | 'monitor' | 'allowed'

export function actionTone(action: string | undefined | null, enforced?: boolean | null): ActionTone {
  if (action !== 'blocked') return 'allowed'
  return enforced === true ? 'blocked' : 'monitor'
}

export const ACTION_LABEL: Record<ActionTone, string> = {
  blocked: 'Blocked',
  monitor: 'Matched blocklist (monitor)',
  allowed: 'Allowed',
}

export const actionLabel = (action: string | undefined | null, enforced?: boolean | null) =>
  ACTION_LABEL[actionTone(action, enforced)]
