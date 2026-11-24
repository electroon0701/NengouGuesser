/* Chronos Online Story Audio Manager
 * BGM/SE only. Voice-ready API boundary is reserved for a future extension.
 * Configuration is loaded from ./audio/audio-config.json.
 */
(function (global) {
  "use strict";
  const CONFIG_URL = "./audio/audio-config.json";
  const CONFIG_STORAGE_KEY = "chronos_audio_config_v3";
  const LEGACY_CONFIG_STORAGE_KEYS = ["chronos_audio_config_v2"];
  const SETTINGS_KEY = "chronos_story_audio_settings_v1";
  const DEFAULT_SETTINGS = { master: 0.8, bgm: 0.7, se: 0.85, voice: 0.85, muted: false };
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));
  const normalizeId = v => typeof v === "string" ? v.trim() : "";
  class ChronosAudioManager {
    constructor() {
      this.config = { assets: { bgm: [], se: [], voice: [] }, settings: {}, targets: {}, triggers: {}, dialogueSounds: {} };
      this.settings = this.readSettings();
      this.context = { pageId: "", regionId: "", stageId: "", scenarioId: "", eventId: "", eventType: "" };
      this.bgmChannels = [new Audio(), new Audio()];
      this.bgmChannels.forEach(a => { a.loop = true; a.preload = "none"; a.volume = 0; });
      this.activeChannel = 0;
      this.currentBgmId = "";
      this.sePool = [];
      this.voicePool = [];
      this.maxSeVoices = 8;
      this.maxVoiceVoices = 8;
      this.unlocked = false;
      this.fadeToken = 0;
      this.ready = this.loadConfig();
      this.installUnlock();
      this.installSettingsUI();
    }
    readSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
        return {
          master: clamp(saved.master ?? DEFAULT_SETTINGS.master),
          bgm: clamp(saved.bgm ?? DEFAULT_SETTINGS.bgm),
          se: clamp(saved.se ?? DEFAULT_SETTINGS.se),
          voice: clamp(saved.voice ?? DEFAULT_SETTINGS.voice),
          muted: saved.muted === true
        };
      } catch (_) { return { ...DEFAULT_SETTINGS }; }
    }
    saveSettings() {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) {}
      this.applyVolumes();
    }
    async loadConfig() {
      try {
        let data = null;
        // v2 could contain large embedded data URLs. Remove that legacy storage first;
        // the project file (audio-config.json) is now the GitHub-safe source of truth.
        for (const legacyKey of LEGACY_CONFIG_STORAGE_KEYS) {
          try { localStorage.removeItem(legacyKey); } catch (_) {}
        }
        try {
          const local = localStorage.getItem(CONFIG_STORAGE_KEY);
          if (local) {
            const parsed = JSON.parse(local);
            const stripEmbedded = value => {
              const out = { ...value, assets: { bgm: [], se: [], voice: [] } };
              for (const type of ["bgm","se","voice"]) {
                out.assets[type] = Array.isArray(value.assets?.[type])
                  ? value.assets[type].filter(item => !(item?.sourceMode === "embed" || /^data:audio\//i.test(String(item?.src || ""))))
                  : [];
              }
              return out;
            };
            const cleaned = stripEmbedded(parsed);
            if (JSON.stringify(cleaned) !== JSON.stringify(parsed)) {
              try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cleaned)); } catch (_) {}
            }
            data = cleaned;
          }
        } catch (_) {}
        if (!data) {
          const response = await fetch(CONFIG_URL, { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          data = await response.json();
        }
        if (!data || data.format !== "chronos-audio-config" || ![1,2,3].includes(data.version)) throw new Error("Unsupported audio config");
        this.config = {
          assets: { bgm: Array.isArray(data.assets?.bgm) ? data.assets.bgm : [], se: Array.isArray(data.assets?.se) ? data.assets.se : [], voice: Array.isArray(data.assets?.voice) ? data.assets.voice : [] },
          settings: data.settings || {}, targets: data.targets || {}, triggers: data.triggers || {}, dialogueSounds: data.dialogueSounds || {}
        };
        this.applyVolumes();
        return true;
      } catch (error) {
        console.warn("[ChronosAudio] Configuration unavailable; audio remains silent.", error);
        return false;
      }
    }
    installUnlock() {
      const unlock = () => {
        if (this.unlocked) return;
        this.unlocked = true;
        this.bgmChannels.forEach(a => { try { a.load(); } catch (_) {} });
        if (this.context.pageId || this.context.scenarioId || this.context.eventId) {
          this.setContext(this.context).catch(error => console.warn("[ChronosAudio] Context resume failed:", error));
        }
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("keydown", unlock, true);
      };
      document.addEventListener("pointerdown", unlock, true);
      document.addEventListener("keydown", unlock, true);
    }
    asset(type, id) {
      return (this.config.assets[type] || []).find(item => item && item.id === id && item.src);
    }
    effectiveVolume(type, asset) {
      if (this.settings.muted) return 0;
      const master = clamp(this.settings.master);
      const group = clamp(this.settings[type]);
      const configuredDefault = type === "bgm"
        ? this.config.settings?.defaultBgmVolume
        : type === "voice" ? this.config.settings?.defaultVoiceVolume
        : this.config.settings?.defaultSeVolume;
      const own = clamp(asset?.volume ?? configuredDefault ?? 1);
      return master * group * own;
    }
    applyVolumes() {
      this.bgmChannels.forEach(audio => {
        const id = audio.dataset.assetId;
        if (!id) return;
        const item = this.asset("bgm", id);
        audio.volume = this.effectiveVolume("bgm", item) * (audio.dataset.fadeLevel ? clamp(audio.dataset.fadeLevel) : 1);
      });
      this.sePool.forEach(a => {
        const item = this.asset("se", a.dataset.assetId);
        a.volume = this.effectiveVolume("se", item);
      });
      this.voicePool.forEach(a => {
        const item = this.asset("voice", a.dataset.assetId);
        a.volume = this.effectiveVolume("voice", item);
      });
    }
    resolveBgm(context = this.context) {
      const t = this.config.targets || {};
      const keys = [];
      if (context.eventId) keys.push("event:" + context.eventId);
      if (context.scenarioId) keys.push("scenario:" + context.scenarioId);
      if (context.stageId) keys.push("stage:" + context.stageId);
      if (context.regionId) keys.push("region:" + context.regionId);
      if (context.eventType) keys.push("eventType:" + context.eventType);
      if (context.pageId) keys.push("page:" + context.pageId);
      keys.push("default");
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(t, key)) continue;
        const choice = t[key]?.bgm ?? "inherit";
        if (choice === "inherit") continue;
        return choice;
      }
      return "inherit";
    }
    async setContext(context = {}) {
      await this.ready;
      this.context = { ...this.context, ...context };
      const choice = this.resolveBgm(this.context);
      if (choice === "none" || !choice) { this.stopBgm(); return; }
      if (choice !== "inherit") this.playBgm(choice);
    }
    async playBgm(id, options = {}) {
      await this.ready;
      const item = this.asset("bgm", normalizeId(id));
      if (!item) { if (id !== "none") console.warn("[ChronosAudio] Unknown BGM:", id); return false; }
      if (this.currentBgmId === item.id && !options.restart) return true;
      if (!this.unlocked) return false;
      const oldIndex = this.activeChannel, nextIndex = 1 - oldIndex;
      const oldAudio = this.bgmChannels[oldIndex], nextAudio = this.bgmChannels[nextIndex];
      const src = new URL(item.src, document.baseURI).href;
      if (nextAudio.src !== src) nextAudio.src = src;
      nextAudio.loop = item.loop !== false;
      nextAudio.dataset.assetId = item.id;
      nextAudio.dataset.fadeLevel = "0";
      nextAudio.volume = 0;
      try { nextAudio.currentTime = 0; await nextAudio.play(); }
      catch (error) { console.warn("[ChronosAudio] BGM playback blocked/failed:", error); return false; }
      const token = ++this.fadeToken;
      const duration = Math.max(0, Number(options.fadeMs ?? item.fadeInMs ?? this.config.settings.crossfadeMs ?? 900));
      const start = performance.now();
      const oldId = this.currentBgmId;
      const oldItem = oldId ? this.asset("bgm", oldId) : null;
      const oldItemId = oldAudio.dataset.assetId || oldId;
      this.currentBgmId = item.id;
      this.activeChannel = nextIndex;
      const newTarget = this.effectiveVolume("bgm", item);
      if (!duration) {
        nextAudio.volume = newTarget; nextAudio.dataset.fadeLevel = "1";
        oldAudio.pause(); oldAudio.currentTime = 0; return true;
      }
      return new Promise(resolve => {
        const tick = now => {
          if (token !== this.fadeToken) { resolve(false); return; }
          const p = clamp((now - start) / duration);
          nextAudio.dataset.fadeLevel = String(p);
          nextAudio.volume = this.effectiveVolume("bgm", item) * p;
          const fadingOldItem = this.asset("bgm", oldItemId);
          oldAudio.volume = this.effectiveVolume("bgm", fadingOldItem) * (1 - p);
          if (p >= 1) {
            oldAudio.pause(); try { oldAudio.currentTime = 0; } catch (_) {}
            oldAudio.dataset.assetId = ""; oldAudio.dataset.fadeLevel = "1";
            resolve(true);
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
    stopBgm(fadeMs = 500) {
      const token = ++this.fadeToken, audio = this.bgmChannels[this.activeChannel];
      if (!audio) return;
      const startVolume = audio.volume, start = performance.now(), duration = Math.max(0, Number(fadeMs) || 0);
      if (!duration) { audio.pause(); audio.currentTime = 0; this.currentBgmId = ""; return; }
      const tick = now => {
        if (token !== this.fadeToken) return;
        const p = clamp((now - start) / duration);
        audio.volume = startVolume * (1 - p);
        if (p >= 1) { audio.pause(); try { audio.currentTime = 0; } catch (_) {} this.currentBgmId = ""; }
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    stopTransientAudio() {
      [...this.sePool, ...this.voicePool].forEach(audio => {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      });
    }
    async playSE(id, options = {}) {
      await this.ready;
      const item = this.asset("se", normalizeId(id));
      if (!item || !this.unlocked || this.settings.muted) return false;
      const now = performance.now(), cooldown = Math.max(0, Number(options.cooldownMs ?? item.cooldownMs ?? 0));
      const previous = this._lastSeAt?.[id] || 0;
      if (cooldown && now - previous < cooldown) return false;
      this._lastSeAt = this._lastSeAt || {}; this._lastSeAt[id] = now;
      let audio = this.sePool.find(a => a.paused || a.ended);
      if (!audio && this.sePool.length < this.maxSeVoices) { audio = new Audio(); this.sePool.push(audio); }
      if (!audio) {
        audio = this.sePool.reduce((a, b) => (a.volume <= b.volume ? a : b));
        audio.pause();
      }
      audio.src = new URL(item.src, document.baseURI).href;
      audio.dataset.assetId = item.id;
      audio.volume = this.effectiveVolume("se", item);
      audio.currentTime = 0;
      audio.playbackRate = clamp(options.playbackRate ?? item.playbackRate ?? 1, 0.5, 2);
      try { await audio.play(); return true; }
      catch (error) { console.warn("[ChronosAudio] SE playback failed:", error); return false; }
    }
    async playDialogueTick(emotion = "neutral", options = {}) {
      await this.ready;
      const profile = this.config.dialogueSounds?.[emotion] || this.config.dialogueSounds?.neutral;
      if (!profile || profile.enabled === false || !profile.seId) return false;
      const jitter = Number(profile.jitter || 0);
      const baseRate = Number(profile.playbackRate || 1);
      const rate = baseRate + (jitter ? ((Math.random() * 2 - 1) * jitter) : 0);
      return this.playSE(profile.seId, { cooldownMs: Number(profile.cooldownMs || 0), playbackRate: rate });
    }
    async playVoice(id, options = {}) {
      await this.ready;
      const item = this.asset("voice", normalizeId(id));
      if (!item || !this.unlocked || this.settings.muted) return false;
      let audio = this.voicePool.find(a => a.paused || a.ended);
      if (!audio && this.voicePool.length < this.maxVoiceVoices) { audio = new Audio(); this.voicePool.push(audio); }
      if (!audio) {
        audio = this.voicePool[0];
        audio.pause();
      }
      audio.src = new URL(item.src, document.baseURI).href;
      audio.dataset.assetId = item.id;
      audio.volume = this.effectiveVolume("voice", item);
      audio.currentTime = 0;
      try { await audio.play(); return true; }
      catch (error) { console.warn("[ChronosAudio] Voice playback failed:", error); return false; }
    }
    stopVoices() {
      this.voicePool.forEach(audio => { audio.pause(); try { audio.currentTime = 0; } catch (_) {} });
    }
    async playTrigger(trigger, context = this.context) {
      await this.ready;
      const keys = [];
      if (context.eventId) keys.push("event:" + context.eventId + ":" + trigger);
      if (context.scenarioId) keys.push("scenario:" + context.scenarioId + ":" + trigger);
      if (context.stageId) keys.push("stage:" + context.stageId + ":" + trigger);
      if (context.regionId) keys.push("region:" + context.regionId + ":" + trigger);
      keys.push("trigger:" + trigger);
      for (const key of keys) {
        const id = this.config.triggers?.[key];
        if (id && id !== "none") return this.playSE(id);
        if (id === "none") return false;
      }
      return false;
    }
    setVolume(type, value) {
      if (type === "master" || type === "bgm" || type === "se" || type === "voice") {
        this.settings[type] = clamp(value); this.saveSettings();
      }
    }
    setMuted(value) { this.settings.muted = Boolean(value); this.saveSettings(); }
    installSettingsUI() {
      const mount = () => {
        if (!document.body || document.getElementById("chronosAudioSettings")) return;
        const wrap = document.createElement("div");
        wrap.id = "chronosAudioSettings";
        wrap.innerHTML = `<button type="button" id="chronosAudioToggle" aria-expanded="false" aria-controls="chronosAudioPanel">♫ 音量</button>
          <section id="chronosAudioPanel" hidden aria-label="音響設定">
            <header><strong>音響設定</strong><button type="button" id="chronosAudioClose" aria-label="閉じる">×</button></header>
            <label>マスター音量 <output id="chronosAudioMasterValue"></output><input id="chronosAudioMaster" type="range" min="0" max="100"></label>
            <label>BGM音量 <output id="chronosAudioBgmValue"></output><input id="chronosAudioBgm" type="range" min="0" max="100"></label>
            <label>SE音量 <output id="chronosAudioSeValue"></output><input id="chronosAudioSe" type="range" min="0" max="100"></label>
            <label>ボイス音量 <output id="chronosAudioVoiceValue"></output><input id="chronosAudioVoice" type="range" min="0" max="100"></label>
            <label class="chronos-audio-mute"><input id="chronosAudioMuted" type="checkbox"> すべてミュート</label>
          </section>`;
        const footer = document.querySelector("#storyMode .story-footer");
        (footer || document.body).appendChild(wrap);
        const style = document.createElement("style");
        style.textContent = `#chronosAudioSettings{display:none;position:relative;z-index:100500;font:13px/1.5 system-ui,sans-serif;color:#f6f1e8;flex:0 0 auto}body.story-mode-active #chronosAudioSettings{display:block}#storyMode .story-footer{justify-content:space-between;flex-wrap:wrap}#storyMode #chronosAudioPanel{position:absolute;right:0;bottom:42px;}#chronosAudioToggle{border:1px solid #bda779;background:#17202b;color:inherit;border-radius:999px;padding:9px 14px;box-shadow:0 4px 18px #0006}#chronosAudioPanel{position:absolute;right:0;bottom:48px;width:min(280px,calc(100vw - 28px));padding:14px;border:1px solid #9e8a64;border-radius:14px;background:#111923f5;box-shadow:0 10px 36px #0009}#chronosAudioPanel[hidden]{display:none}#chronosAudioPanel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}#chronosAudioPanel header button{background:none;color:inherit;border:0;font-size:22px}#chronosAudioPanel label{display:block;margin:10px 0}#chronosAudioPanel output{float:right;color:#d9c18d}#chronosAudioPanel input[type=range]{display:block;width:100%;accent-color:#c7a96c}#chronosAudioPanel .chronos-audio-mute{display:flex;align-items:center;gap:8px}#chronosAudioPanel .chronos-audio-mute input{accent-color:#c7a96c}@media(max-width:600px){#chronosAudioToggle{padding:7px 10px;font-size:11px}#chronosAudioPanel{width:min(280px,calc(100vw - 28px))}}`;
        document.head.appendChild(style);
        const panel = wrap.querySelector("#chronosAudioPanel"), toggle = wrap.querySelector("#chronosAudioToggle");
        toggle.addEventListener("click", () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden)); });
        wrap.querySelector("#chronosAudioClose").addEventListener("click", () => { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); });
        ["master","bgm","se","voice"].forEach(type => {
          const input = wrap.querySelector("#chronosAudio" + type[0].toUpperCase() + type.slice(1));
          const output = wrap.querySelector("#chronosAudio" + type[0].toUpperCase() + type.slice(1) + "Value");
          input.value = Math.round(this.settings[type] * 100); output.value = input.value + "%";
          input.addEventListener("input", () => { output.value = input.value + "%"; this.setVolume(type, Number(input.value) / 100); });
        });
        const mute = wrap.querySelector("#chronosAudioMuted"); mute.checked = this.settings.muted;
        mute.addEventListener("change", () => this.setMuted(mute.checked));
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
    }
  }
  const manager = new ChronosAudioManager();
  global.ChronosAudio = manager;
  global.AudioManager = manager;
})(window);
