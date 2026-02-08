// Socket
const socket = io();

let canvas;
let poopLayer; // 屎的图层
let gameStarted = false; // 游戏是否开始

// iOS permission button
let askButton;

// deviceorientation values
let beta = 0;
let gamma = 0;
let betaSmooth = 0;
let gammaSmooth = 0;

// 我的小羊
let mySheepX, mySheepY;
let prevX, prevY;

// 其他玩家的羊
let otherSheeps = {};

// 我的颜色（灰度）
let myGray;

// tuning
const DEAD_ZONE = 6;
const MAX_TILT = 35;
const SHEEP_SPEED = 8;
const SMOOTHING = 0.15;

// socket throttle
let lastEmitMs = 0;

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("sketch-container");

  // 创建屎的图层
  poopLayer = createGraphics(windowWidth, windowHeight);
  poopLayer.background(255);

  // 隐藏GUI
  let gui = select("#gui-container");
  if (gui) gui.style("display", "none");

  background(255);

  // 我的羊初始位置
  mySheepX = width / 2;
  mySheepY = height / 2;
  prevX = mySheepX;
  prevY = mySheepY;

  // 随机分配灰度（0-黑色, 40-深灰, 80-中灰, 120-较深灰）
  // 去掉太浅的颜色
  myGray = int(random(4)) * 40;

  initMotionPermissionUI();
}

function draw() {
  // 如果游戏还没开始，显示开场画面
  if (!gameStarted) {
    drawStartScreen();
    return;
  }
  
  // 清空主画布
  background(255);

  // 平滑传感器
  betaSmooth = lerp(betaSmooth, beta, SMOOTHING);
  gammaSmooth = lerp(gammaSmooth, gamma, SMOOTHING);

  // 转换倾斜为速度
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

  // 移动我的羊
  mySheepX = constrain(mySheepX + vx, 30, width - 30);
  mySheepY = constrain(mySheepY + vy, 30, height - 30);

  // 计算移动强度和方向
  const mag = sqrt(vx * vx + vy * vy);
  const isMoving = mag > 0.5;

  // 只要在移动就拉屎（减少数量）
  if (isMoving && frameCount % 2 === 0) { // 每2帧拉一次
    const poopCount = 1; // 每次只拉1个
    
    for (let i = 0; i < poopCount; i++) {
      const size = random(10, 16); // 大小也稍微减小
      const angle = atan2(vy, vx) + PI;
      const spread = random(15, 25);
      const offsetAngle = angle + random(-0.4, 0.4);
      
      const poopX = mySheepX + cos(offsetAngle) * spread + random(-8, 8);
      const poopY = mySheepY + sin(offsetAngle) * spread + random(-8, 8);
      
      // 在屎图层上画（用我的灰度）
      poopLayer.fill(myGray);
      poopLayer.noStroke();
      poopLayer.ellipse(poopX, poopY, size, size);
      
      // 发送给其他人
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

  // 更新位置记录
  prevX = mySheepX;
  prevY = mySheepY;

  // 先画屎图层
  image(poopLayer, 0, 0);

  // 再画羊（在屎上面，每帧重新画）
  for (let id in otherSheeps) {
    let sheep = otherSheeps[id];
    drawPixelSheep(sheep.x, sheep.y);
  }

  drawPixelSheep(mySheepX, mySheepY);

  // 状态信息
  fill(0);
  noStroke();
  textSize(16);
  textFont("monospace");
  text("SHEEP: " + (Object.keys(otherSheeps).length + 1), 15, 25);
  
  // 显示我的灰度
  fill(myGray);
  rect(15, 35, 20, 20);
  fill(0);
  text("ME", 40, 50);
  
  // 发送我的位置
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
// 画像素风小羊
// --------------------
function drawStartScreen() {
  background(255);
  
  // 像素风标题 "LET'S POOP"
  push();
  translate(width/2, height/2 - 50);
  
  // 黑色像素字体
  fill(0);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(48);
  textFont("monospace");
  textStyle(BOLD);
  text("LET'S POOP", 0, 0);
  
  // 闪烁的小羊图标
  if (frameCount % 60 < 30) {
    translate(0, 80);
    drawPixelSheep(0, 0);
  }
  
  pop();
  
  // 提示文字
  fill(100);
  textAlign(CENTER, CENTER);
  textSize(16);
  textFont("monospace");
  text("CLICK TO START", width/2, height - 100);
}

// 点击屏幕开始游戏
function mousePressed() {
  if (!gameStarted) {
    gameStarted = true;
    // 如果需要权限，请求权限
    if (askButton) {
      requestMotionPermission();
    }
  }
}

// --------------------
// 画像素风小羊
// --------------------
function drawPixelSheep(x, y) {
  push();
  translate(x, y);
  
  const s = 28;
  
  // 羊毛（白色）
  fill(255);
  stroke(0);
  strokeWeight(2);
  rect(-s/2, -s/3, s, s/1.5);
  
  // 羊头（白色）
  fill(255);
  rect(s/3, -s/3, s/2.5, s/1.8);
  
  // 眼睛（黑色像素）
  fill(0);
  noStroke();
  rect(s/3 + 2, -s/5, 3, 3);
  rect(s/3 + s/5, -s/5, 3, 3);
  
  // 腿（黑色）
  rect(-s/3, s/4, 4, s/3);
  rect(-s/6, s/4, 4, s/3);
  rect(s/12, s/4, 4, s/3);
  rect(s/4, s/4, 4, s/3);
  
  pop();
}

// --------------------
// Motion permission
// --------------------
function initMotionPermissionUI() {
  const needsPermission =
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  if (needsPermission) {
    // iOS 需要权限，等待点击
    askButton = true;
  } else {
    // 不需要权限，直接开始
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    gameStarted = true;
  }
}

function requestMotionPermission() {
  Promise.allSettled([
    DeviceMotionEvent.requestPermission(),
    DeviceOrientationEvent.requestPermission(),
  ])
    .then((results) => {
      const granted = results.some(
        (r) => r.status === "fulfilled" && r.value === "granted"
      );
      if (granted) {
        window.addEventListener("deviceorientation", onDeviceOrientation, true);
        gameStarted = true;
      } else {
        alert("Permission Denied!");
      }
    })
    .catch((err) => {
      console.error(err);
      alert("Permission Error!");
    });
}

function onDeviceOrientation(e) {
  if (e.beta == null || e.gamma == null) return;
  beta = e.beta;
  gamma = e.gamma;
}

// --------------------
// Socket
// --------------------
socket.on("poop", (data) => {
  // 在屎图层上画其他人的屎（用他们的灰度）
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
