// =====================================================================
// AirNoiseMonitor dashboard logic
// - Không phụ thuộc CDN Chart.js: biểu đồ được vẽ trực tiếp bằng Canvas API.
// - Có dữ liệu dự phòng từ latest khi nhánh history bị 403/chưa có dữ liệu.
// - Hỗ trợ Realtime / 15 phút / 1 giờ / 24 giờ / 1 ngày / 1 tuần / 1 tháng.
// =====================================================================

"use strict";

const FIREBASE_HOST =
  "airnoisemonitor-58521-default-rtdb.asia-southeast1.firebasedatabase.app";
const FIREBASE_AUTH = "";

const PATH_LATEST = "airnoise/latest";
const PATH_HISTORY = "airnoise/history";

const POLL_INTERVAL_MS = 1000;
const HISTORY_REFRESH_MS = 15000;
const STREAM_RECONNECT_MS = 2000;
const PUSH_ID_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

const RANGE_CONFIG = {
  realtime: {
    label: "Realtime",
    durationMs: 5 * 60 * 1000,
    fetchLimit: 120,
    maxPoints: 60
  },
  "15m": {
    label: "15 phút",
    durationMs: 15 * 60 * 1000,
    fetchLimit: 360,
    maxPoints: 90
  },
  "1h": {
    label: "1 giờ",
    durationMs: 60 * 60 * 1000,
    fetchLimit: 1000,
    maxPoints: 120
  },
  "24h": {
    label: "24 giờ",
    durationMs: 24 * 60 * 60 * 1000,
    fetchLimit: 3500,
    maxPoints: 144
  },
  "1d": {
    label: "1 ngày",
    durationMs: 24 * 60 * 60 * 1000,
    fetchLimit: 3500,
    maxPoints: 144
  },
  "1w": {
    label: "1 tuần",
    durationMs: 7 * 24 * 60 * 60 * 1000,
    fetchLimit: 5000,
    maxPoints: 168
  },
  "1m": {
    label: "1 tháng",
    durationMs: 30 * 24 * 60 * 60 * 1000,
    fetchLimit: 6000,
    maxPoints: 180
  }
};

const QUALITY_LEVELS = {
  good: { label: "Tốt", color: "#4fd1ad" },
  medium: { label: "Trung bình", color: "#73aefc" },
  warning: { label: "Cảnh báo", color: "#f2c15c" },
  danger: { label: "Nguy hiểm", color: "#ff7171" }
};

// Đồng bộ ngưỡng cảnh báo với include/config.h của ESP32.
const ALERT_THRESHOLDS = {
  temperature: { medium: 30, warning: 35, danger: 40 },
  humidity: { mediumLow: 30, warningHigh: 85 },
  air: { medium: 75, warning: 150, danger: 300 },
  noise: { medium: 60, warning: 70, danger: 85 }
};

const state = {
  selectedRange: "realtime",
  latest: null,
  remoteHistory: [],
  liveHistory: [],
  historyError: null,
  isHistoryLoading: false,
  lastHistoryFetchAt: 0,
  lastLatestTimestamp: 0,
  filteredPoints: [],
  chartPoints: [],
  latestStream: null,
  latestStreamConnected: false,
  latestStreamReconnectTimer: null,
  latestStreamSnapshot: null
};

const el = {
  status: document.getElementById("connectionStatus"),
  banner: document.getElementById("alertBanner"),

  temp: document.getElementById("tempValue"),
  humidity: document.getElementById("humidityValue"),
  air: document.getElementById("airValue"),
  noise: document.getElementById("noiseValue"),

  cardTemp: document.getElementById("cardTemp"),
  cardHumidity: document.getElementById("cardHumidity"),
  cardAir: document.getElementById("cardAir"),
  cardNoise: document.getElementById("cardNoise"),

  climateCanvas: document.getElementById("climateChart"),
  envCanvas: document.getElementById("envChart"),
  qualityCanvas: document.getElementById("qualityPieChart"),
  qualityLegend: document.getElementById("qualityPieLegend"),

  climateStatus: document.getElementById("climateChartStatus"),
  envStatus: document.getElementById("envChartStatus"),
  qualityStatus: document.getElementById("qualityChartStatus"),
  chartRangeNote: document.getElementById("chartRangeNote")
};

