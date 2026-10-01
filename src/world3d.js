import * as THREE from "three";

/*
  UNO 3D world.
  - Renders a living planet, a thick felt table, clouds, props and particles
    behind the DOM UI.
  - Never owns gameplay. It only OBSERVES the DOM (active screen, discard
    changes, active colour, results) and fits its camera to layout regions
    (.center-zone, #heroStage), so CSS stays the layout authority.
*/

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const SUIT = {
  red: "#ff3b30",
  yellow: "#ffc928",
  green: "#2fcf55",
  blue: "#1b8cff",
  wild: "#8b5cf6",
};

/* ---------- deterministic randomness + noise ---------- */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lattice(x, y, z) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, c) => lattice(xi + a, yi + b, zi + c);
  const x00 = l(0, 0, 0) * (1 - u) + l(1, 0, 0) * u;
  const x10 = l(0, 1, 0) * (1 - u) + l(1, 1, 0) * u;
  const x01 = l(0, 0, 1) * (1 - u) + l(1, 0, 1) * u;
  const x11 = l(0, 1, 1) * (1 - u) + l(1, 1, 1) * u;
  const y0 = x00 * (1 - v) + x10 * v;
  const y1 = x01 * (1 - v) + x11 * v;
  return y0 * (1 - w) + y1 * w;
}

/* ---------- canvas texture helpers ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function cardFaceTexture(color, label) {
  return canvasTex(256, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    roundRectPath(g, 6, 6, w - 12, h - 12, 34);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, -0.22));
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.42);
    g.beginPath();
    g.ellipse(0, 0, w * 0.43, h * 0.27, 0, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.restore();
    g.font = "italic 900 150px 'Baloo 2', 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 14;
    g.strokeStyle = "rgba(0,0,0,.35)";
    g.strokeText(label, w / 2 + 4, h / 2 + 10);
    g.fillStyle = color;
    g.fillText(label, w / 2, h / 2 + 6);
    g.font = "900 44px 'Baloo 2', 'Arial Black', sans-serif";
    g.fillStyle = "#fff";
    g.strokeStyle = "rgba(0,0,0,.4)";
    g.lineWidth = 6;
    g.strokeText(label, 46, 54);
    g.fillText(label, 46, 54);
    g.save();
    g.translate(w - 46, h - 54);
    g.rotate(Math.PI);
    g.strokeText(label, 0, 0);
    g.fillText(label, 0, 0);
    g.restore();
  });
}

function cardBackTexture() {
  return canvasTex(256, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    roundRectPath(g, 6, 6, w - 12, h - 12, 34);
    g.fillStyle = "#15151b";
    g.fill();
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.42);
    g.beginPath();
    g.ellipse(0, 0, w * 0.43, h * 0.27, 0, 0, Math.PI * 2);
    g.fillStyle = "#ff2f2f";
    g.fill();
    g.restore();
    g.font = "italic 900 92px 'Baloo 2', 'Arial Black', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 10;
    g.strokeStyle = "#7d0b0b";
    g.strokeText("UNO", w / 2, h / 2 + 4);
    g.fillStyle = "#fff";
    g.fillText("UNO", w / 2, h / 2);
  });
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l + amt, 0, 1));
  return "#" + c.getHexString();
}

function feltTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2);
    r.addColorStop(0, "#43d49a");
    r.addColorStop(0.55, "#1fa377");
    r.addColorStop(1, "#0f7358");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
    const rand = rng(7);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
      g.fillRect(rand() * w, rand() * h, 2, 2);
    }
    g.lineWidth = 7;
    g.strokeStyle = "rgba(255,255,255,.22)";
    g.setLineDash([26, 22]);
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.385, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "rgba(255,255,255,.1)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.27, 0, Math.PI * 2);
    g.stroke();
  });
}

function softDisc(inner, outer) {
  return canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, inner);
    r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

function starTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.fillStyle = "#fff";
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? 11 : 28;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  });
}

function gradientSky() {
  return canvasTex(8, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#2f9cf0");
    grad.addColorStop(0.42, "#6cc8ff");
    grad.addColorStop(0.78, "#bdeeff");
    grad.addColorStop(1, "#effcff");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/* ---------- original low-poly characters (no licensed art) ---------- */
const SKINS = ["#ffd2a8", "#f2b184", "#c98a5e", "#8f5a3a"];
const SPECIES = ["cat", "bear", "bunny", "kid", "alien", "fox"];
const PLATES = {
  you: ["#58b4ff", "#1c6fd6"],
  cpu: ["#ffb347", "#ff6a2b"],
  other: ["#b58cff", "#6a3fe0"],
};

function std(color, rough = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
}

function ball(r, color, sx = 1, sy = 1, sz = 1, rough) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), std(color, rough));
  m.scale.set(sx, sy, sz);
  return m;
}

