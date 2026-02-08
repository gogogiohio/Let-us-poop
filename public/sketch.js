// ============================
//  Poop Sheep (Deploy-ready)
//  - iOS-friendly permission UX
//  - Detects sensor availability & guides user
//  - socket.io broadcast for multiplayer
// ============================

const socket = io();

// ---------- UI ----------
let overlay, titleEl, statusEl, hintEl, startBtn;

// ---------- Sensor ----------
let beta = 0, gamma = 0;
let betaSmooth = 0, gammaSmooth = 0;
let permissionState = "idle"; // idle | requesting | granted | denied | unsupported
let gotSensorData = false;
let firstDataMs = null;
let lastDataMs = null;

// ---------- Sheep physics ----------
let sheep = { x: 0, y: 0, vx: 0, vy: 0, heading: 0 };

const DEAD_ZONE = 6;
const MAX_TILT = 35;
const ACC = 0.35;
const FRICTION = 0.90;
const BOUNCE = 0.55;

// ---------- Poop ----------
let poops = [];
const POOP_MAX = 2500;

const POOP_RATE = 0.18;
const POOP_MIN_SPEED = 0.25;
let poopAccumulator = 0;

// ---------- Networking ----------
let lastStateEmitMs = 0;
const STATE_EMIT_MS = 40;

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  background(255);

  sheep.x = width / 2;
  sheep.y = height / 2;

  buildOverlay();

  // Multiplayer receive
  socket.on("drawing", (msg) => {
    if (!msg || !msg.kind) return;

    if (msg.kind === "state") {
      drawRemoteSheep(msg.x * width, msg.y * height, msg.heading);
    } else if (msg.kind === "poop") {
      addPoop(msg.x * width, msg.y * height, msg.r, msg.seed);
    } else if (msg.kind === "clear") {
      clearAll(false);
    }
  });

  // If browser doesn’t support deviceorientation at all
  if (typeof window.DeviceOrientationEvent === "undefined") {
    permissionState = "unsupported";
    setOverlayState();
  } else {
    setOverlayState();
  }
}

function draw() {
  // Always run visuals; even denied shows instructions
  // Soft fade to keep trails
  fill(255, 255, 255, 18);
  rect(0, 0, width, height);

  // Update poop visuals
  updatePoops();

  // If we have permission + sensor data, move sheep
  if (permissionState === "granted" && gotSensorData) {
    betaSmooth = lerp(betaSmooth, beta, 0.12);
    gammaSmooth = lerp(gammaSmooth, gamma, 0.12);

    const nx = normTilt(gammaSmooth);
    const ny = normTilt(betaSmooth);

    sheep.vx = (sheep.vx + nx * ACC) * FRICTION;
    sheep.vy = (sheep.vy + ny * ACC) * FRICTION;

    sheep.x += sheep.vx;
    sheep.y += sheep.vy;

    const speed = Math.hypot(sheep.vx, sheep.vy);
    if (speed > 0.05) sheep.heading = Math.atan2(sheep.vy, sheep.vx);

    if (sheep.x < 0) { sheep.x = 0; sheep.vx *= -BOUNCE; }
    if (sheep.y < 0) { sheep.y = 0; sheep.vy *= -BOUNCE; }
    if (sheep.x > width) { sheep.x = width; sheep.vx *= -BOUNCE; }
    if (sheep.y > height) { sheep.y = height; sheep.vy *= -BOUNCE; }

    // Spawn poop behind sheep
    if (speed > POOP_MIN_SPEED) {
      poopAccumulator += speed * POOP_RATE;
      while (poopAccumulator >= 1) {
        poopAccumulator -= 1;

        const back = -sheep.heading;
        const bx = sheep.x + Math.cos(back) * 18 + random(-4, 4);
        const by = sheep.y + Math.sin(back) * 18 + random(-4, 4);
        const r = random(3, 8);
        const seed = floor(random(1e9));

        addPoop(bx, by, r, seed);

        socket.emit("drawing", {
          kind: "poop",
          x: bx / width,
          y: by / height,
          r,
          seed
        });
      }
    }

    // Draw sheep
    drawSheep(sheep.x, sheep.y, sheep.heading, 1.0);

    // Emit state
    const now = millis();
    if (now - lastStateEmitMs > STATE_EMIT_MS) {
      socket.emit("drawing", {
        kind: "state",
        x: sheep.x / width,
        y: sheep.y / height,
        heading: sheep.heading
      });
      lastStateEmitMs = now;
    }

    // Status update (small + not spammy)
    if (frameCount % 20 === 0) setOverlayState();
  } else {
    // Still draw sheep idle
    drawSheep(sheep.x, sheep.y, sheep.heading, 1.0);

    // After user clicked start, if we still get no data in 2s, show targeted hints
    if (permissionState === "granted" && !gotSensorData) {
      const now = millis();
      if (firstDataMs == null && now > 2000) {
        // still no data
        hintEl.html(
          [
            "权限看起来通过了，但 Safari 没有给传感器数据。最常见原因：",
            "1) iPhone 设置 → Safari → Advanced → <b>Motion & Orientation Access</b> 没打开",
            "2) 这个域名之前被拒绝过：设置 → Safari → Advanced → Website Data → 删除本网站数据后重试",
            "3) 不是 Safari 打开（从 App 内置浏览器打开会失败）"
          ].join("<br/>")
        );
      }
    }
  }
}

