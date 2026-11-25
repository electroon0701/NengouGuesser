/* Chronos Story Image Loader
 * GitHub Pages-safe image loading, retry, preload, and cache layer.
 * Keep story image files in: assets/maps, assets/backgrounds, assets/portraits.
 */
(() => {
  const cache = new Map();
  const pending = new Map();
  const RETRIES = 3;
  const RETRY_BASE_MS = 140;
  const FALLBACKS = {
    map: './story/assets/maps/world-map.png',
    background: './story/assets/backgrounds/space.jpg',
    portrait: ''
  };

  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  function clean(value){
    if(typeof value !== 'string') return '';
    let path = value.trim().replace(/\\/g, '/');
    if(!path) return '';
    if(/^data:image\//i.test(path) || /^blob:/i.test(path) || /^https?:\/\//i.test(path)) return path;
    path = path.replace(/(?:^|\/)story\/studio\/story\/assets\//i, 'story/assets/');
    path = path.replace(/^\/?stoty\/assets\//i, 'story/assets/');
    path = path.replace(/^\/?story\/assets\//i, 'story/assets/');
    path = path.replace(/^\.\//, '').replace(/^\//, '');
    path = path.replace(/\/+/g, '/');
    return `./${path}`;
  }
  function categoryFrom(src=''){
    const p = clean(src).toLowerCase();
    if(p.includes('/maps/')) return 'map';
    if(p.includes('/portraits/')) return 'portrait';
    if(p.includes('/backgrounds/')) return 'background';
    return 'background';
  }
  function retryUrl(src, attempt){
    // Cache-busting is only used after the first failure. It prevents stale 404s
    // from being reused by aggressive browser/CDN caches on GitHub Pages.
    if(attempt <= 0 || /^data:|^blob:|^https?:/i.test(src)) return src;
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}chronos_retry=${attempt}`;
  }
  async function load(src, options={}){
    const url = clean(src);
    if(!url) return {ok:false,url:'',fallback:''};
    if(cache.has(url)) return {ok:true,url,element:cache.get(url)};
    if(pending.has(url)) return pending.get(url);
    const retries = Math.max(0, Number(options.retries ?? RETRIES));
    const promise = (async()=>{
      for(let attempt=0; attempt<=retries; attempt++){
        const testUrl = retryUrl(url, attempt);
        try{
          const image = new Image();
          image.decoding = 'async';
          image.src = testUrl;
          await new Promise((resolve,reject)=>{
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Image load failed: ${testUrl}`));
          });
          cache.set(url, image);
          return {ok:true,url,element:image,attempt};
        }catch(error){
          if(attempt < retries) await sleep(RETRY_BASE_MS * (attempt + 1));
        }
      }
      const category = options.category || categoryFrom(url);
      const fallback = FALLBACKS[category] || '';
      console.warn('[ChronosImageLoader] image load failed', {url, category, retries: retries + 1});
      return {ok:false,url,fallback};
    })().finally(()=>pending.delete(url));
    pending.set(url,promise);
    return promise;
  }
  async function preload(urls, options={}){
    const list = [...new Set((urls || []).map(clean).filter(Boolean))];
    const results = await Promise.all(list.map(url => load(url, options)));
    return {ok:results.every(r=>r.ok), results};
  }
  function bindImage(img, source, options={}){
    if(!img || img.nodeType!==1) return;
    const raw = source || img.getAttribute('src') || '';
    const src = clean(raw);
    if(!src || (!src.includes('/story/assets/') && !/^data:image\//i.test(src) && !/^blob:/i.test(src))) return;
    if(img.dataset.chronosImageBound === src) return;
    img.dataset.chronosImageBound = src;
    img.dataset.chronosOriginalSrc = src;
    const category = options.category || categoryFrom(src);
    let attempt = 0;
    const apply = (url) => {
      img.onerror = () => {
        if(attempt < RETRIES){
          attempt += 1;
          setTimeout(()=>apply(retryUrl(src, attempt)), RETRY_BASE_MS * attempt);
          return;
        }
        const result = FALLBACKS[category] || '';
        if(result && result !== src && !img.dataset.chronosFallback){
          img.dataset.chronosFallback = '1';
          attempt = 0;
          apply(result);
          return;
        }
        img.classList.add('chronos-image-failed');
        img.setAttribute('aria-label', img.getAttribute('alt') || '画像を読み込めませんでした');
      };
      img.onload = () => img.classList.remove('chronos-image-failed');
      img.src = url;
    };
    apply(src);
  }
  function bindTree(root=document){
    root.querySelectorAll?.('img[src]').forEach(img=>bindImage(img));
  }
  const observer = new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType!==1) continue;
        if(node.matches?.('img[src]')) bindImage(node);
        bindTree(node);
      }
    }
  });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{bindTree();observer.observe(document.body,{childList:true,subtree:true});},{once:true});
  else { bindTree(); observer.observe(document.body,{childList:true,subtree:true}); }

  window.ChronosImageLoader = {
    clean,
    load,
    preload,
    bindImage,
    categoryFrom,
    cache
  };
})();
