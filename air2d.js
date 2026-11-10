// =========================================================
// 空运镜头（线条版）：飞机从远处飞来 → 穿过云层 → 画面变白
//
// 不用 3D 引擎。飞机是一组 3D 坐标点（机身截面、机翼、发动机……），
// 每一帧按镜头位置做“透视投影”算出在画面上的 2D 位置，再用 SVG 线条画出来。
// 所以它看起来有真实的透视和角度变化，但画风是线条 + 浅色填充，跟网站一致。
//
// 用法：playAir(svgElement, { cancelled }) → Promise（结束时 resolve）
//       WHITE_AT / END_AT：开始变白 / 结束的时间（秒），route.js 用来接地图
// =========================================================

export const WHITE_AT = 1.85;
export const END_AT = 2.35;

const NS = "http://www.w3.org/2000/svg";
const VW = 1000, VH = 300;           // 画面坐标（跟地图 SVG 一样）

// ---------- 小工具：向量运算 ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rad = (d) => d * Math.PI / 180;
const f1 = (n) => Math.round(n * 10) / 10;

// 绕任意轴旋转（侧倾用）
function rot(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

// ---------- 飞行路线：Catmull-Rom 曲线（跟之前 3D 版一样的轨迹） ----------
// 从画面左边远处 → 斜着飞向画面右前方（四分之三侧面，看得清机翼、垂尾、发动机）
const PATH = [[-230, 30, -430], [-136, 23, -270], [-56, 16, -150], [4, 11, -88], [40, 8, -54]];
function curve(u) {
  const n = PATH.length - 1, x = Math.min(n - 1e-6, u * n), i = Math.floor(x), t = x - i;
  const p0 = PATH[Math.max(0, i - 1)], p1 = PATH[i], p2 = PATH[i + 1], p3 = PATH[Math.min(n, i + 2)];
  const c = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
  return [c(0), c(1), c(2)];
}

// =========================================================
// 飞机的 3D 形状（机头 +X，机背 +Y，右翼 +Z；单位约等于米 / 2）
// =========================================================
const L = 40, R = 2.05;
function fuselageSection(t) {             // t：0 机尾 → 1 机头；返回 [半径, 上移, 上下拉伸]
  if (t > 0.86) { const u = (t - 0.86) / 0.14; return [Math.max(0.05, R * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2)))), -0.35 * u * u, 1.06]; }
  if (t < 0.27) { const u = (0.27 - t) / 0.27; return [R * (1 - 0.86 * Math.pow(u, 1.35)), R * 0.95 * Math.pow(u, 1.5), 1.06 + 0.25 * u]; }
  return [R, 0, 1.06];
}
// 机身截面上的点：角度 a（0 = 右侧，90° = 机背）
function fusPoint(t, a) {
  const [r, dy, sq] = fuselageSection(t);
  return [-L / 2 + t * L, dy + Math.sin(a) * r * sq, Math.cos(a) * r];
}
const STATIONS = [];
for (let i = 0; i <= 48; i++) { const u = i / 48; STATIONS.push(u < 0.5 ? u * u * 2 * 0.5 + u * 0.5 : u); }

function wingPlan(rootLE, rootTE, span, sweep, tipChord) {
  const tipLE = rootLE - span * Math.tan(rad(sweep));
  return { rootLE, rootTE, span, tipLE, tipTE: tipLE - tipChord };
}
const WING = wingPlan(6.7, -3.1, 18.5, 31, 2.3);       // 已经包含机翼在机身上的前后位置
const HT = wingPlan(-14.6, -18.6, 7.2, 34, 1.5);
const DIHEDRAL = Math.tan(rad(6));

// ---------- 颜色 ----------
const INK = "#0F2744", CYAN = "#1E9BD7", NAVY = "#10305C";
const mix = (c1, c2, t) => {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
};

