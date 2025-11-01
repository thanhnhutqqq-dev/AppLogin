const POLL_INTERVAL_MS = 1500;
const state = {
  loading: false,
  polling: false,
  running: false,
  pollHandle: null,
  values: [],
  lastRunStatus: '',
  sheetName: '',
  sheets: [],
  quizEnabled: false,
};

const runButton = document.getElementById('runButton');
const runButtonText = document.getElementById('runButtonText');
const stopPollingButton = document.getElementById('stopPollingButton');
const submitButton = document.getElementById('submitButton');
const captchaInput = document.getElementById('captchaInput');
const feedbackPopup = document.getElementById('feedback');
const feedbackMessageEl = document.getElementById('feedbackMessage');
const feedbackCloseButton = document.getElementById('feedbackClose');
const sheetTableContainer = document.getElementById(
  'sheetTableContainer'
);
const refreshButton = document.getElementById('refreshButton');
const latestLogEl = document.getElementById('latestLog');
const captchaPanel = document.querySelector('[data-fragment="captcha-panel"]');
const quizPanel = document.querySelector('[data-fragment="quiz-panel"]');
const runningBadge = document.getElementById('runningBadge');
const pollingBadge = document.getElementById('pollingBadge');
const statusPanel = document.getElementById('statusPanel');
const loadingBadge = document.getElementById('loadingBadge');
const rootElement = document.documentElement;
const api = window.dashboardApi || null;
let baseViewportHeight =
  Math.max(window.innerHeight || 0, window.visualViewport ? window.visualViewport.height : 0) || 0;
let keyboardActive = false;

const FEEDBACK_TYPES = ['success', 'error', 'info'];
const STATUS_BADGE_VARIANTS = ['gray', 'green', 'blue', 'red', 'amber'];

if (!api) {
  console.warn('dashboardApi service is not available. Requests will fail.');
}

function setQuizVisibility(enabled) {
  if (!quizPanel) {
    if (captchaPanel) {
      const hideCaptchaOnly = Boolean(enabled);
      captchaPanel.classList.toggle('hidden', hideCaptchaOnly);
      captchaPanel.setAttribute('aria-hidden', hideCaptchaOnly ? 'true' : 'false');
    }
    return;
  }
  const shouldShow = Boolean(enabled);
  quizPanel.classList.toggle('hidden', !shouldShow);
  quizPanel.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  if (captchaPanel) {
    captchaPanel.classList.toggle('hidden', shouldShow);
    captchaPanel.setAttribute('aria-hidden', shouldShow ? 'true' : 'false');
  }
}

function setQuizFeatureState(enabled, { silent = true } = {}) {
  const normalized = Boolean(enabled);
  state.quizEnabled = normalized;
  setQuizVisibility(normalized);

  if (typeof window !== 'undefined') {
    if (typeof window.setQuizFeatureEnabled === 'function') {
      window.setQuizFeatureEnabled(normalized, { silent });
    } else {
      window.__pendingQuizFeatureEnabled = normalized;
    }
  }
}

function updateViewportHeight(options = {}) {
  const { force = false } = options;
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  if (!height) {
    return;
  }

  if (!baseViewportHeight) {
    baseViewportHeight = height;
  }

  if (!force) {
    if (keyboardActive) {
      return;
    }
    if (baseViewportHeight && height < baseViewportHeight - 80) {
      return;
    }
  }

  if (!keyboardActive || force) {
    baseViewportHeight = Math.max(baseViewportHeight, height);
  }

  const targetHeight = force ? baseViewportHeight : Math.max(height, baseViewportHeight);
  rootElement.style.setProperty('--app-vh', `${targetHeight}px`);
}

updateViewportHeight({ force: true });
setQuizFeatureState(state.quizEnabled, { silent: true });

