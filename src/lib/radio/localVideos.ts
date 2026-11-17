/**
 * 本地视频：浏览器里"记住"用户选过的本机视频文件 / 文件夹。
 *
 * 浏览器沙箱不允许网页按路径读取本地文件，所以这里走 File System Access API：
 * 选择文件（或文件夹）后拿到 FileSystemHandle（只是"引用"，不含文件内容），把它存进
 * IndexedDB；下次要用时取回句柄，向用户申请一次读权限，再 getFile() 拿到文件。
 *
 * 文件夹比单个文件多一步：句柄拿到后要遍历目录，列出里面的视频文件（句柄可以
 * 逐层 getFileHandle / getDirectoryHandle 复用，不需要为每个文件单独存一条记录）。
 *
 * 限制：
 * - 仅 Chromium 系（Chrome / Edge / Opera 等）支持 showOpenFilePicker /
 *   showDirectoryPicker，Safari / Firefox 没有该能力，调用方需要自行降级或提示。
 * - 页面刷新后句柄的权限会回到 prompt，requestReadPermission() 必须在用户点击等
 *   手势里调用，浏览器才会弹授权。
 */

const DB_NAME = 'lingualoop-local-videos'
const DB_VERSION = 2
const VIDEO_STORE = 'videos'
const FOLDER_STORE = 'folders'

/** 浏览器一般能播的视频扩展名；mkv 是否可播取决于编码，仍然列出来 */
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv'])
/** 文件夹最多往下钻 3 层，避免误选到根目录时扫全盘 */
const MAX_FOLDER_DEPTH = 3

declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  interface Window {
    showOpenFilePicker?: (options?: {
      multiple?: boolean
      excludeAcceptAllOption?: boolean
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<FileSystemFileHandle[]>
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: 'read' | 'readwrite'
    }) => Promise<FileSystemDirectoryHandle>
  }
}

export interface LocalVideoEntry {
  id: string
  title: string
  fileName: string
  /** 字节数，用于列表展示 */
  size: number
  /** 秒数；没读过元数据时为 0（列表显示 --:--） */
  duration: number
  addedAt: number
  /** 指向本机文件的句柄，仅 Chromium 可序列化进 IndexedDB */
  handle: FileSystemFileHandle
  /** 来自文件夹扫描时：所属文件夹 id */
  folderId?: string
  /** 来自文件夹扫描时：所属文件夹名（列表副标题用） */
  folderName?: string
  /** 来自文件夹扫描时：相对文件夹的路径，用于稳定排序与生成 id */
  relativePath?: string
  /**
   * 来自文件夹扫描时：父目录句柄。子文件句柄的读权限跟随父目录，
   * 自动连播（没有用户手势）时先确认父目录权限更稳。
   */
  folderHandle?: FileSystemDirectoryHandle
}

/** 用户授权过的文件夹（句柄可跨会话保存，权限需要重新确认） */
export interface LocalFolder {
  id: string
  name: string
  addedAt: number
  handle: FileSystemDirectoryHandle
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前环境不支持 IndexedDB'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          db.createObjectStore(VIDEO_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(FOLDER_STORE)) {
          db.createObjectStore(FOLDER_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('打开本地视频库失败'))
    })
  }
  return dbPromise
}

async function runStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = run(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地视频库操作失败'))
  })
}

/** 当前浏览器是否支持「选一次、记住」单个文件 */
export function isLocalVideoSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

/** 当前浏览器是否支持选择文件夹 */
export function isLocalFolderSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

// ---------------------------------------------------------------- 单个文件

export async function listLocalVideos(): Promise<LocalVideoEntry[]> {
  try {
    const all = await runStore<LocalVideoEntry[]>(VIDEO_STORE, 'readonly', (store) => store.getAll())
    return [...all].sort((a, b) => b.addedAt - a.addedAt)
  } catch (error) {
    console.warn('[radio] failed to list local videos:', error)
    return []
  }
}

export async function saveLocalVideo(entry: LocalVideoEntry): Promise<void> {
  await runStore(VIDEO_STORE, 'readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>)
}

export async function deleteLocalVideo(id: string): Promise<void> {
  await runStore(VIDEO_STORE, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

/** 弹出系统文件选择器；用户取消返回 null */
export async function pickLocalVideoHandle(): Promise<FileSystemFileHandle | null> {
  if (!window.showOpenFilePicker) return null
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: '视频文件',
          accept: { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.ogv'] },
        },
      ],
    })
    return handle ?? null
  } catch (error) {
    // 用户点了取消，不算错误
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 0)
    }
    video.onerror = () => resolve(0)
    video.src = url
  })
}

/** 读 blob URL 的时长；文件夹里的视频是懒加载的，播放时才补上时长 */
export function readVideoDuration(url: string): Promise<number> {
  return readDuration(url)
}

