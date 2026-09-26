/* ============================================================
   gb-card.js - 留言卡片共享渲染
   被首页与留言页共享引用
   ============================================================ */
(function (global) {
  "use strict";
  var utils = global.Utils;

  /* 格式化时间 */
  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* 渲染留言正文 */
  function renderBody(text) {
    var src = String(text == null ? "" : text);
    var parse = window.marked && (window.marked.parse || window.marked);
    /* 必须同时具备 marked 与 DOMPurify 才走 HTML 渲染路径；
       DOMPurify 缺失时绝不直接注入 marked 输出，避免 XSS */
    if (parse && window.DOMPurify) {
      var html = "";
      try { html = parse(src); } catch (e) { html = ""; }
      if (html) return window.DOMPurify.sanitize(html);
    }
    /* 纯文本 fallback：先 escape 再链接化，安全且保留可读性 */
    var s = utils.escapeHTML(src);
    s = s.replace(/(https?:\/\/[^\s<>"']+)/g, function (m) {
      return '<a href="' + m + '" target="_blank" rel="noopener">' + m + "</a>";
    });
    s = s.replace(/\r?\n/g, "<br>");
    return s;
  }

  /* 留言卡片 */
  function gbCardHTML(c, q) {
    var hasId = c.id != null && c.id !== "";
    var name = c.nickname || "匿名";
    var avatar = c.avatar || "";
    var time = formatTime(c.created_at);
    var initial = (name.charAt(0) || "?").toUpperCase();

    /* 头像节点与好友页类似，有 URL 就用，无 URL 退化成首字母 */
    var avatarNode = avatar
      ? '<img class="gb-avatar" src="' + utils.escapeHTML(avatar) + '" alt="' +
          utils.escapeHTML(name) + '" loading="lazy" ' +
          'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="gb-avatar-fallback" style="display:none">' + utils.escapeHTML(initial) + "</div>"
      : '<div class="gb-avatar-fallback">' + utils.escapeHTML(initial) + "</div>";

    /* 卡片右上角 #id 徽章 */
    var idBadge = hasId ? '<span class="gb-id">#' + utils.escapeHTML(String(c.id)) + "</span>" : "";

    return '<article class="card gb-card">' +
      idBadge +
      '<div class="gb-header">' + avatarNode +
        '<div class="gb-meta">' +
          '<div class="gb-name">' + highlight(name, q) + "</div>" +
          '<div class="gb-time">' + utils.escapeHTML(time) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="gb-body">' + highlightHTML(renderBody(c.body), q) + "</div>" +
    "</article>";
  }

  /* ---------- 正文截断和弹窗展开 ----------
     规则：多列布局时，正文超过 5 行则截断并显示"展开"按钮 */
  function openGbDialog(headerHTML, bodyHTML) {
    var old = document.getElementById("gb-dialog");
    if (old) old.remove();
    var mask = document.createElement("div");
    mask.id = "gb-dialog";
    mask.className = "gb-dialog-mask";
    mask.innerHTML =
      '<div class="gb-dialog" role="dialog" aria-modal="true">' +
        '<button class="gb-dialog-close" type="button" aria-label="关闭">✕</button>' +
        headerHTML +
        '<div class="gb-body gb-dialog-body">' + bodyHTML + "</div>" +
      "</div>";
    document.body.appendChild(mask);
    function close() { mask.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    mask.addEventListener("click", function (e) {
      if (e.target === mask) { close(); return; }
      if (e.target.closest(".gb-dialog-close")) { close(); return; }
    });
    document.addEventListener("keydown", onKey);
  }

  var clampContainers = [];
  var clampResizeBound = false;

  function applyClamp(container) {
    var bodies = container.querySelectorAll(".gb-body");
    var multi = window.matchMedia("(min-width: 640px)").matches;
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var card = body.closest(".gb-card");
      if (!card) continue;
      var toggle = card.querySelector(".gb-toggle");
      if (!multi) {
        body.classList.remove("is-clamp");
        if (toggle) toggle.remove();
        continue;
      }
      body.classList.remove("is-clamp");
      var prevFlex = body.style.flex;
      body.style.flex = "none";
      var fullH = body.scrollHeight;
      body.style.flex = prevFlex;
      body.classList.add("is-clamp");
      var clampH = body.clientHeight;
      if (fullH - clampH > 2) {
        if (!toggle) {
          toggle = document.createElement("button");
          toggle.className = "gb-toggle";
          toggle.type = "button";
          card.appendChild(toggle);
        }
        (function (b, cardEl, bd) {
          b.textContent = "展开";
          b.onclick = function () {
            var header = cardEl.querySelector(".gb-header");
            openGbDialog(header ? header.outerHTML : "", bd.innerHTML);
          };
        })(toggle, card, body);
      } else {
        body.classList.remove("is-clamp");
        if (toggle) toggle.remove();
      }
    }
  }

  function setupClamp(container) {
    if (!container) return;
    if (clampContainers.indexOf(container) === -1) clampContainers.push(container);
    applyClamp(container);
    if (!clampResizeBound) {
      clampResizeBound = true;
      var timer;
      window.addEventListener("resize", function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          clampContainers.forEach(applyClamp);
        }, 150);
      });
    }
  }

  global.GBCard = { formatTime: formatTime, renderBody: renderBody, gbCardHTML: gbCardHTML, setupClamp: setupClamp, openDialog: openGbDialog };
})(window);