function authSuffix(prefix = "?") {
  return FIREBASE_AUTH
    ? `${prefix}auth=${encodeURIComponent(FIREBASE_AUTH)}`
    : "";
}

function fmt(num, digits = 1) {
  return typeof num === "number" && Number.isFinite(num)
    ? num.toFixed(digits)
    : "--";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function setConnectionStatus(ok, message = "") {
  if (!el.status) return;

  el.status.classList.remove("status-ok", "status-bad", "status-unknown");

  let className = "status-unknown";
  let text = message || "Đang kết nối...";

  if (ok === true) {
    className = "status-ok";
    text = message || "Đã kết nối Firebase";
  } else if (ok === false) {
    className = "status-bad";
    text = message || "Mất kết nối / lỗi dữ liệu";
  }

  el.status.classList.add(className);
  el.status.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(text)}</span>`;
}

function renderAlertBanner(data) {
  if (!el.banner) return;

  const messages = [];
  if (data.alertTemp) messages.push("Nhiệt độ cao");
  if (data.alertHumidity) messages.push("Độ ẩm cao");
  if (data.alertAir || data.alertGas) messages.push("Khí vượt ngưỡng");
  if (data.alertPm25) messages.push("PM2.5 vượt ngưỡng");
  if (data.alertNoise) messages.push("Tiếng ồn vượt ngưỡng");
  if (data.alertVibration) messages.push("Rung/nghiêng bất thường");

  if (messages.length > 0) {
    el.banner.textContent = "⚠ CẢNH BÁO: " + messages.join(" • ");
    el.banner.classList.remove("hidden");
  } else {
    el.banner.classList.add("hidden");
  }

  el.cardTemp?.classList.toggle("alert", Boolean(data.alertTemp));
  el.cardHumidity?.classList.toggle("alert", Boolean(data.alertHumidity));
  el.cardAir?.classList.toggle("alert", Boolean(data.alertAir || data.alertGas));
  el.cardNoise?.classList.toggle("alert", Boolean(data.alertNoise));
}

function renderLatest(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Nhánh airnoise/latest chưa có dữ liệu");
  }

  const temperature = data.dhtValid ? finiteNumber(data.temperature) : null;
  const humidity = data.dhtValid ? finiteNumber(data.humidity) : null;
  const air = finiteNumber(data.airQualityIndex);
  const noise = finiteNumber(data.noiseDb);
  const pm25 = finiteNumber(data.pm25UgM3);
  const pm10 = finiteNumber(data.pm10UgM3);
  const gasPpm = finiteNumber(data.gasPpm);
  const solarPercent = finiteNumber(data.solarPercent);
  const solarVoltage = finiteNumber(data.solarVoltage);
  const solarPowerW = finiteNumber(data.solarPowerW);
  const solarLux = finiteNumber(data.solarLux);
  const tiltDeg = finiteNumber(data.tiltDeg);
  const vibrationMs2 = finiteNumber(data.vibrationMs2);

  if (el.temp) el.temp.textContent = fmt(temperature);
  if (el.humidity) el.humidity.textContent = fmt(humidity);
  if (el.air) el.air.textContent = air === null ? "--" : String(Math.round(air));
  if (el.noise) el.noise.textContent = fmt(noise);

  renderAlertBanner(data);

  state.latest = {
    timestamp: Date.now(),
    temperature,
    humidity,
    airQualityIndex: air,
    noiseDb: noise,
    pm25UgM3: pm25,
    pm10UgM3: pm10,
    gasPpm,
    solarPercent,
    solarVoltage,
    solarPowerW,
    solarLux,
    tiltDeg,
    vibrationMs2,
    pirMotion: Boolean(data.pirMotion),
    relayOn: Boolean(data.relayOn)
  };

  appendLivePoint(state.latest);
  window.dispatchEvent(new CustomEvent("airnoise:latest-updated", {
    detail: { raw: data, normalized: { ...state.latest } }
  }));
}

function appendLivePoint(point) {
  if (!point) return;

  const hasAnyValue = [
    point.temperature,
    point.humidity,
    point.airQualityIndex,
    point.noiseDb,
    point.pm25UgM3,
    point.gasPpm,
    point.solarPercent
  ].some(Number.isFinite);

  if (!hasAnyValue) return;

  const now = finiteNumber(point.timestamp) || Date.now();
  if (now - state.lastLatestTimestamp < Math.max(1000, POLL_INTERVAL_MS - 500)) {
    return;
  }

  state.lastLatestTimestamp = now;
  state.liveHistory.push({ ...point, timestamp: now, source: "latest" });

  const oldestAllowed = Date.now() - RANGE_CONFIG["1m"].durationMs;
  state.liveHistory = state.liveHistory
    .filter((item) => item.timestamp >= oldestAllowed)
    .slice(-1200);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const error = new Error(`Firebase trả về HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function latestFirebaseUrl() {
  return `https://${FIREBASE_HOST}/${PATH_LATEST}.json${authSuffix()}`;
}

async function fetchLatest() {
  return fetchJson(latestFirebaseUrl());
}

function applyStreamPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (payload.path === "/") {
    state.latestStreamSnapshot =
      payload.data && typeof payload.data === "object"
        ? payload.data
        : null;
    return state.latestStreamSnapshot;
  }

  if (!state.latestStreamSnapshot ||
      typeof state.latestStreamSnapshot !== "object") {
    state.latestStreamSnapshot = {};
  }

  const keys = String(payload.path || "")
    .split("/")
    .filter(Boolean);

  if (!keys.length) return state.latestStreamSnapshot;

  let cursor = state.latestStreamSnapshot;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];

    if (!cursor[key] || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }

    cursor = cursor[key];
  }

  const finalKey = keys[keys.length - 1];

  if (payload.data === null) {
    delete cursor[finalKey];
  } else {
    cursor[finalKey] = payload.data;
  }

  return state.latestStreamSnapshot;
}

