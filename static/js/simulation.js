let simulationChart = null;
let simulationData = [];
let simulationRunning = false;
let simulationInterval = null;
let packetsCount = 0;
let anomalyCount = 0;
let dataPoints = [];

const startSimBtn = document.getElementById("startSimBtn");
const stopSimBtn = document.getElementById("stopSimBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValue = document.getElementById("speedValue");
const showFullDataCheckbox = document.getElementById("showFullDataCheckbox");
const simulationDataContainer = document.getElementById(
  "simulationDataContainer",
);
const simulationDataDisplay = document.getElementById("simulationDataDisplay");
const statPackets = document.getElementById("statPackets");
const statRate = document.getElementById("statRate");
const statAnomalies = document.getElementById("statAnomalies");
const statStatus = document.getElementById("statStatus");

function initChart() {
  const ctx = document.getElementById("simulationChart").getContext("2d");
  simulationChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Packets/sec",
          data: [],
          borderColor: "rgba(6, 182, 212, 1)",
          backgroundColor: "rgba(6, 182, 212, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: "rgba(6, 182, 212, 1)",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#e2e8f0",
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              return ` ${context.raw} packets/sec`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
          title: {
            display: true,
            text: "Time (seconds)",
            color: "#cbd5e1",
          },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
          beginAtZero: true,
          title: {
            display: true,
            text: "Packets Per Second",
            color: "#cbd5e1",
          },
        },
      },
    },
  });
}

function generatePacketData() {
  // Generate realistic traffic patterns with occasional spikes and anomalies
  const baseRate = 1000 + Math.random() * 2000;
  const anomalyChance = Math.random();
  let rate = baseRate;

  if (anomalyChance > 0.9) {
    // 10% chance of anomaly (spike)
    rate = baseRate * (2 + Math.random());
    anomalyCount++;
  } else if (anomalyChance < 0.05) {
    // 5% chance of dip
    rate = baseRate * 0.3;
  }

  return Math.floor(rate);
}

function updateChart() {
  const packets = generatePacketData();
  packetsCount += packets;
  dataPoints.push(packets);

  const timeLabel = `${dataPoints.length}`;
  simulationChart.data.labels.push(timeLabel);
  simulationChart.data.datasets[0].data.push(packets);

  // Keep only last 15 data points for readability
  if (simulationChart.data.labels.length > 15) {
    simulationChart.data.labels.shift();
    simulationChart.data.datasets[0].data.shift();
  }

  simulationChart.update();

  // Update stats
  statPackets.textContent = packetsCount.toLocaleString();
  statRate.textContent = `${packets.toLocaleString()}/sec`;
  statAnomalies.textContent = anomalyCount;

  // Update raw data display if checkbox is checked
  if (showFullDataCheckbox.checked) {
    simulationDataContainer.classList.remove("hidden");
    const displayData = dataPoints
      .slice(-10)
      .map((p, i) => `[${dataPoints.length - 10 + i + 1}] ${p} packets/sec`)
      .join("\n");
    simulationDataDisplay.textContent = displayData || "Waiting for data...";
  }
}

function startSimulation() {
  if (simulationRunning) return;

  simulationRunning = true;
  startSimBtn.disabled = true;
  stopSimBtn.disabled = false;
  speedSlider.disabled = true;
  statStatus.textContent = "Running";
  statStatus.classList.remove("text-cyan-300");
  statStatus.classList.add("text-green-300");

  const speed = parseFloat(speedSlider.value) * 1000; // Convert to ms
  simulationInterval = setInterval(updateChart, speed);
}

function stopSimulation() {
  simulationRunning = false;
  startSimBtn.disabled = false;
  stopSimBtn.disabled = true;
  speedSlider.disabled = false;
  statStatus.textContent = "Stopped";
  statStatus.classList.remove("text-green-300");
  statStatus.classList.add("text-yellow-300");

  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

function resetSimulation() {
  simulationData = [];
  dataPoints = [];
  packetsCount = 0;
  anomalyCount = 0;
  statPackets.textContent = "0";
  statRate.textContent = "0";
  statAnomalies.textContent = "0";
  simulationDataDisplay.textContent = "";
  simulationDataContainer.classList.add("hidden");

  if (simulationChart) {
    simulationChart.data.labels = [];
    simulationChart.data.datasets[0].data = [];
    simulationChart.update();
  }
}

startSimBtn.addEventListener("click", startSimulation);
stopSimBtn.addEventListener("click", stopSimulation);

speedSlider.addEventListener("input", (e) => {
  const newSpeed = parseFloat(e.target.value);
  speedValue.textContent = newSpeed.toFixed(2);

  // If simulation is running, restart with new speed
  if (simulationRunning) {
    stopSimulation();
    startSimulation();
  }
});

showFullDataCheckbox.addEventListener("change", () => {
  if (!showFullDataCheckbox.checked) {
    simulationDataContainer.classList.add("hidden");
  }
});

// Initialize chart on page load
initChart();
statStatus.textContent = "Idle";
