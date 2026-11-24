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

  async function idbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { const error = tx.error || new Error('古い下書きを整理できませんでした。'); db.close(); reject(error); };
    });
  }

  async function saveDraft(key, value) {
    const serialized = JSON.stringify(value);
    try {
      let previousWasIndexed = false;
      try { previousWasIndexed = Boolean(JSON.parse(localStorage.getItem(key) || 'null')?.[MARKER]); } catch (_) {}
      localStorage.setItem(key, serialized);
      if (previousWasIndexed) {
        try { await idbDelete(key); } catch (_) { /* The new localStorage copy is already saved. */ }
      }
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


  function normalizeAssetPath(value) {
    let path = String(value || '').trim().replace(/\\/g, '/');
    if (!path || /^data:|^blob:|^https?:/i.test(path)) return path;
    path = path.replace(/^\/?stoty\/assets\//i, 'story/assets/');
    const nested = path.match(/(?:^|\/)story\/studio\/story\/assets\/(.+)$/i);
    if (nested) path = 'story/assets/' + nested[1];
    return path.replace(/^\.\/+/, '').replace(/^\/+/, '');
  }


  function migrateLegacyStageUnlocks(world) {
    if (!world || !Array.isArray(world.regions)) return 0;
    const stageIds = new Set(world.regions.flatMap(r => (r.stages||[]).map(s=>s.id)).concat((world.metadata?.specialAreas||[]).flatMap(a=>(a.stages||[]).map(s=>s.id))));
    let changed = 0;
    const visit = entry => {
      for (const rule of entry?.unlock?.conditions || []) {
        // Older map exports occasionally stored a stage ID as an event_completed target.
        if (rule.type === 'event_completed' && stageIds.has(rule.targetId)) {
          rule.type = 'stage_completed';
          changed++;
        }
      }
    };
    for (const region of world.regions) { visit(region); for (const stage of region.stages||[]) visit(stage); }
    for (const area of world.metadata?.specialAreas||[]) for (const stage of area.stages||[]) visit(stage);
    return changed;
  }

  function attachIntegrityPanel(getSnapshot) {
    if (document.getElementById('chronosIntegrityDock')) return;
    const dock = document.createElement('div');
    dock.id = 'chronosIntegrityDock';
    dock.innerHTML = '<button type="button" id="chronosIntegrityRun">全Studio参照診断</button><section id="chronosIntegrityPanel" hidden><header><b>プロジェクト参照診断</b><button type="button" id="chronosIntegrityClose" aria-label="閉じる">×</button></header><p id="chronosIntegritySummary">点検前です。</p><div id="chronosIntegrityResults"></div></section>';
    document.body.appendChild(dock);
    const style = document.createElement('style');
    style.textContent = '#chronosIntegrityDock{position:fixed;z-index:99999;right:14px;bottom:14px;font:13px/1.55 system-ui,sans-serif;color:#eaf4f1}#chronosIntegrityRun{border:1px solid #83bdb5;background:#102b31;color:#eaf4f1;border-radius:999px;padding:10px 15px;font-weight:700;box-shadow:0 4px 20px #0008;cursor:pointer}#chronosIntegrityPanel{position:absolute;right:0;bottom:52px;width:min(520px,calc(100vw - 28px));max-height:min(68vh,620px);overflow:auto;background:#101c24;border:1px solid #668b88;border-radius:13px;padding:14px;box-shadow:0 12px 40px #000b}#chronosIntegrityPanel header{display:flex;justify-content:space-between;align-items:center;font-size:15px}#chronosIntegrityClose{background:none;border:0;color:inherit;font-size:22px;cursor:pointer}#chronosIntegritySummary{color:#b8d4cd}#chronosIntegrityResults{display:grid;gap:8px}.chronos-integrity-issue{border-left:3px solid #e6a36c;background:#ffffff0a;padding:8px 10px;border-radius:5px;overflow-wrap:anywhere}.chronos-integrity-issue b{display:block;color:#ffd0a6}.chronos-integrity-issue small{display:block;color:#c3d0ce;margin-top:3px}.chronos-integrity-ok{color:#8fe0b5;padding:8px}.chronos-integrity-note{color:#d8c98d}';
    document.head.appendChild(style);
    const $ = id => document.getElementById(id);
    $('chronosIntegrityClose').addEventListener('click', () => $('chronosIntegrityPanel').hidden = true);
    $('chronosIntegrityRun').addEventListener('click', async () => {
      $('chronosIntegrityPanel').hidden = false;
      $('chronosIntegritySummary').textContent = '最新JSONとStudio上の編集中データを照合しています…';
      $('chronosIntegrityResults').replaceChildren();
      const issues = [];
      const add = (message, where) => issues.push({message, where});
      try {
        const local = typeof getSnapshot === 'function' ? (getSnapshot() || {}) : {};
        const fetchJson = async path => {
          try { const r = await fetch(path, {cache:'no-store'}); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
        };
        const [diskWorld,diskProgram,diskCharacters,diskHome,diskProfiles,diskQuestions] = await Promise.all([
          fetchJson('../../story/data/story-world.json'), fetchJson('../../story/data/story-program.json'),
          fetchJson('../../story/data/story-characters.json'), fetchJson('../../story/data/story-home.json'),
          fetchJson('../../named-cpus.json'), fetchJson('../../questions.json')
        ]);
        const world = local.world || diskWorld || {};
        const program = local.program || diskProgram || {};
        const characters = local.characters || diskCharacters || {};
        const home = local.home || local.dataHome || diskHome || {};
        const profiles = local.profiles || diskProfiles || {};
        const questions = local.questions || diskQuestions || [];
        const regions = Array.isArray(world.regions) ? world.regions : [];
        const areas = Array.isArray(world.metadata?.specialAreas) ? world.metadata.specialAreas : [];
        const scenarios = Array.isArray(program.scenarios) ? program.scenarios : [];
        const chars = Array.isArray(characters) ? characters : (characters.characters || []);
        const profileList = Array.isArray(profiles) ? profiles : (profiles.profiles || []);
        const stages = [...regions.flatMap(r => (r.stages||[]).map(s=>({...s,regionId:r.id,regionName:r.name}))), ...areas.flatMap(a=>(a.stages||[]).map(s=>({...s,areaId:a.id,areaName:a.name})))];
        const stageIds = new Set(stages.map(x=>x.id)), regionIds = new Set(regions.map(x=>x.id));
        const areaIds = new Set(areas.map(x=>x.id)), scenarioIds = new Set(scenarios.map(x=>x.id));
        const characterIds = new Set(chars.map(x=>x.id)), profileIds = new Set(profileList.map(x=>x.id));
        const achievementIds = new Set([...(program.achievements||[]).map(x=>x.id),...(world.achievements||[]).map(x=>x.id)]);
        const events = scenarios.flatMap(s=>(s.sequence||[]).map(e=>({id:e.id,scenario:s})));
        const eventIds = new Set(events.map(x=>x.id)), questionIds = new Set((Array.isArray(questions)?questions:[]).map(x=>String(x.id)));
        const whereStage = stage => `地図「${stage.regionName||stage.areaName||'エリア'}」／ステージ「${stage.name||stage.id}」 [${stage.id}]`;
        const checkRule = (rule, where) => {
          if (!rule?.targetId) { add('解除条件の対象IDが空です。',where); return; }
          if (rule.type==='event_completed' && stageIds.has(rule.targetId)) add(`ステージID「${rule.targetId}」がイベントIDとして指定されています。解除条件を「ステージクリア」に変更してください。`,where);
          else if (rule.type==='event_completed' && !eventIds.has(rule.targetId)) add(`解除イベントID「${rule.targetId}」が見つかりません。`,where);
          if (rule.type==='stage_completed' && !stageIds.has(rule.targetId)) add(`解除ステージID「${rule.targetId}」が見つかりません。`,where);
          if (rule.type==='scenario_completed' && !scenarioIds.has(rule.targetId)) add(`解除シナリオID「${rule.targetId}」が見つかりません。`,where);
          if (rule.type==='achievement_earned' && !achievementIds.has(rule.targetId)) add(`解除実績ID「${rule.targetId}」が見つかりません。`,where);
        };
        for (const region of regions) {
          for (const entry of [region,...(region.stages||[])]) for (const rule of entry.unlock?.conditions||[]) checkRule(rule,entry===region?`地域「${region.name}」 [${region.id}]`:whereStage({...entry,regionName:region.name}));
        }
        for (const area of areas) for (const stage of area.stages||[]) for (const rule of stage.unlock?.conditions||[]) checkRule(rule,whereStage({...stage,areaName:area.name}));
        for (const scenario of scenarios) {
          if (scenario.stageId && !stageIds.has(scenario.stageId)) add(`配置ステージID「${scenario.stageId}」が見つかりません。`,`シナリオ「${scenario.title||scenario.id}」 [${scenario.id}]`);
          for (const id of scenario.nextScenarioIds||[]) if (!scenarioIds.has(id)) add(`次シナリオID「${id}」が見つかりません。`,`シナリオ「${scenario.title||scenario.id}」 [${scenario.id}]`);
          for (const event of scenario.sequence||[]) {
            const where = `シナリオ「${scenario.title||scenario.id}」 [${scenario.id}] ／ イベント「${event.title||event.id}」 [${event.id}]`;
            for (const id of event.questionIds||[]) if (!questionIds.has(String(id))) add(`問題ID「${id}」が見つかりません。`,where);
            for (const id of event.enemyIds||[]) if (!profileIds.has(id)) add(`ネームドCPU ID「${id}」が見つかりません。`,where);
            for (const id of event.requiredCharacterIds||[]) if (!characterIds.has(id)) add(`人物ID「${id}」が見つかりません。`,where);
            for (const id of [event.preInteractionEventId,event.postInteractionEventId,event.defeatEventId].filter(Boolean)) if (!scenario.sequence.some(e=>e.id===id)) add(`会話イベントID「${id}」が同一シナリオ内にありません。`,where);
          }
        }
        for (const character of chars) {
          if (character.cpuProfileId && !profileIds.has(character.cpuProfileId)) add(`CPUプロフィールID「${character.cpuProfileId}」が見つかりません。`,`人物「${character.name||character.id}」 [${character.id}]`);
          for (const rule of character.unlock?.conditions||[]) checkRule(rule,`人物「${character.name||character.id}」 [${character.id}]`);
        }
        for (const listName of ['phoneMessages','phoneReadings','synopses']) for (const item of home[listName]||[]) {
          const where = `${listName}「${item.title||item.text||item.id}」 [${item.id}]`;
          if (item.eventId && !eventIds.has(item.eventId)) add(`発生イベントID「${item.eventId}」が見つかりません。`,where);
          if (item.characterId && !characterIds.has(item.characterId)) add(`人物ID「${item.characterId}」が見つかりません。`,where);
        }
        for (const product of home.shopProducts||[]) {
          const where = `ショップ商品「${product.title||product.id}」 [${product.id}]`;
          if (product.type==='region' && !regionIds.has(product.targetId)) add(`解放地域ID「${product.targetId}」が見つかりません。`,where);
          if (product.type==='stage' && !stageIds.has(product.targetId)) add(`解放ステージID「${product.targetId}」が見つかりません。`,where);
          for (const [key,source] of [['phoneMessageIds','phoneMessages'],['phoneReadingIds','phoneReadings'],['synopsisIds','synopses']]) {
            const validIds = new Set((home[source]||[]).map(item=>item.id));
            for (const id of product[key]||[]) if (!validIds.has(id)) add(`スマホ報酬ID「${id}」が ${source} にありません。`,where);
          }
        }
        // Scan image-like fields in every current data set; embedded and remote URLs are preserved.
        const imageRefs = new Map();
        const scan = (value,path) => {
          if (!value || typeof value!=='object') return;
          for (const [key,v] of Object.entries(value)) {
            const next = path ? `${path}.${key}` : key;
            if (typeof v==='string' && v.trim() && (/^data:image\//i.test(v) || (/(?:image|portrait|icon|background|mapImage|avatar|media|src|path)$/i.test(key) || /(?:^|\/)story\/assets\//i.test(v)) && /\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(v))) {
              const normalized = normalizeAssetPath(v);
              if (normalized && !/^blob:|^（/.test(normalized)) imageRefs.set(normalized,next);
            } else if (v && typeof v==='object') scan(v,next);
          }
        };
        scan(world,'story-world'); scan(program,'story-program'); scan(characters,'story-characters'); scan(home,'story-home'); scan(profileList,'named-cpus');
        const paths = [...imageRefs.entries()];
        const missing = [];
        const checks = paths.map(async ([path,location]) => {
          if (/^(?:data:image\/|https?:\/\/)/i.test(path)) {
            const ok = await new Promise(resolve => { const image = new Image(); image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = path; });
            if (!ok) missing.push({path:/^data:/i.test(path)?'埋め込み画像データ':path,location});
            return;
          }
          let url;
          try { url = path.startsWith('../') || path.startsWith('./') ? new URL(path,document.baseURI).href : new URL('../../'+path,document.baseURI).href; }
          catch (_) { missing.push({path,location}); return; }
          try { const response = await fetch(url,{method:'HEAD',cache:'no-store'}); if (!response.ok) missing.push({path,location}); }
          catch (_) { missing.push({path,location}); }
        });
        for (let i=0;i<checks.length;i+=8) await Promise.all(checks.slice(i,i+8));
        for (const item of missing) add(`画像ファイルを読み込めません（${item.path}）。`,`画像参照: ${item.location}`);
        $('chronosIntegritySummary').textContent = issues.length ? `参照切れ・不足 ${issues.length}件を検出しました。下記に保存元と項目位置を表示します。` : `参照切れは見つかりませんでした。画像参照 ${paths.length}件も点検しました。`;
        if (!issues.length) { const ok=document.createElement('div'); ok.className='chronos-integrity-ok'; ok.textContent='✓ すべての参照が整合しています。'; $('chronosIntegrityResults').append(ok); }
        else for (const issue of issues) { const row=document.createElement('div'); row.className='chronos-integrity-issue'; const title=document.createElement('b'); title.textContent=issue.message; const detail=document.createElement('small'); detail.textContent=issue.where||'場所を特定できません'; row.append(title,detail); $('chronosIntegrityResults').append(row); }
      } catch (error) {
        $('chronosIntegritySummary').textContent = '診断を完了できませんでした: ' + (error?.message || error);
      }
    });
  }

  window.ChronosStudio = { saveDraft, loadDraft, readImageFile, attachIntegrityPanel, normalizeAssetPath, migrateLegacyStageUnlocks };
})();
