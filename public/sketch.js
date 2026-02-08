// Socket
const socket = io();

let canvas;
let poopLayer; // poop drawing layer
let gameStarted = false; // whether the game started

// iOS permission flag (boolean)
let askButton;

// deviceorientation values
let beta = 0;
let gamma = 0;
let betaSmooth = 0;
let gammaSmooth = 0;

// my sheep
let mySheepX, mySheepY;
let prevX, prevY;

// other players' sheep
let otherSheeps = {};

// my grayscale color
let myGray;

// tuning
const DEAD_ZONE = 6;
const MAX_TILT = 35;
const SHEEP_SPEED = 8;
const SMOOTHING = 0.15;

// socket throttle
let lastEmitMs = 0;

// --------- Sensor data watchdog (NO visual changes, English alerts only) ---------
let gotOrientationData = false;
let orientationDataStartMs = 0;
let noDataAlerted = false;
// -----------------------------------------------------------------------------

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("sketch-container");

  // Create poop layer
  poopLayer = createGraphics(windowWidth, windowHeight);
  poopLayer.background(255);

  // Hide GUI container (keep your original behavior)
  let gui = select("#gui-container");
  if (gui) gui.style("display", "none");

  background(255);

  // Init my sheep position
  mySheepX = width / 2;
  mySheepY = height / 2;
  prevX = mySheepX;
  prevY = mySheepY;

  // Assign grayscale (avoid too light)
  myGray = int(random(4)) * 40;

  initMotionPermissionUI();
}

function draw() {
  // Start screen (keep visuals)
  if (!gameStarted) {
    drawStartScreen();
    return;
  }

  // Clear main canvas
  background(255);

  // Smooth sensor
  betaSmooth = lerp(betaSmooth, beta, SMOOTHING);
  gammaSmooth = lerp(gammaSmooth, gamma, SMOOTHING);

  // Tilt -> velocity
  const vx = map(
    constrain(gammaSmooth, -MAX_TILT, MAX_TILT),
    -MAX_TILT,
    MAX_TILT,
    -SHEEP_SPEED,
    SHEEP_SPEED
  );
  const vy = map(
    constrain(betaSmooth, -MAX_TILT, MAX_TILT),
    -MAX_TILT,
    MAX_TILT,
    -SHEEP_SPEED,
    SHEEP_SPEED
  );

  // Move my sheep
  mySheepX = constrain(mySheepX + vx, 30, width - 30);
  mySheepY = constrain(mySheepY + vy, 30, height - 30);

  // Movement strength
  const mag = sqrt(vx * vx + vy * vy);
  const isMoving = mag > 0.5;

  // Poop while moving (reduced amount)
  if (isMoving && frameCount % 2 === 0) {
    const poopCount = 1;

    for (let i = 0; i < poopCount; i++) {
      const size = random(10, 16);
      const angle = atan2(vy, vx) + PI;
      const spread = random(15, 25);
      const offsetAngle = angle + random(-0.4, 0.4);

      const poopX = mySheepX + cos(offsetAngle) * spread + random(-8, 8);
      const poopY = mySheepY + sin(offsetAngle) * spread + random(-8, 8);

      poopLayer.fill(myGray);
      poopLayer.noStroke();
      poopLayer.ellipse(poopX, poopY, size, size);

      // Broadcast poop (throttle)
      const now = millis();
      if (now - lastEmitMs > 50) {
        socket.emit("poop", {
          x: poopX / width,
          y: poopY / height,
          size: size,
          gray: myGray
        });
        lastEmitMs = now;
      }
    }
  }

  prevX = mySheepX;
  prevY = mySheepY;

  // Draw poop layer
  image(poopLayer, 0, 0);

  // Draw other sheep
  for (let id in otherSheeps) {
    let sheep = otherSheeps[id];
    drawPixelSheep(sheep.x, sheep.y);
  }

  // Draw my sheep
  drawPixelSheep(mySheepX, mySheepY);

  // HUD (keep your original style)
  fill(0);
  noStroke();
  textSize(16);
  textFont("monospace");
  text("SHEEP: " + (Object.keys(otherSheeps).length + 1), 15, 25);

  // My grayscale
  fill(myGray);
  rect(15, 35, 20, 20);
  fill(0);
  text("ME", 40, 50);

  // Send my position (separate throttle)
  const now = millis();
  if (now - lastEmitMs > 100) {
    socket.emit("position", {
      id: socket.id,
      x: mySheepX,
      y: mySheepY,
      gray: myGray
    });
    lastEmitMs = now;
  }
}