const detachViewportListeners = (() => {
  const viewportHandler = () => updateViewportHeight();
  const orientationHandler = () => updateViewportHeight({ force: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', viewportHandler);
    window.visualViewport.addEventListener('scroll', viewportHandler);
  } else {
    window.addEventListener('resize', viewportHandler);
  }
  window.addEventListener('orientationchange', orientationHandler);
  return () => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', viewportHandler);
      window.visualViewport.removeEventListener('scroll', viewportHandler);
    } else {
      window.removeEventListener('resize', viewportHandler);
    }
    window.removeEventListener('orientationchange', orientationHandler);
  };
})();

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) {
    keyboardActive = true;
    rootElement.classList.add('keyboard-active');
  }
});

document.addEventListener('focusout', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) {
    keyboardActive = false;
    rootElement.classList.remove('keyboard-active');
    setTimeout(() => {
      document.body.scrollIntoView({ block: 'start', behavior: 'smooth' });
      updateViewportHeight({ force: true });
    }, 120);
  }
});

function resolveStatusVariant(status) {
  switch (status) {
    case 'RUN':
      return 'blue';
    case 'DONE':
      return 'green';
    case 'ERROR':
      return 'red';
    case 'PENDING':
      return 'amber';
    default:
      return 'gray';
  }
}

function refreshRunButtonState() {
  if (!runButton) {
    return;
  }
  const normalized = normalizeStatus(state.lastRunStatus);
  const isPending = normalized === 'PENDING';
  const isRunningStatus = normalized === 'RUN';
  const shouldDisable =
    state.running || !state.sheetName || isPending || isRunningStatus;
  runButton.disabled = shouldDisable;
  runButton.classList.toggle('is-locked', isPending || isRunningStatus);

  if (isPending) {
    runButton.title = 'Status is PENDING. Please wait until it changes.';
  } else if (isRunningStatus) {
    runButton.title = 'Status is RUN. Please wait for completion.';
  } else if (state.running) {
    runButton.title = 'Request already in progress.';
  } else if (!state.sheetName) {
    runButton.title = 'Select a sheet to start.';
  } else {
    runButton.removeAttribute('title');
  }
}

function updateActionButtons() {
  if (!runButton || !stopPollingButton) {
    return;
  }
  const showStop =
    state.running ||
    state.polling ||
    normalizeStatus(state.lastRunStatus) === 'RUN';
  runButton.classList.toggle('hidden', showStop);
  stopPollingButton.classList.toggle('hidden', !showStop);
}

function setFeedback(type, message) {
  if (!feedbackPopup || !feedbackMessageEl) {
    return;
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    clearFeedback();
    return;
  }

  const normalizedType = FEEDBACK_TYPES.includes(type) ? type : 'info';

  clearFeedback();
  feedbackPopup.classList.remove('hidden');
  feedbackPopup.classList.add('visible', `is-${normalizedType}`);
  feedbackMessageEl.textContent = message.trim();

  const supabaseLogsActive =
    typeof window !== 'undefined' && window.__supabaseLogsActive;
  if (!supabaseLogsActive && latestLogEl) {
    latestLogEl.textContent = message.trim();
  }
}

function clearFeedback() {
  if (!feedbackPopup || !feedbackMessageEl) {
    return;
  }

  FEEDBACK_TYPES.forEach((t) =>
    feedbackPopup.classList.remove(`is-${t}`)
  );
  feedbackPopup.classList.remove('visible');
  feedbackPopup.classList.add('hidden');
  feedbackMessageEl.textContent = '';
}

function setStatusPanelVariant(variant) {
  if (!statusPanel) {
    return;
  }
  const applied = STATUS_BADGE_VARIANTS.includes(variant)
    ? variant
    : 'gray';
  STATUS_BADGE_VARIANTS.forEach((color) => {
    statusPanel.classList.toggle(`status-${color}`, color === applied);
  });
}

function updateStatusBadge(label, variant = 'gray') {
  if (!pollingBadge) {
    return;
  }
  const safeLabel =
    typeof label === 'string' && label.trim()
      ? label.trim()
      : 'IDLE';
  pollingBadge.textContent = safeLabel;
  STATUS_BADGE_VARIANTS.forEach((color) => {
    pollingBadge.classList.toggle(color, color === variant);
  });
  pollingBadge.classList.remove('hidden');
  setStatusPanelVariant(variant);
}

