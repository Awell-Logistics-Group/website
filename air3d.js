// =========================================================
// 空运 3D 镜头：飞机从远处飞来 → 冲进云层 → 画面变白
//
// 用 Three.js（网页 3D 引擎）实时渲染，飞机是用代码“建模”的，没有外部模型文件。
// route.js 只在第一次需要时才加载这个文件（以及 Three.js），平时不影响网页速度。
//
// 用法：playAir(canvas, { onWhiteout }) → Promise
//   onWhiteout(t)：飞机进云、画面开始变白时调用，route.js 接着做地图部分
// =========================================================
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

// ---------- 配色（跟网站一致） ----------
const C = {
  paint: 0xf7f9fc,   // 机身白
  belly: 0xe3e9f1,
  wing: 0xd3dce7,
  navy: 0x10305c,
  cyan: 0x1e9bd7,
  metal: 0xb9c4d2,
  dark: 0x16253b,
  sky: 0xf5f8fb      // 远处雾气颜色 = 网页背景色，让飞机“融”进背景
};

// =========================================================
// 1. 机身贴图：用 canvas 画窗户、腰线、驾驶舱窗
//    贴图横向 = 绕机身一圈（u），纵向 = 机头到机尾（t）
//    u = 0 / 1：右侧；0.25：机腹；0.5：左侧；0.75：机背
// =========================================================
function fuselageTexture() {
  const W = 2048, H = 1024;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const X = (u) => u * W;
  const Y = (t) => (1 - t) * H;   // t = 1 是机头

  // 底色 + 机腹浅灰
  g.fillStyle = "#f7f9fc"; g.fillRect(0, 0, W, H);
  const belly = g.createLinearGradient(X(0.1), 0, X(0.4), 0);
  belly.addColorStop(0, "rgba(227,233,241,0)");
  belly.addColorStop(0.5, "rgba(214,223,234,1)");
  belly.addColorStop(1, "rgba(227,233,241,0)");
  g.fillStyle = belly; g.fillRect(X(0.1), 0, X(0.3), H);

  // 两侧：腰线 + 窗户
  [[1.0, -1], [0.5, 1]].forEach(([side, dir]) => {
    // dir：往机背方向 u 的变化方向
    const uLine = side - dir * 0.045;       // 腰线略低于窗户
    g.fillStyle = "#1e9bd7"; g.fillRect(X(Math.min(uLine, uLine + dir * 0.006)) - (side === 1 ? 0 : 0), Y(0.88), X(0.006), Y(0.12) - Y(0.88));
    g.fillStyle = "#10305c"; g.fillRect(X(Math.min(uLine - dir * 0.012, uLine - dir * 0.006)), Y(0.88), X(0.004), Y(0.12) - Y(0.88));
    // 客舱窗户
    const uWin = side + dir * 0.03;
    g.fillStyle = "#1b2b44";
    for (let t = 0.24; t < 0.84; t += 0.0105) {
      if (Math.abs(t - 0.52) < 0.012 || Math.abs(t - 0.79) < 0.01) continue;   // 舱门位置空出来
      const cx = X(((uWin % 1) + 1) % 1), cy = Y(t);
      g.beginPath(); g.ellipse(cx, cy, 4.2, 6.5, 0, 0, Math.PI * 2); g.fill();
    }
    // 舱门轮廓
    g.strokeStyle = "#aebccc"; g.lineWidth = 2;
    [0.52, 0.79, 0.86].forEach((t) => {
      const cx = X(((side + dir * 0.03) % 1 + 1) % 1);
      g.strokeRect(cx - 12, Y(t) - 16, 24, 32);
    });
  });
  // 驾驶舱窗：两侧靠机背处各 3 块，正前方顶部 2 块
  g.fillStyle = "#13233a";
  const cockpit = (u, t, w, h) => { g.beginPath(); g.roundRect(X(u) - w / 2, Y(t) - h / 2, w, h, 4); g.fill(); };
  [0.965, 0.945, 0.925].forEach((u, i) => cockpit(u, 0.952 - i * 0.004, 26, 18));
  [0.535, 0.555, 0.575].forEach((u, i) => cockpit(u, 0.952 - i * 0.004, 26, 18));
  [0.72, 0.78].forEach((u) => cockpit(u, 0.968, 30, 16));

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// =========================================================
// 2. 飞机建模（机头朝 +X，机背朝 +Y，翼展沿 Z）
// =========================================================
function buildPlane() {
  const plane = new THREE.Group();
  const L = 40, R = 2.05;

  const mPaint = new THREE.MeshStandardMaterial({ color: C.paint, roughness: 0.32, metalness: 0.06 });
  const mWing = new THREE.MeshStandardMaterial({ color: C.wing, roughness: 0.42, metalness: 0.22 });
  const mNavy = new THREE.MeshStandardMaterial({ color: C.navy, roughness: 0.35, metalness: 0.1 });
  const mCyan = new THREE.MeshStandardMaterial({ color: C.cyan, roughness: 0.35, metalness: 0.05 });
  const mMetal = new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.25, metalness: 0.7 });
  const mDark = new THREE.MeshStandardMaterial({ color: C.dark, roughness: 0.5, metalness: 0.4 });

  // --- 机身：圆柱 → 按剖面变形（圆润机头 + 上翘尾段） ---
  const fg = new THREE.CylinderGeometry(1, 1, L, 64, 160, true);
  fg.rotateZ(-Math.PI / 2);                     // 轴线从 Y 转到 X，机头在 +X
  const pos = fg.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.x + L / 2) / L;                // 0 = 机尾，1 = 机头
    let r = R, dy = 0, squash = 1.06;
    if (t > 0.86) {                              // 机头：椭圆收口，略微下垂
      const u = (t - 0.86) / 0.14;
      r = R * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2)));
      r = Math.max(r, 0.04);
      dy = -0.35 * u * u;
    } else if (t < 0.27) {                       // 尾段：收窄 + 上翘（机腹往上收）
      const u = (0.27 - t) / 0.27;
      r = R * (1 - 0.86 * Math.pow(u, 1.35));
      dy = R * 0.95 * Math.pow(u, 1.5);
      squash = 1.06 + 0.25 * u;
    }
    const ang = Math.atan2(v.z, v.y);            // 当前点在截面上的角度
    v.y = Math.cos(ang) * r * squash + dy;
    v.z = Math.sin(ang) * r;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  fg.computeVertexNormals();
  const mFus = mPaint.clone();
  mFus.map = fuselageTexture();
  const fus = new THREE.Mesh(fg, mFus);
  plane.add(fus);
  // 尾锥封口
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 16, 12), mPaint);
  cap.position.set(-L / 2, R * 0.95, 0);
  plane.add(cap);

  // --- 机翼（后掠 + 上反角 + 翼梢小翼） ---
  function wingShape(rootLE, rootTE, span, sweepDeg, tipChord) {
    const s = new THREE.Shape();
    const tipLE = rootLE - span * Math.tan(sweepDeg * Math.PI / 180);
    s.moveTo(rootLE, 0);
    s.lineTo(tipLE, span);
    s.lineTo(tipLE - tipChord, span);
    s.lineTo(rootTE, 0);
    s.closePath();
    return { shape: s, tipLE, tipTE: tipLE - tipChord };
  }
  function slab(shape, thick, bevel, mat) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8
    });
    geo.translate(0, 0, -thick / 2);
    return new THREE.Mesh(geo, mat);
  }
  const WING = wingShape(5.2, -4.6, 18.5, 31, 2.3);
  [1, -1].forEach((side) => {
    const w = slab(WING.shape, 0.32, 0.16, mWing);
    // 形状在 XY 平面（Y = 翼展）→ 转到水平：翼展沿 ±Z，厚度沿 Y
    w.rotation.x = side * Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(w);
    holder.position.set(1.5, -1.05, side * R * 0.75);
    holder.rotation.x = -side * THREE.MathUtils.degToRad(6);     // 上反角
    plane.add(holder);

    // 翼梢小翼
    const wl = new THREE.Shape();
    wl.moveTo(0, 0); wl.lineTo(-1.6, 2.6); wl.lineTo(-2.4, 2.6); wl.lineTo(-2.3, 0); wl.closePath();
    const wlm = slab(wl, 0.14, 0.06, mNavy);
    wlm.position.set(WING.tipLE + 0.1, 0.15, side * 18.5);
    holder.add(wlm);

    // 发动机：短舱 + 风扇 + 整流锥 + 挂架
    const eng = new THREE.Group();
    const prof = [
      [0.42, -3.2], [0.72, -2.8], [1.02, -2.2], [1.24, -1.0], [1.32, 0.6], [1.34, 1.6], [1.26, 2.4], [1.16, 2.62], [1.06, 2.55]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const nac = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mPaint);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.1, 12, 48), mMetal);
    lip.rotation.x = Math.PI / 2; lip.position.y = 2.58;
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.06, 48), mDark);
    fan.rotation.x = -Math.PI / 2; fan.position.y = 2.3;
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 32), mMetal);
    spinner.position.y = 2.62;
    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 32), mMetal);
    exhaust.rotation.x = Math.PI; exhaust.position.y = -3.5;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.345, 1.345, 0.22, 48, 1, true), mCyan);
    stripe.position.y = 1.0;
    eng.add(nac, lip, fan, spinner, exhaust, stripe);
    eng.rotation.z = -Math.PI / 2;               // 轴线转到 X，进气口朝前
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 0.3), mPaint);
    pylon.position.set(0.2, 1.05, 0);
    const engHolder = new THREE.Group();
    engHolder.add(eng, pylon);
    engHolder.position.set(2.6, -1.95, side * 6.4);
    holder.add(engHolder);
    // 机翼在 holder 里，发动机放回机身坐标（holder 有上反角，这里抵消掉）
    engHolder.rotation.x = side * THREE.MathUtils.degToRad(6);
  });

  // --- 平尾 ---
  const HT = wingShape(-14.6, -18.6, 7.2, 34, 1.5);
  [1, -1].forEach((side) => {
    const h = slab(HT.shape, 0.2, 0.1, mWing);
    h.rotation.x = side * Math.PI / 2;
    const hold = new THREE.Group();
    hold.add(h);
    hold.position.set(0, R * 0.95, side * 0.4);
    hold.rotation.x = -side * THREE.MathUtils.degToRad(5);
    plane.add(hold);
  });

  // --- 垂尾（海军蓝 + 青色条） ---
  const fin = new THREE.Shape();
  fin.moveTo(-12.4, 0); fin.lineTo(-17.6, 8.4); fin.lineTo(-20.4, 8.4); fin.lineTo(-19.6, 0); fin.closePath();
  const finM = slab(fin, 0.26, 0.12, mNavy);
  finM.position.y = 1.95;
  plane.add(finM);
  const band = new THREE.Shape();
  band.moveTo(-14.2, 2.6); band.lineTo(-15.4, 4.5); band.lineTo(-19.6, 4.5); band.lineTo(-19.4, 2.6); band.closePath();
  const bandM = slab(band, 0.32, 0.12, mCyan);
  bandM.position.y = 1.95;
  plane.add(bandM);

  // --- 机腹整流罩（翼身连接处） ---
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mPaint);
  fair.scale.set(7.5, 0.9, 2.1);
  fair.position.set(0.6, -1.35, 0);
  plane.add(fair);

  // 整体转一下：Three.js 的 lookAt 让 +Z 朝前，所以把机头从 +X 转到 +Z
  const root = new THREE.Group();
  plane.rotation.y = -Math.PI / 2;
  root.add(plane);
  return root;
}

