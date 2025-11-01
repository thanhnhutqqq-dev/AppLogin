import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://soxprvsxblsznvslxuhk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNveHBydnN4Ymxzem52c2x4dWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MDg3MTcsImV4cCI6MjA3NzM4NDcxN30.v9tR-dlYmr97A7nibCL-3sEHIkXvU_Pn7MMLqDx74q8";

const QUIZ_TABLE = "quiz_questions";
const QUIZ_FIELDS = `
  id,
  name,
  question_no,
  quiz_id,
  question_text,
  answer_id,
  answer_text,
  selector,
  position,
  is_correct,
  updated_at
`;
const STORAGE_KEY = "quiz:selectedName";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  name: "",
  questions: [],
  answers: new Map(),
  loading: false,
};

let featureEnabled = false;

const elements = {
  submitButton: document.getElementById("quizSubmitButton"),
  message: document.getElementById("quizMessage"),
  questionCount: document.getElementById("quizQuestionCount"),
  questionsContainer: document.getElementById("quizQuestions"),
  latestLog: document.getElementById("latestLog"),
};

function updateViewportHeight() {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  if (height) {
    document.documentElement.style.setProperty("--app-vh", `${height}px`);
  }
}

updateViewportHeight();
window.addEventListener("resize", updateViewportHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportHeight);
  window.visualViewport.addEventListener("scroll", updateViewportHeight);
}

function syncSelectedName() {
  let stored = "";
  try {
    stored = localStorage.getItem(STORAGE_KEY) || "";
  } catch (error) {
    stored = "";
  }
  state.name = stored.trim();
  try {
    window.currentBot = state.name || "";
  } catch (error) {
    // ignore storage errors
  }
}

function setMessage(type, text) {
  const el = elements.message;
  if (!text) {
    el.textContent = "";
    el.className = "quiz-message hidden";
    return;
  }
  const allowed = new Set(["info", "success", "error", "warning"]);
  const variant = allowed.has(type) ? type : "info";
  el.textContent = text;
  el.className = `quiz-message is-${variant}`;
}

function renderMeta(meta = {}) {
  // Header trang quiz cố định, không cần cập nhật động.
  void meta;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  updateSubmitDisabled();
}

function updateSubmitDisabled() {
  const hasQuestions = state.questions.length > 0;
  const allAnswered = state.answers.size === state.questions.length && hasQuestions;
  elements.submitButton.disabled = state.loading || !allAnswered || !featureEnabled;
}

function clearAnswers() {
  state.answers.clear();
  updateSubmitDisabled();
}

function normalizePosition(position) {
  if (!position) return null;
  if (typeof position === "string") {
    try {
      return JSON.parse(position);
    } catch (error) {
      return null;
    }
  }
  if (typeof position === "object") {
    return position;
  }
  return null;
}

function groupRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  const map = new Map();

  records.forEach((row) => {
    const questionKey = row.quiz_id || `${row.name || "quiz"}-${row.question_no}`;
    if (!map.has(questionKey)) {
      map.set(questionKey, {
        key: questionKey,
        name: row.name,
        questionNo: row.question_no,
        quizId: row.quiz_id,
        text: row.question_text,
        answers: [],
      });
    }

    map.get(questionKey).answers.push({
      rowId: row.id,
      answerId: row.answer_id,
      text: row.answer_text || "",
      selector: row.selector || "",
      position: normalizePosition(row.position),
      isCorrect: Boolean(row.is_correct),
    });
  });

  const questions = Array.from(map.values()).sort((a, b) => a.questionNo - b.questionNo);

  questions.forEach((question) => {
    question.answers.sort((a, b) => a.answerId.localeCompare(b.answerId));
    question.answers.forEach((answer, index) => {
      answer.label = String.fromCharCode(65 + index);
    });
  });

  return questions;
}

