/* ============================================================
   theme-init.js - 主题初始化逻辑
   ============================================================ */
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t !== "dark" && t !== "light") {
      t = (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  }
  catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
