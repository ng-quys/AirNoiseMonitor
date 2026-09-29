(() => {
  "use strict";

  // Đồng bộ với các ngưỡng trong include/config.h của ESP32.
  const THRESHOLDS = {
    temp: { medium: 30, warning: 35, danger: 40 },
    humidity: { low: 30, high: 85 },
    air: { medium: 75, warning: 150, danger: 300 },
    noise: { medium: 60, warning: 70, danger: 85 }
  };

  const POLL_INTERVAL = 1200;

  const state = {
    mode: "AUTO",
    analyticsPoints: [],
    analyticsRangeKey: "realtime",
    analyticsRangeLabel: "Realtime",
    analyticsSource: "firebase-history",
    analyticsHistoryError: null,
    alerts: [],
    lastSignature: "",
    lastLevel: "unknown",
    lastValueUpdateAt: 0,
    devices: {
      fan: false,
      led: false,
      buzzer: false
    }
  };

  const $ = (id) => document.getElementById(id);

  const elements = {
    connectionStatus: $("connectionStatus"),
    tempValue: $("tempValue"),
    humidityValue: $("humidityValue"),
    airValue: $("airValue"),
    noiseValue: $("noiseValue"),

    heroTempValue: $("heroTempValue"),
    heroAirValue: $("heroAirValue"),
    heroNoiseValue: $("heroNoiseValue"),

    envStatusBadge: $("envStatusBadge"),
    envStatusText: $("envStatusText"),
    overallStatusTitle: $("overallStatusTitle"),
    overallStatusDescription: $("overallStatusDescription"),
    overallStatusCode: $("overallStatusCode"),

    deviceStatusText: $("deviceStatusText"),
    lastUpdated: $("lastUpdated"),
    currentModeText: $("currentModeText"),

    tempLevel: $("tempLevel"),
    humidityLevel: $("humidityLevel"),
    airLevel: $("airLevel"),
    noiseLevel: $("noiseLevel"),

    tempSignalText: $("tempSignalText"),
    humiditySignalText: $("humiditySignalText"),
    airSignalText: $("airSignalText"),
    noiseSignalText: $("noiseSignalText"),

    tempSignalBar: $("tempSignalBar"),
    humiditySignalBar: $("humiditySignalBar"),
    airSignalBar: $("airSignalBar"),
    noiseSignalBar: $("noiseSignalBar"),
    tempSignalPercent: $("tempSignalPercent"),
    humiditySignalPercent: $("humiditySignalPercent"),
    airSignalPercent: $("airSignalPercent"),
    noiseSignalPercent: $("noiseSignalPercent"),

    analyticsRangeText: $("analyticsRangeText"),
    sampleCountLabel: $("sampleCountLabel"),
    sampleCountDescription: $("sampleCountDescription"),
    avgTempDescription: $("avgTempDescription"),
    thresholdCountDescription: $("thresholdCountDescription"),
    sampleCount: $("sampleCount"),
    avgTemp: $("avgTemp"),
    maxAir: $("maxAir"),
    maxNoise: $("maxNoise"),
    thresholdCount: $("thresholdCount"),

    modeAuto: $("modeAuto"),
    modeManual: $("modeManual"),

    fanControl: $("fanControl"),
    ledControl: $("ledControl"),
    buzzerControl: $("buzzerControl"),

    fanStateText: $("fanStateText"),
    ledStateText: $("ledStateText"),
    buzzerStateText: $("buzzerStateText"),

    exportCsvButton: $("exportCsvButton"),
    clearLogButton: $("clearLogButton"),
    alertLogBody: $("alertLogBody"),

    cardTemp: $("cardTemp"),
    cardHumidity: $("cardHumidity"),
    cardAir: $("cardAir"),
    cardNoise: $("cardNoise")
  };

  function toNumber(element) {
    if (!element) return null;
    const value = Number.parseFloat(String(element.textContent).replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }

  function getValues() {
    return {
      temp: toNumber(elements.tempValue),
      humidity: toNumber(elements.humidityValue),
      air: toNumber(elements.airValue),
      noise: toNumber(elements.noiseValue)
    };
  }

  function allValuesReady(values) {
    return Object.values(values).every((value) => Number.isFinite(value));
  }

  function formatTime(timestamp = Date.now()) {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(timestamp);
  }

  function formatDateTime(timestamp = Date.now()) {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(timestamp);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function levelForTemperature(value) {
    if (!Number.isFinite(value)) return { level: "unknown", text: "Chưa có dữ liệu" };
    if (value >= THRESHOLDS.temp.danger) return { level: "danger", text: "Nguy hiểm" };
    if (value >= THRESHOLDS.temp.warning) return { level: "warning", text: "Cảnh báo" };
    if (value >= THRESHOLDS.temp.medium) return { level: "medium", text: "Trung bình" };
    return { level: "good", text: "Tốt" };
  }

  function levelForHumidity(value) {
    if (!Number.isFinite(value)) return { level: "unknown", text: "Chưa có dữ liệu" };
    if (value < THRESHOLDS.humidity.low || value > THRESHOLDS.humidity.high) {
      return { level: "warning", text: "Ngoài khoảng phù hợp" };
    }
    return { level: "good", text: "Phù hợp" };
  }

  function levelForAir(value) {
    if (!Number.isFinite(value)) return { level: "unknown", text: "Chưa có dữ liệu" };
    if (value >= THRESHOLDS.air.danger) return { level: "danger", text: "Nguy hiểm" };
    if (value >= THRESHOLDS.air.warning) return { level: "warning", text: "Cảnh báo" };
    if (value >= THRESHOLDS.air.medium) return { level: "medium", text: "Trung bình" };
    return { level: "good", text: "Tốt" };
  }

  function levelForNoise(value) {
    if (!Number.isFinite(value)) return { level: "unknown", text: "Chưa có dữ liệu" };
    if (value >= THRESHOLDS.noise.danger) return { level: "danger", text: "Nguy hiểm" };
    if (value >= THRESHOLDS.noise.warning) return { level: "warning", text: "Cảnh báo" };
    if (value >= THRESHOLDS.noise.medium) return { level: "medium", text: "Trung bình" };
    return { level: "good", text: "Tốt" };
  }

  function overallLevel(values) {
    const levels = [
      levelForTemperature(values.temp).level,
      levelForAir(values.air).level,
      levelForNoise(values.noise).level
    ];

    if (levels.includes("danger")) return "danger";
    if (levels.includes("warning")) return "warning";
    if (levels.includes("medium")) return "medium";
    if (levels.every((level) => level === "good")) return "good";
    return "unknown";
  }

  function levelMeta(level) {
    const table = {
      good: {
        title: "Môi trường đang ở mức tốt",
        badge: "Tốt",
        code: "GOOD",
        description: "Các thông số đang nằm trong vùng theo dõi phù hợp của hệ thống demo."
      },
      medium: {
        title: "Môi trường ở mức trung bình",
        badge: "Trung bình",
        code: "MED",
        description: "Một hoặc nhiều thông số bắt đầu tăng. Nên tiếp tục theo dõi xu hướng."
      },
      warning: {
        title: "Hệ thống phát hiện mức cảnh báo",
        badge: "Cảnh báo",
        code: "WARN",
        description: "Có thông số vượt ngưỡng cảnh báo. Nên kiểm tra thông gió và nguồn gây ô nhiễm hoặc tiếng ồn."
      },
      danger: {
        title: "Môi trường đang ở mức nguy hiểm",
        badge: "Nguy hiểm",
        code: "DANGER",
        description: "Có thông số vượt ngưỡng nguy hiểm. Hệ thống nên kích hoạt cảnh báo và thiết bị chấp hành."
      },
      unknown: {
        title: "Đang phân tích môi trường",
        badge: "Đang phân tích",
        code: "--",
        description: "Hệ thống đang chờ đủ dữ liệu từ cảm biến."
      }
    };
    return table[level] || table.unknown;
  }

  function updateStatusBadge(level) {
    if (!elements.envStatusBadge) return;
    const meta = levelMeta(level);

    elements.envStatusBadge.classList.remove(
      "environment-good",
      "environment-warning",
      "environment-danger"
    );

    if (level === "danger") {
      elements.envStatusBadge.classList.add("environment-danger");
    } else if (level === "warning" || level === "medium") {
      elements.envStatusBadge.classList.add("environment-warning");
    } else {
      elements.envStatusBadge.classList.add("environment-good");
    }

    elements.envStatusText.textContent = meta.badge;
    elements.overallStatusTitle.textContent = meta.title;
    elements.overallStatusDescription.textContent = meta.description;
    elements.overallStatusCode.textContent = meta.code;
  }

  function updateSignalBar(element, percentElement, value, warningThreshold) {
    if (!element || !Number.isFinite(value)) {
      if (element) element.style.width = "0%";
      if (percentElement) percentElement.textContent = "--% ngưỡng cảnh báo";
      return;
    }

    const rawPercent = (value / warningThreshold) * 100;
    const displayPercent = Math.max(0, Math.round(rawPercent));
    element.style.width = `${clamp(rawPercent, 0, 100)}%`;

    if (percentElement) {
      percentElement.textContent = `${displayPercent}% ngưỡng cảnh báo`;
    }
  }

  function updateHumiditySignalBar(element, percentElement, value) {
  if (!element || !Number.isFinite(value)) {
    if (element) {
      element.style.width = "0%";
    }

    if (percentElement) {
      percentElement.textContent = "--% độ ẩm";
    }

    return;
  }

  // Độ ẩm vốn đã nằm trên thang 0–100%.
  const humidityPercent = clamp(value, 0, 100);

  element.style.width = `${humidityPercent}%`;

  if (percentElement) {
    percentElement.textContent = `${value.toFixed(1)}% độ ẩm`;
  }
}

  function updateCardState(card, level) {
    if (!card) return;
    if (level === "danger") card.dataset.state = "danger";
    else if (level === "warning" || level === "medium") card.dataset.state = "warning";
    else delete card.dataset.state;
  }

  function updateMetricLabels(values) {
    const temp = levelForTemperature(values.temp);
    const humidity = levelForHumidity(values.humidity);
    const air = levelForAir(values.air);
    const noise = levelForNoise(values.noise);

    if (elements.tempLevel) elements.tempLevel.textContent = temp.text;
    if (elements.humidityLevel) elements.humidityLevel.textContent = humidity.text;
    if (elements.airLevel) elements.airLevel.textContent = air.text;
    if (elements.noiseLevel) elements.noiseLevel.textContent = noise.text;

    if (elements.tempSignalText) {
      elements.tempSignalText.textContent = Number.isFinite(values.temp)
        ? `${values.temp.toFixed(1)}°C · ${temp.text}`
        : "Chưa có dữ liệu";
    }

    if (elements.humiditySignalText) {
  elements.humiditySignalText.textContent =
    Number.isFinite(values.humidity)
      ? `${values.humidity.toFixed(1)}% · ${humidity.text}`
      : "Chưa có dữ liệu";
} 

    if (elements.airSignalText) {
      elements.airSignalText.textContent = Number.isFinite(values.air)
        ? `${Math.round(values.air)} AQI* · ${air.text}`
        : "Chưa có dữ liệu";
    }

    if (elements.noiseSignalText) {
      elements.noiseSignalText.textContent = Number.isFinite(values.noise)
        ? `${values.noise.toFixed(1)} dB* · ${noise.text}`
        : "Chưa có dữ liệu";
    }

    updateSignalBar(
      elements.tempSignalBar,
      elements.tempSignalPercent,
      values.temp,
      THRESHOLDS.temp.warning
    );
    updateHumiditySignalBar(
  elements.humiditySignalBar,
  elements.humiditySignalPercent,
  values.humidity
);
    updateSignalBar(
      elements.airSignalBar,
      elements.airSignalPercent,
      values.air,
      THRESHOLDS.air.warning
    );
    updateSignalBar(
      elements.noiseSignalBar,
      elements.noiseSignalPercent,
      values.noise,
      THRESHOLDS.noise.warning
    );

    updateCardState(elements.cardTemp, temp.level);
    updateCardState(elements.cardHumidity, humidity.level);
    updateCardState(elements.cardAir, air.level);
    updateCardState(elements.cardNoise, noise.level);
  }

  function updateHeroValues(values) {
    if (elements.heroTempValue && Number.isFinite(values.temp)) {
      elements.heroTempValue.textContent = values.temp.toFixed(1);
    }

    if (elements.heroAirValue && Number.isFinite(values.air)) {
      elements.heroAirValue.textContent = Math.round(values.air);
    }

    if (elements.heroNoiseValue && Number.isFinite(values.noise)) {
      elements.heroNoiseValue.textContent = values.noise.toFixed(1);
    }
  }

  function signature(values) {
    return [
      values.temp?.toFixed(2),
      values.humidity?.toFixed(2),
      values.air?.toFixed(2),
      values.noise?.toFixed(2)
    ].join("|");
  }

  function markLatestUpdate(values) {
    if (!allValuesReady(values)) return;

    const nextSignature = signature(values);
    if (nextSignature === state.lastSignature) return;

    state.lastSignature = nextSignature;
    state.lastValueUpdateAt = Date.now();

    if (elements.lastUpdated) {
      elements.lastUpdated.textContent = formatTime(state.lastValueUpdateAt);
    }
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function pointLevel(point) {
    const finiteOrNull = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    return overallLevel({
      temp: finiteOrNull(point.temperature),
      humidity: finiteOrNull(point.humidity),
      air: finiteOrNull(point.airQualityIndex),
      noise: finiteOrNull(point.noiseDb)
    });
  }

  function updateStatistics() {
    const points = state.analyticsPoints;
    const rangeLabel = state.analyticsRangeLabel;

    if (elements.sampleCountLabel) {
      elements.sampleCountLabel.textContent = `Số mẫu trong ${rangeLabel}`;
    }

    if (elements.sampleCount) {
      elements.sampleCount.textContent = String(points.length);
    }

    if (elements.avgTempDescription) {
      elements.avgTempDescription.textContent = `Trung bình trong khoảng ${rangeLabel}`;
    }

    if (elements.analyticsRangeText) {
      if (state.analyticsHistoryError) {
        elements.analyticsRangeText.textContent =
          `Không đọc được Firebase history (${state.analyticsHistoryError.status || "lỗi"}). ` +
          `Thống kê tạm dùng dữ liệu realtime ghi nhận từ lúc mở trang trong khoảng ${rangeLabel}.`;
      } else {
        elements.analyticsRangeText.textContent =
          `Thống kê và CSV đang dùng ${points.length} bản ghi từ Firebase airnoise/history ` +
          `trong khoảng ${rangeLabel}. Tải lại trang hoặc chạy lại chương trình không làm mất dữ liệu cũ.`;
      }
    }

    if (elements.sampleCountDescription) {
      elements.sampleCountDescription.textContent = state.analyticsHistoryError
        ? "Dữ liệu dự phòng trong phiên trình duyệt"
        : "Bản ghi lấy từ Firebase airnoise/history";
    }

    const tempValues = points.map((item) => Number(item.temperature)).filter(Number.isFinite);
    const airValues = points.map((item) => Number(item.airQualityIndex)).filter(Number.isFinite);
    const noiseValues = points.map((item) => Number(item.noiseDb)).filter(Number.isFinite);

    if (elements.avgTemp) {
      const avg = average(tempValues);
      elements.avgTemp.textContent = Number.isFinite(avg) ? avg.toFixed(1) : "--";
    }

    if (elements.maxAir) {
      elements.maxAir.textContent = airValues.length
        ? Math.round(Math.max(...airValues)).toString()
        : "--";
    }

    if (elements.maxNoise) {
      elements.maxNoise.textContent = noiseValues.length
        ? Math.max(...noiseValues).toFixed(1)
        : "--";
    }

    const exceededCount = points.filter((point) =>
      ["warning", "danger"].includes(pointLevel(point))
    ).length;

    if (elements.thresholdCount) {
      elements.thresholdCount.textContent = String(exceededCount);
    }

    if (elements.thresholdCountDescription) {
      elements.thresholdCountDescription.textContent =
        `Số bản ghi ở mức Cảnh báo hoặc Nguy hiểm trong khoảng ${rangeLabel}`;
    }
  }

  function applyDataSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.rawPoints)) return;

    state.analyticsPoints = snapshot.rawPoints;
    state.analyticsRangeKey = snapshot.rangeKey || "realtime";
    state.analyticsRangeLabel = snapshot.rangeLabel || "Realtime";
    state.analyticsSource = snapshot.source || "firebase-history";
    state.analyticsHistoryError = snapshot.historyError || null;
    updateStatistics();
  }

  function alertMessage(values, level) {
    const reasons = [];

    if (values.temp >= THRESHOLDS.temp.danger) {
      reasons.push(`Nhiệt độ ${values.temp.toFixed(1)}°C`);
    } else if (values.temp >= THRESHOLDS.temp.warning) {
      reasons.push(`Nhiệt độ cao ${values.temp.toFixed(1)}°C`);
    }

    if (values.air >= THRESHOLDS.air.danger) {
      reasons.push(`AQI* ${Math.round(values.air)}`);
    } else if (values.air >= THRESHOLDS.air.warning) {
      reasons.push(`Không khí xấu ${Math.round(values.air)} AQI*`);
    }

    if (values.noise >= THRESHOLDS.noise.danger) {
      reasons.push(`Độ ồn ${values.noise.toFixed(1)} dB*`);
    } else if (values.noise >= THRESHOLDS.noise.warning) {
      reasons.push(`Độ ồn cao ${values.noise.toFixed(1)} dB*`);
    }

    if (!reasons.length && level === "medium") {
      reasons.push("Một thông số đang tiến gần ngưỡng cảnh báo");
    }

    return reasons.join(" • ");
  }

  function maybeAddAlert(values, level) {
    if (!["warning", "danger"].includes(level)) {
      state.lastLevel = level;
      return;
    }

    if (state.lastLevel === level) return;

    state.lastLevel = level;

    const event = {
      timestamp: Date.now(),
      level,
      event: level === "danger" ? "Vượt ngưỡng nguy hiểm" : "Vượt ngưỡng cảnh báo",
      value: alertMessage(values, level),
      status: state.mode === "AUTO" ? "Đã xử lý tự động" : "Chờ xử lý"
    };

    state.alerts.unshift(event);
    state.alerts = state.alerts.slice(0, 50);

    renderAlerts();
    updateStatistics();
  }

  function renderAlerts() {
    if (!elements.alertLogBody) return;

    if (!state.alerts.length) {
      elements.alertLogBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">Chưa có cảnh báo nào trong phiên này.</td>
        </tr>
      `;
      return;
    }

    elements.alertLogBody.innerHTML = state.alerts.map((event) => `
      <tr>
        <td>${formatDateTime(event.timestamp)}</td>
        <td>
          <span class="event-level ${event.level}">
            ${event.level === "danger" ? "Nguy hiểm" : "Cảnh báo"}
          </span>
        </td>
        <td>${escapeHtml(event.event)}</td>
        <td>${escapeHtml(event.value || "--")}</td>
        <td>${escapeHtml(event.status)}</td>
      </tr>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setDeviceState(device, enabled) {
    state.devices[device] = Boolean(enabled);

    const map = {
      fan: [elements.fanControl, elements.fanStateText],
      led: [elements.ledControl, elements.ledStateText],
      buzzer: [elements.buzzerControl, elements.buzzerStateText]
    };

    const [button, label] = map[device];

    if (button) button.setAttribute("aria-pressed", String(Boolean(enabled)));
    if (label) label.textContent = enabled ? "Đang bật" : "Đang tắt";
  }

  function updateControlLock() {
    const isAuto = state.mode === "AUTO";

    [elements.fanControl, elements.ledControl, elements.buzzerControl]
      .filter(Boolean)
      .forEach((button) => {
        button.classList.toggle("is-locked", isAuto);
        button.setAttribute("aria-disabled", String(isAuto));
      });
  }

  function setMode(mode) {
    state.mode = mode === "MANUAL" ? "MANUAL" : "AUTO";

    elements.modeAuto?.classList.toggle("active", state.mode === "AUTO");
    elements.modeManual?.classList.toggle("active", state.mode === "MANUAL");

    if (elements.currentModeText) {
      elements.currentModeText.textContent = state.mode;
    }

    updateControlLock();

    if (state.mode === "AUTO") {
      applyAutomaticControl(getValues());
    }
  }

  function applyAutomaticControl(values) {
    if (state.mode !== "AUTO" || !allValuesReady(values)) return;

    const level = overallLevel(values);

    setDeviceState(
      "fan",
      values.temp >= THRESHOLDS.temp.warning ||
      values.air >= THRESHOLDS.air.warning
    );

    setDeviceState(
      "led",
      ["warning", "danger"].includes(level)
    );

    setDeviceState(
      "buzzer",
      level === "danger"
    );
  }

  function updateDeviceStatus() {
    if (!elements.deviceStatusText) return;

    const text = elements.connectionStatus?.textContent?.toLowerCase() || "";
    const connected =
      text.includes("đã kết nối") ||
      text.includes("connected") ||
      text.includes("online");

    const recentlyUpdated =
      state.lastValueUpdateAt > 0 &&
      Date.now() - state.lastValueUpdateAt < 15000;

    if (connected || recentlyUpdated) {
      elements.deviceStatusText.textContent = "ESP32 Online";
    } else {
      elements.deviceStatusText.textContent = "Chưa xác định";
    }
  }

  function exportCsv() {
    const points = state.analyticsPoints;

    if (!points.length) {
      window.alert(`Chưa có dữ liệu trong khoảng ${state.analyticsRangeLabel} để xuất.`);
      return;
    }

    const header = [
      "timestamp",
      "temperature_c",
      "humidity_percent",
      "air_aqi_relative",
      "noise_db_relative",
      "pm25_ug_m3",
      "pm10_ug_m3",
      "gas_ppm_relative",
      "solar_percent",
      "tilt_deg",
      "vibration_ms2",
      "pir_motion",
      "relay_on",
      "level",
      "source"
    ];

    const rows = points.map((item) => [
      new Date(item.timestamp).toISOString(),
      item.temperature ?? "",
      item.humidity ?? "",
      item.airQualityIndex ?? "",
      item.noiseDb ?? "",
      item.pm25UgM3 ?? "",
      item.pm10UgM3 ?? "",
      item.gasPpm ?? "",
      item.solarPercent ?? "",
      item.tiltDeg ?? "",
      item.vibrationMs2 ?? "",
      item.pirMotion ?? "",
      item.relayOn ?? "",
      pointLevel(item),
      item.source || state.analyticsSource
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `air-noise-monitor-${state.analyticsRangeKey}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function updateDashboard() {
    const values = getValues();

    updateHeroValues(values);
    updateMetricLabels(values);

    const level = overallLevel(values);
    updateStatusBadge(level);

    markLatestUpdate(values);
    maybeAddAlert(values, level);
    applyAutomaticControl(values);
    updateDeviceStatus();
  }

  function bindEvents() {
    elements.modeAuto?.addEventListener("click", () => setMode("AUTO"));
    elements.modeManual?.addEventListener("click", () => setMode("MANUAL"));

    const bindDevice = (button, device) => {
      button?.addEventListener("click", () => {
        if (state.mode === "AUTO") return;
        setDeviceState(device, !state.devices[device]);
      });
    };

    bindDevice(elements.fanControl, "fan");
    bindDevice(elements.ledControl, "led");
    bindDevice(elements.buzzerControl, "buzzer");

    elements.exportCsvButton?.addEventListener("click", exportCsv);

    elements.clearLogButton?.addEventListener("click", () => {
      state.alerts = [];
      state.lastLevel = "unknown";
      renderAlerts();
    });

    window.addEventListener("airnoise:data-updated", (event) => {
      applyDataSnapshot(event.detail);
    });
  }

  function startObservers() {
    const watched = [
      elements.tempValue,
      elements.humidityValue,
      elements.airValue,
      elements.noiseValue,
      elements.connectionStatus
    ].filter(Boolean);

    const observer = new MutationObserver(updateDashboard);

    watched.forEach((element) => {
      observer.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    });

    window.setInterval(updateDashboard, POLL_INTERVAL);
  }

  function init() {
    bindEvents();
    setMode("AUTO");
    renderAlerts();

    const initialSnapshot = window.AirNoiseDashboard?.getSnapshot?.();
    if (initialSnapshot) applyDataSnapshot(initialSnapshot);

    updateDashboard();
    startObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