function handleLatestStreamEvent(event) {
  try {
    const payload = JSON.parse(event.data);
    const latest = applyStreamPayload(payload);

    if (!latest) return;

    renderLatest(latest);
    setConnectionStatus(true);

    if (state.selectedRange === "realtime" || state.historyError) {
      renderCharts();
    }
  } catch (error) {
    console.error("Lỗi xử lý dữ liệu Firebase realtime:", error);
  }
}

function scheduleLatestStreamReconnect() {
  if (state.latestStreamReconnectTimer) return;

  state.latestStreamReconnectTimer = window.setTimeout(() => {
    state.latestStreamReconnectTimer = null;
    startLatestStream();
  }, STREAM_RECONNECT_MS);
}

function startLatestStream() {
  if (!("EventSource" in window)) return;

  if (state.latestStream) {
    state.latestStream.close();
    state.latestStream = null;
  }

  const stream = new EventSource(latestFirebaseUrl());
  state.latestStream = stream;

  stream.addEventListener("open", () => {
    state.latestStreamConnected = true;
    setConnectionStatus(true);
  });

  stream.addEventListener("put", handleLatestStreamEvent);
  stream.addEventListener("patch", handleLatestStreamEvent);

  stream.addEventListener("cancel", (event) => {
    console.warn("Firebase đóng realtime stream:", event);
    state.latestStreamConnected = false;
    stream.close();

    if (state.latestStream === stream) {
      state.latestStream = null;
    }

    scheduleLatestStreamReconnect();
  });

  stream.onerror = () => {
    state.latestStreamConnected = false;
    stream.close();

    if (state.latestStream === stream) {
      state.latestStream = null;
    }

    scheduleLatestStreamReconnect();
  };
}

function encodeTimestampAsPushIdStart(timestamp) {
  let value = Math.max(0, Math.floor(timestamp));
  const timeChars = new Array(8);

  for (let index = 7; index >= 0; index -= 1) {
    timeChars[index] = PUSH_ID_CHARS.charAt(value % 64);
    value = Math.floor(value / 64);
  }

  return timeChars.join("") + "-".repeat(12);
}

