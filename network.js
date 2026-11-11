// =========================================================
// 首屏视频：高清 / 标准两份，自动选
//   电脑大屏、网速正常 → 先试高清（hero-hd.mp4）
//   手机小屏、省流量模式、网速慢 → 直接用标准（hero.mp4）
//   高清 2.5 秒还没开始播，或者播的时候卡住（缓冲）→ 立刻换成标准版，
//   并且记住：这次访问后面都用标准版
// =========================================================
(function () {
  var v = document.querySelector(".hero-frame video");
  if (!v) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {   // 减少动态效果：不播视频，直接显示最后一帧（飞机、船、卡车都在）
    if (v.getAttribute("data-end")) v.poster = v.getAttribute("data-end");
    return;
  }

  var SD = v.getAttribute("data-sd"), HD = v.getAttribute("data-hd");
  var c = navigator.connection || {};
  var slowNet = c.saveData || /(^|-)2g|3g/.test(c.effectiveType || "") || (c.downlink && c.downlink < 5);
  var bigScreen = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) >= 1600;
  var hadTrouble = false;
  try { hadTrouble = sessionStorage.getItem("awell-video-sd") === "1"; } catch (e) {}

  function useSD() {
    if (v.getAttribute("src") === SD) return;
    try { sessionStorage.setItem("awell-video-sd", "1"); } catch (e) {}
    var t = v.currentTime || 0;
    v.src = SD;
    v.addEventListener("loadedmetadata", function once() {
      v.removeEventListener("loadedmetadata", once);
      if (t > 0 && t < v.duration) v.currentTime = t;   // 从刚才卡住的地方接着播
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
  }

  if (!HD || slowNet || !bigScreen || hadTrouble) { v.src = SD; return; }

  v.src = HD;
  var started = false;
  v.addEventListener("playing", function () { started = true; }, { once: true });
  setTimeout(function () { if (!started && !v.ended) useSD(); }, 2500);          // 高清迟迟起不来
  v.addEventListener("waiting", function () {                                    // 播放中卡住缓冲
    if (started && v.getAttribute("src") === HD) useSD();
  });
})();

// =========================================================
// 前两屏的出场动画：每次翻到这一屏都从头播一遍；停在这一屏时播完就静止
//   首屏：页面一打开就播；离开后再回来，重新播
//   第二屏（地图）：标题和说明文字先出来 → 地图 → 城市点 → 航线 → 圆形图标
// 做法：这一屏完全离开屏幕时把动画“复位”（这时看不见，所以复位不会被看到），
//       再滑回来、露出三分之一时重新开始。
// =========================================================
(function () {
  var hero = document.querySelector(".hero-frame");
  var net = document.querySelector(".network");
  if (net) net.classList.add("js");              // 有 JS 才先把地图元素藏起来，没 JS 时直接显示
  if (!("IntersectionObserver" in window)) { if (net) net.classList.add("is-in"); return; }

  var video = hero && hero.querySelector("video");
  var stillVideo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;   // 设置了“减少动态效果”：视频不播
  function play(el) {
    if (el === net) { el.classList.add("is-in"); return; }
    if (el.classList.contains("is-out") && video && !stillVideo) {
      // 首屏视频：播完会停在最后一帧（没有 loop）；翻回来时从头再播一遍
      video.currentTime = 0;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});   // 个别手机省电模式不让自动播放：保持静止画面就行
    }
    el.classList.remove("is-out");               // 首屏：去掉 is-out，CSS 动画重新开始
  }
  function reset(el) {
    if (el === net) el.classList.remove("is-in");
    else el.classList.add("is-out");             // 首屏：is-out 会暂时去掉动画
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      // 只剩一条边（不到 3%）也算离开：两屏紧挨着，翻过去后上一屏会“贴着”屏幕边，浏览器仍算它可见
      if (!e.isIntersecting || e.intersectionRatio < 0.03) reset(e.target);   // 离开了：复位
      else if (e.intersectionRatio >= 0.35) play(e.target);                   // 露出 35% 以上就开始播（已经在播就不会重复）
    });
  }, { threshold: [0, 0.03, 0.35], rootMargin: "-69px 0px 0px 0px" });   // 顶栏挡住的 69px 不算“看得见”
  [hero, net].forEach(function (el) { if (el) io.observe(el); });
})();
