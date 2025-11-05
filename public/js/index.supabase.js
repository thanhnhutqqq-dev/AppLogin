import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ?? Supabase config
const SUPABASE_URL = "https://soxprvsxblsznvslxuhk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHBydnN4Ymxzem52c2x4dWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MDg3MTcsImV4cCI6MjA3NzM4NDcxN30.v9tR-dlYmr97A7nibCL-3sEHIkXvU_Pn7MMLqDx74q8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function setRealtimeActive(active) {
  if (typeof window === "undefined") {
    return;
  }
  window.__supabaseLogsActive = Boolean(active);
}

setRealtimeActive(false);

// ?? DOM elements
const sheetSelector = document.getElementById("sheetSelector");
const captchaContainer = document.getElementById("captchaContainer");
const logListEl = document.getElementById("latestLog");
const renderCaptchaGlobal =
  (typeof window !== "undefined" && window.renderCaptcha) || null;

const DEFAULT_LOG_PLACEHOLDER = "No log entries yet.";
const PC_LOG_TABLE_PRIMARY = "pc_log";
const PC_LOG_TABLE_FALLBACK = "pc_logs";
const PC_CONTROL_ALLOWED_USER = "phamthanhnhut";
const PC_LOG_POLL_INTERVAL_MS = 2000;

let pcControlChannel = null;
let pcLogChannel = null;
let lastPcControlBot = null;
let lastPcLogBot = null;
let cachedPcControlValue = null;
let cachedPcLogs = [];
let resolvedPcLogTable = PC_LOG_TABLE_PRIMARY;
let pendingPcControlValue = null;
let pendingPcControlTimer = null;
let pcLogPollingTimer = null;

function isPcControlAllowed(botName) {
  if (!botName) {
    return false;
  }
  return botName === PC_CONTROL_ALLOWED_USER;
}

function clearPendingPcControl() {
  if (pendingPcControlTimer) {
    clearTimeout(pendingPcControlTimer);
    pendingPcControlTimer = null;
  }
  pendingPcControlValue = null;
}

function setPendingPcControl(value) {
  clearPendingPcControl();
  if (!value) {
    return;
  }
  pendingPcControlValue = value;
  pendingPcControlTimer = setTimeout(() => {
    pendingPcControlValue = null;
    pendingPcControlTimer = null;
  }, 5000);
}

function startPcLogPolling(botName) {
  if (!botName || !isPcControlAllowed(botName)) {
    stopPcLogPolling();
    return;
  }
  stopPcLogPolling();
  pcLogPollingTimer = setInterval(() => {
    loadPcLogs(botName).catch((error) =>
      console.error("PC log polling failed:", error)
    );
  }, PC_LOG_POLL_INTERVAL_MS);
}

function stopPcLogPolling() {
  if (pcLogPollingTimer) {
    clearInterval(pcLogPollingTimer);
    pcLogPollingTimer = null;
  }
}

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

function normalizePcControlValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const upper = String(value).trim().toUpperCase();
  if (upper === "ON" || upper === "OFF") {
    return upper;
  }
  return "";
}

function notifyPcControlValue(value) {
  const resolved = normalizePcControlValue(value) || "OFF";
  if (typeof window === "undefined") {
    return;
  }
  if (typeof window.setPcControlState === "function") {
    window.setPcControlState(resolved);
  } else {
    window.__pendingPcControlState = resolved;
  }
}

function setCachedPcControlValue(nextValue, { force = false } = {}) {
  const resolved = normalizePcControlValue(nextValue) || "OFF";
  if (!force && pendingPcControlValue && pendingPcControlValue !== resolved) {
    return;
  }
  if (cachedPcControlValue === resolved && !force) {
    if (pendingPcControlValue === resolved) {
      clearPendingPcControl();
    }
    return;
  }
  cachedPcControlValue = resolved;
  notifyPcControlValue(resolved);
  if (pendingPcControlValue === resolved || force) {
    clearPendingPcControl();
  }
}

