import type { ContentAccountId } from '@/types'
import { getCloudAccountId, isCloudSignedIn } from './config'

/** 自定义内容上传时的归属选择 */
export type ContentVisibility = 'personal' | 'shared'

/**
 * 把「个人 / 共享」换成写入数据库的 account_id：
 * 个人 = 当前账号 id，共享 = null；不在云模式（或未登录）时返回 undefined，内容按本地方式保存。
 */
export function contentOwnerFor(visibility: ContentVisibility): ContentAccountId | undefined {
  if (!isCloudSignedIn()) return undefined
  return visibility === 'personal' ? getCloudAccountId() : null
}

/** 内容在当前账号视角下的归属标签；本地模式或未知时返回 null */
export function contentVisibilityOf(accountId: ContentAccountId | undefined): ContentVisibility | null {
  if (accountId === undefined || !isCloudSignedIn()) return null
  return accountId === null ? 'shared' : 'personal'
}
