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
  // 点击照片放大
  var box = document.getElementById("lightbox");
  var boxImg = document.getElementById("lightboxImg");
  if (box) {
  document.querySelectorAll(".zoom").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var img = btn.querySelector("img");
      boxImg.src = img.src;
      boxImg.alt = img.alt;
      box.showModal();
    });
  });
  document.getElementById("lightboxClose").addEventListener("click", function () { box.close(); });
  box.addEventListener("click", function (e) { if (e.target === box) box.close(); });  // 点黑色背景也能关
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