function setSheetName(name) {
  const previousName = state.sheetName;
  const normalized = typeof name === 'string' ? name : '';
  state.sheetName = normalized;
  if (sheetSelector) {
    sheetSelector.value = normalized;
  }
  try {
    if (normalized) {
      localStorage.setItem('quiz:selectedName', normalized);
    } else {
      localStorage.removeItem('quiz:selectedName');
    }
  } catch (error) {
    // ignore storage errors
  }

  if (previousName !== normalized) {
    setQuizFeatureState(false, { silent: true });
  }

  if (typeof window.setQuizSelectedName === 'function') {
    window.setQuizSelectedName(normalized);
  } else {
    window.__pendingQuizSelectedName = normalized;
  }

  if (!normalized) {
    setQuizFeatureState(false, { silent: true });
  }

  state.lastRunStatus = '';
  refreshRunButtonState();
  updateActionButtons();
  updateSubmitDisabled();
}

function renderSheetOptions(options) {
  if (!sheetSelector) {
    return;
  }

  sheetSelector.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // ?? Thêm placeholder tr?ng làm m?c d?nh
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select user';
  placeholder.disabled = true;
  placeholder.selected = true;
  fragment.appendChild(placeholder);

  // ?? Thêm danh sách các sheet th?t s?
  options.forEach((sheet) => {
    const option = document.createElement('option');
    option.value = sheet.title;
    option.textContent = sheet.title;
  if (sheet.id !== null && sheet.id !== undefined) {
    option.dataset.sheetId = String(sheet.id);
  }
  fragment.appendChild(option);
  });

  sheetSelector.appendChild(fragment);

  // ?? Không ch?n sheet m?c d?nh nào h?t
  setSheetName('');
  sheetSelector.value = '';

  // ?? Tr?ng thái hi?n th? v?n là “IDLE”
  updateStatusBadge('IDLE', 'gray');
  sheetSelector.disabled = false;
}

async function fetchSheetList() {
  if (!sheetSelector) {
    return;
  }

  sheetSelector.disabled = true;
  sheetSelector.innerHTML = '<option>Loading...</option>';

  try {
    if (!api) {
      throw new Error('dashboardApi service is not available.');
    }

    const data = await api.getSheetList();
    const sheets = Array.isArray(data.sheets) ? data.sheets : [];
    const defaultSheet = data.defaultSheet;

    state.sheets = sheets;

    if (!sheets.length) {
      sheetSelector.innerHTML =
        '<option value=\"\">No sheets found</option>';
      setSheetName('');
      updateStatusBadge('IDLE', 'gray');
      setFeedback('error', 'No sheets available in this spreadsheet.');
      return;
    }

    renderSheetOptions(sheets, defaultSheet);
  } catch (error) {
    console.error('Failed to fetch sheet list:', error);
    sheetSelector.innerHTML = '<option value=\"\">Load failed</option>';
    setSheetName('');
    updateStatusBadge('IDLE', 'gray');
    state.sheets = [];
    setFeedback('error', error.message || 'Failed to load sheet list.');
    throw error;
  } finally {
    sheetSelector.disabled = state.sheets.length === 0;
  }
}

function toggleRunning(isRunning) {
  state.running = isRunning;
  refreshRunButtonState();
  runningBadge.classList.toggle('hidden', !isRunning);
  runButtonText.textContent = isRunning ? 'Sending...' : 'RUN LOGIN';
  updateActionButtons();
}

function togglePolling(isPolling) {
  state.polling = isPolling;
  if (!isPolling && (!state.lastRunStatus || state.lastRunStatus === 'RUN')) {
    updateStatusBadge('IDLE', 'gray');
  }
  updateActionButtons();
}

function toggleLoading(isLoading) {
  state.loading = isLoading;
  if (loadingBadge) {
    loadingBadge.classList.toggle('hidden', !isLoading);
  }
}

function restrictCaptchaInput(value) {
  return value.replace(/\D/g, '').slice(0, 3);
}

