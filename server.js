import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY environment variables.");
}

const STATUS_TO_DB = {
  RUN: "in_progress",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
  DONE: "done",
  ERROR: "error",
};

const STATUS_FROM_DB = {
  pending: "PENDING",
  in_progress: "RUN",
  done: "DONE",
  error: "ERROR",
};

const mapStatusToDb = (value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (STATUS_TO_DB[upper]) {
    return STATUS_TO_DB[upper];
  }
  return trimmed;
};

const mapStatusToClient = (value) => {
  if (value == null) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return STATUS_FROM_DB[lower] || trimmed.toUpperCase();
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/health", (_req, res) => res.json({ ok: true }));

// 1. List available bots (replacement for /sheets against Google Sheets)
app.get("/sheets", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("captchas")
      .select("name,status,updated_at")
      .order("name", { ascending: true });

    if (error) throw error;

    res.json({
      sheets: (data || []).map(({ name }) => ({
        id: name,
        title: name,
      })),
      defaultSheet: data?.[0]?.name || "",
    });
  } catch (err) {
    console.error("GET /sheets error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Mirror Google Sheet RPC contract via /sheet POST
app.post("/sheet", async (req, res) => {
  const { action, sheetName, cell, value } = req.body || {};
  if (!action) {
    return res.status(400).json({ error: "Missing action" });
  }

  try {
    if (action === "get-state") {
      if (!sheetName) {
        return res.status(400).json({ error: "Missing sheetName" });
      }

      const { data: captcha, error } = await supabase
        .from("captchas")
        .select("*")
        .eq("name", sheetName)
        .maybeSingle();

      if (error) throw error;
      if (!captcha) {
        return res.status(404).json({ error: "Bot not found" });
      }

      const { data: latestLogData, error: logError } = await supabase
        .from("captcha_logs")
        .select("message, created_at")
        .eq("name", sheetName)
        .order("created_at", { ascending: false })
        .limit(1);

      if (logError) {
        console.error("Latest log fetch error:", logError);
      }

      const latestLog = latestLogData?.[0]?.message || "(No log yet)";
      const sheetStatus = mapStatusToClient(captcha.status);
      const imageValue = captcha.image_base64 || "";
      const answerValue = captcha.answer || "";
      const logCellValue =
        typeof captcha.logs === "string" && captcha.logs.trim()
          ? captcha.logs
          : latestLog;

      const values = [
        ["STATUS", "IMAGE_BASE64", "IMAGE_BACKUP", "ANSWER", "LOG"],
        [sheetStatus, imageValue, imageValue, answerValue, logCellValue || ""],
      ];

      return res.json({
        values,
        sheetName,
        latestLog,
      });
    }

    if (action === "update-cell") {
      if (!sheetName) {
        return res.status(400).json({ error: "Missing sheetName" });
      }
      if (!cell) {
        return res.status(400).json({ error: "Missing cell" });
      }

      const fieldMap = {
        A2: "status",
        B2: "image_base64",
        C2: "image_base64",
        D2: "answer",
        E2: "logs",
      };

      const field = fieldMap[cell];
      if (!field) {
        return res.status(400).json({ error: `Invalid cell: ${cell}` });
      }

      let newValue = value;
      if (field === "status") {
        newValue = mapStatusToDb(value);
      }

      const { error } = await supabase
        .from("captchas")
        .update({ [field]: newValue })
        .eq("name", sheetName);

      if (error) throw error;

      console.log(
        `Update cell ${cell} (${field}) for ${sheetName} => ${newValue ?? ""}`
      );
      return res.json({ success: true, sheetName });
    }

    return res.status(400).json({ error: "Unsupported action" });
  } catch (err) {
    console.error("POST /sheet error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Optional endpoint to push a log entry
app.post("/logs", async (req, res) => {
  const { name, message } = req.body || {};
  if (!name || !message) {
    return res.status(400).json({ error: "Missing name or message" });
  }

  try {
    const { error } = await supabase
      .from("captcha_logs")
      .insert([{ name, message }]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("POST /logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Supabase bridge listening at http://localhost:${PORT}`);
});
