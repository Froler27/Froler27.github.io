/* 首页 Hero 的轻量 WebGL 背景：等距线框立方体 + 透视地面 + 微尘。 */

const DARK = {
  accent: [0.2196, 0.7412, 0.9725],   // #38bdf8
  accentDeep: [0.0078, 0.5176, 0.7804] // #0284c7
};

const PI2 = Math.PI * 2;
const ROTATION_SECONDS = 21;
const DPR_CAP = 1.75;
const PARTICLE_COUNT = 30;
const STATIC_TIME = 2.6;

const noop = () => ({
  start() {}, stop() {}, setTheme() {}, dispose() {}
});

/* ---------------- shader ---------------- */

const VERT_300 = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const VERT_100 = `attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_BODY = `
uniform vec2 uRes;
uniform float uTime;
uniform float uTheme;
uniform float uMobile;
uniform float uOpacity;
uniform vec3 uAccent;
uniform vec3 uAccentDeep;
uniform vec2 uCubeCenter;
uniform float uCubePx;
uniform vec2 uLight;
uniform vec4 uEdges[12];
uniform float uEdgeShade[12];
uniform vec2 uFaceQuad[24];
uniform vec4 uFaceCol[6];
uniform vec4 uParticles[${PARTICLE_COUNT}];

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 p = uv * uRes;
  float aspect = uRes.x / max(uRes.y, 1.0);
  float lightTheme = step(0.5, uTheme);

  // 背景：深蓝黑 / 冷白竖向渐变
  vec3 bgTop = mix(vec3(0.017, 0.024, 0.043), vec3(0.980, 0.990, 1.000), lightTheme);
  vec3 bgBot = mix(vec3(0.039, 0.071, 0.126), vec3(0.918, 0.951, 0.992), lightTheme);
  vec3 col = mix(bgTop, bgBot, pow(uv.y, mix(0.82, 0.62, lightTheme)));

  // 右侧柔光，给立方体一点环境光
  vec2 haloVec = (uv - vec2(0.67, 0.47)) * vec2(aspect, 1.0);
  float halo = exp(-dot(haloVec, haloVec) * 5.2);
  vec2 lowerHalo = (uv - vec2(0.58, 0.72)) * vec2(aspect, 1.0);
  float halo2 = exp(-dot(lowerHalo, lowerHalo) * 8.0);
  col += mix(uAccent * 0.085, uAccentDeep * 0.022, lightTheme) * halo;
  col += mix(uAccentDeep * 0.030, uAccentDeep * 0.010, lightTheme) * halo2;
  if (lightTheme > 0.5) {
    col = mix(col, vec3(0.965, 0.982, 1.0), halo * 0.38);
  }

  // 地面：从地平线向近处展开的透视网格
  float horizon = uRes.y * mix(0.635, 0.675, uMobile);
  float vanishX = uRes.x * mix(0.555, 0.520, uMobile);
  float dy = p.y - horizon;
  float grid = 0.0;
  float gridHalo = 0.0;
  if (dy > 0.0) {
    float depth = uRes.y * 0.60 / max(dy, 0.001);
    float focal = uRes.y * 0.92;
    float worldX = (p.x - vanishX) * depth / focal;

    // 横向（等深）线，沿深度缓慢流动
    float spacingZ = 0.40;
    float zPhase = depth / spacingZ + uTime * 0.060;
    float zFrac = fract(zPhase);
    float zDistPx = min(zFrac, 1.0 - zFrac) * (uRes.y * 0.60 * spacingZ / max(depth * depth, 0.01));
    float lineZ = 1.0 - smoothstep(0.0, 1.05, zDistPx);
    float glowZ = max(0.0, 1.0 - zDistPx / 9.0);
    glowZ *= glowZ;

    // 纵向（等 x）线
    float spacingX = 0.48;
    float xPhase = worldX / spacingX;
    float xFrac = fract(xPhase);
    float xDistPx = min(xFrac, 1.0 - xFrac) * (focal * spacingX / max(depth, 0.01));
    float lineX = 1.0 - smoothstep(0.0, 1.0, xDistPx);
    float glowX = max(0.0, 1.0 - xDistPx / 8.0);
    glowX *= glowX;

    float fog = exp(-depth * 0.15);
    float nearFade = smoothstep(0.0, 26.0, dy);
    float leftQuiet = mix(0.28, 1.0, smoothstep(0.31, 0.68, uv.x));
    grid = (lineZ * 0.64 + lineX * 0.46) * fog * nearFade * leftQuiet;
    gridHalo = (glowZ * 0.19 + glowX * 0.11) * fog * nearFade * leftQuiet;
  }

  // 立方体在地面上的光斑/倒影
  vec2 poolCenter = vec2(uCubeCenter.x * uRes.x, uCubeCenter.y * uRes.y + uCubePx * 0.59);
  vec2 poolQ = (p - poolCenter) / vec2(uCubePx * 0.56, uCubePx * 0.115);
  float pool = exp(-dot(poolQ, poolQ) * 2.4);
  float poolStreak = exp(-pow((p.x - poolCenter.x) / (uCubePx * 0.18), 2.0))
                   * exp(-max(0.0, p.y - poolCenter.y) / (uCubePx * 0.17));
  poolStreak *= step(poolCenter.y - uCubePx * 0.035, p.y);

  if (lightTheme < 0.5) {
    vec3 gridCol = mix(uAccentDeep, uAccent, 0.58);
    col += gridCol * (grid * 0.28 + gridHalo * 0.38);
    col += uAccent * (pool * 0.110 + poolStreak * 0.058);
    float horizonGlow = exp(-abs(dy) / 30.0) * mix(0.22, 1.0, smoothstep(0.27, 0.62, uv.x));
    col += mix(uAccentDeep, uAccent, 0.6) * horizonGlow * 0.018;
  } else {
    col = mix(col, uAccentDeep, clamp(grid * 0.14 + gridHalo * 0.052, 0.0, 0.24));
    col = mix(col, vec3(0.60, 0.69, 0.80), clamp(pool * 0.105 + poolStreak * 0.070, 0.0, 0.22));
    float horizonGlow = exp(-abs(dy) / 30.0) * mix(0.22, 1.0, smoothstep(0.27, 0.62, uv.x));
    col = mix(col, uAccentDeep, clamp(horizonGlow * 0.020, 0.0, 0.05));
  }

  // 尘埃：景深大小与亮度差异，左侧压低
  float leftQuietP = mix(0.18, 1.0, smoothstep(0.30, 0.58, uv.x));
  for (int i = 0; i < ${PARTICLE_COUNT}; i++) {
    vec4 pt = uParticles[i];
    if (pt.w < 0.002) continue;
    vec2 center = pt.xy * uRes;
    vec2 delta = p - center;
    if (max(abs(delta.x), abs(delta.y)) > pt.z * 4.2) continue;
    float d = length(delta);
    float core = 1.0 - smoothstep(pt.z * 0.35, pt.z * 1.55, d);
    float haze = max(0.0, 1.0 - d / max(pt.z * 3.0, 0.6));
    haze *= haze * 0.22;
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.55 + float(i) * 2.13);
    float a = (core * 0.72 + haze) * pt.w * twinkle * leftQuietP;
    vec3 dustCol = mix(uAccent, vec3(0.86, 0.97, 1.0), 0.46);
    if (lightTheme < 0.5) col += dustCol * a * 0.75;
    else col = mix(col, uAccentDeep, clamp(a * 0.25, 0.0, 0.30));
  }

  // 面：每个可见面一个投影四边形，透明度很低
  for (int i = 0; i < 3; i++) {
    vec4 fc = uFaceCol[i];
    if (fc.a < 0.002) continue;
    vec2 A = uFaceQuad[i * 4 + 0] * uRes;
    vec2 B = uFaceQuad[i * 4 + 1] * uRes;
    vec2 C = uFaceQuad[i * 4 + 2] * uRes;
    vec2 D = uFaceQuad[i * 4 + 3] * uRes;
    float e0 = cross2(B - A, p - A);
    float e1 = cross2(C - B, p - B);
    float e2 = cross2(D - C, p - C);
    float e3 = cross2(A - D, p - D);
    bool inside = (e0 >= 0.0 && e1 >= 0.0 && e2 >= 0.0 && e3 >= 0.0)
               || (e0 <= 0.0 && e1 <= 0.0 && e2 <= 0.0 && e3 <= 0.0);
    if (inside) {
      float edgeD = min(min(abs(e0) / max(length(B - A), 0.001), abs(e1) / max(length(C - B), 0.001)),
                        min(abs(e2) / max(length(D - C), 0.001), abs(e3) / max(length(A - D), 0.001)));
      float cover = clamp(edgeD / 1.25, 0.0, 1.0);
      float gradY = clamp((p.y - uCubeCenter.y * uRes.y) / max(uCubePx, 1.0) + 0.5, 0.0, 1.0);
      float gradX = clamp((p.x - uCubeCenter.x * uRes.x) / max(uCubePx, 1.0) + 0.5, 0.0, 1.0);
      float sheen = 0.5 + 0.5 * dot(normalize(p - uCubeCenter * uRes + vec2(0.001)), normalize(uLight + vec2(0.0001)));
      float diag = (p.x - uCubeCenter.x * uRes.x) / max(uCubePx, 1.0)
                 + (p.y - uCubeCenter.y * uRes.y) / max(uCubePx, 1.0) * 0.52;
      float band = 1.0 - smoothstep(0.015, 0.20, abs(diag + 0.11));
      band *= band;
      vec3 faceCol = fc.rgb * (1.10 - 0.26 * gradY) * (0.95 + 0.10 * (1.0 - gradX)) * (0.94 + 0.08 * sheen);
      faceCol += uAccent * band * mix(0.034, 0.015, lightTheme);
      if (lightTheme < 0.5) {
        col = mix(col, faceCol, clamp(fc.a * cover * uOpacity, 0.0, 0.18));
      } else {
        col = mix(col, faceCol * 0.72, clamp(fc.a * cover * uOpacity * 0.92, 0.0, 0.16));
      }
    }
  }

  // 棱：距离场实现核心亮线 + 内外柔光，避免 GL_LINES 线宽不可控
  vec3 hot = mix(vec3(0.80, 0.96, 1.0), uAccentDeep * 0.85, lightTheme);
  vec3 cool = mix(uAccent, uAccentDeep * 0.92, lightTheme);
  for (int i = 0; i < 12; i++) {
    vec4 e = uEdges[i];
    vec2 a = e.xy * uRes;
    vec2 b = e.zw * uRes;
    if (p.x < min(a.x, b.x) - 14.0 || p.x > max(a.x, b.x) + 14.0 ||
        p.y < min(a.y, b.y) - 14.0 || p.y > max(a.y, b.y) + 14.0) continue;
    float d = sdLine(p, a, b);
    float core = 1.0 - smoothstep(0.0, 1.28, d);
    float inner = max(0.0, 1.0 - d / 5.5);
    inner *= inner;
    float outer = max(0.0, 1.0 - d / 13.0);
    outer *= outer * outer;
    float amount = (core * 0.88 + inner * 0.22 + outer * 0.065) * uEdgeShade[i] * uOpacity;
    vec3 edgeCol = mix(cool, hot, core * 0.72);
    if (lightTheme < 0.5) {
      col += edgeCol * amount;
    } else {
      float a = clamp(amount * mix(0.76, 1.0, core), 0.0, 0.92);
      col = mix(col, mix(uAccentDeep * 0.50, uAccentDeep * 0.88, core), a);
    }
  }

  // 暗角 + 静态抖动，压掉 8bit 色带
  vec2 vq = (uv - 0.5) * vec2(aspect * 0.72, 1.0);
  float vr = length(vq);
  float vig = 1.0 - smoothstep(0.18, 1.02, vr);
  if (lightTheme < 0.5) {
    col *= mix(0.70, 1.0, vig);
    col += (ign(gl_FragCoord.xy) - 0.5) * (0.9 / 255.0);
    col += (hash21(floor(p * 0.82)) - 0.5) * 0.0035;
  } else {
    col = mix(col, vec3(0.900, 0.933, 0.974), (1.0 - vig) * 0.18);
    col += (ign(gl_FragCoord.xy) - 0.5) * (0.55 / 255.0);
  }

  OUT_COLOR = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* ---------------- WebGL 背景 ---------------- */

