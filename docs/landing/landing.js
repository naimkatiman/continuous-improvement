/*
  continuous-improvement.dev: the 3D world behind the page.
  Hand-written WebGL2, no library, no network request. Every mesh is one rounded box drawn with
  instancing; light, reflections, contact shadows, glass and bloom are shaders in this file.

  What it shows is data from the page, never invented:
    - the hero replays verdicts captured from hooks/gateguard.mjs (the chips carry them as data-*),
    - the lifecycle ring has one pylon per row of the hooks table (#installs), coloured by its default,
    - the cost columns are the process counts in the cost list (#cost).
  A refused call never reaches the log stack and an allowed one adds a row to it, as observe.mjs
  logs only calls that complete.

  Cameras are not hand-placed: each section names the part of the world it shows and the screen
  rectangle it may use, and the camera is pulled back until that part fits. That holds on any
  viewport. Fallbacks: no WebGL (or ?nogl) adds class "nogl" and the page reads as a document;
  reduced motion stops ambient motion and renders only on change.
*/
(function () {
  "use strict";
  var d = document, root = d.documentElement, W = window;
  var state = { ready: false, mode: "webgl", reduced: false, lumaStd: 0, cpuMedian: 0, cpuP95: 0, cpuSamples: 0 };
  W.__scene = state;

  var reducedMQ = W.matchMedia("(prefers-reduced-motion: reduce)");
  state.reduced = reducedMQ.matches;
  var narrowMQ = W.matchMedia("(max-width: 860px)");

  /* ------------------------------------------------------------------ page data */
  var chips = [].slice.call(d.querySelectorAll("[data-call]"));
  var hookRows = [].slice.call(d.querySelectorAll("tr[data-hook]"));
  var costItems = [].slice.call(d.querySelectorAll("[data-cost]"));
  var sections = [].slice.call(d.querySelectorAll("[data-cam]"));
  var hud = d.getElementById("hud");
  var live = d.getElementById("verdict-live");

  /* ------------------------------------------------------------------ verdict card (works without WebGL) */
  var card = d.getElementById("verdict");
  function showVerdict(c) {
    if (!card) return;
    card.querySelector(".vc-cmd").textContent = c.cmd;
    var v = card.querySelector(".vc-verdict");
    v.textContent = c.verdict;
    v.className = "vc-verdict " + c.verdict;
    card.querySelector(".vc-rule").textContent = c.rule || "no rule matched";
    var note = card.querySelector(".vc-note");
    note.textContent = c.note || (c.verdict === "deny" ? "Refused before it ran. Not logged." : "Ran, then logged.");
    card.classList.toggle("wrong", !!c.note);
    card.classList.add("on");
    card.classList.remove("pending");
    if (live) live.textContent = c.cmd + ": " + c.verdict + (c.rule ? ", rule " + c.rule : "") + (c.note ? ". " + c.note : "");
  }
  var calls = chips.map(function (b) {
    return { el: b, cmd: b.getAttribute("data-call"), verdict: b.getAttribute("data-verdict"), rule: b.getAttribute("data-rule") || "", note: b.getAttribute("data-note") || "" };
  });
  function select(i) { chips.forEach(function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); }); }
  function fallback(reason) {
    state.mode = "fallback";
    if (reason) state.error = reason;
    root.classList.remove("gl");
    root.classList.add("nogl");
    chips.forEach(function (b, i) { b.addEventListener("click", function () { select(i); showVerdict(calls[i]); }); });
    if (calls.length) { select(0); showVerdict(calls[0]); }
    state.ready = true;
  }

  /* ------------------------------------------------------------------ WebGL init */
  var canvas = d.getElementById("world");
  var gl = null;
  var noGL = /[?&]nogl\b/.test(location.search);
  if (canvas && !noGL) {
    try { gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: true, powerPreference: "high-performance", preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  }
  if (!gl) { fallback(); return; }
  root.classList.add("gl");

  var hdr = !!gl.getExtension("EXT_color_buffer_float");
  var FMT = hdr ? gl.RGBA16F : gl.RGBA8;
  var TYPE = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  var SAMPLES = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  /* ------------------------------------------------------------------ shaders */
  // A studio made of math: a dark room, one warm softbox above-left, one cool strip behind-right,
  // and a faint horizon. Metals reflect it; everything else catches it at grazing angles.
  var LIGHT = [
    "uniform vec3 uCam; uniform vec3 uFogCol; uniform vec2 uFog; uniform vec4 uFlash; uniform vec3 uFlashCol;",
    "const vec3 KEY = vec3(-0.42, 0.86, 0.36);",
    "const vec3 RIM = vec3(0.62, 0.38, -0.69);",
    "vec3 env(vec3 R, float g){",
    "  float sharp = mix(6.0, 90.0, g * g);",
    "  vec3 e = mix(vec3(0.010, 0.010, 0.011), vec3(0.055, 0.055, 0.060), smoothstep(-0.25, 0.95, R.y));",
    "  e += vec3(1.00, 0.93, 0.86) * 2.2 * pow(max(dot(R, normalize(KEY)), 0.0), sharp);",
    "  e += vec3(0.70, 0.80, 1.00) * 1.3 * pow(max(dot(R, normalize(RIM)), 0.0), sharp * 0.7);",
    "  e += vec3(0.9, 0.9, 0.95) * 0.07 * exp(-pow(R.y * 6.0, 2.0));",
    "  return e;",
    "}",
    "vec3 shade(vec3 N, vec3 W, vec3 albedo, float glossIn, vec3 emi, out float fres){",
    "  float metal = step(1.5, glossIn); float g = glossIn - metal * 2.0;",
    "  vec3 V = normalize(uCam - W);",
    "  vec3 L1 = normalize(KEY); vec3 L2 = normalize(RIM);",
    "  float nv = max(dot(N, V), 0.0);",
    "  float d1 = max(dot(N, L1), 0.0); float d2 = max(dot(N, L2), 0.0);",
    "  vec3 hemi = mix(vec3(0.020, 0.020, 0.022), vec3(0.120, 0.122, 0.135), N.y * 0.5 + 0.5);",
    "  float ao = mix(0.38, 1.0, smoothstep(0.0, 0.8, W.y));",
    "  vec3 diff = albedo * (hemi * ao + d1 * vec3(1.00, 0.92, 0.84) * 1.35 + d2 * vec3(0.55, 0.65, 0.85) * 0.45);",
    "  vec3 R = reflect(-V, N);",
    "  fres = pow(1.0 - nv, 5.0);",
    "  vec3 c;",
    "  if (metal > 0.5) {",
    "    vec3 F = albedo + (1.0 - albedo) * fres;",
    "    c = diff * 0.12 + env(R, g) * F * ao;",
    "  } else {",
    "    float F = 0.04 + 0.96 * fres;",
    "    vec3 H = normalize(L1 + V);",
    "    float sp = pow(max(dot(N, H), 0.0), mix(10.0, 140.0, g)) * g * 0.8;",
    "    c = diff + (env(R, g) * F * g + sp * vec3(1.0, 0.94, 0.88)) * ao;",
    "  }",
    "  float rim = pow(1.0 - nv, 2.2) * d2;",
    "  c += rim * vec3(0.70, 0.80, 1.00) * 0.6 * ao;",
    "  float fl = exp(-pow(length(W.xz - uFlash.xy) / uFlash.z, 2.0)) * uFlash.w;",
    "  c += albedo * uFlashCol * fl * max(dot(N, normalize(vec3(uFlash.x, 0.6, uFlash.y) - W)), 0.0) * 0.8;",
    "  c += emi;",
    "  float dist = length(W - uCam);",
    "  float f = 1.0 - exp(-max(dist - uFog.x, 0.0) * uFog.y);",
    "  return mix(c, uFogCol, clamp(f, 0.0, 1.0));",
    "}",
  ].join("\n");

  var BOX_VS = [
    "#version 300 es",
    "layout(location=0) in vec3 aA; layout(location=1) in vec3 aB;",
    "layout(location=2) in vec3 iPos; layout(location=3) in vec3 iHalf; layout(location=4) in vec2 iRot;",
    "layout(location=5) in vec4 iCol; layout(location=6) in vec4 iEmi;",
    "uniform mat4 uVP; uniform float uMirror;",
    "out vec3 vN; out vec3 vW; out vec4 vCol; out vec4 vEmi; out vec3 vL;",
    "void main(){",
    "  float r = min(iRot.y, min(iHalf.x, min(iHalf.y, iHalf.z)));",
    "  vec3 inner = max(iHalf - r, vec3(0.0));",
    "  vec3 n = normalize(aB);",
    "  vec3 p = aA * inner + n * r;",
    "  vL = p / max(iHalf, vec3(1e-4));",
    "  float c = cos(iRot.x), s = sin(iRot.x);",
    "  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);",
    "  n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);",
    "  vW = p + iPos; vN = n; vCol = iCol; vEmi = iEmi;",
    "  if (uMirror > 0.5) { vW.y = -vW.y; vN.y = -vN.y; }",
    "  gl_Position = uVP * vec4(vW, 1.0);",
    "}",
  ].join("\n");

  var BOX_FS = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 vN; in vec3 vW; in vec4 vCol; in vec4 vEmi; in vec3 vL;",
    "uniform float uGlass; uniform float uMirror;",
    LIGHT,
    "out vec4 o;",
    "void main(){",
    "  vec3 N = normalize(vN); float fr;",
    "  if (!gl_FrontFacing) N = -N;",
    "  vec3 Wl = vW;",
    "  float mk = 1.0;",
    "  if (uMirror > 0.5) { Wl.y = -Wl.y; N.y = -N.y; mk = 0.5 * exp(-Wl.y * 0.85); }",
    "  if (uGlass > 0.5) {",
    "    float edge = clamp(max(abs(vL.y), abs(vL.z)), 0.0, 1.0);",
    "    float band = 0.5 + 0.5 * sin(vL.y * 140.0);",
    "    vec3 em = vEmi.rgb * mix(0.55, 1.5, pow(edge, 5.0)) * (0.95 + 0.05 * band);",
    "    vec3 c = shade(N, Wl, vCol.rgb * 0.25, 0.92, em, fr);",
    "    float k = clamp(vEmi.a * 7.0, 0.0, 1.0);",
    "    float a = clamp(vEmi.a + fr * 0.5 * k + dot(em, vec3(0.2)), 0.0, 0.85);",
    "    o = vec4(c * mk, a * mk);",
    "  } else {",
    "    o = vec4(shade(N, Wl, vCol.rgb, vCol.a, vEmi.rgb, fr) * mk, 1.0);",
    "  }",
    "}",
  ].join("\n");

  var SHADOW_VS = [
    "#version 300 es",
    "layout(location=0) in vec2 aQ;",
    "layout(location=2) in vec3 iPos; layout(location=3) in vec3 iHalf; layout(location=4) in vec2 iRot;",
    "layout(location=6) in vec4 iEmi;",
    "uniform mat4 uVP;",
    "out vec2 vL; out vec2 vHalf; out float vH; out float vGlass;",
    "void main(){",
    "  float h = max(iPos.y - iHalf.y, 0.0);",
    "  float spread = 0.22 + h * 0.6;",
    "  vec2 ext = iHalf.xz + spread;",
    "  vec2 l = aQ * ext;",
    "  float c = cos(iRot.x), s = sin(iRot.x);",
    "  vec2 w = vec2(c * l.x + s * l.y, -s * l.x + c * l.y) + iPos.xz;",
    "  vL = l; vHalf = iHalf.xz; vH = h; vGlass = iEmi.a < 0.99 ? 1.0 : 0.0;",
    "  gl_Position = uVP * vec4(w.x, 0.004, w.y, 1.0);",
    "}",
  ].join("\n");
  var SHADOW_FS = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 vL; in vec2 vHalf; in float vH; in float vGlass;",
    "out vec4 o;",
    "void main(){",
    "  float blur = 0.1 + vH * 0.55;",
    "  vec2 q = abs(vL) - vHalf * 0.94;",
    "  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);",
    "  float a = 1.0 - smoothstep(-blur, blur, sd);",
    "  a *= 0.85 * exp(-vH * 0.9) * (vGlass > 0.5 ? 0.2 : 1.0);",
    "  o = vec4(0.0, 0.0, 0.0, a);",
    "}",
  ].join("\n");

  var FLOOR_VS = [
    "#version 300 es",
    "layout(location=0) in vec2 aQ;",
    "uniform mat4 uVP; out vec3 vW;",
    "void main(){ vW = vec3(aQ.x * 140.0, 0.0, aQ.y * 140.0); gl_Position = uVP * vec4(vW, 1.0); }",
  ].join("\n");
  var FLOOR_FS = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 vW; out vec4 o;",
    "uniform vec3 uCam; uniform vec3 uFogCol; uniform vec2 uFog; uniform vec3 uBase; uniform vec4 uSpot; uniform vec3 uSpotCol;",
    "uniform vec4 uFlash; uniform vec3 uFlashCol;",
    "float grid(vec2 p, float s, float w){ vec2 q = p / s; vec2 fw = fwidth(q); vec2 g = abs(fract(q - 0.5) - 0.5) / max(fw * w, 1e-4); return (1.0 - min(min(g.x, g.y), 1.0)) * clamp(1.0 - max(fw.x, fw.y) * 2.0, 0.0, 1.0); }",
    "void main(){",
    "  vec2 p = vW.xz;",
    "  float dist = length(vW - uCam);",
    "  float g1 = grid(p, 1.0, 1.0) * 0.05; float g5 = grid(p, 5.0, 1.4) * 0.07;",
    "  float fade = exp(-dist * 0.05);",
    "  vec3 c = uBase + (g1 + g5) * fade * vec3(0.8, 0.82, 0.86);",
    "  float sp = exp(-pow(length(p - uSpot.xy) / uSpot.z, 2.0)) * uSpot.w;",
    "  c += uSpotCol * sp;",
    "  float fl = exp(-pow(length(p - uFlash.xy) / uFlash.z, 2.0)) * uFlash.w;",
    "  c += uFlashCol * fl * 0.35;",
    "  float f = 1.0 - exp(-max(dist - uFog.x, 0.0) * uFog.y);",
    "  float vy = normalize(uCam - vW).y;",
    "  float a = mix(0.72, 0.94, smoothstep(0.05, 0.85, vy));",
    "  o = vec4(mix(c, uFogCol, clamp(f, 0.0, 1.0)), mix(a, 1.0, clamp(f, 0.0, 1.0)));",
    "}",
  ].join("\n");

  var FS_VS = "#version 300 es\nlayout(location=0) in vec2 aQ; out vec2 vUv; void main(){ vUv = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }";
  var BRIGHT_FS = [
    "#version 300 es", "precision highp float;", "in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;",
    "void main(){",
    "  vec3 c = vec3(0.0);",
    "  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;",
    "  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;",
    "  c *= 0.25;",
    "  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);",
    "  c = clamp(c, 0.0, 64.0);",
    "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
    "  o = vec4(c * smoothstep(0.9, 2.0, l), 1.0);",
    "}",
  ].join("\n");
  var BLUR_FS = [
    "#version 300 es", "precision highp float;", "in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;",
    "void main(){",
    "  vec3 c = texture(uTex, vUv).rgb * 0.227027;",
    "  c += texture(uTex, vUv + uDir * 1.384615).rgb * 0.316216; c += texture(uTex, vUv - uDir * 1.384615).rgb * 0.316216;",
    "  c += texture(uTex, vUv + uDir * 3.230769).rgb * 0.070270; c += texture(uTex, vUv - uDir * 3.230769).rgb * 0.070270;",
    "  o = vec4(c, 1.0);",
    "}",
  ].join("\n");
  var COMP_FS = [
    "#version 300 es", "precision highp float;", "in vec2 vUv; out vec4 o;",
    "uniform sampler2D uTex; uniform sampler2D uBloom; uniform float uExposure; uniform float uTime; uniform vec2 uRes; uniform float uBloomK;",
    "vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "void main(){",
    "  vec3 s0 = texture(uTex, vUv).rgb;",
    "  if (any(isnan(s0)) || any(isinf(s0))) s0 = vec3(0.0);",
    "  vec3 c = clamp(s0, 0.0, 64.0) + texture(uBloom, vUv).rgb * uBloomK;",
    "  c = aces(c * uExposure);",
    "  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;",
    "  c *= mix(1.0, 0.7, smoothstep(0.4, 1.1, length(q)));",
    "  c = pow(c, vec3(1.0 / 2.2));",
    "  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);",
    "  c += (n - 0.5) / 255.0 * 1.5;",
    "  o = vec4(c, 1.0);",
    "}",
  ].join("\n");

  var P;
  try {
    P = {
      box: prog(BOX_VS, BOX_FS), shadow: prog(SHADOW_VS, SHADOW_FS), floor: prog(FLOOR_VS, FLOOR_FS),
      bright: prog(FS_VS, BRIGHT_FS), blur: prog(FS_VS, BLUR_FS), comp: prog(FS_VS, COMP_FS),
    };
  } catch (e) { fallback(String(e && e.message || e)); return; }

  /* ------------------------------------------------------------------ rounded box mesh */
  // Each vertex stores (a, b) per axis: position = a * inner + normalize(b) * radius. Neighbouring
  // faces meet on identical 45-degree seams, so one mesh draws a crack-free rounded box of any size.
  // Winding is counter-clockwise from outside: for each face (u, v, n) with u x v = n.
  function buildBox() {
    var S = [[-1, -1], [-1, -0.62], [-1, -0.27], [-1, 0], [1, 0], [1, 0.27], [1, 0.62], [1, 1]];
    var A = [], B = [], I = [], base = 0, M = S.length;
    [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]].forEach(function (f) {
      var u = f[0], v = f[1], nAx = f[2], sgn = f[3], i, j;
      for (j = 0; j < M; j++) for (i = 0; i < M; i++) {
        var a = [0, 0, 0], b = [0, 0, 0];
        a[u] = S[i][0]; b[u] = S[i][1];
        a[v] = S[j][0]; b[v] = S[j][1];
        a[nAx] = sgn; b[nAx] = sgn;
        A.push(a[0], a[1], a[2]); B.push(b[0], b[1], b[2]);
      }
      for (j = 0; j < M - 1; j++) for (i = 0; i < M - 1; i++) {
        var k = base + j * M + i;
        if (sgn > 0) I.push(k, k + 1, k + M + 1, k, k + M + 1, k + M);
        else I.push(k, k + M + 1, k + 1, k, k + M, k + M + 1);
      }
      base += M * M;
    });
    return { A: new Float32Array(A), B: new Float32Array(B), I: new Uint16Array(I) };
  }
  var mesh = buildBox();
  var quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  var tri = new Float32Array([-1, -1, 3, -1, -1, 3]);

  var STRIDE = 16, MAXI = 720;
  var INST = [[2, 3, 0], [3, 3, 3], [4, 2, 6], [5, 4, 8], [6, 4, 12]];
  function bindInstances(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    INST.forEach(function (o) {
      gl.enableVertexAttribArray(o[0]);
      gl.vertexAttribPointer(o[0], o[1], gl.FLOAT, false, STRIDE * 4, o[2] * 4);
      gl.vertexAttribDivisor(o[0], 1);
    });
  }
  function attr(loc, data, size) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function instBuf() { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, MAXI * STRIDE * 4, gl.DYNAMIC_DRAW); return b; }
  var bufO = instBuf(), bufG = instBuf();
  var ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  function vao(geom, buf) {
    var v = gl.createVertexArray();
    gl.bindVertexArray(v);
    geom();
    bindInstances(buf);
    gl.bindVertexArray(null);
    return v;
  }
  var boxGeom = function () {
    attr(0, mesh.A, 3); attr(1, mesh.B, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  };
  var quadGeom = function () { attr(0, quad, 2); };
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.I, gl.STATIC_DRAW);
  var vBoxO = vao(boxGeom, bufO), vBoxG = vao(boxGeom, bufG), vShO = vao(quadGeom, bufO), vShG = vao(quadGeom, bufG);
  var floorVao = gl.createVertexArray(); gl.bindVertexArray(floorVao); attr(0, quad, 2); gl.bindVertexArray(null);
  var triVao = gl.createVertexArray(); gl.bindVertexArray(triVao); attr(0, tri, 2); gl.bindVertexArray(null);

  var dataO = new Float32Array(MAXI * STRIDE), dataG = new Float32Array(MAXI * STRIDE);
  var nO = 0, nG = 0;
  function lin(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [Math.pow(((n >> 16) & 255) / 255, 2.2), Math.pow(((n >> 8) & 255) / 255, 2.2), Math.pow((n & 255) / 255, 2.2)];
  }
  function put(arr, i, p, h, rot, r, col, gloss, emi, alpha) {
    var o = i * STRIDE;
    arr[o] = p[0]; arr[o + 1] = p[1]; arr[o + 2] = p[2];
    arr[o + 3] = h[0]; arr[o + 4] = h[1]; arr[o + 5] = h[2];
    arr[o + 6] = rot; arr[o + 7] = r;
    arr[o + 8] = col[0]; arr[o + 9] = col[1]; arr[o + 10] = col[2]; arr[o + 11] = gloss;
    arr[o + 12] = emi ? emi[0] : 0; arr[o + 13] = emi ? emi[1] : 0; arr[o + 14] = emi ? emi[2] : 0; arr[o + 15] = alpha;
  }
  // opt.metal: reflective metal (gloss is its polish). Encoded as gloss + 2 for the shader.
  function box(p, h, opt) {
    opt = opt || {};
    if (nO >= MAXI) return;
    var g = opt.gloss == null ? 0.35 : opt.gloss;
    put(dataO, nO++, p, h, opt.rot || 0, opt.r == null ? 0.06 : opt.r, opt.col || C.ink, opt.metal ? g + 2 : g, opt.emi, 1);
  }
  function glass(p, h, opt) {
    opt = opt || {};
    if (nG >= MAXI) return;
    put(dataG, nG++, p, h, opt.rot || 0, opt.r == null ? 0.05 : opt.r, opt.col || C.glass, 0.9, opt.emi, opt.alpha == null ? 0.06 : opt.alpha);
  }

  /* ------------------------------------------------------------------ palette (linear) */
  var C = {
    bg: lin("#0b0b0c"), floor: lin("#0f0f10"), ink: lin("#1d1d1f"), ink2: lin("#2a2a2d"), graphite: lin("#8c9097"),
    steel: lin("#5d6168"), paper: lin("#e6e3de"), paper2: lin("#cbc7c1"), line: lin("#6f6a64"), call: lin("#9a9aa0"),
    signal: lin("#f2603d"), glass: lin("#b4bccb"), warn: lin("#d9a441"), off: lin("#2c2c2f"),
  };
  function scl(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ------------------------------------------------------------------ math */
  function persp(fov, asp, n, f, sx, sy) {
    var t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, sx, sy, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
  }
  function lookAt(e, c, u) {
    var z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }
  function easeInOutQ(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function projectNdc(vp, p) {
    var x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    var y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    var w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    return [x / w, y / w, w];
  }
  function project(vp, p) { var n = projectNdc(vp, p); return [(n[0] * 0.5 + 0.5) * vw, (1 - (n[1] * 0.5 + 0.5)) * vh, n[2]]; }

  /* ------------------------------------------------------------------ world layout */
  var BYPASS = [[-6.2, 0], [-2.0, 0], [-1.1, 1.3], [0, 2.05], [1.1, 1.9], [2.1, 1.75]], BYPASS_END = BYPASS[BYPASS.length - 1];
  var BYPASS_CUM = [0], BYPASS_LEN = 0;
  for (var bi = 1; bi < BYPASS.length; bi++) { BYPASS_LEN += Math.hypot(BYPASS[bi][0] - BYPASS[bi - 1][0], BYPASS[bi][1] - BYPASS[bi - 1][1]); BYPASS_CUM.push(BYPASS_LEN); }
  function bypassAt(u) {
    var s = u * BYPASS_LEN, j = 1;
    while (j < BYPASS.length - 1 && BYPASS_CUM[j] < s) j++;
    var a = BYPASS[j - 1], b = BYPASS[j], t = (s - BYPASS_CUM[j - 1]) / ((BYPASS_CUM[j] - BYPASS_CUM[j - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  var LOG = [4.6, 0, 0], RING = [-1.5, 0, -27], COST = [19, 0, -13], RR = 4.7;
  var SLAB = [0.95, 0.055, 0.62], CALL = [0.46, 0.24, 0.32], SLAB_STEP = SLAB[1] * 2 + 0.03;

  // Each section: what to show (an axis-aligned box), from where (yaw, pitch in degrees: yaw 0
  // looks toward -z), lens, and the screen rectangle [x0, y0, x1, y1] (0..1, y down) it may fill.
  var DESK = [0.5, 0.14, 0.95, 0.88], PHONE = [0.07, 0.1, 0.93, 0.5];
  var SECT = {
    hero:     { box: [[-2.4, 0, -1.6], [5.7, 3.25, 1.6]], yaw: -57, pitch: 19, fov: 28, spot: [0.6, 0.0, 4.5, 0.08], dim: 0, rect: [0.47, 0.1, 0.95, 0.84], phone: [-72, 15] },
    native:   { box: [[-2.6, 0, -1.7], [5.9, 6.1, 1.7]], yaw: -128, pitch: 21, fov: 28, spot: [1.5, 0, 5, 0.07], dim: 0, rect: [0.5, 0.12, 0.97, 0.88] },
    installs: { box: [[RING[0] - RR - 0.9, 0, RING[2] - RR - 0.9], [RING[0] + RR + 0.9, 2.0, RING[2] + RR + 0.9]], yaw: 34, pitch: 40, fov: 30, spot: [RING[0], RING[2], 7.5, 0.05], dim: 0, rect: [0.44, 0.06, 0.99, 0.97] },
    exhibits: { box: [[-1.4, 0, -1.7], [5.9, 3.3, 1.7]], yaw: -62, pitch: 14, fov: 28, spot: [1.5, 0, 5, 0.05], dim: 0.25, rect: [0.62, 0.16, 0.97, 0.84] },
    cost:     { box: [[COST[0] - 4.8, 0, COST[2] - 0.6], [COST[0] + 4.8, 3.4, COST[2] + 2.0]], yaw: -16, pitch: 13, fov: 24, spot: [COST[0], COST[2], 7, 0.06], dim: 0, rect: [0.12, 0.42, 0.88, 0.9] },
    local:    { rect: [0.46, 0.16, 0.84, 0.86], box: [[LOG[0] - 1.7, 0, -1.4], [LOG[0] + 1.7, 2.5, 1.4]], yaw: 62, pitch: 20, fov: 28, spot: [LOG[0], 0, 5.5, 0.06], dim: 0 },
    limits:   { box: [[-4.4, 0, -1.4], [3.2, 3.2, 2.4]], yaw: -26, pitch: 36, fov: 30, spot: [0, 1, 6, 0.05], dim: 0, rect: [0.5, 0.12, 0.97, 0.88] },
    off:      { box: [[-0.6, 0, -1.7], [5.6, 3.5, 1.7]], yaw: -68, pitch: 8, fov: 26, spot: [0, 0, 4.5, 0.08], dim: 0, rect: [0.58, 0.16, 0.9, 0.86] },
    why:      { box: [[-12, 0, -32], [24, 3, 3]], yaw: -30, pitch: 34, fov: 34, spot: [0, -6, 14, 0.02], dim: 0.6, rect: [0.1, 0.1, 0.9, 0.9] },
  };
  SECT.installs.pts = [];
  for (var pi = 0; pi < 16; pi++) {
    var pa = pi / 16 * Math.PI * 2;
    SECT.installs.pts.push([RING[0] + Math.cos(pa) * (RR + 2.6), 0, RING[2] + Math.sin(pa) * (RR + 2.6)], [RING[0] + Math.cos(pa) * (RR + 0.4), 2.6, RING[2] + Math.sin(pa) * (RR + 0.4)]);
  }
  SECT.installs.ptsPhone = [];
  for (var pj = 0; pj < 16; pj++) {
    var pb = pj / 16 * Math.PI * 2;
    SECT.installs.ptsPhone.push([RING[0] + Math.cos(pb) * (RR + 0.8), 0, RING[2] + Math.sin(pb) * (RR + 0.8)], [RING[0] + Math.cos(pb) * (RR + 0.4), 2.6, RING[2] + Math.sin(pb) * (RR + 0.4)]);
  }
  var keys = {};
  function fitKey(s, narrow) {
    var rect = narrow ? PHONE : (s.rect || DESK);
    if (narrow && s === SECT.hero) rect = [0.07, 0.08, 0.93, 0.36];
    var dimK = narrow && s === SECT.exhibits ? 1 : s.dim;
    if (narrow && (s === SECT.exhibits || s === SECT.why)) rect = [0.05, 0.1, 0.95, 0.9];
    var b0 = s.box[0], b1 = s.box[1];
    var c = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2];
    var yaw = (narrow && s.phone ? s.phone[0] : s.yaw) * Math.PI / 180, pitch = (narrow && s.phone ? s.phone[1] : s.pitch) * Math.PI / 180;
    var dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    var fov = (narrow ? s.fov * 1.25 : s.fov);
    var asp = vw / vh;
    var rcx = (rect[0] + rect[2]) / 2, rcy = (rect[1] + rect[3]) / 2;
    var sx = -(rcx * 2 - 1), sy = -(1 - rcy * 2);
    var hx = rect[2] - rect[0], hy = rect[3] - rect[1];
    var pts = narrow && s.ptsPhone ? s.ptsPhone : s.pts;
    var corners = pts || [];
    if (!pts) for (var i = 0; i < 8; i++) corners.push([i & 1 ? b1[0] : b0[0], i & 2 ? b1[1] : b0[1], i & 4 ? b1[2] : b0[2]]);
    var proj = persp(fov * Math.PI / 180, asp, 0.1, 200, sx, sy);
    var lo = 1, hi = 120;
    for (var it = 0; it < 32; it++) {
      var D = (lo + hi) / 2;
      var eye = [c[0] + dir[0] * D, c[1] + dir[1] * D, c[2] + dir[2] * D];
      var vp = mul(proj, lookAt(eye, c, [0, 1, 0]));
      var ok = true;
      for (var k = 0; k < corners.length && ok; k++) {
        var n = projectNdc(vp, corners[k]);
        if (n[2] <= 0.1) { ok = false; break; }
        var x = (n[0] + sx) * 0.5, y = (n[1] + sy) * 0.5;
        if (Math.abs(x) > hx / 2 || Math.abs(y) > hy / 2) ok = false;
      }
      if (ok) hi = D; else lo = D;
    }
    var Df = hi;
    return { pos: [c[0] + dir[0] * Df, c[1] + dir[1] * Df, c[2] + dir[2] * Df], tgt: c, fov: fov, sx: sx, sy: sy, spot: s.spot, dim: dimK };
  }
  // ?cam=hero:yaw,pitch,fov overrides a section's view; used to compare framings, harmless otherwise
  (function () {
    var m = /[?&]cam=([a-z]+):([-0-9.,]+)/.exec(location.search);
    if (!m || !SECT[m[1]]) return;
    var v = m[2].split(",").map(Number);
    if (v.length === 3 && v.every(isFinite)) { SECT[m[1]].yaw = v[0]; SECT[m[1]].pitch = v[1]; SECT[m[1]].fov = v[2]; }
  })();
  function fitAll() { var nr = narrowMQ.matches; keys = {}; Object.keys(SECT).forEach(function (k) { keys[k] = fitKey(SECT[k], nr); }); }

  /* ------------------------------------------------------------------ hooks ring data */
  var EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"];
  var hooks = hookRows.map(function (tr) {
    return { el: tr, id: tr.getAttribute("data-hook"), ev: tr.getAttribute("data-event"), st: tr.getAttribute("data-state"), file: tr.getAttribute("data-file") };
  });
  var stations = EVENTS.map(function (ev, i) {
    var a = -Math.PI / 2 + i / EVENTS.length * Math.PI * 2 + 0.35;
    return { ev: ev, a: a, p: [RING[0] + Math.cos(a) * RR, 0, RING[2] + Math.sin(a) * RR], hooks: hooks.filter(function (h) { return h.ev === ev; }) };
  });
  stations.forEach(function (s) {
    var n = s.hooks.length;
    s.hooks.forEach(function (h, j) {
      var tx = -Math.sin(s.a), tz = Math.cos(s.a);
      var off = (j - (n - 1) / 2) * 0.82;
      h.p = [s.p[0] + tx * off, 0, s.p[2] + tz * off];
      h.height = h.st === "deny" ? 1.55 : h.st === "on" ? 1.15 : h.st === "warn" ? 0.78 : 0.3;
    });
  });
  var selectedHook = hooks.length ? hooks[0] : null;

  /* ------------------------------------------------------------------ cost columns data */
  var costs = costItems.map(function (li, i) { return { el: li, n: +li.getAttribute("data-cost"), label: li.getAttribute("data-label"), i: i }; });
  function costX(i) { return COST[0] - 4.2 + i * 1.4; }

  /* ------------------------------------------------------------------ HUD: HTML labels pinned to the world */
  var hudEls = [];
  function hudEl(cls, html, set, anchor, opt) {
    var el = d.createElement(opt && opt.button ? "button" : "div");
    el.className = "hud " + cls;
    if (opt && opt.button) el.type = "button";
    el.innerHTML = html;
    hud.appendChild(el);
    var o = { el: el, set: set, anchor: anchor, o: opt || {} };
    hudEls.push(o);
    return o;
  }
  var EVENT_LABEL = { SessionStart: "Session start", UserPromptSubmit: "Prompt", PreToolUse: "Before a tool runs", PostToolUse: "After it runs", Stop: "Turn end", SessionEnd: "Session end" };
  var laneLabel = null, selLabel = null, offLabel = null, plusLabel = null, partLabel = null;
  if (hud) {
    stations.forEach(function (s) {
      var lp = [RING[0] + Math.cos(s.a) * (RR + 1.25), 0.02, RING[2] + Math.sin(s.a) * (RR + 1.25)];
      hudEl("ev", "<span>" + EVENT_LABEL[s.ev] + "</span>", "installs", lp, { desktopOnly: true });
    });
    hooks.forEach(function (h) {
      var o = hudEl("pin " + h.st, "<span class=\"vh\">" + h.file + ", " + h.st + "</span>", "installs", [h.p[0], h.height * 2 + 0.36, h.p[2]], { button: true });
      o.el.setAttribute("aria-label", "Hook " + h.id + ": " + h.file + " on " + h.ev + ", default " + h.st);
      o.el.addEventListener("click", function () { pickHook(h); });
      o.el.addEventListener("pointerenter", function () { pickHook(h); });
      h.pin = o;
    });
    costs.forEach(function (c, i) {
      hudEl("col", "<b>" + c.n + "</b><span>" + c.label + "</span>", "cost", [costX(i), 0.02, COST[2] + 1.55], { row: true });
    });
    [["observations.jsonl", 0.3], ["project.json", 0.62], ["lessons, *.yaml", 0.94]].forEach(function (f) {
      hudEl("file", f[0], "local", [LOG[0] + 0.3, f[1], LOG[2] - 0.64]);
    });
    selLabel = hudEl("sel", "", "installs", [0, 0, 0]);
    hudEl("split", "<b>This plugin</b> the rules", "native", [0, 5.95, 0], { noPart: true });
    hudEl("split", "<b>Claude Code</b> the hook it runs in", "native", [0, 0.1, -1.45], { noPart: true });
    plusLabel = hudEl("plus", "+1 row", "hero", [LOG[0], 1.6, 0], { until: true });
    partLabel = hudEl("part", "", "native", [0, 3.7, 0], { part: true });
    offLabel = hudEl("offl", "<b>Enabled</b> refused before it runs", "off", [0, 3.75, 0]);
    laneLabel = hudEl("lane", "<code>src/price.ts</code><span>written by echo, around the gate</span>", "limits", [BYPASS_END[0] + 0.55, 0.02, BYPASS_END[1]]);
  }
  var hookCard = d.getElementById("hook-card"), scrim = d.getElementById("scrim");
  var leader = null;
  if (hud) { leader = d.createElement("div"); leader.className = "leader"; hud.appendChild(leader); }
  function pickHook(h) {
    selectedHook = h;
    if (selLabel) { selLabel.el.innerHTML = h.file.replace(/^.*\//, "") + "<small>" + (EVENT_LABEL[h.ev] || h.ev) + "</small>"; selLabel.anchor = [h.p[0], h.height * 2 + 0.95, h.p[2]]; }
    hooks.forEach(function (x) { if (x.pin) x.pin.el.setAttribute("aria-pressed", x === h ? "true" : "false"); });
    if (W.__pickHookCard) W.__pickHookCard(h.el);
    dirty = true;
  }

  /* ------------------------------------------------------------------ simulation state */
  var events = [], stackN = 6, stackTarget = 6, lastUser = -1e9, slabGlow = 0;
  var curtain = 0, curtainCol = C.signal, railHold = 0, railPass = 0, flash = 0, flashCol = C.signal;
  var liftS = 0, power = 1, powerTarget = 1, costBuild = 0, nextAuto = 1.2, autoIdx = 0, laneT = 0, nextOff = 0;
  // hovering a comparison tile lights the part of the world it is about
  var partHi = { gate: 0, log: 0, seam: 0, native: 0, lessons: 0, aside: 0 }, partTarget = null;
  [].slice.call(d.querySelectorAll("[data-part]")).forEach(function (el) {
    var on = function () { partTarget = el.getAttribute("data-part"); el.classList.add("on"); dirty = true; };
    var off = function () { if (partTarget === el.getAttribute("data-part")) partTarget = null; el.classList.remove("on"); dirty = true; };
    el.addEventListener("pointerenter", on); el.addEventListener("focus", on);
    el.addEventListener("pointerleave", off); el.addEventListener("blur", off);
  });
  var pres = { ring: 0, cost: 0, gate: 1 };
  var tNow = 0;
  var DENY_HOLD = 1.6, scan = 1, plusUntil = 0;
  function fire(i, byUser) {
    if (byUser && card) card.classList.add("pending");
    var c = calls[i];
    if (!c) return;
    select(i);
    if (byUser) lastUser = tNow;
    events.forEach(function (e) { if (!e.done) e.t0 -= 20; });
    events.push({ c: c, t0: tNow, done: false, shown: false, mode: powerTarget < 0.5 ? "pass" : c.verdict });
    if (events.length > 6) events.shift();
    if (state.reduced) showVerdict(c);
    dirty = true;
  }
  chips.forEach(function (b, i) { b.addEventListener("click", function () { fire(i, true); }); });
  // exhibit tabs drive the world: a replayed run goes through the gate, or a part of the log lights
  var exTab = d.querySelector('[role="tab"][aria-selected="true"]'), exLight = null, nextEx = 0;
  function exhibitAct(t) {
    exTab = t;
    var r = t.getAttribute("data-replay");
    exLight = t.getAttribute("data-light");
    if (r) { for (var ci = 0; ci < calls.length; ci++) if (calls[ci].cmd.indexOf(r) === 0) { fire(ci, false); break; } }
    dirty = true;
  }
  [].slice.call(d.querySelectorAll('[role="tab"]')).forEach(function (t) { t.addEventListener("click", function () { exhibitAct(t); nextEx = tNow + 4.6; }); });
  var PART_AT = {
    gate: function () { return [0, 3.6, 0]; },
    seam: function () { return [0, 3.4, 0]; },
    log: function () { return [LOG[0], 0.1 + Math.floor(stackN) * SLAB_STEP + 0.45, 0]; },
    native: function () { return [0, 3.6, 0]; },
    lessons: function () { return [LOG[0], 0.1 + Math.floor(stackN) * SLAB_STEP + 0.45, 0]; },
    aside: function () { return [0, 3.6, 0]; },
  };
  var PART_TEXT = { gate: "<b>This plugin</b> the rules, as a deny in every mode", seam: "<b>This plugin</b> your typecheck at turn end", log: "<b>This plugin</b> one redacted row per tool call", lessons: "<b>This plugin</b> up to 10 lessons at session start", aside: "<b>This plugin</b> a git-state report, not a hook", native: "<b>Claude Code</b> covers this already" };
  var pw = d.getElementById("power");
  if (pw) pw.addEventListener("click", function () {
    var on = pw.getAttribute("aria-checked") !== "true";
    pw.setAttribute("aria-checked", on ? "true" : "false");
    powerTarget = on ? 1 : 0;
    var lbl = d.getElementById("power-state");
    if (lbl) lbl.textContent = on ? "Enabled" : "Disabled";
    if (offLabel) offLabel.el.innerHTML = on ? "<b>Enabled</b> refused before it runs" : "<b>Disabled</b> runs, and nothing logs it";
    events.forEach(function (e) { e.done = true; }); events = []; curtain = 0; railHold = 0; flash = 0;
    nextOff = tNow + 3.6;
    fire(0, false);
    dirty = true;
  });

  /* ------------------------------------------------------------------ build the scene for a frame */
  function scene(t, dt) {
    nO = 0; nG = 0;
    if (pres.gate < 0.02) { sceneFar(t, dt); return; }
    var pf = power, i;
    var gk = (1 - 0.55 * partHi.native - 0.35 * partHi.aside) * (0.55 + 0.45 * pf);
    var metal = { col: scl(C.graphite, gk), metal: true, gloss: 0.62, r: 0.07, emi: scl(C.paper, 0.12 * partHi.gate) };
    var armed = pf * (0.75 + 0.25 * Math.sin(t * 1.6));

    // rail: a dark track with steel edges and sleepers, straight into the log platform
    box([LOG[0], 0.03, 0], [1.25, 0.03, 0.9], { col: C.ink, r: 0.03, gloss: 0.45 });
    var railOn = (weights.local || 0) < 0.45;
    if (railOn) {
      box([-7, 0.09, 0], [9.2, 0.03, 0.5], { col: C.ink2, r: 0.03, gloss: 0.55 });
      box([2.0, 0.09, 0], [1.6, 0.03, 0.5], { col: C.ink2, r: 0.03, gloss: 0.55 });
      [0.38, -0.38].forEach(function (z) {
        box([-7, 0.125, z], [9.2, 0.01, 0.014], { col: C.steel, r: 0.006, gloss: 0.9, metal: true });
        box([2.0, 0.125, z], [1.6, 0.01, 0.014], { col: C.steel, r: 0.006, gloss: 0.9, metal: true });
      });
      for (i = 0; i < 24; i++) box([-15.6 + i * 0.75, 0.022, 0], [0.05, 0.022, 0.62], { col: C.ink, r: 0.015, gloss: 0.3 });
    }
    if (railOn) {
      // the stretch of rail in front of the gate carries the verdict
      box([-1.45, 0.122, 0], [1.15, 0.006, 0.3], { col: C.ink, r: 0.004, emi: scl(curtainCol, railHold * 0.9 * pf) });
      // and the stretch behind it lights up for a call that passes
      box([2.0, 0.122, 0], [1.5, 0.006, 0.3], { col: C.ink, r: 0.004, emi: scl(C.paper, railPass * 0.8 * pf) });
    }

    // gate: satin graphite frame, glass curtain, lit seam
    var openK = ease(pf);
    // in the data section the gate sinks away and the sealed case has the stage to itself
    var gs = 1 - ease((weights.local || 0) * 1.3);
    [1.22, -1.22].forEach(function (z) {
      var zi = z > 0 ? 1 : -1;
      if (gs < 0.15) return;
      box([0, 0.07, z], [0.32, 0.07, 0.32], { col: scl(C.graphite, gk * 0.7), metal: true, gloss: 0.45, r: 0.04 });
      box([0, 1.5 * gs, z], [0.22, 1.4 * gs, 0.22], metal);
      // a recessed groove up the front of each post, and an armed light on its inner face
      box([-0.222, 1.5 * gs, z], [0.006, 1.18 * gs, 0.045], { col: C.ink, r: 0.004, gloss: 0.2 });
      box([0, 1.5 * gs, z - zi * 0.222], [0.06, 1.12 * gs, 0.006], { col: C.ink, r: 0.004, emi: scl(mix3(C.paper, curtainCol, clamp(curtain, 0, 1)), (0.45 * armed + curtain * 2.2 + partHi.gate * 1.2) * pf) });
    });
    if (gs >= 0.15) {
      box([0, 3.07 * gs, 0], [0.32, 0.2 * gs, 1.48], metal);
      box([-0.322, 3.07 * gs, 0], [0.004, 0.085 * gs, 1.28], { col: C.ink, r: 0.004, gloss: 0.2 });
      var lineCol = mix3(C.paper, curtainCol, clamp(curtain, 0, 1));
      box([-0.326, 3.07 * gs, 0], [0.004, 0.012, 1.0], { col: C.ink, r: 0.003, emi: scl(lineCol, (0.5 + 0.5 * armed + curtain * 4 + partHi.seam * 7) * pf) });
      if (scan < 1) box([0, (2.78 - scan * 2.5) * gs, 0], [0.04, 0.022, 0.96], { col: C.ink, r: 0.01, emi: scl(C.paper, 4.5 * (1 - scan * 0.6) * pf) });
      var ch = 1.32 * openK * gs + 0.001;
      // in the comparison section the rules (the curtain) lift out of the hook frame Claude Code ships
      var lift = ease(liftS);
      glass([0, 2.84 * gs - ch + lift * 2.75, 0], [0.03, ch, 0.97], { emi: mix3(scl(curtainCol, curtain * 1.25 * pf), scl(C.signal, 0.9), Math.max(partHi.gate * 0.8, lift * 0.45)), alpha: 0.05 + 0.06 * pf + lift * 0.05, col: C.glass });
      if (lift > 0.02) [0.985, -0.985].forEach(function (z) { box([0, 2.84 * gs - ch + lift * 2.75, z], [0.012, ch, 0.008], { col: C.ink, r: 0.004, emi: scl(C.signal, 1.4 * lift) }); });
    }
    scan = Math.min(1, scan + dt * 2.6);

    // the log: paper rows, each with two engraved lines so it reads as a record
    stackN += (stackTarget - stackN) * Math.min(1, dt * 6);
    var nFull = Math.floor(stackN + 0.001);
    for (i = 0; i < nFull; i++) {
      var y = 0.1 + SLAB[1] + i * SLAB_STEP;
      var jx = Math.sin(i * 7.31) * 0.035, jz = Math.cos(i * 4.17) * 0.03, jr = Math.sin(i * 3.7) * 0.035;
      var top = i === nFull - 1;
      var glow = (top ? slabGlow : 0) + partHi.log * 0.55 + (i >= nFull - 3 ? partHi.lessons * 0.8 : 0);
      if (top) y += Math.sin(Math.min(1, (1 - slabGlow) * 3) * Math.PI) * 0.06 * (slabGlow > 0 ? 1 : 0);
      var dimS = 0.4 + 0.6 * pf;
      box([LOG[0] + jx, y, jz], SLAB, { rot: jr, col: scl(i % 2 ? C.paper2 : C.paper, dimS), r: 0.03, gloss: 0.3, emi: scl(C.paper, glow * 0.9) });
      box([LOG[0] + jx - 0.92, y + 0.006, jz - 0.14], [0.006, 0.012, 0.32], { col: C.line, r: 0.004, gloss: 0.1 });
      box([LOG[0] + jx - 0.92, y + 0.006, jz + 0.31], [0.006, 0.012, 0.12], { col: C.line, r: 0.004, gloss: 0.1 });
    }
    var topY = 0.1 + SLAB[1] + nFull * SLAB_STEP;
    slabGlow = Math.max(0, slabGlow - dt * 0.45);
    railPass = Math.max(0, railPass - dt * 0.7);

    // tool calls in flight
    var holding = 0;
    events.forEach(function (e) {
      if (e.done) return;
      var k = t - e.t0, c = e.c, deny = e.mode === "deny";
      var startX = -7.0;
      if (e.mode === "pass") {
        // plugin disabled: the call runs straight through and nothing logs it
        var kp = k / 2.0;
        var ps = 1 - easeIn(clamp((k - 2.2) / 0.5, 0, 1));
        if (ps <= 0.001) { e.done = true; return; }
        box([lerp(startX, 1.4, easeInOutQ(kp)), 0.38, 0], [CALL[0] * ps, CALL[1] * ps, CALL[2] * ps], { col: C.call, gloss: 0.55, r: 0.08 });
        return;
      }
      var p, h = CALL, col = C.call, emi = null, alive = true, gloss = 0.55;
      if (deny) {
        var impact = 0.8;
        if (k < impact) p = [lerp(startX, -0.62, easeInOutQ(k / impact)), 0.38, 0];
        else {
          if (!e.shown) { e.shown = true; showVerdict(c); flashCol = C.signal; curtainCol = C.signal; }
          var kk = k - impact;
          var back = easeOut(kk / 0.45) * 0.42 - Math.sin(clamp(kk / 0.45, 0, 1) * Math.PI) * 0.06;
          p = [-0.62 - back, 0.38, 0];
          var sq = Math.sin(clamp(kk / 0.22, 0, 1) * Math.PI) * 0.22;
          h = [CALL[0] * (1 - sq), CALL[1] * (1 + sq * 0.6), CALL[2] * (1 + sq * 0.3)];
          col = mix3(C.call, C.signal, clamp(kk * 5, 0, 1));
          emi = scl(C.signal, 0.25 + 0.5 * Math.exp(-kk * 3));
          if (kk < DENY_HOLD) holding = Math.max(holding, 1 - Math.pow(kk / DENY_HOLD, 6));
          if (kk > DENY_HOLD) {
            // sent back: the refused call rides the rail back the way it came
            var kb = (kk - DENY_HOLD) / 1.1;
            p[0] -= easeIn(kb) * 7.5;
            var s = 1 - easeIn(clamp((kb - 0.75) / 0.25, 0, 1));
            h = [h[0] * s, h[1] * s, h[2] * s];
            if (kb >= 1) alive = false;
          }
        }
      } else {
        var arrive = 1.1, land = 1.95;
        if (k < arrive) {
          var x = lerp(startX, 2.5, easeInOutQ(k / arrive));
          p = [x, 0.38, 0];
          if (!e.shown && x > -0.4) { e.shown = true; showVerdict(c); curtainCol = c.note ? C.warn : C.paper; curtain = 0.95; railPass = 1; scan = 0; }
        } else {
          var u = ease((k - arrive) / (land - arrive));
          p = [lerp(2.5, LOG[0], u), lerp(0.38, topY, u) + Math.sin(u * Math.PI) * 1.1, 0];
          h = lerp3(CALL, SLAB, u);
          col = mix3(C.call, C.paper, u);
          gloss = lerp(0.55, 0.3, u);
          if (u >= 1) { alive = false; stackTarget = Math.min(stackTarget + 1, 16); stackN = Math.max(stackN, stackTarget); slabGlow = 1; plusUntil = tNow + 2.4; if (plusLabel) plusLabel.el.textContent = "+1 row, " + (Math.round(stackTarget)) + " logged"; }
        }
      }
      if (!alive) { e.done = true; return; }
      box(p, h, { col: col, gloss: gloss, r: 0.08, emi: emi });
    });
    // disabled: an outline where the next row would have gone, because nothing writes it
    if (pf < 0.5) {
      var ghostY = 0.1 + SLAB[1] + nFull * SLAB_STEP;
      glass([LOG[0], ghostY, 0], SLAB, { alpha: 0.02, r: 0.03, col: C.glass, emi: scl(C.paper, 0.04 * (1 - pf)) });
    }
    if (stackTarget >= 16 && !events.some(function (e) { return !e.done; })) stackTarget = 6;
    // verdict light: held while a refused call is parked at the gate, a short flash for a pass
    if (holding > 0) { curtain = Math.max(curtain, holding); railHold = holding; flash = holding; }
    else { curtain = Math.max(0, curtain - dt * 1.4); railHold = Math.max(0, railHold - dt * 2); flash = Math.max(0, flash - dt * 2); }

    sceneFar(t, dt);
  }
  function sceneFar(t, dt) {
    var i;
    // limits lane: a write by shell redirection slides past the gate on its own lane
    var wl = weights.limits || 0;
    if (wl > 0.02) {
      var a = clamp(wl * 1.4 - 0.2, 0, 1);
      // the route around the gate: along the rail, out past the left post, and into a file
      for (var di = 0; di < BYPASS_LEN; di += 0.34) {
        var dp = bypassAt(di / BYPASS_LEN);
        box([dp[0], 0.012, dp[1]], [0.07 * a, 0.006, 0.035 * a], { rot: -dp[2], col: C.ink, r: 0.004, emi: scl(C.warn, 0.35 * a) });
      }
      laneT = state.reduced ? 0.7 : (laneT + dt * 0.16) % 1.15;
      var bp = bypassAt(Math.min(1, laneT));
      var bs = a * (1 - ease((laneT - 1) / 0.15));
      if (bs > 0.01) box([bp[0], 0.3, bp[1]], [0.4 * bs, 0.2 * bs, 0.28 * bs], { rot: -bp[2], col: scl(C.warn, 0.62), gloss: 0.45, r: 0.08, emi: scl(C.warn, 0.22) });
      box([BYPASS_END[0] + 0.55, 0.42, BYPASS_END[1]], [0.26 * a, 0.36 * a, 0.32 * a], { col: C.paper2, r: 0.05, gloss: 0.3, emi: scl(C.warn, 0.25 * Math.max(0, laneT - 0.9) * 4 * a) });
    }

    // the sealed machine around the log
    var wlc = weights.local || 0;
    if (wlc > 0.02) {
      var b = ease(wlc * 1.3);
      var bx = 1.55 * b + 0.01, by = 1.2 * b + 0.01, bz = 1.25 * b + 0.01;
      glass([LOG[0], 0.07 + by, 0], [bx, by, bz], { alpha: 0.09, r: 0.18, col: C.glass, emi: scl(C.glass, 0.015 * b) });
      // the seal: a lit seam where the case meets its base
      box([LOG[0], 0.05, 0], [bx + 0.06, 0.05, bz + 0.06], { col: scl(C.graphite, 0.6), metal: true, gloss: 0.5, r: 0.04 });
      [1, -1].forEach(function (q) {
        box([LOG[0], 0.105, q * (bz + 0.062)], [bx + 0.06, 0.008, 0.004], { col: C.ink, r: 0.003, emi: scl(C.paper, 0.9 * b) });
        box([LOG[0] + q * (bx + 0.062), 0.105, 0], [0.004, 0.008, bz + 0.06], { col: C.ink, r: 0.003, emi: scl(C.paper, 0.9 * b) });
      });
    }

    // lifecycle ring: rises from the floor near its section
    var pr = ease(pres.ring);
    if (pr > 0.01) {
      var seg = 44;
      for (i = 0; i < seg; i++) {
        var a0 = i / seg * Math.PI * 2;
        box([RING[0] + Math.cos(a0) * RR, 0.035, RING[2] + Math.sin(a0) * RR], [0.33, 0.03, 0.11], { rot: -a0 + Math.PI / 2, col: C.steel, metal: true, gloss: 0.55, r: 0.02 });
        box([RING[0] + Math.cos(a0) * RR, 0.068, RING[2] + Math.sin(a0) * RR], [0.33, 0.004, 0.012], { rot: -a0 + Math.PI / 2, col: C.ink, r: 0.003, emi: scl(C.paper, 0.35 * pr) });
      }
      var pulseA = state.reduced ? 0.3 : (t * 0.55) % (Math.PI * 2);
      box([RING[0] + Math.cos(pulseA) * RR, 0.18, RING[2] + Math.sin(pulseA) * RR], [0.2, 0.11, 0.15], { rot: -pulseA + Math.PI / 2, col: C.paper, r: 0.06, gloss: 0.7, emi: scl(C.paper, 0.6 * pr) });
      stations.forEach(function (s) {
        var da = Math.abs(((pulseA - s.a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        var lit = Math.exp(-da * da * 30);
        var n = Math.max(1, s.hooks.length);
        box([s.p[0], 0.07, s.p[2]], [0.66 + n * 0.41, 0.06, 0.66], { rot: -s.a + Math.PI / 2, col: C.graphite, metal: true, gloss: 0.5, r: 0.05, emi: scl(C.paper, 0.05 * lit) });
        s.hooks.forEach(function (h) {
          var sel = selectedHook === h ? 1 : 0;
          var hh = h.height * pr;
          var col = h.st === "deny" ? C.signal : h.st === "on" ? C.paper : h.st === "warn" ? C.warn : C.off;
          var e = h.st === "deny" ? scl(C.signal, 0.3 + 0.35 * lit + 0.6 * sel) : h.st === "on" ? scl(C.paper, 0.03 + 0.2 * lit + 0.22 * sel) : h.st === "warn" ? scl(C.warn, 0.05 + 0.12 * lit + 0.45 * sel) : scl(C.paper, 0.04 * sel);
          var wdt = 0.25 + sel * 0.03;
          var topY2 = 0.13 + hh * 2;
          if (h.st === "warn") {
            // warns only: a dark body under a hollow amber ring
            box([h.p[0], 0.13 + hh, h.p[2]], [wdt, hh, wdt], { col: C.ink2, r: 0.05, gloss: 0.5 });
            var we = scl(C.warn, 0.45 + 0.4 * lit + 0.5 * sel);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (q) {
              box([h.p[0] + q[0] * (wdt + 0.02), topY2 + 0.03, h.p[2] + q[1] * (wdt + 0.02)], [q[0] ? 0.025 : wdt + 0.045, 0.03, q[1] ? 0.025 : wdt + 0.045], { col: C.warn, r: 0.012, gloss: 0.6, emi: we });
            });
          } else if (h.st === "off") {
            // off: a low dark stub with a faint lip
            box([h.p[0], 0.13 + hh, h.p[2]], [wdt, hh, wdt], { col: C.off, r: 0.05, gloss: 0.3, emi: e });
            box([h.p[0], topY2 + 0.006, h.p[2]], [wdt - 0.03, 0.006, wdt - 0.03], { col: C.ink, r: 0.004, emi: scl(C.paper, 0.12 + 0.3 * sel) });
          } else if (h.st === "deny") {
            // denies: a tall signal pylon with a notched, lit cap
            box([h.p[0], 0.13 + hh, h.p[2]], [wdt, hh, wdt], { col: col, r: 0.05, gloss: 0.5, emi: e });
            [1, -1].forEach(function (q) { box([h.p[0] + q * (wdt * 0.55), topY2 + 0.06, h.p[2]], [wdt * 0.38, 0.06, wdt + 0.02], { col: C.signal, r: 0.02, gloss: 0.6, emi: scl(C.signal, 0.9 + 0.6 * sel) }); });
          } else {
            box([h.p[0], 0.13 + hh, h.p[2]], [wdt, hh, wdt], { col: col, r: 0.05, gloss: 0.5, emi: e });
          }
        });
      });
    }

    // cost columns: one block per Node process
    var wc = Math.min(weights.cost || 0, pres.cost);
    if (wc > 0.35) costBuild = Math.min(1, costBuild + dt * 1.4);
    else if (wc < 0.05) costBuild = Math.max(0, costBuild - dt * 0.5);
    if (state.reduced) costBuild = wc > 0.2 ? 1 : 0;
    if (pres.cost > 0.01) {
      box([COST[0], 0.05, COST[2] + 0.4], [5.2, 0.05, 1.1], { col: C.ink, r: 0.04, gloss: 0.3 });
      costs.forEach(function (c, ci) {
        var cx = costX(ci);
        box([cx, 0.105, COST[2] + 0.4], [0.42, 0.012, 0.42], { col: C.ink2, r: 0.01, gloss: 0.5 });
        for (var k = 0; k < c.n; k++) {
          var order = (ci * 5 + k) / 48;
          var s = ease((costBuild - order) * 4);
          if (s <= 0.001) continue;
          var topc = k === c.n - 1;
          box([cx, 0.12 + 0.29 + k * 0.62, COST[2] + 0.4], [0.29 * s, 0.29 * s, 0.29 * s], { col: topc ? C.paper : C.paper2, r: 0.06, gloss: 0.45, emi: topc ? scl(C.paper, 0.18 * s) : null });
        }
      });
    }
  }

  /* ------------------------------------------------------------------ framebuffers */
  var vw = 1, vh = 1, bw = 1, bh = 1, dpr = 1;
  var msFbo, msColor, msDepth, rsTex, bA, bB;
  function tex(w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, FMT, w, h, 0, gl.RGBA, TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t: t, f: f, w: w, h: h };
  }
  function freeTex(x) { if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } }
  function resize() {
    vw = W.innerWidth; vh = W.innerHeight;
    dpr = Math.min(W.devicePixelRatio || 1, narrowMQ.matches ? 1.5 : 1.75);
    bw = Math.max(1, Math.round(vw * dpr)); bh = Math.max(1, Math.round(vh * dpr));
    canvas.width = bw; canvas.height = bh;
    if (msFbo) { gl.deleteFramebuffer(msFbo); gl.deleteRenderbuffer(msColor); gl.deleteRenderbuffer(msDepth); }
    msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    msColor = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, FMT, bw, bh);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    msDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.DEPTH_COMPONENT24, bw, bh);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    freeTex(rsTex); freeTex(bA); freeTex(bB);
    rsTex = tex(bw, bh);
    var qw = Math.max(1, bw >> 2), qh = Math.max(1, bh >> 2);
    bA = tex(qw, qh); bB = tex(qw, qh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fitAll();
    measure();
    dirty = true;
  }

  /* ------------------------------------------------------------------ scroll to camera */
  var centers = [], weights = {};
  function measure() {
    var sy = W.scrollY, narrow = narrowMQ.matches;
    centers = sections.map(function (s) {
      var r = s.getBoundingClientRect(), top = r.top + sy;
      var y;
      if (s.hasAttribute("data-cam-top")) y = top;
      else if (narrow) y = top;
      else y = top + r.height / 2 - vh / 2;
      return { name: s.getAttribute("data-cam"), y: y };
    });
  }
  function camTarget() {
    var sy = W.scrollY;
    var i = 0;
    while (i < centers.length - 1 && sy >= centers[i + 1].y) i++;
    var a = centers[i], b = centers[Math.min(i + 1, centers.length - 1)];
    var t = a === b ? 0 : ease((sy - a.y) / (b.y - a.y));
    if (sy < centers[0].y) t = 0;
    weights = {};
    weights[a.name] = (weights[a.name] || 0) + (1 - t);
    weights[b.name] = (weights[b.name] || 0) + t;
    var ka = keys[a.name] || keys.hero, kb = keys[b.name] || keys.hero;
    return {
      pos: lerp3(ka.pos, kb.pos, t), tgt: lerp3(ka.tgt, kb.tgt, t), fov: lerp(ka.fov, kb.fov, t),
      sx: lerp(ka.sx, kb.sx, t), sy: lerp(ka.sy, kb.sy, t),
      spot: [0, 1, 2, 3].map(function (j) { return lerp(ka.spot[j], kb.spot[j], t); }),
      dim: lerp(ka.dim, kb.dim, t),
    };
  }
  var cam = null;
  var pointer = [0, 0], pointerS = [0, 0];
  W.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer = [e.clientX / vw * 2 - 1, e.clientY / vh * 2 - 1];
  }, { passive: true });
  var dirty = true;
  W.addEventListener("scroll", function () { dirty = true; }, { passive: true });
  W.addEventListener("resize", resize);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { measure(); dirty = true; });
  W.addEventListener("load", function () { measure(); dirty = true; });
  d.addEventListener("toggle", function () { measure(); dirty = true; }, true);
  var onReduced = function () { state.reduced = reducedMQ.matches; dirty = true; };
  if (reducedMQ.addEventListener) reducedMQ.addEventListener("change", onReduced);

  /* ------------------------------------------------------------------ draw */
  function setCommon(pr, vp) {
    gl.useProgram(pr.p);
    gl.uniformMatrix4fv(pr.u.uVP, false, vp);
    if (pr.u.uCam) gl.uniform3fv(pr.u.uCam, eyeNow);
    if (pr.u.uFogCol) gl.uniform3fv(pr.u.uFogCol, C.bg);
    if (pr.u.uFog) gl.uniform2f(pr.u.uFog, 18.0, 0.09);
    if (pr.u.uFlash) gl.uniform4f(pr.u.uFlash, -0.2, 0.0, 2.6, Math.max(flash * 1.6, 0.18 * pres.gate) * power);
    if (pr.u.uFlashCol) gl.uniform3fv(pr.u.uFlashCol, mix3(scl(C.paper, 0.6), flashCol, clamp(flash * 3, 0, 1)));
  }
  function fsPass(pr, target, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr.p);
    gl.bindVertexArray(triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  var eyeNow = [0, 0, 0];
  var samples = [], frameNo = 0, last = performance.now();
  function frame(now) {
    W.requestAnimationFrame(frame);
    if (d.hidden) { last = now; return; }
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    var animating = !state.reduced;
    var busy = events.some(function (e) { return !e.done; }) || Math.abs(power - powerTarget) > 1e-3 || curtain > 0 || slabGlow > 0 || railPass > 0;
    if (!animating && !dirty && !busy && frameNo > 2) return;
    var t0 = performance.now();
    tNow += dt;
    dirty = false;

    var tg = camTarget();
    var wr = clamp((weights.native || 0) * 0.35 + (weights.installs || 0), 0, 1);
    var wcst = clamp(weights.cost || 0, 0, 1);
    liftS += ((weights.native || 0) - liftS) * (state.reduced ? 1 : Math.min(1, dt * 2.5));
    var pk = state.reduced ? 1 : Math.min(1, dt * 2.2);
    pres.ring += (wr - pres.ring) * pk; pres.cost += (wcst - pres.cost) * pk;
    var wg = 1 - clamp((weights.installs || 0) + (weights.cost || 0), 0, 1);
    pres.gate += (wg - pres.gate) * pk;
    var k = state.reduced || !cam ? 1 : 1 - Math.exp(-dt * 5);
    if (!cam) cam = { pos: tg.pos.slice(), tgt: tg.tgt.slice(), fov: tg.fov, sx: tg.sx, sy: tg.sy, spot: tg.spot.slice(), dim: tg.dim };
    cam.pos = lerp3(cam.pos, tg.pos, k); cam.tgt = lerp3(cam.tgt, tg.tgt, k); cam.fov = lerp(cam.fov, tg.fov, k);
    cam.sx = lerp(cam.sx, tg.sx, k); cam.sy = lerp(cam.sy, tg.sy, k);
    cam.spot = cam.spot.map(function (v, i) { return lerp(v, tg.spot[i], k); }); cam.dim = lerp(cam.dim, tg.dim, k);
    if (animating) {
      pointerS[0] += (pointer[0] - pointerS[0]) * Math.min(1, dt * 3);
      pointerS[1] += (pointer[1] - pointerS[1]) * Math.min(1, dt * 3);
    }
    power += (powerTarget - power) * (state.reduced ? 1 : Math.min(1, dt * 3));

    // calls belong to the hero: once it is off screen the gate goes back to idle
    if ((weights.hero || 0) < 0.15 && (weights.off || 0) < 0.15 && (weights.exhibits || 0) < 0.15 && events.length) { events.forEach(function (e) { e.done = true; }); events = []; curtain = 0; railHold = 0; flash = 0; }
    // idle autoplay in the hero, paused 9 s after the visitor picks a call
    if (animating && (weights.hero || 0) > 0.5 && tNow - lastUser > 9 && tNow > nextAuto && calls.length) {
      var tries = 0;
      while (tries++ < calls.length && calls[autoIdx % calls.length].el.getAttribute("data-auto") === "no") autoIdx++;
      fire(autoIdx % calls.length, false);
      autoIdx++;
      nextAuto = tNow + 4.4;
    }
    // in the turn-off section the same refused call repeats, so the switch shows what it changes
    if (animating && (weights.off || 0) > 0.6 && tNow > nextOff && calls.length) {
      fire(0, false);
      nextOff = tNow + 3.6;
    }
    // in the exhibits section the selected run repeats behind the card
    if (animating && (weights.exhibits || 0) > 0.6 && exTab && tNow > nextEx) { exhibitAct(exTab); nextEx = tNow + 4.6; }
    var pt2 = partTarget || ((weights.exhibits || 0) > 0.5 ? exLight : null);
    for (var pk2 in partHi) partHi[pk2] += ((pt2 === pk2 ? 1 : 0) - partHi[pk2]) * Math.min(1, state.reduced ? 1 : dt * 6);

    var narrow = narrowMQ.matches;
    var dist = Math.hypot(cam.pos[0] - cam.tgt[0], cam.pos[1] - cam.tgt[1], cam.pos[2] - cam.tgt[2]);
    var drift = animating && !narrow ? Math.sin(tNow * 0.21) * 0.015 : 0;
    var ox = (pointerS[0] * 0.05 + drift) * dist, oy = -pointerS[1] * 0.025 * dist;
    var dir = norm([cam.pos[0] - cam.tgt[0], cam.pos[1] - cam.tgt[1], cam.pos[2] - cam.tgt[2]]);
    var right = norm(cross([0, 1, 0], dir));
    eyeNow = [cam.pos[0] + right[0] * ox, cam.pos[1] + oy, cam.pos[2] + right[2] * ox];
    var proj = persp(cam.fov * Math.PI / 180, vw / vh, 0.1, 200, cam.sx, cam.sy);
    var vp = mul(proj, lookAt(eyeNow, cam.tgt, [0, 1, 0]));

    scene(tNow, dt);

    gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(C.bg[0], C.bg[1], C.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufO); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dataO.subarray(0, nO * STRIDE));
    gl.bindBuffer(gl.ARRAY_BUFFER, bufG); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dataG.subarray(0, nG * STRIDE));
    // the floor is polished: draw the world mirrored under it first, then the floor over it
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.cullFace(gl.BACK);
    setCommon(P.box, vp);
    gl.uniform3f(P.box.u.uCam, eyeNow[0], -eyeNow[1], eyeNow[2]);
    gl.uniform1f(P.box.u.uMirror, 1);
    gl.uniform1f(P.box.u.uGlass, 0);
    gl.bindVertexArray(vBoxO);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.I.length, gl.UNSIGNED_SHORT, 0, nO);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(P.box.u.uGlass, 1);
    gl.bindVertexArray(vBoxG);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.I.length, gl.UNSIGNED_SHORT, 0, nG);
    gl.frontFace(gl.CCW); gl.disable(gl.CULL_FACE); gl.depthMask(true);
    gl.uniform1f(P.box.u.uMirror, 0);
    setCommon(P.floor, vp);
    gl.uniform3fv(P.floor.u.uBase, C.floor);
    gl.uniform4fv(P.floor.u.uSpot, cam.spot);
    gl.uniform3fv(P.floor.u.uSpotCol, [1.0, 0.95, 0.9]);
    gl.bindVertexArray(floorVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    setCommon(P.shadow, vp);
    gl.bindVertexArray(vShO); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nO);
    gl.bindVertexArray(vShG); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, nG);
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    setCommon(P.box, vp);
    gl.uniform1f(P.box.u.uGlass, 0);
    gl.bindVertexArray(vBoxO);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.I.length, gl.UNSIGNED_SHORT, 0, nO);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(P.box.u.uGlass, 1);
    gl.bindVertexArray(vBoxG);
    gl.cullFace(gl.FRONT); gl.drawElementsInstanced(gl.TRIANGLES, mesh.I.length, gl.UNSIGNED_SHORT, 0, nG);
    gl.cullFace(gl.BACK); gl.drawElementsInstanced(gl.TRIANGLES, mesh.I.length, gl.UNSIGNED_SHORT, 0, nG);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rsTex.f);
    gl.blitFramebuffer(0, 0, bw, bh, 0, 0, bw, bh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(P.bright.p);
    gl.bindTexture(gl.TEXTURE_2D, rsTex.t);
    gl.uniform1i(P.bright.u.uTex, 0);
    gl.uniform2f(P.bright.u.uTexel, 1 / bw, 1 / bh);
    fsPass(P.bright, bA.f, bA.w, bA.h);
    for (var pass = 0; pass < 2; pass++) {
      var r = pass + 1;
      gl.useProgram(P.blur.p); gl.uniform1i(P.blur.u.uTex, 0);
      gl.bindTexture(gl.TEXTURE_2D, bA.t); gl.uniform2f(P.blur.u.uDir, r / bA.w, 0); fsPass(P.blur, bB.f, bB.w, bB.h);
      gl.bindTexture(gl.TEXTURE_2D, bB.t); gl.uniform2f(P.blur.u.uDir, 0, r / bA.h); fsPass(P.blur, bA.f, bA.w, bA.h);
    }
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rsTex.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bA.t);
    gl.uniform1i(P.comp.u.uTex, 0); gl.uniform1i(P.comp.u.uBloom, 1);
    gl.uniform1f(P.comp.u.uExposure, 1.15 * (1 - cam.dim));
    gl.uniform1f(P.comp.u.uBloomK, 0.9);
    gl.uniform1f(P.comp.u.uTime, tNow);
    gl.uniform2f(P.comp.u.uRes, bw, bh);
    fsPass(P.comp, null, bw, bh);
    gl.activeTexture(gl.TEXTURE0);

    placeHud(vp, narrow);

    frameNo++;
    var cost = performance.now() - t0;
    samples.push(cost); if (samples.length > 300) samples.shift();
    if (frameNo % 30 === 0) {
      var s = samples.slice().sort(function (a, b) { return a - b; });
      state.cpuMedian = +s[Math.floor(s.length / 2)].toFixed(2);
      state.cpuP95 = +s[Math.floor(s.length * 0.95)].toFixed(2);
      state.cpuSamples = s.length;
    }
    state.curtain = +curtain.toFixed(2);
    if (frameNo === 24) measureLuma();
    if (!state.ready && frameNo > 2) { state.ready = true; root.classList.add("gl-ready"); }
  }
  function measureLuma() {
    try {
      var w = Math.min(bw, 256), h = Math.min(bh, 256);
      var px = new Uint8Array(w * h * 4);
      gl.readPixels(Math.floor(bw * 0.55), Math.floor(bh * 0.3), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var sum = 0, sum2 = 0, n = w * h;
      for (var i = 0; i < px.length; i += 4) { var l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; sum += l; sum2 += l * l; }
      var m = sum / n;
      state.lumaStd = +Math.sqrt(Math.max(0, sum2 / n - m * m)).toFixed(2);
      state.lumaMean = +m.toFixed(2);
    } catch (e) { state.lumaStd = -1; }
  }
  // A label shows only when its section owns the screen, its anchor is in front of the camera, and it
  // lands inside the stage: clear of the header, the copy column (desktop) or the copy below (phone).
  function placeHud(vp, narrow) {
    var copyRight = 0;
    if (!narrow) { var cp = d.querySelector(".hero .copy"); copyRight = cp ? cp.getBoundingClientRect().right + 20 : 0; }
    var stageBottom = narrow ? vh * 0.56 : vh - 16;
    var rows = [];
    for (var i = 0; i < hudEls.length; i++) {
      var o = hudEls[i];
      var vis = (weights[o.set] || 0) > 0.6;
      var p = project(vp, o.anchor);
      if (p[2] <= 0) vis = false;
      if (o.o.desktopOnly && narrow) vis = false;
      if (o.o.until && tNow > plusUntil) vis = false;
      if (o.o.noPart) { for (var pk4 in partHi) if (partHi[pk4] > 0.3) vis = false; }
      if (o.o.part) {
        var pt = null, best = 0.3;
        for (var pk3 in partHi) if (partHi[pk3] > best) { best = partHi[pk3]; pt = pk3; }
        if (!pt) vis = false;
        else { o.anchor = PART_AT[pt](); if (o.part !== pt) { o.part = pt; o.el.innerHTML = PART_TEXT[pt]; } }
      }
      var leftEdge = o.set === "cost" ? 16 : Math.max(16, copyRight);
      if (p[0] < leftEdge || p[0] > vw - 16 || p[1] < 76 || p[1] > stageBottom) vis = false;
      if (o.vis !== vis) { o.vis = vis; o.el.classList.toggle("show", vis); o.el.tabIndex = vis ? 0 : -1; o.el.setAttribute("aria-hidden", vis ? "false" : "true"); }
      if (vis && o.o.row) rows.push([o, p]);
      else if (vis) o.el.style.transform = "translate3d(" + p[0].toFixed(1) + "px," + p[1].toFixed(1) + "px,0)";
    }
    // labels in a row share one baseline, the lowest of their anchors
    var rowY = 0;
    rows.forEach(function (r) { rowY = Math.max(rowY, r[1][1]); });
    rows.forEach(function (r) { r[0].el.style.transform = "translate3d(" + r[1][0].toFixed(1) + "px," + rowY.toFixed(1) + "px,0)"; });
    if (scrim) scrim.style.opacity = String(1 - clamp(((weights.cost || 0) - 0.2) * 1.6, 0, 1));
    if (card) {
      var show = (weights.hero || 0) > 0.5 && !narrow;
      card.classList.toggle("float", show);
      if (show) {
        var cp2 = project(vp, [LOG[0] - 0.4, 0, 1.3]);
        var cx = clamp(cp2[0] + 20, Math.max(16, copyRight), vw - 340 - 56), cy = clamp(cp2[1] + 70, 90, vh - 150);
        card.style.transform = "translate3d(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px,0)";
        // a hairline from the card to the foot of the gate it reports on
        if (leader) {
          var gp2 = project(vp, [0.15, 0.35, -1.0]);
          var lx = cx + 24, ly = cy, dx = gp2[0] - lx, dy = gp2[1] - ly;
          leader.style.width = Math.max(0, Math.hypot(dx, dy) - 8).toFixed(1) + "px";
          leader.style.transform = "translate3d(" + lx.toFixed(1) + "px," + ly.toFixed(1) + "px,0) rotate(" + Math.atan2(dy, dx).toFixed(4) + "rad)";
        }
      }
      if (leader) leader.classList.toggle("show", show && card.classList.contains("on"));
      if (false) {
      }
    }
  }

  resize();
  if (selectedHook) pickHook(selectedHook);
  if (calls.length && state.reduced) { select(0); showVerdict(calls[0]); }
  W.requestAnimationFrame(frame);
})();
