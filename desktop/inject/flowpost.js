// desktop/inject/flowpost.js
// Desktop-only injection script for Pake/Tauri wrapper.
// Provides global keyboard shortcuts and notification permission.
// Inert in normal browser tabs (no-op outside desktop shell).

(function() {
  'use strict';

  // Global keyboard shortcuts
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

  // Expose desktop detection
  window.__isDesktop = true;
})();
