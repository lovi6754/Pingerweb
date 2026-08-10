const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const MONGODB_URI = process.env.MONGODB_URI;

const LOGIN_KEYS = (
  process.env.LOGIN_KEYS ||
  "YUVRAJBOT,YUVRAJSHARMAJI,LOVELYBOT"
)
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const sessions = new Map();


// ======================================================
// MIDDLEWARE
// IMPORTANT: MUST BE BEFORE API ROUTES
// ======================================================

app.use(
  express.json({
    limit: "20kb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


// ======================================================
// ENV CHECK
// ======================================================

if (!MONGODB_URI) {
  console.error(
    "ERROR: MONGODB_URI environment variable is missing."
  );

  process.exit(1);
}


// ======================================================
// SESSION
// ======================================================

function createSession(key) {

  const token =
    crypto
      .createHash("sha256")
      .update(
        key +
        SESSION_SECRET +
        Date.now() +
        Math.random()
      )
      .digest("hex");

  sessions.set(
    token,
    Date.now() +
      24 * 60 * 60 * 1000
  );

  return token;
}


function checkSession(token) {

  if (!token) {
    return false;
  }

  const expiry =
    sessions.get(token);

  if (!expiry) {
    return false;
  }

  if (expiry < Date.now()) {

    sessions.delete(token);

    return false;
  }

  return true;
}


function authRequired(
  req,
  res,
  next
) {

  const authorization =
    req.headers.authorization || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {

    return res.status(401).json({
      error:
        "Authentication required."
    });
  }

  const token =
    authorization.substring(7);

  if (!checkSession(token)) {

    return res.status(401).json({
      error:
        "Session expired. Please login again."
    });
  }

  next();
}


// ======================================================
// LOGIN
// ======================================================

app.post(
  "/api/login",
  (req, res) => {

    try {

      const key =
        String(
          req.body?.key || ""
        ).trim();


      if (!key) {

        return res.status(400).json({
          error:
            "Access key is required."
        });
      }


      if (
        !LOGIN_KEYS.includes(key)
      ) {

        return res.status(401).json({
          error:
            "Invalid access key."
        });
      }


      const token =
        createSession(key);


      return res.json({

        ok: true,

        token

      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Login server error."
      });
    }
  }
);


// ======================================================
// LOGOUT
// ======================================================

app.post(
  "/api/logout",
  (req, res) => {

    const authorization =
      req.headers.authorization || "";


    if (
      authorization.startsWith(
        "Bearer "
      )
    ) {

      const token =
        authorization.substring(7);

      sessions.delete(token);
    }


    res.json({
      ok: true
    });
  }
);


// ======================================================
// AUTH CHECK
// ======================================================

app.get(
  "/api/auth/check",
  authRequired,
  (_req, res) => {

    res.json({
      ok: true,
      authenticated: true
    });
  }
);


// ======================================================
// VERSION TEST
// ======================================================

app.get(
  "/api/version",
  (_req, res) => {

    res.json({

      ok: true,

      version:
        "LOGIN-FIXED-3.0"

    });
  }
);


// ======================================================
// MONGODB SCHEMA
// ======================================================

const projectSchema =
  new mongoose.Schema(
    {

      name: {
        type: String,
        required: true,
        trim: true
      },

      url: {
        type: String,
        required: true,
        unique: true,
        trim: true
      },

      intervalMinutes: {
        type: Number,
        enum: [
          5,
          10,
          15,
          30,
          60
        ],
        default: 10
      },

      status: {
        type: String,

        enum: [
          "WAITING",
          "ONLINE",
          "OFFLINE",
          "ERROR"
        ],

        default: "WAITING"
      },

      httpCode: {
        type: Number,
        default: null
      },

      responseMs: {
        type: Number,
        default: null
      },

      lastPing: {
        type: Date,
        default: null
      },

      lastError: {
        type: String,
        default: ""
      },

      active: {
        type: Boolean,
        default: true
      }

    },

    {
      timestamps: true
    }
  );


const Project =
  mongoose.model(
    "Project",
    projectSchema
  );


// ======================================================
// PING URL
// ======================================================

async function pingUrl(url) {

  const started =
    Date.now();

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      20000
    );


  try {

    const response =
      await fetch(
        url,
        {

          method: "GET",

          redirect: "follow",

          signal:
            controller.signal,

          headers: {

            "User-Agent":
              "My-Pinger/3.0"

          }

        }
      );


    clearTimeout(timeout);


    const responseMs =
      Date.now() -
      started;


    return {

      status:
        response.status >= 200 &&
        response.status < 400
          ? "ONLINE"
          : "ERROR",

      httpCode:
        response.status,

      responseMs,

      lastError: ""

    };

  } catch (error) {

    clearTimeout(timeout);


    return {

      status:
        "OFFLINE",

      httpCode:
        null,

      responseMs:
        Date.now() -
        started,

      lastError:
        error.name ===
        "AbortError"

          ? "Request timed out after 20 seconds."

          : String(
              error.message ||
              error
            )

    };
  }
}


// ======================================================
// PING PROJECT
// ======================================================

async function pingProject(
  project
) {

  const result =
    await pingUrl(
      project.url
    );


  await Project.updateOne(

    {
      _id:
        project._id
    },

    {
      $set: {

        status:
          result.status,

        httpCode:
          result.httpCode,

        responseMs:
          result.responseMs,

        lastError:
          result.lastError,

        lastPing:
          new Date()

      }
    }

  );


  console.log(
    `[PING] ${project.name} -> ${result.status} ${result.httpCode || ""} ${result.responseMs}ms`
  );


  return result;
}


// ======================================================
// AUTOMATIC SCHEDULER
// ======================================================

cron.schedule(
  "* * * * *",
  async () => {

    try {

      const projects =
        await Project
          .find({
            active: true
          })
          .lean();


      const now =
        Date.now();


      for (
        const project
        of projects
      ) {

        const lastPing =
          project.lastPing
            ? new Date(
                project.lastPing
              ).getTime()
            : 0;


        const interval =
          project.intervalMinutes *
          60 *
          1000;


        const due =
          !lastPing ||
          now - lastPing >=
            interval;


        if (due) {

          await pingProject(
            project
          );
        }
      }

    } catch (error) {

      console.error(
        "[SCHEDULER]",
        error
      );
    }
  }
);


// ======================================================
// GET PROJECTS
// ======================================================

app.get(
  "/api/projects",
  authRequired,
  async (_req, res) => {

    try {

      const projects =
        await Project
          .find()
          .sort({
            createdAt: -1
          })
          .lean();


      res.json(
        projects
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });
    }
  }
);


// ======================================================
// ADD PROJECT
// ======================================================

app.post(
  "/api/projects",
  authRequired,
  async (req, res) => {

    try {

      const name =
        String(
          req.body?.name || ""
        ).trim();


      const url =
        String(
          req.body?.url || ""
        ).trim();


      const intervalMinutes =
        Number(
          req.body?.interval ||
          10
        );


      if (!name) {

        return res.status(400).json({

          error:
            "Project name is required."

        });
      }


      let parsedUrl;


      try {

        parsedUrl =
          new URL(url);

      } catch {

        return res.status(400).json({

          error:
            "Enter a valid URL."

        });
      }


      if (
        ![
          "http:",
          "https:"
        ].includes(
          parsedUrl.protocol
        )
      ) {

        return res.status(400).json({

          error:
            "Only HTTP/HTTPS URLs are supported."

        });
      }


      if (
        ![
          5,
          10,
          15,
          30,
          60
        ].includes(
          intervalMinutes
        )
      ) {

        return res.status(400).json({

          error:
            "Invalid interval."

        });
      }


      const project =
        await Project.create({

          name,

          url,

          intervalMinutes

        });


      await pingProject(
        project
      );


      const saved =
        await Project
          .findById(
            project._id
          )
          .lean();


      res.status(201).json(
        saved
      );

    } catch (error) {

      if (
        error.code === 11000
      ) {

        return res.status(400).json({

          error:
            "This URL is already being monitored."

        });
      }


      res.status(400).json({

        error:
          String(
            error.message ||
            error
          )

      });
    }
  }
);


// ======================================================
// MANUAL PING
// ======================================================

app.post(
  "/api/projects/:id/ping",
  authRequired,
  async (req, res) => {

    try {

      const project =
        await Project.findById(
          req.params.id
        );


      if (!project) {

        return res.status(404).json({

          error:
            "Project not found."

        });
      }


      await pingProject(
        project
      );


      const updated =
        await Project
          .findById(
            project._id
          )
          .lean();


      res.json(
        updated
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });
    }
  }
);