export function createHeroBackground(canvas, options = {}) {
  if (!canvas || typeof window === 'undefined') return noop();
  const doc = canvas.ownerDocument || document;

  let accent = normColor(options.accent, DARK.accent);
  let accentDeep = normColor(options.accentDeep, DARK.accentDeep);
  let theme = options.theme === 'light' ? 'light' : 'dark';
  let disposed = false;
  let failed = false;
  let gl = null;
  let program = null;
  let buffer = null;
  let attrib = -1;
  let locations = null;
  let raf = 0;
  let running = false;
  let requested = false;
  let inView = true;
  let docVisible = !doc.hidden;
  let reduced = false;
  let time = 0;
  let lastTs = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let mobile = false;
  let observer = null;
  let resizeObserver = null;
  let visibilityHandler = null;
  let mouseX = 0;
  let mouseY = 0;
  let smoothX = 0;
  let smoothY = 0;
  const particles = makeParticles();
  const edgeData = new Float32Array(48);
  const edgeShade = new Float32Array(12);
  const faceData = new Float32Array(48);
  const faceCols = new Float32Array(24);
  const particleData = new Float32Array(PARTICLE_COUNT * 4);

  try {
    gl = canvas.getContext('webgl2', glOptions()) || canvas.getContext('webgl', glOptions());
  } catch (_) {
    gl = null;
  }
  if (!gl) return fail();

  reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!initGL()) return fail();

  // 尺寸：CSS 尺寸给 shader，drawingBuffer 跟 DPR（上限 1.75）
  function measure() {
    const parent = canvas.parentElement;
    const rect = canvas.getBoundingClientRect();
    const pr = parent ? parent.getBoundingClientRect() : rect;
    const w = rect.width > 1 ? rect.width : pr.width;
    const h = rect.height > 1 ? rect.height : pr.height;
    width = Math.max(1, Math.round(w));
    height = Math.max(1, Math.round(h));
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    mobile = width < 760;
    const bw = Math.max(1, Math.round(width * dpr));
    const bh = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
  }

  function initGL() {
    try {
      const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const vert = compile(gl.VERTEX_SHADER, gl2 ? VERT_300 : VERT_100);
      const out = gl2 ? 'fragColor' : 'gl_FragColor';
      const head = gl2
        ? '#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 fragColor;\n'
        : 'precision highp float;\nvarying vec2 vUv;\n';
      const frag = compile(gl.FRAGMENT_SHADER, head + FRAG_BODY.replace(/OUT_COLOR/g, out));
      if (vert === null || frag === null) return false;
      program = gl.createProgram();
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      attrib = gl.getAttribLocation(program, 'aPos');
      if (attrib < 0) return false;
      locations = collectUniforms(program);
      gl.useProgram(program);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      measure();
      return true;
    } catch (_) {
      return false;
    }
  }

  function compile(type, source) {
    try {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    } catch (_) {
      return null;
    }
  }

  function collectUniforms(prog) {
    const out = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      out[name] = gl.getUniformLocation(prog, info.name);
    }
    return out;
  }

  function fail() {
    if (failed) return noop();
    failed = true;
    requested = false;
    stopLoop();
    if (observer) observer.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    try { canvas.style.display = 'none'; } catch (_) {}
    return noop();
  }

  function getOpacity() {
    return mobile ? 0.78 : 1;
  }

  // 单帧绘制：JS 只做投影与 uniform 上传
  function draw(now) {
    if (!gl || !program || failed || disposed) return;
    const w = width;
    const h = height;
    if (w < 2 || h < 2) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);

    // 缓动鼠标，只产生 ±3° 视差
    smoothX += (mouseX - smoothX) * 0.055;
    smoothY += (mouseY - smoothY) * 0.055;
    const yaw = -0.12 + now * (PI2 / ROTATION_SECONDS) + smoothX * 0.052;
    const pitch = 0.43 + smoothY * 0.048;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cpt = Math.cos(pitch);
    const spt = Math.sin(pitch);
    const scale = Math.min(h * 0.142, w * 0.235);
    const centerX = w * (mobile ? 0.58 : 0.65) + smoothX * (mobile ? 3 : 7);
    const centerY = h * (mobile ? 0.70 : 0.47) + smoothY * (mobile ? 2 : 5)
      + Math.sin(now * 0.55) * h * 0.005;
    const cubeCenter = [centerX / w, centerY / h];

    const verts = new Array(8);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = CUBE_VERTS[i];
      const x1 = c[0] * cyw + c[2] * syw;
      const z1 = -c[0] * syw + c[2] * cyw;
      const y1 = c[1] * cpt - z1 * spt;
      const z2 = c[1] * spt + z1 * cpt;
      const persp = 5.7 / (5.7 - z2 * 0.90);
      const px = centerX + x1 * scale * persp;
      const py = centerY - y1 * scale * persp;
      verts[i] = { x: px / w, y: py / h, z: z2 };
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const cubePx = Math.max(20, maxY - minY);

    // 12 条棱 + 深度明暗
    for (let i = 0; i < 12; i++) {
      const [a, b] = CUBE_EDGES[i];
      const va = verts[a];
      const vb = verts[b];
      edgeData[i * 4] = va.x;
      edgeData[i * 4 + 1] = va.y;
      edgeData[i * 4 + 2] = vb.x;
      edgeData[i * 4 + 3] = vb.y;
      const z = (va.z + vb.z) * 0.5;
      edgeShade[i] = 0.38 + 0.62 * clamp01((z + 1.05) / 2.1);
    }

    // 只上传朝向相机的面，动态决定左右面的品牌色
    const uTheme = theme === 'light' ? 1 : 0;
    const topColor = uTheme
      ? mixColor(accentDeep, accent, 0.68)
      : mixColor(accent, [1, 1, 1], 0.48);
    const sideLeft = uTheme ? mixColor(accentDeep, accent, 0.40) : accent;
    const faceAlphaTop = lerp(0.140, 0.100, uTheme);
    const faceAlphaL = lerp(0.105, 0.072, uTheme);
    const faceAlphaR = lerp(0.068, 0.047, uTheme);
    faceData.fill(0);
    faceCols.fill(0);
    let faceCount = 0;
    for (let i = 0; i < 6 && faceCount < 3; i++) {
      const face = CUBE_FACES[i];
      const n = face.n;
      const nz0 = -n[0] * syw + n[2] * cyw;
      const nz = n[1] * spt + nz0 * cpt;
      if (nz <= 0.012) continue;

      let cx = 0;
      let cy = 0;
      const pts = [];
      for (const vi of face.v) {
        const v = verts[vi];
        cx += v.x;
        cy += v.y;
        pts.push(v);
      }
      cx /= 4;
      cy /= 4;
      const sideMix = clamp01((cx - centerX / w) / Math.max(0.055, (scale * 2.2) / w) + 0.5);
      let rgb;
      let alpha;
      if (face.kind === 'top') {
        rgb = topColor;
        alpha = faceAlphaTop;
      } else {
        rgb = mixColor(sideLeft, accentDeep, sideMix * 0.82);
        alpha = lerp(faceAlphaL, faceAlphaR, sideMix);
      }
      faceCols[faceCount * 4] = rgb[0];
      faceCols[faceCount * 4 + 1] = rgb[1];
      faceCols[faceCount * 4 + 2] = rgb[2];
      faceCols[faceCount * 4 + 3] = alpha;
      for (let k = 0; k < 4; k++) {
        faceData[faceCount * 8 + k * 2] = pts[k].x;
        faceData[faceCount * 8 + k * 2 + 1] = pts[k].y;
      }
      faceCount++;
    }

    // 微尘位置/大小/亮度（每帧在 JS 里做轻微漂移，比 shader 里循环 hash 更省）
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      const driftX = Math.sin(now * p.speed + p.phase) * p.drift * 0.011;
      const driftY = Math.cos(now * p.speed * 0.72 + p.phase * 1.4) * p.drift * 0.009;
      let x = p.x + driftX + smoothX * 0.0025 * p.depth;
      let y = p.y + driftY + smoothY * 0.0018 * p.depth;
      x = ((x % 1) + 1) % 1;
      y = ((y % 1) + 1) % 1;
      particleData[i * 4] = x;
      particleData[i * 4 + 1] = y;
      particleData[i * 4 + 2] = p.size * (0.72 + p.depth * 0.78);
      particleData[i * 4 + 3] = p.alpha * (0.50 + p.depth * 0.62);
    }

    gl.uniform2f(locations.uRes, w, h);
    gl.uniform1f(locations.uTime, now);
    gl.uniform1f(locations.uTheme, uTheme);
    gl.uniform1f(locations.uMobile, mobile ? 1 : 0);
    gl.uniform1f(locations.uOpacity, getOpacity());
    gl.uniform3fv(locations.uAccent, accent);
    gl.uniform3fv(locations.uAccentDeep, accentDeep);
    gl.uniform2f(locations.uCubeCenter, cubeCenter[0], cubeCenter[1]);
    gl.uniform1f(locations.uCubePx, cubePx);
    gl.uniform2f(locations.uLight, smoothX, -smoothY);
    gl.uniform4fv(locations.uEdges, edgeData);
    gl.uniform1fv(locations.uEdgeShade, edgeShade);
    gl.uniform2fv(locations.uFaceQuad, faceData);
    gl.uniform4fv(locations.uFaceCol, faceCols);
    gl.uniform4fv(locations.uParticles, particleData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(ts) {
    if (!running || disposed || failed) return;
    raf = 0;
    try {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
      lastTs = ts;
      time += dt;
      draw(time);
    } catch (_) {
      // 绘制期异常也不允许冒到控制台；静默停止，保留最后画面
      stopLoop();
      return;
    }
    raf = window.requestAnimationFrame(tick);
  }

  function stopLoop() {
    running = false;
    lastTs = 0;
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function startLoop() {
    if (running || disposed || failed || !gl || !program) return;
    if (reduced) {
      try { draw(STATIC_TIME); } catch (_) {}
      return;
    }
    if (!requested || !inView || !docVisible) return;
    running = true;
    lastTs = 0;
    raf = window.requestAnimationFrame(tick);
  }

  function refresh() {
    if (disposed || failed) return;
    if (requested && inView && docVisible && !reduced) startLoop();
    else stopLoop();
  }

  function onLost(e) {
    try { e.preventDefault(); } catch (_) {}
    stopLoop();
    program = null;
    buffer = null;
    locations = null;
    attrib = -1;
  }

  function onRestored() {
    if (disposed || failed) return;
    try {
      if (!initGL()) {
        failed = true;
        requested = false;
        stopLoop();
        canvas.style.display = 'none';
        return;
      }
      if (reduced) draw(STATIC_TIME);
      else if (requested && inView && docVisible) startLoop();
    } catch (_) {
      failed = true;
      requested = false;
      stopLoop();
      try { canvas.style.display = 'none'; } catch (__) {}
    }
  }

  function onPointer(e) {
    try {
      const parent = canvas.parentElement || canvas;
      const rect = parent.getBoundingClientRect();
      mouseX = clamp((e.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1, -1, 1);
      mouseY = clamp((e.clientY - rect.top) / Math.max(rect.height, 1) * 2 - 1, -1, 1);
    } catch (_) {}
  }

  function onResize() {
    if (disposed || failed) return;
    try {
      measure();
      if (!running) draw(reduced ? STATIC_TIME : time);
    } catch (_) {}
  }

  // 监听器
  try {
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    window.addEventListener('pointermove', onPointer, { passive: true });
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(canvas.parentElement || canvas);
    }
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(entries => {
        inView = !!(entries[0] && entries[0].isIntersecting);
        refresh();
      }, { threshold: 0.01 });
      observer.observe(canvas);
    }
    visibilityHandler = () => {
      docVisible = !doc.hidden;
      refresh();
    };
    doc.addEventListener('visibilitychange', visibilityHandler, false);
  } catch (_) {}

  // 先静态画一帧，遮住内容出现前的空白
  try { measure(); draw(reduced ? STATIC_TIME : 0); } catch (_) {}

  return {
    start() {
      if (disposed || failed) return;
      requested = true;
      refresh();
    },
    stop() {
      requested = false;
      stopLoop();
    },
    setTheme(nextTheme, palette) {
      if (disposed || failed) return;
      theme = nextTheme === 'light' ? 'light' : 'dark';
      if (palette) {
        accent = normColor(palette.accent, accent);
        accentDeep = normColor(palette.accentDeep, accentDeep);
      }
      // 立即重绘一帧（即使当前被暂停/静态偏好）
      try { draw(reduced ? STATIC_TIME : time); } catch (_) {}
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      requested = false;
      if (observer) observer.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      observer = null;
      resizeObserver = null;
      try {
        window.removeEventListener('pointermove', onPointer);
        if (visibilityHandler) doc.removeEventListener('visibilitychange', visibilityHandler);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
      } catch (_) {}
      try {
        if (gl) {
          if (buffer) gl.deleteBuffer(buffer);
          if (program) gl.deleteProgram(program);
        }
      } catch (_) {}
      buffer = null;
      program = null;
      locations = null;
      gl = null;
    }
  };
}

