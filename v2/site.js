// =========================================================
// AWELL 网站公用脚本：首页和询价页都用这一个文件
// 包含：语言切换（含繁体自动转换）、照片放大、复制 + “已复制”提示
// =========================================================
  // ===== 语言切换 =====
  var root = document.documentElement;
  var HTML_LANG = { en: "en", zh: "zh-CN", zht: "zh-Hant-HK" };

  // 繁体：把页面上所有 .zh 里的简体字转换成香港繁体。
  // 第一次转换前，先把每段文字的简体原文存起来，切回“简”时还原。
  var originals = null;     // Map：文字节点 → 简体原文
  var toTrad = null;        // 转换函数，第一次选“繁”时才加载（转换库 1MB，平时不加载，网页更快）
  function zhTextNodes() {
    var nodes = [];
    document.querySelectorAll(".zh").forEach(function (el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
    });
    return nodes;
  }
  function loadConverter() {
    if (toTrad) return Promise.resolve(toTrad);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "vendor/opencc-cn2t.js";
      s.onload = function () {
        toTrad = window.OpenCC.Converter({ from: "cn", to: "hk" });   // cn = 大陆简体，hk = 香港繁体
        resolve(toTrad);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function applyChinese(lang) {
    if (lang === "zht") {
      return loadConverter().then(function (convert) {
        if (!originals) {
          originals = new Map();
          zhTextNodes().forEach(function (n) { originals.set(n, n.nodeValue); });
        }
        originals.forEach(function (text, n) { n.nodeValue = convert(text); });
      });
    }
    if (originals) originals.forEach(function (text, n) { n.nodeValue = text; });   // 还原简体
    return Promise.resolve();
  }
  function setLang(lang, save) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", HTML_LANG[lang]);
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-set-lang") === lang ? "true" : "false");
    });
    if (save) { try { localStorage.setItem("awell-lang", lang); } catch (e) {} }
    applyChinese(lang).then(function () {
      root.classList.add("lang-ready");
    }, function () {
      root.classList.add("lang-ready");    // 转换库加载失败时，至少显示简体，不让页面空白
    });
  }
  document.querySelectorAll("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });
  setLang(root.getAttribute("data-lang"), false);   // 页面打开时按自动判断的语言显示
  // ===== 照片放大（首页和相册页共用） =====
  // 点任意 .zoom 照片打开大图；左右箭头或键盘 ← → 切换；Esc 或点背景关闭。
  // 大图地址优先用 data-full（相册页的缩略图用这个指向原图），没有就用 img 本身。
  var zooms = Array.prototype.slice.call(document.querySelectorAll(".zoom"));
  if (zooms.length) {
    var box = document.createElement("dialog");
    box.className = "lightbox";
    box.innerHTML =
      '<img alt="">' +
      '<button type="button" class="lb-btn lb-close" aria-label="Close">×</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="Previous photo">‹</button>' +
      '<button type="button" class="lb-btn lb-next" aria-label="Next photo">›</button>' +
      '<p class="lb-count"></p>';
    document.body.appendChild(box);
    var boxImg = box.querySelector("img");
    var count = box.querySelector(".lb-count");
    var current = 0;

    function visibleZooms() {      // 相册页筛选后，只在当前显示的照片里切换
      return zooms.filter(function (z) { return z.offsetParent !== null; });
    }
    function show(i) {
      var list = visibleZooms();
      current = (i + list.length) % list.length;   // 到最后一张再往后，回到第一张
      var img = list[current].querySelector("img");
      boxImg.src = img.getAttribute("data-full") || img.src;
      boxImg.alt = img.alt;
      count.textContent = (current + 1) + " / " + list.length;
    }
    zooms.forEach(function (btn) {
      btn.addEventListener("click", function () {
        show(visibleZooms().indexOf(btn));
        box.showModal();
      });
    });
    box.querySelector(".lb-close").addEventListener("click", function () { box.close(); });
    box.querySelector(".lb-prev").addEventListener("click", function () { show(current - 1); });
    box.querySelector(".lb-next").addEventListener("click", function () { show(current + 1); });
    box.addEventListener("click", function (e) { if (e.target === box) box.close(); });   // 点黑色背景关闭
    box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(current - 1);
      if (e.key === "ArrowRight") show(current + 1);
    });
    // 手机上左右滑动切换
    var startX = null;
    box.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  // ===== 复制功能 =====
  // 任何带 data-copy 的元素：点击时复制内容，并弹出“已复制”提示。
  // 邮件和电话按钮同时保留原来的功能（打开邮件 / 拨号），电脑上没装邮件软件时也能直接粘贴。
  var toast = document.getElementById("toast");
  var toastTimer;
  function showToast(text) {
    var lang = root.getAttribute("data-lang");
    var label = { en: "Copied: ", zh: "已复制：", zht: "已複製：" }[lang];
    toast.textContent = label + text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }
  function copyText(text) {
    // 新浏览器用 Clipboard API；旧浏览器或本地打开文件时用备用方法
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }
  document.querySelectorAll("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function () {
      var text = el.getAttribute("data-copy");
      copyText(text).then(function () { showToast(text); }, function () {});
    });
  });

  // 页脚年份自动更新
  document.getElementById("year").textContent = new Date().getFullYear();

// ===== 首页：顶栏一开始透明压在首屏上，往下滚就变成实色 =====
(function () {
  if (!document.body.classList.contains("has-hero")) return;
  var bar = document.querySelector(".topbar");
  function upd() { bar.classList.toggle("is-solid", window.scrollY > 40); }
  window.addEventListener("scroll", upd, { passive: true });
  upd();
})();

// ===== 首屏视频：系统设置了“减少动态效果”的访客，只显示第一帧，不播放 =====
(function () {
  var v = document.querySelector(".hero-frame video");
  if (v && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { v.removeAttribute("autoplay"); v.pause(); }
})();
