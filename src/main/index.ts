import 'dotenv/config'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { appendFileSync } from 'node:fs'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  TITLE_BAR_HEIGHT,
  WINDOW_BACKGROUND,
  WINDOW_SIZE,
  WINDOW_SYMBOL,
  type AppState,
  type GarmentInput,
  type ModelPhotoInput,
  type Settings
} from '@shared/types'
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from './credentials'
import { defaultCaptureDir, getSettings, resetSettings, updateSettings } from './settings'
import { addGarment, clearLibrary, listGarments, readGarmentImage, removeGarment } from './library'
import {
  addModelPhoto,
  clearModelPhotos,
  listModelPhotos,
  readModelPhotoImage,
  removeModelPhoto
} from './models'
import { saveCapture } from './capture'
import type { IpcContract } from '@shared/ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: WINDOW_BACKGROUND,
      symbolColor: WINDOW_SYMBOL,
      height: TITLE_BAR_HEIGHT
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // The window is created hidden so the first paint isn't a white flash.
  // `ready-to-show` is the intended cue, but it does not fire on every
  // Windows/GPU combination -- and a mirror that never appears is worse than
  // a brief flash, so first paint, load, and a timeout all reveal it.
  const reveal = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.show()
    mainWindow.focus()
  }

  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  const revealTimer = setTimeout(reveal, 3000)
  mainWindow.on('closed', () => {
    clearTimeout(revealTimer)
    mainWindow = null
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, description, url) => {
    console.error('renderer failed to load: ' + description + ' (' + code + ') ' + url)
    reveal()
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer process gone: ' + details.reason)
  })

  // Renderer warnings and errors are mirrored to userData/renderer.log. A
  // packaged app has no console to watch, and "it just failed" is not a bug
  // report anyone can act on.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level < 2 && !message.startsWith('[Fleek playback] ')) return
    const source = sourceId ? ' (' + sourceId.split('/').pop() + ':' + line + ')' : ''
    try {
      appendFileSync(
        join(app.getPath('userData'), 'renderer.log'),
        new Date().toISOString() + '\t' + redactSecrets(message) + source + '\n',
        'utf8'
      )
    } catch {
      // Logging must never be the thing that breaks the app.
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The camera is ours to grant; nothing else is. Windows still gates the
  // device itself at the OS level, which is handled in the renderer.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Diagnostics must never become a credential leak. Realtime signalling puts
 * short-lived tokens in URLs, so anything token-shaped is masked before it
 * reaches disk -- a log the user might paste into an issue is a log that has
 * to be safe to paste. `dct_` is Decart's own permanent key prefix.
 */
function redactSecrets(text: string): string {
  return text
    .replace(/\bdct_[A-Za-z0-9._-]{8,}/g, '[redacted-key]')
    .replace(/((?:fal_jwt_)?token=)[^&'"\s]+/gi, '$1[redacted]')
    .replace(/(token|key|authorization|credentials)("?\s*[:=]\s*"?)[A-Za-z0-9._~+/-]{16,}/gi, '$1$2[redacted]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}/g, '[redacted-jwt]')
}

/** Entering and leaving `live` is the money event. It gets written down. */
function logSession(event: { kind: string; seconds?: number; cost?: number }): void {
  const line =
    `${new Date().toISOString()}\t${event.kind}` +
    `\t${event.seconds ?? ''}\t${event.cost !== undefined ? event.cost.toFixed(2) : ''}\n`
  try {
    appendFileSync(join(app.getPath('userData'), 'sessions.log'), line, 'utf8')
  } catch {
    // Losing a log line must never take the app down mid-session.
  }
}

function buildState(): AppState {
  return {
    settings: getSettings(),
    hasApiKey: hasApiKey(),
    defaultCaptureDir: defaultCaptureDir(),
    appVersion: app.getVersion()
  }
}

/** Typed against IpcContract, so a missing or misnamed channel won't compile. */
const handlers: {
  [K in keyof IpcContract]: (
    ...args: Parameters<IpcContract[K]>
  ) => ReturnType<IpcContract[K]> | Awaited<ReturnType<IpcContract[K]>>
} = {
  'app:getState': () => buildState(),

  'app:reset': () => {
    clearApiKey()
    clearLibrary()
    clearModelPhotos()
    resetSettings()
  },

  'app:acceptConsent': (): Settings => updateSettings({ consentAcceptedAt: new Date().toISOString() }),

  'settings:update': (patch: Partial<Settings>): Settings => updateSettings(patch),

  'credentials:set': (key: string) => setApiKey(key),
  'credentials:clear': () => clearApiKey(),
  'credentials:get': () => getApiKey(),

  'library:list': () => listGarments(),
  'library:add': (input: GarmentInput) => addGarment(input),
  'library:remove': (id: string) => removeGarment(id),

  'image:read': (kind: 'garment' | 'photo', id: string) =>
    kind === 'garment' ? readGarmentImage(id) : readModelPhotoImage(id),

  'models:list': () => listModelPhotos(),
  'models:add': (input: ModelPhotoInput) => addModelPhoto(input),
  'models:remove': (id: string) => removeModelPhoto(id),

  'capture:save': (pngBase64: string) => saveCapture(pngBase64),
  'capture:reveal': (filePath: string) => {
    shell.showItemInFolder(filePath)
  },

  'shell:openCameraPrivacySettings': async () => {
    await shell.openExternal('ms-settings:privacy-webcam')
  },
  'shell:openExternal': async (url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  },

  'dialog:pickCaptureDir': async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getSettings().captureDir
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  },

  'session:log': (event) => logSession(event)
}

function registerIpc(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (handler as (...a: unknown[]) => unknown)(...args)
    )
  }
}

// One mirror at a time. A second launch just raises the first window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.fleek.app')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