// --------------------
// Start screen (KEEP VISUALS)
// --------------------
function drawStartScreen() {
  background(255);

  push();
  translate(width / 2, height / 2 - 50);

  fill(0);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(48);
  textFont("monospace");
  textStyle(BOLD);
  text("LET'S POOP", 0, 0);

  if (frameCount % 60 < 30) {
    translate(0, 80);
    drawPixelSheep(0, 0);
  }

  pop();

  fill(100);
  textAlign(CENTER, CENTER);
  textSize(16);
  textFont("monospace");
  text("CLICK TO START", width / 2, height - 100);
}

// --------------------
// Click to start (permission first on iOS)
// --------------------
function mousePressed() {
  if (gameStarted) return;

  if (askButton) {
    requestMotionPermission();
  } else {
    gameStarted = true;
  }
}

// --------------------
// Pixel sheep (KEEP VISUALS)
// --------------------
function drawPixelSheep(x, y) {
  push();
  translate(x, y);

  const s = 28;

  // wool
  fill(255);
  stroke(0);
  strokeWeight(2);
  rect(-s / 2, -s / 3, s, s / 1.5);

  // head
  fill(255);
  rect(s / 3, -s / 3, s / 2.5, s / 1.8);

  // eyes
  fill(0);
  noStroke();
  rect(s / 3 + 2, -s / 5, 3, 3);
  rect(s / 3 + s / 5, -s / 5, 3, 3);

  // legs
  rect(-s / 3, s / 4, 4, s / 3);
  rect(-s / 6, s / 4, 4, s / 3);
  rect(s / 12, s / 4, 4, s / 3);
  rect(s / 4, s / 4, 4, s / 3);

  pop();
}

// --------------------
// Motion permission (NO VISUAL CHANGES, ENGLISH ALERTS ONLY)
// --------------------
function initMotionPermissionUI() {
  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (needsPermission) {
    askButton = true;
    // Stay on start screen until user clicks and permission granted.
  } else {
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    gameStarted = true;
  }
}

async function requestMotionPermission() {
  try {
    // reset watchdog
    gotOrientationData = false;
    noDataAlerted = false;
    orientationDataStartMs = millis();

    const res = await DeviceOrientationEvent.requestPermission();
    if (res !== "granted") {
      alert(
        "Permission denied.\n\n" +
          "Fix on iPhone:\n" +
          "1) Settings → Safari → Advanced → Motion & Orientation Access → ON\n" +
          "2) Or: Settings → Safari → Advanced → Website Data → delete this site\n" +
          "Then reload and try again."
      );
      gameStarted = false;
      return;
    }

    window.addEventListener("deviceorientation", onDeviceOrientation, true);

    // Start the game ONLY after permission granted
    gameStarted = true;

    // If permission is granted but Safari provides no data, alert once after 2s
    setTimeout(() => {
      if (gameStarted && !gotOrientationData && !noDataAlerted) {
        noDataAlerted = true;
        alert(
          "Motion permission looks granted, but no sensor data is coming through.\n\n" +
            "Most common fixes on iPhone:\n" +
            "1) Settings → Safari → Advanced → Motion & Orientation Access → ON\n" +
            "2) Settings → Safari → Advanced → Website Data → delete this site\n" +
            "3) Make sure you opened the link in Safari (not an in-app browser)\n\n" +
            "Reload the page and try again."
        );
      }
    }, 2000);
  } catch (err) {
    console.error(err);
    alert(
      "Permission error.\n\n" +
        "Open this link in Safari (not an in-app browser), and check:\n" +
        "Settings → Safari → Advanced → Motion & Orientation Access."
    );
    gameStarted = false;
  }
}

function onDeviceOrientation(e) {
  if (e.beta == null || e.gamma == null) return;

  // mark that we have real sensor data
  if (!gotOrientationData) gotOrientationData = true;

  beta = e.beta;
  gamma = e.gamma;
}

// --------------------
// Socket (KEEP YOUR PROTOCOL)
// --------------------
socket.on("poop", (data) => {
  poopLayer.fill(data.gray);
  poopLayer.noStroke();
  poopLayer.ellipse(data.x * width, data.y * height, data.size, data.size);
});

socket.on("position", (data) => {
  if (data.id === socket.id) return;
  otherSheeps[data.id] = {
    x: data.x,
    y: data.y,
    gray: data.gray
  };
});

socket.on("disconnect", () => {
  console.log("disconnected");
});

// --------------------
// Resizing / mobile
// --------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  poopLayer = createGraphics(windowWidth, windowHeight);
  poopLayer.background(255);
  mySheepX = width / 2;
  mySheepY = height / 2;
}

function touchMoved() {
  return false;
}
