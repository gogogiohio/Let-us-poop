const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("🐑 sheep connected:", socket.id);

  // 广播屎
  socket.on("poop", (data) => {
    socket.broadcast.emit("poop", data);
  });

  // 广播位置
  socket.on("position", (data) => {
    socket.broadcast.emit("position", data);
  });

  socket.on("disconnect", () => {
    console.log("👋 sheep left:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🐑💩 Sheep Poop Server running on port ${PORT}`);
});
