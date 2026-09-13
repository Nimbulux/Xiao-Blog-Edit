(function (global) {
  "use strict";

  /* ---------- 代码块复制 ---------- */
  var COPY_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
    '<path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
  var CHECK_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';

  function enhanceCodeBlocks(root) {
    var pres = root.querySelectorAll("pre");
    Array.prototype.forEach.call(pres, function (pre) {
      if (pre.parentElement && pre.parentElement.classList.contains("code-block-wrap")) return;
      var wrap = document.createElement("div");
      wrap.className = "code-block-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "复制代码");
      btn.innerHTML = COPY_SVG;
      wrap.appendChild(btn);
      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        var text = code ? code.textContent : pre.textContent;
        var done = function () {
          btn.innerHTML = CHECK_SVG;
          btn.classList.add("copied");
          setTimeout(function () {
            btn.innerHTML = COPY_SVG;
            btn.classList.remove("copied");
          }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {});
        } else {
          done();
        }
      });
    });
  }

  /* ---------- Markdown 渲染 ---------- */
  function fillDocUpdated(lastModified) {
    var el = document.getElementById("doc-updated");
    if (!el || !lastModified) return;
    var d = new Date(lastModified);
    if (isNaN(d.getTime())) return;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    el.textContent = "最后更新：" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* 去掉 markdown 里与页面 doc-title 重复的第一个 h1 */
  function stripFirstH1(box) {
    var first = box.firstElementChild;
    while (first && first.nodeType !== 1) first = first.nextElementSibling;
    if (first && first.tagName === "H1") {
      first.parentNode.removeChild(first);
    }
  }

  function renderDocMarkdown(selector, mdUrl) {
    var box = document.querySelector(selector);
    if (!box) return Promise.resolve();
    var parse = window.marked && (window.marked.parse || window.marked);
    if (!parse) {
      box.innerHTML = '<p class="status-box">Markdown 解析器未加载。</p>';
      return Promise.resolve();
    }
    return fetch(mdUrl).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      fillDocUpdated(r.headers.get("Last-Modified"));
      return r.text();
        }).then(function (md) {
      box.innerHTML = parse(md);
      stripFirstH1(box);
      enhanceCodeBlocks(box);
      highlightAll(box);
    }).catch(function (err) {
      console.warn("[doc] markdown 加载失败 " + mdUrl + "：", err);
      box.innerHTML = '<p class="status-box">正文加载失败。</p>';
    });
  }
  global.renderDocMarkdown = renderDocMarkdown;

    /* ---------- 本页目录 / 阅读进度 ---------- */
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/[^a-zA-Z0-9_\u00a0-\uffff-]/g, "\\$&");
  }

  function initDocToc() {
    var body = document.querySelector("#doc-body");
    var toc  = document.querySelector("#doc-toc");
    if (!body || !toc) return;

    var nav = toc.querySelector(".toc-nav");
    if (!nav) return;

    var headings = body.querySelectorAll("h1, h2, h3, h4, h5, h6");
    if (headings.length < 2) {
      toc.style.display = "none";
      return;
    }
    toc.style.display = "";

    /* 1. 收集标题，确保每个都有唯一 id */
    var items   = [];
    var usedIds = Object.create(null);

    Array.prototype.forEach.call(headings, function (h, i) {
      var text = (h.textContent || "").trim();
      var id = h.id;
      if (!id) {
        id = "toc-" + i + "-" + text
          .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40);
      }
      if (!id || usedIds[id]) id = "toc-" + i;
      usedIds[id] = true;
      h.id = id;

      items.push({
        id: id,
        text: text,
        level: parseInt(h.tagName.charAt(1), 10),
        el: h
      });
    });

    /* 2. 根据 level 构建树（h1 > h2 > h3 …） */
    var root  = { level: 0, children: [] };
    var stack = [root];
    items.forEach(function (it) {
      var node = { id: it.id, text: it.text, level: it.level, el: it.el, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    /* 3. 渲染（默认全部 collapsed） */
    function renderChildren(nodes, parentEl) {
      nodes.forEach(function (n) {
        var group = document.createElement("div");
        group.className = "toc-group collapsed";

        var link = document.createElement("a");
        link.className = "toc-item toc-h" + n.level;
        link.href = "#" + n.id;
        link.dataset.id = n.id;
        link.textContent = n.text || "(无标题)";
        link.title = n.text;
        group.appendChild(link);

        if (n.children.length) {
          var sub = document.createElement("div");
          sub.className = "toc-children";
          renderChildren(n.children, sub);
          group.appendChild(sub);
        }
        parentEl.appendChild(group);
      });
    }

    nav.innerHTML = "";
    renderChildren(root.children, nav);

        /* 4. 点击平滑滚动 + 目标闪烁提示（尊重减少动态效果） */
    var STICKY_OFFSET = 72;
    var reduceMotion = window.matchMedia &&
                       window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function scrollToId(id) {
      var target = document.getElementById(id);
      if (!target) return null;
      var top = target.getBoundingClientRect().top + window.pageYOffset - STICKY_OFFSET;
      if (top < 0) top = 0;
      if (reduceMotion) {
        /* 减少动态：直接跳，不做平滑滚动 */
        window.scrollTo(0, top);
      } else {
        try { window.scrollTo({ top: top, behavior: "smooth" }); }
        catch (err) { window.scrollTo(0, top); }
      }
      return target;
    }

    function flashTarget(el) {
      if (!el) return;
      el.classList.remove("toc-target-flash");
      void el.offsetWidth;
      el.classList.add("toc-target-flash");
    }

    /* 等平滑滚动停下来再闪；reduce 时立即闪 */
    function afterScroll(cb) {
      if (reduceMotion) { cb(); return; }
      if ("onscrollend" in window) {
        var done = false;
        var fire = function () {
          if (done) return;
          done = true;
          window.removeEventListener("scrollend", fire);
          cb();
        };
        window.addEventListener("scrollend", fire, { once: true });
        setTimeout(fire, 900);
      } else {
        setTimeout(cb, 450);
      }
    }

    nav.addEventListener("click", function (e) {
      var link = e.target.closest(".toc-item");
      if (!link) return;
      e.preventDefault();
      var id = link.dataset.id;
      var target = scrollToId(id);
      if (!target) return;
      afterScroll(function () { flashTarget(target); });
      if (history.replaceState) history.replaceState(null, "", "#" + encodeURIComponent(id));
    });

    /* 5. 滚动跟踪：展开祖先 + 高亮 */
    var activeId = null;
    var ticking  = false;

    function expandAncestors(el) {
      var p = el.parentElement;
      while (p && p !== nav) {
        if (p.classList && p.classList.contains("toc-group")) {
          p.classList.remove("collapsed");
        }
        p = p.parentElement;
      }
    }

    function keepLinkVisible(el) {
      var container = toc;                    /* TOC 自身可滚动 */
      var cRect = container.getBoundingClientRect();
      var eRect = el.getBoundingClientRect();
      if (eRect.top < cRect.top + 4) {
        container.scrollTop -= (cRect.top - eRect.top) + 8;
      } else if (eRect.bottom > cRect.bottom - 4) {
        container.scrollTop += (eRect.bottom - cRect.bottom) + 8;
      }
    }

    function updateActive() {
      ticking = false;
      if (!items.length) return;

      var OFFSET = 90;                        /* 顶栏高度 + 余量 */
      var current = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].el.getBoundingClientRect().top - OFFSET <= 0) current = items[i];
        else break;
      }

      /* 已滚到底部 → 高亮最后一项 */
      var doc = document.documentElement;
      if (window.innerHeight + window.pageYOffset >= doc.scrollHeight - 4) {
        current = items[items.length - 1];
      }

      if (!current || current.id === activeId) return;
      activeId = current.id;

      var prev = nav.querySelector(".toc-item.active");
      if (prev) prev.classList.remove("active");

      var link = nav.querySelector('.toc-item[data-id="' + cssEscape(current.id) + '"]');
      if (!link) return;
      link.classList.add("active");
      expandAncestors(link);
      keepLinkVisible(link);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActive);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    /* 首帧 */
    updateActive();
  }
  global.initDocToc = initDocToc;

  /* ---------- 代码高亮 ---------- */
  function highlightAll(root) {
    if (!window.hljs) return;
    var blocks = root.querySelectorAll("pre code");
    Array.prototype.forEach.call(blocks, function (block) {
      if (block.classList.contains("hljs")) return;   /* 已高亮过就跳过 */
      try { window.hljs.highlightElement(block); } catch (e) {}
    });
  }

})(window);