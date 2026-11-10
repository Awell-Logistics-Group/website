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
