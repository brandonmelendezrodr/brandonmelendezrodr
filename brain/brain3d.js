/* ===========================================================================
   Neuroatlas — procedural brain geometry.

   There is no mesh file here. The cortex is generated at load: an icosphere is
   pushed into the silhouette of a cerebrum, cut by the fissures that give a
   brain its landmarks (longitudinal, Sylvian, central, parieto-occipital), and
   then displaced by multi-octave ridged noise, which is what produces gyri
   separated by sharp sulci. Depth of displacement is baked into vertex colour
   as ambient occlusion, so sulci read as shadowed creases rather than as bumps.

   Brain-local axes, with 1.0 ~ 8cm:
     +y superior, +z anterior, and therefore +x is the anatomical LEFT — in a
   right-handed frame, Left x Superior = Anterior. Language areas live at +x.
   The cerebrum spans z -1.05..1.05.
   =========================================================================== */
(function (global) {
  'use strict';

  var T = global.THREE;

  /* ── 3D simplex noise ──────────────────────────────────────────────── */
  function makeNoise(seed) {
    var perm = new Uint8Array(512), p = new Uint8Array(256), i, j, t;
    for (i = 0; i < 256; i++) p[i] = i;
    var s = seed || 1;
    function rnd() { s = (s * 1664525 + 1013904223) & 0xffffffff; return ((s >>> 8) & 0xffffff) / 0x1000000; }
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];

    var G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
             [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    var F3 = 1 / 3, G3 = 1 / 6;

    return function (xin, yin, zin) {
      var n0 = 0, n1 = 0, n2 = 0, n3 = 0;
      var s0 = (xin + yin + zin) * F3;
      var ii = Math.floor(xin + s0), jj = Math.floor(yin + s0), kk = Math.floor(zin + s0);
      var t0 = (ii + jj + kk) * G3;
      var x0 = xin - (ii - t0), y0 = yin - (jj - t0), z0 = zin - (kk - t0);
      var i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0)      { i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
        else if (x0 >= z0) { i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
        else               { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
      } else {
        if (y0 < z0)       { i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
        else if (x0 < z0)  { i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
        else               { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
      }
      var x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
      var x2 = x0 - i2 + 2*G3,   y2 = y0 - j2 + 2*G3,   z2 = z0 - k2 + 2*G3;
      var x3 = x0 - 1 + 3*G3,    y3 = y0 - 1 + 3*G3,    z3 = z0 - 1 + 3*G3;
      var I = ii & 255, J = jj & 255, K = kk & 255, g, tt;

      tt = .6 - x0*x0 - y0*y0 - z0*z0;
      if (tt > 0) { g = G[perm[I+perm[J+perm[K]]] % 12]; tt *= tt; n0 = tt*tt*(g[0]*x0+g[1]*y0+g[2]*z0); }
      tt = .6 - x1*x1 - y1*y1 - z1*z1;
      if (tt > 0) { g = G[perm[I+i1+perm[J+j1+perm[K+k1]]] % 12]; tt *= tt; n1 = tt*tt*(g[0]*x1+g[1]*y1+g[2]*z1); }
      tt = .6 - x2*x2 - y2*y2 - z2*z2;
      if (tt > 0) { g = G[perm[I+i2+perm[J+j2+perm[K+k2]]] % 12]; tt *= tt; n2 = tt*tt*(g[0]*x2+g[1]*y2+g[2]*z2); }
      tt = .6 - x3*x3 - y3*y3 - z3*z3;
      if (tt > 0) { g = G[perm[I+1+perm[J+1+perm[K+1]]] % 12]; tt *= tt; n3 = tt*tt*(g[0]*x3+g[1]*y3+g[2]*z3); }
      return 32 * (n0 + n1 + n2 + n3);
    };
  }

  var noise = makeNoise(20240917);

  /* Ridged multifractal: sharp valleys, rounded crests — gyri and sulci. */
  function ridged(x, y, z, oct, freq, lac, gain) {
    var sum = 0, amp = 0.5, f = freq, w = 0;
    for (var i = 0; i < oct; i++) {
      var n = 1 - Math.abs(noise(x * f, y * f, z * f));
      n *= n;
      sum += n * amp; w += amp;
      f *= lac; amp *= gain;
    }
    return sum / w;
  }

  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* ── Indexed icosphere ─────────────────────────────────────────────── */
  function icosphere(detail) {
    var t = (1 + Math.sqrt(5)) / 2;
    var seed = [-1,t,0, 1,t,0, -1,-t,0, 1,-t,0, 0,-1,t, 0,1,t,
                0,-1,-t, 0,1,-t, t,0,-1, t,0,1, -t,0,-1, -t,0,1];
    var seedFaces = [0,11,5, 0,5,1, 0,1,7, 0,7,10, 0,10,11, 1,5,9, 5,11,4,
                     11,10,2, 10,7,6, 7,1,8, 3,9,4, 3,4,2, 3,2,6, 3,6,8,
                     3,8,9, 4,9,5, 2,4,11, 6,2,10, 8,6,7, 9,8,1];

    /* Euler's formula fixes the final sizes up front, so everything can live
       in flat typed arrays instead of a hundred thousand little ones. */
    var nFaces = 20 * Math.pow(4, detail);
    var nVerts = nFaces / 2 + 2;
    var pos = new Float32Array(nVerts * 3);
    var faces = new Uint32Array(nFaces * 3);
    var next = new Uint32Array(nFaces * 3);

    var vc = 12, fc = 20, i;
    for (i = 0; i < 12; i++) {
      var L = Math.hypot(seed[i*3], seed[i*3+1], seed[i*3+2]);
      pos[i*3] = seed[i*3] / L; pos[i*3+1] = seed[i*3+1] / L; pos[i*3+2] = seed[i*3+2] / L;
    }
    faces.set(seedFaces, 0);

    var cache = new Map();
    function mid(a, b) {
      var key = a < b ? a * 2097152 + b : b * 2097152 + a;
      var hit = cache.get(key);
      if (hit !== undefined) return hit;
      var x = pos[a*3] + pos[b*3], y = pos[a*3+1] + pos[b*3+1], z = pos[a*3+2] + pos[b*3+2];
      var L = Math.hypot(x, y, z);
      pos[vc*3] = x / L; pos[vc*3+1] = y / L; pos[vc*3+2] = z / L;
      cache.set(key, vc);
      return vc++;
    }

    for (var d = 0; d < detail; d++) {
      cache.clear();
      var w = 0;
      for (i = 0; i < fc; i++) {
        var f0 = faces[i*3], f1 = faces[i*3+1], f2 = faces[i*3+2];
        var a = mid(f0, f1), b = mid(f1, f2), c = mid(f2, f0);
        next[w++] = f0; next[w++] = a;  next[w++] = c;
        next[w++] = f1; next[w++] = b;  next[w++] = a;
        next[w++] = f2; next[w++] = c;  next[w++] = b;
        next[w++] = a;  next[w++] = b;  next[w++] = c;
      }
      faces.set(next.subarray(0, w), 0);
      fc *= 4;
    }
    cache.clear();

    var Idx = vc > 65535 ? Uint32Array : Uint16Array;
    return { position: pos, index: new Idx(faces.subarray(0, fc * 3)), count: vc };
  }

  /* ── Cortical landmarks, in shaped coordinates ─────────────────────── */
  /* The Sylvian fissure climbs from the temporal pole toward the back. */
  function ySylvian(z) { return -0.30 + (0.55 - z) * 0.26; }
  /* The central sulcus leans forward as it descends. */
  function zCentral(y) { return -0.18 + (0.62 - y) * 0.597; }
  /* The parieto-occipital sulcus. */
  function zParOcc(y)  { return -0.60 - (0.62 - y) * 0.10; }

  var LOBES = ['frontal', 'parietal', 'temporal', 'occipital'];
  var AREAS = ['', 'prefrontal', 'motor', 'somatosensory', 'broca', 'wernicke', 'auditory', 'visual'];

  function lobeOf(x, y, z) {
    if (z < zParOcc(y)) return 3;                       /* occipital */
    if (y < ySylvian(z)) return z > 0.52 ? 0 : 2;       /* orbital frontal, else temporal */
    return z > zCentral(y) ? 0 : 1;                     /* frontal / parietal */
  }

  function areaOf(x, y, z) {
    var ys = ySylvian(z), zc = zCentral(y), lat = Math.abs(x);
    if (z < -0.80 || (lat < 0.24 && z < -0.58)) return 7;                       /* V1 */
    if (x > 0.38 && z > 0.26 && z < 0.56 && y > ys && y < ys + 0.17) return 4;  /* Broca's, left */
    if (x > 0.38 && z > -0.46 && z < -0.04 && y < ys && y > ys - 0.21) return 5; /* Wernicke's, left */
    if (lat > 0.40 && z > -0.06 && z < 0.20 && y < ys && y > ys - 0.15) return 6; /* A1 */
    if (y > ys && z > zc && z < zc + 0.16) return 2;                           /* M1 */
    if (y > ys && z < zc && z > zc - 0.15 && z > zParOcc(y)) return 3;          /* S1 */
    if (y > ys - 0.18 && z > zc + 0.34) return 1;                              /* prefrontal */
    return 0;
  }

  /* ── Cerebrum silhouette ───────────────────────────────────────────── */
  function shapeCerebrum(dx, dy, dz, out) {
    /* Narrow toward the frontal and occipital poles. */
    var wx = 1 - 0.26 * smoothstep(0.15, 0.95, dz) - 0.30 * smoothstep(-0.25, -0.95, dz);
    var x = dx * 0.80 * wx;
    var y = dy * 0.66;
    var z = dz * 1.00;

    /* Temporal lobes carry the width low and in the middle third. */
    var temporal = smoothstep(-0.02, -0.40, y) * (1 - smoothstep(0.30, 0.80, Math.abs(z)));
    x *= 1 + 0.26 * temporal;
    y -= 0.07 * temporal;

    /* The parietal region is the tallest point, the frontal pole a touch lower. */
    y += 0.05 * smoothstep(0.2, -0.9, z) * smoothstep(0.1, 0.7, y);
    y -= 0.05 * smoothstep(0.3, 1.0, z) * smoothstep(0.0, 0.6, y);

    /* Soft floor: the inferior surface is flat, and rises at both poles. */
    var floorY = -0.40 - 0.16 * (1 - smoothstep(0.15, 0.80, Math.abs(z)));
    var d = y - floorY;
    y = floorY + 0.5 * (d + Math.sqrt(d * d + 0.010));

    out.x = x; out.y = y; out.z = z;
  }

  /* Depth of the named fissures at a shaped point, in units of displacement. */
  function fissures(x, y, z) {
    var cut = 0;

    /* Longitudinal fissure — the cleft between the hemispheres. */
    var lg = Math.exp(-(x / 0.070) * (x / 0.070));
    cut += 0.115 * lg * smoothstep(-0.30, 0.10, y);

    /* Sylvian fissure — the deep lateral groove above the temporal lobe. */
    var ys = ySylvian(z);
    var dy = (y - ys) / 0.045;
    var syl = Math.exp(-dy * dy) * smoothstep(0.30, 0.46, Math.abs(x)) *
              smoothstep(0.62, 0.50, z) * smoothstep(-0.62, -0.46, z);
    cut += 0.062 * syl;

    /* Central sulcus. */
    var zc = zCentral(y);
    var dz = (z - zc) / 0.045;
    var cs = Math.exp(-dz * dz) * smoothstep(ys - 0.02, ys + 0.14, y);
    cut += 0.055 * cs;

    /* Parieto-occipital sulcus, deepest near the midline. */
    var zp = zParOcc(y);
    var dp = (z - zp) / 0.050;
    var po = Math.exp(-dp * dp) * smoothstep(0.55, 0.30, Math.abs(x)) * smoothstep(-0.05, 0.25, y);
    cut += 0.060 * po;

    /* Preoccipital notch, where the temporal lobe meets the occipital. */
    var nx = (z + 0.60) / 0.10, ny = (y + 0.18) / 0.14;
    cut += 0.035 * Math.exp(-(nx*nx + ny*ny)) * smoothstep(0.34, 0.50, Math.abs(x));

    return cut;
  }

  /* ── The cortex ────────────────────────────────────────────────────── */
  function buildCortex(detail) {
    var ico = icosphere(detail);
    var n = ico.count;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var ao  = new Float32Array(n);
    var lobeId = new Uint8Array(n);
    var areaId = new Uint8Array(n);
    var p = { x: 0, y: 0, z: 0 };
    var GYRAL = 0.058;

    for (var i = 0; i < n; i++) {
      var dx = ico.position[i*3], dy = ico.position[i*3+1], dz = ico.position[i*3+2];
      shapeCerebrum(dx, dy, dz, p);

      lobeId[i] = lobeOf(p.x, p.y, p.z);
      areaId[i] = areaOf(p.x, p.y, p.z);

      /* Gyral folding. Three octaves of ridged noise, centred so crests push
         out and troughs pull in, then the named fissures cut deeper still. */
      var r = ridged(p.x, p.y, p.z, 3, 4.35, 2.13, 0.44);
      var fold = (r - 0.46) * GYRAL * 2;
      var cut = fissures(p.x, p.y, p.z);
      var disp = fold - cut;

      /* Displace along the ellipsoid normal (the shaped point's own direction
         is close enough at this smoothness and much cheaper than a real one). */
      var L = Math.hypot(p.x, p.y, p.z) || 1;
      pos[i*3]   = p.x + (p.x / L) * disp;
      pos[i*3+1] = p.y + (p.y / L) * disp;
      pos[i*3+2] = p.z + (p.z / L) * disp;

      /* Bake occlusion: the deeper the crease, the darker it sits. */
      ao[i] = smoothstep(-GYRAL * 1.5, GYRAL * 0.9, disp);
    }

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setIndex(new T.BufferAttribute(ico.index, 1));
    g.computeVertexNormals();
    g.userData = { ao: ao, lobeId: lobeId, areaId: areaId, count: n };
    return g;
  }

  /* ── Tissue colour ─────────────────────────────────────────────────── */
  var CROWN = [0.735, 0.545, 0.505];   /* gyral crown, lit cortex */
  var SULCUS = [0.205, 0.108, 0.112];  /* deep in a sulcus */

  function hexRGB(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
  }

  /* opts: tint (0..1), palette {lobeName|areaName: '#hex'}, showAreas,
     highlight {regionId: strength} */
  function paintCortex(geom, opts) {
    var u = geom.userData, col = geom.attributes.color.array, n = u.count;
    var tint = opts.tint === undefined ? 0.30 : opts.tint;
    var pal = opts.palette, showAreas = opts.showAreas, hi = opts.highlight || {};
    var lobeRGB = LOBES.map(function (id) { return hexRGB(pal[id] || '#ffffff'); });
    var areaRGB = AREAS.map(function (id) { return id ? hexRGB(pal[id] || '#ffffff') : null; });
    var lobeHi = LOBES.map(function (id) { return hi[id] || 0; });
    var areaHi = AREAS.map(function (id) { return id ? (hi[id] || 0) : 0; });

    for (var i = 0; i < n; i++) {
      var a = u.ao[i];
      var base0 = mix(SULCUS[0], CROWN[0], a);
      var base1 = mix(SULCUS[1], CROWN[1], a);
      var base2 = mix(SULCUS[2], CROWN[2], a);

      var li = u.lobeId[i], ai = showAreas ? u.areaId[i] : 0;
      var c = ai ? areaRGB[ai] : lobeRGB[li];
      var strength = ai ? areaHi[ai] : lobeHi[li];
      var amount = tint * (ai ? 1.35 : 1) + strength * 0.62;
      if (amount > 0.96) amount = 0.96;

      /* Tint toward the region hue, keeping the baked crease shading. */
      var shade = 0.42 + 0.58 * a;
      col[i*3]   = mix(base0, c[0] * shade, amount);
      col[i*3+1] = mix(base1, c[1] * shade, amount);
      col[i*3+2] = mix(base2, c[2] * shade, amount);
    }
    geom.attributes.color.needsUpdate = true;
  }

  global.BRAIN3D = {
    noise: noise, ridged: ridged, smoothstep: smoothstep, mix: mix,
    icosphere: icosphere, shapeCerebrum: shapeCerebrum, fissures: fissures,
    buildCortex: buildCortex, paintCortex: paintCortex,
    lobeOf: lobeOf, areaOf: areaOf, LOBES: LOBES, AREAS: AREAS,
    ySylvian: ySylvian, zCentral: zCentral, zParOcc: zParOcc, hexRGB: hexRGB
  };
})(window);

/* ===========================================================================
   Sub-cortical geometry: cerebellum, brainstem and the deep structures.
   =========================================================================== */
(function (global) {
  'use strict';
  var T = global.THREE, B = global.BRAIN3D;

  /* ── Cerebellum ────────────────────────────────────────────────────────
     Distinctive because of its folia: hundreds of fine parallel leaves
     running side to side, far finer than cortical gyri, plus the raised
     vermis down the midline. */
  function buildCerebellum(detail) {
    var ico = B.icosphere(detail || 5), n = ico.count;
    var pos = new Float32Array(n * 3), ao = new Float32Array(n);

    for (var i = 0; i < n; i++) {
      var dx = ico.position[i*3], dy = ico.position[i*3+1], dz = ico.position[i*3+2];
      var x = dx * 0.50, y = dy * 0.235, z = dz * 0.315;

      /* Flatter on top where it tucks under the occipital lobe. */
      y *= 1 - 0.22 * B.smoothstep(0.1, 1.0, dy);
      /* Narrower at the lateral edges of each hemisphere. */
      z *= 1 - 0.18 * B.smoothstep(0.55, 1.0, Math.abs(dx));

      /* Folia: parallel leaves following the anterior-posterior curl. */
      var ang = Math.atan2(y, z);
      var folia = Math.abs(Math.sin(ang * 15.5 + x * 1.4));
      folia = Math.pow(folia, 0.62);
      var grain = B.noise(x * 9, y * 9, z * 9) * 0.22;
      var disp = (folia - 0.62 + grain) * 0.022;

      /* Vermis — the raised midline ridge between the hemispheres. */
      var vermis = Math.exp(-(x / 0.075) * (x / 0.075));
      disp += 0.020 * vermis;
      /* and the shallow grooves flanking it */
      var fl = Math.exp(-((Math.abs(x) - 0.12) / 0.045) * ((Math.abs(x) - 0.12) / 0.045));
      disp -= 0.016 * fl;

      var L = Math.hypot(x, y, z) || 1;
      pos[i*3]   = x + (x / L) * disp;
      pos[i*3+1] = y + (y / L) * disp - 0.455;
      pos[i*3+2] = z + (z / L) * disp - 0.680;
      ao[i] = B.smoothstep(-0.020, 0.016, disp);
    }

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(new T.BufferAttribute(ico.index, 1));
    g.computeVertexNormals();
    g.userData = { ao: ao, count: n };
    return g;
  }

  /* ── Generic swept tube ────────────────────────────────────────────────
     radiusFn(t) -> [radiusAlongNormal, radiusAlongBinormal]; bulgeFn is an
     optional extra push used to give the pons its anterior swell. */
  function tubeFromCurve(curve, t0, t1, tubular, radial, radiusFn, bulgeFn) {
    /* bulgeFn(t, ox, oy, oz) receives the world-space offset direction, so a
       swelling can be aimed anatomically (the pons bulges anterior) rather
       than at whatever way the Frenet frame happens to be pointing. */
    var frames = curve.computeFrenetFrames(tubular * 4, false);
    var pos = new Float32Array((tubular + 1) * (radial + 1) * 3);
    var idx = [], P = new T.Vector3(), k = 0;

    for (var i = 0; i <= tubular; i++) {
      var tt = i / tubular, t = t0 + (t1 - t0) * tt;
      curve.getPoint(t, P);
      var fi = Math.min(Math.round(t * tubular * 4), tubular * 4 - 1);
      var N = frames.normals[fi], Bn = frames.binormals[fi];
      var r = radiusFn(t);
      for (var j = 0; j <= radial; j++) {
        var a = (j / radial) * Math.PI * 2;
        var cs = Math.cos(a), sn = Math.sin(a);
        var ox = N.x * cs * r[0] + Bn.x * sn * r[1];
        var oy = N.y * cs * r[0] + Bn.y * sn * r[1];
        var oz = N.z * cs * r[0] + Bn.z * sn * r[1];
        var push = bulgeFn ? bulgeFn(t, ox, oy, oz) : 0;
        pos[k++] = P.x + ox * (1 + push);
        pos[k++] = P.y + oy * (1 + push);
        pos[k++] = P.z + oz * (1 + push);
      }
    }
    for (var a2 = 0; a2 < tubular; a2++) {
      for (var b2 = 0; b2 < radial; b2++) {
        var p0 = a2 * (radial + 1) + b2, p1 = p0 + radial + 1;
        idx.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* The brainstem descends from under the thalamus, curving backward. */
  var STEM_CURVE = new T.CatmullRomCurve3([
    new T.Vector3(0, -0.14, -0.06),
    new T.Vector3(0, -0.34, -0.14),
    new T.Vector3(0, -0.56, -0.19),
    new T.Vector3(0, -0.82, -0.22),
    new T.Vector3(0, -1.05, -0.24)
  ], false, 'catmullrom', 0.4);

  /* t-ranges along that curve for each named segment. */
  var STEM_PARTS = {
    midbrain: [0.02, 0.24],
    pons:     [0.24, 0.47],
    medulla:  [0.47, 0.76],
    spinal:   [0.76, 1.00]
  };

  function stemRadius(t) {
    var r = 0.105;
    if (t < 0.24)      r = B.mix(0.115, 0.108, t / 0.24);
    else if (t < 0.47) r = B.mix(0.108, 0.092, (t - 0.24) / 0.23);
    else if (t < 0.76) r = B.mix(0.092, 0.062, (t - 0.47) / 0.29);
    else               r = B.mix(0.062, 0.050, (t - 0.76) / 0.24);
    return [r, r * 1.12];
  }
  /* The pons swells forward, and carries the transverse fibre bands that give
     it its banded look. */
  function stemBulge(t, ox, oy, oz) {
    var L = Math.hypot(ox, oy, oz) || 1;
    var inPons = Math.exp(-Math.pow((t - 0.355) / 0.090, 2));
    var anterior = Math.max(0, oz / L);
    var swell = 0.55 * inPons * anterior * anterior;
    var bands = 0.055 * inPons * anterior * Math.abs(Math.sin(t * 165));
    return swell + bands;
  }

  function buildStemPart(name) {
    var r = STEM_PARTS[name];
    return tubeFromCurve(STEM_CURVE, r[0], r[1], name === 'pons' ? 96 : 40, 28,
                         stemRadius, name === 'pons' ? stemBulge : null);
  }

  /* ── Deep structures ───────────────────────────────────────────────── */
  function buildEllipsoid(rx, ry, rz, cx, cy, cz, wobble, detail) {
    var ico = B.icosphere(detail || 4), n = ico.count;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var dx = ico.position[i*3], dy = ico.position[i*3+1], dz = ico.position[i*3+2];
      var w = wobble ? 1 + wobble * B.noise(dx * 2.6 + cx * 9, dy * 2.6, dz * 2.6 + cz * 7) : 1;
      pos[i*3]   = cx + dx * rx * w;
      pos[i*3+1] = cy + dy * ry * w;
      pos[i*3+2] = cz + dz * rz * w;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(new T.BufferAttribute(ico.index, 1));
    g.computeVertexNormals();
    return g;
  }

  function buildTube(points, rN, rB, tubular) {
    var curve = new T.CatmullRomCurve3(points.map(function (p) {
      return new T.Vector3(p[0], p[1], p[2]);
    }), false, 'catmullrom', 0.5);
    return tubeFromCurve(curve, 0, 1, tubular || 48, 20, function (t) {
      var taper = 1 - 0.45 * B.smoothstep(0.55, 1, t);
      return [rN * taper, rB * taper];
    }, null);
  }

  /* The corpus callosum: an arched plate on the midline, thin top to bottom
     and broad across the hemispheres. */
  function buildCallosum() {
    var curve = new T.CatmullRomCurve3([
      new T.Vector3(0,  0.08,  0.40),
      new T.Vector3(0,  0.26,  0.30),
      new T.Vector3(0,  0.33,  0.05),
      new T.Vector3(0,  0.30, -0.22),
      new T.Vector3(0,  0.16, -0.42),
      new T.Vector3(0,  0.02, -0.40)
    ], false, 'catmullrom', 0.5);
    return tubeFromCurve(curve, 0, 1, 72, 20, function (t) {
      var thick = 0.030 * (1 + 0.9 * Math.exp(-Math.pow((t - 0.93) / 0.12, 2))
                             + 0.5 * Math.exp(-Math.pow((t - 0.07) / 0.12, 2)));
      return [thick, 0.115];
    }, null);
  }

  global.BRAIN3D.buildCerebellum = buildCerebellum;
  global.BRAIN3D.buildStemPart   = buildStemPart;
  global.BRAIN3D.buildEllipsoid  = buildEllipsoid;
  global.BRAIN3D.buildTube       = buildTube;
  global.BRAIN3D.buildCallosum   = buildCallosum;
  global.BRAIN3D.STEM_CURVE      = STEM_CURVE;
})(window);
