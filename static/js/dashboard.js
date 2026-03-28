function getDashboardData() {
  const rawJson = document.getElementById("dashboardDataJson");
  if (!rawJson) {
    return {
      attackDistribution: [],
      attacksOverTime: [],
    };
  }

  try {
    return JSON.parse(rawJson.textContent || "{}");
  } catch {
    return {
      attackDistribution: [],
      attacksOverTime: [],
    };
  }
}

const dashboardData = getDashboardData();

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function renderLatestQuery() {
  const sqlBlock = document.getElementById("dashboardLastSql");
  const queryType = document.getElementById("lastQueryType");
  if (!sqlBlock || !queryType) return;

  // Reset latest-query state on every dashboard load so refresh shows empty box.
  localStorage.removeItem("dccr_last_generated_sql");
  localStorage.removeItem("dccr_last_query_type");

  queryType.textContent = "No query has been executed from Query Panel yet.";
  sqlBlock.textContent = "No query has been executed yet.";
}

function buildAttackTypeChart() {
  const canvas = document.getElementById("attackTypeChart");
  if (!canvas) return;

  const topAttackRows = [...dashboardData.attackDistribution]
    .sort((a, b) => Number(b.total_count || 0) - Number(a.total_count || 0))
    .slice(0, 10);

  const labels = topAttackRows.map((row) => row.attack_type || "Unknown");
  const values = topAttackRows.map((row) => Number(row.total_count || 0));

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Attack Count",
          data: values,
          backgroundColor: "rgba(6, 182, 212, 0.45)",
          borderColor: "rgba(6, 182, 212, 1)",
          borderRadius: 6,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              const count = formatNumber(context.raw);
              return ` Detected ${count} records for this attack type`;
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
            text: "Attack Type",
            color: "#cbd5e1",
          },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
          beginAtZero: true,
          title: {
            display: true,
            text: "Number of Detected Records",
            color: "#cbd5e1",
          },
        },
      },
    },
  });

  const attackHint = document.getElementById("attackSummaryHint");
  if (attackHint && topAttackRows.length) {
    const top = topAttackRows[0];
    attackHint.textContent = `Tall bars mean more frequent attack categories. The dominant pattern is ${top.attack_type} with ${formatNumber(top.total_count)} records, so prioritize investigation there first.`;
  } else if (attackHint) {
    attackHint.textContent =
      "Each bar is one attack category. Upload and process data to populate this graph.";
  }
}

function buildAttackTimeChart() {
  const canvas = document.getElementById("attackTimeChart");
  if (!canvas) return;

  const points = [...dashboardData.attacksOverTime]
    .map((row) => ({
      minute_slot: row.minute_slot,
      total_count: Number(row.total_count || 0),
    }))
    .sort((a, b) => String(a.minute_slot).localeCompare(String(b.minute_slot)));

  const labels = points.map((row) => row.minute_slot);
  const values = points.map((row) => row.total_count);

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Attacks/Minute",
          data: values,
          borderColor: "rgba(20, 184, 166, 1)",
          backgroundColor: "rgba(20, 184, 166, 0.2)",
          fill: true,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: "rgba(20, 184, 166, 1)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              return ` ${formatNumber(context.raw)} attacks in this minute window`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxTicksLimit: 8 },
          grid: { color: "rgba(148, 163, 184, 0.12)" },
          title: {
            display: true,
            text: "Time Window",
            color: "#cbd5e1",
          },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.12)" },
          beginAtZero: true,
          title: {
            display: true,
            text: "Attacks Per Minute",
            color: "#cbd5e1",
          },
        },
      },
    },
  });

  const timeHint = document.getElementById("timeSummaryHint");
  if (timeHint && points.length) {
    const peak = points.reduce((best, current) => {
      if (!best || current.total_count > best.total_count) return current;
      return best;
    }, null);
    if (peak) {
      timeHint.textContent = `Rising line segments indicate growing attack pressure. The highest spike appears at ${peak.minute_slot} with ${formatNumber(peak.total_count)} attacks in that interval.`;
    }
  } else if (timeHint) {
    timeHint.textContent =
      "The line traces attack volume by minute. Upload and process data to render trend points.";
  }
}

function renderDashboardInsights() {
  const container = document.getElementById("dashboardInsights");
  if (!container) return;

  const topAttackRows = [...dashboardData.attackDistribution].sort(
    (a, b) => Number(b.total_count || 0) - Number(a.total_count || 0),
  );
  const timeRows = [...dashboardData.attacksOverTime].map((row) => ({
    minute_slot: row.minute_slot,
    total_count: Number(row.total_count || 0),
  }));

  const topAttack = topAttackRows[0];
  const peakMinute = timeRows.reduce((best, current) => {
    if (!best || current.total_count > best.total_count) return current;
    return best;
  }, null);

  const insightCards = [
    {
      title: "Bar Chart Meaning",
      text: "Each vertical bar is an attack class and its total detections. Higher bars indicate the most common and urgent attack patterns.",
    },
    {
      title: "Line Chart Meaning",
      text: "The line chart shows attack intensity by minute. Steep rises and sharp peaks represent burst activity that can indicate active incidents.",
    },
    {
      title: "Primary Risk Focus",
      text: topAttack
        ? `${topAttack.attack_type} is currently dominant with ${formatNumber(topAttack.total_count)} records.`
        : "Upload and process a dataset to identify the dominant attack pattern.",
    },
    {
      title: "Peak Incident Window",
      text: peakMinute
        ? `${peakMinute.minute_slot} is the highest-load interval (${formatNumber(peakMinute.total_count)} attacks).`
        : "No timeline points yet. Run uploads to generate temporal insights.",
    },
  ];

  container.innerHTML = insightCards
    .map(
      (item) => `
        <article class="insight-card">
          <h3 class="font-semibold text-cyan-200 mb-1">${item.title}</h3>
          <p class="text-slate-300">${item.text}</p>
        </article>
      `,
    )
    .join("");
}

