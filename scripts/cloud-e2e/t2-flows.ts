import { API_URL, ANON_KEY, PSQL, resetDatabase, storage, check, summary } from './env'
import { execSync } from 'node:child_process'

function sql(query: string): string {
  return execSync(`${PSQL} -Atc ${JSON.stringify(query)}`).toString().trim()
}

async function main() {
  resetDatabase()
  const config = await import('../../src/core/cloud/config')
  const account = await import('../../src/core/cloud/account')
  const { localRepositories, getRepositories } = await import('../../src/db/repository')
  const dbIndex = await import('../../src/db/index')
  const { DEFAULT_SAMPLE_CUSTOM_BOOK } = await import('../../src/resources/books')
  const { createScopedProgressStorage } = await import('../../src/core/cloud/scopedStorage')

  console.log('# pure local mode')
  check('no config -> local repositories', getRepositories().mode === 'local')
  await dbIndex.recordWordAttempt('w_local', 'cet4', false, 'dictation')
  await dbIndex.markUnitWordCompleted({ bookId: 'cet4', unitId: 'cet4_semantic_1', mode: 'learn', wordId: 'w_local', wordIndex: 0, unitWordIds: ['w_local', 'w2'] })
  await dbIndex.toggleStarWord('w_star', 'cet4')
  check('local record written to IndexedDB', (await localRepositories.wordRecords.get('w_local'))?.isError === true)
  check('local unit progress written', (await localRepositories.unitProgress.get('cet4_semantic_1', 'learn'))?.completedWordIds.length === 1)
  check('local starred ids', JSON.stringify(await dbIndex.getStarredWordIds()) === '["w_star"]')
  const custom = await dbIndex.getCustomBooks()
  check('local getCustomBooks seeds sample book', custom[0]?.id === DEFAULT_SAMPLE_CUSTOM_BOOK.id)
  const personalLocal = await dbIndex.saveCustomVocabularyBook('local book', '', [{ id: 'w_l', name: 'l', syllables: ['l'], posList: [] }])
  check('local saved book has no accountId', personalLocal.accountId === undefined)
  const scoped = createScopedProgressStorage(['currentBookId'])
  scoped.setItem('ws', JSON.stringify({ state: { currentBookId: 'local-book', theme: 'dark' }, version: 1 }))
  check('local mode persist writes base key unchanged', JSON.parse(storage.getItem('ws')!).state.currentBookId === 'local-book')
  storage.setItem('lingualoop-workspace-storage', JSON.stringify({
    state: { currentBookId: 'cet4', currentUnitIndex: 4, bookModeProgress: { cet4: { learn: 4, dictation: 2, phonetic: 0 } }, loopCounts: { learn: 1, dictation: 3, phonetic: 1 }, learnedRootIds: ['r1'] },
    version: 0,
  }))

  console.log('# cloud: scoped persist storage')
  config.saveCloudConfig(API_URL, ANON_KEY)
  check('config -> cloud repositories', getRepositories().mode === 'cloud')
  check('cloud mode not signed in: progress not read', scoped.getItem('ws') === JSON.stringify({ state: { theme: 'dark' }, version: 1 }), scoped.getItem('ws'))
  const carol = await account.registerAccount('carol', 'secret1')
  scoped.getItem('ws') // 登录后整页重载：按新账号重新水合
  scoped.setItem('ws', JSON.stringify({ state: { currentBookId: 'carol-book', theme: 'light' }, version: 1 }))
  check('cloud write keeps local progress in base key', JSON.parse(storage.getItem('ws')!).state.currentBookId === 'local-book')
  check('cloud write stores settings in base key', JSON.parse(storage.getItem('ws')!).state.theme === 'light')
  check('cloud write stores progress in scoped key', JSON.parse(storage.getItem(`ws::cloud::${carol.accountId}`)!).state.currentBookId === 'carol-book')

  console.log('# migration (H2)')
  const { uploadLocalDataToCloud } = await import('../../src/core/cloud/migrate')
  const first = await uploadLocalDataToCloud('personal')
  check('migration uploads official unit progress', first.progress === 1, first)
  check('migration uploads word records', first.words === 2, first)
  check('migration uploads book_progress', first.bookProgress === 3, first)
  check('migration creates app_state', first.appState === true, first)
  check('migration uploads custom books (sample + local book)', first.books === 2, first)
  check('official progress in cloud for carol', sql(`select count(*) from unit_progress where account_id='${carol.accountId}' and book_kind='official'`) === '1')
  check('uploaded books are personal', sql(`select count(*) from vocab_books where account_id='${carol.accountId}'`) === '2')
  const second = await uploadLocalDataToCloud('personal')
  check('second migration inserts nothing', second.progress === 0 && second.words === 0 && second.books === 0 && !second.appState, second)
  const remote = await getRepositories().appState.get()
  check('migrated app_state position', remote?.currentBookId === 'cet4' && remote.currentUnitIndex === 4 && remote.bookModeProgress.cet4?.learn === 4, remote)

  console.log('# sample book with fixed id (suspected issue)')
  sql(`update vocab_books set words = '[{"id":"carol_w","name":"carol","syllables":["carol"],"posList":[]}]'::jsonb where id='${DEFAULT_SAMPLE_CUSTOM_BOOK.id}'`)
  const dave = await account.registerAccount('dave', 'secret1')
  const daveBooks = await dbIndex.getCustomBooks()
  check('dave is not shown an unwritable sample book', daveBooks.length === 0, daveBooks.map((b) => b.id))
  const sampleWords = sql(`select words::text from vocab_books where id='${DEFAULT_SAMPLE_CUSTOM_BOOK.id}'`)
  check('carol personal sample book NOT overwritten by dave', sampleWords.includes('carol_w'), sampleWords.slice(0, 120))
  check('sample book still owned by carol', sql(`select account_id from vocab_books where id='${DEFAULT_SAMPLE_CUSTOM_BOOK.id}'`) === carol.accountId)
  sql(`delete from vocab_books where id='${DEFAULT_SAMPLE_CUSTOM_BOOK.id}'`)
  const daveBooks2 = await dbIndex.getCustomBooks()
  check('when the sample id is free it is inserted as shared and returned', daveBooks2[0]?.id === DEFAULT_SAMPLE_CUSTOM_BOOK.id && daveBooks2[0]?.accountId === null, daveBooks2.map((b) => [b.id, b.accountId]))
  const daveMerge = await dbIndex.mergeWordsIntoBook(DEFAULT_SAMPLE_CUSTOM_BOOK.id, [{ id: 'd1', name: 'd', syllables: [], posList: [] }])
  check('dave can import into the shared sample book', daveMerge !== null)
  void dave

  console.log('# inbox (H6)')
  config.saveCloudSession({ accountId: carol.accountId, username: 'carol', displayName: null })
  sql(`insert into collected_words(word, word_item, source) values ('apple', '{"name":"apple","syllables":["ap","ple"],"posList":[{"pos":"n.","means":["苹果"]}]}', 'tool')`)
  sql(`insert into collected_words(word) values ('hello world!!')`)
  sql(`insert into collected_words(word) values ('zzqxv')`)
  const { pullCollectedWords, collectedBookId } = await import('../../src/core/cloud/collector')
  const pulled = await pullCollectedWords()
  check('apple collected', pulled?.added.map((w) => w.name).join() === 'apple', pulled)
  check('apple starred for carol', sql(`select is_starred from word_records where account_id='${carol.accountId}' and word_id='${(await import('../../src/lib/wordId')).buildWordId('apple')}'`) === 't')
  check('collected book is carol personal', sql(`select account_id from vocab_books where id='${collectedBookId(carol.accountId)}'`) === carol.accountId)
  check('non-word marked failed (terminal)', sql(`select status from collected_words where word='hello world!!'`) === 'failed')
  check('lookup failure is retryable (pending)', sql(`select status||':'||attempts from collected_words where word='zzqxv'`) === 'pending:1', sql(`select status||':'||attempts||':'||coalesce(last_error,'') from collected_words where word='zzqxv'`))
  for (let i = 0; i < 5; i += 1) await pullCollectedWords()
  check('retryable failure becomes terminal after max attempts', sql(`select status from collected_words where word='zzqxv'`) === 'failed', sql(`select status||':'||attempts from collected_words where word='zzqxv'`))
  check('nothing stuck in processing', sql(`select count(*) from collected_words where status='processing'`) === '0')

  summary()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