// =========================================================
// 搭建 SVG 图层
// =========================================================
function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function setup(svg) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
  const defs = el("defs", {}, svg);
  // 机身渐变：方向每帧更新（机背亮 → 机腹暗），做出圆柱的立体感
  const grad = el("linearGradient", { id: "fusGrad", gradientUnits: "userSpaceOnUse" }, defs);
  [["0", "#FFFFFF"], [".45", "#F4F7FB"], [".78", "#DCE5EF"], ["1", "#BFCCDC"]].forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, grad));
  const engGrad = el("linearGradient", { id: "engGrad", gradientUnits: "userSpaceOnUse" }, defs);
  [["0", "#FFFFFF"], [".6", "#E3EAF2"], ["1", "#B9C7D8"]].forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, engGrad));
  // 云：柔和边缘
  const blur = el("filter", { id: "cloudSoft", x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
  el("feGaussianBlur", { stdDeviation: "1.2" }, blur);

  const farClouds = el("g", {}, svg);
  const planeG = el("g", { "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const nearClouds = el("g", {}, svg);
  return { svg, grad, engGrad, farClouds, planeG, nearClouds };
}

// =========================================================
// 镜头和投影
// =========================================================
function makeCamera(pos, target, rollDeg, fovDeg) {
  const fwd = norm(sub(target, pos));
  let right = norm(cross(fwd, [0, 1, 0]));
  let up = cross(right, fwd);
  const r = rad(rollDeg);
  right = rot(right, fwd, r); up = rot(up, fwd, r);
  const focal = (VH / 2) / Math.tan(rad(fovDeg) / 2);
  return {
    pos, fwd, right, up,
    // 3D 点 → 画面坐标；返回 [x, y, 深度]
    project(p) {
      const d = sub(p, pos);
      const z = Math.max(0.5, dot(d, fwd));
      return [VW / 2 + dot(d, right) * focal / z, VH / 2 - dot(d, up) * focal / z, z];
    }
  };
}

// =========================================================
// 每一帧：把飞机和云投影到画面上，重画 SVG
// =========================================================
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const c = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && c(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && c(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
const poly = (pts) => "M" + pts.map((q) => f1(q[0]) + " " + f1(q[1])).join("L") + "Z";
const line = (pts) => "M" + pts.map((q) => f1(q[0]) + " " + f1(q[1])).join("L");

// 一个“零件”：带描边的形状。先画粗描边再画填充，重叠部分的描边会被盖住，只留外轮廓
function part(depth, d, fill, opts = {}) { return { depth, d, fill, ...opts }; }

function drawFrame(L2, t) {
  // ----- 飞机位置和姿态 -----
  const ease = (x) => 1 - Math.pow(1 - x, 2.2);
  const u = Math.min(0.97, ease(Math.min(1, t / 2.15)));
  const P = curve(u), P2 = curve(Math.min(1, u + 0.01));
  let f = norm(sub(P2, P));
  let rgt = norm(cross(f, [0, 1, 0]));
  let up = cross(rgt, f);
  const bank = rad(12 - 8 * u);              // 侧倾：朝镜头方向转弯，近侧机翼往下压，慢慢回正
  rgt = rot(rgt, f, bank); up = rot(up, f, bank);
  // 机头稍微抬一点
  const pitch = rad(4);
  const f2 = rot(f, rgt, pitch); up = rot(up, rgt, pitch); f = f2;
  const W = (x, y, z) => add(add(add(P, mul(f, x)), mul(up, y)), mul(rgt, z));   // 飞机坐标 → 世界坐标

  // ----- 镜头：低角度仰拍，跟着飞机，最后推进云里 -----
  // 镜头：略低于飞机（轻微仰拍），视线跟着飞机走但慢半拍；最后往前推，跟着飞机冲进云里
  const camPos = [-10 + 22 * smooth(0, 2.35, t), -2 + 3 * smooth(0, 2.35, t), 20 - 46 * smooth(1.35, 2.35, t)];
  const look = add(mul(P, 0.82), [6, 2, 0]);
  const fov = 27 / Math.sqrt((VW / VH) / 1.6);       // 长焦：远处的飞机也够大，透视不夸张
  const cam = makeCamera(camPos, look, -3 + 3 * smooth(0, 2.3, t), fov);
  const pr = (p) => cam.project(p);
  const view = (p) => norm(sub(cam.pos, p));            // 从某点看向镜头的方向
  const LIGHT = norm([0.3, 1, 0.4]);

  const parts = [];

  // ----- 机身轮廓：每个截面投影成椭圆，取凸包拼出外形 -----
  const ringPts = STATIONS.map((st) => {
    const pts = [];
    for (let k = 0; k < 20; k++) pts.push(pr(W(...fusPoint(st, k / 20 * Math.PI * 2))));
    return pts;
  });
  // 相邻两个截面的凸包连起来 = 机身（可以正确处理上翘的尾段）
  let fusD = "";
  for (let i = 0; i < ringPts.length - 1; i++) fusD += poly(convexHull(ringPts[i].concat(ringPts[i + 1])));
  const center = W(0, 0, 0);
  const fusDepth = pr(center)[2];
  fusDepthNow = fusDepth;
  L2.last = pr(W(6, 0, 0));       // 记住飞机在画面上的位置：光点从这里亮起
  // 渐变方向：机背 → 机腹，在画面上的方向
  const cTop = pr(W(0, R * 1.06, 0)), cBot = pr(W(0, -R * 1.06, 0));
  L2.grad.setAttribute("x1", f1(cTop[0])); L2.grad.setAttribute("y1", f1(cTop[1]));
  L2.grad.setAttribute("x2", f1(cBot[0])); L2.grad.setAttribute("y2", f1(cBot[1]));
  parts.push(part(fusDepth, fusD, "url(#fusGrad)", { merge: true }));

  // 机身上的细节：只画朝向镜头的一侧（腰线、窗户、驾驶舱窗）
  const sideA = dot(rgt, view(center)) > 0 ? 0.0 : Math.PI;              // 右侧还是左侧朝镜头
  const sgn = sideA === 0 ? 1 : -1;
  const facing = (st, a) => {
    const [r, dy, sq] = fuselageSection(st);
    const n = norm(add(mul(up, Math.sin(a) / sq), mul(rgt, Math.cos(a))));
    return dot(n, view(W(...fusPoint(st, a)))) > 0.05;
  };
  const deco = [];
  const aWin = sideA + sgn * rad(-18) * -1;          // 窗户：侧面偏上
  const aWinFix = sideA === 0 ? rad(18) : Math.PI - rad(18);
  const aLine = sideA === 0 ? rad(-4) : Math.PI + rad(4);
  // 腰线
  const cheat = [];
  for (let st = 0.2; st <= 0.9; st += 0.02) if (facing(st, aLine)) cheat.push(pr(W(...fusPoint(st, aLine))));
  if (cheat.length > 2) deco.push({ d: line(cheat), stroke: CYAN, w: 2.2 });
  const cheat2 = [];
  const aLine2 = sideA === 0 ? rad(-10) : Math.PI + rad(10);
  for (let st = 0.2; st <= 0.88; st += 0.02) if (facing(st, aLine2)) cheat2.push(pr(W(...fusPoint(st, aLine2))));
  if (cheat2.length > 2) deco.push({ d: line(cheat2), stroke: NAVY, w: 1.1 });
  // 客舱窗户（小圆点）
  let winD = "";
  for (let st = 0.26; st < 0.84; st += 0.0125) {
    if (Math.abs(st - 0.52) < 0.012 || Math.abs(st - 0.79) < 0.01) continue;
    if (!facing(st, aWinFix)) continue;
    const q = pr(W(...fusPoint(st, aWinFix)));
    const s = Math.max(0.5, 140 / q[2]) * 0.35;
    winD += "M" + f1(q[0] - s) + " " + f1(q[1]) + "a" + f1(s) + " " + f1(s * 1.25) + " 0 1 0 " + f1(2 * s) + " 0a" + f1(s) + " " + f1(s * 1.25) + " 0 1 0 " + f1(-2 * s) + " 0";
  }
  if (winD) deco.push({ d: winD, fill: NAVY });
  // 舱门
  [0.52, 0.79].forEach((st) => {
    if (!facing(st, aWinFix)) return;
    const a1 = sideA === 0 ? rad(-6) : Math.PI + rad(6), a2 = sideA === 0 ? rad(30) : Math.PI - rad(30);
    const q = [pr(W(...fusPoint(st - 0.008, a1))), pr(W(...fusPoint(st + 0.008, a1))), pr(W(...fusPoint(st + 0.008, a2))), pr(W(...fusPoint(st - 0.008, a2)))];
    deco.push({ d: poly(q), stroke: "#9FB1C7", w: 0.8 });
  });
  // 驾驶舱窗
  const cockpit = [];
  for (let k = 0; k < 4; k++) {
    const a = sideA === 0 ? rad(30 + k * 16) : Math.PI - rad(30 + k * 16);
    if (!facing(0.945, a)) continue;
    const q = [pr(W(...fusPoint(0.935, a))), pr(W(...fusPoint(0.955, a + rad(6)))), pr(W(...fusPoint(0.955, a + rad(12) * (sideA === 0 ? 1 : -1)))), pr(W(...fusPoint(0.935, a + rad(10) * (sideA === 0 ? 1 : -1))))];
    cockpit.push(poly(q));
  }
  if (cockpit.length) deco.push({ d: cockpit.join(""), fill: INK });
  parts.push(part(fusDepth - 0.01, "", "none", { deco }));

  // ----- 机翼、平尾：上下表面选朝向镜头的那一面画，颜色按受光程度深浅 -----
  function plate(plan, side, y0, dihedral, xOff, thick, baseColor) {
    const z0 = side * R * 0.75;
    const zt = side * (plan.span + R * 0.75);
    const lift = (z) => Math.abs(z) * dihedral;
    const pts = [
      [plan.rootLE + xOff, y0 + lift(z0), z0], [plan.tipLE + xOff, y0 + lift(zt), zt],
      [plan.tipTE + xOff, y0 + lift(zt), zt], [plan.rootTE + xOff, y0 + lift(z0), z0]
    ];
    const wp = pts.map((q) => W(...q));
    const nrm = norm(cross(sub(wp[1], wp[0]), sub(wp[3], wp[0])));
    const mid = mul(add(add(wp[0], wp[1]), add(wp[2], wp[3])), 0.25);
    const facingUp = dot(nrm, view(mid)) * side > 0;          // 看到的是上表面还是下表面
    const off = facingUp ? thick / 2 : -thick / 2;
    const top = pts.map((q) => pr(W(q[0], q[1] + off, q[2])));
    const bot = pts.map((q) => pr(W(q[0], q[1] - off, q[2])));
    // 受光：上表面亮，下表面暗
    const lit = Math.max(0, dot(mul(nrm, side * (facingUp ? 1 : -1)), LIGHT));
    const col = facingUp ? mix("#C9D5E3", "#F6F9FC", lit) : mix("#A9B9CC", "#D9E2EC", lit);
    const depth = pr(mid)[2];
    const out = [part(depth, poly([bot[0], bot[1], top[1], top[0]]), mix("#9FB1C7", "#E3EAF2", lit))];   // 前缘厚度
    out.push(part(depth - 0.001, poly(top), col));
    return { out, tip: pts[1], tipTE: pts[2], depth };
  }
  [1, -1].forEach((side) => {
    const w = plate(WING, side, -1.05, DIHEDRAL, 0, 0.5, "#E3EAF2");
    parts.push(...w.out);
    // 翼梢小翼（海军蓝）
    const t0 = w.tip, t1 = w.tipTE;
    const wl = [[t0[0] + 0.1, t0[1], t0[2]], [t0[0] - 1.5, t0[1] + 2.6, t0[2]], [t0[0] - 2.3, t0[1] + 2.6, t0[2]], [t1[0] + 0.1, t1[1], t1[2]]].map((q) => pr(W(...q)));
    parts.push(part(w.depth - 0.002, poly(wl), "#C9D5E3"));
    // 发动机
    engine(side, parts, W, pr, view, f);
    const h = plate(HT, side, R * 0.95, Math.tan(rad(5)), 0, 0.28, "#E3EAF2");
    parts.push(...h.out);
  });

  // ----- 垂尾：海军蓝 + 青色条 -----
  const finPts = [[-12.4, 1.95, 0], [-17.6, 10.35, 0], [-20.4, 10.35, 0], [-19.6, 1.95, 0]];
  const finD = pr(W(-17, 6, 0))[2];
  parts.push(part(finD, poly(finPts.map((q) => pr(W(...q)))), NAVY));
  const band = [[-14.2, 4.55, 0], [-15.4, 6.45, 0], [-19.6, 6.45, 0], [-19.4, 4.55, 0]];
  parts.push(part(finD - 0.001, poly(band.map((q) => pr(W(...q)))), CYAN));

  // ----- 由远到近排序后画出来 -----
  parts.sort((a, b) => b.depth - a.depth);
  const g = L2.planeG;
  g.innerHTML = "";
  const sw = Math.min(2.2, Math.max(0.8, 220 / fusDepth));      // 描边粗细随距离变化（近粗远细）
  parts.forEach((p) => {
    if (p.d) {
      el("path", { d: p.d, fill: "none", stroke: INK, "stroke-width": f1(sw * 2) }, g);
      el("path", { d: p.d, fill: p.fill, stroke: p.merge ? "none" : p.fill }, g);
    }
    if (p.deco) p.deco.forEach((d) => el("path", { d: d.d, fill: d.fill || "none", stroke: d.stroke || "none", "stroke-width": d.w ? f1(d.w * sw / 1.6) : 0 }, g));
  });

  // ----- 云：按 3D 位置投影，离镜头越近越大，冲过镜头时变白 -----
  drawClouds(L2, cam, t);
}

// 发动机：短舱（凸包轮廓 + 渐变）、进气口（深色椭圆 + 唇口）、挂架
function engine(side, parts, W, pr, view, fwd) {
  const cx = 4.1, cy = -2.35, cz = side * 7.94, len = 5.8, r = 1.33;
  const ring = (x, rr) => { const o = []; for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; o.push(pr(W(cx + x, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr))); } return o; };
  const front = ring(2.6, 1.16), mid = ring(1.0, r), back = ring(-2.6, 0.75);
  const hull = convexHull(front.concat(mid, back));
  const depth = pr(W(cx, cy, cz))[2];
  parts.push(part(depth + 0.3, poly([pr(W(cx + 1.6, cy + 1.2, cz)), pr(W(cx - 2.2, cy + 1.2, cz)), pr(W(cx - 1.4, cy + 2.5, cz)), pr(W(cx + 2.4, cy + 2.5, cz))]), "#E9EEF4"));   // 挂架
  parts.push(part(depth, poly(hull), "url(#engGrad)", { merge: true }));
  // 进气口是否朝向镜头
  const inletC = W(cx + 2.6, cy, cz);
  const facingFront = dot(fwd, view(inletC)) > 0;
  const deco = [];
  if (facingFront) {
    deco.push({ d: poly(front), fill: "#1B2B44" });
    deco.push({ d: poly(ring(2.62, 1.16)), stroke: "#C9D5E3", w: 1.6 });
    const sp = ring(2.7, 0.3);
    deco.push({ d: poly(sp), fill: "#C9D5E3" });
  }
  const stripe = ring(1.0, r + 0.01);
  // 青色环：只画朝向镜头的那一半
  const half = [];
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2, p = W(cx + 1.0, cy + Math.sin(a) * r, cz + Math.cos(a) * r);
    const n = sub(p, W(cx + 1.0, cy, cz));
    if (dot(n, view(p)) > 0) half.push(stripe[k]);
  }
  if (half.length > 2) deco.push({ d: line(half), stroke: CYAN, w: 2 });
  parts.push(part(depth - 0.01, "", "none", { deco }));
}

// ---------- 云 ----------
let CLOUDS = null;
function makeClouds() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const list = [];
  // 远处的几团云：给画面层次
  for (let i = 0; i < 3; i++) list.push({ p: [-300 + i * 260 + rnd() * 80, -150 + rnd() * 40, -800 - rnd() * 200], s: 170 + rnd() * 90, wall: false, k: rnd() });
  // 飞机快到镜头前时穿过的云层
  for (let i = 0; i < 12; i++) list.push({ p: [-6 + rnd() * 76, -6 + rnd() * 26, -84 + rnd() * 62], s: 18 + rnd() * 20, wall: true, k: rnd() });
  return list;
}
function cloudShape(cx, cy, r, k) {
  // 一团云 = 几个圆叠在一起，底部平一点
  const bumps = [[-0.9, 0.15, 0.55], [-0.4, -0.25, 0.7], [0.2, -0.35, 0.8], [0.75, -0.05, 0.6], [1.1, 0.2, 0.42]];
  let d = "";
  bumps.forEach(([bx, by, br]) => {
    const x = cx + bx * r, y = cy + by * r * 0.7, rr = br * r * (0.9 + k * 0.2);
    d += "M" + f1(x - rr) + " " + f1(y) + "a" + f1(rr) + " " + f1(rr * 0.8) + " 0 1 0 " + f1(2 * rr) + " 0a" + f1(rr) + " " + f1(rr * 0.8) + " 0 1 0 " + f1(-2 * rr) + " 0";
  });
  return d;
}
let fusDepthNow = 1e9;
function drawClouds(L2, cam, t) {
  CLOUDS = CLOUDS || makeClouds();
  const far = L2.farClouds, near = L2.nearClouds;
  far.innerHTML = ""; near.innerHTML = "";
  const wallIn = smooth(1.25, 1.7, t);
  const layers = { far: [], wall: [], near: [] };
  CLOUDS.forEach((c) => {
    const q = cam.project(c.p);
    if (q[2] <= 2) return;
    const r = c.s * ((VH / 2) / Math.tan(rad(20) / 2)) / q[2] * 0.5;
    if (r > 2500) return;
    const d = cloudShape(q[0], q[1], r, c.k);
    if (!c.wall) layers.far.push(d);
    else (q[2] < fusDepthNow ? layers.near : layers.wall).push(d);   // 比飞机近的云挡在飞机前面
  });
  // 同一层的云：先画所有描边，再盖上所有填充 → 合成一整团云，只留最外面的轮廓
  function layer(parent, ds, op) {
    if (!ds.length || op <= 0.01) return;
    const g = el("g", { opacity: f1(op * 100) / 100 }, parent);
    el("path", { d: ds.join(""), fill: "none", stroke: "#CFDDEC", "stroke-width": "1.4" }, g);
    el("path", { d: ds.join(""), fill: "#FFFFFF" }, g);
  }
  layer(far, layers.far, 0.6);
  layer(far, layers.wall, wallIn * 0.9);
  layer(near, layers.near, wallIn * 0.85);
}

// =========================================================
// 播放
// =========================================================
export function playAir(svg, opts = {}) {
  const L2 = setup(svg);
  CLOUDS = null;
  return new Promise((resolve) => {
    let start = null, fired = false;
    function frame(now) {
      if (opts.cancelled && opts.cancelled()) { svg.innerHTML = ""; resolve(false); return; }
      if (start === null) start = now;
      const t = (now - start) / 1000;
      drawFrame(L2, Math.min(t, END_AT));
      // 开始变白时告诉 route.js 飞机在画面上的位置，光点从这里亮起
      if (!fired && t >= WHITE_AT) { fired = true; opts.onWhiteout && opts.onWhiteout({ x: L2.last[0], y: L2.last[1] }); }
      if (t < END_AT) requestAnimationFrame(frame);
      else { resolve({ x: L2.last[0], y: L2.last[1] }); setTimeout(() => { svg.innerHTML = ""; }, 400); }
    }
    requestAnimationFrame(frame);
  });
}

// 测试用：直接画第 t 秒
export function renderAt(svg, t) { const L2 = setup(svg); CLOUDS = null; drawFrame(L2, t); }
