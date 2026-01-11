async function fetchConfig() {
  const res = await fetch("/api/config");
  return res.json();
}

async function fetchLogs() {
  const res = await fetch("/api/logs", { cache: "no-store" });
  return res.json();
}

async function fetchArchive() {
  const res = await fetch("/api/archive", { cache: "no-store" });
  return res.json();
}

let currentBotId = "";
let cachedBots = [];
const THEME_KEY = "webpost-theme";

function setHint(el, message, type) {
  el.textContent = message;
  el.className = "hint";
  if (type === "error") {
    el.classList.add("hint--error");
  }
  if (type === "success") {
    el.classList.add("hint--success");
  }
}

function renderChannels(channels) {
  const list = document.getElementById("channel-list");
  const select = document.getElementById("channel-select");
  list.innerHTML = "";
  select.innerHTML = "";

  if (!channels.length) {
    list.textContent = "No channels yet.";
    const empty = document.createElement("div");
    empty.textContent = "Add a channel first.";
    select.appendChild(empty);
    return;
  }

  channels.forEach((channel) => {
    const item = document.createElement("div");
    item.className = "list__item";
    const label = document.createElement("span");
    label.textContent = channel;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeChannel(channel));
    item.appendChild(label);
    item.appendChild(remove);
    list.appendChild(item);

    const wrapper = document.createElement("label");
    wrapper.className = "channel-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "channels";
    checkbox.value = channel;
    const text = document.createElement("span");
    text.textContent = channel;
    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    select.appendChild(wrapper);
  });
}

function renderBots(bots) {
  const list = document.getElementById("bot-list");
  const select = document.getElementById("bot-select");
  list.innerHTML = "";
  select.innerHTML = "";

  if (!bots.length) {
    list.textContent = "No bots yet.";
    const option = document.createElement("option");
    option.textContent = "Add a bot first";
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
    return;
  }

  bots.forEach((bot) => {
    const item = document.createElement("div");
    item.className = "list__item";
    const label = document.createElement("span");
    label.textContent = bot.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeBot(bot.id));
    item.appendChild(label);
    item.appendChild(remove);
    list.appendChild(item);

    const option = document.createElement("option");
    option.value = bot.id;
    option.textContent = bot.name;
    select.appendChild(option);
  });

  const selected =
    bots.find((bot) => bot.id === currentBotId) || bots[0] || null;
  if (selected) {
    select.value = selected.id;
    currentBotId = selected.id;
  }
}

function renderLogs(logs) {
  const list = document.getElementById("log-list");
  list.innerHTML = "";
  if (!logs.length) {
    list.textContent = "No logs yet.";
    return;
  }

  logs.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "list__item";
    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "log__title";
    const kind = entry.hasImage ? "Image" : "Text";
    title.textContent = `${kind} post (${entry.status || "unknown"})`;
    const meta = document.createElement("div");
    meta.className = "log__meta";
    const successCount = Array.isArray(entry.success) ? entry.success.length : 0;
    const failCount = Array.isArray(entry.failed) ? entry.failed.length : 0;
    const channels = Array.isArray(entry.channels)
      ? entry.channels.join(", ")
      : "";
    meta.textContent = `${entry.at} · Channels: ${channels} · Success: ${successCount} · Failed: ${failCount}`;
    content.appendChild(title);
    content.appendChild(meta);

    if (entry.text) {
      const textLine = document.createElement("div");
      textLine.className = "log__meta";
      textLine.textContent = `Text: ${entry.text}`;
      content.appendChild(textLine);
    }

    if (entry.imageName) {
      const imageLine = document.createElement("div");
      imageLine.className = "log__meta";
      imageLine.textContent = `Image: ${entry.imageName}`;
      content.appendChild(imageLine);
    }

    if (entry.buttonText || entry.buttonUrl) {
      const buttonLine = document.createElement("div");
      buttonLine.className = "log__meta";
      buttonLine.textContent = `Button: ${entry.buttonText || "-"} · ${entry.buttonUrl || "-"}`;
      content.appendChild(buttonLine);
    }

    if (entry.error) {
      const errorLine = document.createElement("div");
      errorLine.className = "log__meta";
      errorLine.textContent = `Error: ${entry.error}`;
      content.appendChild(errorLine);
    }

    if (Array.isArray(entry.failed) && entry.failed.length) {
      const failedLine = document.createElement("div");
      failedLine.className = "log__meta";
      const details = entry.failed
        .map((fail) => `${fail.channel}: ${fail.error}`)
        .join("; ");
      failedLine.textContent = `Failed: ${details}`;
      content.appendChild(failedLine);
    }

    item.appendChild(content);
    list.appendChild(item);
  });
}