function makeCharacter(kind, seed) {
  const rand = rng(hashStr(seed + kind));
  const g = new THREE.Group();
  let species;
  if (kind === "cpu") species = "robot";
  else if (kind === "you") species = "kid";
  else species = SPECIES[Math.floor(rand() * SPECIES.length)];
  const palette = {
    cat: "#ffa64a", bear: "#b97a45", bunny: "#f4f1ff", kid: SKINS[Math.floor(rand() * 2)],
    alien: "#7ee05a", fox: "#ff7a2f", robot: "#d5dde8",
  };
  const skin = species === "kid" && kind !== "you" ? SKINS[Math.floor(rand() * SKINS.length)] : palette[species];
  const shirtHues = ["#ff4d6d", "#ffcc29", "#2fcf55", "#1b8cff", "#ff8a1f", "#a259ff"];
  const shirt = kind === "you" ? "#1b8cff" : shirtHues[Math.floor(rand() * shirtHues.length)];

  const body = ball(1.15, shirt, 1.12, 0.78, 0.8, 0.6);
  body.position.set(0, -1.42, 0);
  g.add(body);
  const collar = ball(0.55, "#fff", 1.1, 0.34, 0.9, 0.7);
  collar.position.set(0, -0.92, 0.12);
  g.add(collar);

  const head = new THREE.Group();
  const isRobot = species === "robot";
  const skull = isRobot
    ? new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.45, 1.4, 4, 4, 4), std(skin, 0.3))
    : ball(1, skin, 1.06, 0.95, 0.98, 0.6);
  if (isRobot) {
    skull.geometry.computeBoundingBox();
    const pos = skull.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize().multiplyScalar(0.98);
      v.lerp(n.multiplyScalar(1.12), 0.35);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    skull.geometry.computeVertexNormals();
  }
  head.add(skull);

  const outline = skull.clone();
  outline.material = new THREE.MeshBasicMaterial({ color: "#241a33", side: THREE.BackSide });
  outline.scale.multiplyScalar(1.045);
  head.add(outline);

  const inner = "#ff8fa6";
  const addEar = (x, kindEar) => {
    if (kindEar === "cone") {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.78, 20), std(skin));
      ear.position.set(x * 0.62, 0.92, 0);
      ear.rotation.z = -x * 0.32;
      head.add(ear);
      const lining = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 20), std(inner));
      lining.position.set(x * 0.62, 0.88, 0.1);
      lining.rotation.z = -x * 0.32;
      head.add(lining);
    } else if (kindEar === "round") {
      const ear = ball(0.38, skin);
      ear.position.set(x * 0.78, 0.78, 0);
      head.add(ear);
      const lining = ball(0.22, inner, 1, 1, 0.5);
      lining.position.set(x * 0.78, 0.78, 0.26);
      head.add(lining);
    } else if (kindEar === "long") {
      const ear = ball(0.3, skin, 0.8, 2.3, 0.6);
      ear.position.set(x * 0.46, 1.5, -0.05);
      ear.rotation.z = -x * 0.16;
      head.add(ear);
      const lining = ball(0.17, inner, 0.7, 1.9, 0.4);
      lining.position.set(x * 0.46, 1.5, 0.08);
      lining.rotation.z = -x * 0.16;
      head.add(lining);
    }
  };
  if (species === "cat" || species === "fox") { addEar(-1, "cone"); addEar(1, "cone"); }
  if (species === "bear") { addEar(-1, "round"); addEar(1, "round"); }
  if (species === "bunny") { addEar(-1, "long"); addEar(1, "long"); }
  if (species === "alien") {
    [-1, 1].forEach((x) => {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), std("#3b9a2a"));
      stalk.position.set(x * 0.45, 1.25, 0);
      stalk.rotation.z = -x * 0.35;
      head.add(stalk);
      const tip = ball(0.17, "#ffe14a");
      tip.position.set(x * 0.64, 1.58, 0);
      head.add(tip);
    });
  }
  if (isRobot) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), std("#8a96a8"));
    stalk.position.set(0, 1.05, 0);
    head.add(stalk);
    const tip = ball(0.2, "#ff4d3a", 1, 1, 1, 0.3);
    tip.position.set(0, 1.42, 0);
    head.add(tip);
    [-1, 1].forEach((x) => {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 16), std("#8a96a8", 0.3));
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(x * 1.0, 0, 0);
      head.add(bolt);
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.72, 0.14), std("#15202e", 0.2));
    visor.position.set(0, 0.08, 0.97);
    head.add(visor);
  }
  if (species === "fox") {
    const muzzle = ball(0.5, "#fff3e2", 1.1, 0.7, 0.7);
    muzzle.position.set(0, -0.32, 0.78);
    head.add(muzzle);
  }
  if (species === "bear" || species === "cat" || species === "bunny") {
    const muzzle = ball(0.42, species === "bear" ? "#e9c79b" : "#fff6ea", 1.1, 0.72, 0.7);
    muzzle.position.set(0, -0.3, 0.8);
    head.add(muzzle);
  }
  if (species === "kid") {
    const capColor = kind === "you" ? "#ff3b30" : shirtHues[Math.floor(rand() * shirtHues.length)];
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.04, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.46),
      std(capColor, 0.45)
    );
    dome.position.y = 0.12;
    head.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 32, 1, false, -0.2, Math.PI * 1.4 - 0.5), std(shade(capColor, -0.12), 0.45));
    brim.scale.set(1, 1, 1.1);
    brim.position.set(0, 0.28, 0.62);
    brim.rotation.y = Math.PI / 2 - 0.35;
    head.add(brim);
    const button = ball(0.1, "#fff");
    button.position.set(0, 1.1, 0);
    head.add(button);
  }

  const eyeY = isRobot ? 0.1 : 0.14;
  if (isRobot) {
    [-1, 1].forEach((x) => {
      const eye = ball(0.2, "#5cf2ff", 1, 1, 0.5, 0.2);
      eye.material.emissive = new THREE.Color("#25c9ff");
      eye.material.emissiveIntensity = 0.9;
      eye.position.set(x * 0.38, eyeY, 1.08);
      head.add(eye);
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 24, Math.PI), std("#5cf2ff", 0.2));
    smile.material.emissive = new THREE.Color("#25c9ff");
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.22, 1.08);
    head.add(smile);
  } else {
    [-1, 1].forEach((x) => {
      const white = ball(0.27, "#fff", 0.92, 1.12, 0.55, 0.3);
      white.position.set(x * 0.38, eyeY, 0.88);
      head.add(white);
      const pupil = ball(0.15, "#1d1230", 1, 1.05, 0.6, 0.2);
      pupil.position.set(x * 0.38 + 0.02, eyeY - 0.02, 1.0);
      head.add(pupil);
      const shine = ball(0.055, "#fff", 1, 1, 1, 0.1);
      shine.position.set(x * 0.38 + 0.08, eyeY + 0.07, 1.07);
      head.add(shine);
      const cheek = ball(0.2, "#ff7d9b", 1.2, 0.7, 0.4, 0.9);
      cheek.position.set(x * 0.68, -0.18, 0.74);
      cheek.rotation.y = x * 0.55;
      head.add(cheek);
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24, Math.PI), std("#3a1620", 0.5));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.34, species === "alien" ? 0.9 : 0.97);
    head.add(smile);
    const nose = ball(0.09, species === "kid" ? "#e59a74" : "#2a1a22", 1.2, 0.8, 0.8, 0.4);
    nose.position.set(0, -0.12, 1.0);
    head.add(nose);
    if (species === "kid" && kind !== "you") {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(1.02, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.42),
        std(["#3b2314", "#1c1c24", "#c8602a", "#f0c24b"][Math.floor(rand() * 4)], 0.7)
      );
      hair.position.y = 0.1;
      head.add(hair);
    }
  }
  g.add(head);
  return g;
}

