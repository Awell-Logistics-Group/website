// =========================================================
// 首页服务动画：海运 / 空运 / 卡车 / 仓储
//
// 空运是单独的镜头（air2d.js，线条风格的透视动画）：飞机飞来 → 穿过云层 → 画面变白 → 光点 → 地图。
//
// 海运 / 卡车 / 仓储每次切换播放一段约 4 秒的转场：
//   1. 等轴测小场景出现（船 / 飞机 / 卡车 / 仓库），自带小循环动作
//   2. 小场景缩小成一个点，飞到航线起点
//   3. 点阵地图淡入，航线一条条画出来
//   4. 小圆点沿主航线跑到终点，然后轻轻脉动
// 用浏览器自带的 Web Animations API（element.animate）实现，不依赖任何库。
// =========================================================
(function () {
  var root = document.querySelector("[data-lanes]");
  if (!root) return;

  var svg = root.querySelector(".lane-stage svg");
  var scene = svg.querySelector(".scene");
  var dots = svg.querySelector(".map-dots");
  var zoom = svg.querySelector(".zoom");
  var markerScale = svg.querySelector(".marker-scale");
  var spark = root.querySelector(".lane-fx .spark");
  var stage = root.querySelector(".lane-stage");
  var airSvg = stage.querySelector(".lane-air");
  var white = stage.querySelector(".lane-white");
  var marker = svg.querySelector(".marker");
  var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-mode]"));
  var labelSets = root.querySelectorAll(".lane-label-set");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var EASE = "cubic-bezier(.65,0,.35,1)";
  var running = [];        // 当前这一轮的所有动画，切换时统一取消
  var rafId = null;
  var current = null;
  var token = 0;           // 每次切换 +1，用来让旧的回调失效

  function anim(el, frames, opts) {
    opts.fill = "both";
    var a = el.animate(frames, opts);
    running.push(a);
    return a;
  }

  function stopAll() {
    running.forEach(function (a) { a.cancel(); });
    running = [];
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    marker.classList.remove("is-arrived");
    svg.querySelectorAll(".arc-glow").forEach(function (g) { g.style.strokeDashoffset = ""; });
    airSvg.classList.remove("is-on");
    svg.querySelectorAll(".vignette.is-live").forEach(function (v) { v.classList.remove("is-live"); });
  }

  function setLabels(mode) {
    labelSets.forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-for") === mode); });
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-mode") === mode;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
  }

  // 小圆点沿路径移动（getPointAtLength 取路径上的坐标）
  function travel(path, start, duration, my, trails) {
    var len = path.getTotalLength();
    trails = trails || [];
    function frame(now) {
      if (my !== token) return;
      var t = Math.min(1, Math.max(0, (now - start) / duration));
      var e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
      var p = path.getPointAtLength(e * len);
      marker.setAttribute("transform", "translate(" + p.x + " " + p.y + ")");
      trails.forEach(function (tr) { tr.style.strokeDashoffset = 1 - e; });   // 尾迹跟着光点画出来
      if (t < 1) rafId = requestAnimationFrame(frame);
      else marker.classList.add("is-arrived");
    }
    rafId = requestAnimationFrame(frame);
  }

  function play(mode) {
    var my = ++token;
    stopAll();
    current = mode;
    setLabels(mode);

    var lane = svg.querySelector('.lane[data-lane="' + mode + '"]');
    var vig = svg.querySelector('.vignette[data-vignette="' + mode + '"]');
    var arcs = lane.querySelectorAll(".arc");
    var main = lane.querySelector(".arc-main");
    var nodes = lane.querySelectorAll(".node");
    var cities = lane.querySelectorAll(".city");
    var start = main.getPointAtLength(0);

    // 镜头：卡车和仓储推近到美国。读取这一组航线的缩放设置，套到地图上
    var z = lane.getAttribute("data-zoom");
    var m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(z);
    var tx = +m[1], ty = +m[2], s = +m[3];
    zoom.setAttribute("transform", z);
    markerScale.setAttribute("transform", "scale(" + (1 / s) + ")");   // 圆点不跟着地图一起变大
    var startOnScreen = { x: start.x * s + tx, y: start.y * s + ty };   // 起点在画面上的位置

    // 只显示当前这一组航线
    svg.querySelectorAll(".lane").forEach(function (l) { if (l !== lane) l.style.opacity = 0; });
    lane.style.opacity = "";

    // 减少动画模式：直接显示最终状态
    if (reduce) {
      anim(dots, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
      anim(lane, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
      arcs.forEach(function (a) { anim(a, [{ strokeDashoffset: 0 }, { strokeDashoffset: 0 }], { duration: 1 }); });
      nodes.forEach(function (n) { anim(n, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); });
      cities.forEach(function (c) { anim(c, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 }); });
      var end = main.getPointAtLength(main.getTotalLength());
      marker.setAttribute("transform", "translate(" + end.x + " " + end.y + ")");
      anim(marker, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
      return;
    }

    var glow = lane.querySelector(".arc-glow");

    if (mode === "air") { playAirMode(my, lane, arcs, main, glow, nodes, cities, startOnScreen); return; }

    // 1. 小场景出现
    var box = vig.getBBox();
    var cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    vig.style.transformBox = "view-box";
    vig.style.transformOrigin = cx + "px " + cy + "px";
    vig.classList.add("is-live");
    anim(vig, [
      { opacity: 0, transform: "translate(0px, 12px) scale(.96)" },
      { opacity: 1, transform: "translate(0px, 0px) scale(1)", offset: .2 },
      { opacity: 1, transform: "translate(0px, 0px) scale(1)", offset: .66 },
      { opacity: 1, transform: "translate(" + (startOnScreen.x - cx) + "px, " + (startOnScreen.y - cy) + "px) scale(.05)", offset: .94 },
      { opacity: 0, transform: "translate(" + (startOnScreen.x - cx) + "px, " + (startOnScreen.y - cy) + "px) scale(.03)" }
    ], { duration: 2500, easing: "linear" });

    // 2. 地图和航线
    anim(dots, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 1850, easing: EASE });
    anim(lane, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 2050 });
    arcs.forEach(function (a, i) {
      var isMain = a === main;
      anim(a, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: isMain ? 1300 : 950, delay: isMain ? 2250 : 2150 + i * 70, easing: EASE });
    });
    nodes.forEach(function (n, i) {
      anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 2150 + i * 40 });
    });
    cities.forEach(function (c) {
      anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 2700 });
    });

    // 3. 小圆点沿主航线移动
    marker.setAttribute("transform", "translate(" + start.x + " " + start.y + ")");
    anim(marker, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 2350 });
    setTimeout(function () {
      if (my !== token) return;
      vig.classList.remove("is-live");
      travel(main, performance.now(), 1500, my, [glow]);
    }, 2450);
  }

  // ---------- 空运：飞机镜头 + 光点 ----------
  var airModule = null;
  function loadAir() {
    if (!airModule) airModule = import("./air2d.js").catch(function () { airModule = null; return null; });
    return airModule;
  }

  function playAirMode(my, lane, arcs, main, glow, nodes, cities, origin) {
    var from = { x: 500, y: 150 };          // 光点亮起的位置（有飞机时 = 飞机在画面上的位置）
    loadAir().then(function (mod) {
      if (my !== token) return;
      if (!mod) { sparkIn(0); mapPhase(380); return; }       // 加载失败：直接从光点开始
      airSvg.classList.add("is-on");
      // 白光：飞机进云时慢慢变白
      anim(white, [{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: (mod.WHITE_AT - 0.2) * 1000, easing: "ease-in" });
      // 飞机在白光里淡出（画面边缘白光盖不到的地方也一起消失）
      anim(airSvg, [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: (mod.WHITE_AT - 0.05) * 1000, easing: "ease-in" });
      mod.playAir(airSvg, {
        cancelled: function () { return my !== token; },
        onWhiteout: function (pos) { if (my !== token) return; from = pos; sparkIn(0); }
      }).then(function (res) {
        if (!res || my !== token) return;
        airSvg.classList.remove("is-on");
        mapPhase(0);
      });
    });

    // 光点在白光里亮起（飞机“变成”光点）
    function sparkIn(delay) {
      var at = "translate(" + from.x + "px, " + from.y + "px)";
      anim(spark, [
        { opacity: 0, transform: at + " scale(0)" },
        { opacity: 1, transform: at + " scale(2.6)" }
      ], { duration: 380, delay: delay, easing: "cubic-bezier(.2,.8,.2,1)" });
    }

    // 地图部分：白光散开，光点飞到起点，航线画出，光点沿主航线飞到美国
    function mapPhase(d) {
      anim(dots, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: d, easing: EASE });
      anim(lane, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: d });
      anim(white, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: d, easing: "ease-out" });
      var at = "translate(" + from.x + "px, " + from.y + "px)";
      anim(spark, [
        { opacity: 1, transform: at + " scale(2.6)" },
        { opacity: 1, transform: "translate(" + origin.x + "px, " + origin.y + "px) scale(1)", offset: .85 },
        { opacity: 0, transform: "translate(" + origin.x + "px, " + origin.y + "px) scale(1)" }
      ], { duration: 750, delay: d + 100, easing: EASE });
      arcs.forEach(function (a, i) {
        if (a === main) return;                 // 主航线留给光点自己画
        anim(a, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, delay: d + 300 + i * 55, easing: EASE });
      });
      nodes.forEach(function (n, i) { anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: d + 300 + i * 30 }); });
      cities.forEach(function (c) { anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: d + 900 }); });
      var p0 = main.getPointAtLength(0);
      marker.setAttribute("transform", "translate(" + p0.x + " " + p0.y + ")");
      anim(marker, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: d + 760 });
      setTimeout(function () {
        if (my !== token) return;
        travel(main, performance.now(), 1600, my, [main, glow]);
      }, d + 820);
    }
  }

  // 切换：如果已经有画面，先整体淡出 0.2 秒再播放新的，看起来更顺
  function select(mode, force) {
    if (mode === current && !force) return;
    var my = ++token;
    if (current && !reduce) {
      var fade = scene.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
      fade.onfinish = function () {
        if (my !== token) return;
        play(mode);
        fade.cancel();
      };
    } else {
      play(mode);
    }
  }

  // 电脑：鼠标停留 0.12 秒就切换（避免鼠标划过时连续触发）；手机和键盘：点击切换
  var hoverTimer;
  tabs.forEach(function (tab) {
    var mode = tab.getAttribute("data-mode");
    tab.addEventListener("pointerenter", function (e) {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { select(mode); }, 120);
    });
    tab.addEventListener("pointerleave", function () { clearTimeout(hoverTimer); });
    tab.addEventListener("click", function () { clearTimeout(hoverTimer); select(mode, mode !== current); });
    // 键盘左右键在选项之间移动
    tab.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(tab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        select(next.getAttribute("data-mode"));
        e.preventDefault();
      }
    });
  });

  // 网页加载完 2 秒后，悄悄预先加载空运的镜头（这样切到空运时马上能播）
  window.addEventListener("load", function () { setTimeout(function () { if (!reduce) loadAir(); }, 2000); });
  tabs.forEach(function (t) {
    if (t.getAttribute("data-mode") === "air") t.addEventListener("pointerenter", function () { if (!reduce) loadAir(); });
  });

  // 页面打开时：滚动到能看见动画时，自动播放海运
  var first = tabs[0].getAttribute("data-mode");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); setTimeout(function () { if (!current) select(first); }, 300); }
    }, { threshold: .35 });
    io.observe(svg);
  } else {
    select(first);
  }
})();