/** 用句柄生成一条本地视频记录（带标题、体积、时长），不保存文件内容 */
export async function createLocalVideoEntry(handle: FileSystemFileHandle): Promise<LocalVideoEntry> {
  const file = await handle.getFile()
  const url = URL.createObjectURL(file)
  let duration = 0
  try {
    duration = await readDuration(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  return {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    size: file.size,
    duration,
    addedAt: Date.now(),
    handle,
  }
}

// ---------------------------------------------------------------- 文件夹

export async function listLocalFolders(): Promise<LocalFolder[]> {
  try {
    const all = await runStore<LocalFolder[]>(FOLDER_STORE, 'readonly', (store) => store.getAll())
    return [...all].sort((a, b) => a.addedAt - b.addedAt)
  } catch (error) {
    console.warn('[radio] failed to list local folders:', error)
    return []
  }
}

export async function saveLocalFolder(folder: LocalFolder): Promise<void> {
  await runStore(FOLDER_STORE, 'readwrite', (store) => store.put(folder) as IDBRequest<IDBValidKey>)
}

export async function deleteLocalFolder(id: string): Promise<void> {
  await runStore(FOLDER_STORE, 'readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

/** 弹出系统文件夹选择器；用户取消返回 null */
export async function pickLocalFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null
  try {
    return await window.showDirectoryPicker({ id: 'lingualoop-videos', mode: 'read' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

export function createLocalFolder(handle: FileSystemDirectoryHandle): LocalFolder {
  return {
    id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: handle.name,
    addedAt: Date.now(),
    handle,
  }
}

/** 只查询、不弹窗（用于页面加载时判断文件夹是否还需要用户授权） */
export async function queryReadPermission(handle: FileSystemHandle): Promise<PermissionState> {
  if (typeof handle.queryPermission !== 'function') return 'granted'
  try {
    return await handle.queryPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

/**
 * 确保有读权限；需要弹窗时必须由用户手势触发（点击）。
 * 返回 false 表示用户拒绝或浏览器不允许。
 */
export async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  const state = await queryReadPermission(handle)
  if (state === 'granted') return true
  if (typeof handle.requestPermission !== 'function') return false
  try {
    return (await handle.requestPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

function isVideoFileName(name: string): boolean {
  const match = /\.([^.]+)$/.exec(name)
  return Boolean(match && VIDEO_EXTENSIONS.has(match[1].toLowerCase()))
}

interface CollectedFile {
  relativePath: string
  handle: FileSystemFileHandle
}

async function collectVideoFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: CollectedFile[],
  depth: number
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      if (isVideoFileName(name)) {
        out.push({ relativePath: path, handle: handle as FileSystemFileHandle })
      }
      continue
    }
    if (depth < MAX_FOLDER_DEPTH) {
      await collectVideoFiles(handle as FileSystemDirectoryHandle, path, out, depth + 1)
    }
  }
}

export interface FolderScanResult {
  entries: LocalVideoEntry[]
  /** false 表示没有读权限（或目录已不可用），entries 一定为空 */
  granted: boolean
}

/**
 * 列出文件夹里的视频（按相对路径自然排序，ep2 排在 ep10 前面）。
 * request=false 时只查询权限，不会弹窗，适合页面加载；用户点击时传 request=true。
 */
export async function scanFolderVideos(
  folder: LocalFolder,
  options: { request?: boolean } = {}
): Promise<FolderScanResult> {
  const granted = options.request
    ? await ensureReadPermission(folder.handle)
    : (await queryReadPermission(folder.handle)) === 'granted'
  if (!granted) return { entries: [], granted: false }

  try {
    const collected: CollectedFile[] = []
    await collectVideoFiles(folder.handle, '', collected, 0)
    collected.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' })
    )

    return {
      granted: true,
      entries: collected.map((file) => ({
        id: `dirvideo_${folder.id}_${file.relativePath}`,
        title: file.relativePath.replace(/\.[^.]+$/, ''),
        fileName: file.relativePath.slice(file.relativePath.lastIndexOf('/') + 1),
        size: 0,
        // 时长等真正播放时再读，避免选中一个几百集的目录时卡住
        duration: 0,
        addedAt: folder.addedAt,
        handle: file.handle,
        folderId: folder.id,
        folderName: folder.name,
        relativePath: file.relativePath,
        folderHandle: folder.handle,
      })),
    }
  } catch (error) {
    console.warn('[radio] failed to scan folder:', error)
    return { entries: [], granted: false }
  }
}

// ---------------------------------------------------------------- 播放

/**
 * 取回可用播放的 blob URL。必须在用户手势（点击）里调用，
 * 否则浏览器的授权弹窗会被拒绝。
 */
export async function openLocalVideoUrl(entry: LocalVideoEntry): Promise<string | null> {
  try {
    // 文件夹里的视频：先确认父目录权限，子文件句柄的读权限跟随父目录
    if (entry.folderHandle && !(await ensureReadPermission(entry.folderHandle))) return null

    const queried =
      typeof entry.handle.queryPermission === 'function'
        ? await entry.handle.queryPermission({ mode: 'read' })
        : 'granted'
    if (queried !== 'granted') {
      try {
        const permission = await entry.handle.requestPermission({ mode: 'read' })
        if (permission !== 'granted') return null
      } catch {
        // 自动连播时没有用户手势，requestPermission 会直接抛错；
        // 父目录已授权的情况下 getFile 仍然可用，继续往下试
      }
    }
    const file = await entry.handle.getFile()
    return URL.createObjectURL(file)
  } catch (error) {
    console.warn('[radio] failed to open local video:', error)
    return null
  }
}
