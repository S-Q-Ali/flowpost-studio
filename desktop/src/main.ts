/**
 * Desktop App Main Entry Point
 * This file would be the main process entry point for a native desktop wrapper
 * For Pake wrapper, this provides native capabilities through the injected bridge
 */

import { app, BrowserWindow, Tray, Menu, NativeImage, ipcMain } from 'electron';
import * as path from 'path';

// Native folder watcher (would be compiled from desktop/native/folder-watcher.ts)
import { NativeFolderWatcher } from './native/folder-watcher';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let folderWatchers: Map<string, NativeFolderWatcher> = new Map();

// Configuration from pake.config.json
const APP_CONFIG = {
  name: 'FlowPost',
  identifier: 'com.flowpost.desktop',
  width: 1440,
  height: 900,
  minWidth: 1024,
  minHeight: 700,
  showSystemTray: true,
  hideOnClose: true,
  startToTray: false,
  newWindow: true,
  multiWindow: true,
  enableDragDrop: true,
  enableFind: true,
  passwordAutosave: true,
  downloadDir: '%USERPROFILE%\\FlowPost Downloads',
  darkMode: false,
  alwaysOnTop: false,
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: APP_CONFIG.width,
    height: APP_CONFIG.height,
    minWidth: APP_CONFIG.minWidth,
    minHeight: APP_CONFIG.minHeight,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  // Load the built web app
  mainWindow.loadURL(
    process.env.VITE_APP_URL || `file://${path.join(__dirname, '../dist/index.html')}`
  );

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSystemTray(): Tray | null {
  if (!APP_CONFIG.showSystemTray) return null;

  // Create tray icon
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const trayIcon = new NativeImage();
  trayIcon.loadFile(iconPath);

  const tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show FlowPost',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Start Workflow',
      click: () => {
        mainWindow?.webContents.send('flowpost:tray-action', 'start-workflow');
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.webContents.send('flowpost:tray-action', 'settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  return tray;
}

function setupIpcHandlers(): void {
  // Handle folder watcher events
  ipcMain.on('folder-watcher:add', (event, folderPath: string) => {
    console.log(`Adding folder watcher: ${folderPath}`);
    
    if (folderWatchers.has(folderPath)) return;

    const watcher = new NativeFolderWatcher({
      folderPath,
      extensions: ['.mp4', '.mov', '.avi', '.jpg', '.png', '.gif'],
      recursive: false,
      debounceMs: 2000,
    });

    watcher.on('file-event', (event) => {
      mainWindow?.webContents.send('flowpost:file-event', event);
    });

    watcher.start();
    folderWatchers.set(folderPath, watcher);
    
    event.reply('folder-watcher:added', { folderPath, success: true });
  });

  ipcMain.on('folder-watcher:remove', (event, folderPath: string) => {
    console.log(`Removing folder watcher: ${folderPath}`);
    
    const watcher = folderWatchers.get(folderPath);
    if (watcher) {
      watcher.stop();
      watcher.removeAllListeners();
      folderWatchers.delete(folderPath);
    }
    
    event.reply('folder-watcher:removed', { folderPath, success: true });
  });

  ipcMain.on('app:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('app:quit', () => {
    app.quit();
  });

  ipcMain.on('app:show', () => {
    mainWindow?.show();
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  
  if (APP_CONFIG.showSystemTray) {
    tray = createSystemTray();
  }

  setupIpcHandlers();

  // Inject desktop-specific JavaScript
  mainWindow?.webContents.on('did-finish-load', () => {
    // Inject flowpost.js for keyboard shortcuts and desktop features
    const injectPath = path.join(__dirname, '../inject/flowpost.js');
    const fs = require('fs');
    const injectCode = fs.readFileSync(injectPath, 'utf8');
    mainWindow?.webContents.executeJavaScript(injectCode);
  });
});

app.on('window-all-closed', () => {
  // Stop all folder watchers
  for (const watcher of folderWatchers.values()) {
    watcher.stop();
  }
  folderWatchers.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle app being closed to tray
app.on('before-quit', () => {
  // Stop all watchers gracefully
  for (const watcher of folderWatchers.values()) {
    watcher.stop();
  }
});