function notifyPcLogs(logs) {
  if (typeof window === "undefined") {
    return;
  }
  const payload = Array.isArray(logs) ? logs.slice(0, 5) : [];
  if (typeof window.setPcLogs === "function") {
    window.setPcLogs(payload);
  } else {
    window.__pendingPcLogs = payload;
  }
}

function sanitizePcLogEntry(entry) {
  if (!entry) {
    return null;
  }
  const message =
    entry && Object.prototype.hasOwnProperty.call(entry, "message")
      ? String(entry.message ?? "").trim()
      : "";
  const state =
    typeof entry.state === "string" ? entry.state.trim() : "";
  const action =
    typeof entry.action === "string" ? entry.action.trim() : "";
  const level =
    typeof entry.level === "string" ? entry.level.trim() : "";
  const error =
    entry && Object.prototype.hasOwnProperty.call(entry, "error")
      ? String(entry.error ?? "").trim()
      : "";
  const createdAt =
    entry.created_at ||
    entry.createdAt ||
    entry.inserted_at ||
    entry.insertedAt ||
    null;

  return {
    message,
    created_at: createdAt,
    state,
    action,
    level,
    error,
  };
}

function setCachedPcLogs(entries) {
  const sanitized = Array.isArray(entries)
    ? entries
        .map((item) => sanitizePcLogEntry(item))
        .filter((item) => Boolean(item))
    : [];
  cachedPcLogs = sanitized.slice(0, 5);
  notifyPcLogs(cachedPcLogs);
}

function pushCachedPcLog(entry) {
  const sanitized = sanitizePcLogEntry(entry);
  if (!sanitized) {
    return;
  }
  const next = [sanitized, ...cachedPcLogs];
  cachedPcLogs = next.slice(0, 5);
  notifyPcLogs(cachedPcLogs);
}

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
  const allowPcControl = isPcControlAllowed(botName);
  subscribeToPcControl(allowPcControl ? botName : null);
  subscribeToPcLogs(allowPcControl ? botName : null);
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
    setRealtimeActive(false);
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

async function loadPcControlValue(botName) {
  if (!botName) {
    setCachedPcControlValue("OFF", { force: true });
    clearPendingPcControl();
    return;
  }

  const { data, error } = await supabase
    .from("captchas")
    .select("pc_control")
    .eq("name", botName)
    .maybeSingle();

  if (error) {
    console.error("PC control fetch error:", error.message);
    return;
  }

  const value = data ? data.pc_control : null;
  setCachedPcControlValue(value);
}

async function updatePcControlValue(botName, value) {
  if (!botName) {
    throw new Error("Missing bot name.");
  }

  if (!isPcControlAllowed(botName)) {
    throw new Error('PC Control is only available for user "phamthanhnhut".');
  }

  const normalized = normalizePcControlValue(value) || "OFF";
  setPendingPcControl(normalized);
  const { error } = await supabase
    .from("captchas")
    .update({ pc_control: normalized })
    .eq("name", botName);

  if (error) {
    clearPendingPcControl();
    throw new Error(error.message || "Failed to update PC control.");
  }

  setCachedPcControlValue(normalized, { force: true });
  return { success: true, value: normalized };
}

async function fetchPcLogs(botName, tableName) {
  return supabase
    .from(tableName)
    .select("message, created_at, state, action, level, error")
    .eq("name", botName)
    .order("created_at", { ascending: false })
    .limit(5);
}

async function loadPcLogs(botName) {
  if (!botName) {
    setCachedPcLogs([]);
    return;
  }

  let tableName = resolvedPcLogTable || PC_LOG_TABLE_PRIMARY;
  let { data, error } = await fetchPcLogs(botName, tableName);

  if (error && error.code === "42P01" && tableName !== PC_LOG_TABLE_FALLBACK) {
    tableName = PC_LOG_TABLE_FALLBACK;
    ({ data, error } = await fetchPcLogs(botName, tableName));
  }

  if (error) {
    console.error("PC log fetch error:", error.message);
    return;
  }

  resolvedPcLogTable = tableName;
  setCachedPcLogs(data || []);
}

