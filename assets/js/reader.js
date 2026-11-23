/* 阅读器 */
(function () {
  const THEME_KEY = 'medlib.theme';
  const root = document.documentElement;
  const $ = id => document.getElementById(id);

  /* ---------- 主题 ---------- */
  function setTheme(t) { root.dataset.theme = t; localStorage.setItem(THEME_KEY, t); }
  setTheme(localStorage.getItem(THEME_KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('themeBtn').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');

  /* ---------- 状态 ---------- */
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const readerEl = $('reader');
  const view = $('view');
  const img = $('pageImg');
  const card = $('pageCard');

  let meta = null;
  let page = 1;
  let zoom = 'fit';          // 'fit' | 'page' | 数字百分比
  let textData = null;
  let textLoading = false;
  const preloaded = new Set();

  const pageSrc = n => `img/pages/${id}/${String(n).padStart(4, '0')}.webp`;
  const S = {
    width: 0, height: 0,
  };

  /* ---------- 通用 ---------- */
  function toast(text, actionLabel, action, ms) {
    const box = $('toast'), t = $('toastText'), a = $('toastAct');
    t.textContent = text;
    if (actionLabel) {
      a.hidden = false; a.textContent = actionLabel;
      a.onclick = () => { hideToast(); action && action(); };
    } else a.hidden = true;
    box.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(hideToast, ms || 5200);
  }
  function hideToast() { $('toast').classList.remove('show'); }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- 缩放 ---------- */
  function applyZoom() {
    if (!meta) return;
    const availW = Math.max(240, view.clientWidth - 48);
    const availH = Math.max(240, view.clientHeight - 52);
    let w;
    if (zoom === 'fit') w = availW;
    else if (zoom === 'page') w = Math.min(availW, availH * S.ratio);
    else w = Math.round(S.width * zoom / 100);
    card.style.width = w + 'px';
    img.style.width = '100%';
    img.style.height = 'auto';
    $('zLabel').textContent = zoom === 'fit' ? '适宽' : zoom === 'page' ? '整页' : zoom + '%';
    $('zFit').classList.toggle('on', zoom === 'fit' || zoom === 'page');
  }
  function zoomStep(dir) {
    const cur = zoom === 'fit' || zoom === 'page' ? 100 : zoom;
    zoom = clamp(Math.round((cur + dir * 10) / 10) * 10, 40, 300);
    applyZoom();
  }

  /* ---------- 翻页 ---------- */
  function goPage(n, opts) {
    opts = opts || {};
    if (!meta) return;
    n = clamp(parseInt(n, 10) || 1, 1, meta.pages);
    const changed = n !== page;
    page = n;

    const src = pageSrc(n);
    card.classList.add('busy');
    if (changed || !img.getAttribute('src')) {
      img.classList.add('loading');
      const pre = new Image();
      pre.onload = () => {
        img.src = src;
        img.onload = () => { img.classList.remove('loading'); card.classList.remove('busy'); };
      };
      pre.onerror = () => { card.classList.remove('busy'); img.classList.remove('loading'); };
      pre.src = src;
    }

    img.alt = `${meta.title} 第 ${n} 页`;
    $('slider').value = n;
    $('slider').style.setProperty('--pct', ((n - 1) / Math.max(1, meta.pages - 1) * 100) + '%');
    $('pInput').value = n;
    $('prevBtn').disabled = n <= 1;
    $('nextBtn').disabled = n >= meta.pages;
    $('edgePrev').disabled = n <= 1;
    $('edgeNext').disabled = n >= meta.pages;
    $('tbSub').textContent = `${n} / ${meta.pages}`;

    localStorage.setItem('read:' + id, n);
    if (!opts.silent) {
      const u = new URL(location.href);
      u.searchParams.set('p', n);
      history.replaceState(null, '', u);
    }
    if (!opts.keepScroll) view.scrollTo({ top: 0, behavior: 'auto' });
    preload(n);
    markToc(n);
    markThumb(n);
  }

  function preload(n) {
    [n + 1, n + 2, n - 1].forEach(k => {
      if (k < 1 || k > meta.pages || preloaded.has(k)) return;
      preloaded.add(k);
      const im = new Image();
      im.src = pageSrc(k);
    });
  }

  /* ---------- 目录 ---------- */
  function buildToc(toc) {
    const list = $('toc');
    if (!toc || !toc.length) {
      list.innerHTML = `<li class="toc-empty">本册未包含书签目录。<br>可在下方「缩略图」中快速定位，或用右上角检索框搜索正文。</li>`;
      return;
    }
    // 扁平转树（按 level 递增）
    const rootNode = { children: [] };
    const stack = [{ level: 0, node: rootNode }];
    toc.forEach(([level, title, p]) => {
      const node = { level, title, page: p, children: [] };
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack[stack.length - 1].node.children.push(node);
      stack.push({ level, node });
    });

    const ul = document.createElement('ul');
    ul.className = 'toc-list';
    const frag = document.createDocumentFragment();

    (function walk(nodes, parent, depth) {
      nodes.forEach(nd => {
        const li = document.createElement('li');
        li.className = 'toc-item l' + Math.min(nd.level, 4);
        li.dataset.page = nd.page;
        if (depth >= 2) li.classList.add('collapsed');

        const a = document.createElement('a');
        a.innerHTML = `<span class="t">${esc(nd.title)}</span><span class="n">${nd.page > 0 ? nd.page : ''}</span>`;
        a.onclick = e => { e.preventDefault(); if (nd.page > 0) goPage(nd.page); };
        li.appendChild(a);

        if (nd.children.length) {
          const caret = document.createElement('button');
          caret.className = 'back-btn';
          caret.style.cssText = 'width:22px;height:22px;border:0;background:transparent;position:absolute;left:0;margin-top:5px';
          caret.innerHTML = '<svg class="ico" viewBox="0 0 24 24" style="width:13px;height:13px"><path d="m6 9 6 6 6-6"/></svg>';
          caret.onclick = ev => { ev.stopPropagation(); li.classList.toggle('collapsed'); };
          li.style.position = 'relative';
          if (depth > 0) caret.style.display = 'none';
          li.appendChild(caret);
          const sub = document.createElement('ul');
          sub.className = 'toc-list';
          walk(nd.children, sub, depth + 1);
          li.appendChild(sub);
        }
        parent.appendChild(li);
      });
    })(rootNode.children, ul, 0);

    frag.appendChild(ul);
    list.innerHTML = '';
    list.appendChild(frag);
  }

  let activeLi = null;
  function markToc(n) {
    const items = $('toc').querySelectorAll('.toc-item');
    let best = null;
    items.forEach(li => {
      const p = parseInt(li.dataset.page, 10);
      if (p > 0 && p <= n) {
        if (!best || p >= parseInt(best.dataset.page, 10)) best = li;
      }
    });
    if (activeLi === best) return;
    if (activeLi) activeLi.classList.remove('active');
    activeLi = best;
    if (best) {
      best.classList.add('active');
      let par = best.parentElement;
      while (par && par.id !== 'tabToc') {
        if (par.classList && par.classList.contains('toc-item')) par.classList.remove('collapsed');
        par = par.parentElement;
      }
      best.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- 缩略图 ---------- */
  function buildThumbs() {
    const box = $('thumbs');
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= meta.pages; i++) {
      const d = document.createElement('div');
      d.className = 'thumb';
      d.dataset.p = i;
      d.innerHTML = `<img loading="lazy" decoding="async" src="${pageSrc(i)}" alt="第${i}页"><span>${i}</span>`;
      d.onclick = () => goPage(i);
      frag.appendChild(d);
    }
    box.innerHTML = '';
    box.appendChild(frag);
  }
  let curThumb = null;
  function markThumb(n) {
    if (curThumb) curThumb.classList.remove('cur');
    curThumb = $('thumbs').querySelector(`.thumb[data-p="${n}"]`);
    if (curThumb) {
      curThumb.classList.add('cur');
      if (!$('tabThumbs').hidden) curThumb.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ---------- 检索 ---------- */
  async function ensureText() {
    if (textData) return textData;
    if (textLoading) return null;
    textLoading = true;
    try {
      const r = await fetch(`data/books/${id}/text.json`);
      textData = await r.json();
    } catch (e) { textData = { pages: [] }; }
    textLoading = false;
    return textData;
  }

  let searchTimer;
  function doSearch(kw) {
    const body = $('spBody');
    kw = kw.trim();
    if (!kw) { body.innerHTML = '<p class="sp-hint">在本书正文中检索关键词，点击结果直接跳转到对应书页。</p>'; return; }
    if (!textData) { body.innerHTML = '<p class="sp-hint">正在建立索引…</p>'; return; }
    const hits = [];
    const lower = kw.toLowerCase();
    textData.pages.forEach((t, i) => {
      if (!t) return;
      const idx = t.toLowerCase().indexOf(lower);
      if (idx >= 0) {
        hits.push({ p: i + 1, s: snippet(t, idx, kw.length) });
      }
    });
    if (!hits.length) {
      body.innerHTML = `<p class="sp-hint">未找到「${esc(kw)}」。可尝试更短的关键词。</p>`;
      return;
    }
    body.innerHTML = `<p class="sp-hint" style="padding:4px 6px 10px">共 ${hits.length} 页命中</p>` + hits.slice(0, 300).map(h =>
      `<button class="hit" data-p="${h.p}"><div class="hp">第 ${h.p} 页</div><div class="ht">${h.s}</div></button>`
    ).join('');
    body.querySelectorAll('.hit').forEach(b => {
      b.onclick = () => { goPage(b.dataset.p); closeSearch(); };
    });
  }

  function snippet(t, idx, len) {
    const a = Math.max(0, idx - 42), b = Math.min(t.length, idx + len + 62);
    const raw = (a > 0 ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '');
    const safe = esc(raw);
    const kw = esc(t.slice(idx, idx + len));
    return safe.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), m => `<mark>${m}</mark>`);
  }

  function openSearch() {
    $('searchPanel').classList.add('open');
    $('scrim').classList.add('show');
    $('spInput').focus();
    ensureText().then(() => { if ($('spInput').value.trim()) doSearch($('spInput').value); });
  }
  function closeSearch() {
    $('searchPanel').classList.remove('open');
    if (!$('gallery').classList.contains('open')) $('scrim').classList.remove('show');
  }

  /* ---------- 侧栏 / 面板 ---------- */
  function toggleSide(force) {
    if (window.innerWidth <= 860) {
      const open = force !== undefined ? force : !$('side').classList.contains('open');
      $('side').classList.toggle('open', open);
      $('scrim').classList.toggle('show', open);
    } else {
      readerEl.classList.toggle('no-side', force === undefined ? undefined : !force);
      applyZoom();
    }
  }
  $('sideBtn').onclick = () => toggleSide();
  $('scrim').onclick = () => {
    $('side').classList.remove('open');
    $('scrim').classList.remove('show');
    closeSearch();
  };

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      const isToc = t.dataset.tab === 'toc';
      $('tabToc').hidden = !isToc;
      $('tabThumbs').hidden = isToc;
      if (!isToc) markThumb(page);
    };
  });

  /* ---------- 输入控件 ---------- */
  $('prevBtn').onclick = $('edgePrev').onclick = () => goPage(page - 1);
  $('nextBtn').onclick = $('edgeNext').onclick = () => goPage(page + 1);
  $('edgePrev').disabled = true;
  let sliderTimer;
  $('slider').oninput = e => {
    const n = +e.target.value;
    e.target.style.setProperty('--pct', ((n - 1) / Math.max(1, meta.pages - 1) * 100) + '%');
    $('pInput').value = n;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => goPage(n), 90);
  };
  $('pInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { goPage(e.target.value, { keepScroll: false }); e.target.blur(); }
  });
  $('pInput').addEventListener('blur', e => { e.target.value = page; });

  $('zIn').onclick = () => zoomStep(1);
  $('zOut').onclick = () => zoomStep(-1);
  $('zFit').onclick = () => { zoom = zoom === 'fit' ? 'page' : 'fit'; applyZoom(); };
  $('fullBtn').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen &&
      document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };
  $('searchBtn').onclick = () => openSearch();
  $('spClose').onclick = closeSearch;
  $('spInput').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value), 220); };

  view.addEventListener('dblclick', () => { zoom = (zoom === 'fit') ? 150 : 'fit'; applyZoom(); });

  view.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') { if (e.key === 'Escape') e.target.blur(); return; }
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': e.preventDefault(); goPage(page + 1); break;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); goPage(page - 1); break;
      case 'PageDown': e.preventDefault(); goPage(page + 5); break;
      case 'PageUp': e.preventDefault(); goPage(page - 5); break;
      case 'Home': goPage(1); break;
      case 'End': goPage(meta ? meta.pages : 1); break;
      case '+': case '=': zoomStep(1); break;
      case '-': zoomStep(-1); break;
      case 'f': case 'F': $('fullBtn').click(); break;
      case 's': case 'S': openSearch(); break;
      case 'm': case 'M': toggleSide(); break;
      case 'Escape': closeSearch(); $('side').classList.remove('open'); $('scrim').classList.remove('show'); break;
    }
  });

  /* ---------- 触摸滑动 ---------- */
  let tx = 0, ty = 0;
  view.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 62 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      goPage(page + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  /* ---------- 启动 ---------- */
  fetch(`data/books/${id}/meta.json`).then(r => r.json()).then(m => {
    meta = m;
    S.width = m.w; S.height = m.h; S.ratio = m.w / m.h;

    document.title = `${m.title} ${m.edition} · 在线阅读`;
    $('bTitle').textContent = `${m.title}（${m.edition}）`;
    $('bSub').textContent = `${m.pages} 页 · ${m.category}`;
    $('tbTitle').textContent = m.title;
    $('pTotal').textContent = m.pages;
    $('slider').max = m.pages;

    buildToc(m.toc);
    buildThumbs();
    if (window.innerWidth <= 860) $('side').classList.remove('open');

    const last = parseInt(localStorage.getItem('read:' + id) || '0', 10);
    const fromUrl = parseInt(params.get('p') || '0', 10);
    const start = fromUrl > 0 ? fromUrl : 1;
    applyZoom();
    goPage(start, { silent: false });
    applyZoom();
    if (!fromUrl && last > 1 && last <= m.pages) {
      toast(`上次读到第 ${last} 页`, '继续阅读', () => goPage(last), 6500);
    }
  }).catch(() => {
    $('bTitle').textContent = '教材不存在';
    $('tbTitle').textContent = '未找到该教材';
    toast('未找到该教材，请返回书库重新选择', '返回书库', () => location.href = 'index.html');
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(applyZoom, 120); });
})();