function getCellValue(values, cellLabel) {
  if (!cellLabel) {
    return '';
  }
  const match = /^([A-Za-z]+)(\d+)$/.exec(cellLabel);
  if (!match) {
    return '';
  }
  const [, letters, rowStr] = match;
  const rowIndex = parseInt(rowStr, 10) - 1;
  if (Number.isNaN(rowIndex) || rowIndex < 0) {
    return '';
  }
  let colIndex = 0;
  for (let i = 0; i < letters.length; i += 1) {
    colIndex *= 26;
    colIndex += letters.toUpperCase().charCodeAt(i) - 64;
  }
  colIndex -= 1;
  if (!values[rowIndex]) {
    return '';
  }
  return values[rowIndex][colIndex] ?? '';
}

function resolveImageSource(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return null;
  }

  const noWhitespace = trimmed.replace(/\s+/g, '');
  const sanitized = noWhitespace.replace(/^["']+|["']+$/g, '');
  if (!sanitized) {
    return null;
  }

  if (
    sanitized.startsWith('http://') ||
    sanitized.startsWith('https://') ||
    sanitized.startsWith('data:')
  ) {
    return sanitized;
  }

  const base64Candidate = sanitized.startsWith('base64,')
    ? sanitized.substring('base64,'.length)
    : sanitized;

  const padding = base64Candidate.length % 4;
  const padded =
    padding === 0
      ? base64Candidate
      : `${base64Candidate}${'='.repeat(4 - padding)}`;

  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      window.atob(padded);
    }
    return `data:image/png;base64,${padded}`;
  } catch (error) {
    console.warn('Invalid base64 captcha image', error);
    return null;
  }
}

function updateCaptchaDisplay(rawImage) {
  const source = resolveImageSource(rawImage);
  captchaContainer.innerHTML = '';
  captchaContainer.classList.remove('has-image', 'empty');
  captchaContainer.style.removeProperty('width');
  captchaContainer.style.removeProperty('height');
  if (source) {
    const img = document.createElement('img');
    img.src = source;
    img.alt = 'Captcha preview';
    captchaContainer.classList.add('has-image');
    captchaContainer.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.textContent = 'No image available.';
    captchaContainer.classList.add('empty');
    captchaContainer.appendChild(span);
  }
}

function renderCaptcha(values) {
  if (!Array.isArray(values)) {
    updateCaptchaDisplay(values);
    return;
  }

  let rawImage = getCellValue(values, 'C2');
  if (!rawImage) {
    rawImage = getCellValue(values, 'B2');
  }
  updateCaptchaDisplay(rawImage);
}

function renderLogs(values) {
  if (!latestLogEl) {
    return;
  }

  if (typeof window !== 'undefined' && window.__supabaseLogsActive) {
    return;
  }

  const rows = Array.isArray(values) ? values.slice(1) : [];
  let latestEntry = '';

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row || row.length <= 4) {
      continue;
    }
    const text = String(row[4] ?? '').trim();
    if (text.length > 0) {
      latestEntry = text;
      break;
    }
  }

  if (latestEntry) {
    latestLogEl.textContent = latestEntry;
  } else {
    latestLogEl.textContent = 'No log entries yet.';
  }
}

function renderTable(values) {
  if (!sheetTableContainer) {
    return;
  }
  sheetTableContainer.innerHTML = '';
  if (!Array.isArray(values) || !values.length) {
    const empty = document.createElement('p');
    empty.style.margin = '0';
    empty.style.color = '#6b7280';
    empty.textContent = 'No data found in this sheet.';
    sheetTableContainer.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  values.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell ?? '';
      tr.appendChild(td);
    });
    if (!row.length) {
      const td = document.createElement('td');
      td.textContent = '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  sheetTableContainer.appendChild(table);
}

function normalizeStatus(value) {
  if (typeof value === 'string') {
    return value.trim().toUpperCase();
  }
  if (value == null) {
    return '';
  }
  return String(value).trim().toUpperCase();
}

