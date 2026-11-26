import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TranslationBook } from '@/types'
import { DEFAULT_TRANSLATION_BOOKS, isOfficialTranslationBook } from '@/resources/translateData'
import { audioEngine } from '@/core/audioEngine'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { createScopedProgressStorage } from '@/core/cloud/scopedStorage'
import { isCloudMode, isCloudSignedIn } from '@/core/cloud/config'
import { reportCloudError } from '@/core/cloud/notices'
import { getRepositories } from '@/db/repository'

/** 云模式下不存本机的字段（自定义句库与完成记录、位置都以数据库为准） */
const TRANSLATE_PROGRESS_KEYS = ['currentBookId', 'completedSentenceIds', 'books'] as const

let lastProgressBookId = ''

/**
 * 可以记为学习位置的句库 id：官方示例只供体验，选中时沿用上一个非示例句库（没有则为空串），
 * 本机持久化与数据库写入都用它，因此练习示例不会产生位置记录。
 */
export function progressBookIdOf(currentBookId: string): string {
  if (!isOfficialTranslationBook(currentBookId)) lastProgressBookId = currentBookId
  return lastProgressBookId
}

export type TranslatePracticeMode = 'blind' | 'follow'

interface TranslateState {
  books: TranslationBook[]
  currentBookId: string
  currentSentenceIndex: number
  practiceMode: TranslatePracticeMode
  isPeeking: boolean
  isSentenceCompleted: boolean
  audioRate: number
  isSpeaking: boolean
  isAutoPlayAudio: boolean
  completedSentenceIds: Record<string, boolean>
  isImportModalOpen: boolean
  isGrammarModalOpen: boolean
  repeatSentenceKey: number
  isRefreshingCloudBooks: boolean

  // Actions
  selectBook: (bookId: string) => void
  setCurrentSentenceIndex: (index: number) => void
  nextSentence: () => void
  prevSentence: () => void
  restartBook: () => void
  setPracticeMode: (mode: TranslatePracticeMode) => void
  togglePracticeMode: () => void
  setPeeking: (peeking: boolean) => void
  setAudioRate: (rate: number) => void
  toggleAudioRate: () => void
  setAutoPlayAudio: (enabled: boolean) => void
  toggleAutoPlayAudio: () => void
  setSentenceCompleted: (completed: boolean) => void
  setGrammarModalOpen: (open: boolean) => void
  repeatCurrentSentence: () => void
  playSentenceAudio: (textOrRate?: string | number, customRate?: number) => void
  playWordAudio: (word?: string, customRate?: number) => void
  stopSentenceAudio: () => void
  /** 云模式下先写数据库，失败时提示并返回 false，页面状态不变 */
  addCustomBook: (book: TranslationBook) => Promise<boolean>
  deleteCustomBook: (bookId: string) => Promise<boolean>
  /** 云模式下实时从数据库重新拉取最新自定义句库（无数据库时跳过） */
  refreshCloudBooks: () => Promise<void>
  setImportModalOpen: (open: boolean) => void
}

let inFlightBooksRefresh: Promise<void> | null = null

