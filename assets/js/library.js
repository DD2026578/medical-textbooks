/* 书库首页 */
(function () {
  const THEME_KEY = 'medlib.theme';
  const root = document.documentElement;

  function applyTheme(t) {
    root.dataset.theme = t;
  }
  applyTheme(localStorage.getItem(THEME_KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  document.getElementById('themeBtn').addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const filters = document.getElementById('filters');
  const q = document.getElementById('q');
  let books = [];
  let cat = '全部';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function progress(id) {
    const p = parseInt(localStorage.getItem('read:' + id) || '0', 10);
    return p > 1 ? p : 0;
  }

  function render() {
    const kw = q.value.trim().toLowerCase();
    const list = books.filter(b =>
      (cat === '全部' || b.category === cat) &&
      (!kw || (b.title + b.edition + b.category + (b.pinyin || '')).toLowerCase().includes(kw))
    );
    grid.innerHTML = list.map((b, i) => {
      const p = progress(b.id);
      return `<a class="card" href="reader.html?id=${b.id}" style="animation-delay:${Math.min(i * 35, 420)}ms">
        <div class="cover-wrap">
          <img src="${b.cover}" alt="${esc(b.title)}封面" loading="${i < 8 ? 'eager' : 'lazy'}" decoding="async">
          <span class="badge">${esc(b.edition)}</span>
          ${p ? `<span class="resume">读到 P.${p}</span>` : ''}
        </div>
        <h3>${esc(b.title)}</h3>
        <div class="sub"><span>${esc(b.category)}</span><i>·</i><span>${b.pages} 页</span></div>
      </a>`;
    }).join('');
    empty.hidden = list.length > 0;
    document.getElementById('cnt').textContent = books.length;
  }

  fetch('data/library.json').then(r => r.json()).then(data => {
    books = data.books;
    const cats = ['全部', ...Array.from(new Set(books.map(b => b.category)))];
    filters.innerHTML = cats.map(c =>
      `<button class="chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    filters.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      cat = btn.dataset.c;
      filters.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === btn));
      render();
    });
    const totalPages = books.reduce((s, b) => s + b.pages, 0);
    document.getElementById('libSub').textContent =
      `${books.length} 册教材 · ${totalPages.toLocaleString('zh-CN')} 页 · 第 9/10 版`;
    document.title = `人卫医学教材 · 在线阅读（${books.length} 册）`;
    render();
  }).catch(() => {
    document.getElementById('libSub').textContent = '书库加载失败，请刷新重试';
  });

  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
})();
