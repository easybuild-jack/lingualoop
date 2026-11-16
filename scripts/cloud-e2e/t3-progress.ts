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
  const bookRow = (accountId: string, bookId: string, mode: string) =>
    sql(`select unit_index from book_progress where account_id='${accountId}' and book_id='${bookId}' and mode='${mode}'`)

  // eve 在数据库里已有进度；本机有本地模式的进度和旧版本按账号缓存的进度
  config.saveCloudSession({ accountId: eve.accountId, username: 'eve', displayName: null })
  await cloud.appState.put({ currentBookId: 'book_cet4', currentUnitIndex: 5, bookModeProgress: {}, loopCounts: { learn: 2, dictation: 3, phonetic: 1 }, learnedRootIds: ['root_a'], updatedAt: Date.now() })
  await cloud.appState.putBookModes([{ bookId: 'book_cet4', mode: 'learn', unitIndex: 5, updatedAt: Date.now() }])
  storage.setItem(WS, JSON.stringify({ state: { currentBookId: 'book_basewords', currentUnitIndex: 9, bookModeProgress: { book_basewords: { learn: 9, dictation: 0, phonetic: 0 } }, theme: 'dark' }, version: 0 }))
  storage.setItem(`${WS}::cloud::${eve.accountId}`, JSON.stringify({ state: { currentBookId: 'book_cet4', currentUnitIndex: 1, bookModeProgress: { book_ielts: { learn: 2, dictation: 0, phonetic: 0 } } }, version: 0 }))

  const storeModule = await import('../../src/store/useWorkspaceStore')
  const progress = await import('../../src/core/cloud/progress')
  const readiness = await import('../../src/core/cloud/readiness')
  const notices = await import('../../src/core/cloud/notices')
  const { clearLegacyCloudProgressCache } = await import('../../src/core/cloud/scopedStorage')
  const store = storeModule.useWorkspaceStore
  const received: { text: string; unavailable: boolean }[] = []
  notices.subscribeCloudNotices((notice) => received.push(notice))

  console.log('# startup: progress comes only from the database')
  readiness.resetCloudHydration()
  await storeModule.ensureLocalWorkspaceHydrated()
  check('local-mode progress is not loaded in cloud mode', store.getState().currentUnitIndex === 0 && !store.getState().bookModeProgress.book_basewords?.learn, [store.getState().currentUnitIndex, store.getState().bookModeProgress])
  check('legacy per-account cache is not loaded', !store.getState().bookModeProgress.book_ielts)
  clearLegacyCloudProgressCache()
  check('legacy per-account cache removed', storage.getItem(`${WS}::cloud::${eve.accountId}`) === null)
  let waited = false
  const pageWait = storeModule.ensureWorkspaceHydrated().then(() => { waited = true })
  await sleep(50)
  check('ensureWorkspaceHydrated blocks until the database is loaded', waited === false)
  await progress.loadWorkspaceProgress()
  readiness.markCloudHydrated()
  await pageWait
  const s1 = store.getState()
  check('position from the database', s1.currentBookId === 'book_cet4' && s1.currentUnitIndex === 5, [s1.currentBookId, s1.currentUnitIndex])
  check('book modes from the database only', s1.bookModeProgress.book_cet4?.learn === 5 && Object.keys(s1.bookModeProgress).join() === 'book_cet4', s1.bookModeProgress)
  check('loop counts from the database', s1.loopCounts.learn === 2)

  console.log('# writes go straight to the database')
  const before = sql(`select server_updated_at from book_progress where account_id='${eve.accountId}' and book_id='book_cet4' and mode='learn'`)
  const stop = progress.startWorkspaceProgressWrites()
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_ielts: { learn: 0, dictation: 3, phonetic: 0 } } })
  await progress.waitForCloudWrites()
  check('changed book mode written', bookRow(eve.accountId, 'book_ielts', 'dictation') === '3')
  check('zero modes of the same book not written', sql(`select count(*) from book_progress where account_id='${eve.accountId}' and book_id='book_ielts'`) === '1')
  check('unchanged book mode not rewritten', sql(`select server_updated_at from book_progress where account_id='${eve.accountId}' and book_id='book_cet4' and mode='learn'`) === before)
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_toefl: { learn: 0, dictation: 0, phonetic: 0 } } })
  await progress.waitForCloudWrites()
  check('all-zero book creates no rows', sql(`select count(*) from book_progress where book_id='book_toefl'`) === '0')
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_ielts: { learn: 0, dictation: 0, phonetic: 0 } } })
  await progress.waitForCloudWrites()
  check('mode back to 0 deletes its row', sql(`select count(*) from book_progress where book_id='book_ielts'`) === '0')
  check('no zero rows in book_progress', sql('select count(*) from book_progress where unit_index = 0') === '0')
  store.setState({ currentUnitIndex: 6 })
  await progress.waitForCloudWrites()
  check('position written to app_state', sql(`select current_unit_index from app_state where account_id='${eve.accountId}'`) === '6')
  check('progress not cached in localStorage', JSON.parse(storage.getItem(WS)!).state.currentUnitIndex === 9 && storage.keys().every((key) => !key.includes('::cloud::')), storage.keys())

  console.log('# a failed write is reported once and not retried')
  const realPut = cloud.appState.putBookModes
  let attempts = 0
  cloud.appState.putBookModes = async () => {
    attempts += 1
    throw new Error('boom')
  }
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_kaoyan: { learn: 4, dictation: 0, phonetic: 0 } } })
  await progress.waitForCloudWrites()
  cloud.appState.putBookModes = realPut
  await sleep(300)
  await progress.waitForCloudWrites()
  check('failure reported as unavailable', received.some((n) => n.unavailable && n.text.includes('保存学习进度失败')), received)
  check('write attempted once, no background retry', attempts === 1 && sql(`select count(*) from book_progress where book_id='book_kaoyan'`) === '0', attempts)
  stop()

  console.log('# account switched in another tab before this tab reloads')
  const stop2 = progress.startWorkspaceProgressWrites()
  store.setState({ bookModeProgress: { ...store.getState().bookModeProgress, book_gre: { learn: 7, dictation: 0, phonetic: 0 } }, currentUnitIndex: 7 })
  config.saveCloudSession({ accountId: frank.accountId, username: 'frank', displayName: null })
  await progress.waitForCloudWrites()
  check('eve write is NOT written into frank', sql(`select count(*) from book_progress where account_id='${frank.accountId}'`) === '0' && sql(`select count(*) from app_state where account_id='${frank.accountId}'`) === '0')
  stop2()

  console.log('# new account with no rows: defaults, and loading writes nothing')
  await store.persist.rehydrate()
  await progress.loadWorkspaceProgress()
  const s2 = store.getState()
  check('frank sees no eve progress', Object.keys(s2.bookModeProgress).length === 0, s2.bookModeProgress)
  check('loading writes nothing', sql(`select count(*) from app_state where account_id='${frank.accountId}'`) === '0' && sql(`select count(*) from book_progress where account_id='${frank.accountId}'`) === '0')

  console.log('# translate')
  await cloud.translate.putBook({ id: `custom_book_frank_${frank.accountId}`, accountId: frank.accountId, name: 'f', category: 'custom', isCustom: true, totalSentences: 0, sentences: [], createdAt: 1, updatedAt: 1 } as never)
  await cloud.translate.putState({ currentBookId: `custom_book_frank_${frank.accountId}`, completedSentenceIds: { s9: true }, updatedAt: 1 })
  const { useTranslateStore } = await import('../../src/store/useTranslateStore')
  useTranslateStore.setState({ completedSentenceIds: { stale_local: true } })
  await progress.loadTranslateProgress()
  const t = useTranslateStore.getState()
  check('translate custom book from the database', t.books.some((b) => b.id === `custom_book_frank_${frank.accountId}`))
  check('translate current book from the database', t.currentBookId === `custom_book_frank_${frank.accountId}`)
  check('translate completed ids only from the database', JSON.stringify(t.completedSentenceIds) === '{"s9":true}', t.completedSentenceIds)
  const stopT = progress.startTranslateProgressWrites()
  useTranslateStore.setState({ completedSentenceIds: { ...useTranslateStore.getState().completedSentenceIds, s10: true } })
  await progress.waitForCloudWrites()
  check('translate progress written directly', sql(`select completed_sentence_ids ? 's10' from translate_state where account_id='${frank.accountId}'`) === 't')
  stopT()
  const added = await t.addCustomBook({ id: 'custom_book_direct', accountId: frank.accountId, name: 'd', category: 'custom', isCustom: true, totalSentences: 0, sentences: [], createdAt: 2, updatedAt: 2 } as never)
  check('addCustomBook writes the database first', added && sql(`select count(*) from translate_books where id='custom_book_direct'`) === '1')
  const removed = await useTranslateStore.getState().deleteCustomBook('custom_book_direct')
  check('deleteCustomBook deletes in the database', removed && sql(`select count(*) from translate_books where id='custom_book_direct'`) === '0')

  console.log('# logout waits for writes and clears session')
  await progress.waitForCloudWrites()
  account.logoutAccount()
  check('logout clears session', config.getCloudSession() === null)

  summary()
  process.exit(process.exitCode ?? 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
