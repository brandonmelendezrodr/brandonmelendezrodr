/* ===========================================================================
   Neuroatlas — interaction, rendering and the signal-propagation engine.

   Everything is drawn in the SVG's 1000 x 730 user-space grid. The canvas
   overlay is transformed so that it shares those coordinates exactly, which
   means a point from data.js can be handed to either layer unchanged.
   =========================================================================== */
(function () {
  'use strict';

  var D          = window.BRAIN;
  var REGIONS    = D.REGIONS;
  var EXTERNAL   = D.EXTERNAL;
  var PATHWAYS   = D.PATHWAYS;
  var VW = 1000, VH = 730;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Everything routable by id: regions and body nodes alike. */
  var NODES = {};
  REGIONS.forEach(function (r) { NODES[r.id] = r; });
  EXTERNAL.forEach(function (e) { NODES[e.id] = e; });

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var ce = function (t, a) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', t);
    for (var k in a) if (a[k] !== undefined && a[k] !== null) el.setAttribute(k, a[k]);
    return el;
  };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var dist  = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };

  /* ─────────────────────────────────────────────────────────────────────
     1. Build the diagram
     ───────────────────────────────────────────────────────────────────── */
  var svg      = $('#brain');
  var gCortex  = $('#g-cortex'), gDeep = $('#g-deep'), gStem = $('#g-stem');
  var gAreas   = $('#g-areas'),  gExt  = $('#g-external'), gLabels = $('#g-labels');

  function geometryFor(r) {
    if (r.shape === 'ellipse') {
      var e = ce('ellipse', { cx: r.cx, cy: r.cy, rx: r.rx, ry: r.ry, 'class': 'fill' });
      if (r.rot) e.setAttribute('transform', 'rotate(' + r.rot + ' ' + r.cx + ' ' + r.cy + ')');
      return e;
    }
    if (r.shape === 'circle') return ce('circle', { cx: r.cx, cy: r.cy, r: r.r, 'class': 'fill' });
    return ce('path', { d: r.d, 'class': 'fill' });
  }

  REGIONS.forEach(function (r) {
    var g = ce('g', {
      'class': 'region', 'data-id': r.id, tabindex: '0', role: 'button',
      'aria-label': r.name
    });
    g.style.color = r.color;
    var geo = geometryFor(r);
    g.appendChild(geo);
    r.el = g; r.geo = geo;

    (r.layer === 'cortex' ? gCortex :
     r.layer === 'deep'   ? gDeep   :
     r.layer === 'stem'   ? gStem   : gAreas).appendChild(g);

    /* Label, with a leader line when it sits away from the structure. */
    var lab = ce('text', {
      x: r.label[0], y: r.label[1], 'class': 'rlabel',
      'text-anchor': r.anchor || 'middle', 'data-label': r.id
    });
    lab.textContent = r.name.replace(' (V1)', '').replace(' Oblongata', '');
    if (r.layer === 'area') lab.classList.add('area-label');
    if (dist(r.label, r.node) > 30) {
      var dx = r.node[0] - r.label[0], dy = r.node[1] - r.label[1];
      var L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      gLabels.appendChild(ce('line', {
        x1: r.label[0] + ux * 11, y1: r.label[1] + uy * 11 + 3,
        x2: r.node[0]  - ux * 12, y2: r.node[1]  - uy * 12,
        stroke: r.color, 'stroke-width': .9, 'stroke-opacity': .34,
        'stroke-dasharray': '3 3', 'class': 'leader' + (r.layer === 'area' ? ' area-label' : '')
      }));
    }
    gLabels.appendChild(lab);
    r.labelEl = lab;
  });

  /* Body nodes drawn outside the skull. */
  var EXT_ICON = {
    eye:    'M-9,0 C-5,-6 5,-6 9,0 C5,6 -5,6 -9,0 M0,-3 a3,3 0 1,0 .1,0',
    nose:   'M2,-8 C-2,-3 -6,2 -6,5 C-6,8 -2,9 1,7 M-6,4 L1,4',
    ear:    'M-3,-7 C4,-9 8,-4 6,2 C5,5 2,6 2,8 M-3,-2 C-1,-4 2,-3 2,-1',
    skin:   'M-8,-4 C-4,-7 4,-7 8,-4 M-8,1 C-4,-2 4,-2 8,1 M-8,6 C-4,3 4,3 8,6',
    muscle: 'M-8,3 C-6,-5 -1,-7 2,-4 C6,-1 8,2 7,5 M-8,3 C-4,6 2,7 7,5',
    drop:   'M0,-8 C4,-3 7,0 7,3 a7,7 0 0,1 -14,0 C-7,0 -4,-3 0,-8 Z'
  };
  EXTERNAL.forEach(function (e) {
    var g = ce('g', { 'class': 'ext-node', 'data-ext': e.id, transform: 'translate(' + e.node[0] + ',' + e.node[1] + ')' });
    g.appendChild(ce('circle', { r: 16 }));
    g.appendChild(ce('path', { d: EXT_ICON[e.icon] || EXT_ICON.drop }));
    gExt.appendChild(g);
    var t = ce('text', { x: e.label[0], y: e.label[1], 'class': 'ext-label' });
    t.textContent = e.name;
    gExt.appendChild(t);
    e.el = g;
  });

  /* ─────────────────────────────────────────────────────────────────────
     2. Canvas: neuron field + travelling signals
     ───────────────────────────────────────────────────────────────────── */
  var stage = $('#stage'), cv = $('#fx'), ctx = cv.getContext('2d');
  var scale = 1;

  function resize() {
    var r = stage.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = Math.round(r.width  * dpr);
    cv.height = Math.round(r.height * dpr);
    scale = r.width / VW;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  /* — neurons ------------------------------------------------------------ */
  var neurons = [];
  var pt = svg.createSVGPoint ? svg.createSVGPoint() : null;

  function insideBrain(x, y) {
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      if (r.layer === 'area') continue;
      var g = r.geo;
      if (!pt || !g.isPointInFill) return true;
      try {
        pt.x = x; pt.y = y;
        if (g.isPointInFill(pt)) return true;
      } catch (err) { return true; }
    }
    return false;
  }

  function seedNeurons() {
    neurons = [];
    var target = reduced ? 44 : 128, guard = 0;
    while (neurons.length < target && guard++ < 6000) {
      var x = 120 + Math.random() * 690;
      var y = 100 + Math.random() * 480;
      if (!insideBrain(x, y)) continue;
      var ok = true;
      for (var i = 0; i < neurons.length; i++) {
        if (Math.hypot(neurons[i].x - x, neurons[i].y - y) < 26) { ok = false; break; }
      }
      if (!ok) continue;
      var dend = [], n = 3 + (Math.random() * 3 | 0);
      for (var k = 0; k < n; k++) {
        dend.push({ a: Math.random() * Math.PI * 2, l: 7 + Math.random() * 13 });
      }
      neurons.push({
        x: x, y: y, r: 1.4 + Math.random() * 1.3, e: 0,
        next: Math.random() * 7, dend: dend, hue: Math.random() < .25 ? 1 : 0
      });
    }
    /* connect each neuron to its two nearest neighbours */
    neurons.forEach(function (a, i) {
      var cand = [];
      neurons.forEach(function (b, j) {
        if (i === j) return;
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 86) cand.push({ j: j, d: d });
      });
      cand.sort(function (p, q) { return p.d - q.d; });
      a.links = cand.slice(0, 3).map(function (c) { return c.j; });
    });
  }

  var sparks = [];      /* neuron-to-neuron firings */
  function fireNeuron(i, depth) {
    var n = neurons[i];
    if (!n || n.e > .75) return;
    n.e = 1;
    if (depth > 2 || !n.links || !n.links.length) return;
    var hops = 1 + (Math.random() < .35 ? 1 : 0);
    for (var h = 0; h < hops; h++) {
      var t = n.links[(Math.random() * n.links.length) | 0];
      if (t === undefined || sparks.length > 160) continue;
      sparks.push({ a: i, b: t, t: 0, sp: 1.6 + Math.random() * 1.6, depth: (depth || 0) + 1 });
    }
  }

  function exciteNear(x, y, radius, power) {
    for (var i = 0; i < neurons.length; i++) {
      var n = neurons[i];
      var d = Math.hypot(n.x - x, n.y - y);
      if (d < radius) {
        n.e = Math.max(n.e, (power || 1) * (1 - d / radius));
        if (Math.random() < .3) fireNeuron(i, 1);
      }
    }
  }

  /* — routes -------------------------------------------------------------- */
  function catmull(points, samplesPerSeg) {
    var p = points.slice();
    p.unshift(points[0]); p.push(points[points.length - 1]);
    var out = [];
    for (var i = 1; i < p.length - 2; i++) {
      var p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
      for (var s = 0; s < samplesPerSeg; s++) {
        var t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
        out.push([
          .5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          .5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function buildRoute(nodePts) {
    var SPS = 16;
    var pts = catmull(nodePts, SPS);
    var acc = [0];
    for (var i = 1; i < pts.length; i++) {
      acc[i] = acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    /* distance along the smoothed curve at which each original node sits */
    var marks = nodePts.map(function (_, i) {
      var idx = i === 0 ? 0 : Math.min(i * SPS, pts.length - 1);
      return acc[idx];
    });
    marks[marks.length - 1] = acc[acc.length - 1];
    return { pts: pts, acc: acc, len: acc[acc.length - 1], marks: marks };
  }

  function pointAt(route, d) {
    d = clamp(d, 0, route.len);
    var lo = 0, hi = route.acc.length - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (route.acc[mid] <= d) lo = mid; else hi = mid;
    }
    var seg = route.acc[hi] - route.acc[lo] || 1;
    var t = (d - route.acc[lo]) / seg;
    return [
      route.pts[lo][0] + (route.pts[hi][0] - route.pts[lo][0]) * t,
      route.pts[lo][1] + (route.pts[hi][1] - route.pts[lo][1]) * t
    ];
  }

  /* — playback state ------------------------------------------------------ */
  var play = null;      /* the active pathway run */
  var bursts = [];      /* expanding rings at relays */
  var motes = [];       /* trailing particles */
  var idle = { t: 3, route: null, d: 0 };

  var speedMul = 1;
  $('#speed').addEventListener('input', function (e) { speedMul = +e.target.value / 100; });

  var BASE_SPEED = 215;  /* user-units per second at 1x */
  var DWELL      = 0.52; /* seconds paused at each relay */

  function startPathway(pw) {
    var pts = pw.steps.map(function (s) { return NODES[s.to].node; });
    play = {
      pw: pw, route: buildRoute(pts), d: 0, idx: 0,
      dwell: DWELL, trail: [], done: false, hold: 0
    };
    onArrive(0);
  }

  function stepPlayback(dt) {
    if (!play) return;
    if (play.done) { play.hold += dt; return; }
    if (play.dwell > 0) { play.dwell -= dt; return; }

    play.d += BASE_SPEED * speedMul * dt;
    var nextMark = play.route.marks[play.idx + 1];
    if (nextMark !== undefined && play.d >= nextMark) {
      play.d = nextMark;
      play.idx++;
      onArrive(play.idx);
      play.dwell = DWELL;
      if (play.idx >= play.pw.steps.length - 1) { play.done = true; finishPathway(); }
    }
    var p = pointAt(play.route, play.d);
    play.trail.push({ x: p[0], y: p[1], a: 1 });
    if (play.trail.length > 90) play.trail.shift();
    if (Math.random() < .55) {
      motes.push({
        x: p[0] + (Math.random() - .5) * 8, y: p[1] + (Math.random() - .5) * 8,
        vx: (Math.random() - .5) * 14, vy: (Math.random() - .5) * 14, a: 1, r: .8 + Math.random() * 1.4
      });
    }
    exciteNear(p[0], p[1], 52, .55);
  }

  function ringBurst(x, y, color) {
    bursts.push({ x: x, y: y, r: 6, a: .95, c: color || '#7cf3ff' });
    bursts.push({ x: x, y: y, r: 2, a: .8,  c: '#ffffff' });
  }

  /* — idle ambience ------------------------------------------------------- */
  var IDLE_LINKS = [
    ['thalamus', 'frontal'], ['hippocampus', 'temporal'], ['occipital', 'parietal'],
    ['cerebellum', 'pons'], ['amygdala', 'hypothalamus'], ['thalamus', 'occipital'],
    ['basalganglia', 'motor'], ['medulla', 'spinal'], ['corpuscallosum', 'parietal'],
    ['frontal', 'temporal'], ['thalamus', 'cerebellum']
  ];
  function tickIdle(dt) {
    if (play || reduced) { idle.route = null; return; }
    if (idle.route) {
      idle.d += 150 * dt * speedMul;
      if (idle.d > idle.route.len) idle.route = null;
      return;
    }
    idle.t -= dt;
    if (idle.t > 0) return;
    idle.t = 1.6 + Math.random() * 2.6;
    var link = IDLE_LINKS[(Math.random() * IDLE_LINKS.length) | 0];
    var a = NODES[link[0]], b = NODES[link[1]];
    if (!a || !b) return;
    idle.route = buildRoute([a.node, b.node]);
    idle.d = 0;
  }

  /* — draw ---------------------------------------------------------------- */
  var showNeurons = true;
  var last = performance.now();

  function frame(now) {
    var dt = Math.min((now - last) / 1000, .05);
    last = now;

    stepPlayback(dt);
    tickIdle(dt);

    ctx.clearRect(0, 0, VW, VH);

    /* neuron field ------------------------------------------------------ */
    if (showNeurons) {
      /* dendrites */
      ctx.lineWidth = .55;
      for (var i = 0; i < neurons.length; i++) {
        var n = neurons[i];
        if (!reduced) {
          n.next -= dt;
          if (n.next <= 0) { n.next = 2.5 + Math.random() * 7; fireNeuron(i, 0); }
          n.e = Math.max(0, n.e - dt * 1.5);
        }
        var base = .1 + n.e * .55;
        ctx.strokeStyle = n.hue ? 'rgba(169,139,255,' + base + ')' : 'rgba(124,243,255,' + base + ')';
        ctx.beginPath();
        for (var k = 0; k < n.dend.length; k++) {
          var dd = n.dend[k];
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(n.x + Math.cos(dd.a) * dd.l, n.y + Math.sin(dd.a) * dd.l);
        }
        ctx.stroke();

        var glow = n.e;
        if (glow > .02) {
          var g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 11 + glow * 9);
          g.addColorStop(0, 'rgba(160,250,255,' + (.5 * glow) + ')');
          g.addColorStop(1, 'rgba(124,243,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(n.x, n.y, 11 + glow * 9, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = n.hue
          ? 'rgba(200,180,255,' + (.34 + glow * .66) + ')'
          : 'rgba(170,240,255,' + (.34 + glow * .66) + ')';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + glow * 1.1, 0, 6.2832); ctx.fill();
      }

      /* sparks hopping between neurons */
      for (var s = sparks.length - 1; s >= 0; s--) {
        var sp = sparks[s], A = neurons[sp.a], B = neurons[sp.b];
        if (!A || !B) { sparks.splice(s, 1); continue; }
        sp.t += dt * sp.sp;
        if (sp.t >= 1) { fireNeuron(sp.b, sp.depth); sparks.splice(s, 1); continue; }
        var x = A.x + (B.x - A.x) * sp.t, y = A.y + (B.y - A.y) * sp.t;
        ctx.strokeStyle = 'rgba(124,243,255,' + (.32 * (1 - Math.abs(sp.t - .5) * 2) + .06) + ')';
        ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = 'rgba(210,252,255,.9)';
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 6.2832); ctx.fill();
      }
    }

    /* idle whisper ------------------------------------------------------ */
    if (idle.route) {
      var ip = pointAt(idle.route, idle.d);
      ctx.strokeStyle = 'rgba(124,243,255,.1)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(idle.route.pts[0][0], idle.route.pts[0][1]);
      for (var q = 1; q < idle.route.pts.length; q += 2) ctx.lineTo(idle.route.pts[q][0], idle.route.pts[q][1]);
      ctx.stroke();
      var ig = ctx.createRadialGradient(ip[0], ip[1], 0, ip[0], ip[1], 13);
      ig.addColorStop(0, 'rgba(160,250,255,.5)'); ig.addColorStop(1, 'rgba(124,243,255,0)');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ip[0], ip[1], 13, 0, 6.2832); ctx.fill();
      exciteNear(ip[0], ip[1], 36, .35);
    }

    /* the active pathway ------------------------------------------------ */
    if (play) {
      var R = play.route;

      /* full circuit, faint */
      ctx.strokeStyle = 'rgba(124,243,255,.16)';
      ctx.lineWidth = 1.4; ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(R.pts[0][0], R.pts[0][1]);
      for (var a2 = 1; a2 < R.pts.length; a2++) ctx.lineTo(R.pts[a2][0], R.pts[a2][1]);
      ctx.stroke(); ctx.setLineDash([]);

      /* travelled portion, bright */
      ctx.strokeStyle = 'rgba(124,243,255,.5)';
      ctx.lineWidth = 2.1; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(R.pts[0][0], R.pts[0][1]);
      for (var b2 = 1; b2 < R.pts.length && R.acc[b2] <= play.d; b2++) ctx.lineTo(R.pts[b2][0], R.pts[b2][1]);
      ctx.stroke();

      /* relay markers */
      R.marks.forEach(function (m, i) {
        var p = pointAt(R, m);
        var reached = i <= play.idx;
        ctx.strokeStyle = reached ? 'rgba(124,243,255,.9)' : 'rgba(124,243,255,.3)';
        ctx.fillStyle   = reached ? 'rgba(124,243,255,.22)' : 'rgba(10,16,28,.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], 5.5, 0, 6.2832); ctx.fill(); ctx.stroke();
      });

      /* comet trail */
      for (var t2 = 0; t2 < play.trail.length; t2++) {
        var tr = play.trail[t2];
        tr.a -= dt * 1.15;
        if (tr.a <= 0) continue;
        var f = t2 / play.trail.length;
        ctx.fillStyle = 'rgba(190,250,255,' + (tr.a * f * .7) + ')';
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 1 + f * 3.4, 0, 6.2832); ctx.fill();
      }
      while (play.trail.length && play.trail[0].a <= 0) play.trail.shift();

      /* head */
      var hp = pointAt(R, play.d);
      var pulse = 1 + Math.sin(now / 90) * .16;
      var hg = ctx.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 30 * pulse);
      hg.addColorStop(0, 'rgba(255,255,255,.95)');
      hg.addColorStop(.22, 'rgba(160,250,255,.75)');
      hg.addColorStop(1, 'rgba(124,243,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 30 * pulse, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hp[0], hp[1], 3.6, 0, 6.2832); ctx.fill();
    }

    /* bursts + motes ---------------------------------------------------- */
    for (var c = bursts.length - 1; c >= 0; c--) {
      var bu = bursts[c];
      bu.r += dt * 78; bu.a -= dt * 1.25;
      if (bu.a <= 0) { bursts.splice(c, 1); continue; }
      ctx.strokeStyle = hexA(bu.c, bu.a);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(bu.x, bu.y, bu.r, 0, 6.2832); ctx.stroke();
    }
    for (var m = motes.length - 1; m >= 0; m--) {
      var mo = motes[m];
      mo.x += mo.vx * dt; mo.y += mo.vy * dt; mo.a -= dt * 1.1;
      if (mo.a <= 0) { motes.splice(m, 1); continue; }
      ctx.fillStyle = 'rgba(190,250,255,' + mo.a * .8 + ')';
      ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.r, 0, 6.2832); ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }


  /* ─────────────────────────────────────────────────────────────────────
     3. Region selection and the detail panel
     ───────────────────────────────────────────────────────────────────── */
  var detail   = $('#detail');
  var listEl   = $('#region-list');
  var tooltip  = $('#tooltip');
  var selected = null;
  var pinned = false;          /* the reader chose a structure mid-run */
  var flashTimers = {};

  function regionById(id) { var r = null; REGIONS.forEach(function (x) { if (x.id === id) r = x; }); return r; }

  function emptyDetail() {
    detail.innerHTML =
      '<div class="d-empty">' +
        '<h3>Pick a structure</h3>' +
        '<p>Click anything on the diagram — or any name in the list above — to read what it does, what goes wrong when it is damaged, and one thing worth remembering.</p>' +
        '<p>Then run an action from the left panel and watch a signal take the route it really takes. Press <kbd>Esc</kbd> to stop a run at any time.</p>' +
        '<p class="muted small">24 structures · 9 pathways · the diagram is schematic, drawn as a mid-sagittal cut with functional areas laid over the surface.</p>' +
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
        r.does.map(function (d) { return '<li>' + d + '</li>'; }).join('') +
      '</ul></div>';
    if (r.damage) {
      html += '<div class="d-sect callout damage"><h4>When it is damaged</h4>' + r.damage + '</div>';
    }
    if (r.fact) {
      html += '<div class="d-sect callout fact"><h4>Worth remembering</h4>' + r.fact + '</div>';
    }
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
    REGIONS.forEach(function (x) { x.el.classList.toggle('selected', !!r && x.id === r.id); });
    listEl.querySelectorAll('.rl-item').forEach(function (b) {
      b.classList.toggle('selected', !!r && b.dataset.id === r.id);
    });
    selected = r ? r.id : null;
    if (!r) { emptyDetail(); return; }
    renderDetail(r);
    if (opts.scroll !== false) {
      var it = listEl.querySelector('.rl-item[data-id="' + r.id + '"]');
      if (it) it.scrollIntoView({ block: 'nearest' });
    }
    if (opts.flash !== false) { flash(r.id, 1100); ringBurst(r.node[0], r.node[1], r.color); exciteNear(r.node[0], r.node[1], 80, .9); }
  }

  function flash(id, ms) {
    var n = NODES[id];
    if (!n || !n.el) return;
    n.el.classList.add('active');
    if (n.labelEl) n.labelEl.classList.add('on');
    clearTimeout(flashTimers[id]);
    flashTimers[id] = setTimeout(function () {
      n.el.classList.remove('active');
      if (n.labelEl) n.labelEl.classList.remove('on');
    }, ms || 1400);
  }

  /* — region list --------------------------------------------------------- */
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
    /* dim non-matching structures on the diagram while searching */
    REGIONS.forEach(function (r) {
      var hit = !q || (r.name + ' ' + r.summary + ' ' + r.does.join(' ')).toLowerCase().indexOf(q) > -1;
      r.el.classList.toggle('dim', !!q && !hit);
    });
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

  /* — diagram interaction ------------------------------------------------- */
  function handlePick(id) {
    if (quiz.on) { quizAnswer(id); return; }
    pinned = !!play;           /* clicking during a run takes the panel over */
    select(id);
  }

  svg.addEventListener('click', function (e) {
    var g = e.target.closest('.region');
    if (g) handlePick(g.dataset.id);
  });
  svg.addEventListener('keydown', function (e) {
    var g = e.target.closest && e.target.closest('.region');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handlePick(g.dataset.id); }
  });
  svg.addEventListener('pointermove', function (e) {
    var g = e.target.closest('.region');
    if (!g) { tooltip.hidden = true; return; }
    var r = regionById(g.dataset.id);
    var box = stage.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.textContent = r.name;
    tooltip.style.left = (e.clientX - box.left) + 'px';
    tooltip.style.top  = (e.clientY - box.top) + 'px';
  });
  svg.addEventListener('pointerleave', function () { tooltip.hidden = true; });

  /* ─────────────────────────────────────────────────────────────────────
     4. Pathway playback
     ───────────────────────────────────────────────────────────────────── */
  var grid      = $('#action-grid');
  var playback  = $('#playback');
  var stepsEl   = $('#steps');
  var pbTitle   = $('#pb-title');
  var current   = null;

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
    current = pw;
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.toggle('is-active', b.dataset.id === pw.id); });
    pinned = false;
    playback.hidden = false;
    pbTitle.classList.remove('done');
    pbTitle.textContent = pw.name;
    stepsEl.innerHTML = pw.steps.map(function (s) {
      var n = NODES[s.to];
      return '<li data-step><b>' + n.name + '</b>' + s.text + '</li>';
    }).join('');
    startPathway(pw);
  }

  function onArrive(i) {
    if (!play) return;
    var step = play.pw.steps[i];
    var node = NODES[step.to];
    ringBurst(node.node[0], node.node[1], node.color || '#7cf3ff');
    exciteNear(node.node[0], node.node[1], 92, 1);
    flash(step.to, 1600);

    var lis = stepsEl.querySelectorAll('li');
    lis.forEach(function (li, k) {
      li.classList.toggle('current', k === i);
      li.classList.toggle('done', k < i);
    });
    if (lis[i]) lis[i].scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });

    if (node.does && !pinned) select(node.id, { flash: false, scroll: false });
  }

  function finishPathway() {
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.remove('is-active'); });
    pbTitle.textContent = play.pw.name + ' \u00b7 complete';
    pbTitle.classList.add('done');
  }

  function stopPathway() {
    setPlayNull();
    pbTitle.classList.remove('done');
    grid.querySelectorAll('.action').forEach(function (b) { b.classList.remove('is-active'); });
    stepsEl.querySelectorAll('li').forEach(function (li) { li.classList.remove('current'); });
  }
  function setPlayNull() { play = null; }

  $('#pb-stop').addEventListener('click', stopPathway);
  $('#pb-replay').addEventListener('click', function () { if (current) runPathway(current); });

  /* ─────────────────────────────────────────────────────────────────────
     5. Quiz mode
     ───────────────────────────────────────────────────────────────────── */
  var quiz = { on: false, pool: [], answer: null, right: 0, asked: 0, saved: null, lock: false };
  var quizbar = $('#quizbar'), quizPrompt = $('#quiz-prompt'), quizScore = $('#quiz-score');
  var btnQuiz = $('#btn-quiz');

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function startQuiz() {
    stopPathway();
    quiz.on = true; quiz.right = 0; quiz.asked = 0; quiz.lock = false;
    quiz.pool = shuffle(REGIONS.filter(function (r) { return !!r.quiz; }));
    quiz.saved = { labels: optLabels.checked, areas: optAreas.checked };
    optLabels.checked = false; optAreas.checked = true;
    applyLabels(); applyAreas();
    quizbar.hidden = false;
    btnQuiz.setAttribute('aria-pressed', 'true');
    btnQuiz.textContent = 'End quiz';
    select(null);
    askQuiz();
  }

  function exitQuiz() {
    if (!quiz.on) return;
    quiz.on = false;
    quizbar.hidden = true;
    quizbar.classList.remove('right', 'wrong');
    btnQuiz.setAttribute('aria-pressed', 'false');
    btnQuiz.textContent = 'Quiz me';
    REGIONS.forEach(function (r) { r.el.classList.remove('quiz-right', 'quiz-wrong'); });
    if (quiz.saved) {
      optLabels.checked = quiz.saved.labels; optAreas.checked = quiz.saved.areas;
      applyLabels(); applyAreas();
    }
    if (quiz.asked) {
      detail.innerHTML =
        '<div class="d-empty"><h3>' + quiz.right + ' / ' + quiz.asked + '</h3>' +
        '<p>' + (quiz.right / Math.max(quiz.asked, 1) >= .8
            ? 'Strong. You could teach this section.'
            : quiz.right / Math.max(quiz.asked, 1) >= .5
              ? 'Solid base — the deep structures are usually what slips.'
              : 'Worth another pass through the atlas before the next round.') +
        '</p><p class="muted small">Press <kbd>Quiz me</kbd> to run it again, or click a structure to go back to reading.</p></div>';
    }
  }

  function askQuiz() {
    quizbar.classList.remove('right', 'wrong');
    REGIONS.forEach(function (r) { r.el.classList.remove('quiz-right', 'quiz-wrong'); });
    if (!quiz.pool.length) { exitQuiz(); return; }
    quiz.answer = quiz.pool.pop();
    quizPrompt.textContent = quiz.answer.quiz;
    quizScore.textContent = quiz.right + ' / ' + quiz.asked;
    quiz.lock = false;
  }

  function quizAnswer(id) {
    if (quiz.lock) return;
    quiz.lock = true; quiz.asked++;
    var correct = id === quiz.answer.id;
    if (correct) quiz.right++;
    var target = regionById(quiz.answer.id);
    target.el.classList.add('quiz-right');
    if (!correct) {
      var got = regionById(id);
      if (got) got.el.classList.add('quiz-wrong');
    }
    quizbar.classList.add(correct ? 'right' : 'wrong');
    quizPrompt.textContent = (correct ? '✓ ' : '✗ ') + target.name +
      (correct ? '' : ' — that is the one highlighted.');
    quizScore.textContent = quiz.right + ' / ' + quiz.asked;
    ringBurst(target.node[0], target.node[1], correct ? target.color : '#ff5470');
    exciteNear(target.node[0], target.node[1], 90, 1);
    setTimeout(askQuiz, correct ? 900 : 1900);
  }

  btnQuiz.addEventListener('click', function () { quiz.on ? exitQuiz() : startQuiz(); });
  $('#quiz-skip').addEventListener('click', function () { if (!quiz.lock) { quiz.asked++; } askQuiz(); });
  $('#quiz-exit').addEventListener('click', exitQuiz);

  /* ─────────────────────────────────────────────────────────────────────
     6. Guided tour
     ───────────────────────────────────────────────────────────────────── */
  var tour = { on: false, i: 0 };
  var btnTour = $('#btn-tour');
  function tourStep() {
    if (tour.i >= D.TOUR.length) { endTour(); return; }
    select(D.TOUR[tour.i]);
    tour.i++;
    btnTour.textContent = tour.i >= D.TOUR.length ? 'Finish tour' : 'Next · ' + (tour.i + 1) + '/' + D.TOUR.length;
  }
  function endTour() { tour.on = false; tour.i = 0; btnTour.textContent = 'Guided tour'; }
  btnTour.addEventListener('click', function () {
    if (quiz.on) exitQuiz();
    if (!tour.on) { tour.on = true; tour.i = 0; }
    tourStep();
  });

  /* ─────────────────────────────────────────────────────────────────────
     7. Toggles, modal, keyboard
     ───────────────────────────────────────────────────────────────────── */
  var optLabels = $('#opt-labels'), optAreas = $('#opt-areas'), optNeurons = $('#opt-neurons');
  function applyLabels() { gLabels.style.opacity = optLabels.checked ? 1 : 0; }
  function applyAreas() {
    gAreas.classList.toggle('areas-hidden', !optAreas.checked);
    gLabels.querySelectorAll('.area-label').forEach(function (el) {
      el.style.display = optAreas.checked ? '' : 'none';
    });
  }
  optLabels.addEventListener('change', applyLabels);
  optAreas.addEventListener('change', applyAreas);
  optNeurons.addEventListener('change', function () { showNeurons = optNeurons.checked; });

  var modal = $('#help-modal');
  $('#btn-help').addEventListener('click', function () { modal.hidden = false; });
  $('#help-close').addEventListener('click', function () { modal.hidden = true; });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) { modal.hidden = true; return; }
    if (quiz.on) { exitQuiz(); return; }
    if (tour.on) { endTour(); return; }
    if (play) stopPathway();
  });

  /* Legend strip beneath the diagram. */
  var LEGEND = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'pons', 'thalamus', 'hippocampus'];
  var legend = $('#legend');
  legend.innerHTML =
    LEGEND.map(function (id) {
      var r = regionById(id);
      return '<button class="lg-chip" data-id="' + id + '" type="button">' +
        '<span class="swatch" style="background:' + r.color + ';color:' + r.color + '"></span>' + r.name + '</button>';
    }).join('') +
    '<span class="lg-note">Deep structures are drawn as though the hemisphere were cut down the midline. ' +
    'Hover anything to name it; click to read it.</span>';
  legend.addEventListener('click', function (e) {
    var b = e.target.closest('.lg-chip');
    if (b) { pinned = !!play; select(b.dataset.id); }
  });

  /* ─────────────────────────────────────────────────────────────────────
     8. Boot
     ───────────────────────────────────────────────────────────────────── */
  function init() {
    if (window.matchMedia('(max-width: 720px)').matches) optLabels.checked = false;
    resize();
    seedNeurons();
    buildList('');
    emptyDetail();
    applyLabels(); applyAreas();
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
  window.addEventListener('load', function () { resize(); if (!neurons.length) seedNeurons(); });
})();