const attackTypeKnowledge = {
  BENIGN: {
    title: "BENIGN",
    description:
      "Normal, non-malicious network traffic and legitimate user activity.",
    riskLevel: "Low",
    riskColor: "text-green-300",
    prevention:
      "Maintain baseline knowledge of normal traffic patterns. Monitor for deviations.",
    icon: "✓",
  },
  PortScan: {
    title: "Port Scan",
    description:
      "Automated scanning of network ports to discover open services and vulnerabilities.",
    riskLevel: "Medium",
    riskColor: "text-yellow-300",
    prevention:
      "Use firewalls to block unnecessary inbound traffic. Enable port security. Monitor for suspicious scanning activity.",
    icon: "🔍",
  },
  "Web Attack – Brute Force": {
    title: "Web Attack – Brute Force",
    description:
      "Repeated login attempts to guess credentials through systematic trials.",
    riskLevel: "High",
    riskColor: "text-red-300",
    prevention:
      "Use strong passwords, implement account lockouts, enable multi-factor authentication (MFA).",
    icon: "🔨",
  },
  Bot: {
    title: "Bot",
    description:
      "Automated malicious software that performs unauthorized actions on compromised systems.",
    riskLevel: "High",
    riskColor: "text-red-300",
    prevention:
      "Keep systems patched and updated. Use antivirus/antimalware. Block suspicious IP ranges.",
    icon: "🤖",
  },
  "Web Attack – XSS": {
    title: "Web Attack – XSS",
    description:
      "Cross-Site Scripting that injects malicious scripts into web pages to steal user data.",
    riskLevel: "High",
    riskColor: "text-red-300",
    prevention:
      "Validate and sanitize all user inputs. Use Content Security Policy (CSP) headers. Encode output properly.",
    icon: "💉",
  },
  Infiltration: {
    title: "Infiltration",
    description:
      "Unauthorized access and movement through a network to exfiltrate sensitive data.",
    riskLevel: "Critical",
    riskColor: "text-red-500",
    prevention:
      "Implement strict access controls, network segmentation, and intrusion detection systems. Monitor logs continuously.",
    icon: "🕵️",
  },
  "Web Attack – Sql Injection": {
    title: "Web Attack – SQL Injection",
    description:
      "Injection of SQL queries into input fields to manipulate database queries and access unauthorized data.",
    riskLevel: "High",
    riskColor: "text-red-300",
    prevention:
      "Use parameterized queries (prepared statements). Validate inputs. Apply principle of least privilege to database accounts.",
    icon: "💾",
  },
  DoS: {
    title: "DoS (Denial of Service)",
    description:
      "Flooding attack designed to overwhelm services and make them unavailable to legitimate users.",
    riskLevel: "High",
    riskColor: "text-red-300",
    prevention:
      "Use rate limiting, traffic filtering, DDoS protection services. Monitor bandwidth usage.",
    icon: "⚡",
  },
};

function renderAttackTypeLearning() {
  const container = document.getElementById("learnAttackTypesList");
  if (!container) return;

  const uniqueAttackTypes = [
    ...new Set(dashboardData.attackDistribution.map((row) => row.attack_type)),
  ].filter((type) => type);

  if (!uniqueAttackTypes.length) {
    container.innerHTML =
      '<p class="text-slate-400 text-sm">Upload data to see attack types.</p>';
    return;
  }

  const cards = uniqueAttackTypes
    .map((attackType) => {
      const info = attackTypeKnowledge[attackType] || {
        title: attackType,
        description: "Information about this attack type.",
        riskLevel: "Unknown",
        riskColor: "text-slate-300",
        prevention: "Implement standard security best practices.",
        icon: "⚠️",
      };

      return `
        <div class="learn-attack-card">
          <button class="w-full text-left p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800 transition learn-toggle" data-attack="${attackType}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-xl">${info.icon}</span>
                <div>
                  <h3 class="font-semibold text-cyan-200">${info.title}</h3>
                  <p class="text-xs text-slate-400">${info.description}</p>
                </div>
              </div>
              <span class="text-slate-300">▼</span>
            </div>
          </button>
          <div class="learn-details hidden bg-slate-900/30 p-3 text-sm rounded-b-lg border-l border-r border-b border-slate-700 mt-0">
            <div class="space-y-2">
              <div>
                <span class="text-slate-400">Risk Level:</span>
                <span class="font-semibold ${info.riskColor} ml-2">${info.riskLevel}</span>
              </div>
              <div>
                <span class="text-slate-400">Prevention:</span>
                <p class="text-slate-300 mt-1">${info.prevention}</p>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = cards;

  document.querySelectorAll(".learn-toggle").forEach((button) => {
    button.addEventListener("click", (e) => {
      const details = e.currentTarget
        .closest(".learn-attack-card")
        .querySelector(".learn-details");
      details?.classList.toggle("hidden");
    });
  });
}

buildAttackTypeChart();
buildAttackTimeChart();
renderLatestQuery();
renderAttackTypeLearning();
renderDashboardInsights();