function decodePushIdTimestamp(key) {
  if (typeof key !== "string" || key.length < 8) return null;

  let timestamp = 0;
  for (let index = 0; index < 8; index += 1) {
    const value = PUSH_ID_CHARS.indexOf(key.charAt(index));
    if (value < 0) return null;
    timestamp = timestamp * 64 + value;
  }

  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

async function fetchHistory(rangeKey = state.selectedRange) {
  const config = RANGE_CONFIG[rangeKey] || RANGE_CONFIG.realtime;
  const params = new URLSearchParams();

  params.set("orderBy", '"$key"');
  params.set("limitToLast", String(config.fetchLimit));

  if (config.durationMs) {
    const startTimestamp = Date.now() - config.durationMs;
    params.set("startAt", JSON.stringify(encodeTimestampAsPushIdStart(startTimestamp)));
  }

  if (FIREBASE_AUTH) {
    params.set("auth", FIREBASE_AUTH);
  }

  const url = `https://${FIREBASE_HOST}/${PATH_HISTORY}.json?${params.toString()}`;
  return fetchJson(url);
}

function normalizeHistory(historyObject) {
  if (!historyObject || typeof historyObject !== "object") return [];

  const rawEntries = Object.entries(historyObject);
  const fallbackStart = Date.now() - rawEntries.length * POLL_INTERVAL_MS;

  return rawEntries
    .map(([key, value], index) => {
      if (!value || typeof value !== "object") return null;

      const timestamp =
        finiteNumber(value.timestamp) ||
        finiteNumber(value.serverTimestamp) ||
        decodePushIdTimestamp(key) ||
        fallbackStart + index * POLL_INTERVAL_MS;

      return {
        key,
        timestamp,
        temperature: value.dhtValid === false ? null : finiteNumber(value.temperature),
        humidity: value.dhtValid === false ? null : finiteNumber(value.humidity),
        airQualityIndex: finiteNumber(value.airQualityIndex),
        noiseDb: finiteNumber(value.noiseDb),
        pm25UgM3: finiteNumber(value.pm25UgM3),
        pm10UgM3: finiteNumber(value.pm10UgM3),
        gasPpm: finiteNumber(value.gasPpm),
        solarPercent: finiteNumber(value.solarPercent),
        solarVoltage: finiteNumber(value.solarVoltage),
        solarPowerW: finiteNumber(value.solarPowerW),
        solarLux: finiteNumber(value.solarLux),
        tiltDeg: finiteNumber(value.tiltDeg),
        vibrationMs2: finiteNumber(value.vibrationMs2),
        pirMotion: Boolean(value.pirMotion),
        relayOn: Boolean(value.relayOn),
        source: "history"
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function mergeHistory(remote, live) {
  const all = [...remote, ...live].sort((a, b) => a.timestamp - b.timestamp);
  const result = [];

  all.forEach((point) => {
    const previous = result[result.length - 1];

    if (previous && Math.abs(previous.timestamp - point.timestamp) < 1200) {
      result[result.length - 1] = point.source === "history" ? point : previous;
    } else {
      result.push(point);
    }
  });

  return result;
}

function averageNumbers(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function downsample(points, maxPoints) {
  if (points.length <= maxPoints) return points;

  const bucketSize = points.length / maxPoints;
  const result = [];

  for (let bucket = 0; bucket < maxPoints; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize));
    const group = points.slice(start, end);

    if (!group.length) continue;

    result.push({
      timestamp: group[Math.floor(group.length / 2)].timestamp,
      temperature: averageNumbers(group.map((item) => item.temperature)),
      humidity: averageNumbers(group.map((item) => item.humidity)),
      airQualityIndex: averageNumbers(group.map((item) => item.airQualityIndex)),
      noiseDb: averageNumbers(group.map((item) => item.noiseDb)),
      pm25UgM3: averageNumbers(group.map((item) => item.pm25UgM3)),
      pm10UgM3: averageNumbers(group.map((item) => item.pm10UgM3)),
      gasPpm: averageNumbers(group.map((item) => item.gasPpm)),
      solarPercent: averageNumbers(group.map((item) => item.solarPercent)),
      solarVoltage: averageNumbers(group.map((item) => item.solarVoltage)),
      solarPowerW: averageNumbers(group.map((item) => item.solarPowerW)),
      solarLux: averageNumbers(group.map((item) => item.solarLux)),
      tiltDeg: averageNumbers(group.map((item) => item.tiltDeg)),
      vibrationMs2: averageNumbers(group.map((item) => item.vibrationMs2)),
      source: "aggregate"
    });
  }

  return result;
}

function rawPointsForSelectedRange() {
  const config = RANGE_CONFIG[state.selectedRange] || RANGE_CONFIG.realtime;
  const cutoff = Date.now() - config.durationMs;

  return mergeHistory(state.remoteHistory, state.liveHistory)
    .filter((item) => item.timestamp >= cutoff);
}

function pointsForSelectedRange(rawPoints = rawPointsForSelectedRange()) {
  const config = RANGE_CONFIG[state.selectedRange] || RANGE_CONFIG.realtime;
  return downsample(rawPoints, config.maxPoints);
}

function formatAxisTime(timestamp, rangeKey) {
  const date = new Date(timestamp);

  if (["realtime", "15m", "1h"].includes(rangeKey)) {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: rangeKey === "realtime" ? "2-digit" : undefined
    }).format(date);
  }

  if (["24h", "1d"].includes(rangeKey)) {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function setupCanvas(canvas, preferredHeight = 330) {
  if (!canvas) return null;

  const parent = canvas.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  const width = Math.max(280, Math.floor(parentRect?.width || canvas.clientWidth || 600));
  const height = Math.max(240, Math.floor(parentRect?.height || preferredHeight));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  return { context, width, height };
}

function text(context, value, x, y, options = {}) {
  context.save();
  context.fillStyle = options.color || "#94a3b8";
  context.font = options.font || '12px "DM Sans", sans-serif';
  context.textAlign = options.align || "left";
  context.textBaseline = options.baseline || "alphabetic";
  context.fillText(String(value), x, y);
  context.restore();
}

function lineScale(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return { min: 0, max: 1 };

  let min = Math.min(...valid);
  let max = Math.max(...valid);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    min -= padding;
    max += padding;
  } else {
    const padding = (max - min) * 0.12;
    min -= padding;
    max += padding;
  }

  if (min > 0 && min < max * 0.25) min = 0;
  return { min, max };
}

function drawEmptyChart(context, width, height, message) {
  context.save();
  context.strokeStyle = "rgba(157, 184, 205, 0.14)";
  context.setLineDash([5, 7]);
  context.strokeRect(42, 42, width - 84, height - 84);
  context.restore();

  text(context, message, width / 2, height / 2, {
    color: "#718397",
    align: "center",
    baseline: "middle",
    font: '500 13px "DM Sans", sans-serif'
  });
}

function drawLegend(context, datasets, startX, y) {
  let x = startX;

  datasets.forEach((dataset) => {
    context.save();
    context.strokeStyle = dataset.color;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, y - 4);
    context.lineTo(x + 20, y - 4);
    context.stroke();
    context.restore();

    text(context, dataset.label, x + 27, y, {
      color: "#c7d4de",
      font: '600 11px "DM Sans", sans-serif'
    });

    x += Math.max(145, dataset.label.length * 7.2 + 55);
  });
}

function drawLineChart(canvas, points, datasets) {
  const setup = setupCanvas(canvas, 330);
  if (!setup) return;

  const { context, width, height } = setup;
  drawLegend(context, datasets, 48, 21);

  if (!points.length) {
    drawEmptyChart(context, width, height, "Đang chờ dữ liệu cảm biến...");
    return;
  }

  const plot = {
    left: 50,
    right: width - 52,
    top: 42,
    bottom: height - 36
  };

  if (plot.right - plot.left < 120) plot.right = width - 16;

  const xMin = points[0].timestamp;
  const xMax = points[points.length - 1].timestamp;
  const scales = datasets.map((dataset) =>
    lineScale(points.map((point) => finiteNumber(point[dataset.key])))
  );

  const horizontalLines = 5;
  context.save();
  context.lineWidth = 1;

  for (let index = 0; index <= horizontalLines; index += 1) {
    const ratio = index / horizontalLines;
    const y = plot.top + ratio * (plot.bottom - plot.top);

    context.strokeStyle = "rgba(148, 163, 184, 0.11)";
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();

    const leftScale = scales[0];
    const leftValue = leftScale.max - ratio * (leftScale.max - leftScale.min);
    text(context, leftValue.toFixed(1), plot.left - 8, y, {
      align: "right",
      baseline: "middle",
      color: datasets[0].color,
      font: '10px "DM Sans", sans-serif'
    });

    if (datasets[1]) {
      const rightScale = scales[1];
      const rightValue = rightScale.max - ratio * (rightScale.max - rightScale.min);
      text(context, rightValue.toFixed(1), plot.right + 8, y, {
        align: "left",
        baseline: "middle",
        color: datasets[1].color,
        font: '10px "DM Sans", sans-serif'
      });
    }
  }

  const xTickCount = Math.min(5, points.length);
  for (let index = 0; index < xTickCount; index += 1) {
    const pointIndex = xTickCount === 1
      ? 0
      : Math.round((index / (xTickCount - 1)) * (points.length - 1));
    const point = points[pointIndex];
    const ratio = xMax === xMin ? 0.5 : (point.timestamp - xMin) / (xMax - xMin);
    const x = plot.left + ratio * (plot.right - plot.left);

    context.strokeStyle = "rgba(148, 163, 184, 0.06)";
    context.beginPath();
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.bottom);
    context.stroke();

    text(context, formatAxisTime(point.timestamp, state.selectedRange), x, height - 13, {
      align: "center",
      color: "#718397",
      font: '10px "DM Sans", sans-serif'
    });
  }
  context.restore();

  datasets.forEach((dataset, datasetIndex) => {
    const scale = scales[datasetIndex];
    let segmentStarted = false;

    context.save();
    context.strokeStyle = dataset.color;
    context.lineWidth = 2.2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();

    points.forEach((point) => {
      const value = finiteNumber(point[dataset.key]);
      if (value === null) {
        segmentStarted = false;
        return;
      }

      const xRatio = xMax === xMin ? 0.5 : (point.timestamp - xMin) / (xMax - xMin);
      const yRatio = (value - scale.min) / (scale.max - scale.min || 1);
      const x = plot.left + xRatio * (plot.right - plot.left);
      const y = plot.bottom - yRatio * (plot.bottom - plot.top);

      if (!segmentStarted) {
        context.moveTo(x, y);
        segmentStarted = true;
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
    context.restore();

    if (points.length <= 60) {
      context.save();
      context.fillStyle = dataset.color;

      points.forEach((point) => {
        const value = finiteNumber(point[dataset.key]);
        if (value === null) return;

        const xRatio = xMax === xMin ? 0.5 : (point.timestamp - xMin) / (xMax - xMin);
        const yRatio = (value - scale.min) / (scale.max - scale.min || 1);
        const x = plot.left + xRatio * (plot.right - plot.left);
        const y = plot.bottom - yRatio * (plot.bottom - plot.top);

        context.beginPath();
        context.arc(x, y, 2.4, 0, Math.PI * 2);
        context.fill();
      });

      context.restore();
    }
  });
}

function qualityLevel(point) {
  const temperature = finiteNumber(point.temperature);
  const humidity = finiteNumber(point.humidity);
  const air = finiteNumber(point.airQualityIndex);
  const noise = finiteNumber(point.noiseDb);

  if (
    (temperature !== null && temperature >= ALERT_THRESHOLDS.temperature.danger) ||
    (air !== null && air >= ALERT_THRESHOLDS.air.danger) ||
    (noise !== null && noise >= ALERT_THRESHOLDS.noise.danger)
  ) return "danger";

  if (
    (temperature !== null && temperature >= ALERT_THRESHOLDS.temperature.warning) ||
    (humidity !== null && humidity > ALERT_THRESHOLDS.humidity.warningHigh) ||
    (air !== null && air >= ALERT_THRESHOLDS.air.warning) ||
    (noise !== null && noise >= ALERT_THRESHOLDS.noise.warning)
  ) return "warning";

  if (
    (temperature !== null && temperature >= ALERT_THRESHOLDS.temperature.medium) ||
    (humidity !== null && humidity < ALERT_THRESHOLDS.humidity.mediumLow) ||
    (air !== null && air >= ALERT_THRESHOLDS.air.medium) ||
    (noise !== null && noise >= ALERT_THRESHOLDS.noise.medium)
  ) return "medium";

  return "good";
}

function qualityCounts(points) {
  const counts = { good: 0, medium: 0, warning: 0, danger: 0 };
  points.forEach((point) => {
    counts[qualityLevel(point)] += 1;
  });
  return counts;
}

function drawQualityPie(points) {
  const setup = setupCanvas(el.qualityCanvas, 300);
  if (!setup) return;

  const { context, width, height } = setup;
  const counts = qualityCounts(points);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  if (!total) {
    drawEmptyChart(context, width, height, "Chưa đủ dữ liệu để phân loại");
    if (el.qualityLegend) {
      el.qualityLegend.innerHTML = '<p class="pie-empty">Chưa có mẫu dữ liệu.</p>';
    }
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.31;
  const innerRadius = radius * 0.58;
  let startAngle = -Math.PI / 2;

  Object.entries(QUALITY_LEVELS).forEach(([key, meta]) => {
    const value = counts[key];
    if (!value) return;

    const angle = (value / total) * Math.PI * 2;
    context.save();
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    context.closePath();
    context.fillStyle = meta.color;
    context.fill();
    context.restore();
    startAngle += angle;
  });

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  context.fillStyle = "#101b27";
  context.fill();
  context.restore();

  text(context, total, centerX, centerY - 3, {
    align: "center",
    baseline: "middle",
    color: "#edf5f7",
    font: '700 30px "DM Sans", sans-serif'
  });
  text(context, "mẫu", centerX, centerY + 23, {
    align: "center",
    baseline: "middle",
    color: "#718397",
    font: '12px "DM Sans", sans-serif'
  });

  if (el.qualityLegend) {
    el.qualityLegend.innerHTML = Object.entries(QUALITY_LEVELS)
      .map(([key, meta]) => {
        const value = counts[key];
        const percent = total ? Math.round((value / total) * 100) : 0;
        return `
          <div class="pie-legend-row">
            <span class="pie-dot" style="background:${meta.color}"></span>
            <span>${meta.label}</span>
            <strong>${value}</strong>
            <small>${percent}%</small>
          </div>
        `;
      })
      .join("");
  }
}

function updateChartMeta(points) {
  const config = RANGE_CONFIG[state.selectedRange] || RANGE_CONFIG.realtime;

  [el.climateStatus, el.envStatus, el.qualityStatus]
    .filter(Boolean)
    .forEach((element) => {
      element.textContent = config.label;
    });

  if (!el.chartRangeNote) return;

  if (state.isHistoryLoading) {
    el.chartRangeNote.textContent = `Đang tải dữ liệu ${config.label} từ Firebase...`;
    return;
  }

  if (state.historyError) {
    const statusText = state.historyError.status === 403
      ? "Nhánh history đang bị Firebase chặn quyền đọc (HTTP 403)."
      : `Không tải được history: ${state.historyError.message}.`;

    el.chartRangeNote.textContent =
      `${statusText} Biểu đồ vẫn dùng ${state.liveHistory.length} mẫu realtime ghi nhận trong phiên này.`;
    return;
  }

  if (!points.length) {
    el.chartRangeNote.textContent =
      `Chưa có dữ liệu trong khoảng ${config.label}. Hãy chạy ESP32 để tạo dữ liệu tại airnoise/history.`;
    return;
  }

  const first = points[0];
  const last = points[points.length - 1];
  el.chartRangeNote.textContent =
    `Đang hiển thị ${points.length} điểm đại diện • ${formatAxisTime(first.timestamp, state.selectedRange)} → ${formatAxisTime(last.timestamp, state.selectedRange)}.`;
}

function buildDataSnapshot() {
  const config = RANGE_CONFIG[state.selectedRange] || RANGE_CONFIG.realtime;

  return {
    rangeKey: state.selectedRange,
    rangeLabel: config.label,
    rawPoints: state.filteredPoints.map((point) => ({ ...point })),
    chartPoints: state.chartPoints.map((point) => ({ ...point })),
    source: state.historyError ? "live-fallback" : "firebase-history",
    historyError: state.historyError
      ? { status: state.historyError.status || null, message: state.historyError.message }
      : null
  };
}

function publishDataSnapshot() {
  window.dispatchEvent(new CustomEvent("airnoise:data-updated", {
    detail: buildDataSnapshot()
  }));
}

function renderCharts() {
  const rawPoints = rawPointsForSelectedRange();
  const points = pointsForSelectedRange(rawPoints);

  state.filteredPoints = rawPoints;
  state.chartPoints = points;

  drawLineChart(el.climateCanvas, points, [
    { key: "temperature", label: "Nhiệt độ (°C)", color: "#f2c15c" },
    { key: "humidity", label: "Độ ẩm (%)", color: "#73aefc" }
  ]);

  drawLineChart(el.envCanvas, points, [
    { key: "airQualityIndex", label: "AQI* (Gas)", color: "#a78bfa" },
    { key: "noiseDb", label: "Độ ồn (dB*)", color: "#ff7171" }
  ]);

  // Biểu đồ có thể dùng dữ liệu rút gọn, nhưng thống kê/CSV luôn dùng rawPoints.
  drawQualityPie(rawPoints);
  updateChartMeta(points);
  publishDataSnapshot();
}

async function refreshLatest() {
  try {
    const latest = await fetchLatest();
    renderLatest(latest);
    setConnectionStatus(true);

    if (state.selectedRange === "realtime" || state.historyError) {
      renderCharts();
    }
  } catch (error) {
    console.error("Lỗi khi lấy latest từ Firebase:", error);

    if (!state.latestStreamConnected) {
      setConnectionStatus(false, "Không đọc được Firebase latest");
    }
  }
}

async function refreshHistory(force = false) {
  const now = Date.now();
  if (state.isHistoryLoading) return;
  if (!force && now - state.lastHistoryFetchAt < HISTORY_REFRESH_MS) return;

  state.isHistoryLoading = true;
  state.historyError = null;
  updateChartMeta(state.chartPoints);

  try {
    const historyObject = await fetchHistory(state.selectedRange);
    state.remoteHistory = normalizeHistory(historyObject);
    state.lastHistoryFetchAt = Date.now();
  } catch (error) {
    console.warn("Không lấy được history:", error);
    state.historyError = error;
    state.remoteHistory = [];
    state.lastHistoryFetchAt = Date.now();
  } finally {
    state.isHistoryLoading = false;
    renderCharts();
  }
}

function selectRange(rangeKey) {
  if (!RANGE_CONFIG[rangeKey]) return;
  state.selectedRange = rangeKey;

  document.querySelectorAll(".filter-button[data-range]").forEach((button) => {
    const active = button.dataset.range === rangeKey;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  renderCharts();
  refreshHistory(true);
}

function bindEvents() {
  document.querySelectorAll(".filter-button[data-range]").forEach((button) => {
    button.addEventListener("click", () => selectRange(button.dataset.range));
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(renderCharts, 140);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function boot() {
  const firebaseConfigured =
    FIREBASE_HOST &&
    !FIREBASE_HOST.includes("YOUR-PROJECT") &&
    !FIREBASE_HOST.includes("REGION");

  bindEvents();
  renderCharts();

  if (!firebaseConfigured) {
    setConnectionStatus(false, "Chưa cấu hình Firebase URL");
    return;
  }

  setConnectionStatus(null);

  // Firebase REST streaming cập nhật giao diện ngay khi airnoise/latest đổi.
  // Polling 1 giây vẫn được giữ làm phương án dự phòng nếu stream bị chặn.
  startLatestStream();
  refreshLatest();
  refreshHistory(true);

  window.setInterval(refreshLatest, POLL_INTERVAL_MS);
  window.setInterval(() => refreshHistory(false), HISTORY_REFRESH_MS);

  window.addEventListener("beforeunload", () => {
    state.latestStream?.close();

    if (state.latestStreamReconnectTimer) {
      window.clearTimeout(state.latestStreamReconnectTimer);
    }
  });
}

window.AirNoiseDashboard = {
  getSnapshot: buildDataSnapshot
};

boot();
