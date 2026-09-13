/* /app/assets/js/docs-page.js
 * 页面组装层：只负责「读取 URL → 拉数据 → 调 core/content → 填 DOM」。
 */
(function (global) {
  "use strict";

  var utils = global.Utils;

  function initArticlePage() {
    var query = new URLSearchParams(window.location.search);
    var path  = (query.get("path") || "").trim();
    if (!path) {
      window.location.replace(global.INDEX_PAGE_URL);
      return;
    }

    return global.fetchDocsList().then(function (list) {
      var info = global.findNodeInfo(list, path);
      if (!info) {
        window.location.replace(global.INDEX_PAGE_URL);
        return;
      }

      var node = info.node;

      /* 纯目录节点 → 跳到它的第一个叶子 */
      if (global.isPureDirectory(node)) {
        window.location.replace(global.docHref(global.firstLeafPath(node)));
        return;
      }

      var titlePath  = info.titles.length ? info.titles : [node.name || ""];
      var title      = titlePath[titlePath.length - 1];
      var relPath    = global.nodePath(node) || path;
      var mdUrl      = global.DOCS_BASE + "/" + relPath + "/page.md";
      var articleUrl = global.SITE_ORIGIN + global.docHref(relPath);

      /* 初始 SEO（描述先用占位，正文出来后会 refresh） */
      global.setArticleMeta({
        titlePath: titlePath,
        description: "ckckh2023 的文档库文章",
        url: articleUrl
      });

      /* 标题 */
      var h1 = document.getElementById("doc-title");
      if (h1) h1.textContent = title;

      /* 面包屑 */
      var breadcrumb = document.getElementById("doc-breadcrumb");
      if (breadcrumb) {
        if (info.paths.length > 1) {
          var bcHTML = "";
          for (var i = 0; i < info.paths.length - 1; i++) {
            bcHTML += '<a href="' + global.docHref(info.paths[i]) + '">' +
                        utils.escapeHTML(info.titles[i]) +
                      '</a><span class="breadcrumb-sep">/</span>';
          }
          bcHTML += '<span class="breadcrumb-current">' + utils.escapeHTML(title) + '</span>';
          breadcrumb.innerHTML = bcHTML;
        } else {
          breadcrumb.innerHTML = "";
        }
      }

      /* 并行：正文 + 侧边栏 + 分页 */
      return Promise.all([
        global.renderDocMarkdown("#doc-body", mdUrl).then(function () {
          var desc = global.extractDescription(document.querySelector("#doc-body"));
          if (desc) global.refreshArticleMeta(desc);   /* ★ core 里封装好的更新函数 */
          if (global.initDocToc) global.initDocToc();  /* ★ 正文出来后再构建 TOC */
        }),
        global.renderSidebar(relPath),
        global.renderPagination(relPath)
      ]);
    });
  }

  global.initArticlePage = initArticlePage;
})(window);