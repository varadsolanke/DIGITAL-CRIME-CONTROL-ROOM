const queryButtons = document.querySelectorAll(".q-btn");
const drillBtn = document.getElementById("drillBtn");
const sliceBtn = document.getElementById("sliceBtn");
const runCustomBtn = document.getElementById("runCustomBtn");
const runNlBtn = document.getElementById("runNlBtn");
const customSql = document.getElementById("customSql");
const naturalLanguageQuery = document.getElementById("naturalLanguageQuery");
const queryStatus = document.getElementById("queryStatus");
const resultContainer = document.getElementById("resultContainer");
const generatedSqlDisplay = document.getElementById("generatedSqlDisplay");
const queryPageLastSql = document.getElementById("queryPageLastSql");
const queryPageLastQueryType = document.getElementById(
  "queryPageLastQueryType",
);
const clearQueryHistoryBtn = document.getElementById("clearQueryHistoryBtn");
const QUERY_HISTORY_KEY = "dccr_query_history";
const MAX_QUERY_HISTORY = 25;

async function postQuery(payload) {
  const response = await fetch("/run_query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.status !== "success") {
    throw new Error(data.message || "Query failed.");
  }
  return {
    rows: data.rows || [],
    generatedSql: data.generated_sql || "",
  };
}

function persistQueryForDashboard(queryKind, generatedSql) {
  if (!generatedSql) return;
  localStorage.setItem("dccr_last_query_type", queryKind);
  localStorage.setItem("dccr_last_generated_sql", generatedSql);
}

function getQueryHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item && typeof item.sql === "string" && typeof item.kind === "string",
    );
  } catch {
    return [];
  }
}

function saveQueryHistory(history) {
  localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history));
}

function addQueryToHistory(queryKind, generatedSql) {
  if (!generatedSql) return;

  const history = getQueryHistory();
  history.unshift({
    kind: queryKind,
    sql: generatedSql,
    executedAt: new Date().toLocaleString(),
  });
  saveQueryHistory(history.slice(0, MAX_QUERY_HISTORY));
}

function renderQueryHistory(history) {
  if (!queryPageLastSql || !queryPageLastQueryType) return;

  if (!history.length) {
    queryPageLastQueryType.textContent =
      "No query has been executed from Query Panel yet.";
    queryPageLastSql.textContent = "No query has been executed yet.";
    return;
  }

  queryPageLastQueryType.textContent = `${history.length} queries recorded`;
  queryPageLastSql.textContent = history
    .map(
      (item, index) =>
        `#${history.length - index} | ${item.kind}${item.executedAt ? ` | ${item.executedAt}` : ""}\n${item.sql}`,
    )
    .join("\n\n----------------------------------------\n\n");
}

function restoreQueryPageLatest() {
  renderQueryHistory(getQueryHistory());
}

function clearQueryHistory() {
  localStorage.removeItem(QUERY_HISTORY_KEY);
  localStorage.removeItem("dccr_last_query_type");
  localStorage.removeItem("dccr_last_generated_sql");
  renderQueryHistory([]);
  queryStatus.textContent = "Deleted all previously recorded queries.";
}

function renderRows(rows) {
  if (!rows.length) {
    resultContainer.innerHTML =
      '<p class="text-slate-400 text-sm">No rows returned.</p>';
    return;
  }

  const columns = Object.keys(rows[0]);
  const thead = `<thead><tr>${columns.map((col) => `<th>${col}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => `<td>${row[col] === null ? "" : String(row[col])}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;

  resultContainer.innerHTML = `<table class="result-table">${thead}${tbody}</table>`;
}

async function runAndRender(payload, statusText) {
  queryStatus.textContent = `Running: ${statusText}...`;
  try {
    const { rows, generatedSql } = await postQuery(payload);
    renderRows(rows);
    generatedSqlDisplay.textContent = generatedSql || "No SQL returned.";
    persistQueryForDashboard(statusText, generatedSql);
    addQueryToHistory(statusText, generatedSql);
    renderQueryHistory(getQueryHistory());
    queryStatus.textContent = `Rows returned: ${rows.length}`;
  } catch (error) {
    queryStatus.textContent = error.message;
    generatedSqlDisplay.textContent = "Query failed. No SQL available.";
    resultContainer.innerHTML = "";
  }
}

restoreQueryPageLatest();

if (clearQueryHistoryBtn) {
  clearQueryHistoryBtn.addEventListener("click", clearQueryHistory);
}

queryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const queryType = button.dataset.query;
    runAndRender({ query_type: queryType }, queryType);
  });
});

drillBtn.addEventListener("click", () => {
  const attackType =
    document.getElementById("drillAttackType").value.trim() || "BENIGN";
  runAndRender(
    {
      query_type: "drilldown",
      filters: { attack_type: attackType },
    },
    `drilldown (${attackType})`,
  );
});

sliceBtn.addEventListener("click", () => {
  runAndRender(
    {
      query_type: "slice_dice",
      filters: {
        attack_type: document.getElementById("sliceAttackType").value.trim(),
        protocol: document.getElementById("sliceProtocol").value.trim(),
        start_time: document.getElementById("sliceStart").value.trim(),
        end_time: document.getElementById("sliceEnd").value.trim(),
      },
    },
    "slice_dice",
  );
});

runCustomBtn.addEventListener("click", () => {
  runAndRender(
    {
      query_type: "custom",
      sql: customSql.value,
    },
    "custom SQL",
  );
});

runNlBtn.addEventListener("click", () => {
  const nlText = naturalLanguageQuery.value.trim();
  if (!nlText) {
    queryStatus.textContent = "Enter a natural language query first.";
    return;
  }

  runAndRender(
    {
      query_type: "natural_language",
      natural_language: nlText,
    },
    "natural language",
  );
});
