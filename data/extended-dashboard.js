(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const format = (value, digits = 1) => {
    const parsed = number(value);
    return parsed === null ? "--" : parsed.toFixed(digits);
  };

  const elements = {
    pm25: $("pm25Value"),
    pm10: $("pm10Value"),
    gas: $("gasValue"),
    gasAqi: $("gasAqiValue"),
    pir: $("pirValue"),
    pirDescription: $("pirDescription"),
    tilt: $("tiltValue"),
    vibration: $("vibrationValue"),
    solar: $("solarValue"),
    solarDetail: $("solarDetail"),
    relay: $("relayValue"),
    matrix: $("matrixValue"),
    wifi: $("wifiDeviceValue"),
    wifiRssi: $("wifiRssiChip"),
    ota: $("otaChip"),
    bluetooth: $("bluetoothChip"),
    firmware: $("firmwareBadge"),
    cardPm25: $("cardPm25"),
    cardGas: $("cardGas"),
    cardPir: $("cardPir"),
    cardMpu: $("cardMpu"),
    cardRelay: $("cardRelay"),
    cardSystem: $("cardSystem")
  };

  function setCardState(card, state) {
    if (!card) return;
    card.dataset.state = state || "";
  }

  function update(raw) {
    if (!raw || typeof raw !== "object") return;

    const pm25 = number(raw.pm25UgM3);
    const pm10 = number(raw.pm10UgM3);
    const gas = number(raw.gasPpm);
    const aqi = number(raw.airQualityIndex);
    const tilt = number(raw.tiltDeg);
    const vibration = number(raw.vibrationMs2);
    const solar = number(raw.solarPercent);

    if (elements.pm25) elements.pm25.textContent = format(pm25);
    if (elements.pm10) elements.pm10.textContent = `PM10: ${format(pm10)} µg/m³`;
    if (elements.gas) elements.gas.textContent = gas === null ? "--" : String(Math.round(gas));
    if (elements.gasAqi) elements.gasAqi.textContent = `AQI tương đối: ${aqi === null ? "--" : Math.round(aqi)}`;

    if (elements.pir) {
      elements.pir.textContent = raw.pirMotion ? "Đang có chuyển động" : "Không phát hiện";
    }
    if (elements.pirDescription) {
      elements.pirDescription.textContent = raw.pirMotion
        ? "PIR vừa kích hoạt"
        : "Cảm biến hồng ngoại thụ động";
    }

    if (elements.tilt) elements.tilt.textContent = format(tilt);
    if (elements.vibration) elements.vibration.textContent = `Rung: ${format(vibration, 2)} m/s²`;

    if (elements.solar) elements.solar.textContent = format(solar, 0);
    if (elements.solarDetail) {
      elements.solarDetail.textContent = raw.wokwiSimulation
        ? `${format(raw.solarVoltage, 2)} V* · ${format(raw.solarPowerW, 2)} W* · ${format(raw.solarLux, 0)} lux`
        : `${format(raw.solarVoltage, 2)} V · ${format(raw.solarPowerW, 2)} W ước tính`;
    }

    if (elements.relay) elements.relay.textContent = raw.relayOn ? "ĐANG BẬT" : "Đang tắt";

    if (elements.matrix) {
      elements.matrix.textContent = raw.anyAlert
        ? "Cảnh báo màu đỏ"
        : raw.pirMotion
          ? "PIR màu xanh dương"
          : raw.wifiConnected
            ? "Hệ thống bình thường"
            : "Mất WiFi / màu vàng";
    }

    if (elements.wifi) {
      elements.wifi.textContent = raw.wifiConnected
        ? `Online · ${raw.wifiSsid || "WiFi"}`
        : "WiFi đang kết nối lại";
    }
    if (elements.wifiRssi) elements.wifiRssi.textContent = `RSSI ${raw.wifiConnected ? `${raw.wifiRssi} dBm` : "--"}`;
    if (elements.ota) elements.ota.textContent = raw.otaReady ? "OTA READY" : "OTA OFF";
    if (elements.bluetooth) elements.bluetooth.textContent = raw.bluetoothProvisioning ? "BT CONFIG ON" : "BT CONFIG OFF";
    if (elements.firmware) elements.firmware.textContent = `Firmware ${raw.firmwareVersion || "--"}`;

    setCardState(elements.cardPm25, raw.alertPm25 ? "danger" : pm25 !== null && pm25 >= 25 ? "warning" : "");
    setCardState(elements.cardGas, raw.alertGas ? "danger" : gas !== null && gas >= 350 ? "warning" : "");
    setCardState(elements.cardPir, raw.pirMotion ? "motion" : "");
    setCardState(elements.cardMpu, raw.alertVibration ? "danger" : "");
    setCardState(elements.cardRelay, raw.relayOn ? "active" : "");
    setCardState(elements.cardSystem, raw.wifiConnected ? "online" : "warning");
  }

  window.addEventListener("airnoise:latest-updated", (event) => update(event.detail?.raw));
})();