// ======================================================
// PAUSE / RESUME
// ======================================================

app.patch(
  "/api/projects/:id",
  authRequired,
  async (req, res) => {

    try {

      const project =
        await Project.findById(
          req.params.id
        );


      if (!project) {

        return res.status(404).json({

          error:
            "Project not found."

        });
      }


      project.active =
        Boolean(
          req.body?.active
        );


      await project.save();


      res.json(
        project
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });
    }
  }
);


// ======================================================
// DELETE
// ======================================================

app.delete(
  "/api/projects/:id",
  authRequired,
  async (req, res) => {

    try {

      await Project
        .findByIdAndDelete(
          req.params.id
        );


      res.json({
        ok: true
      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });
    }
  }
);


// ======================================================
// HEALTH
// ======================================================

app.get(
  "/health",
  (_req, res) => {

    res.json({

      ok: true,

      service:
        "my-pinger",

      database:
        mongoose.connection
          .readyState === 1
          ? "connected"
          : "disconnected",

      time:
        new Date()
          .toISOString()

    });
  }
);


// ======================================================
// API 404
// ======================================================

app.use(
  "/api",
  (_req, res) => {

    res.status(404).json({

      error:
        "API route not found."

    });
  }
);


// ======================================================
// MONGODB CONNECTION
// ======================================================

mongoose
  .connect(
    MONGODB_URI
  )

  .then(() => {

    console.log(
      "MongoDB connected."
    );


    app.listen(
      PORT,
      () => {

        console.log(
          `My Pinger running on port ${PORT}`
        );

      }
    );

  })

  .catch(
    (error) => {

      console.error(
        "MongoDB connection failed:",
        error.message
      );

      process.exit(1);

    }
  );
