import { API_URL, ANON_KEY, PSQL, resetDatabase, storage, check, summary, expectError } from './env'
import { execSync } from 'node:child_process'

function sql(query: string): string {
  return execSync(`${PSQL} -Atc ${JSON.stringify(query)}`).toString().trim()
}

async function main() {
  resetDatabase()
  const config = await import('../../src/core/cloud/config')
  const account = await import('../../src/core/cloud/account')
  const repo = await import('../../src/core/cloud/supabaseRepository')
  const { probeCloudConnection } = await import('../../src/core/cloud/client')
  const { cloudRepositories: cloud, cloudOperations: ops } = repo

  config.saveCloudConfig(API_URL, ANON_KEY)
  console.log('# probe')
  const probe = await probeCloudConnection()
  check('probe ok with schema v2', probe.ok, probe)

  console.log('# not signed in')
  const notSigned = (await expectError(() => cloud.wordRecords.getAll())) as { code?: string } | null
  check('progress read without account throws P0001', notSigned?.code === 'P0001', notSigned)

  console.log('# register / login / password')
  const alice = await account.registerAccount('Alice', 'secret1')
  check('register returns account id', /^[0-9a-f-]{36}$/.test(alice.accountId), alice)
  check('session stored after register', config.getCloudAccountId() === alice.accountId)
  const dup = (await expectError(() => account.registerAccount('alice', 'whatever1'))) as Error
  check('duplicate username (case-insensitive) rejected', dup?.message.includes('已被占用'), dup?.message)
  const short = (await expectError(() => account.registerAccount('x', '123'))) as Error
  check('short password rejected locally', short?.message.includes('至少'), short?.message)
  const wrong = (await expectError(() => account.loginAccount('alice', 'nope123'))) as Error
  check('wrong password rejected', wrong?.message === '账号名或密码错误。', wrong?.message)
  const badOld = (await expectError(() => account.changeAccountPassword('bad-old', 'secret2'))) as Error
  check('change password with wrong old password rejected', badOld?.message === '原密码不正确。', badOld?.message)
  await account.changeAccountPassword('secret1', 'secret2')
  const oldLogin = (await expectError(() => account.loginAccount('alice', 'secret1'))) as Error
  check('old password no longer works', Boolean(oldLogin))
  const relogin = await account.loginAccount('  ALICE ', 'secret2')
  check('login with new password (trim + case-insensitive)', relogin.accountId === alice.accountId)
  check('verifyCurrentAccount true', await account.verifyCurrentAccount())

  const bob = await account.registerAccount('bob', 'secret1')
  const asAlice = () => config.saveCloudSession({ accountId: alice.accountId, username: 'Alice', displayName: null })
  const asBob = () => config.saveCloudSession({ accountId: bob.accountId, username: 'bob', displayName: null })

  console.log('# progress isolation (official book)')
  asAlice()
  await ops.recordWordAttempt({ wordId: 'w_apple', bookId: 'cet4', isCorrect: false, mode: 'dictation' })
  await ops.markUnitWordCompleted({
    bookId: 'cet4', unitId: 'cet4_unit_0', mode: 'learn', wordId: 'w_apple', wordIndex: 0,
    unitWordIds: ['w_apple', 'w_pear'], deferForRetry: false,
  })
  await cloud.appState.put(
    { currentBookId: 'cet4', currentUnitIndex: 3, bookModeProgress: {}, loopCounts: { learn: 2 }, learnedRootIds: [], updatedAt: Date.now() },
    [{ bookId: 'cet4', mode: 'learn', unitIndex: 3, updatedAt: Date.now() }]
  )
  asBob()
  check('bob does not see alice word record', (await cloud.wordRecords.get('w_apple')) === undefined)
  check('bob has no unit progress', (await cloud.unitProgress.get('cet4_unit_0', 'learn')) === undefined)
  check('bob app_state is null (no seed row, H1)', (await cloud.appState.get()) === null)
  await ops.markUnitWordCompleted({
    bookId: 'cet4', unitId: 'cet4_unit_0', mode: 'learn', wordId: 'w_pear', wordIndex: 1,
    unitWordIds: ['w_apple', 'w_pear'], deferForRetry: false,
  })
  asAlice()
  const aliceUnit = await cloud.unitProgress.get('cet4_unit_0', 'learn')
  check('alice unit progress untouched by bob', JSON.stringify(aliceUnit?.completedWordIds) === '["w_apple"]', aliceUnit)
  const aliceState = await cloud.appState.get()
  check('alice app_state + book_progress', aliceState?.currentUnitIndex === 3 && aliceState.bookModeProgress.cet4?.learn === 3, aliceState)

  console.log('# book_progress newer wins')
  await cloud.appState.put(
    { currentBookId: 'cet4', currentUnitIndex: 3, bookModeProgress: {}, loopCounts: {}, learnedRootIds: [], updatedAt: Date.now() },
    [{ bookId: 'cet4', mode: 'learn', unitIndex: 1, updatedAt: 1 }]
  )
  check('older book_progress write ignored', (await cloud.appState.get())?.bookModeProgress.cet4?.learn === 3)

  console.log('# content visibility')
  const now = Date.now()
  const mkBook = (id: string, owner: string | null) => ({
    id, accountId: owner, name: id, description: '', category: 'custom' as const, isCustom: true,
    unitSize: 20, totalWords: 1, words: [{ id: 'w_x', name: 'x', syllables: ['x'], posList: [] }],
    createdAt: now, updatedAt: now,
  })
  await cloud.books.put(mkBook('book_custom_alice_personal', alice.accountId))
  await cloud.books.put(mkBook('book_custom_shared_1', null))
  await ops.markUnitWordCompleted({
    bookId: 'book_custom_shared_1', unitId: 'book_custom_shared_1_unit_0', mode: 'learn', wordId: 'w_x', wordIndex: 0,
    unitWordIds: ['w_x'], deferForRetry: false,
  })
  asBob()
  const bobBooks = (await cloud.books.getCustom()).map((b) => b.id)
  check('bob sees shared, not alice personal', bobBooks.includes('book_custom_shared_1') && !bobBooks.includes('book_custom_alice_personal'), bobBooks)
  check('bob get(personal) undefined', (await cloud.books.get('book_custom_alice_personal')) === undefined)
  await cloud.books.update('book_custom_alice_personal', { name: 'hacked' })
  await cloud.books.delete('book_custom_alice_personal')
  check('bob update/delete on alice personal has no effect', sql("select name from vocab_books where id='book_custom_alice_personal'") === 'book_custom_alice_personal')
  const steal = (await expectError(() => cloud.books.put(mkBook('book_custom_alice_personal', bob.accountId)))) as { code?: string }
  check('bob upsert alice personal id with his account rejected (23514)', steal?.code === '23514', steal)
  check('bob merge into alice personal returns null', (await ops.mergeWordsIntoBook('book_custom_alice_personal', [])) === null)
  await cloud.books.update('book_custom_shared_1', { name: 'edited-by-bob' })
  check('bob can edit shared', sql("select name from vocab_books where id='book_custom_shared_1'") === 'edited-by-bob')
  await cloud.books.delete('book_custom_shared_1')
  check('bob can delete shared', sql("select count(*) from vocab_books where id='book_custom_shared_1'") === '0')
  check('deleting shared book removed alice progress on it', sql("select count(*) from unit_progress where book_id='book_custom_shared_1'") === '0')

  console.log('# reading / radio / translate visibility')
  asAlice()
  await cloud.reading.putArticle({ id: 'r_personal', accountId: alice.accountId, title: 't', paragraphs: [], isCustom: true, createdAt: now })
  await cloud.reading.putArticle({ id: 'r_shared', accountId: null, title: 't', paragraphs: [], isCustom: true, createdAt: now })
  await cloud.radio.putItem({ id: 'v_personal', accountId: alice.accountId, category: 'radio', title: 'v', type: 'video', src: 'https://oss.example.com/a.mp4', duration: 10, scenario: '', createdAt: now, playCount: 0 })
  await cloud.radio.putItem({ id: 'v_shared', accountId: null, category: 'radio', title: 'v', type: 'video', src: 'https://oss.example.com/b.mp4', duration: 10, scenario: '', createdAt: now, playCount: 0 })
  await cloud.translate.putBook({ id: 'custom_book_p', accountId: alice.accountId, name: 'p', category: 'custom', isCustom: true, totalSentences: 0, sentences: [], createdAt: now, updatedAt: now } as never)
  asBob()
  const bobArticles = (await cloud.reading.getArticles()).map((a) => a.id)
  const bobRadio = (await cloud.radio.getItems()).map((a) => a.id)
  const bobTranslate = (await cloud.translate.getBooks()).map((a) => a.id)
  check('reading: bob sees only shared', JSON.stringify(bobArticles) === '["r_shared"]', bobArticles)
  check('radio: bob sees only shared', JSON.stringify(bobRadio) === '["v_shared"]', bobRadio)
  check('translate: bob cannot see personal', !bobTranslate.includes('custom_book_p'), bobTranslate)
  await cloud.reading.deleteArticle('r_personal')
  await cloud.radio.deleteItem('v_shared')
  check('reading: bob delete alice personal no effect', sql("select count(*) from reading_articles where id='r_personal'") === '1')
  check('radio: bob deletes shared', sql("select count(*) from radio_items where id='v_shared'") === '0')

  console.log('# translate state union')
  await cloud.translate.putState({ currentBookId: 'b1', completedSentenceIds: { s1: true }, updatedAt: now })
  await cloud.translate.putState({ currentBookId: undefined, completedSentenceIds: { s2: true }, updatedAt: now })
  const ts = await cloud.translate.getState()
  check('translate completed ids merged as union', Boolean(ts?.completedSentenceIds.s1 && ts.completedSentenceIds.s2) && ts?.currentBookId === 'b1', ts)

  console.log('# H3: > 1000 rows')
  asAlice()
  const many = Array.from({ length: 2500 }, (_, i) => ({
    wordId: `bulk_${String(i).padStart(5, '0')}`, bookId: 'cet4', isMastered: false, isStarred: i < 1500,
    isError: i >= 2000, totalPracticeCount: 1, dictationErrorCount: 0, consecutiveCorrectCount: 0, lastPracticedAt: now,
  }))
  const inserted = await repo.cloudMigration.insertWordRecords(many)
  check('insertWordRecords inserted 2500', inserted === 2500, inserted)
  const again = await repo.cloudMigration.insertWordRecords(many)
  check('re-insert is a no-op (0 inserted)', again === 0, again)
  const all = await cloud.wordRecords.getAll()
  check('wordRecords.getAll returns all 2501 rows', all.length === 2501, all.length)
  const starred = await ops.getStarredWordIds()
  check('getStarredWordIds returns 1500', starred.length === 1500, starred.length)
  const trouble = await ops.getTroubleWordRecords()
  check('getTroubleWordRecords returns 2001 (1500 starred + 500 error + w_apple)', trouble.length === 2001, trouble.length)

  console.log('# H4: concurrency')
  await Promise.all(Array.from({ length: 30 }, () => ops.recordWordAttempt({ wordId: 'w_conc', bookId: 'cet4', isCorrect: true, mode: 'learn' })))
  check('30 parallel attempts -> 30', (await cloud.wordRecords.get('w_conc'))?.totalPracticeCount === 30)
  const unitIds = Array.from({ length: 15 }, (_, i) => `cw_${i}`)
  await Promise.all(unitIds.map((wordId, i) => ops.markUnitWordCompleted({
    bookId: 'cet4', unitId: 'cet4_unit_9', mode: 'dictation', wordId, wordIndex: i, unitWordIds: unitIds, deferForRetry: false,
  })))
  const unit9 = await cloud.unitProgress.get('cet4_unit_9', 'dictation')
  check('15 parallel completions all recorded and unit completed', unit9?.completedWordIds.length === 15 && unit9.status === 'completed', unit9)
  await cloud.books.put(mkBook('book_custom_merge', alice.accountId))
  await Promise.all(Array.from({ length: 10 }, (_, i) => ops.mergeWordsIntoBook('book_custom_merge', [{ id: `m_${i}`, name: `m${i}`, syllables: [], posList: [] }])))
  check('10 parallel merges keep all words', (await cloud.books.get('book_custom_merge'))?.words.length === 11)
  const moved = (await expectError(() => cloud.unitProgress.put({ unitId: 'cet4_unit_9', bookId: 'other', mode: 'dictation', status: 'in_progress', currentWordIndex: 0, completedWordIds: [], retryWordIds: [] }))) as { code?: string }
  check('moving unit progress to another book rejected (23514)', moved?.code === '23514', moved)

  console.log('# logout')
  storage.setItem(`lingualoop-workspace-storage::cloud::${alice.accountId}`, '{}')
  account.logoutAccount()
  check('logout clears session', config.getCloudSession() === null)
  check('logout clears scoped cache', storage.getItem(`lingualoop-workspace-storage::cloud::${alice.accountId}`) === null)

  summary()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
