/**
 * 云端进度水合的完成信号。
 *
 * 练习页在载入单元前要等云端的学习位置拉回来，否则会先按本机缓存加载一本书，
 * 随后被云端值改掉 currentBookId，出现「显示 A 书、进度写进 B 书」的错位。
 * CloudSyncGate 水合结束（成功或失败）时调用 markCloudHydrated()。
 */

let settled = false
let waiters: Array<() => void> = []

export function markCloudHydrated(): void {
  settled = true
  const pending = waiters
  waiters = []
  pending.forEach((resolve) => resolve())
}

export function resetCloudHydration(): void {
  settled = false
}

export function isCloudHydrated(): boolean {
  return settled
}

/** 等待水合完成；超时后放行，避免网络异常时页面一直卡住（Gate 会给出错误提示） */
export function waitForCloudHydration(timeoutMs = 10000): Promise<void> {
  if (settled) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      waiters = waiters.filter((item) => item !== done)
      resolve()
    }, timeoutMs)
    waiters.push(done)
  })
}
