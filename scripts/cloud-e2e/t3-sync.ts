import { API_URL, ANON_KEY, PSQL, resetDatabase, storage, check, summary } from './env'
import { execSync } from 'node:child_process'

function sql(query: string): string {
  return execSync(`${PSQL} -Atc ${JSON.stringify(query)}`).toString().trim()
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const WS = 'lingualoop-workspace-storage'

async function main() {
  resetDatabase()
  const config = await import('../../src/core/cloud/config')
  const account = await import('../../src/core/cloud/account')
  const { cloudRepositories: cloud } = await import('../../src/core/cloud/supabaseRepository')
  config.saveCloudConfig(API_URL, ANON_KEY)
  const eve = await account.registerAccount(`eve_${Date.now()}`, 'secret1')
  const frank = await account.registerAccount(`frank_${Date.now()}`, 'secret1')

  // eve 在云端已有进度；本机缓存里是旧位置
  config.saveCloudSession({ accountId: eve.accountId, username: 'eve', displayName: null })
  await cloud.appState.put(
    { currentBookId: 'book_cet4', currentUnitIndex: 5, bookModeProgress: {}, loopCounts: { learn: 2, dictation: 3, phonetic: 1 }, learnedRootIds: ['root_a'], updatedAt: Date.now() },
    [{ bookId: 'book_cet4', mode: 'learn', unitIndex: 5, updatedAt: Date.now() }]
  )
  storage.setItem(WS, JSON.stringify({ state: { currentBookId: 'book_basewords', currentUnitIndex: 9, bookModeProgress: { book_basewords: { learn: 9, dictation: 0, phonetic: 0 } } }, version: 0 }))
  storage.setItem(`${WS}::cloud::${eve.accountId}`, JSON.stringify({ state: { currentBookId: 'book_cet4', currentUnitIndex: 1, bookModeProgress: { book_cet4: { learn: 1, dictation: 0, phonetic: 0 }, book_ielts: { learn: 2, dictation: 0, phonetic: 0 } } }, version: 0 }))

  const storeModule = await import('../../src/store/useWorkspaceStore')
  const sync = await import('../../src/core/cloud/sync')
  const readiness = await import('../../src/core/cloud/readiness')
  const store = storeModule.useWorkspaceStore

  console.log('# H5: pages wait for cloud hydration')
  readiness.resetCloudHydration()
  await storeModule.ensureLocalWorkspaceHydrated()
  check('local cache (eve scope) hydrated first, not local-mode key', store.getState().currentUnitIndex === 1, store.getState().currentUnitIndex)
  let waited = false
  const pageWait = storeModule.ensureWorkspaceHydrated().then(() => { waited = true })
  await sleep(50)
  check('ensureWorkspaceHydrated blocks until cloud hydration', waited === false)
  await sync.hydrateWorkspaceProgress()
  readiness.markCloudHydrated()
  await pageWait
  const s1 = store.getState()
  check('after hydration cloud position wins', s1.currentBookId === 'book_cet4' && s1.currentUnitIndex === 5, [s1.currentBookId, s1.currentUnitIndex])
  check('cloud book mode wins, local-only book mode kept', s1.bookModeProgress.book_cet4?.learn === 5 && s1.bookModeProgress.book_ielts?.learn === 2, s1.bookModeProgress)
  check('loop counts from cloud', s1.loopCounts.learn === 2)
  check('local-mode base key untouched', JSON.parse(storage.getItem(WS)!).state.currentUnitIndex === 9)

  console.log('# push only changed book modes')
  const before = sql(`select server_updated_at from book_progress where account_id='${eve.accountId}' and book_id='book_cet4' and mode='learn'`)
  const stop = sync.startWorkspaceProgressSync()
  await sleep(1500)
  check('local-only book mode pushed after hydration', sql(`select unit_index from book_progress where account_id='${eve.accountId}' and book_id='book_ielts' and mode='learn'`) === '2')
  check('unchanged cloud book mode not rewritten', sql(`select server_updated_at from book_progress where account_id='${eve.accountId}' and book_id='book_cet4' and mode='learn'`) === before)
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_kaoyan: { learn: 0, dictation: 4, phonetic: 0 } } })
  await sync.flushCloudSync()
  check('flushCloudSync resolves after the write landed', sql(`select unit_index from book_progress where account_id='${eve.accountId}' and book_id='book_kaoyan' and mode='dictation'`) === '4')

  console.log('# account switched in another tab before this tab reloads')
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_toefl: { learn: 7, dictation: 0, phonetic: 0 } }, currentUnitIndex: 7 })
  config.saveCloudSession({ accountId: frank.accountId, username: 'frank', displayName: null })
  await sync.flushCloudSync()
  check('pending eve push is NOT written into frank', sql(`select count(*) from book_progress where account_id='${frank.accountId}'`) === '0' && sql(`select count(*) from app_state where account_id='${frank.accountId}'`) === '0')
  store.setState({ currentUnitIndex: 8 })
  check('in-memory eve progress is NOT persisted into frank cache', storage.getItem(`${WS}::cloud::${frank.accountId}`) === null, storage.getItem(`${WS}::cloud::${frank.accountId}`))
  stop()

  console.log('# H1: new account with no cloud rows keeps local state and creates no rows')
  await store.persist.rehydrate()
  const s2 = store.getState()
  check('after reload frank starts from defaults (no eve progress)', !s2.bookModeProgress.book_toefl && !s2.bookModeProgress.book_ielts, s2.bookModeProgress)
  store.setState({ currentUnitIndex: 2 })
  await sync.hydrateWorkspaceProgress()
  check('remote null -> local untouched', store.getState().currentUnitIndex === 2)
  check('hydrate writes nothing to cloud', sql(`select count(*) from app_state where account_id='${frank.accountId}'`) === '0')

  console.log('# translate hydration')
  await cloud.translate.putBook({ id: `custom_book_frank_${frank.accountId}`, accountId: frank.accountId, name: 'f', category: 'custom', isCustom: true, totalSentences: 0, sentences: [], createdAt: 1, updatedAt: 1 } as never)
  await cloud.translate.putState({ currentBookId: `custom_book_frank_${frank.accountId}`, completedSentenceIds: { s9: true }, updatedAt: 1 })
  const { useTranslateStore } = await import('../../src/store/useTranslateStore')
  await sync.hydrateTranslateProgress()
  const t = useTranslateStore.getState()
  check('translate custom book from cloud', t.books.some((b) => b.id === `custom_book_frank_${frank.accountId}`))
  check('translate current book from cloud', t.currentBookId === `custom_book_frank_${frank.accountId}`)
  check('translate completed ids from cloud', Boolean((t.completedSentenceIds as Record<string, boolean>).s9))

  summary()
  process.exit(process.exitCode ?? 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
