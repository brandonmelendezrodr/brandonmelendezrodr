/* ===========================================================================
   Neuroatlas — scene, interaction and the signal-propagation engine.

   The brain is generated at load (see brain3d.js), rendered with Three.js, and
   turned by a small orbit rig written here rather than pulled from a control
   library: it needs inertia, an idle auto-spin, and the ability to tell a
   click apart from a drag, which is what makes the model both turnable and
   clickable with the same mouse button.
   =========================================================================== */
(function () {
  'use strict';

  var T = THREE, B = BRAIN3D, D = window.BRAIN;
  var REGIONS = D.REGIONS, EXTERNAL = D.EXTERNAL, PATHWAYS = D.PATHWAYS;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse  = window.matchMedia('(pointer: coarse)').matches;
  var small   = window.matchMedia('(max-width: 760px)').matches;

  var NODES = {};
  REGIONS.forEach(function (r) { NODES[r.id] = r; });
  EXTERNAL.forEach(function (e) { NODES[e.id] = e; });

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var v3 = function (a) { return new T.Vector3(a[0], a[1], a[2]); };

  var stage  = $('#stage');
  var canvas = $('#view');
  var labelLayer = $('#labels');

  /* ─────────────────────────────────────────────────────────────────────
     1. Renderer, scene, lighting
     ───────────────────────────────────────────────────────────────────── */
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !small, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.97;
  } catch (err) {
    $('#loading').innerHTML = '<span>This model needs WebGL, which this browser has turned off.</span>';
    return;
  }

  var scene  = new T.Scene();
  var camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
  var brain  = new T.Group();
  scene.add(brain);

  /* A tiny procedural environment: cool sky over a warm floor. Enough to give
     the wet clearcoat on the cortex something to reflect. */
  function environmentMap() {
    var w = 32, h = 16, data = new Float32Array(w * h * 4);
    for (var y = 0; y < h; y++) {
      var t = y / (h - 1);
      var r = B.mix(0.42, 0.20, t), g = B.mix(0.52, 0.12, t), b = B.mix(0.72, 0.13, t);
      var warm = Math.pow(1 - Math.abs(t - 0.72) / 0.28, 4);
      if (warm > 0) { r += warm * 0.5; g += warm * 0.22; b += warm * 0.16; }
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 1;
      }
    }
    var tex = new T.DataTexture(data, w, h, T.RGBAFormat, T.FloatType);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
    return env;
  }

  var key  = new T.DirectionalLight(0xfff1e8, 1.55); key.position.set(2.6, 2.5, 2.2);
  var fill = new T.DirectionalLight(0x9ec4ff, 0.55); fill.position.set(-2.8, 0.3, -1.2);
  var rim  = new T.DirectionalLight(0xff9ab0, 0.72); rim.position.set(0.4, -1.3, -2.8);
  scene.add(key, fill, rim, new T.HemisphereLight(0xcfe3ff, 0x2a1418, 0.42));

  /* ─────────────────────────────────────────────────────────────────────
     2. Build the brain
     ───────────────────────────────────────────────────────────────────── */
  var PALETTE = {};
  REGIONS.forEach(function (r) { PALETTE[r.id] = r.color; });

  var TISSUE = new T.Color(0xc59087);
  function tissueTint(hex, amount) {
    return new T.Color(hex).lerp(TISSUE, amount === undefined ? 0.46 : amount);
  }

  var cortexDetail = small ? 5 : 6;
  var cortexGeo, cortexMesh, cortexMat, pickCortex, pickCerebellum;
  var pickTargets = [];       /* coarse meshes that carry ray tests */
  var meshesOf = {};          /* region id -> [mesh, ...] */
  var highlight = {};         /* region id -> 0..1, drives cortex repaint */
  var cortexDirty = true;

  function registerMesh(mesh, regionId) {
    mesh.userData.regionId = regionId;
    (meshesOf[regionId] = meshesOf[regionId] || []).push(mesh);
  }

  var solidMats = {};
  function solidMaterial(region) {
    if (solidMats[region.id]) return solidMats[region.id];
    return (solidMats[region.id] = new T.MeshPhysicalMaterial({
      color: tissueTint(region.color),
      roughness: 0.46, metalness: 0.0,
      clearcoat: 0.5, clearcoatRoughness: 0.42,
      emissive: new T.Color(region.color), emissiveIntensity: 0.0,
      envMapIntensity: 0.7
    }));
  }

  /* `solid` is occasionally a list (the pituitary is a gland plus its stalk). */
  function solidKind(r) {
    if (!r.solid) return null;
    return Array.isArray(r.solid) ? r.solid[0].kind : r.solid.kind;
  }

  function mirrored(geo) {
    var g = geo.clone();
    g.scale(-1, 1, 1);
    g.index.array.reverse();          /* keep winding after the flip */
    g.computeVertexNormals();
    return g;
  }

  function buildSolid(region, spec) {
    var geo;
    if (spec.kind === 'ellipsoid') {
      geo = B.buildEllipsoid(spec.r[0], spec.r[1], spec.r[2], spec.c[0], spec.c[1], spec.c[2], spec.wobble, 4);
    } else if (spec.kind === 'tube') {
      geo = B.buildTube(spec.pts, spec.rN, spec.rB, 56);
    } else if (spec.kind === 'callosum') {
      geo = B.buildCallosum();
    } else if (spec.kind === 'stem') {
      geo = B.buildStemPart(spec.part);
    } else if (spec.kind === 'cerebellum') {
      geo = B.buildCerebellum(small ? 4 : 5);
    } else { return; }

    var mat = solidMaterial(region);
    var mesh = new T.Mesh(geo, mat);
    mesh.renderOrder = 2;
    registerMesh(mesh, region.id);
    brain.add(mesh);

    if (spec.kind === 'cerebellum') {
      /* Folia make the cerebellum the densest mesh in the scene; it gets a
         coarse stand-in for ray tests, like the cortex does. */
      pickCerebellum = new T.Mesh(B.buildCerebellum(3), new T.MeshBasicMaterial({ visible: false }));
      pickCerebellum.userData.regionId = region.id;
      brain.add(pickCerebellum);
      pickTargets.push(pickCerebellum);
    } else {
      pickTargets.push(mesh);
    }

    if (spec.mirror) {
      var m2 = new T.Mesh(mirrored(geo), mat);
      m2.renderOrder = 2;
      registerMesh(m2, region.id);
      brain.add(m2);
      pickTargets.push(m2);
    }
  }

  function buildBrain() {
    cortexGeo = B.buildCortex(cortexDetail);
    cortexMat = new T.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.56, metalness: 0.0,
      clearcoat: 0.55, clearcoatRoughness: 0.5,
      envMapIntensity: 0.6, transparent: false, opacity: 1
    });
    cortexMesh = new T.Mesh(cortexGeo, cortexMat);
    cortexMesh.renderOrder = 4;
    brain.add(cortexMesh);

    /* A coarse copy of the same silhouette carries every ray test. Which lobe
       a hit belongs to is worked out from the point itself, so the proxy costs
       two hundredths of the triangles and loses no accuracy. */
    var proxy = B.buildCortex(4);
    pickCortex = new T.Mesh(proxy, new T.MeshBasicMaterial({ visible: false }));
    brain.add(pickCortex);

    REGIONS.forEach(function (r) {
      if (!r.solid || r.solid.kind === 'cortex') return;
      (Array.isArray(r.solid) ? r.solid : [r.solid]).forEach(function (spec) {
        buildSolid(r, spec);
      });
    });
  }

  function repaintCortex() {
    B.paintCortex(cortexGeo, {
      tint: showAreas ? 0.20 : 0.27,
      palette: PALETTE, showAreas: showAreas, highlight: highlight
    });
    cortexDirty = false;
  }

  function setHighlight(map) {
    var changed = false, k;
    for (k in map) if (highlight[k] !== map[k]) changed = true;
    for (k in highlight) if (map[k] === undefined) changed = true;
    if (!changed) return;
    highlight = map;
    cortexDirty = true;
    REGIONS.forEach(function (r) {
      var mat = solidMats[r.id];
      if (!mat) return;
      var v = highlight[r.id] || 0;
      mat.emissiveIntensity = v * 0.85;
      mat.color.copy(tissueTint(r.color, 0.46 - v * 0.34));
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
     3. Orbit rig
     ───────────────────────────────────────────────────────────────────── */
  var cam = {
    theta: Math.PI / 2 - 0.52, phi: 1.30, radius: 2.95,
    vTheta: 0, vPhi: 0, target: new T.Vector3(0, -0.18, 0),
    spin: !reduced, idle: 0, dragging: false
  };
  /* Viewing from +x is the left lateral view, and it puts anterior on the
     left of the screen — the orientation neuroanatomy figures are drawn in. */
  var VIEWS = {
    left:  { theta: Math.PI / 2,        phi: Math.PI / 2, radius: 2.80 },
    front: { theta: 0,                  phi: Math.PI / 2, radius: 2.80 },
    top:   { theta: Math.PI / 2,        phi: 0.14,        radius: 2.80 },
    mid:   { theta: Math.PI / 2 - 0.52, phi: 1.30,        radius: 3.25 }
  };
  var glide = null;

  function applyCamera() {
    var sp = Math.sin(cam.phi), r = cam.radius;
    camera.position.set(
      cam.target.x + r * sp * Math.sin(cam.theta),
      cam.target.y + r * Math.cos(cam.phi),
      cam.target.z + r * sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);
  }

  function goToView(name) {
    var v = VIEWS[name];
    if (!v) return;
    /* take the shorter way round */
    var dt = v.theta - cam.theta;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    glide = { t: 0, from: { theta: cam.theta, phi: cam.phi, radius: cam.radius },
              to: { theta: cam.theta + dt, phi: v.phi, radius: v.radius } };
    cam.idle = 0;
  }

  var ptr = { down: false, x: 0, y: 0, moved: 0, t0: 0, id: null, pinch: 0 };

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.moved = 0; ptr.t0 = performance.now(); ptr.id = e.pointerId;
    cam.dragging = true; cam.vTheta = cam.vPhi = 0; glide = null;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', function (e) {
    hover.x = e.clientX; hover.y = e.clientY; hover.live = true; hover.dirty = true;
    if (!ptr.down || e.pointerId !== ptr.id) return;
    var dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.moved += Math.abs(dx) + Math.abs(dy);
    ptr.x = e.clientX; ptr.y = e.clientY;
    cam.vTheta = -dx * 0.0062;
    cam.vPhi   = -dy * 0.0062;
    cam.theta += cam.vTheta;
    cam.phi = clamp(cam.phi + cam.vPhi, 0.09, Math.PI - 0.09);
    cam.idle = 0;
  });

  function endDrag(e) {
    if (!ptr.down) return;
    ptr.down = false; cam.dragging = false;
    canvas.style.cursor = '';
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    /* A short press that barely moved is a click on whatever is under it. */
    if (ptr.moved < 7 && performance.now() - ptr.t0 < 400) pickAt(e.clientX, e.clientY, true);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () { hover.live = false; setHover(null); });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.radius = clamp(cam.radius * Math.exp(e.deltaY * 0.0011), 1.55, 7.5);
    cam.idle = 0;
  }, { passive: false });

  /* Two-finger pinch to zoom. */
  var touches = {};
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      ptr.down = false; cam.dragging = false;
      ptr.pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && ptr.pinch) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
      cam.radius = clamp(cam.radius * (ptr.pinch / d), 1.55, 7.5);
      ptr.pinch = d; cam.idle = 0;
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener('touchend', function () { ptr.pinch = 0; });

  function stepCamera(dt) {
    if (glide) {
      glide.t = Math.min(1, glide.t + dt * 1.9);
      var e = glide.t < .5 ? 2 * glide.t * glide.t : 1 - Math.pow(-2 * glide.t + 2, 2) / 2;
      cam.theta  = B.mix(glide.from.theta,  glide.to.theta,  e);
      cam.phi    = B.mix(glide.from.phi,    glide.to.phi,    e);
      cam.radius = B.mix(glide.from.radius, glide.to.radius, e);
      if (glide.t >= 1) glide = null;
    } else if (!cam.dragging) {
      /* inertia, then a slow idle turn once the user has let go for a while */
      cam.theta += cam.vTheta; cam.phi = clamp(cam.phi + cam.vPhi, 0.09, Math.PI - 0.09);
      cam.vTheta *= 0.92; cam.vPhi *= 0.92;
      if (Math.abs(cam.vTheta) < 1e-5) cam.vTheta = 0;
      if (Math.abs(cam.vPhi) < 1e-5) cam.vPhi = 0;
      cam.idle += dt;
      if (cam.spin && cam.idle > 2.5 && !cam.vTheta) cam.theta += dt * 0.115;
    }
    applyCamera();
  }

  /* ─────────────────────────────────────────────────────────────────────
     4. Neuron field
     ───────────────────────────────────────────────────────────────────── */
  var neurons = [], npoints, nlines, sparks = [], neuronGain = 1;

  function sprite(size, inner) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(inner, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  var dotTex = sprite(64, 0.22);

  var POINT_VERT = [
    'attribute float aSize;',
    'varying vec3 vCol;',
    'void main(){',
    '  vCol = color;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * (260.0 / max(-mv.z, 0.001));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var POINT_FRAG = [
    'uniform sampler2D map;',
    'varying vec3 vCol;',
    'void main(){',
    '  vec4 t = texture2D(map, gl_PointCoord);',
    '  if (t.a < 0.01) discard;',
    '  gl_FragColor = vec4(vCol, 1.0) * t.a;',
    '}'
  ].join('\n');

  function seedNeurons() {
    var count = reduced ? 160 : (small ? 280 : 520);
    var p = { x: 0, y: 0, z: 0 };
    neurons = [];
    for (var i = 0; i < count; i++) {
      /* a random direction, shaped to the cortex, then drawn inward */
      var u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      B.shapeCerebrum(s * Math.cos(a), u, s * Math.sin(a), p);
      var t = 0.26 + 0.62 * Math.cbrt(Math.random());
      neurons.push({
        x: p.x * t, y: p.y * t, z: p.z * t,
        e: 0, next: Math.random() * 8, base: 0.30 + Math.random() * 0.42,
        violet: Math.random() < 0.26, links: []
      });
    }
    /* nearest-neighbour wiring */
    neurons.forEach(function (n, i) {
      var cand = [];
      for (var j = 0; j < neurons.length; j++) {
        if (i === j) continue;
        var m = neurons[j];
        var d = Math.hypot(n.x - m.x, n.y - m.y, n.z - m.z);
        if (d < 0.38) cand.push({ j: j, d: d });
      }
      cand.sort(function (a, b) { return a.d - b.d; });
      n.links = cand.slice(0, 3).map(function (c) { return c.j; });
    });

    var pos = new Float32Array(neurons.length * 3);
    var col = new Float32Array(neurons.length * 3);
    var siz = new Float32Array(neurons.length);
    neurons.forEach(function (n, i) {
      pos[i*3] = n.x; pos[i*3+1] = n.y; pos[i*3+2] = n.z;
      siz[i] = n.base;
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('aSize', new T.BufferAttribute(siz, 1));
    npoints = new T.Points(g, new T.ShaderMaterial({
      uniforms: { map: { value: dotTex } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending
    }));
    npoints.renderOrder = 6;
    npoints.frustumCulled = false;
    brain.add(npoints);

    /* dendritic web */
    var segs = [];
    neurons.forEach(function (n, i) {
      n.links.slice(0, 2).forEach(function (j) { segs.push(i, j); });
    });
    var lp = new Float32Array(segs.length * 3), lc = new Float32Array(segs.length * 3);
    for (var k = 0; k < segs.length; k++) {
      var nn = neurons[segs[k]];
      lp[k*3] = nn.x; lp[k*3+1] = nn.y; lp[k*3+2] = nn.z;
    }
    var lg = new T.BufferGeometry();
    lg.setAttribute('position', new T.BufferAttribute(lp, 3));
    lg.setAttribute('color', new T.BufferAttribute(lc, 3));
    nlines = new T.LineSegments(lg, new T.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: T.AdditiveBlending
    }));
    nlines.renderOrder = 5;
    nlines.frustumCulled = false;
    nlines.userData.segs = segs;
    brain.add(nlines);
  }

  function fireNeuron(i, depth) {
    var n = neurons[i];
    if (!n || n.e > 0.7) return;
    n.e = 1;
    if (depth > 2 || sparks.length > 220) return;
    var hops = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (var h = 0; h < hops && h < n.links.length; h++) {
      sparks.push({ a: i, b: n.links[(Math.random() * n.links.length) | 0],
                    t: 0, sp: 1.7 + Math.random() * 1.8, depth: (depth || 0) + 1 });
    }
  }

  var _p = new T.Vector3();
  function exciteNear(pt, radius, power) {
    for (var i = 0; i < neurons.length; i++) {
      var n = neurons[i];
      var d = Math.hypot(n.x - pt.x, n.y - pt.y, n.z - pt.z);
      if (d < radius) {
        var v = (power || 1) * (1 - d / radius);
        if (v > n.e) n.e = v;
        if (Math.random() < 0.22) fireNeuron(i, 1);
      }
    }
  }

  function stepNeurons(dt) {
    if (!npoints) return;
    var col = npoints.geometry.attributes.color.array;
    var siz = npoints.geometry.attributes.aSize.array;
    for (var i = 0; i < neurons.length; i++) {
      var n = neurons[i];
      if (!reduced) {
        n.next -= dt;
        if (n.next <= 0) { n.next = 3 + Math.random() * 9; fireNeuron(i, 0); }
        n.e = Math.max(0, n.e - dt * 1.45);
      }
      var g = (0.055 + n.e * 0.60) * neuronGain;
      if (n.violet) { col[i*3] = g * 0.72; col[i*3+1] = g * 0.54; col[i*3+2] = g; }
      else          { col[i*3] = g * 0.48; col[i*3+1] = g * 0.90; col[i*3+2] = g; }
      siz[i] = n.base * (1 + n.e * 1.7);
    }
    npoints.geometry.attributes.color.needsUpdate = true;
    npoints.geometry.attributes.aSize.needsUpdate = true;

    var segs = nlines.userData.segs, lc = nlines.geometry.attributes.color.array;
    for (var k = 0; k < segs.length; k++) {
      var e = (neurons[segs[k]].e * 0.28 + 0.012) * neuronGain;
      lc[k*3] = e * 0.42; lc[k*3+1] = e * 0.85; lc[k*3+2] = e;
    }
    nlines.geometry.attributes.color.needsUpdate = true;

    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s];
      sp.t += dt * sp.sp;
      if (sp.t >= 1) { fireNeuron(sp.b, sp.depth); sparks.splice(s, 1); }
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     5. Pathway pulses
     ───────────────────────────────────────────────────────────────────── */
  var glowTex = sprite(128, 0.14);
  var routeLine, progressLine, headSprite, trailPoints, relayGroup, pulseGroup;
  var play = null;
  var TRAIL = 72, ROUTE_SEGS = 420;
  var BASE_SPEED = 0.82;   /* brain-units per second at 1x */
  var DWELL = 0.55;
  var speedMul = 1;

  function initPulseObjects() {
    pulseGroup = new T.Group();
    pulseGroup.visible = false;
    brain.add(pulseGroup);

    var rg = new T.BufferGeometry();
    rg.setAttribute('position', new T.BufferAttribute(new Float32Array((ROUTE_SEGS + 1) * 3), 3));
    routeLine = new T.Line(rg, new T.LineBasicMaterial({
      color: 0x7cf3ff, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false
    }));
    routeLine.renderOrder = 8; routeLine.frustumCulled = false;

    var pg = new T.BufferGeometry();
    pg.setAttribute('position', new T.BufferAttribute(new Float32Array((ROUTE_SEGS + 1) * 3), 3));
    progressLine = new T.Line(pg, new T.LineBasicMaterial({
      color: 0xbdf6ff, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending
    }));
    progressLine.renderOrder = 9; progressLine.frustumCulled = false;

    var tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tg.setAttribute('color', new T.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tg.setAttribute('aSize', new T.BufferAttribute(new Float32Array(TRAIL), 1));
    trailPoints = new T.Points(tg, new T.ShaderMaterial({
      uniforms: { map: { value: dotTex } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending
    }));
    trailPoints.renderOrder = 10; trailPoints.frustumCulled = false;

    headSprite = new T.Sprite(new T.SpriteMaterial({
      map: glowTex, color: 0xdafbff, transparent: true, depthWrite: false,
      depthTest: false, blending: T.AdditiveBlending
    }));
    headSprite.scale.setScalar(0.42);
    headSprite.renderOrder = 11;

    relayGroup = new T.Group();
    relayGroup.renderOrder = 8;

    pulseGroup.add(routeLine, progressLine, trailPoints, headSprite, relayGroup);
  }

  function startPathway(pw) {
    var pts = pw.steps.map(function (s) { return v3(NODES[s.to].node); });
    var curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.38);
    var lengths = curve.getLengths(ROUTE_SEGS);
    var total = lengths[lengths.length - 1];
    var samples = curve.getSpacedPoints(ROUTE_SEGS);

    /* A Catmull-Rom curve passes exactly through control point i at parameter
       i/(n-1), and getLengths samples cumulative arc length at evenly spaced
       parameters — so each relay's distance can be read straight off that
       table. Matching relays to their nearest sample instead would collapse
       the two visits in pathways that return to a structure (memory goes back
       to the hippocampus, riding a bike back to the motor cortex). */
    var marks = pts.map(function (_, i) {
      return lengths[Math.round((i / (pts.length - 1)) * ROUTE_SEGS)];
    });
    marks[0] = 0;
    marks[marks.length - 1] = total;

    var rp = routeLine.geometry.attributes.position.array;
    var pp = progressLine.geometry.attributes.position.array;
    for (var i = 0; i <= ROUTE_SEGS; i++) {
      rp[i*3] = samples[i].x; rp[i*3+1] = samples[i].y; rp[i*3+2] = samples[i].z;
      pp[i*3] = samples[i].x; pp[i*3+1] = samples[i].y; pp[i*3+2] = samples[i].z;
    }
    routeLine.geometry.attributes.position.needsUpdate = true;
    progressLine.geometry.attributes.position.needsUpdate = true;
    progressLine.geometry.setDrawRange(0, 1);

    relayGroup.children.forEach(function (c) { c.material.dispose(); });
    relayGroup.clear();
    pts.forEach(function (p) {
      var s = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: 0x2e6b7a, transparent: true, opacity: 0.85,
        depthWrite: false, depthTest: false, blending: T.AdditiveBlending
      }));
      s.position.copy(p); s.scale.setScalar(0.12);
      relayGroup.add(s);
    });

    play = {
      pw: pw, curve: curve, samples: samples, total: total, marks: marks,
      d: 0, idx: 0, dwell: DWELL, trail: [], done: false
    };
    pulseGroup.visible = true;
    onArrive(0);
  }

  function stopPulse() {
    play = null;
    if (pulseGroup) pulseGroup.visible = false;
  }

  function stepPulse(dt) {
    if (!play) return;
    if (!play.done) {
      if (play.dwell > 0) play.dwell -= dt;
      else {
        play.d += BASE_SPEED * speedMul * dt;
        var next = play.marks[play.idx + 1];
        if (next !== undefined && play.d >= next) {
          play.d = next; play.idx++;
          onArrive(play.idx);
          play.dwell = DWELL;
          if (play.idx >= play.pw.steps.length - 1) { play.done = true; finishPathway(); }
        }
      }
    }

    var u = clamp(play.d / play.total, 0, 1);
    var head = play.curve.getPointAt(u);
    headSprite.position.copy(head);
    headSprite.scale.setScalar(0.34 + Math.sin(performance.now() / 110) * 0.05);
    progressLine.geometry.setDrawRange(0, Math.max(2, Math.round(u * ROUTE_SEGS) + 1));

    relayGroup.children.forEach(function (s, i) {
      var reached = i <= play.idx;
      s.material.color.setHex(reached ? 0x7cf3ff : 0x244a57);
      s.scale.setScalar(reached ? 0.17 : 0.10);
    });

    play.trail.unshift([head.x, head.y, head.z]);
    if (play.trail.length > TRAIL) play.trail.pop();
    var tp = trailPoints.geometry.attributes.position.array;
    var tc = trailPoints.geometry.attributes.color.array;
    var ts = trailPoints.geometry.attributes.aSize.array;
    for (var i = 0; i < TRAIL; i++) {
      var q = play.trail[i] || play.trail[play.trail.length - 1] || [0,0,0];
      var f = 1 - i / TRAIL;
      tp[i*3] = q[0]; tp[i*3+1] = q[1]; tp[i*3+2] = q[2];
      tc[i*3] = f * 0.78; tc[i*3+1] = f * 0.98; tc[i*3+2] = f;
      ts[i] = 0.30 * f * f;
    }
    trailPoints.geometry.attributes.position.needsUpdate = true;
    trailPoints.geometry.attributes.color.needsUpdate = true;
    trailPoints.geometry.attributes.aSize.needsUpdate = true;

    if (!play.done) exciteNear(head, 0.30, 0.6);
  }

  /* Idle traffic between neighbouring structures when nothing is running. */
  var IDLE_LINKS = [
    ['thalamus','frontal'], ['hippocampus','temporal'], ['occipital','parietal'],
    ['cerebellum','pons'], ['amygdala','hypothalamus'], ['thalamus','occipital'],
    ['basalganglia','motor'], ['medulla','spinal'], ['corpuscallosum','parietal'],
    ['frontal','temporal'], ['thalamus','cerebellum'], ['wernicke','broca']
  ];
  var idle = { t: 2, curve: null, u: 0, len: 1 };
  function stepIdle(dt) {
    if (play || reduced) { idle.curve = null; return; }
    if (idle.curve) {
      idle.u += dt * 0.55 * speedMul;
      if (idle.u >= 1) { idle.curve = null; return; }
      idle.curve.getPointAt(clamp(idle.u, 0, 1), _p);
      exciteNear(_p, 0.26, 0.5);
      return;
    }
    idle.t -= dt;
    if (idle.t > 0) return;
    idle.t = 1.4 + Math.random() * 2.4;
    var l = IDLE_LINKS[(Math.random() * IDLE_LINKS.length) | 0];
    idle.curve = new T.CatmullRomCurve3([v3(NODES[l[0]].node), v3(NODES[l[1]].node)]);
    idle.u = 0;
  }

  /* ─────────────────────────────────────────────────────────────────────
     6. Body nodes and labels
     ───────────────────────────────────────────────────────────────────── */
  var extMeshes = {};
  function buildExternals() {
    EXTERNAL.forEach(function (e) {
      var g = new T.Group();
      g.position.copy(v3(e.node));
      var core = new T.Mesh(
        new T.IcosahedronGeometry(0.055, 1),
        new T.MeshBasicMaterial({ color: 0x7cf3ff, wireframe: true, transparent: true, opacity: 0.55 })
      );
      var halo = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: 0x7cf3ff, transparent: true, opacity: 0.30,
        depthWrite: false, blending: T.AdditiveBlending
      }));
      halo.scale.setScalar(0.26);
      g.add(core, halo);
      brain.add(g);
      extMeshes[e.id] = { group: g, core: core, halo: halo };
    });
  }

  var labelEls = {};
  function buildLabels() {
    REGIONS.concat(EXTERNAL).forEach(function (r) {
      var el = document.createElement('div');
      el.className = 'lab' + (r.group === 'functional' ? ' lab-area' : '') +
                     (r.solid ? '' : ' lab-ext');
      el.textContent = r.name.replace(' (V1)', '').replace(' Oblongata', '');
      el.dataset.id = r.id;
      labelLayer.appendChild(el);
      labelEls[r.id] = el;
      r.labelEl = el;
      r.occluded = false;
    });
    /* one layout pass for every label, rather than one per frame */
    REGIONS.concat(EXTERNAL).forEach(function (r) {
      r.labelW = labelEls[r.id].offsetWidth || 70;
    });
  }

  var _v = new T.Vector3(), _c = new T.Vector3(), _d = new T.Vector3();

  /* A label for something buried behind cortex would read as though it were on
     the surface, so anything that is not itself cortex gets a visibility test
     against the cortical shell. Eight times a second is plenty. */
  var occTimer = 0;
  function updateOcclusion() {
    var all = REGIONS.concat(EXTERNAL);
    if (xray || !pickCortex) {
      all.forEach(function (r) { r.occluded = false; });
      return;
    }
    all.forEach(function (r) {
      if (solidKind(r) === 'cortex') { r.occluded = false; return; }
      _v.copy(v3(r.node));
      brain.localToWorld(_v);
      _d.copy(_v).sub(camera.position);
      var dist = _d.length();
      ray.set(camera.position, _d.normalize());
      var hit = ray.intersectObject(pickCortex, false);
      r.occluded = hit.length > 0 && hit[0].distance < dist - 0.03;
    });
  }

  /* Labels are placed strongest-first and a weaker one is dropped rather than
     allowed to overlap, which is what keeps the deep structures legible when
     the cutaway reveals a dozen of them at once. */
  var placed = [];
  function updateLabels() {
    if (!showLabels) return;
    var rect = renderer.domElement.getBoundingClientRect();
    var camDir = camera.position.clone().sub(cam.target).normalize();
    var candidates = [];

    REGIONS.concat(EXTERNAL).forEach(function (r) {
      var el = labelEls[r.id];
      var kind = solidKind(r);
      var strong = selected === r.id || !!highlight[r.id];
      var show;

      if (r.group === 'functional')  show = showAreas;
      else if (!r.solid)             show = (!small || strong) && !r.occluded;
      else if (kind === 'cortex')    show = true;
      else                           show = !r.occluded;
      if (strong) show = true;
      if (!show) { el.classList.remove('on'); return; }

      _v.copy(v3(r.node));
      brain.localToWorld(_v);
      if (kind === 'cortex' && !strong) {
        _c.copy(v3(r.node)).normalize();
        if (_c.dot(camDir) < 0.08) { el.classList.remove('on'); return; }
      }
      _v.project(camera);
      if (_v.z > 1) { el.classList.remove('on'); return; }

      var lx = (_v.x * 0.5 + 0.5) * rect.width;
      var ly = (-_v.y * 0.5 + 0.5) * rect.height;
      var lw = r.labelW;
      if (lx < -lw || lx > rect.width + lw || ly < -40 || ly > rect.height + 40) {
        el.classList.remove('on'); return;
      }
      candidates.push({
        el: el, strong: strong,
        x: clamp(lx, lw / 2 + 6, rect.width - lw / 2 - 6),
        y: clamp(ly, 14, rect.height - 14),
        w: lw, h: 18,
        prio: strong ? 3 : kind === 'cortex' ? 2 : r.solid ? 1 : 0
      });
    });

    candidates.sort(function (a, b) { return b.prio - a.prio; });
    placed.length = 0;
    candidates.forEach(function (c) {
      var x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, y0 = c.y - c.h / 2, y1 = c.y + c.h / 2;
      for (var i = 0; i < placed.length; i++) {
        var q = placed[i];
        if (x0 < q.x1 + 3 && x1 > q.x0 - 3 && y0 < q.y1 + 2 && y1 > q.y0 - 2) {
          c.el.classList.remove('on');
          return;
        }
      }
      placed.push({ x0: x0, x1: x1, y0: y0, y1: y1 });
      c.el.style.transform = 'translate(-50%,-50%) translate(' +
        Math.round(c.x) + 'px,' + Math.round(c.y) + 'px)';
      c.el.classList.add('on');
      c.el.classList.toggle('hot', c.strong);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
     7. Picking
     ───────────────────────────────────────────────────────────────────── */
  var ray = new T.Raycaster();
  var ndc = new T.Vector2();
  var hover = { x: 0, y: 0, live: false, dirty: false, id: null };
  var tooltip = $('#tooltip');

  function regionAtPoint(worldPoint) {
    var p = brain.worldToLocal(worldPoint.clone());
    var area = showAreas ? B.AREAS[B.areaOf(p.x, p.y, p.z)] : '';
    return area || B.LOBES[B.lobeOf(p.x, p.y, p.z)];
  }

  function pickAt(clientX, clientY, commit) {
    var rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);

    var deep = ray.intersectObjects(pickTargets, false);
    var skin = ray.intersectObject(pickCortex, false);
    var id = null;

    if (xray) {
      /* Looking through the cortex, so whatever is inside it wins. */
      if (deep.length) id = deep[0].object.userData.regionId;
      else if (skin.length) id = regionAtPoint(skin[0].point);
    } else {
      var dDeep = deep.length ? deep[0].distance : Infinity;
      var dSkin = skin.length ? skin[0].distance : Infinity;
      if (dDeep < dSkin) id = deep[0].object.userData.regionId;
      else if (skin.length) id = regionAtPoint(skin[0].point);
    }
    if (commit) { if (id) handlePick(id); }
    else setHover(id);
    return id;
  }

  function setHover(id) {
    if (hover.id === id) return;
    hover.id = id;
    canvas.style.cursor = id ? (ptr.down ? 'grabbing' : 'pointer') : (ptr.down ? 'grabbing' : 'grab');
    var r = id && NODES[id];
    if (r && !coarse) {
      tooltip.hidden = false;
      tooltip.textContent = r.name;
      var rect = stage.getBoundingClientRect();
      tooltip.style.left = (hover.x - rect.left) + 'px';
      tooltip.style.top  = (hover.y - rect.top) + 'px';
    } else {
      tooltip.hidden = true;
    }
    refreshHighlight();
  }

  /* ─────────────────────────────────────────────────────────────────────
     8. Selection, detail panel, region list
     ───────────────────────────────────────────────────────────────────── */
  var detail = $('#detail'), listEl = $('#region-list');
  var selected = null, pinned = false, activeStep = null, activeUntil = 0;

  function regionById(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }

  function refreshHighlight() {
    var map = {};
    if (selected) map[selected] = 1;
    if (hover.id && regionById(hover.id)) map[hover.id] = Math.max(map[hover.id] || 0, 0.55);
    if (activeStep && performance.now() < activeUntil) map[activeStep] = 1;
    if (quiz.reveal) map[quiz.reveal] = 1;
    setHighlight(map);
  }

  function emptyDetail() {
    detail.innerHTML =
      '<div class="d-empty">' +
        '<h3>Turn it, then pick a structure</h3>' +
        '<p>Drag the brain to rotate it through 360° and scroll to zoom. Click any structure — or any name in the list above — to read what it does, what goes wrong when it is damaged, and one thing worth remembering.</p>' +
        '<p>Switch on <strong>Cutaway</strong> to see through the cortex to the thalamus, hippocampus and the rest of the deep structures sitting inside it.</p>' +
        '<p>Then run an action from the left panel and watch a signal take the route it really takes. Press <kbd>Esc</kbd> to stop a run.</p>' +
        '<p class="muted small">24 structures · 9 pathways · the cortex is generated fold by fold at load, not textured.</p>' +
      '</div>';
  }

  function relatedPathways(id) {
    return PATHWAYS.filter(function (p) {
      return p.steps.some(function (s) { return s.to === id; });
    });
  }

  function renderDetail(r) {
    var groupName = (D.GROUPS.filter(function (g) { return g.id === r.group; })[0] || {}).name || '';
    var html =
      '<div class="d-kicker"><span class="swatch" style="background:' + r.color + ';color:' + r.color + '"></span>' + groupName + '</div>' +
      '<h3>' + r.name + '</h3>' +
      '<p class="d-summary">' + r.summary + '</p>' +
      '<div class="d-sect"><h4>What it does</h4><ul>' +
        r.does.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul></div>';
    if (r.damage) html += '<div class="d-sect callout damage"><h4>When it is damaged</h4>' + r.damage + '</div>';
    if (r.fact)   html += '<div class="d-sect callout fact"><h4>Worth remembering</h4>' + r.fact + '</div>';
    var rel = relatedPathways(r.id);
    if (rel.length) {
      html += '<div class="d-sect"><h4>Appears in</h4><div class="d-actions">' +
        rel.map(function (p) { return '<button class="d-tag" data-run="' + p.id + '">' + p.icon + ' ' + p.name + '</button>'; }).join('') +
        '</div></div>';
    }
    detail.innerHTML = html;
  }

  function select(id, opts) {
    opts = opts || {};
    var r = regionById(id);
    selected = r ? r.id : null;
    listEl.querySelectorAll('.rl-item').forEach(function (b) {
      b.classList.toggle('selected', !!r && b.dataset.id === r.id);
    });
    if (!r) { emptyDetail(); refreshHighlight(); return; }
    renderDetail(r);
    if (opts.scroll !== false) {
      var it = listEl.querySelector('.rl-item[data-id="' + r.id + '"]');
      if (it) it.scrollIntoView({ block: 'nearest' });
    }
    /* A deep structure is no use hidden inside an opaque cortex. */
    if (opts.reveal !== false && r.group === 'limbic' && !xray) setXray(true);
    if (opts.flash !== false) { exciteNear(v3(r.node), 0.34, 1); }
    refreshHighlight();
  }

  function buildList(filter) {
    var q = (filter || '').trim().toLowerCase();
    var html = '', any = false;
    D.GROUPS.forEach(function (g) {
      var items = REGIONS.filter(function (r) {
        if (r.group !== g.id) return false;
        if (!q) return true;
        return (r.name + ' ' + r.summary + ' ' + r.does.join(' ')).toLowerCase().indexOf(q) > -1;
      });
      if (!items.length) return;
      any = true;
      html += '<div class="rl-group">' + g.name + '</div>';
      items.forEach(function (r) {
        html += '<button class="rl-item" data-id="' + r.id + '" type="button">' +
          '<span class="swatch" style="background:' + r.color + ';color:' + r.color + '"></span>' + r.name + '</button>';
      });
    });
    listEl.innerHTML = any ? html : '<div class="rl-empty">No structure matches that.</div>';
    if (selected) {
      var it = listEl.querySelector('.rl-item[data-id="' + selected + '"]');
      if (it) it.classList.add('selected');
    }
  }

  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('.rl-item');
    if (!b) return;
    pinned = !!play;
    select(b.dataset.id);
  });
  $('#search').addEventListener('input', function (e) { buildList(e.target.value); });
  detail.addEventListener('click', function (e) {
    var b = e.target.closest('[data-run]');
    if (!b) return;
    var pw = PATHWAYS.filter(function (p) { return p.id === b.dataset.run; })[0];
    if (pw) runPathway(pw);
  });

  function handlePick(id) {
    if (quiz.on) { quizAnswer(id); return; }
    pinned = !!play;
    select(id, { reveal: false });
  }

  /* ─────────────────────────────────────────────────────────────────────
     9. Pathway playback UI
     ───────────────────────────────────────────────────────────────────── */
  var grid = $('#action-grid'), playback = $('#playback');
  var stepsEl = $('#steps'), pbTitle = $('#pb-title'), current = null;

  PATHWAYS.forEach(function (p) {
    var b = document.createElement('button');
    b.className = 'action'; b.type = 'button'; b.dataset.id = p.id; b.setAttribute('role', 'listitem');
    b.innerHTML = '<span class="action-icon">' + p.icon + '</span>' +
      '<span class="action-txt"><strong>' + p.name + '</strong><span>' + p.tagline + '</span></span>';
    grid.appendChild(b);
  });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('.action');
    if (!b) return;
    var pw = PATHWAYS.filter(function (p) { return p.id === b.dataset.id; })[0];
    if (pw) runPathway(pw);
  });

  function runPathway(pw) {
    if (quiz.on) exitQuiz();
    current = pw; pinned = false;
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.toggle('is-active', b.dataset.id === pw.id); });
    playback.hidden = false;
    pbTitle.classList.remove('done');
    pbTitle.textContent = pw.name;
    stepsEl.innerHTML = pw.steps.map(function (s) {
      return '<li><b>' + NODES[s.to].name + '</b>' + s.text + '</li>';
    }).join('');
    if (!xray && pw.steps.some(function (s) { return NODES[s.to].group === 'limbic'; })) setXray(true);
    startPathway(pw);
  }

  function onArrive(i) {
    if (!play) return;
    var step = play.pw.steps[i], node = NODES[step.to];
    activeStep = step.to; activeUntil = performance.now() + 1700;
    exciteNear(v3(node.node), 0.42, 1);
    if (extMeshes[step.to]) {
      extMeshes[step.to].halo.material.opacity = 0.95;
      extMeshes[step.to].core.material.opacity = 1;
    }
    refreshHighlight();

    var lis = stepsEl.querySelectorAll('li');
    lis.forEach(function (li, k) {
      li.classList.toggle('current', k === i);
      li.classList.toggle('done', k < i);
    });
    if (lis[i]) lis[i].scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    if (node.does && !pinned) select(node.id, { flash: false, scroll: false, reveal: false });
  }

  function finishPathway() {
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.remove('is-active'); });
    pbTitle.textContent = play.pw.name + ' · complete';
    pbTitle.classList.add('done');
  }

  function stopPathway() {
    stopPulse();
    activeStep = null;
    pbTitle.classList.remove('done');
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.remove('is-active'); });
    stepsEl.querySelectorAll('li').forEach(function (li) { li.classList.remove('current'); });
    refreshHighlight();
  }

  $('#pb-stop').addEventListener('click', stopPathway);
  $('#pb-replay').addEventListener('click', function () { if (current) runPathway(current); });
  $('#speed').addEventListener('input', function (e) { speedMul = +e.target.value / 100; });

  /* ─────────────────────────────────────────────────────────────────────
     10. Quiz
     ───────────────────────────────────────────────────────────────────── */
  var quiz = { on: false, pool: [], answer: null, right: 0, asked: 0, saved: null, lock: false, reveal: null };
  var quizbar = $('#quizbar'), quizPrompt = $('#quiz-prompt'), quizScore = $('#quiz-score'), btnQuiz = $('#btn-quiz');

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function startQuiz() {
    stopPathway();
    quiz.on = true; quiz.right = 0; quiz.asked = 0; quiz.lock = false; quiz.reveal = null;
    quiz.pool = shuffle(REGIONS.filter(function (r) { return !!r.quiz; }));
    quiz.saved = { labels: optLabels.checked, areas: optAreas.checked, xray: xray };
    optLabels.checked = false; optAreas.checked = true;
    applyLabels(); applyAreas(); setXray(true);
    quizbar.hidden = false;
    btnQuiz.setAttribute('aria-pressed', 'true');
    btnQuiz.textContent = 'End quiz';
    select(null);
    askQuiz();
  }

  function exitQuiz() {
    if (!quiz.on) return;
    quiz.on = false; quiz.reveal = null;
    quizbar.hidden = true;
    quizbar.classList.remove('right', 'wrong');
    btnQuiz.setAttribute('aria-pressed', 'false');
    btnQuiz.textContent = 'Quiz me';
    if (quiz.saved) {
      optLabels.checked = quiz.saved.labels; optAreas.checked = quiz.saved.areas;
      applyLabels(); applyAreas(); setXray(quiz.saved.xray);
    }
    refreshHighlight();
    if (quiz.asked) {
      var pct = quiz.right / Math.max(quiz.asked, 1);
      detail.innerHTML = '<div class="d-empty"><h3>' + quiz.right + ' / ' + quiz.asked + '</h3><p>' +
        (pct >= .8 ? 'Strong. You could teach this section.'
         : pct >= .5 ? 'Solid base — the deep structures are usually what slips.'
         : 'Worth another pass through the atlas before the next round.') +
        '</p><p class="muted small">Press <kbd>Quiz me</kbd> to run it again, or click a structure to go back to reading.</p></div>';
    }
  }

  function askQuiz() {
    quizbar.classList.remove('right', 'wrong');
    quiz.reveal = null;
    if (!quiz.pool.length) { exitQuiz(); return; }
    quiz.answer = quiz.pool.pop();
    quizPrompt.textContent = quiz.answer.quiz;
    quizScore.textContent = quiz.right + ' / ' + quiz.asked;
    quiz.lock = false;
    refreshHighlight();
  }

  function quizAnswer(id) {
    if (quiz.lock) return;
    quiz.lock = true; quiz.asked++;
    var correct = id === quiz.answer.id;
    if (correct) quiz.right++;
    quiz.reveal = quiz.answer.id;
    quizbar.classList.add(correct ? 'right' : 'wrong');
    quizPrompt.textContent = (correct ? '✓ ' : '✗ ') + quiz.answer.name +
      (correct ? '' : ' — that is the one lit up.');
    quizScore.textContent = quiz.right + ' / ' + quiz.asked;
    exciteNear(v3(quiz.answer.node), 0.40, 1);
    refreshHighlight();
    setTimeout(askQuiz, correct ? 950 : 2100);
  }

  btnQuiz.addEventListener('click', function () { quiz.on ? exitQuiz() : startQuiz(); });
  $('#quiz-skip').addEventListener('click', function () { if (!quiz.lock) quiz.asked++; askQuiz(); });
  $('#quiz-exit').addEventListener('click', exitQuiz);

  /* ─────────────────────────────────────────────────────────────────────
     11. Tour, legend, toggles, modal
     ───────────────────────────────────────────────────────────────────── */
  var tour = { on: false, i: 0 }, btnTour = $('#btn-tour');
  function tourStep() {
    if (tour.i >= D.TOUR.length) { endTour(); return; }
    var id = D.TOUR[tour.i];
    select(id);
    /* swing the camera round to whichever side the structure faces */
    var r = regionById(id);
    if (r) {
      var n = v3(r.node);
      var isCortex = r.solid && r.solid.kind === 'cortex';
      glide = { t: 0, from: { theta: cam.theta, phi: cam.phi, radius: cam.radius },
                to: { theta: Math.atan2(n.x, n.z) + (isCortex ? 0 : -0.5),
                      phi: clamp(Math.PI / 2 - n.y * 0.7, 0.35, Math.PI - 0.35),
                      radius: isCortex ? 3.0 : 2.5 } };
      var dt = glide.to.theta - cam.theta;
      while (dt > Math.PI) dt -= Math.PI * 2;
      while (dt < -Math.PI) dt += Math.PI * 2;
      glide.to.theta = cam.theta + dt;
      cam.idle = 0;
    }
    tour.i++;
    btnTour.textContent = tour.i >= D.TOUR.length ? 'Finish tour' : 'Next · ' + (tour.i + 1) + '/' + D.TOUR.length;
  }
  function endTour() { tour.on = false; tour.i = 0; btnTour.textContent = 'Guided tour'; }
  btnTour.addEventListener('click', function () {
    if (quiz.on) exitQuiz();
    if (!tour.on) { tour.on = true; tour.i = 0; }
    tourStep();
  });

  var LEGEND = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'pons', 'thalamus', 'hippocampus'];
  var legend = $('#legend');
  legend.innerHTML = LEGEND.map(function (id) {
    var r = regionById(id);
    return '<button class="lg-chip" data-id="' + id + '" type="button">' +
      '<span class="swatch" style="background:' + r.color + ';color:' + r.color + '"></span>' + r.name + '</button>';
  }).join('') +
  '<span class="lg-note">Drag to turn the brain, scroll to zoom. Cortical folds are generated geometry, ' +
  'so the model holds up from any angle — including from underneath.</span>';
  legend.addEventListener('click', function (e) {
    var b = e.target.closest('.lg-chip');
    if (b) { pinned = !!play; select(b.dataset.id); }
  });

  var optLabels = $('#opt-labels'), optAreas = $('#opt-areas'), optNeurons = $('#opt-neurons');
  var showLabels = true, showAreas = false, showNeurons = true, xray = false;

  function applyLabels() {
    showLabels = optLabels.checked;
    labelLayer.classList.toggle('off', !showLabels);
    if (!showLabels) labelLayer.querySelectorAll('.lab').forEach(function (el) { el.classList.remove('on'); });
  }
  function applyAreas()  { showAreas = optAreas.checked; cortexDirty = true; }
  optLabels.addEventListener('change', applyLabels);
  optAreas.addEventListener('change', applyAreas);
  optNeurons.addEventListener('change', function () {
    showNeurons = optNeurons.checked;
    if (npoints) { npoints.visible = showNeurons; nlines.visible = showNeurons; }
  });

  var btnXray = $('#btn-xray');
  function setXray(on) {
    xray = !!on;
    btnXray.setAttribute('aria-pressed', xray ? 'true' : 'false');
    neuronGain = xray ? 0.45 : 1;
    if (!cortexMat) return;
    cortexMat.transparent = xray;
    cortexMat.opacity = xray ? 0.11 : 1;
    cortexMat.depthWrite = !xray;
    cortexMat.needsUpdate = true;
    var cb = meshesOf.cerebellum;
    if (cb) cb.forEach(function (m) {
      m.material.transparent = xray; m.material.opacity = xray ? 0.34 : 1;
      m.material.depthWrite = !xray; m.material.needsUpdate = true;
    });
  }
  btnXray.addEventListener('click', function () { setXray(!xray); });

  var btnSpin = $('#btn-spin');
  btnSpin.setAttribute('aria-pressed', cam.spin ? 'true' : 'false');
  btnSpin.addEventListener('click', function () {
    cam.spin = !cam.spin;
    btnSpin.setAttribute('aria-pressed', cam.spin ? 'true' : 'false');
    cam.idle = 0;
  });
  $('#viewctl').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) goToView(b.dataset.view);
  });

  var modal = $('#help-modal');
  $('#btn-help').addEventListener('click', function () { modal.hidden = false; });
  $('#help-close').addEventListener('click', function () { modal.hidden = true; });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!modal.hidden) { modal.hidden = true; return; }
      if (quiz.on) { exitQuiz(); return; }
      if (tour.on) { endTour(); return; }
      if (play) stopPathway();
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    /* arrow keys turn the model, so it is reachable without a mouse */
    var step = 0.16;
    if (e.key === 'ArrowLeft')  { cam.theta -= step; cam.idle = 0; e.preventDefault(); }
    if (e.key === 'ArrowRight') { cam.theta += step; cam.idle = 0; e.preventDefault(); }
    if (e.key === 'ArrowUp')    { cam.phi = clamp(cam.phi - step, 0.09, Math.PI - 0.09); cam.idle = 0; e.preventDefault(); }
    if (e.key === 'ArrowDown')  { cam.phi = clamp(cam.phi + step, 0.09, Math.PI - 0.09); cam.idle = 0; e.preventDefault(); }
  });

  /* ─────────────────────────────────────────────────────────────────────
     12. Resize and frame loop
     ───────────────────────────────────────────────────────────────────── */
  function resize() {
    var r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  var last = performance.now(), hoverCooldown = 0;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    stepCamera(dt);
    if (showNeurons) stepNeurons(dt);
    stepIdle(dt);
    stepPulse(dt);

    if (activeStep && now > activeUntil) { activeStep = null; refreshHighlight(); }
    if (cortexDirty) repaintCortex();

    /* one ray test per frame at most, and never while dragging */
    hoverCooldown -= dt;
    if (hover.live && hover.dirty && !ptr.down && hoverCooldown <= 0 && !coarse) {
      hoverCooldown = 0.06; hover.dirty = false;
      pickAt(hover.x, hover.y, false);
    }

    /* body nodes breathe, and fade back down after a pulse passes */
    for (var id in extMeshes) {
      var m = extMeshes[id];
      m.halo.material.opacity = Math.max(0.28, m.halo.material.opacity - dt * 0.8);
      m.core.material.opacity = Math.max(0.5, m.core.material.opacity - dt * 0.8);
      m.core.rotation.y += dt * 0.5;
    }

    occTimer -= dt;
    if (occTimer <= 0) { occTimer = 0.125; updateOcclusion(); }
    updateLabels();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────────────────────────────────────────
     13. Boot
     ───────────────────────────────────────────────────────────────────── */
  function init() {
    if (small) { optLabels.checked = false; }
    /* The environment only feeds the clearcoat; if float textures are
       unavailable the lights alone still render the scene. */
    try { scene.environment = environmentMap(); } catch (err) { /* lights only */ }
    buildBrain();
    buildExternals();
    initPulseObjects();
    buildLabels();
    seedNeurons();
    repaintCortex();
    buildList('');
    emptyDetail();
    applyLabels(); applyAreas(); setXray(false);
    resize(); applyCamera();
    $('#loading').hidden = true;
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  /* Give the browser a frame to paint the loading state before the cortex
     generation blocks the main thread. */
  function boot() {
    requestAnimationFrame(function () { setTimeout(init, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
