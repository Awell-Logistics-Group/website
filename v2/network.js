// =========================================================
// 前两屏的出场动画：每次翻到这一屏都从头播一遍；停在这一屏时播完就静止
//   首屏：页面一打开就播；离开后再回来，重新播
//   第二屏（地图）：文字 → 地图 → 城市点 → 航线 → 圆形图标 → 说明
// 做法：这一屏完全离开屏幕时把动画“复位”（这时看不见，所以复位不会被看到），
//       再翻回来、露出大半屏时重新开始。
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
      else if (e.intersectionRatio >= 0.6) play(e.target);                    // 露出 60% 以上：播放（已经在播就不会重复）
    });
  }, { threshold: [0, 0.03, 0.6], rootMargin: "-69px 0px 0px 0px" });   // 顶栏挡住的 69px 不算“看得见”
  [hero, net].forEach(function (el) { if (el) io.observe(el); });
})();

// ===== 前两屏：滚轮 / 触控板滚一下就翻一整屏 =====
// 手机上手指滑动和键盘（↓ / PageDown）用的是 styles.css 里的 scroll-snap，浏览器自己处理；
// 这里只管电脑的滚轮和触控板：浏览器默认会“滚一点又弹回去”，所以改成每次直接翻到下一屏。
(function () {
  var net = document.querySelector(".network");
  var rest = document.querySelector(".after-intro");
  if (!net || !rest) return;
  var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var busy = false, started = 0, lastWheel = 0;

  var bar = document.querySelector(".topbar");
  // 三个停靠位置：首屏、地图、后面的内容。第三个要往上让出顶栏的高度，不然数字那一栏的上半截被顶栏挡住
  function stops() { return [0, net.offsetTop, rest.offsetTop - (bar ? bar.offsetHeight : 0)]; }
  function release() {
    // 触控板松手后还会“惯性”发一阵滚动事件：等它停了再接受下一次翻页，不然一下翻两屏
    var now = Date.now();
    if (now - started > 700 && now - lastWheel > 180) busy = false;
    else setTimeout(release, 60);
  }

  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;   // Ctrl+滚轮是缩放；横向滑动不管
    if (busy) { e.preventDefault(); lastWheel = Date.now(); return; }   // 正在翻页：这次滑动剩下的惯性全部吃掉
    var y = window.scrollY, s = stops(), down = e.deltaY > 0;
    if (down && y >= s[2] - 2) return;          // 已经到后面的内容了：正常滚动
    if (!down && (y > s[2] + 2 || y <= 0)) return;
    e.preventDefault();
    lastWheel = Date.now();
    if (Math.abs(e.deltaY) < 2) return;
    var target = down
      ? s.filter(function (v) { return v > y + 2; })[0]
      : s.filter(function (v) { return v < y - 2; }).pop();
    if (target === undefined) return;
    busy = true; started = Date.now();
    window.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    release();
  }, { passive: false });
})();
