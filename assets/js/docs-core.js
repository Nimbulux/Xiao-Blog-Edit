(function (global) {
  "use strict";
  var utils = global.Utils;

  /* ---------- 常量 ---------- */
  var DOCS_BASE        = "/posts";
  var DOCS_LIST_URL    = "/pages/list.json";
  var ARTICLE_PAGE_URL = "/app/docs/article";
  var docsListCache    = null;

  /* ---------- SEO ---------- */
  var SITE_ORIGIN = "https://nimbulux.github.io";
  var SITE_AUTHOR = "Nimbulux_";
  var SITE_AVATAR = "https://nimbulux.github.io/public/favicon.jpg";

  function setMetaAttr(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (el) el.setAttribute(attr, value);
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
    var titlePath = (opt.titlePath && opt.titlePath.length) ? opt.titlePath : [opt.title || ""];
    var headline  = titlePath[titlePath.length - 1];
    var fullTitle = titlePath.slice().reverse().join(" - ") + " - 云中霞光";
    document.title = fullTitle;
    upsertMeta("description", opt.description);

    setMetaAttr('meta[property="og:title"]',        "content", fullTitle);
    setMetaAttr('meta[property="og:description"]',  "content", opt.description);
    setMetaAttr('meta[property="og:url"]',          "content", opt.url);
    setMetaAttr('meta[property="og:image"]',        "content", opt.image || SITE_AVATAR);
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

  /* ---------- 节点工具 ---------- */
  function nodeTitle(node) {
    return (node && node.info && node.info.title) || (node && node.name) || "";
  }
  function nodePath(node) {
    return (node && (node.relative_path || node.name)) || "";
  }
  function hasChildren(node) {
    return !!(node && node.children && node.children.length);
  }
  function isArticleNode(node) {
    if (!node) return false;
    if (node.type === "article" || node.type === "mixed") return true;
    if (node.type === "directory") return false;
    return !!node.info;
  }
  function isPureDirectory(node) {
    return hasChildren(node) && !isArticleNode(node);
  }
  function isArticleTypeNode(node) {
    return !!node && node.type === "article";
  }

  global.nodeTitle   = nodeTitle;
  global.nodePath    = nodePath;
  global.hasChildren = hasChildren;

  function encodePath(p) {
    return String(p).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }
  function docHref(pathOrIds) {
    var path = Array.isArray(pathOrIds)
      ? pathOrIds.join("/")
      : String(pathOrIds == null ? "" : pathOrIds);
    return ARTICLE_PAGE_URL + "?path=" + encodePath(path);
  }
  global.docHref = docHref;

  /* 查找节点：返回 { node, titles, paths }，
     paths 里存的是「每一层的完整路径」 */
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

  function firstLeafPath(node) {
    var cur = node, guard = 0;
    while (hasChildren(cur) && guard++ < 64) cur = cur.children[0];
    return nodePath(cur);
  }
  global.firstLeafPath = firstLeafPath;

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
          var toggle = e.target.closest(".sidebar-toggle");
          if (toggle) {
            e.preventDefault();
            var g1 = toggle.closest(".sidebar-group");
            if (g1) toggleGroup(g1);
            return;
          }
          if (e.target.closest("a.sidebar-group-title-link")) return;
          var header = e.target.closest(".sidebar-group-header");
          if (!header) return;
          var g2 = header.closest(".sidebar-group");
          if (g2) toggleGroup(g2);
        });
        holder.addEventListener("keydown", function (e) {
          if (e.key !== "Enter" && e.key !== " ") return;
          var header = e.target.closest(".sidebar-group-header");
          if (!header) return;
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

  function renderSidebarNode(node, depth, currentPath) {
    var path    = nodePath(node);
    var title   = utils.escapeHTML(nodeTitle(node));
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
        html += '<a class="sidebar-group-title sidebar-group-title-link" href="' + docHref(path) + '">' + title + '</a>';
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

  /* ---------- 分页 ---------- */
  /* 收集「兄弟文章池」：从当前文章的父层开始向上回溯，
     找到第一个满足以下条件的池：
       1. 池中包含当前文章（按 relative_path 匹配）
       2. 池内至少有一篇 type === "article" 的文章
     ★ 关键修正：info.paths[i] 本身就是「到第 i 层的完整路径」，
       不能再对它 join("/")，否则路径会重复。 */
  function collectSiblingArticles(list, info) {
    var paths = (info && info.paths) || [];
    var currentPath = paths[paths.length - 1];
    if (!currentPath) return [];

    /* 从直接父级（paths.length - 2）一路向上找 */
    for (var i = paths.length - 2; i >= 0; i--) {
      var anc = findNodeInfo(list, paths[i]);
      if (!anc || !anc.node || !anc.node.children) continue;

      var articles = anc.node.children.filter(isArticleTypeNode);
      if (!articles.length) continue;

      for (var k = 0; k < articles.length; k++) {
        if (nodePath(articles[k]) === currentPath) return articles;
      }
    }

    /* 兜底：当前文章就在根列表里 */
    var rootArticles = (list || []).filter(isArticleTypeNode);
    for (var m = 0; m < rootArticles.length; m++) {
      if (nodePath(rootArticles[m]) === currentPath) return rootArticles;
    }
    return [];
  }

  /* 仅对 type === "article" 显示分页。
     list.json 为倒序（最新在前）：
       idx + 1 = 更早 = 上一篇
       idx - 1 = 更新 = 下一篇 */
  function renderPagination(currentPath) {
    var holder = document.getElementById("pagination");
    if (!holder) return Promise.resolve();
    return fetchDocsList().then(function (list) {
      var info = findNodeInfo(list, currentPath);
      if (!info || info.node.type !== "article") {
        holder.innerHTML = "";
        return;
      }

      var node     = info.node;
      var siblings = collectSiblingArticles(list, info);

      var idx = -1;
      for (var i = 0; i < siblings.length; i++) {
        if (nodePath(siblings[i]) === nodePath(node)) { idx = i; break; }
      }
      if (idx === -1) {
        holder.innerHTML = "";
        return;
      }

      var prevNode = siblings[idx + 1] || null;
      var nextNode = siblings[idx - 1] || null;

      function btnHTML(item, type) {
        if (!item) {
          var label = type === "prev" ? "已是第一篇" : "已是最后一篇";
          return '<div class="page-btn ' + type + ' disabled">' +
                   '<span class="label">' + label + '</span>' +
                   '<span class="title">—</span>' +
                 '</div>';
        }
        var arrow     = type === "prev" ? "← " : " →";
        var labelText = type === "prev" ? "上一篇" : "下一篇";
        var href      = docHref(nodePath(item));
        var display   = nodeTitle(item);
        return '<a class="page-btn ' + type + '" href="' + href + '">' +
                 '<span class="label">' + labelText + '</span>' +
                 '<span class="title">' + arrow + utils.escapeHTML(display) + '</span>' +
               '</a>';
      }

      holder.innerHTML =
        btnHTML(prevNode, "prev") +
        '<div class="page-divider"></div>' +
        btnHTML(nextNode, "next");
    });
  }
  global.renderPagination = renderPagination;

  /* 正文出来后再刷新 description（og / twitter / JSON-LD 一起改） */
  function refreshArticleMeta(desc) {
    if (!desc) return;
    upsertMeta("description", desc);
    setMetaAttr('meta[property="og:description"]',  "content", desc);
    setMetaAttr('meta[name="twitter:description"]', "content", desc);
    var ld = document.head.querySelector('script[type="application/ld+json"][data-seo="article"]');
    if (ld) {
      try {
        var obj = JSON.parse(ld.textContent);
        obj.description = desc;
        ld.textContent = JSON.stringify(obj);
      } catch (e) {}
    }
  }
  global.isPureDirectory   = isPureDirectory;
  global.refreshArticleMeta = refreshArticleMeta;

  /* 把需要的常量也挂到 global，方便 page 层调用 */
  global.DOCS_BASE        = DOCS_BASE;
  global.ARTICLE_PAGE_URL = ARTICLE_PAGE_URL;
  global.INDEX_PAGE_URL   = "/app/docs";
  global.SITE_ORIGIN      = SITE_ORIGIN;
  global.setArticleMeta   = setArticleMeta;
})(window);