/* ---------------- 几何 / 工具 ---------------- */

const CUBE_VERTS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
];

const CUBE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

const CUBE_FACES = [
  { v: [4, 5, 6, 7], n: [0, 0, 1], kind: 'side' },    // +Z
  { v: [1, 5, 6, 2], n: [1, 0, 0], kind: 'side' },    // +X
  { v: [0, 4, 7, 3], n: [-1, 0, 0], kind: 'side' },   // -X
  { v: [0, 1, 2, 3], n: [0, 0, -1], kind: 'side' },   // -Z
  { v: [3, 2, 6, 7], n: [0, 1, 0], kind: 'top' },     // +Y
  { v: [0, 1, 5, 4], n: [0, -1, 0], kind: 'bottom' }  // -Y
];

function glOptions() {
  return {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  };
}

function normColor(v, fallback) {
  if (!v || typeof v.length !== 'number' || v.length < 3) return fallback.slice();
  return [clamp01(Number(v[0]) || 0), clamp01(Number(v[1]) || 0), clamp01(Number(v[2]) || 0)];
}

function mixColor(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeParticles() {
  // 固定种子的伪随机，保证每次加载构图一致
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296);
  };
  const out = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const depth = 0.2 + rnd() * 0.8;
    out.push({
      x: 0.05 + rnd() * 0.92,
      y: 0.06 + rnd() * 0.82,
      depth,
      drift: 0.4 + rnd() * 1.0,
      speed: 0.12 + rnd() * 0.36,
      phase: rnd() * PI2,
      size: 0.55 + rnd() * 1.35 + depth * 0.35,
      alpha: 0.16 + rnd() * 0.44
    });
  }
  return out;
}
