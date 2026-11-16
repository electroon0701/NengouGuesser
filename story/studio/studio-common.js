/* Shared helpers for Chronos offline studios. No external dependencies. */
(() => {
  'use strict';
  const DB_NAME = 'chronos_studio_drafts_v1';
  const STORE_NAME = 'drafts';
  const MARKER = '__chronosDraftStoredInIndexedDB__';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('このブラウザーではIndexedDBを利用できません。'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('下書き保存領域を開けませんでした。'));
    });
  }

  async function idbWrite(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { const error = tx.error || new Error('下書きを保存できませんでした。'); db.close(); reject(error); };
    });
  }

  async function idbRead(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => { const value = request.result; db.close(); resolve(value); };
      request.onerror = () => { const error = request.error; db.close(); reject(error); };
    });
  }

  async function saveDraft(key, value) {
    const serialized = JSON.stringify(value);
    try {
      localStorage.setItem(key, serialized);
      return 'ブラウザー保存';
    } catch (storageError) {
      await idbWrite(key, serialized);
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify({ [MARKER]: true }));
      } catch (_) { /* IndexedDB copy remains the source of truth. */ }
      return '大容量保存（IndexedDB）';
    }
  }

  async function loadDraft(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_) {}
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed[MARKER]) {
          const stored = await idbRead(key);
          return stored ? JSON.parse(stored) : null;
        }
        return parsed;
      } catch (error) {
        if (error && error.name === 'SyntaxError') throw error;
      }
    }
    try {
      const stored = await idbRead(key);
      return stored ? JSON.parse(stored) : null;
    } catch (_) { return null; }
  }

  function readImageFile(file, maxBytes = 8 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('画像ファイルが選択されていません。'));
      const allowed = /^image\/(png|jpeg|webp|avif|gif)$/i.test(file.type || '') || /\.(png|jpe?g|webp|avif|gif)$/i.test(file.name || '');
      if (!allowed) return reject(new Error('PNG・JPEG・WebP・AVIF・GIF画像を選択してください。'));
      if (file.size > maxBytes) return reject(new Error('画像は1ファイル8MB以下にしてください。'));
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        if (!/^data:image\/(png|jpeg|webp|avif|gif);base64,/i.test(result)) return reject(new Error('画像データとして読み込めませんでした。'));
        resolve(result);
      };
      reader.onerror = () => reject(new Error('画像ファイルの読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
  }

  // Use a real button to open the file picker from a direct user gesture.
  // This is more reliable than making a transparent file input cover a label.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-image-trigger]');
    if (!trigger) return;
    const wrapper = trigger.closest('.image-picker');
    const input = wrapper && wrapper.querySelector('input[type=\"file\"][data-image-upload]');
    if (input) input.click();
  });

  window.ChronosStudio = { saveDraft, loadDraft, readImageFile };
})();
