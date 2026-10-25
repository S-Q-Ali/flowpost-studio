/**
 * Native Folder Watcher for Desktop App
 * Uses Windows FileSystemWatcher or equivalent native API
 * This file would be compiled as part of the desktop app's native layer
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

interface FolderWatcherOptions {
  folderPath: string;
  extensions?: string[];
  recursive?: boolean;
  debounceMs?: number;
}

interface FileEvent {
  eventType: 'add' | 'change' | 'delete';
  filePath: string;
  fileName: string;
  timestamp: Date;
}

class NativeFolderWatcher extends EventEmitter {
  private watchers: Map<string, any> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: FolderWatcherOptions;
  private isRunning: boolean = false;

  constructor(options: FolderWatcherOptions) {
    super();
    this.options = options;
  }

  start(): void {
    if (this.isRunning) return;
    
    console.log(`Starting folder watcher for: ${this.options.folderPath}`);
    this.isRunning = true;

    try {
      // Check if folder exists
      if (!fs.existsSync(this.options.folderPath)) {
        throw new Error(`Folder does not exist: ${this.options.folderPath}`);
      }

      // Create watcher for the folder
      const watcher = fs.watch(
        this.options.folderPath,
        { recursive: this.options.recursive ?? false },
        (eventType, filename) => {
          this.handleFileEvent(eventType, filename);
        }
      );

      this.watchers.set(this.options.folderPath, watcher);

      watcher.on('error', (error) => {
        console.error('Folder watcher error:', error);
        this.emit('error', error);
      });

      console.log(`Folder watcher started for: ${this.options.folderPath}`);
    } catch (error) {
      console.error('Failed to start folder watcher:', error);
      this.emit('error', error);
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('Stopping folder watcher');
    this.isRunning = false;

    for (const [folderPath, watcher] of this.watchers.entries()) {
      watcher.close();
      this.watchers.delete(folderPath);
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    console.log('Folder watcher stopped');
  }

  private handleFileEvent(eventType: string, filename: string): void {
    if (!filename) return;

    const filePath = path.join(this.options.folderPath, filename);
    const fileName = path.basename(filename);
    const timestamp = new Date();

    // Check if file extension matches
    const extension = path.extname(fileName).toLowerCase();
    const extensions = this.options.extensions ?? ['.*'];
    
    if (!extensions.some(ext => extension === ext || ext === '.*')) {
      return;
    }

    // Debounce file events
    const debounceKey = `${folderPath}-${fileName}`;
    const debounceMs = this.options.debounceMs ?? 1000;

    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey));
    }

    this.debounceTimers.set(debounceKey, setTimeout(() => {
      const event: FileEvent = {
        eventType: eventType === 'change' ? 'change' : 'add',
        filePath,
        fileName,
        timestamp,
      };

      console.log(`File event: ${event.eventType} - ${fileName}`);
      this.emit('file-event', event);
      this.debounceTimers.delete(debounceKey);
    }, debounceMs));
  }

  getWatchedFolders(): string[] {
    return Array.from(this.watchers.keys());
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// Export for use in desktop app
export { NativeFolderWatcher, FileEvent, FolderWatcherOptions };

// Usage example:
/*
const watcher = new NativeFolderWatcher({
  folderPath: 'C:\\Users\\User\\FlowPost\\Watched',
  extensions: ['.mp4', '.mov', '.jpg', '.png'],
  recursive: false,
  debounceMs: 2000,
});

watcher.on('file-event', (event) => {
  console.log(`Processing file: ${event.fileName}`);
  // Trigger content automation workflow
  window.dispatchEvent(new CustomEvent('flowpost:new-file', { detail: event }));
});

watcher.start();
*/
