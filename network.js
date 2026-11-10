// =========================================================
// 第二屏（物流网络地图）的出场动画
// 滚动到能看见地图时，给 section 加上 .is-in，CSS 就按顺序播放：
// 文字 → 地图 → 城市点 → 航线 → 圆形图标 → 说明。播一次，之后静止。
// =========================================================
(function () {
  var sec = document.querySelector(".network");
  if (!sec) return;
  sec.classList.add("js");                       // 有 JS 才先把元素藏起来，没 JS 时直接显示
  if (!("IntersectionObserver" in window)) { sec.classList.add("is-in"); return; }
  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) { sec.classList.add("is-in"); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe(sec.querySelector(".net-map"));
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

  function stops() { return [0, net.offsetTop, rest.offsetTop]; }   // 三个停靠位置：首屏、地图、后面的内容
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