// ============================
// Sensor / Permission UX
// ============================
function buildOverlay() {
  overlay = createDiv("");
  overlay.style("position", "fixed");
  overlay.style("left", "0");
  overlay.style("top", "0");
  overlay.style("width", "100%");
  overlay.style("height", "100%");
  overlay.style("display", "flex");
  overlay.style("align-items", "center");
  overlay.style("justify-content", "center");
  overlay.style("background", "rgba(255,255,255,0.92)");
  overlay.style("backdrop-filter", "blur(10px)");
  overlay.style("z-index", "9999");
  overlay.style("padding", "22px");
  overlay.style("box-sizing", "border-box");

  const card = createDiv("");
  card.parent(overlay);
  card.style("max-width", "560px");
  card.style("width", "100%");
  card.style("background", "white");
  card.style("border-radius", "18px");
  card.style("box-shadow", "0 18px 60px rgba(0,0,0,0.14)");
  card.style("padding", "18px 18px 16px");

  titleEl = createDiv("🐑💩 Poop Sheep");
  titleEl.parent(card);
  titleEl.style("font-family", "system-ui");
  titleEl.style("font-weight", "800");
  titleEl.style("font-size", "18px");
  titleEl.style("margin-bottom", "8px");

  statusEl = createDiv("");
  statusEl.parent(card);
  statusEl.style("font-family", "system-ui");
  statusEl.style("font-size", "14px");
  statusEl.style("line-height", "1.35");
  statusEl.style("margin-bottom", "10px");

  hintEl = createDiv("");
  hintEl.parent(card);
  hintEl.style("font-family", "system-ui");
  hintEl.style("font-size", "13px");
  hintEl.style("line-height", "1.4");
  hintEl.style("opacity", "0.8");
  hintEl.style("margin-bottom", "12px");

  startBtn = createButton("Start / Enable Motion");
  startBtn.parent(card);
  startBtn.style("width", "100%");
  startBtn.style("height", "46px");
  startBtn.style("border", "none");
  startBtn.style("border-radius", "14px");
  startBtn.style("font-size", "16px");
  startBtn.style("font-weight", "700");
  startBtn.style("cursor", "pointer");
  startBtn.mousePressed(requestMotionPermission);

  const small = createDiv("Tip: 如果你刚刚点了拒绝，需要在 iPhone 设置里把本网站的权限清掉再来。");
  small.parent(card);
  small.style("font-family", "system-ui");
  small.style("font-size", "12px");
  small.style("opacity", "0.6");
  small.style("margin-top", "10px");

  setOverlayState();
}

function setOverlayState() {
  if (permissionState === "unsupported") {
    statusEl.html("你的浏览器不支持 DeviceOrientation（陀螺仪方向事件）。请用 iPhone Safari 或 Chrome Android。");
    hintEl.html("如果你在某个 App 内置浏览器里打开，请复制链接到 Safari 打开。");
    startBtn.attribute("disabled", "");
    return;
  }

  if (permissionState === "idle") {
    statusEl.html("点击下方按钮开始。需要使用手机的陀螺仪来控制小羊移动并拉屎。");
    hintEl.html("iPhone 必须点按钮才会弹出系统授权框。<br/>如果弹框里有 Allow，请点 Allow。");
    startBtn.removeAttribute("disabled");
    overlay.style("display", "flex");
    return;
  }

  if (permissionState === "requesting") {
    statusEl.html("正在请求权限…如果系统弹框出现，请选择 Allow。");
    hintEl.html("如果你点了拒绝，Safari 会记住，需要去设置里清掉权限后再试。");
    startBtn.attribute("disabled", "");
    overlay.style("display", "flex");
    return;
  }

  if (permissionState === "denied") {
    statusEl.html("❌ Permission Denied（系统拒绝了运动/方向访问）");
    hintEl.html(
      [
        "请按以下任意一种方式修复：",
        "1) iPhone 设置 → Safari → Advanced → <b>Motion & Orientation Access</b> 打开",
        "2) iPhone 设置 → Safari → Advanced → Website Data → 删除 <b>let-us-poop-io.onrender.com</b> 的数据",
        "3) 确保用 Safari 打开（不要在微信/QQ内置浏览器里）"
      ].join("<br/>")
    );
    startBtn.removeAttribute("disabled");
    startBtn.html("Try Again");
    overlay.style("display", "flex");
    return;
  }

  if (permissionState === "granted") {
    // Hide overlay once we actually receive sensor data (safer than hiding immediately)
    if (gotSensorData) {
      overlay.style("display", "none");
    } else {
      statusEl.html("✅ 权限已通过。等待陀螺仪数据…（请轻轻旋转手机）");
      hintEl.html("如果 2 秒内数据仍然是 0，通常是 Safari 全局 Motion 开关没开。");
      overlay.style("display", "flex");
    }
    return;
  }
}