// =========================================================
// 3. 云：canvas 画几团柔和的“云朵”贴图，用 Sprite（永远面向镜头的贴片）
// =========================================================
function cloudTexture(seed) {
  const S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 18; i++) {
    const x = S * (0.25 + rnd() * 0.5), y = S * (0.35 + rnd() * 0.35), rad = S * (0.12 + rnd() * 0.18);
    const grd = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.6, "rgba(250,252,254,0.45)");
    grd.addColorStop(1, "rgba(238,243,249,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 简单的环境光照贴图（让机身有柔和的高光和反射，看起来更“高级”）
function envMap(renderer) {
  const s = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 p; void main(){ float h = p.y*0.5+0.5; vec3 c = mix(vec3(0.72,0.79,0.88), vec3(1.0), smoothstep(0.25,0.9,h)); gl_FragColor = vec4(c,1.0); }"
    })
  );
  s.add(sphere);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  panel.position.set(0, 30, 20); panel.lookAt(0, 0, 0);
  s.add(panel);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

// =========================================================
// 4. 镜头和时间线
// =========================================================
// setup：搭好场景，返回 renderAt(t)（画第 t 秒的画面）和 dispose（释放显存）
function setup(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.sky, 320, 1600);
  scene.environment = envMap(renderer);
  // 灯光：上方主光 + 冷色地面反光（机腹偏暗，轮廓才立体）+ 背后的轮廓光
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7f93ad, 0.75));
  const key = new THREE.DirectionalLight(0xfff8f0, 3.0); key.position.set(40, 140, 60); scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d3ee, 0.45); fill.position.set(-80, -30, 60); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2); rim.position.set(-30, 60, -160); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2500);
  const plane = buildPlane();
  scene.add(plane);

  // 飞行路线（镜头在原点附近，朝 -Z 看）：从左上方远处飞来，越来越近，最后从镜头右上方冲过去
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-170, 46, -440),
    new THREE.Vector3(-86, 40, -240),
    new THREE.Vector3(-24, 30, -110),
    new THREE.Vector3(10, 20, -40),
    new THREE.Vector3(26, 14, 6)
  ], false, "catmullrom", 0.5);

  // 云：远处零散几朵（有层次），航线终点附近一大团云（飞机冲进去）
  const clouds = [];
  const texs = [1, 7, 13, 21].map(cloudTexture);
  function addCloud(x, y, z, s, op, wall) {
    const m = new THREE.SpriteMaterial({ map: texs[clouds.length % texs.length], transparent: true, depthWrite: false, opacity: op, fog: true });
    const sp = new THREE.Sprite(m);
    sp.position.set(x, y, z); sp.scale.set(s, s * 0.62, 1);
    sp.userData = { base: op, wall: wall };
    scene.add(sp); clouds.push(sp);
  }
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 8; i++) addCloud(-420 + rnd() * 700, -120 + rnd() * 200, -700 - rnd() * 400, 180 + rnd() * 160, 0.5, false);
  // 薄云层：在飞机快到镜头前的那段路线周围
  for (let i = 0; i < 22; i++) addCloud(-6 + rnd() * 52, 6 + rnd() * 26, -48 + rnd() * 70, 18 + rnd() * 30, 0.9, true);

  function resize() {
    const w = canvas.clientWidth || 1000, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = THREE.MathUtils.clamp(34 / Math.sqrt(camera.aspect / 1.6), 12, 32);   // 长焦：远处的飞机也够大
    camera.updateProjectionMatrix();
  }
  resize();

  const ease = (x) => 1 - Math.pow(1 - x, 2.2);          // 先快后慢 → 飞机“迎面而来”的感觉
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const P = new THREE.Vector3(), T = new THREE.Vector3(), look = new THREE.Vector3();

  function renderAt(t) {
    // 飞机：沿路线移动，机头朝前进方向，转弯时侧倾并慢慢回正
    const p = Math.min(0.97, ease(Math.min(1, t / 2.15)));
    path.getPointAt(p, P);
    path.getTangentAt(p, T);
    plane.position.copy(P);
    plane.lookAt(P.x + T.x, P.y + T.y, P.z + T.z);
    plane.rotateZ(THREE.MathUtils.degToRad(20 - 12 * p));     // 侧倾：一开始倾得多，靠近时慢慢回正
    plane.rotateX(THREE.MathUtils.degToRad(-4));

    // 镜头：低角度仰拍；视线跟着飞机走（跟到 0.85 处，飞机始终偏右上一点，构图更有张力）；最后往前推进云里
    camera.position.set(-6 + 10 * smooth(0, 2.3, t), -14 + 8 * smooth(0.6, 2.3, t), 60 - 40 * smooth(1.4, 2.35, t));
    look.copy(P).multiplyScalar(0.9);
    look.y += 1;
    camera.lookAt(look);
    camera.rotateZ(THREE.MathUtils.degToRad(-7 + 5 * smooth(0, 2.3, t)));   // 镜头本身也带一点倾斜

    // 云团：飞机接近时浮现
    const wallIn = smooth(1.35, 1.8, t);
    clouds.forEach((c, i) => { if (c.userData.wall) c.material.opacity = wallIn * (0.35 + 0.35 * ((i * 37) % 10) / 10); });

    renderer.render(scene, camera);
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
    });
    scene.environment && scene.environment.dispose();
    renderer.dispose();
  }
  return { renderAt, dispose, resize };
}

export const WHITE_AT = 1.85;   // 秒：开始变白（route.js 从这里接上地图）
export const END_AT = 2.35;     // 秒：3D 部分结束

export function playAir(canvas, opts = {}) {
  const s = setup(canvas);
  return new Promise((resolve) => {
    let start = null, fired = false, raf;
    function frame(now) {
      if (opts.cancelled && opts.cancelled()) { s.dispose(); resolve(false); return; }
      if (start === null) start = now;
      const t = (now - start) / 1000;
      s.renderAt(Math.min(t, END_AT));
      if (!fired && t >= WHITE_AT) { fired = true; opts.onWhiteout && opts.onWhiteout(); }
      if (t < END_AT) raf = requestAnimationFrame(frame);
      else { s.dispose(); resolve(true); }
    }
    raf = requestAnimationFrame(frame);
  });
}

// 预先渲染一帧用来检查：test 用
export const _debug = { buildPlane, setup };
