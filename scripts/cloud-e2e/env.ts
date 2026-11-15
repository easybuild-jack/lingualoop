// 测试专用依赖，不进 package.json：npm i --no-save fake-indexeddb@6；用 require 避免 tsc 在未安装时报错
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('fake-indexeddb/auto')
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

class MemoryStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
  keys() {
    return Array.from(this.map.keys())
  }
}

const target = new EventTarget()
const g = globalThis as unknown as Record<string, unknown>
g.window = globalThis
g.addEventListener = target.addEventListener.bind(target)
g.removeEventListener = target.removeEventListener.bind(target)
g.dispatchEvent = target.dispatchEvent.bind(target)
g.localStorage = new MemoryStorage()
g.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
}
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'node', appVersion: 'node', platform: 'linux', vendor: '' }, configurable: true })

/** 指向一个已执行过 supabase/schema.sql 的测试库（PostgREST 前面要有 /rest/v1 前缀，Max Rows 保持默认 1000） */
export const API_URL = process.env.CLOUD_E2E_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY = process.env.CLOUD_E2E_ANON_KEY ?? readFileSync(process.env.CLOUD_E2E_ANON_KEY_FILE ?? '/tmp/pgrst/anon.jwt', 'utf8').trim()
/** 测试用来直接查库核对结果的 psql 命令 */
export const PSQL = process.env.CLOUD_E2E_PSQL ?? 'sudo -u postgres psql -d ll_e2e'
export const storage = g.localStorage as MemoryStorage

let failures = 0
let passes = 0
export function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) {
    passes += 1
    console.log(`  PASS ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}
export function summary() {
  console.log(`\n${passes} passed, ${failures} failed`)
  if (failures) process.exitCode = 1
}
export async function expectError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return null
  } catch (error) {
    return error
  }
}

/** 每个测试文件开头清空测试库（只用于专门的测试库，千万不要指向真实数据） */
export function resetDatabase() {
  execSync(
    `${PSQL} -qc "truncate accounts, vocab_books, translate_books, reading_articles, radio_items, collected_words cascade"`,
    { stdio: 'ignore' }
  )
}