async function requestMotionPermission() {
  permissionState = "requesting";
  gotSensorData = false;
  firstDataMs = null;
  lastDataMs = null;
  setOverlayState();

  try {
    // iOS 13+: must request permission via user gesture
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted") {
        permissionState = "denied";
        setOverlayState();
        return;
      }
    }

    // Some iOS versions also gate devicemotion separately, but we only NEED orientation.
    // Add listener now:
    window.addEventListener("deviceorientation", onDeviceOrientation, true);

    permissionState = "granted";
    startBtn.attribute("disabled", "");
    startBtn.html("Enabled ✅");
    setOverlayState();
  } catch (e) {
    // If Safari global motion access is OFF, it often throws / denies here
    console.error(e);
    permissionState = "denied";
    setOverlayState();
  }
}

function onDeviceOrientation(e) {
  // If Safari is actually providing data, beta/gamma will be numbers
  if (typeof e.beta === "number" && typeof e.gamma === "number") {
    beta = e.beta;
    gamma = e.gamma;

    lastDataMs = millis();
    if (!gotSensorData) {
      gotSensorData = true;
      firstDataMs = lastDataMs;
      setOverlayState();
    }
  }
}

// ============================
// Poop + Sheep drawing
// ============================
function normTilt(v) {
  const s = Math.sign(v);
  const a = Math.abs(v);
  if (a < DEAD_ZONE) return 0;
  const t = Math.min((a - DEAD_ZONE) / (MAX_TILT - DEAD_ZONE), 1);
  return s * t;
}

function addPoop(x, y, r, seed) {
  randomSeed(seed || 1);
  poops.push({
    x, y, r,
    a: random(150, 230),
    wob: random(1000),
    life: 1.0
  });
  if (poops.length > POOP_MAX) poops.splice(0, poops.length - POOP_MAX);
}

function updatePoops() {
  for (let i = Math.max(0, poops.length - 1500); i < poops.length; i++) {
    const p = poops[i];
    p.life *= 0.9992;
    p.a *= 0.9995;

    const rr = p.r * (0.7 + 0.3 * p.life);
    const jx = (noise(p.wob + frameCount * 0.01) - 0.5) * 0.6;
    const jy = (noise(p.wob + 999 + frameCount * 0.01) - 0.5) * 0.6;

    fill(25, 160);
    ellipse(p.x + jx, p.y + jy + 1, rr * 1.05, rr * 0.9);

    fill(70, 45, 20, p.a);
    ellipse(p.x + jx, p.y + jy, rr, rr * 0.85);

    fill(255, 255, 255, 18);
    ellipse(p.x + jx - rr * 0.18, p.y + jy - rr * 0.12, rr * 0.22, rr * 0.18);
  }
}

function drawSheep(x, y, heading, scaleMul) {
  push();
  translate(x, y);
  rotate(heading);

  const s = 1.0 * scaleMul;

  fill(40);
  rect(-10 * s, 12 * s, 6 * s, 14 * s, 3 * s);
  rect(6 * s, 12 * s, 6 * s, 14 * s, 3 * s);

  fill(245);
  ellipse(0, 0, 46 * s, 34 * s);
  ellipse(-12 * s, -4 * s, 26 * s, 22 * s);
  ellipse(12 * s, -5 * s, 26 * s, 22 * s);

  fill(60);
  ellipse(26 * s, -6 * s, 20 * s, 18 * s);

  fill(230);
  ellipse(29 * s, -6 * s, 10 * s, 10 * s);

  fill(0);
  ellipse(28 * s, -8 * s, 2.6 * s, 2.6 * s);
  ellipse(32 * s, -8 * s, 2.6 * s, 2.6 * s);

  fill(50);
  ellipse(22 * s, -14 * s, 10 * s, 6 * s);

  fill(240);
  ellipse(-24 * s, -2 * s, 10 * s, 10 * s);

  pop();
}

function drawRemoteSheep(x, y, heading) {
  // ghosty presence
  push();
  fill(255, 255, 255, 10);
  rect(0, 0, width, height);
  pop();
  drawSheep(x, y, heading, 0.92);
}

// ============================
// Utilities
// ============================
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function touchMoved() {
  return false;
}

function doubleClicked() {
  clearAll(true);
}

function clearAll(broadcast) {
  background(255);
  poops = [];
  poopAccumulator = 0;
  if (broadcast) socket.emit("drawing", { kind: "clear" });
}
