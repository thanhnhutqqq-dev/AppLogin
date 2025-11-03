import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ?? Supabase config
const SUPABASE_URL = "https://soxprvsxblsznvslxuhk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHBydnN4Ymxzem52c2x4dWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MDg3MTcsImV4cCI6MjA3NzM4NDcxN30.v9tR-dlYmr97A7nibCL-3sEHIkXvU_Pn7MMLqDx74q8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
if (typeof window !== "undefined") {
  window.__supabaseLogsActive = true;
}

// ?? DOM elements
const sheetSelector = document.getElementById("sheetSelector");
const captchaContainer = document.getElementById("captchaContainer");
const logListEl = document.getElementById("latestLog");
const renderCaptchaGlobal =
  (typeof window !== "undefined" && window.renderCaptcha) || null;

const DEFAULT_LOG_PLACEHOLDER = "No log entries yet.";

const logState = {
  latestStamp: null,
  latestMessage: null,
  hasRecord: false,
};

function getLogTimestampIso(log) {
  if (!log) {
    return null;
  }

  const rawTimestamp =
    log.created_at ??
    log.createdAt ??
    log.createdat ??
    log.inserted_at ??
    log.insertedAt ??
    null;

  if (!rawTimestamp) {
    return null;
  }

  const parsed = new Date(rawTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatSupabaseLog(log) {
  if (!log) {
    return DEFAULT_LOG_PLACEHOLDER;
  }

  const candidates = [
    typeof log.message === "string" ? log.message.trim() : "",
    typeof log.detail === "string" ? log.detail.trim() : "",
    typeof log.text === "string" ? log.text.trim() : "",
  ];

  const resolved = candidates.find((item) => Boolean(item));
  return resolved || DEFAULT_LOG_PLACEHOLDER;
}

function updateLatestLog(content) {
  if (!logListEl) {
    return;
  }

  const text =
    typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : "";

  logListEl.textContent = text || DEFAULT_LOG_PLACEHOLDER;
}

function resetLogDisplay() {
  logState.latestStamp = null;
  logState.latestMessage = null;
  logState.hasRecord = false;
  updateLatestLog("");
}

function setLatestLogFromRecord(log) {
  if (!log) {
    resetLogDisplay();
    return;
  }

  const stamp = getLogTimestampIso(log);
  const message =
    typeof log.message === "string" ? log.message.trim() : "";

  if (
    logState.hasRecord &&
    logState.latestStamp === stamp &&
    logState.latestMessage === message
  ) {
    return;
  }

  updateLatestLog(formatSupabaseLog(log));
  logState.latestStamp = stamp;
  logState.latestMessage = message;
  logState.hasRecord = true;
}

function prependLogEntry(log) {
  setLatestLogFromRecord(log);
}

resetLogDisplay();

const statusListeners = new Set();
const lastKnownStatusByBot = new Map();

function normalizeStatusValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value);
}

function notifyStatusListeners(botName, rawStatus, source = "realtime") {
  if (!botName) {
    return;
  }

  const normalizedStatus = normalizeStatusValue(rawStatus);
  const previousStatus = lastKnownStatusByBot.get(botName);
  if (previousStatus === normalizedStatus) {
    return;
  }

  lastKnownStatusByBot.set(botName, normalizedStatus);
  statusListeners.forEach((listener) => {
    try {
      listener({ botName, status: normalizedStatus, source });
    } catch (listenerError) {
      console.error("Realtime status listener failed:", listenerError);
    }
  });
}

function addCaptchaStatusListener(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

const showCaptcha = (value) => {
  if (renderCaptchaGlobal) {
    renderCaptchaGlobal(value);
  } else if (
    typeof window !== "undefined" &&
    typeof window.updateCaptchaDisplay === "function"
  ) {
    window.updateCaptchaDisplay(value);
  }
};

function applyQuizFeatureFlag(value, { silent = true } = {}) {
  const normalized = Boolean(value);
  if (
    typeof window !== "undefined" &&
    typeof window.setDashboardQuizFeatureState === "function"
  ) {
    window.setDashboardQuizFeatureState(normalized, { silent });
  } else if (typeof window !== "undefined") {
    window.__pendingQuizFeatureEnabled = normalized;
  }
}

function handleCaptchaUpdate(payload, { silent = true, botName = currentBot } = {}) {
  const imageValue = payload && Object.prototype.hasOwnProperty.call(payload, "image_base64")
    ? payload.image_base64
    : null;
  showCaptcha(imageValue || null);

  if (botName) {
    let statusValue = null;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "status")) {
      statusValue = payload.status;
    } else if (payload && Object.prototype.hasOwnProperty.call(payload, "status_text")) {
      statusValue = payload.status_text;
    }
    notifyStatusListeners(botName, statusValue, "captcha-update");
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, "quiz")) {
    let rawQuiz = payload.quiz;
    if (typeof rawQuiz === "string") {
      const normalizedString = rawQuiz.trim().toLowerCase();
      rawQuiz = ["true", "1", "yes", "on"].includes(normalizedString);
    } else if (typeof rawQuiz === "number") {
      rawQuiz = rawQuiz === 1;
    } else {
      rawQuiz = Boolean(rawQuiz);
    }

    const enableSilent = !rawQuiz;
    applyQuizFeatureFlag(rawQuiz, { silent: enableSilent });
    return;
  }

  if (!payload) {
    applyQuizFeatureFlag(false, { silent });
  }
}

