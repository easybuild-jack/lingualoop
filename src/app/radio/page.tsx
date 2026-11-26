'use client'

import React, { useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react'
import {
  type RadioItem,
  type RadioCategory,
  type RadioScenario,
  type PlayMode,
  RADIO_CATEGORY_LABELS,
  DEFAULT_RADIO_SCENARIOS,
  DEFAULT_SAMPLE_RADIO_ITEMS,
} from '@/resources/radioData'
import { RadioHeader } from '@/components/radio/RadioHeader'
import { RadioFilters } from '@/components/radio/RadioFilters'
import { RadioMainPlayer } from '@/components/radio/RadioMainPlayer'
import { RadioCardList } from '@/components/radio/RadioCardList'
import { RadioUploadModal } from '@/components/radio/RadioUploadModal'
import { ConfirmDeleteModal } from '@/components/modals/ConfirmDeleteModal'
import { ArrowLeft, FolderOpen, RefreshCw, X } from 'lucide-react'
import { isCloudMode, subscribeCloudMode } from '@/core/cloud/config'
import { reportCloudError } from '@/core/cloud/notices'
import { subscribeCloudRefresh } from '@/core/cloud/realtime'
import { getRepositories } from '@/db/repository'
import {
  type LocalFolder,
  type LocalVideoEntry,
  createLocalFolder,
  createLocalVideoEntry,
  deleteLocalFolder,
  deleteLocalVideo,
  isLocalFolderSupported,
  isLocalVideoSupported,
  listLocalFolders,
  listLocalVideos,
  openLocalVideoUrl,
  pickLocalFolderHandle,
  pickLocalVideoHandle,
  readVideoDuration,
  saveLocalFolder,
  saveLocalVideo,
  scanFolderVideos,
} from '@/lib/radio/localVideos'

type ActiveTab = 'official' | RadioCategory | 'local' | 'player'
type ScopeFilter = 'all' | 'personal' | 'shared'

const CATEGORY_TABS: RadioCategory[] = ['phrases', 'dialogue', 'radio']

/** 浏览器能力不会中途变化，订阅函数固定为 noop，避免每次渲染重新订阅 */
const noopSubscribe = () => () => {}

/** 本地视频记录 -> 列表/播放器用的 RadioItem（src 为空表示本次会话还没解析出 blob URL） */
function localEntryToItem(entry: LocalVideoEntry, src: string): RadioItem {
  return {
    id: entry.id,
    isLocal: true,
    folderId: entry.folderId,
    folderName: entry.folderName,
    // 本机视频不属于任何云分类，category 只作占位，播放页靠 isLocal 判断来源
    category: 'phrases',
    title: entry.title,
    type: 'video',
    src,
    duration: entry.duration,
    scenario: '本地视频',
    createdAt: entry.addedAt,
    playCount: 0,
  }
}

export default function RadioPage() {
  // 当前激活的 Tab：'official' (官方示例) | 'phrases' (常用短语) | 'dialogue' (场景对话) | 'radio' (英语电台) | 'local' (本地视频) | 'player' (共用播放页)
  const [activeTab, setActiveTab] = useState<ActiveTab>('official')
  // 自定义分类下的归属筛选：全部 / 个人 / 共享
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  // 记录最近一次浏览的列表分类 Tab，用于从共用播放页点击「返回列表」及添加视频时的默认分类
  const [lastCategoryTab, setLastCategoryTab] = useState<RadioCategory>('phrases')
  const cloudMode = useSyncExternalStore(subscribeCloudMode, isCloudMode, () => false)

  // 视频列表（三个模块初始各有 1 个示例视频）
  const [items, setItems] = useState<RadioItem[]>(() => DEFAULT_SAMPLE_RADIO_ITEMS)
  const [currentId, setCurrentId] = useState<string>(() => DEFAULT_SAMPLE_RADIO_ITEMS[0]?.id || '')

  // 播放器状态
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  const [playMode, setPlayMode] = useState<PlayMode>('list-loop')
  const [volume, setVolume] = useState(0.8)

  // 筛选、分页与检索状态
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedScenario, setSelectedScenario] = useState<RadioScenario | 'all'>('all')
  const [listPage, setListPage] = useState(1)

  // 弹窗状态
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)

  // 本地视频：entries 是 IndexedDB 里的句柄记录，localItems 是已解析出 blob URL 的可播放条目
  const [localEntries, setLocalEntries] = useState<LocalVideoEntry[]>([])
  const [localItems, setLocalItems] = useState<RadioItem[]>([])
  // 本机文件夹：folderVideos 是扫描出来的视频（不单独入库，靠文件夹句柄重新扫描）
  const [folders, setFolders] = useState<LocalFolder[]>([])
  const [folderVideos, setFolderVideos] = useState<LocalVideoEntry[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const [isLocalBusy, setIsLocalBusy] = useState(false)
  // 每个本地条目当前的 blob URL，切走或删除时释放，避免内存泄漏
  const localUrlsRef = useRef<Map<string, string>>(new Map())

  // 浏览器能力探测：服务端快照固定 false，避免水合前后文案不一致
  const localSupported = useSyncExternalStore(noopSubscribe, isLocalVideoSupported, () => false)
  const folderSupported = useSyncExternalStore(noopSubscribe, isLocalFolderSupported, () => false)

  // 云模式：实时加载数据库里的链接视频（共享 + 当前账号个人），内置示例仍以代码为准
  useEffect(() => {
    if (!isCloudMode()) return
    let cancelled = false
    const loadCloudItems = (isInitial: boolean) => {
      getRepositories()
        .radio.getItems()
        .then((remote) => {
          if (cancelled) return
          const remoteIds = new Set(remote.map((item) => item.id))
          setItems([
            ...remote,
            ...DEFAULT_SAMPLE_RADIO_ITEMS.filter((item) => !remoteIds.has(item.id)),
          ])
          setCloudError(null)
        })
        .catch((error) => {
          console.warn('[radio] failed to load cloud items:', error)
          reportCloudError(error, '读取视频')
          if (!cancelled && isInitial) setCloudError('云数据库读取视频失败，暂时只能看到示例视频。')
        })
    }
    loadCloudItems(true)
    const unsubscribe = subscribeCloudRefresh(() => loadCloudItems(false))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // 本地视频：读取上次记住的句柄列表（只是引用，文件仍在磁盘上）
  useEffect(() => {
    let cancelled = false
    listLocalVideos().then((entries) => {
      if (!cancelled) setLocalEntries(entries)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 本机文件夹：读取句柄 -> 已有权限的直接扫描出视频；权限回落到 prompt 的等用户点击再授权
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await listLocalFolders()
      if (cancelled) return
      setFolders(list)
      for (const folder of list) {
        const result = await scanFolderVideos(folder)
        if (cancelled) return
        if (result.granted && result.entries.length > 0) {
          setFolderVideos((prev) => [
            ...prev.filter((v) => v.folderId !== folder.id),
            ...result.entries,
          ])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 卸载时释放所有 blob URL
  useEffect(() => {
    const urls = localUrlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  // HTML5 播放器 Ref 句柄
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 当前正在播放的条目（云/示例列表 + 本机视频）
  const currentItem = useMemo(() => {
    return (
      items.find((i) => i.id === currentId) ||
      localItems.find((i) => i.id === currentId) ||
      items[0] ||
      null
    )
  }, [items, localItems, currentId])

  // 当前处于的模块分类（如果在播放页，则以当前播放视频所属分类或最近浏览的分类为准）
  const activeCategory: 'official' | RadioCategory | 'local' =
    activeTab === 'player'
      ? currentItem?.isLocal
        ? 'local'
        : currentItem?.isOfficial
          ? 'official'
          : currentItem?.category || lastCategoryTab
      : activeTab

  // 「场景对话」模块下的场景标签池（内置默认场景 + 用户自定义新增的场景，不含官方示例）
  const availableScenarios = useMemo(() => {
    const set = new Set<string>(DEFAULT_RADIO_SCENARIOS)
    items.forEach((item) => {
      if (!item.isOfficial && item.category === 'dialogue' && item.scenario && item.scenario !== '官方示例') {
        set.add(item.scenario)
      }
    })
    return Array.from(set)
  }, [items])

  // 官方示例数量与各自定义模块视频数量统计
  const officialCount = useMemo(() => items.filter((item) => Boolean(item.isOfficial)).length, [items])

  const categoryCounts = useMemo(() => {
    const counts: Record<RadioCategory, number> = { phrases: 0, dialogue: 0, radio: 0 }
    items.forEach((item) => {
      if (item.isOfficial) return
      counts[item.category] = (counts[item.category] || 0) + 1
    })
    return counts
  }, [items])

  // 当前自定义模块下 个人 / 共享 数量统计
  const scopeCounts = useMemo(() => {
    let personal = 0
    let shared = 0
    if (activeCategory === 'official' || activeCategory === 'local') {
      return { personal, shared }
    }
    items.forEach((item) => {
      if (item.isOfficial || item.category !== activeCategory) return
      if (activeCategory === 'dialogue' && selectedScenario !== 'all' && item.scenario !== selectedScenario) {
        return
      }
      if (item.accountId) personal += 1
      else shared += 1
    })
    return { personal, shared }
  }, [items, activeCategory, selectedScenario])

  // 本机可播放清单：单独记住的文件在前（新的在上），文件夹里的视频按文件夹添加顺序 + 文件名顺序接在后面
  // 顺序即「下一集」的顺序，顺序播放时自动接着播下一个
  const allLocalEntries = useMemo(
    () => [...localEntries, ...folderVideos],
    [localEntries, folderVideos]
  )

  // 当前分类筛选后的列表
  const filteredItems = useMemo(() => {
    if (activeCategory === 'local') {
      const q = searchQuery.trim().toLowerCase()
      return allLocalEntries
        .filter((entry) => {
          if (!q) return true
          return (
            entry.title.toLowerCase().includes(q) || entry.fileName.toLowerCase().includes(q)
          )
        })
        .map((entry) =>
          localEntryToItem(entry, localItems.find((i) => i.id === entry.id)?.src ?? '')
        )
    }
    if (activeCategory === 'official') {
      const q = searchQuery.trim().toLowerCase()
      return items.filter((item) => {
        if (!item.isOfficial) return false
        if (q && !item.title.toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) {
          return false
        }
        return true
      })
    }
    return items.filter((item) => {
      if (item.isOfficial || item.category !== activeCategory) return false
      if (activeCategory === 'dialogue' && selectedScenario !== 'all' && item.scenario !== selectedScenario) {
        return false
      }
      if (cloudMode) {
        if (scopeFilter === 'personal' && !item.accountId) return false
        if (scopeFilter === 'shared' && item.accountId) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchScenario = activeCategory === 'dialogue' && item.scenario.toLowerCase().includes(q)
        if (!matchTitle && !matchScenario) return false
      }
      return true
    })
  }, [items, allLocalEntries, localItems, activeCategory, selectedScenario, cloudMode, scopeFilter, searchQuery])

  // 切换分类 Tab
  const handleSelectCategoryTab = (cat: RadioCategory) => {
    setActiveTab(cat)
    setLastCategoryTab(cat)
    setListPage(1)
  }

  // 本地视频：向用户申请读权限 -> 拿 File -> 生成 blob URL -> 进播放页
  const playLocalEntry = useCallback(async (entry: LocalVideoEntry) => {
    setLocalError(null)
    setIsLocalBusy(true)
    try {
      const url = await openLocalVideoUrl(entry)
      if (!url) {
        setLocalError(
          `无法读取「${entry.fileName}」：可能未授权，或文件已被移动/删除，请重新选择一次。`
        )
        return
      }
      const previous = localUrlsRef.current.get(entry.id)
      if (previous && previous !== url) URL.revokeObjectURL(previous)
      localUrlsRef.current.set(entry.id, url)
      setLocalItems((prev) =>
        prev.some((i) => i.id === entry.id)
          ? prev.map((i) => (i.id === entry.id ? { ...i, src: url, duration: entry.duration } : i))
          : [...prev, localEntryToItem(entry, url)]
      )
      setCurrentId(entry.id)
      setIsPlaying(true)
      setActiveTab('player')

      // 文件夹里的视频不入库、也没有预先读时长：播起来之后再补，别挡住开口
      if (entry.duration <= 0) {
        void readVideoDuration(url).then((duration) => {
          if (duration <= 0) return
          setFolderVideos((prev) =>
            prev.map((v) => (v.id === entry.id ? { ...v, duration } : v))
          )
          setLocalEntries((prev) =>
            prev.map((v) => (v.id === entry.id ? { ...v, duration } : v))
          )
          setLocalItems((prev) =>
            prev.map((i) => (i.id === entry.id ? { ...i, duration } : i))
          )
        })
      }
    } finally {
      setIsLocalBusy(false)
    }
  }, [])

  // 选一个本机视频并记住句柄（不支持时给出提示，不静默失败）
  const handlePickLocalVideo = useCallback(async () => {
    setLocalError(null)
    if (!isLocalVideoSupported()) {
      setLocalError('当前浏览器不支持记住本地文件，请改用 Chrome 或 Edge 打开本页。')
      return
    }
    try {
      const handle = await pickLocalVideoHandle()
      if (!handle) return
      setIsLocalBusy(true)
      const entry = await createLocalVideoEntry(handle)
      await saveLocalVideo(entry)
      setLocalEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)])
      await playLocalEntry(entry)
    } catch (error) {
      console.warn('[radio] failed to add local video:', error)
      setLocalError('添加本地视频失败，请重试。')
    } finally {
      setIsLocalBusy(false)
    }
  }, [playLocalEntry])

  // 选一个本机文件夹：记住句柄并把里面的视频按文件名顺序列进来（不复制、不上传）
  const handlePickLocalFolder = useCallback(async () => {
    setLocalError(null)
    if (!isLocalFolderSupported()) {
      setLocalError('当前浏览器不支持选择文件夹，请改用 Chrome 或 Edge 打开本页。')
      return
    }
    try {
      const handle = await pickLocalFolderHandle()
      if (!handle) return
      setIsLocalBusy(true)
      const folder = createLocalFolder(handle)
      const result = await scanFolderVideos(folder)
      if (!result.granted) {
        setLocalError(`没有读取「${handle.name}」的权限，请重试并允许访问。`)
        return
      }
      if (result.entries.length === 0) {
        setLocalError(`「${handle.name}」里没找到可播放的视频（支持 mp4 / webm / mov / m4v / mkv）。`)
        return
      }
      await saveLocalFolder(folder)
      setFolders((prev) => [...prev, folder])
      setFolderVideos((prev) => [...prev, ...result.entries])
    } catch (error) {
      console.warn('[radio] failed to add local folder:', error)
      setLocalError('添加本地文件夹失败，请重试。')
    } finally {
      setIsLocalBusy(false)
    }
  }, [])

  // 重新扫描文件夹（刷新后浏览器会要求再确认一次权限，这个点击就是授权入口）
  const handleRefreshFolder = useCallback(async (folder: LocalFolder) => {
    setLocalError(null)
    setIsLocalBusy(true)
    try {
      const result = await scanFolderVideos(folder, { request: true })
      if (!result.granted) {
        setLocalError(`无法读取「${folder.name}」：权限被拒绝，或文件夹已被移动/删除。`)
        return
      }
      setFolderVideos((prev) => [
        ...prev.filter((v) => v.folderId !== folder.id),
        ...result.entries,
      ])
      if (result.entries.length === 0) {
        setLocalError(`「${folder.name}」里现在没有可播放的视频了。`)
      }
    } finally {
      setIsLocalBusy(false)
    }
  }, [])

  // 移除文件夹：只删"记忆"，磁盘上的目录和文件都不动
  const handleRemoveFolder = useCallback(
    (folder: LocalFolder) => {
      const removedIds = new Set(
        folderVideos.filter((v) => v.folderId === folder.id).map((v) => v.id)
      )
      removedIds.forEach((id) => {
        const url = localUrlsRef.current.get(id)
        if (url) {
          URL.revokeObjectURL(url)
          localUrlsRef.current.delete(id)
        }
      })
      setFolders((prev) => prev.filter((f) => f.id !== folder.id))
      setFolderVideos((prev) => prev.filter((v) => v.folderId !== folder.id))
      setLocalItems((prev) => prev.filter((i) => !removedIds.has(i.id)))
      if (removedIds.has(currentId)) {
        setCurrentId('')
        setIsPlaying(false)
      }
      deleteLocalFolder(folder.id).catch((error) => {
        console.warn('[radio] failed to delete local folder:', error)
        setLocalError('移除文件夹记录失败，请重试。')
      })
    },
    [folderVideos, currentId]
  )

  // 统一播放入口：本机视频先解析句柄，其余直接切曲
  const activateItem = useCallback(
    (item: RadioItem) => {
      if (item.isLocal) {
        const entry = allLocalEntries.find((e) => e.id === item.id)
        if (entry) void playLocalEntry(entry)
        return
      }
      setCurrentId(item.id)
      setIsPlaying(true)
      setActiveTab('player')
    },
    [allLocalEntries, playLocalEntry]
  )

  // 同步媒体源切换
  useEffect(() => {
    if (!currentItem) return

    const isVid = currentItem.type === 'video'
    const media = isVid ? videoRef.current : audioRef.current

    if (isVid && audioRef.current) {
      audioRef.current.pause()
    }
    if (!isVid && videoRef.current) {
      videoRef.current.pause()
    }

    if (media) {
      if (media.src !== currentItem.src) {
        media.src = currentItem.src
        media.load()
      }
      media.playbackRate = playbackRate
      media.volume = volume

      setCurrentTime(0)

      if (isPlaying) {
        media.play().catch((err) => {
          console.debug('Auto play interrupted:', err)
          setIsPlaying(false)
        })
      }
    }
  }, [currentItem?.id, currentItem?.src, currentItem?.type])

  // 播放 / 暂停切换
  const handleTogglePlay = useCallback(() => {
    if (!currentItem) return
    const media = currentItem.type === 'video' ? videoRef.current : audioRef.current
    if (!media) return

    if (isPlaying) {
      media.pause()
      setIsPlaying(false)
    } else {
      media.playbackRate = playbackRate
      media.volume = volume
      media
        .play()
        .then(() => {
          setIsPlaying(true)
          if (currentItem.isOfficial || currentItem.isLocal) return
          setItems((prev) =>
            prev.map((it) => (it.id === currentItem.id ? { ...it, playCount: it.playCount + 1 } : it))
          )
        })
        .catch((err) => {
          console.debug('Playback trigger prevented:', err)
          setIsPlaying(false)
        })
    }
  }, [currentItem, isPlaying, playbackRate, volume])

  // 拖拽进度寻道 (Seek)
  const handleSeek = (time: number) => {
    if (!currentItem) return
    const media = currentItem.type === 'video' ? videoRef.current : audioRef.current
    if (!media) return

    media.currentTime = time
    setCurrentTime(time)
  }

  // 倍速控制
  const handleChangePlaybackRate = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
    if (audioRef.current) audioRef.current.playbackRate = rate
  }

  // 音量控制
  const handleChangeVolume = (vol: number) => {
    setVolume(vol)
    if (videoRef.current) videoRef.current.volume = vol
    if (audioRef.current) audioRef.current.volume = vol
  }

  // 切换上一首
  const handlePrev = useCallback(() => {
    if (filteredItems.length === 0) return
    const currentIndex = filteredItems.findIndex((i) => i.id === currentId)
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1
    const target = filteredItems[prevIndex]
    if (target) {
      activateItem(target)
    }
  }, [filteredItems, currentId, activateItem])

  // 切换下一首
  const handleNext = useCallback(() => {
    if (filteredItems.length === 0) return
    const currentIndex = filteredItems.findIndex((i) => i.id === currentId)
    const nextIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0
    const target = filteredItems[nextIndex]
    if (target) {
      activateItem(target)
    }
  }, [filteredItems, currentId, activateItem])

  // 自然播毕后的自动切歌策略 (单曲循环 / 列表循环 / 随机播放 / 顺序播放)
  const handleAutoPlayNext = useCallback(() => {
    const media = currentItem?.type === 'video' ? videoRef.current : audioRef.current

    if (playMode === 'single-loop') {
      if (media) {
        media.currentTime = 0
        media.play().catch(() => {})
      }
      return
    }

    if (playMode === 'shuffle') {
      if (filteredItems.length <= 1) {
        if (media) {
          media.currentTime = 0
          media.play().catch(() => {})
        }
        return
      }
      const otherItems = filteredItems.filter((i) => i.id !== currentId)
      const randomTarget = otherItems[Math.floor(Math.random() * otherItems.length)]
      if (randomTarget) {
        activateItem(randomTarget)
      }
      return
    }

    const currentIndex = filteredItems.findIndex((i) => i.id === currentId)
    if (currentIndex < filteredItems.length - 1) {
      activateItem(filteredItems[currentIndex + 1])
    } else if (playMode === 'list-loop' && filteredItems.length > 0) {
      if (filteredItems.length === 1) {
        if (media) {
          media.currentTime = 0
          media.play().catch(() => {})
        }
      } else {
        activateItem(filteredItems[0])
      }
    } else {
      setIsPlaying(false)
    }
  }, [currentItem, playMode, filteredItems, currentId, activateItem])

  // 监听当前活跃媒体元素的时间更新与结束事件
  useEffect(() => {
    if (!currentItem) return

    const media = currentItem.type === 'video' ? videoRef.current : audioRef.current
    if (!media) return

    const handleTimeUpdate = () => {
      setCurrentTime(media.currentTime)
    }

    const handleLoadedMetadata = () => {
      if (media.duration && !isNaN(media.duration)) {
        const realDuration = media.duration
        setDuration(realDuration)
        const rounded = Math.round(realDuration)
        setItems((prev) => prev.map((it) => (it.id === currentItem.id ? { ...it, duration: rounded } : it)))
        setLocalItems((prev) =>
          prev.map((it) => (it.id === currentItem.id ? { ...it, duration: rounded } : it))
        )
      } else if (currentItem.duration) {
        setDuration(currentItem.duration)
      }
    }

    const handleEnded = () => {
      handleAutoPlayNext()
    }

    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('loadedmetadata', handleLoadedMetadata)
    media.addEventListener('ended', handleEnded)

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('loadedmetadata', handleLoadedMetadata)
      media.removeEventListener('ended', handleEnded)
    }
  }, [currentItem, handleAutoPlayNext])

  // 键盘快捷键监听：空格暂停/播放，方向键快退/快进 5s，中括号切曲
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        handleTogglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleSeek(Math.max(0, currentTime - 5))
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleSeek(Math.min(duration, currentTime + 5))
      } else if (e.key === '[') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === ']') {
        e.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTogglePlay, currentTime, duration, handlePrev, handleNext])

  // 添加用户自定义视频
  const handleAddItem = async (newItem: RadioItem) => {
    if (isCloudMode() && newItem.accountId !== undefined) {
      try {
        await getRepositories().radio.putItem(newItem)
      } catch (error) {
        console.warn('[radio] failed to save item:', error)
        reportCloudError(error, '保存视频')
        setCloudError(`视频保存到云端失败：${error instanceof Error ? error.message : '请稍后重试'}`)
        return false
      }
    }
    setItems((prev) => [newItem, ...prev])
    setLastCategoryTab(newItem.category)
    setCurrentId(newItem.id)
    setIsPlaying(true)
    setActiveTab('player')
    return true
  }

  const [itemToDelete, setItemToDelete] = useState<{ id: string; title: string; isLocal: boolean } | null>(null)
  const [isDeletingItem, setIsDeletingItem] = useState(false)

  // 点击删除视频：先校验并弹出二次确认
  const handleDeleteItem = (id: string) => {
    const removed = items.find((i) => i.id === id) ?? localItems.find((i) => i.id === id)
    if (removed?.isOfficial) return

    const isLocal = Boolean(removed?.isLocal || allLocalEntries.some((entry) => entry.id === id))
    if (isLocal) {
      const inFolder = folderVideos.some((entry) => entry.id === id)
      if (inFolder) {
        // 文件夹里的条目是扫描出来的，删单条没意义（下次扫描又回来），引导移除整个文件夹
        setLocalError('文件夹里的视频不需要单独移除，点文件夹标签右侧的「×」可移除整个文件夹。')
        return
      }
      const entry = allLocalEntries.find((e) => e.id === id)
      setItemToDelete({ id, title: removed?.title || entry?.title || '该本地视频', isLocal: true })
      return
    }

    if (!removed) return
    setItemToDelete({ id, title: removed.title, isLocal: false })
  }

  // 确认永久删除视频：云模式先真实删库，成功后再更新列表
  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return
    const { id, isLocal } = itemToDelete
    setIsDeletingItem(true)
    try {
      if (isLocal) {
        await deleteLocalVideo(id)
        const url = localUrlsRef.current.get(id)
        if (url) {
          URL.revokeObjectURL(url)
          localUrlsRef.current.delete(id)
        }
        setLocalItems((prev) => prev.filter((i) => i.id !== id))
        setLocalEntries((prev) => prev.filter((entry) => entry.id !== id))
        if (currentId === id) {
          setCurrentId('')
          setIsPlaying(false)
        }
        setItemToDelete(null)
        return
      }

      const removed = items.find((i) => i.id === id)
      if (isCloudMode() && removed && removed.accountId !== undefined) {
        await getRepositories().radio.deleteItem(id)
      }
      const remaining = items.filter((i) => i.id !== id)
      setItems(remaining)
      if (currentId === id) {
        if (remaining.length > 0) {
          setCurrentId(remaining[0].id)
        } else {
          setCurrentId('')
          setIsPlaying(false)
        }
      }
      setItemToDelete(null)
    } catch (error) {
      console.warn('[radio] failed to delete item:', error)
      if (isLocal) {
        setLocalError('删除本地视频记录失败，请重试。')
      } else {
        reportCloudError(error, '删除视频')
        setCloudError(`云端视频删除失败：${error instanceof Error ? error.message : '请稍后重试'}`)
      }
    } finally {
      setIsDeletingItem(false)
    }
  }

  return (
    <div className="radio-page flex-1 min-h-full w-full flex flex-col bg-background text-foreground animate-fadeIn pb-12">
      {/* 主工作舞台容器 */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-5 sm:px-8 lg:px-10 pt-6 space-y-5">
        {/* 顶部标题、搜索与添加入口 */}
        <RadioHeader
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q)
            setListPage(1)
          }}
          totalCount={activeTab === 'local' ? allLocalEntries.length : items.length}
          actionLabel={
            activeTab === 'local'
              ? isLocalBusy
                ? '正在读取…'
                : '选择本地视频'
              : '添加视频'
          }
          secondaryActionLabel={
            activeTab === 'local' && folderSupported
              ? isLocalBusy
                ? '扫描中…'
                : '选择文件夹'
              : undefined
          }
          onSecondaryAction={
            activeTab === 'local' && folderSupported
              ? () => {
                  if (!isLocalBusy) void handlePickLocalFolder()
                }
              : undefined
          }
          secondaryActionDisabled={isLocalBusy}
          onOpenUpload={() => {
            if (activeTab === 'local') {
              if (!isLocalBusy) void handlePickLocalVideo()
            } else {
              setIsUploadOpen(true)
            }
          }}
        />

        {cloudError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            {cloudError}
          </div>
        )}

        {localError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-start justify-between gap-3">
            <span>{localError}</span>
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="shrink-0 text-amber-300/70 hover:text-amber-200 cursor-pointer"
            >
              关闭
            </button>
          </div>
        )}

        {/* Tab 导航：官方示例 / 常用短语 / 场景对话 / 英语电台 / 本地视频 / 播放页 */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 select-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('official')
                setListPage(1)
              }}
              className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'official'
                  ? 'text-foreground font-medium border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              官方示例
              <span className="ml-1.5 text-xs font-mono text-muted-foreground">{officialCount}</span>
            </button>

            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectCategoryTab(cat)}
                className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === cat
                    ? 'text-foreground font-medium border-primary'
                    : 'text-muted-foreground hover:text-foreground border-transparent'
                }`}
              >
                {RADIO_CATEGORY_LABELS[cat]}
                <span className="ml-1.5 text-xs font-mono text-muted-foreground">{categoryCounts[cat]}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setActiveTab('local')
                setListPage(1)
              }}
              className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'local'
                  ? 'text-foreground font-medium border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              本地视频
              <span className="ml-1.5 text-xs font-mono text-muted-foreground">{allLocalEntries.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('player')}
              className={`-mb-px pb-2.5 text-sm border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'player'
                  ? 'text-foreground font-medium border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              播放页
              {isPlaying && <span className="size-1.5 rounded-full bg-primary animate-pulse" title="正在播放" />}
            </button>
          </div>

          {activeTab === 'player' ? (
            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  currentItem?.isLocal
                    ? 'local'
                    : currentItem?.isOfficial
                      ? 'official'
                      : currentItem?.category || lastCategoryTab
                )
              }
              className="mb-1.5 self-start sm:self-auto h-7 px-2 rounded-md inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              返回列表
            </button>
          ) : (
            currentItem && (
              <button
                type="button"
                onClick={() => setActiveTab('player')}
                className="mb-1.5 hidden sm:inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="前往播放页"
              >
                当前：
                <span className="text-foreground truncate max-w-[200px] md:max-w-[280px]">{currentItem.title}</span>
                <span className="text-primary">→</span>
              </button>
            )
          )}
        </div>

        {/* 列表 Tab 内容区：常用短语 / 场景对话 / 英语电台 / 本地视频 */}
        <div className={activeTab !== 'player' ? 'space-y-6 animate-fadeIn' : 'hidden'}>
          {/* 本地视频说明：文件只在这台设备播放，句柄存在浏览器里 */}
          {activeTab === 'local' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                {localSupported ? (
                  <>
                    本地视频只保存在这台设备：浏览器会记住你选过的文件，下次打开点一下即可继续播放，视频文件本身不会上传，也不参与云同步。
                    首次进入或刷新后，浏览器会再确认一次读取权限。
                    {folderSupported && (
                      <>
                        {' '}
                        也可以「选择文件夹」，里面的视频会按文件名顺序排好，播完一个自动接下一个。
                      </>
                    )}
                  </>
                ) : (
                  <>
                    当前浏览器不支持「记住本地文件」（该能力目前只有 Chrome / Edge 桌面版提供）。
                    你仍可以用右上角「添加视频」填写视频链接播放，或换用 Chrome / Edge 打开本页。
                  </>
                )}
              </div>

              {/* 已加入的文件夹：点击名称 = 重新授权并扫描；× = 移除这个文件夹（不动磁盘文件） */}
              {folders.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">文件夹</span>
                  {folders.map((folder) => {
                    const count = folderVideos.filter((v) => v.folderId === folder.id).length
                    return (
                      <span
                        key={folder.id}
                        className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border border-border bg-card/60"
                      >
                        <button
                          type="button"
                          onClick={() => void handleRefreshFolder(folder)}
                          disabled={isLocalBusy}
                          title="重新扫描（刷新后需要在这里重新授权）"
                          className="inline-flex items-center gap-1 text-foreground/90 hover:text-foreground cursor-pointer disabled:opacity-50"
                        >
                          <FolderOpen className="size-3.5 text-muted-foreground" />
                          <span className="max-w-[180px] truncate">{folder.name}</span>
                          <span className="font-mono text-muted-foreground/70">
                            {count > 0 ? count : '未授权'}
                          </span>
                          <RefreshCw className="size-3 text-muted-foreground/60" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFolder(folder)}
                          title="移除文件夹（不会删除磁盘上的文件）"
                          className="size-5 grid place-items-center rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {/* 仅「场景对话」显示场景分类筛选（不含官方示例） */}
          {activeTab === 'dialogue' && (
            <RadioFilters
              selectedScenario={selectedScenario}
              onSelectScenario={(sc) => {
                setSelectedScenario(sc)
                setListPage(1)
              }}
              availableScenarios={availableScenarios}
            />
          )}

          {/* 自定义分类下的二级归属筛选：全部 / 个人 / 共享（云模式显示） */}
          {cloudMode && (activeTab === 'phrases' || activeTab === 'dialogue' || activeTab === 'radio') && (
            <div className="shrink-0 flex items-center gap-1 select-none -ml-2.5">
              {(
                [
                  { id: 'all', label: '全部', count: null },
                  { id: 'personal', label: '个人', count: scopeCounts.personal },
                  { id: 'shared', label: '共享', count: scopeCounts.shared },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setScopeFilter(tab.id)
                    setListPage(1)
                  }}
                  className={`shrink-0 h-7 px-2.5 rounded-md text-[13px] transition-colors cursor-pointer ${
                    scopeFilter === tab.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className="ml-1 text-[12px] font-mono opacity-60">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 视频列表：仅「场景对话」显示场景副标题，日常短语和英语电台只显示名称 */}
          <RadioCardList
            items={filteredItems}
            currentId={currentId}
            isPlaying={isPlaying}
            cloudMode={cloudMode}
            showMetadata={activeTab === 'dialogue'}
            page={listPage}
            onPageChange={setListPage}
            emptyTitle={
              activeTab === 'local'
                ? '还没有添加本地视频'
                : activeTab === 'official'
                  ? '官方示例敬请期待'
                  : '暂无自定义视频'
            }
            emptyHint={
              activeTab === 'local'
                ? folderSupported
                  ? '点右上角「选择本地视频」挑单个文件，或「选择文件夹」把一整季按顺序排进来'
                  : '点击右上角「选择本地视频」，选一次就会被记住（文件仍留在原位置）'
                : activeTab === 'official'
                  ? '官方示例视频正在准备中，后续将陆续上线'
                  : '点击右上角「添加视频」添加自定义视频'
            }
            onSelectItem={(item) => {
              if (!item.isLocal) setLastCategoryTab(item.category)
              activateItem(item)
            }}
            onTogglePlay={() => {
              if (!isPlaying) setActiveTab('player')
              handleTogglePlay()
            }}
            onDeleteItem={handleDeleteItem}
          />
        </div>

        {/* 共用播放页 (日常短语 / 场景对话 / 英语电台 共用) */}
        <div className={activeTab === 'player' ? 'space-y-6 animate-fadeIn' : 'hidden'}>
          <RadioMainPlayer
            item={currentItem}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrev}
            onNext={handleNext}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            playbackRate={playbackRate}
            onChangePlaybackRate={handleChangePlaybackRate}
            playMode={playMode}
            onChangePlayMode={setPlayMode}
            volume={volume}
            onChangeVolume={handleChangeVolume}
            videoRef={videoRef}
            audioRef={audioRef}
          />
        </div>
      </div>

      {/* 添加自定义视频弹窗（本机视频走系统文件选择器，不使用该弹窗） */}
      <RadioUploadModal
        isOpen={isUploadOpen}
        defaultCategory={activeCategory === 'local' || activeCategory === 'official' ? lastCategoryTab : activeCategory}
        onClose={() => setIsUploadOpen(false)}
        onAddItem={handleAddItem}
      />

      {/* 删除视频二次确认弹窗 */}
      <ConfirmDeleteModal
        isOpen={Boolean(itemToDelete)}
        title={itemToDelete?.isLocal ? '移除本地视频记录' : '永久删除影音条目'}
        targetName={itemToDelete?.title ?? ''}
        details={
          itemToDelete?.isLocal
            ? ['将从浏览器记录中真实清除，不会删除电脑磁盘上的原视频文件']
            : [isCloudMode() ? '该条目将从云端数据库真实删除' : '该条目将从当前列表移除']
        }
        isDeleting={isDeletingItem}
        onCancel={() => setItemToDelete(null)}
        onConfirm={() => void handleConfirmDeleteItem()}
      />

      {/* 原生隐藏式音频播放节点 */}
      <audio ref={audioRef} preload="auto" className="hidden" />
    </div>
  )
}