function handleRunState(values) {
  const rawStatus = getCellValue(values, 'A2');
  const normalizedStatus = normalizeStatus(rawStatus);
  const previousStatus = state.lastRunStatus;
  const statusChanged = normalizedStatus !== previousStatus;
  const variant = resolveStatusVariant(normalizedStatus);

  if (normalizedStatus === 'RUN') {
    updateStatusBadge(normalizedStatus || 'RUN', variant);
    stopPollingButton.classList.remove('hidden');
    state.lastRunStatus = normalizedStatus;
    refreshRunButtonState();
    updateActionButtons();
    return;
  }

  state.lastRunStatus = normalizedStatus;

  stopPolling();
  toggleRunning(false);

  if (statusChanged) {
    if (normalizedStatus === 'DONE' || normalizedStatus === 'ERROR') {
      const message =
        normalizedStatus === 'DONE'
          ? 'Run completed successfully.'
          : 'Run finished with ERROR status.';
      const feedbackType =
        normalizedStatus === 'DONE' ? 'success' : 'error';

      setFeedback(feedbackType, message);
    } else {
      clearFeedback();
    }
  } else if (!normalizedStatus) {
    clearFeedback();
  }

  const label = normalizedStatus || 'IDLE';
  const badgeVariant = normalizedStatus ? variant : 'gray';
  updateStatusBadge(label, badgeVariant);

  refreshRunButtonState();
  updateActionButtons();
}
async function fetchSheetValues() {
  if (!state.sheetName) {
    setFeedback('info', 'Select a sheet to load data.');
    state.quizEnabled = false;
    setQuizVisibility(false);
    if (typeof window.setQuizFeatureEnabled === 'function') {
      window.setQuizFeatureEnabled(false, { silent: true });
    } else {
      window.__pendingQuizFeatureEnabled = false;
    }
    return [];
  }

  toggleLoading(true);
  try {
    if (!api) {
      throw new Error('dashboardApi service is not available.');
    }

    const data = await api.getSheetState(state.sheetName);
    const values = data.values || data.state?.values || [];
    state.values = values;
    renderCaptcha(values);
    renderLogs(values);
    renderTable(values);
    handleRunState(values);
    if (Object.prototype.hasOwnProperty.call(data, 'quizEnabled')) {
      const enableSilent = !data.quizEnabled;
      setQuizFeatureState(data.quizEnabled, { silent: enableSilent });
    }

    const supabaseLogsActive =
      typeof window !== 'undefined' && window.__supabaseLogsActive;
    if (!supabaseLogsActive && data.latestLog && latestLogEl) {
      latestLogEl.textContent = data.latestLog;
    }

    const activeBot = window.currentBot || "";
    if (state.sheetName && state.sheetName !== activeBot) {
      window.currentBot = state.sheetName;
      subscribeToCaptcha(window.currentBot);
      subscribeToLogs(window.currentBot);
    }

    return values;
  } catch (error) {
    console.error('Failed to fetch sheet:', error);
    setQuizFeatureState(false, { silent: true });
    throw error;
  } finally {
    toggleLoading(false);
  }
}

function startPolling() {
  if (state.polling) {
    return;
  }
  if (!state.sheetName) {
    setFeedback('error', 'Select a sheet before running.');
    return;
  }
  togglePolling(true);
  state.pollHandle = setInterval(() => {
    fetchSheetValues().catch((error) => {
      console.error('Failed to poll sheet:', error);
      setFeedback('error', error.message);
      stopPolling();
    });
  }, POLL_INTERVAL_MS);

  fetchSheetValues().catch((error) => {
    console.error('Failed to fetch sheet:', error);
    setFeedback('error', error.message);
    setQuizFeatureState(false, { silent: true });
    stopPolling();
  });
}

function stopPolling() {
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
  togglePolling(false);
}

async function updateCell(cell, value) {
  if (!state.sheetName) {
    throw new Error('Please select a sheet before updating.');
  }

  if (!api) {
    throw new Error('dashboardApi service is not available.');
  }

  return api.updateSheetCell(state.sheetName, cell, value);
}

async function handleRunClick() {
  if (!state.sheetName) {
    setFeedback('error', 'Select a sheet before running.');
    return;
  }

  clearFeedback();
  toggleRunning(true);
  try {
    await updateCell('A2', 'RUN');
    setFeedback('info', 'RUN LOGIN has been triggered.');
    startPolling();
  } catch (error) {
    console.error('RUN LOGIN failed:', error);
    setFeedback('error', error.message || 'RUN LOGIN failed.');
    stopPolling();
  } finally {
    toggleRunning(false);
  }
}

