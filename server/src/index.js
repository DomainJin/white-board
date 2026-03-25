import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
const createClient = (url) => new Redis(url);
import { setupRoomRoutes } from "./routes/rooms.js";
import { setupSocketHandlers } from "./socket/handlers.js";
import { setupDatabase } from "./db/index.js";

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ── Fastify ──────────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: "info" } });

await app.register(cors, {
  origin: CLIENT_URL,
  credentials: true,
});
await app.register(jwt, { secret: JWT_SECRET });

// ── Database ──────────────────────────────────────────────────────────────────
await setupDatabase();

// ── Redis ─────────────────────────────────────────────────────────────────────
let pubClient, subClient;
let redisConnected = false;

try {
  pubClient = createClient(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 100, 1000),
  });
  subClient = pubClient.duplicate();

  pubClient.on("error", (err) => {
    console.warn("⚠️  Redis error:", err.message);
  });
  subClient.on("error", (err) => {
    console.warn("⚠️  Redis sub error:", err.message);
  });

  const redisPromise = Promise.race([
    Promise.all([pubClient.connect(), subClient.connect()]),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Redis timeout")), 10000),
    ),
  ]);

  await redisPromise;
  redisConnected = true;
  console.log("✅ Redis connected");
} catch (error) {
  console.warn("⚠️  Redis connection failed:", error.message);
  console.warn("⚠️  Running without Redis - features may be limited");
  pubClient = null;
  subClient = null;
}
app.decorate("redis", pubClient);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(app.server, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});
if (pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
}

// Middleware xác thực token trước khi connect
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    socket.user = app.jwt.verify(token);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

setupSocketHandlers(io, pubClient);

// ── HTTP Routes ───────────────────────────────────────────────────────────────
app.get("/health", async () => ({ status: "ok", ts: Date.now() }));
await setupRoomRoutes(app);

// ── Start ─────────────────────────────────────────────────────────────────────
await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`🚀 Server running on port ${PORT}`);