function renderArchive(items) {
  const list = document.getElementById("archive-list");
  list.innerHTML = "";
  if (!items.length) {
    list.textContent = "No archived posts yet.";
    return;
  }

  items.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "list__item";
    const content = document.createElement("div");
    content.className = "archive-item";
    const title = document.createElement("div");
    title.className = "log__title";
    title.textContent = `${entry.at} · ${entry.botName || "Bot"}`;
    content.appendChild(title);

    if (entry.text) {
      const textLine = document.createElement("div");
      textLine.className = "log__meta";
      textLine.textContent = `Text: ${entry.text}`;
      content.appendChild(textLine);
    }

    if (entry.buttonText || entry.buttonUrl) {
      const buttonLine = document.createElement("div");
      buttonLine.className = "log__meta";
      buttonLine.textContent = `Button: ${entry.buttonText || "-"} · ${entry.buttonUrl || "-"}`;
      content.appendChild(buttonLine);
    }

    if (entry.imageUrl) {
      const img = document.createElement("img");
      img.className = "archive-image";
      img.src = entry.imageUrl;
      img.alt = entry.imageName || "image";
      content.appendChild(img);
    }

    const channels = Array.isArray(entry.channels)
      ? entry.channels.join(", ")
      : "";
    const meta = document.createElement("div");
    meta.className = "log__meta";
    meta.textContent = `Channels: ${channels}`;
    content.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "archive-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit in Send";
    edit.addEventListener("click", () => fillSendFromArchive(entry));
    actions.appendChild(edit);
    content.appendChild(actions);

    item.appendChild(content);
    list.appendChild(item);
  });
}

async function loadConfig() {
  const config = await fetchConfig();
  cachedBots = config.bots || [];
  renderBots(cachedBots);
  const selectedBot = cachedBots.find((bot) => bot.id === currentBotId) || null;
  renderChannels(selectedBot ? selectedBot.channels || [] : []);
}

async function loadLogs() {
  const data = await fetchLogs();
  renderLogs(data.logs || []);
}

async function loadArchive() {
  const data = await fetchArchive();
  renderArchive(data.archive || []);
}

async function addBot(event) {
  event.preventDefault();
  const status = document.getElementById("bot-status");
  const form = event.target;
  const name = form.name.value.trim();
  const token = form.token.value.trim();
  if (!name || !token) {
    setHint(status, "Bot name and token are required.", "error");
    return;
  }
  const res = await fetch("/api/bots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setHint(status, data.error || "Failed to add bot.", "error");
    return;
  }
  form.reset();
  setHint(status, "Bot added.", "success");
  await loadConfig();
}

async function removeBot(id) {
  await fetch("/api/bots", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await loadConfig();
}

async function addChannel(event) {
  event.preventDefault();
  const form = event.target;
  const channel = form.channel.value.trim();
  const botId = document.getElementById("bot-select").value;
  if (!channel) {
    return;
  }
  if (!botId) {
    return;
  }
  const res = await fetch("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, botId }),
  });
  if (res.ok) {
    form.reset();
    await loadConfig();
  }
}

async function removeChannel(channel) {
  const botId = document.getElementById("bot-select").value;
  await fetch("/api/channels", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, botId }),
  });
  await loadConfig();
}

