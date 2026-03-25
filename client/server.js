import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from dist directory (Railway builds in current directory)
const distPath =
  process.env.NODE_ENV === "production"
    ? join(__dirname, "dist")
    : join(__dirname, "dist");

console.log(`📁 Serving from: ${distPath}`);

app.use(express.static(distPath));

// SPA fallback: serve index.html for all routes
app.get("*", (req, res) => {
  res.sendFile(join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Frontend server running on port ${PORT}`);
});