export const useTranslateStore = create<TranslateState>()(
  persist(
    (set, get) => ({
      books: DEFAULT_TRANSLATION_BOOKS,
      currentBookId: DEFAULT_TRANSLATION_BOOKS[0]?.id || '',
      currentSentenceIndex: 0,
      practiceMode: 'blind',
      isPeeking: false,
      isSentenceCompleted: false,
      audioRate: 0.88,
      isSpeaking: false,
      isAutoPlayAudio: true,
      completedSentenceIds: {},
      isImportModalOpen: false,
      isGrammarModalOpen: false,
      repeatSentenceKey: 0,
      isRefreshingCloudBooks: false,

      selectBook: (bookId: string) => {
        audioEngine.cancelPendingPlayback()
        set({
          currentBookId: bookId,
          currentSentenceIndex: 0,
          isSentenceCompleted: false,
          isGrammarModalOpen: false,
          isPeeking: false,
          isSpeaking: false,
        })
      },

      setCurrentSentenceIndex: (index: number) => {
        audioEngine.cancelPendingPlayback()
        const { books, currentBookId } = get()
        const currentBook = books.find((b) => b.id === currentBookId) || books[0]
        const len = currentBook?.sentences.length ?? 0
        const clampedIndex = len > 0 ? Math.max(0, Math.min(index, len - 1)) : 0
        set({
          currentSentenceIndex: clampedIndex,
          isSentenceCompleted: false,
          isGrammarModalOpen: false,
          isPeeking: false,
          isSpeaking: false,
        })
      },

      nextSentence: () => {
        audioEngine.cancelPendingPlayback()
        const { books, currentBookId, currentSentenceIndex } = get()
        const currentBook = books.find((b) => b.id === currentBookId) || books[0]
        if (currentBook && currentSentenceIndex < currentBook.sentences.length - 1) {
          set({
            currentSentenceIndex: currentSentenceIndex + 1,
            isSentenceCompleted: false,
            isGrammarModalOpen: false,
            isPeeking: false,
            isSpeaking: false,
          })
        }
      },

      prevSentence: () => {
        audioEngine.cancelPendingPlayback()
        const { currentSentenceIndex } = get()
        if (currentSentenceIndex > 0) {
          set({
            currentSentenceIndex: currentSentenceIndex - 1,
            isSentenceCompleted: false,
            isGrammarModalOpen: false,
            isPeeking: false,
            isSpeaking: false,
          })
        }
      },

      restartBook: () => {
        audioEngine.cancelPendingPlayback()
        set({
          currentSentenceIndex: 0,
          isSentenceCompleted: false,
          isGrammarModalOpen: false,
          isPeeking: false,
          isSpeaking: false,
        })
      },

      setGrammarModalOpen: (open: boolean) => {
        set({ isGrammarModalOpen: open })
      },

      repeatCurrentSentence: () => {
        audioEngine.cancelPendingPlayback()
        set((state) => ({
          isSentenceCompleted: false,
          isGrammarModalOpen: false,
          isSpeaking: false,
          repeatSentenceKey: state.repeatSentenceKey + 1,
        }))
      },

      setPeeking: (peeking: boolean) => {
        set({ isPeeking: peeking })
      },

      setPracticeMode: (mode: TranslatePracticeMode) => {
        set({ practiceMode: mode })
      },

      togglePracticeMode: () => {
        set((state) => ({
          practiceMode: state.practiceMode === 'blind' ? 'follow' : 'blind',
        }))
      },

      setAudioRate: (rate: number) => {
        set({ audioRate: rate })
      },

      toggleAudioRate: () => {
        const currentRate = get().audioRate
        const nextRate = currentRate <= 0.78 ? 1.0 : currentRate >= 1.0 ? 0.75 : 1.0
        set({ audioRate: nextRate })
      },

      setAutoPlayAudio: (enabled: boolean) => {
        set({ isAutoPlayAudio: enabled })
      },

      toggleAutoPlayAudio: () => {
        set((state) => ({ isAutoPlayAudio: !state.isAutoPlayAudio }))
      },

      setSentenceCompleted: (completed: boolean) => {
        const { books, currentBookId, currentSentenceIndex, completedSentenceIds } = get()
        const currentBook = books.find((b) => b.id === currentBookId) || books[0]
        const currentSentence = currentBook?.sentences[currentSentenceIndex]

        set({
          isSentenceCompleted: completed,
          completedSentenceIds: currentSentence && !currentBook.isOfficial
            ? { ...completedSentenceIds, [currentSentence.id]: true }
            : completedSentenceIds,
        })
      },

      playWordAudio: (word?: string, customRate?: number) => {
        const { books, currentBookId, currentSentenceIndex } = get()
        const currentBook = books.find((b) => b.id === currentBookId) || books[0]
        const currentSentence = currentBook.sentences[currentSentenceIndex]

        let targetWord = word?.trim()
        if (!targetWord && currentSentence?.keywords?.length) {
          targetWord = currentSentence.keywords[0]?.word
        }
        if (!targetWord) return

        const phoneticPreference =
          useWorkspaceStore.getState().phoneticPreference || 'us'
        const rateToUse = customRate ?? 1.0

        audioEngine.cancelPendingPlayback()
        set({ isSpeaking: true })
        audioEngine
          .playPronunciationOnce(targetWord, phoneticPreference, rateToUse)
          .finally(() => {
            set({ isSpeaking: false })
          })
      },

      playSentenceAudio: (textOrRate?: string | number, customRate?: number) => {
        const { books, currentBookId, currentSentenceIndex, audioRate } = get()
        const currentBook = books.find((b) => b.id === currentBookId) || books[0]
        const currentSentence = currentBook.sentences[currentSentenceIndex]

        let sentenceText = currentSentence?.sentenceEn
        let rateToUse = audioRate

        if (typeof textOrRate === 'string') {
          sentenceText = textOrRate
          if (typeof customRate === 'number') rateToUse = customRate
        } else if (typeof textOrRate === 'number') {
          rateToUse = textOrRate
        }

        if (!sentenceText?.trim()) return

        const phoneticPreference =
          useWorkspaceStore.getState().phoneticPreference || 'us'

        audioEngine.cancelPendingPlayback()
        set({ isSpeaking: true })
        audioEngine.playSentence(
          sentenceText,
          phoneticPreference,
          rateToUse,
          () => {
            set({ isSpeaking: false })
          }
        )
      },

      stopSentenceAudio: () => {
        audioEngine.cancelPendingPlayback()
        set({ isSpeaking: false })
      },

      addCustomBook: async (book: TranslationBook) => {
        if (isCloudMode()) {
          try {
            await getRepositories().translate.putBook(book)
          } catch (error) {
            reportCloudError(error, '保存自定义句库')
            return false
          }
        }
        set((state) => {
          const filtered = state.books.filter((b) => b.id !== book.id)
          return {
            books: [...filtered, book],
            currentBookId: book.id,
            currentSentenceIndex: 0,
            isSentenceCompleted: false,
            isPeeking: false,
            isSpeaking: false,
          }
        })
        return true
      },

      deleteCustomBook: async (bookId: string) => {
        if (isCloudMode()) {
          try {
            await getRepositories().translate.deleteBook(bookId)
          } catch (error) {
            reportCloudError(error, '删除自定义句库')
            return false
          }
        }
        set((state) => {
          const filtered = state.books.filter((b) => b.id !== bookId)
          const nextBooks = filtered.length > 0 ? filtered : DEFAULT_TRANSLATION_BOOKS
          return {
            books: nextBooks,
            currentBookId: nextBooks[0]?.id || '',
            currentSentenceIndex: 0,
            isSentenceCompleted: false,
            isPeeking: false,
            isSpeaking: false,
          }
        })
        return true
      },

      refreshCloudBooks: async () => {
        if (!isCloudSignedIn()) return
        if (inFlightBooksRefresh) return inFlightBooksRefresh

        inFlightBooksRefresh = (async () => {
          set({ isRefreshingCloudBooks: true })
          try {
            const repositories = getRepositories()
            const [remoteBooks, remoteState] = await Promise.all([
              repositories.translate.getBooks(),
              repositories.translate.getState(),
            ])
            const nextBooks = [
              ...DEFAULT_TRANSLATION_BOOKS,
              ...remoteBooks.map((book) => ({ ...book, isCustom: true })),
            ]
            set((state) => {
              const keepCurrent = nextBooks.some((b) => b.id === state.currentBookId)
              const preferredFromCloud =
                remoteState?.currentBookId && nextBooks.some((b) => b.id === remoteState.currentBookId)
                  ? remoteState.currentBookId
                  : null
              const nextBookId = keepCurrent
                ? state.currentBookId
                : preferredFromCloud || nextBooks[0]?.id || ''
              progressBookIdOf(nextBookId)
              const remoteCompleted = (remoteState?.completedSentenceIds ?? {}) as Record<string, boolean>
              const mergedCompleted: Record<string, boolean> = remoteState?.completedSentenceIds
                ? { ...state.completedSentenceIds, ...remoteCompleted }
                : state.completedSentenceIds
              return {
                books: nextBooks,
                currentBookId: nextBookId,
                completedSentenceIds: mergedCompleted,
                ...(keepCurrent ? {} : { currentSentenceIndex: 0, isSentenceCompleted: false }),
              }
            })
          } catch (error) {
            reportCloudError(error, '读取云端句库')
          } finally {
            set({ isRefreshingCloudBooks: false })
            inFlightBooksRefresh = null
          }
        })()

        return inFlightBooksRefresh
      },

      setImportModalOpen: (open: boolean) => {
        set({ isImportModalOpen: open })
      },
    }),
    {
      name: 'lingualoop-translate-storage',
      storage: createJSONStorage(() => createScopedProgressStorage(TRANSLATE_PROGRESS_KEYS)),
      partialize: (state) => ({
        currentBookId: progressBookIdOf(state.currentBookId) || undefined,
        practiceMode: state.practiceMode,
        audioRate: state.audioRate,
        isAutoPlayAudio: state.isAutoPlayAudio,
        completedSentenceIds: state.completedSentenceIds,
        books: state.books.filter((b) => b.isCustom),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // 云模式下句库与位置完全以数据库为准，绝不用本地缓存覆盖内存里的云端句库
        if (isCloudMode()) return
        // 本地模式：保证默认预置题库始终合并存在
        const customBooks = (state.books || []).filter((b) => b.isCustom)
        state.books = [...DEFAULT_TRANSLATION_BOOKS, ...customBooks]
        if (!state.books.some((b) => b.id === state.currentBookId)) {
          state.currentBookId = state.books[0]?.id || ''
        }
        progressBookIdOf(state.currentBookId)
      },
    }
  )
)

/** 等待翻译 store 完成本地设置字段水合（供 CloudSyncGate 在拉取云端句库前调用） */
export const ensureLocalTranslateHydrated = async (): Promise<void> => {
  if (typeof window === 'undefined') return
  if (useTranslateStore.persist?.hasHydrated?.()) return
  await new Promise<void>((resolve) => {
    const unsub = useTranslateStore.persist.onFinishHydration(() => {
      unsub()
      resolve()
    })
    setTimeout(() => {
      unsub()
      resolve()
    }, 150)
  })
}