function renderQuizQuestions(questions) {
  const container = elements.questionsContainer;
  container.innerHTML = "";

  if (!questions.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "muted";
    placeholder.textContent = "Chưa có câu hỏi nào cho bot này.";
    container.appendChild(placeholder);
    elements.questionCount.textContent = "0 câu hỏi";
    updateSubmitDisabled();
    return;
  }

  const fragment = document.createDocumentFragment();

  questions.forEach((question) => {
    const card = document.createElement("article");
    card.className = "quiz-question-card";

    const header = document.createElement("header");
    const code = document.createElement("span");
    code.className = "quiz-question-code";
    code.textContent = `Câu hỏi ${question.questionNo}`;

    header.appendChild(code);
    card.appendChild(header);

    const text = document.createElement("p");
    text.className = "quiz-question-text";
    text.textContent = question.text || "";
    card.appendChild(text);

    const answersList = document.createElement("div");
    answersList.className = "quiz-options";

    question.answers.forEach((answer) => {
      const label = document.createElement("label");
      label.className = "quiz-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${question.key}`;
      input.value = answer.rowId;
      input.dataset.questionKey = question.key;
      input.addEventListener("change", () => {
        state.answers.set(question.key, answer.rowId);
        updateSubmitDisabled();
      });

      if (state.answers.get(question.key) === answer.rowId) {
        input.checked = true;
      }

      const badge = document.createElement("span");
      badge.className = "quiz-option-code";
      badge.textContent = answer.label || "";

      const content = document.createElement("div");
      content.className = "quiz-option-content";

      const answerText = document.createElement("span");
      answerText.className = "quiz-option-text";
      answerText.textContent = answer.text || "";
      content.appendChild(answerText);

      label.appendChild(input);
      label.appendChild(badge);
      label.appendChild(content);
      answersList.appendChild(label);
    });

    card.appendChild(answersList);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
  elements.questionCount.textContent = `${questions.length} câu hỏi`;
  updateSubmitDisabled();
}

async function loadQuiz({ silent = false } = {}) {
  if (!featureEnabled) {
    if (!silent) {
      setMessage("info", "Quiz is not enabled for this bot.");
    } else {
      setMessage("", "");
    }
    state.questions = [];
    clearAnswers();
    renderQuizQuestions([]);
    renderMeta();
    updateSubmitDisabled();
    return;
  }

  const resolvedName = state.name.trim();
  if (!resolvedName) {
    state.questions = [];
    clearAnswers();
    renderQuizQuestions([]);
    renderMeta();
    if (!silent) {
      setMessage("error", "No bot selected. Please choose a bot in the Control Panel.");
    } else {
      setMessage("", "");
    }
    updateSubmitDisabled();
    return;
  }

  if (!silent) {
    setMessage("info", "Loading quiz questions from Supabase...");
  }

  setLoading(true);

  try {
    const { data, error } = await supabase
      .from(QUIZ_TABLE)
      .select(QUIZ_FIELDS)
      .eq("name", resolvedName)
      .order("question_no", { ascending: true })
      .order("answer_id", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    if (!Array.isArray(data) || data.length === 0) {
      state.questions = [];
      clearAnswers();
      renderQuizQuestions([]);
      renderMeta();
      setMessage("warning", "No quiz questions found for this bot.");
      return;
    }

    const questions = groupRecords(data);
    state.questions = questions;
    clearAnswers();

    questions.forEach((question) => {
      const selected = question.answers.find((answer) => answer.isCorrect);
      if (selected) {
        state.answers.set(question.key, selected.rowId);
      }
    });

    renderQuizQuestions(questions);

    const latestUpdated = data
      .map((row) => (row.updated_at ? new Date(row.updated_at).getTime() : 0))
      .reduce((acc, cur) => Math.max(acc, cur), 0);

    renderMeta({ updatedAt: latestUpdated ? new Date(latestUpdated) : null });

    const answeredCount = [...state.answers.values()].filter(Boolean).length;
    if (answeredCount) {
      setMessage("info", `Restored ${answeredCount}/${questions.length} previous answers.`);
    } else if (!silent) {
      setMessage("success", `Loaded ${questions.length} questions.`);
    } else {
      setMessage("", "");
    }
  } catch (error) {
    console.error("Failed to load quiz", error);
    state.questions = [];
    clearAnswers();
    renderQuizQuestions([]);
    renderMeta();
    setMessage("error", error.message || "Unable to load quiz data.");
  } finally {
    setLoading(false);
    updateSubmitDisabled();
  }
}
async function handleSubmit() {
  if (!featureEnabled) {
    setMessage("error", "Quiz is not enabled for this bot.");
    return;
  }

  if (state.questions.length === 0) {
    setMessage("error", "Please load the quiz before submitting.");
    return;
  }

  if (state.answers.size !== state.questions.length) {
    setMessage("error", "Please answer every question before submitting.");
    return;
  }

  if (!state.name) {
    setMessage("error", "Unable to determine which bot should receive the results.");
    return;
  }

  const allAnswerIds = [];
  const correctAnswerIds = [];
  const answerLabels = [];

  state.questions.forEach((question) => {
    const selectedRowId = state.answers.get(question.key);
    question.answers.forEach((answer) => {
      if (answer.rowId) {
        allAnswerIds.push(answer.rowId);
      }
      const isCorrect = answer.rowId === selectedRowId;
      answer.isCorrect = isCorrect;
      if (isCorrect) {
        correctAnswerIds.push(answer.rowId);
        answerLabels.push(answer.label || "?");
      }
    });
  });

  if (!allAnswerIds.length) {
    setMessage("error", "No answers found to update.");
    return;
  }

  try {
    setLoading(true);
    setMessage("info", "Saving selected answers...");

    const { error: clearError } = await supabase
      .from(QUIZ_TABLE)
      .update({ is_correct: false })
      .in("id", allAnswerIds);

    if (clearError) {
      throw new Error(clearError.message);
    }

    if (correctAnswerIds.length) {
      const { error: markError } = await supabase
        .from(QUIZ_TABLE)
        .update({ is_correct: true })
        .in("id", correctAnswerIds);

      if (markError) {
        throw new Error(markError.message);
      }
    }

    renderQuizQuestions(state.questions);
    const answerString = answerLabels.join(",");
    setMessage(
      "success",
      answerString ? `Saved answers: ${answerString}.` : "Answers saved."
    );
    if (typeof window !== "undefined" && typeof window.requestSheetRefresh === "function") {
      window.requestSheetRefresh();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Failed to submit answers", error);
    setMessage("error", error.message || "Unable to save answers. Please try again.");
  } finally {
    setLoading(false);
    updateSubmitDisabled();
  }
}
function handleSelectedNameChange({ reload = true, name } = {}) {
  if (typeof name === "string") {
    state.name = name.trim();
  } else {
    syncSelectedName();
  }

  if (!featureEnabled) {
    updateSubmitDisabled();
    return;
  }

  if (!state.name) {
    state.questions = [];
    clearAnswers();
    renderQuizQuestions([]);
    renderMeta();
    if (reload) {
      setMessage("error", "No bot selected. Please choose a bot in the Control Panel.");
    } else {
      setMessage("", "");
    }
    updateSubmitDisabled();
    return;
  }

  try {
    window.currentBot = state.name;
  } catch (error) {
    // ignore if window not accessible
  }

  state.questions = [];
  clearAnswers();
  renderQuizQuestions([]);
  renderMeta();

  if (reload) {
    loadQuiz({ silent: false });
  } else {
    updateSubmitDisabled();
  }
}
elements.submitButton.addEventListener("click", handleSubmit);

document.addEventListener("DOMContentLoaded", () => {
  syncSelectedName();

  if (typeof window !== "undefined" && typeof window.__pendingQuizSelectedName !== "undefined") {
    const pendingName = window.__pendingQuizSelectedName;
    delete window.__pendingQuizSelectedName;
    if (typeof pendingName === "string") {
      state.name = pendingName.trim();
    }
  }

  try {
    window.currentBot = state.name || "";
  } catch (error) {
    // ignore storage errors
  }

  renderQuizQuestions([]);
  renderMeta();
  updateSubmitDisabled();

  if (typeof window !== "undefined" && typeof window.__pendingQuizFeatureEnabled !== "undefined") {
    const pendingFeature = window.__pendingQuizFeatureEnabled;
    delete window.__pendingQuizFeatureEnabled;
    setQuizFeatureEnabled(pendingFeature, { silent: true });
  }

  if (!featureEnabled) {
    setMessage("", "");
    return;
  }

  if (!state.name) {
    setMessage("error", "No bot selected. Please choose a bot in the Control Panel.");
    return;
  }

  loadQuiz({ silent: false });
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    handleSelectedNameChange({ reload: true });
  }
});

if (typeof window !== "undefined") {
  window.setQuizFeatureEnabled = (enabled, options = {}) => setQuizFeatureEnabled(enabled, options);
  window.setQuizSelectedName = (name, options = {}) =>
    handleSelectedNameChange({ ...(typeof options === "object" && options !== null ? options : {}), name });
}

function setQuizFeatureEnabled(enabled, { silent = false } = {}) {
  const normalized = Boolean(enabled);

  if (featureEnabled === normalized) {
    updateSubmitDisabled();
    return;
  }

  featureEnabled = normalized;

  if (!featureEnabled) {
    state.questions = [];
    clearAnswers();
    renderQuizQuestions([]);
    renderMeta();
    if (silent) {
      setMessage("", "");
    } else {
      setMessage("info", "Quiz is not enabled for this bot.");
    }
    updateSubmitDisabled();
    return;
  }

  updateSubmitDisabled();

  if (!state.name) {
    if (silent) {
      setMessage("", "");
    } else {
      setMessage("error", "No bot selected. Please choose a bot in the Control Panel.");
    }
    return;
  }

  if (silent) {
    return;
  }

  loadQuiz({ silent });
}

if (typeof window !== "undefined") {
  window.setQuizFeatureEnabled = (enabled, options = {}) => setQuizFeatureEnabled(enabled, options);
  window.setQuizSelectedName = (name, options = {}) =>
    handleSelectedNameChange({ ...(typeof options === "object" && options !== null ? options : {}), name });
}
