// desktop/inject/flowpost.js
// Desktop-only injection script for Pake/Tauri wrapper.
// Provides global keyboard shortcuts and notification permission.

(function() {
  'use strict';

  // Expose desktop detection immediately
  window.__isDesktop = true;

  // Global keyboard shortcuts (only work in desktop context)
  document.addEventListener('keydown', (e) => {
    // Ctrl+S - Save action
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('flowpost:save'));
    }

    // Ctrl+P - Schedule/publish dialog
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('flowpost:schedule'));
    }

    // Escape - Close dialogs/modals
    if (e.key === 'Escape') {
      window.dispatchEvent(new CustomEvent('flowpost:close-dialog'));
    }

    // Ctrl+Q - Quit (desktop only)
    if (e.ctrlKey && e.key === 'q') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('flowpost:quit'));
    }
  });

  // Request notification permission on load (desktop only)
  if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'default') {
    window.Notification.requestPermission();
  }

  // Show native desktop notification
  window.addEventListener('flowpost:notify', (e) => {
    const { title, body, icon } = e.detail || {};
    if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
      new Notification(title, { body, icon: icon || '/logo.png' });
    }
  });

  // Handle quit event
  window.addEventListener('flowpost:quit', () => {
    window.close();
  });

  // Handle minimize to tray
  window.addEventListener('flowpost:minimize', () => {
    if (window.navigator && (window.navigator as any).app) {
      (window.navigator as any).app.hide();
    }
  });

  // Expose error logging for desktop context
  const originalError = console.error;
  console.error = function(...args) {
    originalError.apply(console, args);
    // Log to desktop file if available
    if (window.__isDesktop) {
      // TODO: Add window.desktopLogError implementation
      console.log('[Desktop Error]', ...args);
    }
  };
})();