function requestPcLogsRefresh(botName) {
  const target = botName || currentBot || "";
  if (!target || !isPcControlAllowed(target)) {
    setCachedPcLogs([]);
    stopPcLogPolling();
    return Promise.resolve();
  }
  startPcLogPolling(target);
  return loadPcLogs(target);
}

function subscribeToPcControl(botName) {
  if (pcControlChannel) {
    supabase.removeChannel(pcControlChannel);
    pcControlChannel = null;
  }
  lastPcControlBot = null;

  if (!botName) {
    setCachedPcControlValue("OFF", { force: true });
    clearPendingPcControl();
    return;
  }

  if (!isPcControlAllowed(botName)) {
    setCachedPcControlValue("OFF", { force: true });
    clearPendingPcControl();
    return;
  }

  lastPcControlBot = botName;

  (async () => {
    await loadPcControlValue(botName);
    if (lastPcControlBot !== botName) {
      return;
    }

    pcControlChannel = supabase
      .channel(`realtime-pc-control-${botName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "captchas",
          filter: `name=eq.${botName}`,
        },
        (payload) => {
          const updated = payload?.new || null;
          if (updated && Object.prototype.hasOwnProperty.call(updated, "pc_control")) {
            setCachedPcControlValue(updated.pc_control);
          }
        }
      )
      .subscribe(async (status) => {
        console.log(`?? PC control channel ${botName}:`, status);
        if (status === "SUBSCRIBED") {
          await loadPcControlValue(botName);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`PC control channel issue for ${botName}:`, status);
        }
      });
  })().catch((error) => {
    console.error("PC control subscribe error:", error);
  });
}

function subscribeToPcLogs(botName) {
  if (pcLogChannel) {
    supabase.removeChannel(pcLogChannel);
    pcLogChannel = null;
  }
  lastPcLogBot = null;

  if (!botName) {
    setCachedPcLogs([]);
    stopPcLogPolling();
    return;
  }

  if (!isPcControlAllowed(botName)) {
    setCachedPcLogs([]);
    stopPcLogPolling();
    return;
  }

  lastPcLogBot = botName;

  (async () => {
    await loadPcLogs(botName);
    if (lastPcLogBot !== botName) {
      return;
    }
    startPcLogPolling(botName);

    const tableName = resolvedPcLogTable || PC_LOG_TABLE_PRIMARY;

    pcLogChannel = supabase
      .channel(`realtime-pc-log-${botName}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: tableName,
          filter: `name=eq.${botName}`,
        },
        (payload) => {
          if (payload?.new) {
            pushCachedPcLog(payload.new);
          }
        }
      )
      .subscribe(async (status) => {
        console.log(`?? PC log channel ${botName}:`, status);
        if (status === "SUBSCRIBED") {
          await loadPcLogs(botName);
        }
      });
  })().catch((error) => {
    console.error("PC log subscribe error:", error);
  });
}

function subscribeToCaptcha(botName) {
  if (captchaChannel) supabase.removeChannel(captchaChannel);
  showCaptcha(null);
  setRealtimeActive(false);

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
        setRealtimeActive(true);
        await loadLatestCaptcha(botName);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        showCaptcha(null);
        setRealtimeActive(false);
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
  window.supabaseClient = supabase;
  window.subscribeToCaptcha = subscribeToCaptcha;
  window.subscribeToLogs = subscribeToLogs;
  window.subscribeToPcControl = subscribeToPcControl;
  window.subscribeToPcLogs = subscribeToPcLogs;
  window.updatePcControlValue = updatePcControlValue;
  window.requestPcLogsRefresh = requestPcLogsRefresh;
  window.addCaptchaStatusListener = addCaptchaStatusListener;
  if (typeof window.onCaptchaStatusSupportReady === "function") {
    try {
      window.onCaptchaStatusSupportReady();
    } catch (error) {
      console.error("Failed to notify dashboard about status listener support:", error);
    }
  }
}