let submitting = false;

function updateSubmitDisabled() {
  submitButton.disabled =
    submitting || !state.sheetName || captchaInput.value.length !== 3;
}

async function handleSubmitClick() {
  const trimmed = captchaInput.value.trim();
  if (trimmed.length !== 3) {
    setFeedback('error', 'Please enter exactly 3 digits before sending.');
    return;
  }

  if (!state.sheetName) {
    setFeedback('error', 'Select a sheet before sending captcha.');
    return;
  }

  submitting = true;
  updateSubmitDisabled();
  clearFeedback();
  try {
    await updateCell('D2', trimmed);
    setFeedback('success', 'Captcha code saved to cell D2.');
    captchaInput.value = '';
    await fetchSheetValues();
  } catch (error) {
    console.error('Submit captcha failed:', error);
    setFeedback('error', error.message || 'Failed to submit captcha.');
  } finally {
    submitting = false;
    updateSubmitDisabled();
  }
}

async function handleStopPollingClick() {
  stopPolling();
  toggleRunning(false);

  if (!state.sheetName) {
    setFeedback('error', 'Select a sheet before stopping.');
    return;
  }

  try {
    if (state.lastRunStatus === 'RUN') {
      await updateCell('A2', 'DONE');
      state.lastRunStatus = 'DONE';
      setFeedback('success', 'Status set to DONE.');
      await fetchSheetValues();
    } else {
      setFeedback('info', 'Polling stopped. Click RUN LOGIN to resume.');
    }
  } catch (error) {
    console.error('Stop polling update failed:', error);
    setFeedback('error', error.message || 'Failed to stop run.');
  }
}

runButton.addEventListener('click', handleRunClick);
submitButton.addEventListener('click', handleSubmitClick);
stopPollingButton.addEventListener('click', handleStopPollingClick);
if (sheetSelector) {
  sheetSelector.addEventListener('change', (event) => {
    const value = event.target.value;
    setSheetName(value);
    stopPolling();
    toggleRunning(false);
    if (!value) {
      clearFeedback();
      return;
    }
    fetchSheetValues().catch((error) => {
      console.error('Sheet change fetch failed:', error);
      setFeedback('error', error.message || 'Failed to load sheet.');
     });
  });
}

if (feedbackCloseButton) {
  feedbackCloseButton.addEventListener('click', () => {
    clearFeedback();
  });
}

if (feedbackPopup) {
  feedbackPopup.addEventListener('click', (event) => {
    if (event.target === feedbackPopup) {
      clearFeedback();
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    feedbackPopup &&
    feedbackPopup.classList.contains('visible')
  ) {
    clearFeedback();
  }
});

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    fetchSheetValues().catch((error) => {
      console.error('Refresh failed:', error);
      setFeedback('error', error.message);
    });
  });
}

captchaInput.addEventListener('input', (event) => {
  const digitsOnly = restrictCaptchaInput(event.target.value);
  event.target.value = digitsOnly;
  updateSubmitDisabled();
});

window.addEventListener('focus', () => {
  if (state.polling) {
    fetchSheetValues().catch((error) => {
      console.error('Refresh on focus failed:', error);
    });
  }
});

window.addEventListener('beforeunload', () => {
  stopPolling();
  if (typeof detachViewportListeners === 'function') {
    detachViewportListeners();
  }
});

// Initial load
async function initializeDashboard() {
  updateSubmitDisabled();
  refreshRunButtonState();
  updateActionButtons();
  try {
    await fetchSheetList();
    if (state.sheetName) {
      await fetchSheetValues();
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    if (!state.sheetName) {
      setFeedback('error', error.message || 'Initialization failed.');
    }
  }
}

initializeDashboard();

if (typeof window !== 'undefined') {
  window.setDashboardQuizFeatureState = (enabled, options = {}) =>
    setQuizFeatureState(enabled, options);
  window.requestSheetRefresh = () => {
    fetchSheetValues().catch((error) => {
      console.error('Manual refresh failed:', error);
    });
  };
}







