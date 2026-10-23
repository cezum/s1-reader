/* S-1 阅读器 · 主逻辑
 * 设计要点：
 * 1) 术语库独立于文档存在，跨 PDF 复用；批注按文档归属。
 * 2) 页面文本层用 pdf.js textContent 自建，术语命中用 span 内正则 + 相邻 span 拼接，
 *    这样"已存过的词"能在正文里自动标黄，扫过去就知道哪些是自己记过的。
 * 3) 批注锚定用"归一化字符索引"，避开空格/换行差异，重绘文本层后仍能复原位置。
 */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var LS_KEY = 's1reader.v1';
  var MIN_ZOOM = 0.5, MAX_ZOOM = 3.0;
  var PDFJS_VER = '3.11.174';
  var LOCAL_ENGINE = 'libs/';
  var CDN_LIST = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/build/'
  ];

  /* ================= 状态 ================= */
  var S = {
    pdf: null,
    docName: '',
    workerReady: false,
    scale: 1.0,
    baseW: 612,
    baseH: 792,
    pageEls: [],
    db: null,
    termIndex: [],
    editingTermId: null,
    pendingSel: null,
    io: null,
    q: '',
    noteQ: '',
    outline: null,
    outlineFlat: [],
    outlineQ: '',
    outlineSource: null,
    tocProbe: undefined
  };

  /* ================= 工具 ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid(p) { return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function nowISO() { return new Date().toISOString(); }
  function dayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ================= 数据层 ================= */
  function seedDB() {
    var db = { version: 1, glossary: [], annotations: [], docs: [], settings: { scale: 1 } };
    var seed = window.S1_SEED_TERMS || [];
    seed.forEach(function (t) {
      db.glossary.push({
        id: uid('t'),
        term: t.term,
        zh: t.zh || '',
        def: t.def || '',
        note: t.note || '',
        related: t.related || '',
        section: t.section || '',
        context: '',
        doc: '',
        page: 0,
        seed: true,
        createdAt: nowISO(),
        updatedAt: nowISO()
      });
    });
    return db;
  }

  function loadDB() {
    var db = null;
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) db = JSON.parse(raw);
    } catch (e) { db = null; }

    if (!db || !Array.isArray(db.glossary)) {
      db = seedDB();
      saveDB(db);
      return db;
    }
    if (!Array.isArray(db.annotations)) db.annotations = [];
    if (!Array.isArray(db.docs)) db.docs = [];
    if (!db.settings) db.settings = { scale: 1 };
    if (!db.glossary.length) {
      var s = seedDB();
      db.glossary = s.glossary;
      saveDB(db);
    }
    return db;
  }

  function saveDB(db) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db || S.db));
      return true;
    } catch (e) {
      toast('本地存储写入失败，可能是空间已满');
      return false;
    }
  }

  function docRecord(name) {
    var d = S.db.docs.filter(function (x) { return x.name === name; })[0];
    if (!d) {
      d = { name: name, openedAt: nowISO(), lastPage: 1 };
      S.db.docs.push(d);
    }
    d.openedAt = nowISO();
    return d;
  }

  /* ================= 术语索引 ================= */
  function termToRegex(term) {
    var escRe = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var parts = String(term).trim().split(/\s+/).map(escRe);
    // 词内空格允许被换行/多空格打断，连字符可缺省
    var body = parts.join('[\\s\\-\\u2010\\u2011]+');
    return new RegExp('\\b' + body + '\\b', 'gi');
  }

  function rebuildTermIndex() {
    S.termIndex = S.db.glossary.filter(function (t) {
      return t.term && t.term.trim().length >= 2;
    }).map(function (t) {
      var tip = t.term + (t.zh ? ' — ' + t.zh : '');
      if (t.def) tip += '\n' + t.def;
      return {
        id: t.id,
        term: t.term,
        first: t.term.toLowerCase().split(/\s+/)[0],
        regex: termToRegex(t.term),
        tip: tip
      };
    });
  }

  /* ================= PDF 引擎 ================= */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('load fail ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function setupPdfJs() {
    if (!window.pdfjsLib) {
      // 本地引擎缺失时才退到 CDN
      for (var i = 0; i < CDN_LIST.length; i++) {
        try {
          await loadScript(CDN_LIST[i] + 'pdf.min.js');
          if (window.pdfjsLib) break;
        } catch (e) { /* 换下一个源 */ }
      }
    }
    if (!window.pdfjsLib) {
      throw new Error('PDF 引擎加载失败：请确认 libs 文件夹与 index.html 在同一目录');
    }
    if (S.workerReady) return;

    // 本地 worker：http 环境下正常启动独立线程。
    // file:// 下浏览器禁止从本地路径创建 Worker，pdf.js 会自动降级到
    // 主线程 fake worker —— 功能一致，只是超大文件解析稍慢。
    pdfjsLib.GlobalWorkerOptions.workerSrc = LOCAL_ENGINE + 'pdf.worker.min.js';
    S.workerReady = true;
  }

  /* ================= 文本层 ================= */
  function buildTextLayer(layerEl, items, viewport) {
    layerEl.textContent = '';
    var util = pdfjsLib.Util;
    var scale = viewport.scale;
    var frag = document.createDocumentFragment();
    var spans = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.str) continue;
      var tx = util.transform(viewport.transform, it.transform);
      var fh = Math.hypot(tx[2], tx[3]);
      if (!fh || fh < 0.5) continue;

      var sp = document.createElement('span');
      sp.textContent = it.str;
      sp.style.left = tx[4].toFixed(2) + 'px';
      sp.style.top = (tx[5] - fh * 0.8).toFixed(2) + 'px';
      sp.style.fontSize = fh.toFixed(2) + 'px';
      sp.style.fontFamily = 'sans-serif';
      sp.dataset.tw = (it.width * scale).toFixed(2);
      frag.appendChild(sp);
    }
    layerEl.appendChild(frag);

    spans = Array.prototype.slice.call(layerEl.children);
    for (var k = 0; k < spans.length; k++) {
      var s = spans[k];
      var need = parseFloat(s.dataset.tw);
      delete s.dataset.tw;
      var has = s.getBoundingClientRect().width;
      if (need > 0 && has > 0 && Math.abs(need - has) > 0.6) {
        s.style.transform = 'scaleX(' + (need / has).toFixed(4) + ')';
      }
    }
    return spans;
  }

  // 归一化字符索引：输入是"纯文本数组"（标记前抓取的快照），
  // 避免 mark 拆分 DOM 后 textContent 失真。
  function buildIndex(plainArr) {
    var chars = [];
    var text = '';
    for (var si = 0; si < plainArr.length; si++) {
      var t = plainArr[si];
      for (var i = 0; i < t.length; i++) {
        var ch = t[i];
        if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\u00a0') continue;
        chars.push({ si: si, oi: i });
        text += ch;
      }
    }
    return { text: text, chars: chars };
  }

  function normText(s) {
    return String(s || '').replace(/[\s\u00a0]+/g, '');
  }

  function paintRangeByIndex(spans, idx, from, to, cls, dataKey, dataVal) {
    if (from < 0 || to <= from || to > idx.chars.length) return false;
    var first = idx.chars[from], last = idx.chars[to - 1];
    if (!first || !last) return false;
    for (var si = first.si; si <= last.si; si++) {
      var sp = spans[si];
      if (!sp) continue;
      sp.classList.add(cls);
      if (dataKey) sp.setAttribute(dataKey, dataVal);
      if (!sp.title) sp.title = '这段你写过批注';
    }
    return true;
  }

  /* ================= 标记 ================= */
  function markTerms(spans, idx) {
    if (!S.termIndex.length) return;
    var used = {};

    // 1) 单个 span 内精确命中 → 用 mark 包裹，可点击
    for (var si = 0; si < spans.length; si++) {
      var sp = spans[si];
      var raw = sp.textContent;
      if (!raw || raw.length < 2) continue;
      var lower = raw.toLowerCase();
      var hits = [];

      for (var ti = 0; ti < S.termIndex.length; ti++) {
        var t = S.termIndex[ti];
        if (t.first && lower.indexOf(t.first) === -1) continue;
        t.regex.lastIndex = 0;
        var m;
        var guard = 0;
        while ((m = t.regex.exec(raw)) !== null && guard++ < 50) {
          hits.push({ start: m.index, end: m.index + m[0].length, id: t.id, tip: t.tip });
          if (m.index === t.regex.lastIndex) t.regex.lastIndex++;
        }
      }
      if (!hits.length) continue;

      hits.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
      var keep = [], lastEnd = -1;
      for (var h = 0; h < hits.length; h++) {
        if (hits[h].start >= lastEnd) { keep.push(hits[h]); lastEnd = hits[h].end; }
      }
      keep.sort(function (a, b) { return b.start - a.start; });

      var textNode = sp.firstChild;
      if (!textNode || textNode.nodeType !== 3) continue;

      for (var q = 0; q < keep.length; q++) {
        var hit = keep[q];
        var mid = textNode.splitText(hit.start);
        mid.splitText(hit.end - hit.start);
        var mk = document.createElement('mark');
        mk.className = 'term-hit';
        mk.dataset.termId = hit.id;
        mk.title = hit.tip;
        mid.parentNode.replaceChild(mk, mid);
        mk.appendChild(mid);
        used[hit.id] = true;
      }
    }

    // 2) 被 pdf.js 切断的相邻 span：拼接后命中 → 整块淡标
    for (var a = 0; a < spans.length - 1; a++) {
      var s1 = spans[a], s2 = spans[a + 1];
      if (!s1.textContent || !s2.textContent) continue;
      if (s1.classList.contains('term-soft') || s2.classList.contains('term-soft')) continue;
      var joined = s1.textContent + s2.textContent;
      if (joined.length > 80) continue;
      var r1 = s1.getBoundingClientRect(), r2 = s2.getBoundingClientRect();
      if (Math.abs(r1.top - r2.top) > 5) continue;
      if (r1.right - r2.left > 2) continue; // 有间隙说明是两个独立词

      var jl = joined.toLowerCase();
      for (var tj = 0; tj < S.termIndex.length; tj++) {
        var tt = S.termIndex[tj];
        if (!tt.first || jl.indexOf(tt.first) === -1) continue;
        var body = tt.term.toLowerCase().replace(/\s+/g, '\\s*');
        var re = new RegExp('\\b' + body + '\\b', 'i');
        if (re.test(joined)) {
          s1.classList.add('term-soft'); s1.title = tt.tip;
          s2.classList.add('term-soft'); s2.title = tt.tip;
          s1.dataset.termId = tt.id; s2.dataset.termId = tt.id;
          used[tt.id] = true;
          break;
        }
      }
    }
  }

  function markAnnotations(spans, idx, pageNo) {
    var list = S.db.annotations.filter(function (a) {
      return a.doc === S.docName && a.page === pageNo;
    });
    for (var i = 0; i < list.length; i++) {
      var an = list[i];
      var nt = normText(an.text);
      if (!nt || nt.length < 2) continue;

      var from = -1;
      if (typeof an.charStart === 'number' && an.charStart >= 0 &&
          idx.text.substr(an.charStart, nt.length) === nt) {
        from = an.charStart;
      } else {
        from = idx.text.indexOf(nt);
      }
      if (from === -1) continue;
      paintRangeByIndex(spans, idx, from, from + nt.length, 'ann-soft', 'data-ann-id', an.id);
    }
  }

  function refreshPage(pageIdx) {
    var pe = S.pageEls[pageIdx];
    if (!pe || !pe.items || !pe.viewport) return;
    var spans = buildTextLayer(pe.layer, pe.items, pe.viewport);
    pe.spans = spans;
    pe.plain = spans.map(function (s) { return s.textContent; });
    pe.idx = buildIndex(pe.plain);
    markTerms(spans, pe.idx);
    markAnnotations(spans, pe.idx, pageIdx + 1);
  }

  function refreshAllRendered() {
    for (var i = 0; i < S.pageEls.length; i++) {
      if (S.pageEls[i].rendered) refreshPage(i);
    }
  }

  /* ================= 大纲 / 目录 ================= */
  async function loadOutline() {
    S.outline = null;
    S.outlineFlat = [];
    S.outlineSource = null;
    S.tocProbe = undefined;
    try {
      var o = await S.pdf.getOutline();
      if (o && o.length) {
        S.outline = o;
        S.outlineSource = 'bookmark';
        flattenOutline(o, 0, S.outlineFlat);
      }
    } catch (e) { console.warn('读取书签失败', e); }
    renderOutline();
    if (S.outlineFlat.length) resolveAllDests();
  }

  // 没有内置书签时，找一份"自带可点击目录"的页面：
  // 扫描前若干页，取链接注释最多的那页（S-1 通常有 20 个以上的目录条目链接）
  async function detectTocPage() {
    if (!S.pdf || S.tocProbe === 'running' || S.tocProbe) return;
    S.tocProbe = 'running';
    renderOutline();
    try {
      var lim = Math.min(S.pdf.numPages, 40);
      var best = 0, bestPage = 0;
      for (var i = 0; i < lim; i++) {
        var page = await S.pdf.getPage(i + 1);
        var anns = await page.getAnnotations({ intent: 'display' });
        var n = 0;
        for (var k = 0; k < anns.length; k++) {
          if (anns[k].subtype === 'Link') n++;
        }
        if (n > best) { best = n; bestPage = i + 1; }
        if (n >= 8) break; // 已经找到明显的目录页，不必继续
      }
      S.tocProbe = best >= 4 ? bestPage : -1;
    } catch (e) {
      S.tocProbe = -1;
    }
    renderOutline();
    if (typeof S.tocProbe === 'number' && S.tocProbe > 0) {
      buildOutlineFromTocPage(S.tocProbe);
    }
  }

  // 把"自带目录页"上的链接读懂：每个链接矩形覆盖的文字就是章节名
  async function buildOutlineFromTocPage(pageNo) {
    try {
      var page = await S.pdf.getPage(pageNo);
      var anns = await page.getAnnotations({ intent: 'display' });
      var tc = await page.getTextContent();
      var items = tc.items.filter(function (i) { return i.str && i.str.trim(); });
      var links = anns.filter(function (a) { return a.subtype === 'Link' && a.dest; });
      if (!links.length) return;

      var entries = [];
      for (var li = 0; li < links.length; li++) {
        var r = links[li].rect;
        var inRect = items.filter(function (it) {
          var x = it.transform[4], y = it.transform[5];
          return x >= r[0] - 4 && x <= r[2] + 4 && y >= r[1] - 4 && y <= r[3] + 4;
        });
        if (!inRect.length) continue;

        // 链接矩形常比一行略高，会蹭到相邻行：只保留最靠近矩形中心的那一行
        var cy = (r[1] + r[3]) / 2;
        var rows = {};
        inRect.forEach(function (it) {
          var key = Math.round(it.transform[5] / 3) * 3;
          (rows[key] = rows[key] || []).push(it);
        });
        var bestKey = null, bestD = Infinity;
        Object.keys(rows).forEach(function (k) {
          var d = Math.abs(parseFloat(k) - cy);
          if (d < bestD) { bestD = d; bestKey = k; }
        });
        var row = rows[bestKey] || [];
        row.sort(function (p, q) { return p.transform[4] - q.transform[4]; });

        var title = row.map(function (it) { return it.str; }).join(' ')
          .replace(/\s+/g, ' ')
          .replace(/\s*\d{1,4}\s*$/, '')   // 去掉行尾的目录页码
          .trim();
        if (title.length < 3) continue;
        if (/^table\s*of\s*contents$/i.test(title)) continue; // 页眉的返回链接
        entries.push({ title: title, dest: links[li].dest });
      }
      if (entries.length < 3) return;

      // 同一章节可能被拆成多个链接，按标题去重
      var seen = {};
      var uniq = [];
      entries.forEach(function (e) {
        var k = e.title.toLowerCase().replace(/\s+/g, '');
        if (seen[k]) return;
        seen[k] = 1;
        uniq.push(e);
      });

      S.outlineFlat = uniq.map(function (e) {
        return { depth: 0, title: e.title, dest: e.dest, page: null };
      });
      S.outlineSource = 'tocpage';
      renderOutline();
      resolveAllDests();
    } catch (e) {
      console.warn('解析目录页失败', e);
    }
  }

  function flattenOutline(items, depth, out) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      out.push({
        depth: Math.min(depth, 3),
        title: String(it.title || '(无标题)').replace(/\s+/g, ' ').trim(),
        dest: it.dest || null,
        page: null
      });
      if (it.items && it.items.length) flattenOutline(it.items, depth + 1, out);
    }
  }

  // dest 解析成页码：可能是字符串（命名目标）或数组（[ref, ...]）
  async function resolveDest(dest) {
    if (!dest) return null;
    var d = dest;
    try {
      if (typeof d === 'string') d = await S.pdf.getDestination(d);
    } catch (e) { return null; }
    if (!Array.isArray(d) || !d.length) return null;
    var ref = d[0];
    try {
      if (typeof ref === 'number') return ref + 1;
      var idx = await S.pdf.getPageIndex(ref);
      return idx + 1;
    } catch (e) {
      // 部分 PDF 的 dest[0] 是 {num,gen}，个别版本需要显式转换
      try {
        var idx2 = d[0] && typeof d[0] === 'object' ? d[0] : null;
        if (idx2) return (await S.pdf.getPageIndex(idx2)) + 1;
      } catch (e2) { /* 放弃 */ }
      return null;
    }
  }

  async function resolveAllDests() {
    await Promise.all(S.outlineFlat.map(function (it) {
      if (it.page) return it.page;
      return resolveDest(it.dest).then(function (p) {
        it.page = p;
        return p;
      }).catch(function () { return null; });
    }));
    renderOutline();
  }

  function renderOutline() {
    var box = $('#outlineList');
    if (!box) return;
    if (!S.pdf) {
      box.innerHTML = '<div class="empty"><span class="big">·</span>先打开一份 PDF</div>';
      return;
    }
    if (!S.outlineFlat.length) {
      if (S.tocProbe === 'running') {
        box.innerHTML = '<div class="empty">正在查找目录页…</div>';
        return;
      }
      if (typeof S.tocProbe === 'number' && S.tocProbe > 0) {
        box.innerHTML =
          '<div class="empty" style="padding-top:26px">' +
          '<div style="font-size:12.5px;color:var(--ink2);line-height:2">' +
          '这份文件没有内置书签，<br>但第 ' + S.tocProbe + ' 页是自带的可点击目录。</div>' +
          '<button class="btn primary" id="btnGoToc" style="margin-top:14px">跳到目录页 P.' + S.tocProbe + '</button>' +
          '<div style="margin-top:20px;font-size:11.5px;color:var(--ink3);line-height:1.95">' +
          '正文每页顶部的「Table of Contents」<br>也可以直接点，随时回到目录。</div>' +
          '</div>';
        return;
      }
      box.innerHTML = '<div class="empty"><span class="big">·</span>这份 PDF 没有内置书签，<br>也没有找到可点击的目录页<br><br>' +
        '可以用上面的页码框直接跳转。</div>';
      return;
    }
    var q = S.outlineQ.trim().toLowerCase();
    var html = '';
    if (S.outlineSource === 'tocpage') {
      html += '<div class="out-hint">识别自第 ' + S.tocProbe + ' 页的目录</div>';
    }
    var shown = 0;
    for (var i = 0; i < S.outlineFlat.length; i++) {
      var it = S.outlineFlat[i];
      if (q && it.title.toLowerCase().indexOf(q) === -1) continue;
      var cls = 'out-item d' + it.depth + (it.depth === 0 ? ' top' : '');
      html += '<div class="' + cls + '" data-i="' + i + '" title="' + esc(it.title) + '">' +
        '<span class="t">' + esc(it.title) + '</span>' +
        (it.page ? '<span class="pg">' + it.page + '</span>' : '') +
        '</div>';
      shown++;
    }
    box.innerHTML = shown ? html : '<div class="empty"><span class="big">∅</span>没有匹配的章节</div>';
  }

  function markOutlineActive(idx) {
    $$('#outlineList .out-item').forEach(function (el) {
      el.classList.toggle('active', parseInt(el.dataset.i, 10) === idx);
    });
  }

  // 滚动时让目录跟着高亮当前章节
  function syncOutlineActive(page) {
    if (!S.outlineFlat.length) return;
    if ($('#paneOutline').classList.contains('hidden')) return;
    var best = -1;
    for (var i = 0; i < S.outlineFlat.length; i++) {
      var p = S.outlineFlat[i].page;
      if (p && p <= page) best = i;
    }
    if (best >= 0) markOutlineActive(best);
  }

  async function goDest(dest) {
    var p = await resolveDest(dest);
    if (!p) { toast('这个位置没有有效的页码信息'); return; }
    scrollToPage(p);
    renderPage(p - 1);
  }

  function switchTab(name) {
    $$('.tabs button').forEach(function (x) {
      x.classList.toggle('active', x.dataset.tab === name);
    });
    $('#paneGlossary').classList.toggle('hidden', name !== 'glossary');
    $('#paneOutline').classList.toggle('hidden', name !== 'outline');
    $('#paneNotes').classList.toggle('hidden', name !== 'notes');
    if (name === 'outline' && S.pdf && !S.outlineFlat.length && !S.tocProbe) {
      detectTocPage();
    }
  }

  /* ================= 页面内链接 ================= */
  function renderPageLinks(pe, anns, viewport) {
    var old = pe.el.querySelector('.linkLayer');
    if (old) old.parentNode.removeChild(old);

    var links = (anns || []).filter(function (a) {
      return a.subtype === 'Link' && a.rect && (a.url || a.dest);
    });
    if (!links.length) return;

    var layer = document.createElement('div');
    layer.className = 'linkLayer';

    links.forEach(function (a) {
      var r;
      try { r = viewport.convertToViewportRectangle(a.rect); } catch (e) { return; }
      var x1 = Math.min(r[0], r[2]), x2 = Math.max(r[0], r[2]);
      var y1 = Math.min(r[1], r[3]), y2 = Math.max(r[1], r[3]);
      if (x2 - x1 < 2 || y2 - y1 < 2) return;

      var d = document.createElement('div');
      d.className = 'pdf-link' + (a.url ? ' ext' : '');
      d.style.left = x1 + 'px';
      d.style.top = y1 + 'px';
      d.style.width = (x2 - x1) + 'px';
      d.style.height = (y2 - y1) + 'px';
      d.title = a.url ? ('外部链接：' + a.url) : '跳转到文档内位置';
      d.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (a.url) {
          window.open(a.url, '_blank', 'noopener');
        } else if (a.dest) {
          goDest(a.dest);
        }
      });
      layer.appendChild(d);
    });

    if (layer.children.length) pe.el.appendChild(layer);
  }

  /* ================= 页面构建与渲染 ================= */
  function buildPages() {
    var pagesEl = $('#pages');
    pagesEl.innerHTML = '';
    S.pageEls = [];
    if (S.io) { S.io.disconnect(); S.io = null; }

    var w = S.baseW * S.scale, h = S.baseH * S.scale;
    for (var i = 1; i <= S.pdf.numPages; i++) {
      var el = document.createElement('div');
      el.className = 'page-wrap';
      el.dataset.page = i;
      el.style.width = w + 'px';
      el.style.height = h + 'px';

      var lab = document.createElement('div');
      lab.className = 'page-label';
      lab.textContent = i;

      var canvas = document.createElement('canvas');
      var layer = document.createElement('div');
      layer.className = 'textLayer';
      var ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = i;

      el.appendChild(canvas);
      el.appendChild(layer);
      el.appendChild(ph);
      el.appendChild(lab);
      pagesEl.appendChild(el);

      S.pageEls.push({ el: el, canvas: canvas, layer: layer, ph: ph, rendered: false, rendering: false, items: null, viewport: null, spans: null, idx: null });
    }

    $('#pageTotal').textContent = S.pdf.numPages;
    $('#pageInput').value = '1';
    $('#dropzone').classList.add('hidden');

    S.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var idx = parseInt(en.target.dataset.page, 10) - 1;
        renderPage(idx);
      });
    }, { root: $('#viewer'), rootMargin: '900px 0px' });

    S.pageEls.forEach(function (pe) { S.io.observe(pe.el); });
    renderPage(0);
  }

  async function renderPage(idx) {
    var pe = S.pageEls[idx];
    if (!pe || pe.rendered || pe.rendering) return;
    pe.rendering = true;
    try {
      var page = await S.pdf.getPage(idx + 1);
      var vp = page.getViewport({ scale: S.scale });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var canvas = pe.canvas;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      pe.el.style.width = vp.width + 'px';
      pe.el.style.height = vp.height + 'px';

      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
      }).promise;

      if (pe.ph.parentNode) pe.ph.parentNode.removeChild(pe.ph);

      var tc = await page.getTextContent();
      pe.items = tc.items;
      pe.viewport = vp;
      pe.rendered = true;
      refreshPage(idx);

      // 页内导航链接（S-1 的 Table of Contents、交叉引用）
      try {
        var anns = await page.getAnnotations({ intent: 'display' });
        renderPageLinks(pe, anns, vp);
      } catch (e) { /* 无注释层不影响阅读 */ }
    } catch (e) {
      console.error('render page ' + (idx + 1) + ' failed', e);
    } finally {
      pe.rendering = false;
    }
  }

  function renderVisible() {
    var vrect = $('#viewer').getBoundingClientRect();
    S.pageEls.forEach(function (pe, i) {
      var r = pe.el.getBoundingClientRect();
      if (r.bottom > vrect.top - 900 && r.top < vrect.bottom + 900) renderPage(i);
    });
  }

  /* ================= 文档打开 ================= */
  async function openPdf(file) {
    if (!file) return;
    try {
      toast('正在加载 ' + file.name + ' …');
      await setupPdfJs();

      var buf = await file.arrayBuffer();
      var task = pdfjsLib.getDocument({
        data: buf,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/cmaps/',
        cMapPacked: true,
        enableXfa: false
      });
      S.pdf = await task.promise;
      S.docName = file.name;
      $('#docName').textContent = file.name;

      var p1 = await S.pdf.getPage(1);
      var vp1 = p1.getViewport({ scale: 1 });
      S.baseW = vp1.width;
      S.baseH = vp1.height;

      // 首次打开自动适配阅读宽度（用户手动缩放过就不再干预）
      if (S.db.settings.autoFit !== false) {
        var vw = $('#viewer').clientWidth || 900;
        var fit = Math.max(0.55, Math.min(1.7, (vw - 96) / S.baseW));
        S.scale = fit;
        S.db.settings.scale = fit;
        $('#zoomLabel').textContent = Math.round(fit * 100) + '%';
      }

      docRecord(file.name);
      saveDB();

      await loadOutline();
      buildPages();
      $('#viewer').scrollTop = 0;
      toast('已加载 ' + S.pdf.numPages + ' 页');
    } catch (e) {
      console.error(e);
      toast('打开失败：' + (e && e.message ? e.message : '未知错误'));
    }
  }

  /* ================= 缩放 ================= */
  function setScale(next, anchorPage, manual) {
    next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    if (Math.abs(next - S.scale) < 0.001) return;
    var keep = anchorPage || currentVisiblePage();
    S.scale = next;
    $('#zoomLabel').textContent = Math.round(next * 100) + '%';
    S.db.settings.scale = next;
    if (manual) S.db.settings.autoFit = false;
    saveDB();

    var w = S.baseW * next, h = S.baseH * next;
    S.pageEls.forEach(function (pe) {
      pe.el.style.width = w + 'px';
      pe.el.style.height = h + 'px';
      pe.rendered = false;
      pe.rendering = false;
      pe.items = null;
      pe.viewport = null;
      pe.spans = null;
      pe.idx = null;
      pe.layer.textContent = '';
      var lk = pe.el.querySelector('.linkLayer');
      if (lk) lk.parentNode.removeChild(lk);
      var c = pe.canvas.getContext('2d');
      c.clearRect(0, 0, pe.canvas.width, pe.canvas.height);
      if (!pe.ph.parentNode) pe.el.insertBefore(pe.ph, pe.layer);
    });

    requestAnimationFrame(function () {
      renderVisible();
      scrollToPage(keep);
    });
  }

  function currentVisiblePage() {
    var vrect = $('#viewer').getBoundingClientRect();
    var mid = vrect.top + 80;
    for (var i = 0; i < S.pageEls.length; i++) {
      var r = S.pageEls[i].el.getBoundingClientRect();
      if (r.bottom > mid) return i + 1;
    }
    return 1;
  }

  function scrollToPage(n) {
    n = Math.max(1, Math.min(S.pdf ? S.pdf.numPages : 1, n));
    var pe = S.pageEls[n - 1];
    if (!pe) return;
    var vrect = $('#viewer').getBoundingClientRect();
    var r = pe.el.getBoundingClientRect();
    $('#viewer').scrollTop += (r.top - vrect.top) - 16;
    $('#pageInput').value = n;
    var rec = S.db.docs.filter(function (d) { return d.name === S.docName; })[0];
    if (rec) { rec.lastPage = n; saveDB(); }
    renderPage(n - 1);
  }

  /* ================= 选区 ================= */
  var selTimer = null;
  function onSelectionChange() {
    clearTimeout(selTimer);
    selTimer = setTimeout(handleSelection, 60);
  }

  function handleSelection() {
    var sel = window.getSelection();
    var bar = $('#selBar');
    if (!sel || sel.isCollapsed || !sel.rangeCount) { bar.classList.add('hidden'); return; }

    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    var pageEl = el && el.closest ? el.closest('.page-wrap') : null;
    if (!pageEl) { bar.classList.add('hidden'); return; }

    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) { bar.classList.add('hidden'); return; }

    var pageNo = parseInt(pageEl.dataset.page, 10);
    var pe = S.pageEls[pageNo - 1];
    if (!pe || !pe.idx) { bar.classList.add('hidden'); return; }

    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { bar.classList.add('hidden'); return; }

    // 锚点：选区起点在本页归一化文本中的字符偏移。DOM 重绘后该偏移仍稳定。
    var anchor = -1;
    try {
      var pre = document.createRange();
      pre.selectNodeContents(pe.layer);
      pre.setEnd(range.startContainer, range.startOffset);
      anchor = normText(pre.toString()).length;
    } catch (err) { anchor = -1; }

    var normLen = normText(text).length;

    bar.classList.remove('hidden');
    var bw = bar.offsetWidth || 240;
    var left = Math.min(Math.max(rect.left + rect.width / 2, bw / 2 + 10), window.innerWidth - bw / 2 - 10);
    var above = rect.top > 120;
    bar.style.left = left + 'px';
    bar.style.top = (above ? rect.top - 8 : rect.bottom + 8) + 'px';
    bar.style.transform = above ? 'translate(-50%,-100%)' : 'translate(-50%,0)';

    S.pendingSel = {
      page: pageNo,
      text: text.length > 300 ? text.slice(0, 300) : text,
      charStart: anchor,
      charLen: normLen,
      context: extractContext(pe, anchor, normLen),
      rect: rect
    };
  }

  // 取选中位置前后一段，按 span 原始文本还原（保留原句空格，并向前后各扩一个 span）
  function extractContext(pe, start, len) {
    if (!pe || !pe.idx || !pe.plain || start < 0 || len <= 0) return '';
    var idx = pe.idx;
    var c0 = idx.chars[start];
    var c1 = idx.chars[Math.min(idx.chars.length - 1, start + len - 1)];
    if (!c0 || !c1) return '';

    var siFrom = Math.max(0, c0.si - 1);
    var siTo = Math.min(pe.plain.length - 1, c1.si + 1);
    var joined = pe.plain.slice(siFrom, siTo + 1).join(' ');

    var core;
    if (c0.si === c1.si) {
      core = pe.plain[c0.si].slice(c0.oi, c1.oi + 1);
    } else {
      core = pe.plain[c0.si].slice(c0.oi);
      for (var k = c0.si + 1; k < c1.si; k++) core += ' ' + pe.plain[k];
      core += ' ' + pe.plain[c1.si].slice(0, c1.oi + 1);
    }

    var p = joined.indexOf(core);
    var from = p >= 0 ? Math.max(0, p - 80) : 0;
    var to = p >= 0 ? Math.min(joined.length, p + core.length + 80) : Math.min(joined.length, 220);
    var out = joined.slice(from, to).replace(/\s+/g, ' ').trim();
    return (from > 0 ? '…' : '') + out + (to < joined.length ? '…' : '');
  }

  /* ================= 术语卡片 ================= */
  function termById(id) {
    return S.db.glossary.filter(function (t) { return t.id === id; })[0] || null;
  }

  function openTermModal(term, prefillTerm) {
    S.editingTermId = term ? term.id : null;
    $('#modalTitle').textContent = term ? '编辑术语' : '新建术语';
    $('#fTerm').value = term ? term.term : (prefillTerm || '');
    $('#fZh').value = term ? term.zh : '';
    $('#fSection').value = term ? term.section : '';
    $('#fDef').value = term ? term.def : '';
    $('#fNote').value = term ? term.note : '';
    $('#fRelated').value = term ? term.related : '';

    var src = $('#fSrc');
    if (term && (term.context || term.doc)) {
      src.classList.remove('hidden');
      src.innerHTML = '<span class="qlab">出处</span>' +
        (term.doc ? esc(term.doc) + (term.page ? ' · 第 ' + term.page + ' 页' : '') : '手动录入') +
        (term.context ? '<div class="qtext" style="margin-top:4px">' + esc(term.context) + '</div>' : '');
    } else if (S.pendingSel) {
      src.classList.remove('hidden');
      src.innerHTML = '<span class="qlab">出处</span>' + esc(S.docName) + ' · 第 ' + S.pendingSel.page + ' 页' +
        (S.pendingSel.context ? '<div class="qtext" style="margin-top:4px">' + esc(S.pendingSel.context) + '</div>' : '');
    } else {
      src.classList.add('hidden');
      src.innerHTML = '';
    }

    $('#btnDelTerm').classList.toggle('hidden', !term);
    $('#modalWrap').classList.remove('hidden');
    setTimeout(function () { $('#fTerm').focus(); }, 40);
  }

  function closeTermModal() {
    $('#modalWrap').classList.add('hidden');
    S.editingTermId = null;
  }

  function saveTerm() {
    var term = $('#fTerm').value.trim();
    if (!term) { toast('原词不能为空'); $('#fTerm').focus(); return; }

    var payload = {
      term: term,
      zh: $('#fZh').value.trim(),
      section: $('#fSection').value.trim(),
      def: $('#fDef').value.trim(),
      note: $('#fNote').value.trim(),
      related: $('#fRelated').value.trim(),
      updatedAt: nowISO()
    };

    var existing = S.editingTermId ? termById(S.editingTermId) : null;
    if (existing) {
      Object.keys(payload).forEach(function (k) { existing[k] = payload[k]; });
      toast('已更新');
    } else {
      var dup = S.db.glossary.filter(function (t) {
        return t.term.toLowerCase() === term.toLowerCase();
      })[0];
      if (dup) {
        Object.keys(payload).forEach(function (k) { dup[k] = payload[k]; });
        toast('该词已存在，已合并更新');
      } else {
        var item = {
          id: uid('t'),
          term: payload.term,
          zh: payload.zh,
          section: payload.section,
          def: payload.def,
          note: payload.note,
          related: payload.related,
          context: S.pendingSel ? S.pendingSel.context : '',
          doc: S.pendingSel ? S.docName : '',
          page: S.pendingSel ? S.pendingSel.page : 0,
          seed: false,
          createdAt: nowISO(),
          updatedAt: nowISO()
        };
        S.db.glossary.push(item);
        toast('已加入术语库');
      }
    }

    saveDB();
    rebuildTermIndex();
    renderGlossary();
    refreshAllRendered();
    closeTermModal();
    hideSelBar();
    window.getSelection().removeAllRanges();
    updateCounts();
  }

  function deleteTerm() {
    if (!S.editingTermId) return;
    var t = termById(S.editingTermId);
    if (!t) return;
    if (!confirm('删除术语「' + t.term + '」？')) return;
    S.db.glossary = S.db.glossary.filter(function (x) { return x.id !== S.editingTermId; });
    saveDB();
    rebuildTermIndex();
    renderGlossary();
    refreshAllRendered();
    closeTermModal();
    updateCounts();
    toast('已删除');
  }

  /* ================= 批注 ================= */
  function openNoteModal() {
    if (!S.pendingSel) return;
    $('#noteSrc').innerHTML = '<span class="qlab">' + esc(S.docName) + ' · 第 ' + S.pendingSel.page + ' 页</span>' +
      (S.pendingSel.context ? '<div class="qtext" style="margin-top:4px">' + esc(S.pendingSel.context) + '</div>' : '');
    $('#fNoteText').value = '';
    $('#modalNote').classList.remove('hidden');
    setTimeout(function () { $('#fNoteText').focus(); }, 40);
  }

  function saveNote() {
    if (!S.pendingSel) return;
    var body = $('#fNoteText').value.trim();
    if (!body) { toast('写点什么再保存'); return; }

    S.db.annotations.push({
      id: uid('a'),
      doc: S.docName,
      page: S.pendingSel.page,
      text: S.pendingSel.text,
      context: S.pendingSel.context,
      note: body,
      charStart: S.pendingSel.charStart,
      charLen: S.pendingSel.charLen,
      createdAt: nowISO()
    });
    saveDB();
    refreshPage(S.pendingSel.page - 1);
    renderNotes();
    updateCounts();
    $('#modalNote').classList.add('hidden');
    hideSelBar();
    window.getSelection().removeAllRanges();
    toast('批注已保存');
  }

  function quickHighlight() {
    if (!S.pendingSel) return;
    S.db.annotations.push({
      id: uid('a'),
      doc: S.docName,
      page: S.pendingSel.page,
      text: S.pendingSel.text,
      context: S.pendingSel.context,
      note: '',
      charStart: S.pendingSel.charStart,
      charLen: S.pendingSel.charLen,
      createdAt: nowISO()
    });
    saveDB();
    refreshPage(S.pendingSel.page - 1);
    renderNotes();
    updateCounts();
    hideSelBar();
    window.getSelection().removeAllRanges();
    toast('已高亮');
  }

  function deleteAnnotation(id) {
    if (!confirm('删除这条批注？')) return;
    var an = S.db.annotations.filter(function (a) { return a.id === id; })[0];
    S.db.annotations = S.db.annotations.filter(function (a) { return a.id !== id; });
    saveDB();
    if (an) refreshPage(an.page - 1);
    renderNotes();
    updateCounts();
    toast('已删除');
  }

  /* ================= 侧栏渲染 ================= */
  function hl(str, q) {
    if (!q) return esc(str);
    var i = str.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(str);
    return esc(str.slice(0, i)) + '<mark>' + esc(str.slice(i, i + q.length)) + '</mark>' + esc(str.slice(i + q.length));
  }

  function renderGlossary() {
    var box = $('#glossList');
    var q = S.q.trim();
    var list = S.db.glossary.slice();

    if (q) {
      var lq = q.toLowerCase();
      list = list.filter(function (t) {
        return (t.term + ' ' + (t.zh || '') + ' ' + (t.def || '') + ' ' + (t.note || '') + ' ' + (t.related || '')).toLowerCase().indexOf(lq) !== -1;
      });
    }

    list.sort(function (a, b) { return a.term.toLowerCase().localeCompare(b.term.toLowerCase()); });

    if (!list.length) {
      box.innerHTML = '<div class="empty"><span class="big">∅</span>' +
        (q ? '没有匹配「' + esc(q) + '」的术语' : '术语库还是空的') + '</div>';
      return;
    }

    var html = list.map(function (t) {
      var rel = (t.related || '').split(/[,，;；]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var srcLine = t.doc ? (t.doc + (t.page ? ' · P.' + t.page : '')) : (t.seed ? '预置' : '');
      return '<div class="term-card" data-id="' + t.id + '">' +
        '<div class="t1"><span class="en">' + hl(t.term, q) + '</span>' +
        (t.zh ? '<span class="zh">' + hl(t.zh, q) + '</span>' : '') +
        (t.section ? '<span class="badge">' + esc(t.section) + '</span>' : '') +
        '</div>' +
        (t.def ? '<div class="def">' + hl(t.def, q) + '</div>' : '') +
        '<div class="note-wrap hidden">' +
        (t.note ? '<div class="note">' + hl(t.note, q) + '</div>' : '') +
        (rel.length ? '<div class="rel">' + rel.map(function (r) { return '<span>' + esc(r) + '</span>'; }).join('') + '</div>' : '') +
        (srcLine ? '<div class="meta">' + esc(srcLine) + '</div>' : '') +
        '<div class="acts"><button data-act="go">跳到此页</button><button data-act="edit">编辑</button></div>' +
        '</div>' +
        '</div>';
    }).join('');

    box.innerHTML = html;
  }

  function renderNotes() {
    var box = $('#noteList');
    var q = S.noteQ.trim().toLowerCase();
    var list = S.db.annotations.filter(function (a) { return a.doc === S.docName; });
    if (q) {
      list = list.filter(function (a) {
        return ((a.note || '') + ' ' + (a.text || '')).toLowerCase().indexOf(q) !== -1;
      });
    }
    list.sort(function (a, b) { return a.page - b.page || a.createdAt.localeCompare(b.createdAt); });

    if (!S.docName) {
      box.innerHTML = '<div class="empty"><span class="big">·</span>先打开一份 PDF，批注会按文档归档</div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="empty"><span class="big">·</span>' +
        (q ? '没有匹配的批注' : '这份文档还没有批注<br>选中正文里的一段话即可开始') + '</div>';
      return;
    }

    box.innerHTML = list.map(function (a) {
      return '<div class="note-card" data-id="' + a.id + '" data-page="' + a.page + '">' +
        '<div class="head"><span class="pg">P.' + a.page + '</span>' +
        '<span style="font-size:11px;color:var(--ink3)">' + esc((a.createdAt || '').slice(0, 10)) + '</span>' +
        '<button class="del" data-act="del">删除</button></div>' +
        (a.context ? '<div class="q">' + esc(a.context) + '</div>' : '') +
        (a.note ? '<div class="body">' + hl(a.note, S.noteQ.trim()) + '</div>' : '<div class="body" style="color:var(--ink3)">（仅高亮）</div>') +
        '</div>';
    }).join('');
  }

  function updateCounts() {
    $('#glossCount').textContent = S.db.glossary.length;
    $('#noteCount').textContent = S.docName ? S.db.annotations.filter(function (a) { return a.doc === S.docName; }).length : 0;
  }

  /* ================= 导出 ================= */
  function exportMarkdown() {
    var L = [];
    L.push('# S-1 术语库与批注');
    L.push('');
    L.push('导出时间：' + dayStr());
    L.push('术语 ' + S.db.glossary.length + ' 条 · 批注 ' + S.db.annotations.length + ' 条');
    L.push('');

    L.push('## 术语库');
    L.push('');
    var sorted = S.db.glossary.slice().sort(function (a, b) {
      return a.term.toLowerCase().localeCompare(b.term.toLowerCase());
    });
    var letter = '';
    sorted.forEach(function (t) {
      var f = t.term[0].toUpperCase();
      if (f !== letter) { letter = f; L.push('### ' + letter); L.push(''); }
      L.push('**' + t.term + '**' + (t.zh ? ' — ' + t.zh : ''));
      if (t.def) L.push('> ' + t.def);
      if (t.note) L.push('', '商业含义：' + t.note);
      if (t.related) L.push('', '关联：' + t.related);
      if (t.doc) L.push('', '出处：' + t.doc + (t.page ? ' · P.' + t.page : ''));
      L.push('');
    });

    L.push('## 批注');
    L.push('');
    var byDoc = {};
    S.db.annotations.forEach(function (a) {
      (byDoc[a.doc || '未归档'] = byDoc[a.doc || '未归档'] || []).push(a);
    });
    Object.keys(byDoc).forEach(function (doc) {
      L.push('### ' + doc);
      L.push('');
      byDoc[doc].sort(function (a, b) { return a.page - b.page; }).forEach(function (a) {
        L.push('- **P.' + a.page + '**' + (a.text ? ' 「' + a.text + '」' : ''));
        if (a.note) L.push('  ' + a.note.replace(/\n/g, '\n  '));
        L.push('');
      });
    });

    var blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'S1-术语与批注-' + dayStr() + '.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出 Markdown');
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify(S.db, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'S1阅读器-备份-' + dayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
    toast('已导出备份');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.glossary)) throw new Error('格式不对');
        var added = 0;
        data.glossary.forEach(function (t) {
          if (!t.term) return;
          var dup = S.db.glossary.filter(function (x) {
            return x.term.toLowerCase() === String(t.term).toLowerCase();
          })[0];
          if (dup) { if (!dup.def && t.def) dup.def = t.def; return; }
          t.id = t.id || uid('t');
          t.createdAt = t.createdAt || nowISO();
          S.db.glossary.push(t);
          added++;
        });
        if (Array.isArray(data.annotations)) {
          data.annotations.forEach(function (a) {
            if (!a || !a.id) return;
            if (S.db.annotations.some(function (x) { return x.id === a.id; })) return;
            S.db.annotations.push(a);
            added++;
          });
        }
        saveDB();
        rebuildTermIndex();
        renderGlossary();
        renderNotes();
        refreshAllRendered();
        updateCounts();
        toast('导入完成，新增 ' + added + ' 条');
      } catch (e) {
        toast('导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ================= 浮窗 ================= */
  function hideSelBar() { $('#selBar').classList.add('hidden'); }

  function bindSelBar() {
    $('#selBar').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('#selBar').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var act = btn.dataset.act;
      if (!S.pendingSel) return;
      if (act === 'term') {
        var pre = S.pendingSel.text.length <= 60 ? S.pendingSel.text : '';
        openTermModal(null, pre);
        if (pre) setTimeout(function () { $('#fZh').focus(); }, 60);
      } else if (act === 'note') {
        openNoteModal();
      } else if (act === 'hit') {
        quickHighlight();
      }
    });
  }

  /* ================= 事件绑定 ================= */
  function bindUI() {
    $('#btnOpen').addEventListener('click', function () { $('#filePdf').click(); });
    $('#filePdf').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) openPdf(e.target.files[0]);
      e.target.value = '';
    });

    $('#btnPrev').addEventListener('click', function () { scrollToPage(currentVisiblePage() - 1); });
    $('#btnNext').addEventListener('click', function () { scrollToPage(currentVisiblePage() + 1); });
    $('#pageInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var n = parseInt(this.value, 10);
        if (n > 0) scrollToPage(n);
        this.blur();
      }
    });
    $('#btnZoomIn').addEventListener('click', function () { setScale(S.scale + 0.15, null, true); });
    $('#btnZoomOut').addEventListener('click', function () { setScale(S.scale - 0.15, null, true); });

    $('#btnSidebar').addEventListener('click', function () {
      var sb = $('#sidebar');
      sb.classList.toggle('collapsed');
      this.classList.toggle('on', !sb.classList.contains('collapsed'));
    });

    // tabs
    $$('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
    });

    // 顶栏「目录」：展开侧栏并切到目录
    $('#btnToc').addEventListener('click', function () {
      var sb = $('#sidebar');
      if (sb.classList.contains('collapsed')) {
        sb.classList.remove('collapsed');
        $('#btnSidebar').classList.add('on');
      }
      switchTab('outline');
      if (!S.pdf) toast('先打开一份 PDF');
    });

    // 搜索
    var st = null;
    $('#glossSearch').addEventListener('input', function () {
      clearTimeout(st);
      var v = this.value;
      st = setTimeout(function () { S.q = v; renderGlossary(); }, 120);
    });
    $('#noteSearch').addEventListener('input', function () {
      clearTimeout(st);
      var v = this.value;
      st = setTimeout(function () { S.noteQ = v; renderNotes(); }, 120);
    });
    $('#outlineSearch').addEventListener('input', function () {
      clearTimeout(st);
      var v = this.value;
      st = setTimeout(function () { S.outlineQ = v; renderOutline(); }, 120);
    });

    // 目录跳转
    $('#outlineList').addEventListener('click', function (e) {
      if (e.target.id === 'btnGoToc') {
        if (S.tocProbe > 0) scrollToPage(S.tocProbe);
        return;
      }
      var it = e.target.closest('.out-item');
      if (!it) return;
      var idx = parseInt(it.dataset.i, 10);
      var item = S.outlineFlat[idx];
      if (!item) return;
      markOutlineActive(idx);
      goDest(item.dest);
    });

    // 术语卡片交互
    $('#glossList').addEventListener('click', function (e) {
      var card = e.target.closest('.term-card');
      if (!card) return;
      var id = card.dataset.id;
      var act = e.target.dataset.act;
      var t = termById(id);
      if (!t) return;

      if (act === 'edit') { openTermModal(t); return; }
      if (act === 'go') {
        if (!t.page) { toast('这条没有记录页码'); return; }
        if (t.doc && t.doc !== S.docName) { toast('该出处来自另一份文档：' + t.doc); return; }
        scrollToPage(t.page); flashTerm(id); return;
      }

      var wrap = $('.note-wrap', card);
      var isOpen = card.classList.contains('open');
      if (isOpen) { card.classList.remove('open'); if (wrap) wrap.classList.add('hidden'); }
      else {
        card.classList.add('open');
        if (wrap) wrap.classList.remove('hidden');
        // 如果当前文档中出现过，顺手定位
        if (t.page && S.docName) { /* 不自动跳，避免打断阅读 */ }
      }
    });

    // 正文里点击已标记的术语 → 侧栏定位到该词条
    $('#pages').addEventListener('click', function (e) {
      var mk = e.target.closest('mark.term-hit, span.term-soft');
      if (!mk || !mk.dataset.termId) return;
      var id = mk.dataset.termId;
      showTermInSidebar(id);
    });

    // 批注列表
    $('#noteList').addEventListener('click', function (e) {
      var card = e.target.closest('.note-card');
      if (!card) return;
      if (e.target.dataset.act === 'del') { deleteAnnotation(card.dataset.id); return; }
      scrollToPage(parseInt(card.dataset.page, 10));
    });

    // 模态
    $('#btnSaveTerm').addEventListener('click', saveTerm);
    $('#modalClose').addEventListener('click', closeTermModal);
    $('#modalCancel').addEventListener('click', closeTermModal);
    $('#btnDelTerm').addEventListener('click', deleteTerm);
    $('#btnNewTerm').addEventListener('click', function () { S.pendingSel = null; openTermModal(null); });

    $('#btnSaveNote').addEventListener('click', saveNote);
    $('#noteClose').addEventListener('click', function () { $('#modalNote').classList.add('hidden'); });
    $('#noteCancel').addEventListener('click', function () { $('#modalNote').classList.add('hidden'); });

    // 导出菜单
    $('#btnExport').addEventListener('click', function (e) {
      e.stopPropagation();
      var old = $('.menu');
      if (old) { old.remove(); return; }
      var m = document.createElement('div');
      m.className = 'menu';
      m.innerHTML = '<button data-m="md">导出术语与批注（Markdown）</button>' +
        '<div class="hr"></div>' +
        '<button data-m="json">备份全部数据（JSON）</button>' +
        '<button data-m="import">从备份恢复</button>';
      var r = this.getBoundingClientRect();
      m.style.left = (r.right - 210) + 'px';
      m.style.top = (r.bottom + 6) + 'px';
      m.style.position = 'fixed';
      document.body.appendChild(m);
      m.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.m === 'md') exportMarkdown();
        if (b.dataset.m === 'json') exportJSON();
        if (b.dataset.m === 'import') $('#fileImport').click();
        m.remove();
      });
      setTimeout(function () {
        document.addEventListener('click', function once() {
          m.remove();
          document.removeEventListener('click', once);
        });
      }, 0);
    });

    $('#btnExportJson').addEventListener('click', exportJSON);
    $('#btnImport').addEventListener('click', function () { $('#fileImport').click(); });
    $('#fileImport').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });

    // 选区
    document.addEventListener('mouseup', function (e) {
      var t = e.target;
      if (t && t.closest) {
        if (t.closest('#sidebar') || t.closest('.modal-wrap') || t.closest('.selbar') || t.closest('.menu')) return;
      }
      setTimeout(handleSelection, 10);
    });
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) hideSelBar();
    });
    var scrollT = null;
    $('#viewer').addEventListener('scroll', function () {
      if (scrollT) return;
      scrollT = setTimeout(function () {
        scrollT = null;
        hideSelBar();
        var cp = currentVisiblePage();
        $('#pageInput').value = cp;
        syncOutlineActive(cp);
      }, 140);
    }, { passive: true });

    // 拖拽
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        $('#dropzone').classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (ev === 'drop') e.preventDefault();
        if (ev === 'dragleave' && e.relatedTarget) return;
        $('#dropzone').classList.remove('drag');
      });
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.pdf$/i.test(f.name)) openPdf(f);
    });

    // 快捷键
    document.addEventListener('keydown', function (e) {
      var inField = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        $('#glossSearch').focus();
        $('#glossSearch').select();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!$('#modalWrap').classList.contains('hidden')) saveTerm();
        else if (!$('#modalNote').classList.contains('hidden')) saveNote();
        return;
      }
      if (e.key === 'Escape') {
        closeTermModal();
        $('#modalNote').classList.add('hidden');
        hideSelBar();
        return;
      }
      if (inField) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(S.scale + 0.15, null, true); }
      if (e.key === '-') { e.preventDefault(); setScale(S.scale - 0.15, null, true); }
      if (e.key === 'ArrowRight' && S.pdf) { e.preventDefault(); scrollToPage(currentVisiblePage() + 1); }
      if (e.key === 'ArrowLeft' && S.pdf) { e.preventDefault(); scrollToPage(currentVisiblePage() - 1); }
    });
  }

  /* ================= 侧栏定位与闪烁 ================= */
  function showTermInSidebar(id) {
    var sb = $('#sidebar');
    sb.classList.remove('collapsed');
    $('#btnSidebar').classList.add('on');
    switchTab('glossary');

    S.q = '';
    $('#glossSearch').value = '';
    renderGlossary();

    var card = $('#glossList .term-card[data-id="' + id + '"]');
    if (!card) { toast('该词条不在当前筛选结果中'); return; }
    card.classList.add('open');
    var w = $('.note-wrap', card);
    if (w) w.classList.remove('hidden');
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.style.transition = 'background .3s';
    card.style.background = '#fff6d6';
    setTimeout(function () { card.style.background = ''; }, 900);
  }

  function flashTerm(id) {
    var marks = $$('mark.term-hit[data-term-id="' + id + '"]');
    if (!marks.length) { toast('当前页没有出现这个词'); return; }
    marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    marks.forEach(function (m) {
      m.style.outline = '2px solid #d6a400';
      setTimeout(function () { m.style.outline = ''; }, 1400);
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    S.db = loadDB();
    window.__S1 = S; // 调试入口：可在控制台查看当前状态    rebuildTermIndex();
    if (S.db.settings && S.db.settings.scale) {
      S.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, S.db.settings.scale));
    }
    $('#zoomLabel').textContent = Math.round(S.scale * 100) + '%';

    bindUI();
    bindSelBar();
    renderGlossary();
    renderNotes();
    renderOutline();
    updateCounts();

    // 预加载 pdf.js（不阻塞界面）
    setupPdfJs().catch(function (e) { console.warn(e); });

    // 支持 ?pdf=<相对路径> 直接打开（方便做书签/快捷方式）
    var auto = null;
    try { auto = new URLSearchParams(location.search).get('pdf'); } catch (e) { auto = null; }
    if (auto) {
      fetch(auto).then(function (r) { return r.blob(); }).then(function (b) {
        var nm = decodeURIComponent(auto.split('/').pop() || 'document.pdf');
        openPdf(new File([b], nm, { type: 'application/pdf' }));
      }).catch(function () { toast('无法自动加载指定 PDF'); });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