let currentBot = "";
window.currentBot = currentBot;
let captchaChannel = null;
let logChannel = null;

// ??? Hi?n th? ?nh captcha
// ?? Render toàn b? log
function renderLogList(logs) {
  if (!logListEl) return;

  if (!Array.isArray(logs) || logs.length === 0) {
    resetLogDisplay();
    return;
  }

  const latestLog = logs[logs.length - 1];
  setLatestLogFromRecord(latestLog);
}

// ?? Khi user ch?n bot
sheetSelector.addEventListener("change", (e) => {
  const botName = e.target.value;
  if (!botName) return;
  currentBot = botName;
  window.currentBot = currentBot;
  resetLogDisplay();
  subscribeToCaptcha(botName);
  subscribeToLogs(botName);
});
// ?? L?y captcha m?i nh?t khi kh?i t?o ho?c ch?n user
async function loadLatestCaptcha(botName) {
  const { data, error } = await supabase
    .from("captchas")
    .select("image_base64, status, updated_at, quiz")
    .eq("name", botName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("? Error loading captcha:", error.message);
    handleCaptchaUpdate(null, { silent: true, botName });
    return;
  }

  handleCaptchaUpdate(data, { silent: true, botName });
}

// ?? L?y toàn b? log khi kh?i t?o
async function loadAllLogs(botName) {
  const { data, error } = await supabase
    .from("captcha_logs")
    .select("message, created_at")
    .eq("name", botName)
    .order("created_at", { ascending: true }); // log cu ? m?i

  if (error) {
    console.error("?? Error loading logs:", error.message);
    updateLatestLog("(Error loading logs)");
    return;
  }
  renderLogList(data);
}

function subscribeToCaptcha(botName) {
  if (captchaChannel) supabase.removeChannel(captchaChannel);

  captchaChannel = supabase
    .channel(`realtime-captcha-${botName}`)
    .on(
      "postgres_changes",
      {
        event: "*", // 👈 nhận cả INSERT, UPDATE, DELETE
        schema: "public",
        table: "captchas",
        filter: `name=eq.${botName}`,
      },
      (payload) => {
        const updated = payload?.new || null;
        console.log("⚡ Captcha realtime update:", updated);

        // 🧠 Truyền payload đầy đủ sang front
        handleCaptchaUpdate(updated, { silent: true, botName });

        // 🧩 Gửi thêm sự kiện global cho dashboard
        if (typeof window.addCaptchaStatusListener === "function") {
          window.dispatchEvent(
            new CustomEvent("supabase-captcha-update", { detail: updated })
          );
        }
      }
    )
    .subscribe(async (status) => {
      console.log(`✅ Captcha channel ${botName}:`, status);
      if (status === "SUBSCRIBED") {
        await loadLatestCaptcha(botName);
      }
    });
}

// ?? Theo dõi realtime logs
function subscribeToLogs(botName) {
  if (logChannel) supabase.removeChannel(logChannel);

  logChannel = supabase
    .channel(`realtime-logs-${botName}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "captcha_logs",
        filter: `name=eq.${botName}`,
      },
      (payload) => {
        if (payload?.new) {
          prependLogEntry(payload.new);
        }
      }
    )
    .subscribe(async (status) => {
      console.log(`?? Log channel ${botName}:`, status);
      if (status === "SUBSCRIBED") {
        await loadAllLogs(botName);
      }
    });
}

window.addEventListener("supabase-captcha-update", (event) => {
  const detail = event.detail || {};
  const botName = detail.name;
  const base64Value = detail.image_base64 ?? null;

  if (window.currentBot && botName === window.currentBot) {
    console.log("🪄 Realtime image update for current bot:", base64Value);
    if (typeof window.updateCaptchaDisplay === "function") {
      window.updateCaptchaDisplay(base64Value);
    }

    if ("quiz" in detail && typeof window.setDashboardQuizFeatureState === "function") {
      const enable = Boolean(detail.quiz);
      window.setDashboardQuizFeatureState(enable, { silent: !enable });
    }
  }
});

if (typeof window !== "undefined") {
  window.subscribeToCaptcha = subscribeToCaptcha;
  window.subscribeToLogs = subscribeToLogs;
  window.addCaptchaStatusListener = addCaptchaStatusListener;
  if (typeof window.onCaptchaStatusSupportReady === "function") {
    try {
      window.onCaptchaStatusSupportReady();
    } catch (error) {
      console.error("Failed to notify dashboard about status listener support:", error);
    }
  }
}