async function sendPost(event) {
  event.preventDefault();
  const status = document.getElementById("post-status");
  const timer = document.getElementById("send-timer");
  const form = event.target;

  const selected = Array.from(
    form.querySelectorAll("input[name='channels']:checked")
  ).map((input) => input.value);
  const botId = form.botId.value;
  const text = form.text.value.trim();
  const buttonText = form.buttonText.value.trim();
  const buttonUrl = form.buttonUrl.value.trim();
  const imageFile = form.image.files[0];
  const delaySec = Number(form.delaySec.value || 0);
  const archiveId = form.archiveId.value;

  if (!selected.length) {
    setHint(status, "Select at least one channel.", "error");
    return;
  }

  if (!botId) {
    setHint(status, "Select a bot.", "error");
    return;
  }

  if (!text && !imageFile) {
    setHint(status, "Text or image is required.", "error");
    return;
  }

  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
    setHint(status, "Both button text and URL are required.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("channels", JSON.stringify(selected));
  formData.append("botId", botId);
  formData.append("text", text);
  formData.append("buttonText", buttonText);
  formData.append("buttonUrl", buttonUrl);
  formData.append("delaySec", Number.isFinite(delaySec) ? delaySec : 0);
  if (archiveId) {
    formData.append("archiveId", archiveId);
  }
  if (imageFile) {
    formData.append("image", imageFile);
  }

  let timerId = null;
  if (delaySec > 0 && selected.length > 1) {
    let nextIn = delaySec;
    setHint(timer, `Next send in ${nextIn}s`, "success");
    timerId = setInterval(() => {
      nextIn -= 1;
      if (nextIn <= 0) {
        nextIn = delaySec;
      }
      setHint(timer, `Next send in ${nextIn}s`, "success");
    }, 1000);
  } else {
    setHint(timer, "", "");
  }

  const res = await fetch("/api/send", {
    method: "POST",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (timerId) {
    clearInterval(timerId);
  }
  setHint(timer, "", "");
  if (!res.ok) {
    setHint(status, data.error || "Failed to send.", "error");
    return;
  }
  form.reset();
  setHint(status, "Message sent.", "success");
  await loadLogs();
  await loadArchive();
}

async function resendArchive(id) {
  const status = document.getElementById("archive-status");
  setHint(status, "Sending archived post...", "success");
  const res = await fetch("/api/archive/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setHint(status, data.error || "Failed to send archived post.", "error");
    return;
  }
  setHint(status, "Archived post sent.", "success");
  await loadLogs();
}

function fillSendFromArchive(entry) {
  const form = document.getElementById("post-form");
  const status = document.getElementById("archive-status");
  form.text.value = entry.text || "";
  form.buttonText.value = entry.buttonText || "";
  form.buttonUrl.value = entry.buttonUrl || "";
  form.delaySec.value = 1;
  if (entry.botId) {
    document.getElementById("bot-select").value = entry.botId;
    currentBotId = entry.botId;
    const selectedBot = cachedBots.find((bot) => bot.id === currentBotId) || null;
    renderChannels(selectedBot ? selectedBot.channels || [] : []);
  }
  const selected = new Set(entry.channels || []);
  document
    .querySelectorAll("input[name='channels']")
    .forEach((input) => {
      input.checked = selected.has(input.value);
    });

  const archiveIdInput = document.getElementById("archive-id");
  const preview = document.getElementById("archive-preview");
  archiveIdInput.value = entry.id || "";
  preview.innerHTML = "";
  if (entry.hasImage && entry.imageUrl) {
    const note = document.createElement("div");
    note.textContent =
      "Using archived image. Upload a new image to replace it.";
    const img = document.createElement("img");
    img.src = entry.imageUrl;
    img.alt = entry.imageName || "image";
    preview.appendChild(note);
    preview.appendChild(img);
  } else {
    preview.textContent = "No archived image.";
  }

  setHint(status, "Archived post loaded into Send form.", "success");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.getElementById("bot-form").addEventListener("submit", addBot);
document.getElementById("channel-form").addEventListener("submit", addChannel);
document.getElementById("post-form").addEventListener("submit", sendPost);
document
  .getElementById("bot-select")
  .addEventListener("change", (event) => {
    currentBotId = event.target.value;
    const selectedBot = cachedBots.find((bot) => bot.id === currentBotId) || null;
    renderChannels(selectedBot ? selectedBot.channels || [] : []);
  });

document.querySelector("input[name='image']").addEventListener("change", (e) => {
  const archiveIdInput = document.getElementById("archive-id");
  const preview = document.getElementById("archive-preview");
  if (e.target.files && e.target.files.length) {
    archiveIdInput.value = "";
    preview.textContent = "New image selected.";
  }
});

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const button = document.getElementById("theme-toggle");
  button.textContent = theme === "dark" ? "Dark" : "Light";
}

const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(savedTheme);
document.getElementById("theme-toggle").addEventListener("click", () => {
  const current = localStorage.getItem(THEME_KEY) || "dark";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

loadConfig();
loadLogs();
loadArchive();

setInterval(loadLogs, 5000);
setInterval(loadArchive, 5000);
