const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadForm = document.getElementById("uploadForm");
const statusBox = document.getElementById("statusBox");
const loading = document.getElementById("loading");
const sampleDataContainer = document.getElementById("sampleDataContainer");
const sampleFileName = document.getElementById("sampleFileName");

function setStatus(message, type = "info") {
  statusBox.classList.remove("hidden");
  const base = "rounded-lg p-3 text-sm border";
  if (type === "error") {
    statusBox.className = `${base} border-red-500/50 text-red-200 bg-red-950/30 mt-6`;
  } else {
    statusBox.className = `${base} border-emerald-500/50 text-emerald-200 bg-emerald-950/30 mt-6`;
  }
  statusBox.textContent = message;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function renderSamplePreview(file) {
  if (!file) {
    sampleFileName.textContent = "";
    sampleDataContainer.innerHTML =
      '<p class="text-sm text-slate-500">No file selected.</p>';
    return;
  }

  sampleFileName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = String(event.target?.result || "");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 9);

    if (!lines.length) {
      sampleDataContainer.innerHTML =
        '<p class="text-sm text-slate-500">File appears empty.</p>';
      return;
    }

    const header = parseCsvLine(lines[0]);
    const bodyRows = lines.slice(1).map((line) => parseCsvLine(line));

    const tableHeader = `<thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
    const tableBody = `<tbody>${bodyRows
      .map(
        (row) =>
          `<tr>${header.map((_, idx) => `<td>${row[idx] || ""}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>`;

    sampleDataContainer.innerHTML = `<table class="result-table">${tableHeader}${tableBody}</table>`;
  };

  reader.onerror = () => {
    sampleDataContainer.innerHTML =
      '<p class="text-sm text-red-300">Unable to read file preview.</p>';
  };

  reader.readAsText(file.slice(0, 250000));
}

dropZone.addEventListener("click", () => fileInput.click());

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) {
    fileInput.files = event.dataTransfer.files;
    renderSamplePreview(file);
  }
});

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  renderSamplePreview(file);
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fileInput.files.length) {
    setStatus("Select a CSV file first.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  loading.classList.remove("hidden");
  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "Server returned non-JSON response. Please check Flask console logs.",
      );
    }
    const payload = await response.json();

    if (!response.ok || payload.status !== "success") {
      throw new Error(payload.message || "Upload failed.");
    }

    setStatus(
      `Upload complete. Inserted: ${payload.inserted_rows}, Skipped: ${payload.skipped_rows}.`,
      "success",
    );
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    loading.classList.add("hidden");
  }
});
