/*
 * Chronos Game Feature Configuration
 * GitHub Pages deployment switch. This file is intentionally independent
 * from Firebase so story maintenance never changes online-room behavior.
 *
 * To temporarily close Story Mode, set storyModeEnabled to false.
 * If this file is missing or fails to load, Story Mode remains unavailable
 * (fail-closed) rather than accidentally opening during maintenance.
 */
window.CHRONOS_GAME_CONFIG = Object.freeze({
  features: Object.freeze({
    storyModeEnabled: true
  }),
  messages: Object.freeze({
    storyModeDisabled: "ストーリーモードは現在メンテナンス中です。オンライン対戦は通常どおりご利用いただけます。"
  })
});
