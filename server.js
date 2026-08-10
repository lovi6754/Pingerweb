const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI;
const LOGIN_KEYS = (process.env.LOGIN_KEYS || "YUVRAJBOT,YUVRAJSHARMAJI,LOVELYBOT")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const sessions = new Map();

function makeSession(key) {
  const token = crypto.createHash("sha256")
    .update(key + SESSION_SECRET + Date.now() + Math.random())
    .digest("hex");
  sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  return token;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: "Authentication required." });
  }
  next();
}

app.post("/api/login", (req, res) => {
  const key = String(req.body.key || "").trim();
  if (!key || !LOGIN_KEYS.includes(key)) {
    return res.status(401).json({ error: "Invalid access key." });
  }
  const token = makeSession(key);
  res.json({ ok: true, token });
});

app.post("/api/logout", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/auth/check", authRequired, (_req, res) => {
  res.json({ ok: true });
});

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable.");
  process.exit(1);
}

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, unique: true, trim: true },
  intervalMinutes: { type: Number, enum: [5, 10, 15, 30, 60], default: 10 },
  status: { type: String, enum: ["WAITING", "ONLINE", "OFFLINE", "ERROR"], default: "WAITING" },
  httpCode: { type: Number, default: null },
  responseMs: { type: Number, default: null },
  lastPing: { type: Date, default: null },
  lastError: { type: String, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const Project = mongoose.model("Project", projectSchema);

async function pingUrl(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "My-Pinger/2.0 uptime-monitor" }
    });

    clearTimeout(timeout);

    const ms = Date.now() - started;
    return {
      status: response.status >= 200 && response.status < 400 ? "ONLINE" : "ERROR",
      httpCode: response.status,
      responseMs: ms,
      lastError: ""
    };
  } catch (e) {
    clearTimeout(timeout);

    return {
      status: "OFFLINE",
      httpCode: null,
      responseMs: Date.now() - started,
      lastError: e.name === "AbortError"
        ? "Request timed out after 20 seconds."
        : String(e.message || e)
    };
  }
}

async function pingProject(project) {
  const result = await pingUrl(project.url);

  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        ...result,
        lastPing: new Date()
      }
    }
  );

  console.log(
    `[PING] ${project.name} -> ${result.status} ${result.httpCode || ""} ${result.responseMs}ms`
  );

  return result;
}

// Runs every minute. Each project has its own interval.
cron.schedule("* * * * *", async () => {
  try {
    const projects = await Project.find({ active: true }).lean();
    const now = Date.now();

    for (const project of projects) {
      const last = project.lastPing ? new Date(project.lastPing).getTime() : 0;
      const due =
        !last ||
        now - last >= project.intervalMinutes * 60 * 1000;

      if (due) {
        await pingProject(project);
      }
    }
  } catch (error) {
    console.error("[SCHEDULER]", error);
  }
});

app.get("/api/projects", authRequired, async (_req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/projects", authRequired, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const url = String(req.body.url || "").trim();
    const intervalMinutes = Number(req.body.interval || 10);

    if (!name) {
      return res.status(400).json({ error: "Project name is required." });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Enter a valid URL." });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({
        error: "Only HTTP/HTTPS URLs are supported."
      });
    }

    if (![5, 10, 15, 30, 60].includes(intervalMinutes)) {
      return res.status(400).json({ error: "Invalid interval." });
    }

    const project = await Project.create({
      name,
      url,
      intervalMinutes
    });

    // First ping immediately.
    await pingProject(project);

    const saved = await Project.findById(project._id).lean();
    res.status(201).json(saved);
  } catch (e) {
    const message = String(e.message || e);

    if (e.code === 11000) {
      return res.status(400).json({
        error: "This URL is already being monitored."
      });
    }

    res.status(400).json({ error: message });
  }
});

app.post("/api/projects/:id/ping", authRequired, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    await pingProject(project);

    res.json(await Project.findById(project._id).lean());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/projects/:id", authRequired, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    project.active = Boolean(req.body.active);
    await project.save();

    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/projects/:id", authRequired, async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "my-pinger",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString()
  });
});

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected.");
    app.listen(PORT, () => {
      console.log(`My Pinger running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });