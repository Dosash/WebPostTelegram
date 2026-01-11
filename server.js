const express = require("express");
const fs = require("fs");
const path = require("path");
const https = require("https");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const LOG_PATH = path.join(DATA_DIR, "logs.json");
const MAX_LOGS = 200;
const ARCHIVE_PATH = path.join(DATA_DIR, "archive.json");
const MAX_ARCHIVE = 200;
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const SEND_DELAY_MS = 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

function ensureConfig() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial = { token: "", channels: [] };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readConfig() {
  ensureConfig();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.bots)) {
      const bots = parsed.bots.map((bot) => ({
        ...bot,
        channels: Array.isArray(bot.channels) ? bot.channels : [],
      }));
      return {
        bots,
      };
    }
    if (typeof parsed.token === "string" && parsed.token.trim()) {
      return {
        bots: [
          {
            id: "default",
            name: "Default bot",
            token: parsed.token.trim(),
            channels: Array.isArray(parsed.channels) ? parsed.channels : [],
          },
        ],
      };
    }
    return {
      bots: [],
    };
  } catch {
    return { bots: [] };
  }
}

function writeConfig(config) {
  ensureConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function ensureArchive() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARCHIVE_PATH)) {
    fs.writeFileSync(ARCHIVE_PATH, JSON.stringify([], null, 2), "utf8");
  }
}

function readArchive() {
  ensureArchive();
  try {
    const raw = fs.readFileSync(ARCHIVE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendArchive(entry) {
  const archive = readArchive();
  archive.unshift(entry);
  if (archive.length > MAX_ARCHIVE) {
    archive.length = MAX_ARCHIVE;
  }
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureLogs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, JSON.stringify([], null, 2), "utf8");
  }
}

function readLogs() {
  ensureLogs();
  try {
    const raw = fs.readFileSync(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const logs = readLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2), "utf8");
}

function buildLogBase({ channels, text, hasImage, buttonText, buttonUrl, image }) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const preview =
    trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
  return {
    at: new Date().toISOString(),
    channels: Array.isArray(channels) ? channels : [],
    text: preview,
    hasImage: Boolean(hasImage),
    imageName: image || "",
    buttonText: buttonText ? String(buttonText).trim() : "",
    buttonUrl: buttonUrl ? String(buttonUrl).trim() : "",
  };
}

function telegramJsonRequest(token, method, payload) {
  const body = JSON.stringify(payload);
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${token}/${method}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.description || "Telegram error"));
            return;
          }
          resolve(parsed.result);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function telegramMultipartRequest(token, method, fields, fileField) {
  const boundary = `----WebPostBoundary${Date.now()}`;
  const buffers = [];

  function pushField(name, value) {
    buffers.push(Buffer.from(`--${boundary}\r\n`));
    buffers.push(
      Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    );
    buffers.push(Buffer.from(String(value)));
    buffers.push(Buffer.from("\r\n"));
  }

  Object.entries(fields).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      pushField(name, value);
    }
  });

  if (fileField) {
    buffers.push(Buffer.from(`--${boundary}\r\n`));
    buffers.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n`
      )
    );
    buffers.push(
      Buffer.from(`Content-Type: ${fileField.contentType}\r\n\r\n`)
    );
    buffers.push(fileField.data);
    buffers.push(Buffer.from("\r\n"));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(buffers);

  const options = {
    hostname: "api.telegram.org",
    path: `/bot${token}/${method}`,
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.description || "Telegram error"));
            return;
          }
          resolve(parsed.result);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getContentTypeByExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

app.get("/api/config", (req, res) => {
  const config = readConfig();
  res.json({
    bots: config.bots || [],
  });
});

app.get("/api/logs", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ logs: readLogs() });
});

app.get("/api/archive", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ archive: readArchive() });
});

app.post("/api/bots", (req, res) => {
  const { name, token } = req.body || {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Bot name is required." });
    return;
  }
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Bot token is required." });
    return;
  }
  const config = readConfig();
  const newBot = {
    id: `bot_${Date.now()}`,
    name: name.trim(),
    token: token.trim(),
    channels: [],
  };
  config.bots = Array.isArray(config.bots) ? config.bots : [];
  config.bots.push(newBot);
  writeConfig(config);
  res.json({ ok: true, bots: config.bots });
});

app.delete("/api/bots", (req, res) => {
  const { id } = req.body || {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Bot id is required." });
    return;
  }
  const config = readConfig();
  config.bots = (config.bots || []).filter((bot) => bot.id !== id);
  writeConfig(config);
  res.json({ ok: true, bots: config.bots });
});

app.post("/api/channels", (req, res) => {
  const { channel, botId } = req.body || {};
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ error: "Channel is required." });
    return;
  }
  if (!botId || typeof botId !== "string") {
    res.status(400).json({ error: "Bot id is required." });
    return;
  }
  const config = readConfig();
  const bot = (config.bots || []).find((item) => item.id === botId);
  if (!bot) {
    res.status(400).json({ error: "Bot not found." });
    return;
  }
  const trimmed = channel.trim();
  bot.channels = Array.isArray(bot.channels) ? bot.channels : [];
  if (!bot.channels.includes(trimmed)) {
    bot.channels.push(trimmed);
  }
  writeConfig(config);
  res.json({ ok: true, channels: bot.channels });
});

app.delete("/api/channels", (req, res) => {
  const { channel, botId } = req.body || {};
  if (!channel || typeof channel !== "string") {
    res.status(400).json({ error: "Channel is required." });
    return;
  }
  if (!botId || typeof botId !== "string") {
    res.status(400).json({ error: "Bot id is required." });
    return;
  }
  const config = readConfig();
  const bot = (config.bots || []).find((item) => item.id === botId);
  if (!bot) {
    res.status(400).json({ error: "Bot not found." });
    return;
  }
  bot.channels = (bot.channels || []).filter((item) => item !== channel);
  writeConfig(config);
  res.json({ ok: true, channels: bot.channels });
});

app.post("/api/send", upload.single("image"), async (req, res) => {
  const config = readConfig();
  const { botId, channels, text, buttonText, buttonUrl, delaySec, archiveId } =
    req.body || {};
  const selectedBot =
    (config.bots || []).find((bot) => bot.id === botId) || null;
  if (!selectedBot) {
    appendLog({
      ...buildLogBase({
        channels: [],
        text: "",
        hasImage: false,
        buttonText: "",
        buttonUrl: "",
        image: "",
      }),
      status: "rejected",
      error: "Bot is not selected.",
    });
    res.status(400).json({ error: "Bot is not selected." });
    return;
  }

  let targetChannels = [];
  if (Array.isArray(channels)) {
    targetChannels = channels.map((item) => String(item).trim()).filter(Boolean);
  } else if (typeof channels === "string") {
    try {
      const parsed = JSON.parse(channels);
      if (Array.isArray(parsed)) {
        targetChannels = parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      targetChannels = channels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!targetChannels.length) {
    appendLog({
      ...buildLogBase({
        channels: [],
        text,
        hasImage: Boolean(req.file),
        buttonText,
        buttonUrl,
        image: req.file ? req.file.originalname : "",
      }),
      status: "rejected",
      error: "At least one channel is required.",
    });
    res.status(400).json({ error: "At least one channel is required." });
    return;
  }

  const trimmedText = typeof text === "string" ? text.trim() : "";
  let hasImage = Boolean(req.file);
  let archiveImageBuffer = null;
  let archiveImageName = "";
  let archiveImageContentType = "";
  if (!hasImage && archiveId) {
    const archive = readArchive();
    const entry = archive.find((item) => item.id === archiveId);
    if (entry && entry.hasImage && entry.imageUrl) {
      const filename = path.basename(entry.imageUrl);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        archiveImageBuffer = fs.readFileSync(filePath);
        archiveImageName = entry.imageName || filename;
        archiveImageContentType = getContentTypeByExt(filename);
        hasImage = true;
      }
    }
  }
  if (!trimmedText && !hasImage) {
    appendLog({
      ...buildLogBase({
        channels: targetChannels,
        text,
        hasImage,
        buttonText,
        buttonUrl,
        image: req.file ? req.file.originalname : "",
      }),
      status: "rejected",
      error: "Text or image is required.",
    });
    res.status(400).json({ error: "Text or image is required." });
    return;
  }

  const hasButtonText = typeof buttonText === "string" && buttonText.trim();
  const hasButtonUrl = typeof buttonUrl === "string" && buttonUrl.trim();
  if ((hasButtonText && !hasButtonUrl) || (!hasButtonText && hasButtonUrl)) {
    appendLog({
      ...buildLogBase({
        channels: targetChannels,
        text,
        hasImage,
        buttonText,
        buttonUrl,
        image: req.file ? req.file.originalname : "",
      }),
      status: "rejected",
      error: "Both button text and URL are required.",
    });
    res.status(400).json({ error: "Both button text and URL are required." });
    return;
  }

  const replyMarkup = hasButtonText
    ? {
        inline_keyboard: [
          [
            {
              text: buttonText.trim(),
              url: buttonUrl.trim(),
            },
          ],
        ],
      }
    : undefined;

  let imageName = "";
  let imageUrl = "";
  if (req.file) {
    ensureArchive();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}_${safeName}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    imageName = req.file.originalname || filename;
    imageUrl = `/uploads/${filename}`;
  } else if (archiveImageName) {
    imageName = archiveImageName;
  }

  const succeeded = [];
  const failed = [];
  const delayMs = Number.isFinite(Number(delaySec))
    ? Math.max(0, Number(delaySec) * 1000)
    : SEND_DELAY_MS;
  for (const channel of targetChannels) {
    try {
      if (hasImage) {
        const caption = trimmedText || undefined;
        await telegramMultipartRequest(
          selectedBot.token,
          "sendPhoto",
          {
            chat_id: channel,
            caption,
            parse_mode: trimmedText ? "HTML" : undefined,
            reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
          },
          {
            name: "photo",
            filename: req.file
              ? req.file.originalname || "image"
              : archiveImageName || "image",
            contentType: req.file
              ? req.file.mimetype || "application/octet-stream"
              : archiveImageContentType || "application/octet-stream",
            data: req.file ? req.file.buffer : archiveImageBuffer,
          }
        );
      } else {
        await telegramJsonRequest(selectedBot.token, "sendMessage", {
          chat_id: channel,
          text: trimmedText,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
      }
      succeeded.push(channel);
    } catch (err) {
      failed.push({ channel, error: err.message || "Failed to send." });
    }
    if (delayMs && channel !== targetChannels[targetChannels.length - 1]) {
      await sleep(delayMs);
    }
  }

  appendLog({
    ...buildLogBase({
      channels: targetChannels,
      text,
      hasImage,
      buttonText,
      buttonUrl,
      image: req.file ? req.file.originalname : "",
    }),
    status: failed.length ? "partial" : "success",
    success: succeeded,
    failed,
  });

  appendArchive({
    id: `post_${Date.now()}`,
    at: new Date().toISOString(),
    botId: selectedBot.id,
    botName: selectedBot.name,
    channels: targetChannels,
    text: trimmedText,
    hasImage,
    imageName,
    imageUrl: imageUrl || "",
    buttonText: hasButtonText ? buttonText.trim() : "",
    buttonUrl: hasButtonUrl ? buttonUrl.trim() : "",
  });

  if (failed.length) {
    res.status(207).json({ ok: false, success: succeeded, failed });
    return;
  }

  res.json({ ok: true, success: succeeded });
});

app.post("/api/archive/send", async (req, res) => {
  const { id, delaySec } = req.body || {};
  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Archive id is required." });
    return;
  }
  const config = readConfig();
  const archive = readArchive();
  const entry = archive.find((item) => item.id === id);
  if (!entry) {
    res.status(404).json({ error: "Archive entry not found." });
    return;
  }
  const selectedBot =
    (config.bots || []).find((bot) => bot.id === entry.botId) || null;
  if (!selectedBot) {
    appendLog({
      ...buildLogBase({
        channels: entry.channels || [],
        text: entry.text || "",
        hasImage: entry.hasImage,
        buttonText: entry.buttonText,
        buttonUrl: entry.buttonUrl,
        image: entry.imageName,
      }),
      status: "rejected",
      error: "Bot not found for archive entry.",
      source: "archive",
    });
    res.status(400).json({ error: "Bot not found for archive entry." });
    return;
  }

  const replyMarkup =
    entry.buttonText && entry.buttonUrl
      ? {
          inline_keyboard: [
            [
              {
                text: entry.buttonText,
                url: entry.buttonUrl,
              },
            ],
          ],
        }
      : undefined;

  let imageBuffer = null;
  let imageFilename = "";
  let imageContentType = "";
  if (entry.hasImage && entry.imageUrl) {
    const filename = path.basename(entry.imageUrl);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      imageBuffer = fs.readFileSync(filePath);
      imageFilename = entry.imageName || filename;
      imageContentType = getContentTypeByExt(filename);
    } else {
      appendLog({
        ...buildLogBase({
          channels: entry.channels || [],
          text: entry.text || "",
          hasImage: entry.hasImage,
          buttonText: entry.buttonText,
          buttonUrl: entry.buttonUrl,
          image: entry.imageName,
        }),
        status: "rejected",
        error: "Archive image file is missing.",
        source: "archive",
      });
      res.status(400).json({ error: "Archive image file is missing." });
      return;
    }
  }

  const targetChannels = Array.isArray(entry.channels)
    ? entry.channels
    : [];
  if (!targetChannels.length) {
    res.status(400).json({ error: "Archive entry has no channels." });
    return;
  }

  const succeeded = [];
  const failed = [];
  const delayMs = Number.isFinite(Number(delaySec))
    ? Math.max(0, Number(delaySec) * 1000)
    : SEND_DELAY_MS;
  for (const channel of targetChannels) {
    try {
      if (entry.hasImage && imageBuffer) {
        const caption = entry.text || undefined;
        await telegramMultipartRequest(
          selectedBot.token,
          "sendPhoto",
          {
            chat_id: channel,
            caption,
            parse_mode: caption ? "HTML" : undefined,
            reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
          },
          {
            name: "photo",
            filename: imageFilename || "image",
            contentType: imageContentType,
            data: imageBuffer,
          }
        );
      } else {
        await telegramJsonRequest(selectedBot.token, "sendMessage", {
          chat_id: channel,
          text: entry.text || "",
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
      }
      succeeded.push(channel);
    } catch (err) {
      failed.push({ channel, error: err.message || "Failed to send." });
    }
    if (delayMs && channel !== targetChannels[targetChannels.length - 1]) {
      await sleep(delayMs);
    }
  }

  appendLog({
    ...buildLogBase({
      channels: targetChannels,
      text: entry.text || "",
      hasImage: entry.hasImage,
      buttonText: entry.buttonText,
      buttonUrl: entry.buttonUrl,
      image: entry.imageName,
    }),
    status: failed.length ? "partial" : "success",
    success: succeeded,
    failed,
    source: "archive",
  });

  if (failed.length) {
    res.status(207).json({ ok: false, success: succeeded, failed });
    return;
  }
  res.json({ ok: true, success: succeeded });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WebPost running on http://localhost:${PORT}`);
});