/* =====================================================================
   World
   ===================================================================== */
function start() {
  const canvas = $("world3d");
  if (!canvas) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    return null;
  }
  const DPR_CAP = window.innerWidth < 700 ? 2 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = gradientSky();
  scene.fog = new THREE.Fog("#cdf1ff", 26, 78);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const fitCam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight("#d7f0ff", "#6fbf48", 1.25));
  const sun = new THREE.DirectionalLight("#fff1cf", 2.1);
  sun.position.set(6, 12, 8);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#9fd8ff", 0.7);
  rim.position.set(-8, 5, -6);
  scene.add(rim);

  /* ----- planet ----- */
  const R = 15;
  const TABLE_Y = 0.52;
  const heightAt = (nx, ny, nz) => {
    const polar = Math.acos(clamp(ny, -1, 1));
    const flat = smooth(0.3, 0.8, polar);
    return ((vnoise(nx * 3.1 + 5, ny * 3.1, nz * 3.1) - 0.5) * 1.5 + (vnoise(nx * 9, ny * 9 + 3, nz * 9) - 0.5) * 0.25) * flat;
  };
  const planet = new THREE.Group();
  planet.position.y = -R;
  scene.add(planet);
  {
    const geo = new THREE.SphereGeometry(R, 160, 110);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cDark = new THREE.Color("#3cb52c");
    const cMid = new THREE.Color("#69d83f");
    const cLight = new THREE.Color("#a6f35f");
    const cSand = new THREE.Color("#e9d27a");
    const tmp = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const polar = Math.acos(clamp(v.y, -1, 1));
      const h = heightAt(v.x, v.y, v.z);
      v.multiplyScalar(R + h);
      pos.setXYZ(i, v.x, v.y, v.z);
      const n1 = vnoise(v.x * 0.22 + 9, v.y * 0.22, v.z * 0.22);
      const n2 = vnoise(v.x * 0.9, v.y * 0.9 + 4, v.z * 0.9);
      const t = clamp(n1 * 1.1 + (n2 - 0.5) * 0.35, 0, 1);
      tmp.copy(cDark).lerp(cMid, smooth(0.25, 0.6, t)).lerp(cLight, smooth(0.62, 0.95, t));
      tmp.lerp(cLight, (1 - smooth(0.12, 0.4, polar)) * 0.55);
      const ring = smooth(0.2, 0.26, polar) * (1 - smooth(0.27, 0.34, polar));
      tmp.lerp(cSand, ring * 0.55);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    planet.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })));
  }

  const placeOnPlanet = (mesh, polar, az, lift = 0, scale = 1, yaw = 0) => {
    const nx = Math.sin(polar) * Math.cos(az), ny = Math.cos(polar), nz = Math.sin(polar) * Math.sin(az);
    const h = heightAt(nx, ny, nz) + lift;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(nx * (R + h), ny * (R + h), nz * (R + h)),
      q,
      new THREE.Vector3(scale, scale, scale)
    );
    return m;
  };

  const scatter = (count, minR, maxR, seed, fn) => {
    const rand = rng(seed);
    for (let i = 0; i < count; i++) {
      const rad = Math.sqrt(minR * minR + rand() * (maxR * maxR - minR * minR));
      const polar = rad / R;
      const az = rand() * Math.PI * 2;
      fn(i, polar, az, rand);
    }
  };

  const instanced = (geometry, material, count) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    planet.add(mesh);
    return mesh;
  };

  {
    const TREES = 120;
    const trunks = instanced(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 7), std("#7a4a24"), TREES);
    const lowCone = instanced(new THREE.ConeGeometry(0.46, 0.8, 9), std("#fff", 0.7), TREES);
    const topCone = instanced(new THREE.ConeGeometry(0.34, 0.66, 9), std("#fff", 0.7), TREES);
    const palette = ["#1f9e3a", "#2fbf4a", "#14803a", "#58c93a", "#e8a21a", "#ff7a3d"].map((c) => new THREE.Color(c));
    scatter(TREES, 3.4, 15.5, 11, (i, polar, az, rand) => {
      const sc = 0.8 + rand() * 1.1;
      const yaw = rand() * 6.28;
      const base = placeOnPlanet(null, polar, az, 0, sc, yaw);
      const local = (y) => base.clone().multiply(new THREE.Matrix4().makeTranslation(0, y, 0));
      trunks.setMatrixAt(i, local(0.18));
      lowCone.setMatrixAt(i, local(0.7));
      topCone.setMatrixAt(i, local(1.15));
      const col = palette[Math.floor(rand() * palette.length)];
      lowCone.setColorAt(i, col);
      topCone.setColorAt(i, col.clone().offsetHSL(0, 0, 0.05));
    });
    const BUSHES = 90;
    const bushes = instanced(new THREE.IcosahedronGeometry(0.4, 1), std("#fff", 0.8), BUSHES);
    scatter(BUSHES, 3.3, 15.5, 23, (i, polar, az, rand) => {
      bushes.setMatrixAt(i, placeOnPlanet(null, polar, az, 0.12, 0.5 + rand() * 0.8, rand() * 6));
      bushes.setColorAt(i, palette[Math.floor(rand() * 4)].clone().offsetHSL(0, 0, 0.04));
    });
    const FLOWERS = 220;
    const flowers = instanced(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), FLOWERS);
    const flowerCols = ["#ff5c8a", "#ffd23a", "#ffffff", "#ff8a3a", "#b07bff"].map((c) => new THREE.Color(c));
    scatter(FLOWERS, 3.1, 14, 31, (i, polar, az, rand) => {
      flowers.setMatrixAt(i, placeOnPlanet(null, polar, az, 0.07, 0.8 + rand() * 0.8, 0));
      flowers.setColorAt(i, flowerCols[Math.floor(rand() * flowerCols.length)]);
    });
    const ROCKS = 26;
    const rocks = instanced(new THREE.DodecahedronGeometry(0.3, 0), std("#c3ccd6", 0.9), ROCKS);
    scatter(ROCKS, 3.4, 14, 47, (i, polar, az, rand) => {
      rocks.setMatrixAt(i, placeOnPlanet(null, polar, az, 0.05, 0.6 + rand() * 1.2, rand() * 6));
    });
    const SHROOMS = 28;
    const capGeo = new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const caps = instanced(capGeo, std("#ff3b30", 0.5), SHROOMS);
    const stems = instanced(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8), std("#fff6e6"), SHROOMS);
    scatter(SHROOMS, 3.4, 13, 59, (i, polar, az, rand) => {
      const sc = 0.9 + rand() * 0.9;
      const base = placeOnPlanet(null, polar, az, 0, sc, rand() * 6);
      stems.setMatrixAt(i, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.1, 0)));
      caps.setMatrixAt(i, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0)));
    });
    [trunks, lowCone, topCone, bushes, flowers, rocks, caps, stems].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  /* ----- table ----- */
  const Rt = 2.7;
  const table = new THREE.Group();
  scene.add(table);
  const tableShadow = new THREE.Mesh(
    new THREE.CircleGeometry(Rt * 1.55, 48),
    new THREE.MeshBasicMaterial({ map: softDisc("rgba(10,60,20,.55)", "rgba(10,60,20,0)"), transparent: true, depthWrite: false })
  );
  tableShadow.rotation.x = -Math.PI / 2;
  tableShadow.position.set(0.25, 0.03, 0.35);
  table.add(tableShadow);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(Rt + 0.22, Rt + 0.34, TABLE_Y + 0.12, 72), std("#7b4a1f", 0.55));
  base.position.y = (TABLE_Y - 0.12) / 2;
  table.add(base);
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(Rt + 0.06, 0.2, 20, 120), std("#e6a548", 0.32));
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = TABLE_Y;
  table.add(rimMesh);
  const rimInner = new THREE.Mesh(new THREE.TorusGeometry(Rt - 0.1, 0.07, 12, 120), std("#fff0b8", 0.3));
  rimInner.rotation.x = Math.PI / 2;
  rimInner.position.y = TABLE_Y + 0.02;
  table.add(rimInner);
  const felt = new THREE.Mesh(new THREE.CircleGeometry(Rt - 0.02, 96), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = TABLE_Y + 0.01;
  table.add(felt);
  const glowMat = new THREE.MeshBasicMaterial({ color: SUIT.red, transparent: true, opacity: 0.95 });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(Rt * 0.84, 0.045, 10, 120), glowMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = TABLE_Y + 0.05;
  table.add(glowRing);
  const glowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ map: softDisc("rgba(255,255,255,.9)", "rgba(255,255,255,0)"), color: SUIT.red, transparent: true, opacity: 0.55, depthWrite: false })
  );
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = TABLE_Y + 0.03;
  table.add(glowDisc);

  const deckSlab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
    std("#e7e7ee", 0.5), std("#e7e7ee", 0.5), std("#1a1a22", 0.5), std("#1a1a22", 0.5), std("#e7e7ee", 0.5), std("#e7e7ee", 0.5),
  ]);
  table.add(deckSlab);
  const deckShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: softDisc("rgba(0,30,20,.6)", "rgba(0,30,20,0)"), transparent: true, depthWrite: false })
  );
  deckShadow.rotation.x = -Math.PI / 2;
  table.add(deckShadow);
  const discardShadow = deckShadow.clone();
  table.add(discardShadow);

  /* ----- clouds + islands ----- */
  const clouds = [];
  {
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#cfe9ff", emissiveIntensity: 0.42, fog: true });
    const rand = rng(91);
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(puff, cloudMat);
        const s = 0.8 + rand() * 1.1;
        m.scale.set(s * 1.3, s * 0.85, s);
        m.position.set((j - n / 2) * 1.0 + rand() * 0.4, rand() * 0.5, rand() * 0.6);
        c.add(m);
      }
      const ang = rand() * Math.PI * 2;
      const dist = 12 + rand() * 24;
      c.position.set(Math.cos(ang) * dist, 2.5 + rand() * 9, -Math.abs(Math.sin(ang)) * dist - 5);
      const sc = 0.9 + rand() * 1.3;
      c.scale.setScalar(sc);
      c.userData.speed = 0.15 + rand() * 0.25;
      c.userData.wrap = 38;
      scene.add(c);
      clouds.push(c);
    }
  }
  const islands = [];
  {
    const rand = rng(133);
    const spots = [[-9, 4.8, -6], [10, 6.2, -9], [-14, 8.5, -16], [15, 3.6, -3.5]];
    spots.forEach(([x, y, z], idx) => {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.7, 0.5, 20), std("#6fe04a", 0.8));
      const soil = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 14), std("#8a5a30", 0.9));
      soil.rotation.x = Math.PI;
      soil.position.y = -1.35;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 7), std("#7a4a24"));
      trunk.position.set(0.4, 0.6, 0);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.2, 9), std(idx % 2 ? "#ff8a3d" : "#2fbf4a", 0.7));
      crown.position.set(0.4, 1.4, 0);
      g.add(top, soil, trunk, crown);
      g.position.set(x, y, z);
      g.userData.base = y;
      g.userData.phase = rand() * 6;
      scene.add(g);
      islands.push(g);
    });
  }

  /* ----- hero: floating cards for the home screen ----- */
  const hero = new THREE.Group();
  hero.position.set(0, 3.1, 0);
  scene.add(hero);
  const heroCards = [];
  {
    const shape = new THREE.Shape();
    const w = 1.32, h = 1.98, r = 0.2;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0);
    shape.lineTo(w / 2, h / 2 - r);
    shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 14 });
    body.translate(0, 0, -0.03);
    const bodyMat = std("#ffffff", 0.35);
    const planeGeo = new THREE.PlaneGeometry(w - 0.05, h - 0.05);
    const faces = [
      ["red", "7"], ["yellow", "9"], ["wild", "★"], ["green", "5"], ["blue", "2"],
    ];
    const backTex = cardBackTexture();
    faces.forEach(([suit, label], i) => {
      const pivot = new THREE.Group();
      const card = new THREE.Group();
      card.add(new THREE.Mesh(body, bodyMat));
      const front = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: cardFaceTexture(SUIT[suit], label), transparent: true, alphaTest: 0.4, roughness: 0.35 }));
      front.position.z = 0.056;
      const back = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: backTex, transparent: true, alphaTest: 0.4, roughness: 0.35 }));
      back.position.z = -0.056;
      back.rotation.y = Math.PI;
      card.add(front, back);
      card.position.y = 1.1;
      pivot.add(card);
      pivot.userData.spread = (i - 2) * 0.36;
      pivot.userData.phase = i * 0.9;
      pivot.position.z = i * 0.03;
      hero.add(pivot);
      heroCards.push(pivot);
    });
  }

  /* ----- particles ----- */
  const MAX_P = 160;
  const pGeo = new THREE.PlaneGeometry(1, 1);
  const pMat = new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, depthWrite: false, fog: false });
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_P);
  pMesh.frustumCulled = false;
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.setColorAt(0, new THREE.Color("#fff"));
  scene.add(pMesh);
  const parts = Array.from({ length: MAX_P }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.2, spin: 0, rot: 0 }));
  let pCursor = 0;
  const hideMat = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_P; i++) pMesh.setMatrixAt(i, hideMat);

  const spawn = (pos, color, opts = {}) => {
    const q = parts[pCursor];
    pCursor = (pCursor + 1) % MAX_P;
    const sp = opts.speed ?? 3;
    q.p.copy(pos);
    q.v.set((Math.random() - 0.5) * sp, (opts.up ?? 3) * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * sp);
    q.max = q.life = (opts.life ?? 1.1) * (0.7 + Math.random() * 0.6);
    q.s = (opts.size ?? 0.3) * (0.6 + Math.random() * 0.8);
    q.spin = (Math.random() - 0.5) * 8;
    q.rot = Math.random() * 6;
    pMesh.setColorAt(parts.indexOf(q), color);
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  };

  const confettiCols = ["#ff3b30", "#ffc928", "#35d85b", "#168cff", "#ff7ac8", "#ffffff"].map((c) => new THREE.Color(c));
  const burst = (pos, color, count = 28, opts = {}) => {
    if (REDUCED) return;
    const col = color ? new THREE.Color(color) : null;
    for (let i = 0; i < count; i++) spawn(pos, col || confettiCols[i % confettiCols.length], opts);
  };

  /* ----- layout-driven camera ----- */
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const flat = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_Y);
  const hit = new THREE.Vector3();
  let W = 1, H = 1;

  const poseCamera = (cam, pose) => {
    const cp = Math.cos(pose.pitch);
    cam.position.set(
      pose.target.x + Math.sin(pose.yaw) * cp * pose.dist,
      pose.target.y + Math.sin(pose.pitch) * pose.dist,
      pose.target.z + Math.cos(pose.yaw) * cp * pose.dist
    );
    cam.lookAt(pose.target);
    cam.updateMatrixWorld(true);
  };

  const tablePoints = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    tablePoints.push(new THREE.Vector3(Math.cos(a) * (Rt + 0.3), TABLE_Y, Math.sin(a) * (Rt + 0.3)));
  }
  const heroPoints = [];
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => heroPoints.push(new THREE.Vector3(2.2 * sx, 3.1 + 1.55 * sy, 0.5 * sz)))));

  const fit = (points, rect, pitch, yaw, target, pad = 1) => {
    fitCam.aspect = W / H;
    fitCam.clearViewOffset();
    fitCam.updateProjectionMatrix();
    let dist = 12;
    const v = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      poseCamera(fitCam, { target, pitch, yaw, dist });
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of points) {
        v.copy(p).project(fitCam);
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      const s = Math.min((rect.w * pad) / Math.max(maxX - minX, 1), (rect.h * pad) / Math.max(maxY - minY, 1));
      dist = clamp(dist / s, 3, 60);
    }
    poseCamera(fitCam, { target, pitch, yaw, dist });
    const v2 = target.clone().project(fitCam);
    const tx = (v2.x * 0.5 + 0.5) * W, ty = (-v2.y * 0.5 + 0.5) * H;
    return { target: target.clone(), pitch, yaw, dist, ox: rect.cx - tx, oy: rect.cy - ty };
  };

  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const activeScreen = () => document.querySelector(".screen.active");
  let mode = "home";
  let wanted = null;
  let cur = null;
  const goalPose = () => {
    const screen = activeScreen();
    const id = screen ? screen.id : "home";
    mode = id === "game" || id === "roomScreen" ? "table" : "home";
    document.documentElement.dataset.world = mode;
    if (mode === "table") {
      const zone = screen.querySelector(".center-zone");
      const r = rectOf(zone) || { w: W * 0.9, h: H * 0.38, cx: W / 2, cy: H * 0.46, x: 0, y: 0 };
      const compact = W > H;
      const fitRect = { w: r.w, h: r.h, cx: r.cx, cy: r.cy };
      return fit(tablePoints, fitRect, compact ? 0.78 : 0.88, 0, new THREE.Vector3(0, TABLE_Y, 0), 1.0);
    }
    const stage = rectOf($("heroStage"));
    const r = stage || { w: W * 0.8, h: H * 0.22, cx: W / 2, cy: H * 0.14, x: 0, y: 0 };
    return fit(heroPoints, r, 0.2, 0, new THREE.Vector3(0, 3.1, 0), 1.0);
  };

  const refit = (snap) => {
    wanted = goalPose();
    if (!cur || snap || REDUCED) cur = { ...wanted, target: wanted.target.clone() };
  };

  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W > H ? 36 : 42;
    fitCam.fov = camera.fov;
    camera.updateProjectionMatrix();
    refit(true);
  };

  const toWorld = (px, py, planeY = TABLE_Y) => {
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    flat.constant = -planeY;
    return ray.ray.intersectPlane(flat, hit) ? hit.clone() : null;
  };

  const syncTableProps = () => {
    const screen = activeScreen();
    const live = screen && (screen.id === "game" || screen.id === "roomScreen");
    const draw = live ? screen.querySelector(".draw-pile") : null;
    const discard = live ? screen.querySelector(".discard") : null;
    const dr = rectOf(draw), cr = rectOf(discard);
    deckSlab.visible = deckShadow.visible = !!dr;
    discardShadow.visible = glowDisc.visible = !!cr;
    if (dr) {
      const a = toWorld(dr.x, dr.cy), b = toWorld(dr.x + dr.w, dr.cy), c = toWorld(dr.cx, dr.y), d = toWorld(dr.cx, dr.y + dr.h);
      if (a && b && c && d) {
        const countEl = screen.querySelector("#drawCount, #mpDrawCount");
        const n = countEl ? parseInt(countEl.textContent, 10) || 0 : 30;
        const thick = clamp(0.1 + n * 0.008, 0.12, 0.62);
        const wd = Math.abs(b.x - a.x), dp = Math.abs(d.z - c.z);
        deckSlab.scale.set(wd * 0.98, thick, dp * 0.98);
        deckSlab.position.set((a.x + b.x) / 2, TABLE_Y + thick / 2, (c.z + d.z) / 2);
        deckShadow.scale.set(wd * 1.7, dp * 1.5, 1);
        deckShadow.position.set((a.x + b.x) / 2 + 0.12, TABLE_Y + 0.02, (c.z + d.z) / 2 + 0.2);
      }
    }
    if (cr) {
      const p = toWorld(cr.cx, cr.cy);
      const a = toWorld(cr.x, cr.cy), b = toWorld(cr.x + cr.w, cr.cy);
      if (p && a && b) {
        const wd = Math.abs(b.x - a.x);
        discardShadow.scale.set(wd * 1.5, wd * 1.8, 1);
        discardShadow.position.set(p.x + 0.1, TABLE_Y + 0.02, p.z + 0.15);
        glowDisc.scale.setScalar(wd * 1.35);
        glowDisc.position.set(p.x, TABLE_Y + 0.03, p.z);
        discardWorld.copy(p);
      }
    }
  };
  const discardWorld = new THREE.Vector3(0, TABLE_Y, 0);

  /* ----- state tinted by the game ----- */
  let activeColor = "red";
  const tint = new THREE.Color(SUIT.red);
  const tintGoal = new THREE.Color(SUIT.red);
  const setColor = (name) => {
    if (!SUIT[name]) return;
    activeColor = name;
    tintGoal.set(SUIT[name]);
  };

  /* ----- observers: the world reads the DOM, it never drives it ----- */
  const readColor = () => {
    const ring = document.querySelector("#colorRing.show, #mpColorRing.show");
    if (ring) for (const k of ["red", "yellow", "green", "blue"]) if (ring.classList.contains(k)) return setColor(k);
    const t = document.querySelector(".table.table-ring");
    if (t) for (const k of ["red", "yellow", "green", "blue"]) if (t.classList.contains(k)) setColor(k);
  };

  const topSuit = (pile) => {
    const c = pile && pile.lastElementChild;
    if (!c) return null;
    for (const k of ["red", "yellow", "green", "blue", "wild"]) if (c.classList.contains(k)) return k;
    return null;
  };

  const onDiscard = (pile) => {
    const r = rectOf(pile);
    if (!r) return;
    const p = toWorld(r.cx, r.cy);
    if (!p) return;
    const suit = topSuit(pile);
    burst(p.setY(TABLE_Y + 0.3), suit ? SUIT[suit] : null, 22, { speed: 3.2, up: 3.4, size: 0.26 });
    readColor();
  };

  const watchDiscard = (id) => {
    const el = $(id);
    if (!el) return;
    let last = el.dataset.top;
    new MutationObserver(() => {
      if (el.dataset.top !== last) {
        last = el.dataset.top;
        setTimeout(() => onDiscard(el), 650);
      }
    }).observe(el, { attributes: true, attributeFilter: ["data-top"] });
  };
  ["discardPile", "mpDiscardPile"].forEach(watchDiscard);

  ["colorRing", "mpColorRing"].forEach((id) => {
    const el = $(id);
    if (el) new MutationObserver(readColor).observe(el, { attributes: true, attributeFilter: ["class"] });
  });
  document.querySelectorAll(".table").forEach((t) => new MutationObserver(readColor).observe(t, { attributes: true, attributeFilter: ["class"] }));

  let winTimer = 0;
  const celebrate = () => {
    if (winTimer) return;
    let n = 0;
    winTimer = window.setInterval(() => {
      const p = new THREE.Vector3((Math.random() - 0.5) * 3.4, TABLE_Y + 0.4, (Math.random() - 0.5) * 2.2);
      burst(p, null, 14, { speed: 4.5, up: 6, size: 0.34, life: 1.6 });
      if (++n > 9) { clearInterval(winTimer); winTimer = 0; }
    }, 160);
  };
  const over = $("overOverlay");
  if (over) {
    new MutationObserver(() => {
      if (over.classList.contains("show") && $("overTitle") && $("overTitle").classList.contains("win")) celebrate();
    }).observe(over, { attributes: true, attributeFilter: ["class"] });
  }
  const vic = $("mpVictory");
  if (vic) new MutationObserver(() => { if (!vic.hidden) celebrate(); }).observe(vic, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(() => {
    if (document.body.classList.contains("uno-pulse")) {
      burst(new THREE.Vector3(0, TABLE_Y + 0.5, 1.2), null, 26, { speed: 5, up: 5, size: 0.36, life: 1.4 });
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.querySelectorAll(".screen").forEach((s) => {
    new MutationObserver(() => {
      const screen = activeScreen();
      if (screen) {
        requestAnimationFrame(() => {
          refit(false);
          readColor();
        });
      }
    }).observe(s, { attributes: true, attributeFilter: ["class"] });
  });

  window.addEventListener("resize", () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 80); });
  window.addEventListener("orientationchange", () => setTimeout(resize, 250));

  /* ----- avatars rendered with the same lights ----- */
  const avatarCache = new Map();
  let avatarRenderer = null;
  let avatarScene, avatarCam;
  const ensureAvatarRenderer = () => {
    if (avatarRenderer) return;
    const c = document.createElement("canvas");
    avatarRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    avatarRenderer.setPixelRatio(1);
    avatarRenderer.setSize(192, 192, false);
    avatarRenderer.outputColorSpace = THREE.SRGBColorSpace;
    avatarRenderer.setClearColor(0x000000, 0);
    avatarScene = new THREE.Scene();
    avatarScene.add(new THREE.HemisphereLight("#ffffff", "#9ab6ff", 1.5));
    const key = new THREE.DirectionalLight("#fff4de", 2.4);
    key.position.set(-3, 4, 6);
    avatarScene.add(key);
    const back = new THREE.DirectionalLight("#9fd8ff", 1.2);
    back.position.set(4, 2, -4);
    avatarScene.add(back);
    avatarCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    avatarCam.position.set(0, 0.1, 8.2);
    avatarCam.lookAt(0, -0.35, 0);
  };
  const faceFor = (kind, seed) => {
    const key = kind + ":" + (kind === "you" ? "me" : seed);
    if (avatarCache.has(key)) return avatarCache.get(key);
    ensureAvatarRenderer();
    const ch = makeCharacter(kind, seed);
    ch.rotation.y = -0.18;
    ch.rotation.x = 0.04;
    avatarScene.add(ch);
    avatarRenderer.render(avatarScene, avatarCam);
    const url = avatarRenderer.domElement.toDataURL("image/png");
    avatarScene.remove(ch);
    ch.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    avatarCache.set(key, url);
    return url;
  };

  const paintAvatar = (el) => {
    const kind = el.classList.contains("cpu") ? "cpu" : el.classList.contains("you") ? "you" : el.classList.contains("empty") ? "empty" : "other";
    if (kind === "empty") return;
    const seed = (el.textContent || "").trim() || kind;
    const sig = kind + "|" + seed;
    if (el.dataset.face === sig) return;
    el.dataset.face = sig;
    const [a, b] = PLATES[kind];
    el.style.setProperty("--face", `url(${faceFor(kind, seed)})`);
    el.style.setProperty("--plate-a", a);
    el.style.setProperty("--plate-b", b);
  };
  const paintAll = (root) => (root.querySelectorAll ? root.querySelectorAll(".avatar") : []).forEach(paintAvatar);
  paintAll(document);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.classList && n.classList.contains("avatar")) paintAvatar(n);
          else paintAll(n);
        });
        const host = m.target.nodeType === 1 ? m.target.closest(".avatar") : null;
        if (host) paintAvatar(host);
      } else if (m.type === "characterData") {
        const host = m.target.parentElement && m.target.parentElement.closest(".avatar");
        if (host) paintAvatar(host);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  /* ----- main loop ----- */
  let last = performance.now();
  let t = 0;
  let sparkClock = 0;
  const mat4 = new THREE.Matrix4();
  const quatB = new THREE.Quaternion();
  const quatS = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const sc = new THREE.Vector3();
  let rectClock = 0;
  let running = true;

  // Resolution scales down on slow GPUs (and up again when there is headroom).
  const maxRatio = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  let ratio = maxRatio;
  let slow = 0;
  let fast = 0;
  let sampleT = 0;
  let sampleN = 0;
  const adaptQuality = (dt) => {
    sampleT += dt;
    sampleN++;
    if (sampleT < 1.2) return;
    const fps = sampleN / sampleT;
    sampleT = 0;
    sampleN = 0;
    if (fps < 38) { slow++; fast = 0; } else if (fps > 54) { fast++; slow = 0; } else { slow = 0; fast = 0; }
    if (slow >= 1 && ratio > 0.55) {
      ratio = Math.max(0.55, ratio * 0.78);
      renderer.setPixelRatio(ratio);
      renderer.setSize(W, H, false);
      slow = 0;
    } else if (fast >= 4 && ratio < maxRatio) {
      ratio = Math.min(maxRatio, ratio * 1.2);
      renderer.setPixelRatio(ratio);
      renderer.setSize(W, H, false);
      fast = 0;
    }
  };

  const frame = (now) => {
    if (!running) return;
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    const dt = Math.min(rawDt, 0.05);
    last = now;
    t += dt;

    rectClock += dt;
    if (rectClock > 0.2) {
      rectClock = 0;
      const g = goalPose();
      if (!wanted || Math.abs(g.dist - wanted.dist) + Math.abs(g.ox - wanted.ox) + Math.abs(g.oy - wanted.oy) > 0.4) wanted = g;
    }
    if (!cur) refit(true);
    const k = REDUCED ? 1 : 1 - Math.exp(-dt * 5.5);
    cur.dist += (wanted.dist - cur.dist) * k;
    cur.pitch += (wanted.pitch - cur.pitch) * k;
    cur.yaw += (wanted.yaw - cur.yaw) * k;
    cur.ox += (wanted.ox - cur.ox) * k;
    cur.oy += (wanted.oy - cur.oy) * k;
    cur.target.lerp(wanted.target, k);

    const sway = REDUCED ? 0 : Math.sin(t * 0.45) * 0.012;
    poseCamera(camera, { target: cur.target, pitch: cur.pitch + sway, yaw: cur.yaw + sway * 1.6, dist: cur.dist });
    camera.setViewOffset(W, H, -cur.ox, -cur.oy, W, H);
    camera.updateMatrixWorld(true);

    if (!REDUCED) planet.rotation.y += dt * 0.012;
    clouds.forEach((c) => {
      if (!REDUCED) c.position.x += c.userData.speed * dt;
      if (c.position.x > c.userData.wrap) c.position.x = -c.userData.wrap;
    });
    islands.forEach((g) => {
      g.position.y = g.userData.base + (REDUCED ? 0 : Math.sin(t * 0.7 + g.userData.phase) * 0.28);
      g.rotation.y += REDUCED ? 0 : dt * 0.1;
    });

    const homeMode = mode === "home";
    const onHome = activeScreen() && activeScreen().id === "home";
    hero.visible = homeMode && !!onHome;
    table.visible = true;
    table.position.y = 0;
    heroCards.forEach((p, i) => {
      const s = p.userData.spread;
      p.rotation.z = -s + (REDUCED ? 0 : Math.sin(t * 0.9 + p.userData.phase) * 0.035);
      p.position.y = REDUCED ? 0 : Math.sin(t * 1.1 + p.userData.phase) * 0.08;
      p.rotation.y = REDUCED ? 0 : Math.sin(t * 0.6 + i) * 0.12;
    });
    hero.rotation.y = REDUCED ? 0 : Math.sin(t * 0.4) * 0.12;

    if (mode === "table") syncTableProps();

    tint.lerp(tintGoal, 1 - Math.exp(-dt * 7));
    glowMat.color.copy(tint);
    glowDisc.material.color.copy(tint);
    glowRing.scale.setScalar(1 + (REDUCED ? 0 : Math.sin(t * 2.4) * 0.012));
    glowMat.opacity = 0.75 + (REDUCED ? 0 : Math.sin(t * 3) * 0.2);

    if (homeMode && !REDUCED) {
      sparkClock += dt;
      if (sparkClock > 0.22) {
        sparkClock = 0;
        const hp = new THREE.Vector3((Math.random() - 0.5) * 4.6, 3.1 + (Math.random() - 0.3) * 2.6, 0.7);
        spawn(hp, confettiCols[Math.floor(Math.random() * 4)], { speed: 0.6, up: 0.4, life: 1.6, size: 0.2 });
      }
    }

    quatB.copy(camera.quaternion);
    for (let i = 0; i < MAX_P; i++) {
      const q = parts[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { pMesh.setMatrixAt(i, hideMat); continue; }
      q.v.y -= 7 * dt;
      q.p.addScaledVector(q.v, dt);
      q.rot += q.spin * dt;
      const a = q.life / q.max;
      const s = q.s * (a < 0.35 ? a / 0.35 : 1);
      quatS.setFromAxisAngle(zAxis, q.rot);
      sc.set(s, s, s);
      mat4.compose(q.p, quatB.clone().multiply(quatS), sc);
      pMesh.setMatrixAt(i, mat4);
    }
    pMesh.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
    if (rawDt < 0.5) adaptQuality(rawDt);
  };

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    running = false;
    document.documentElement.classList.remove("w3d");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });

  resize();
  readColor();
  document.documentElement.classList.add("w3d");
  requestAnimationFrame(frame);

  return { burst, setColor, faceFor, paintAvatar, get mode() { return mode; } };
}

function boot() {
  try {
    window.World3D = start();
  } catch (err) {
    console.warn("3D world unavailable, using the CSS table", err);
    document.documentElement.classList.remove("w3d");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
