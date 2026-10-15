/**
 * Ekspresi agregasi MongoDB yang dipakai bersama oleh route yang membaca `ip_access_dns`.
 * Field dibaca toleran terhadap dua bentuk dokumen: ap_info.{ip,label} (baru) dan
 * ap_ip/ap_name datar (lama); jumlah request = access_count (default 1).
 */
import { FLAG_TYPE_LIST } from '@/lib/domain-risk'

export const qty = { $ifNull: ['$access_count', 1] }
export const apIpExpr = { $ifNull: ['$ap_info.ip', '$ap_ip'] }
export const asDate = { $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null } }

// "berisiko" = kena blacklist ATAU kategori domainnya berisiko
export const isFlag = { $or: [{ $eq: ['$action', 'blocked'] }, { $in: ['$type', FLAG_TYPE_LIST] }] }
export const flagQty = { $cond: [isFlag, qty, 0] }
export const apLabelExpr = { $ifNull: ['$ap_info.label', '$ap_name'] }
