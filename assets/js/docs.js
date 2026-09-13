(function (global) {
  "use strict";

  var utils = global.Utils;

  /* ---------- 常量 ---------- */
  var DOCS_BASE        = "/posts";           // markdown 资源根目录
  var DOCS_LIST_URL    = "/pages/list.json"; // 目录数据
  var ARTICLE_PAGE_URL = "/app/docs/article";    // 文章模板页
  var INDEX_PAGE_URL   = "/app/docs";            // 目录首页
  var docsListCache    = null;

  /* ---------- SEO 元数据（OG / Twitter Card / canonical / JSON-LD） ---------- */
  var SITE_ORIGIN = "https://nimbulux.github.io";
  var SITE_AUTHOR = "Nimbulux_";
  var SITE_AVATAR = "https://nimbulux.github.io/public/favicon.jpg";

  function setMetaAttr(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (!el) return;
    el.setAttribute(attr, value);
  }

  function upsertMeta(name, content) {
    var el = document.head.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function upsertJSONLD(obj) {
    var el = document.head.querySelector('script[type="application/ld+json"][data-seo="article"]');
    if (!el) {
      el = document.createElement("script");
      el.setAttribute("type", "application/ld+json");
      el.setAttribute("data-seo", "article");
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(obj);
  }

  function setArticleMeta(opt) {
    var titlePath = opt.titlePath && opt.titlePath.length ? opt.titlePath : [opt.title || ""];
    var headline  = titlePath[titlePath.length - 1];
    var fullTitle = titlePath.slice().reverse().join(" - ") + " - 云中霞光";
    document.title = fullTitle;
    upsertMeta("description", opt.description);

    setMetaAttr('meta[property="og:title"]',       "content", fullTitle);
    setMetaAttr('meta[property="og:description"]', "content", opt.description);
    setMetaAttr('meta[property="og:url"]',         "content", opt.url);
    setMetaAttr('meta[property="og:image"]',       "content", opt.image || SITE_AVATAR);

    setMetaAttr('meta[name="twitter:title"]',       "content", fullTitle);
    setMetaAttr('meta[name="twitter:description"]', "content", opt.description);
    setMetaAttr('meta[name="twitter:image"]',       "content", opt.image || SITE_AVATAR);

    var canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", opt.url);

    upsertJSONLD({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": headline,
      "description": opt.description,
      "url": opt.url,
      "image": opt.image || SITE_AVATAR,
      "author":    { "@type": "Person", "name": SITE_AUTHOR, "url": "https://github.com/" + SITE_AUTHOR },
      "publisher": { "@type": "Person", "name": SITE_AUTHOR, "url": "https://github.com/" + SITE_AUTHOR },
      "mainEntityOfPage": { "@type": "WebPage", "@id": opt.url }
    });
  }

  function extractDescription(box) {
    if (!box) return "";
    var p = box.querySelector("p");
    var text = p ? p.textContent : box.textContent;
    text = (text || "").replace(/\s+/g, " ").trim();
    if (text.length > 120) text = text.slice(0, 120) + "…";
    return text;
  }

  /* ---------- 数据加载 ---------- */
  function fetchDocsList() {
    if (docsListCache) return Promise.resolve(docsListCache);
    return utils.fetchJSON(DOCS_LIST_URL).then(function (list) {
      docsListCache = list || [];
      return docsListCache;
    }).catch(function (err) {
      console.warn("[docs] list.json 加载失败：", err);
      docsListCache = [];
      return docsListCache;
    });
  }
  global.fetchDocsList = fetchDocsList;

  /* ---------- 节点工具函数 ---------- */
  function nodeTitle(node) {
    return (node && node.info && node.info.title) || (node && node.name) || "";
  }
  function nodePath(node) {
    return (node && (node.relative_path || node.name)) || "";
  }
  function hasChildren(node) {
    return !!(node && node.children && node.children.length);
  }
  /* 节点是否带正文（可渲染文章页）：article 或 mixed，或者无 type 但有 info */
  function isArticleNode(node) {
    if (!node) return false;
    if (node.type === "article" || node.type === "mixed") return true;
    if (node.type === "directory") return false;
    return !!node.info; // 兼容无 type 的老数据
  }
  /* 纯目录：有子节点且自身无正文，点击时跳到第一个叶子 */
  function isPureDirectory(node) {
    return hasChildren(node) && !isArticleNode(node);
  }

  function encodePath(p) {
    return String(p).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  /* 文章详情页链接：/docs/article?path=作文/辙痕与星轨之间
     兼容数组入参（自动 join） */
  function docHref(pathOrIds) {
    var path = Array.isArray(pathOrIds)
      ? pathOrIds.join("/")
      : String(pathOrIds == null ? "" : pathOrIds);
    return ARTICLE_PAGE_URL + "?path=" + encodePath(path);
  }
  global.docHref = docHref;

  /* 沿 relative_path 查找节点，返回 { node, titles[], paths[] } 或 null */
  function findNodeInfo(list, relPath) {
    var parts = String(relPath || "").split("/").filter(Boolean);
    if (!parts.length) return null;

    var nodes  = list;
    var acc    = "";
    var titles = [];
    var paths  = [];
    var node   = null;

    for (var i = 0; i < parts.length; i++) {
      acc  = acc ? acc + "/" + parts[i] : parts[i];
      node = null;
      var pool = nodes || [];
      for (var j = 0; j < pool.length; j++) {
        if (nodePath(pool[j]) === acc) { node = pool[j]; break; }
      }
      if (!node) return null;
      titles.push(nodeTitle(node));
      paths.push(nodePath(node));
      nodes = node.children;
    }
    return { node: node, titles: titles, paths: paths };
  }
  global.findNodeInfo = findNodeInfo;

  /* 从 node 沿第一个 child 递归到叶子，返回叶子的 relative_path */
  function firstLeafPath(node) {
    var cur = node, guard = 0;
    while (hasChildren(cur) && guard++ < 64) cur = cur.children[0];
    return nodePath(cur);
  }
  global.firstLeafPath = firstLeafPath;

  /* 兼容旧接口：主页原先调用 firstLeafIds(node, parentIds) 得到 id 数组。
     新版返回 relative_path 的分段数组，配合 docHref 使用。 */
  function firstLeafIds(node /*, parentIds */) {
    var p = firstLeafPath(node);
    return p ? p.split("/").filter(Boolean) : [];
  }
  global.firstLeafIds = firstLeafIds;

  /* 展平为文章分页序列：
     - 遍历整棵树（前序）
     - 凡是 isArticleNode 的节点都进序列（article 和 mixed）
     - 纯 directory 不进序列
     每项 → { path, titles: [从根到该节点的标题] } */
  function flattenDocsSequence(list) {
    var seq = [];
    (function walk(nodes, titles) {
      (nodes || []).forEach(function (n) {
        var t = titles.concat(nodeTitle(n));
        if (isArticleNode(n)) {
          seq.push({ path: nodePath(n), titles: t });
        }
        if (hasChildren(n)) walk(n.children, t);
      });
    })(list, []);
    return seq;
  }
  global.flattenDocsSequence = flattenDocsSequence;

  /* ---------- 侧边栏 ---------- */
  var SIDEBAR_TOGGLE_SVG = '<svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M4 2L10 6L4 10Z"/></svg>';

  function renderSidebar(currentPath) {
    var holder = document.getElementById("docs-sidebar");
    if (!holder) return Promise.resolve();
    return fetchDocsList().then(function (list) {
      var html = "<h3>目录</h3>";
      (list || []).forEach(function (it) {
        html += renderSidebarNode(it, 0, currentPath);
      });
      holder.innerHTML = html;

      if (!holder.__sidebarToggleBound) {
        var toggleGroup = function (group) {
          var isCollapsed = group.classList.toggle("collapsed");
          var header = group.querySelector(".sidebar-group-header");
          if (header) header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        };

        holder.addEventListener("click", function (e) {
          /* 折叠图标：切换折叠状态 */
          var toggle = e.target.closest(".sidebar-toggle");
          if (toggle) {
            e.preventDefault();
            var g1 = toggle.closest(".sidebar-group");
            if (g1) toggleGroup(g1);
            return;
          }
          /* mixed 节点的标题链接：让浏览器正常跳转 */
          if (e.target.closest("a.sidebar-group-title-link")) return;

          /* 其它情况（点击 directory 的组头空白区）：切换折叠 */
          var header = e.target.closest(".sidebar-group-header");
          if (!header) return;
          var g2 = header.closest(".sidebar-group");
          if (g2) toggleGroup(g2);
        });

        holder.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" && e.key !== " ") return;
          var header = e.target.closest(".sidebar-group-header");
          if (!header) return;
          /* 若焦点在标题链接上，让浏览器处理 */
          if (e.target.closest("a.sidebar-group-title-link")) return;
          e.preventDefault();
          var group = header.closest(".sidebar-group");
          if (group) toggleGroup(group);
        });

        holder.__sidebarToggleBound = true;
      }
    });
  }
  global.renderSidebar = renderSidebar;

  /* 递归渲染侧边栏节点：
     - 有 children → 折叠组
       · type === "mixed"：标题渲染为 <a class="sidebar-group-title sidebar-group-title-link">
         （点击进文章页），折叠图标单独控制展开/收起
       · 其它（directory）：标题为纯 <span>，整行点击切换折叠
     - 无 children → 叶子链接 */
  function renderSidebarNode(node, depth, currentPath) {
    var path  = nodePath(node);
    var title = utils.escapeHTML(nodeTitle(node));
    var isMixed = node.type === "mixed";

    if (hasChildren(node)) {
      var onPath = !!currentPath && (currentPath === path || currentPath.indexOf(path + "/") === 0);
      var collapsed   = onPath ? "" : " collapsed";
      var expanded    = onPath ? "true" : "false";
      var groupActive = onPath ? " sidebar-group-active" : "";
      var mixedCls    = isMixed ? " sidebar-group-mixed" : "";

      var html =
        '<div class="sidebar-group sidebar-depth-' + depth + groupActive + mixedCls + collapsed + '">' +
          '<div class="sidebar-group-header" role="button" tabindex="0" aria-expanded="' + expanded + '">';
      if (isMixed) {
        html += '<a class="sidebar-group-title sidebar-group-title-link" href="' + docHref(path) + '">' +
                  title +
                '</a>';
      } else {
        html += '<span class="sidebar-group-title">' + title + '</span>';
      }
      html +=
            '<span class="sidebar-toggle" aria-hidden="true">' + SIDEBAR_TOGGLE_SVG + '</span>' +
          '</div>' +
          '<div class="sidebar-sub">';

      node.children.forEach(function (c) {
        html += renderSidebarNode(c, depth + 1, currentPath);
      });
      html += '</div></div>';
      return html;
    }

    var cls = "sidebar-link sidebar-depth-" + depth;
    if (currentPath === path) cls += " active";
    return '<a class="' + cls + '" href="' + docHref(path) + '">' + title + '</a>';
  }

  /* ---------- 上下页分页 ---------- */
  /* 序列来源：flattenDocsSequence（article + mixed 节点）。
     这样混合节点（如「作文」）本身也参与分页，且它自己的正文与子文章连续。 */
  function renderPagination(currentPath) {
    var holder = document.getElementById("pagination");
    if (!holder) return Promise.resolve();
    return fetchDocsList().then(function (list) {
      var seq = flattenDocsSequence(list);
      var idx = -1;
      for (var i = 0; i < seq.length; i++) {
        if (seq[i].path === currentPath) { idx = i; break; }
      }
      if (idx === -1) { holder.innerHTML = ""; return; }

      var prev = idx > 0 ? seq[idx - 1] : null;
      var next = idx < seq.length - 1 ? seq[idx + 1] : null;

      function btnHTML(item, type) {
        if (!item) {
          var label = type === "prev" ? "已是第一篇" : "已是最后一篇";
          return '<div class="page-btn ' + type + ' disabled">' +
                   '<span class="label">' + label + '</span>' +
                   '<span class="title">—</span>' +
                 '</div>';
        }
        var arrow     = type === "prev" ? "← " : " →";
        var labelText = type === "prev" ? "上一页" : "下一页";
        var href      = docHref(item.path);
        var display   = item.titles.join(" · ");
        return '<a class="page-btn ' + type + '" href="' + href + '">' +
                 '<span class="label">' + labelText + '</span>' +
                 '<span class="title">' + arrow + utils.escapeHTML(display) + '</span>' +
               '</a>';
      }

      holder.innerHTML =
        btnHTML(prev, "prev") +
        '<div class="page-divider"></div>' +
        btnHTML(next, "next");
    });
  }
  global.renderPagination = renderPagination;

  /* ---------- 文章模板页初始化 ---------- */
  /* ?path=<relative_path>
     - 纯目录（directory）→ 重定向到第一个叶子
     - article / mixed    → 渲染自身正文（mixed 同时展示侧边栏展开 + 分页参与） */
  function initArticlePage() {
    var query = new URLSearchParams(window.location.search);
    var path  = (query.get("path") || "").trim();
    if (!path) {
      window.location.replace(INDEX_PAGE_URL);
      return;
    }

    return fetchDocsList().then(function (list) {
      var info = findNodeInfo(list, path);
      if (!info) {
        window.location.replace(INDEX_PAGE_URL);
        return;
      }

      var node = info.node;

      /* 纯目录：跳到第一个叶子 */
      if (isPureDirectory(node)) {
        window.location.replace(docHref(firstLeafPath(node)));
        return;
      }

      /* article / mixed → 渲染 */
      var titlePath = info.titles.length ? info.titles : [node.name || ""];
      var title     = titlePath[titlePath.length - 1];
      var relPath   = nodePath(node) || path;
      var mdUrl     = DOCS_BASE + "/" + relPath + "/index.md";
      var articleUrl = SITE_ORIGIN + docHref(relPath);

      setArticleMeta({
        titlePath: titlePath,
        description: "ckckh2023 的文档库文章",
        url: articleUrl
      });

      var h1 = document.getElementById("doc-title");
      if (h1) h1.textContent = title;

      var breadcrumb = document.getElementById("doc-breadcrumb");
      if (breadcrumb) {
        if (info.paths.length > 1) {
          var bcHTML = "";
          for (var i = 0; i < info.paths.length - 1; i++) {
            bcHTML += '<a href="' + docHref(info.paths[i]) + '">' +
                        utils.escapeHTML(info.titles[i]) +
                      '</a><span class="breadcrumb-sep">/</span>';
          }
          bcHTML += '<span class="breadcrumb-current">' + utils.escapeHTML(title) + '</span>';
          breadcrumb.innerHTML = bcHTML;
        } else {
          breadcrumb.innerHTML = "";
        }
      }

      return Promise.all([
        renderDocMarkdown("#doc-body", mdUrl).then(function () {
          var desc = extractDescription(document.querySelector("#doc-body"));
          if (!desc) return;
          upsertMeta("description", desc);
          setMetaAttr('meta[property="og:description"]',    "content", desc);
          setMetaAttr('meta[name="twitter:description"]',   "content", desc);
          var ld = document.head.querySelector('script[type="application/ld+json"][data-seo="article"]');
          if (ld) {
            try {
              var obj = JSON.parse(ld.textContent);
              obj.description = desc;
              ld.textContent = JSON.stringify(obj);
            } catch (e) {}
          }
        }),
        renderSidebar(relPath),
        renderPagination(relPath)
      ]);
    });
  }
  global.initArticlePage = initArticlePage;

  /* ---------- 代码块复制按钮 ---------- */
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

  /* ---------- Markdown 正文渲染 ---------- */
  function fillDocUpdated(lastModified) {
    var el = document.getElementById("doc-updated");
    if (!el || !lastModified) return;
    var d = new Date(lastModified);
    if (isNaN(d.getTime())) return;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    el.textContent = "最后更新：" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
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
      enhanceCodeBlocks(box);
    }).catch(function (err) {
      console.warn("[doc] markdown 加载失败 " + mdUrl + "：", err);
      box.innerHTML = '<p class="status-box">正文加载失败。</p>';
    });
  }
  global.renderDocMarkdown = renderDocMarkdown;
})(window);