///Users/animesh/Desktop/session-analyzer-gemini/frontend/script.js
// Configuration - Auto-detect environment
const API_BASE_URL = "/api"; // Production

// Global state
let isLoading = false;
let instructors = [];
let domains = [];

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  console.log("🚀 Interview Kickstart Rating Analyzer loaded!");
  console.log("API Base URL:", API_BASE_URL);

  // Handle logo fallback
  setupLogoFallback();

  // Verify all required elements exist
  const requiredElements = [
    "queryInput",
    "submitBtn",
    "resultsSection",
    "rawDataContent",
    "analysisContent",
    "errorSection",
  ];

  const missingElements = requiredElements.filter(
    (id) => !document.getElementById(id)
  );
  if (missingElements.length > 0) {
    console.error("❌ Missing required elements:", missingElements);
    return;
  }

  console.log("✅ All required elements found");
  setupEventListeners();
  checkServerHealth();
  loadFilterOptions();
});

// Setup logo fallback
function setupLogoFallback() {
  const logo = document.querySelector(".logo");
  const fallback = document.querySelector(".logo-fallback");

  if (logo) {
    logo.onerror = function () {
      logo.style.display = "none";
      if (fallback) {
        fallback.style.display = "flex";
      }
    };
  }
}

// Setup event listeners
function setupEventListeners() {
  const queryInput = document.getElementById("queryInput");
  const queryBuilder = document.getElementById("queryBuilder");

  // Query input events
  queryInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuery();
    }
  });

  // Query builder toggle
  queryBuilder.addEventListener("click", function (e) {
    if (e.target.closest(".builder-header")) {
      queryBuilder.classList.toggle("collapsed");
    }
  });

  // Close examples dropdown when clicking outside
  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("examplesDropdown");
    const examplesBtn = document.querySelector(".examples-btn");

    if (dropdown && !dropdown.contains(e.target) && e.target !== examplesBtn) {
      dropdown.style.display = "none";
    }
  });
}

// Load filter options from API
async function loadFilterOptions() {
  try {
    console.log("🔄 Loading filter options...");

    // Get unique instructors and domains
    const response = await fetch(`${API_BASE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Get all unique instructors and domains",
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.rawResults) {
        populateFilters(data.rawResults);
      }
    }
  } catch (error) {
    console.error("❌ Failed to load filter options:", error);
  }
}

// Populate filter dropdowns
function populateFilters(data) {
  const instructorFilter = document.getElementById("instructorFilter");
  const domainFilter = document.getElementById("domainFilter");

  // Extract unique values
  instructors = [
    ...new Set(data.map((item) => item.instructor || item._id).filter(Boolean)),
  ];
  domains = [...new Set(data.map((item) => item.domain).filter(Boolean))];

  // Populate instructor dropdown
  instructors.forEach((instructor) => {
    const option = document.createElement("option");
    option.value = instructor;
    option.textContent = instructor;
    instructorFilter.appendChild(option);
  });

  // Populate domain dropdown
  domains.forEach((domain) => {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    domainFilter.appendChild(option);
  });

  console.log(
    `✅ Loaded ${instructors.length} instructors and ${domains.length} domains`
  );
}

// Build query from filters
function buildQuery() {
  const instructor = document.getElementById("instructorFilter").value;
  const domain = document.getElementById("domainFilter").value;
  const timePeriod = document.getElementById("timeFilter").value;

  let query = "Show me ";
  let conditions = [];

  if (instructor) conditions.push(`sessions by ${instructor}`);
  if (domain) conditions.push(`in ${domain} domain`);
  if (timePeriod) {
    if (timePeriod.includes("q")) {
      conditions.push(`in ${timePeriod.toUpperCase()}`);
    } else {
      conditions.push(`in ${timePeriod}`);
    }
  }

  if (conditions.length === 0) {
    query = "Show me all sessions with their ratings";
  } else {
    query += conditions.join(" and ");
  }

  document.getElementById("queryInput").value = query;
  console.log("🔧 Built query:", query);
}

// Show examples dropdown
function showExamples() {
  const dropdown = document.getElementById("examplesDropdown");
  dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
}

// Fill query from example
function fillQuery(element) {
  const queryInput = document.getElementById("queryInput");
  queryInput.value = element.textContent;
  queryInput.focus();

  // Hide examples dropdown
  document.getElementById("examplesDropdown").style.display = "none";
}

// Check server health
async function checkServerHealth() {
  const statusDot = document.getElementById("connectionStatus");
  const statusText = document.getElementById("statusText");

  try {
    console.log("🔄 Checking server health...");
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();

    if (data.success) {
      statusDot.className = "status-dot connected";
      statusText.textContent = `Connected - ${data.details.database.recordCount} records ready`;
      console.log("✅ Health check passed:", data);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    statusDot.className = "status-dot error";
    statusText.textContent = "Connection error - Check server status";
    console.error("❌ Health check failed:", error);
  }
}

// Submit query
async function submitQuery() {
  if (isLoading) return;

  const queryInput = document.getElementById("queryInput");
  const query = queryInput.value.trim();

  if (!query) {
    alert("Please enter a query first!");
    queryInput.focus();
    return;
  }

  console.log(`🚀 Submitting query: "${query}"`);

  setLoadingState(true);
  hideResults();
  hideError();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds

    const response = await fetch(`${API_BASE_URL}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log("✅ Query successful:", data);
      showResults(data);
    } else {
      console.error("❌ Query failed:", data);
      showError(data.error || "An error occurred while processing your query");
    }
  } catch (error) {
    console.error("❌ Query failed:", error);
    setLoadingState(false);

    if (error.name === "AbortError") {
      showError(
        "Request timed out. The query is taking longer than expected. Please try a simpler query."
      );
    } else if (error.message.includes("HTTP error")) {
      showError(`Server error: ${error.message}. Please try again.`);
    } else {
      showError(
        "Network error: Could not connect to server. Please check if the server is running."
      );
    }
    return;
  } finally {
    setLoadingState(false);
  }
}

// Set loading state
function setLoadingState(loading) {
  isLoading = loading;
  const submitBtn = document.getElementById("submitBtn");
  const submitText = document.getElementById("submitText");
  const loadingSpinner = document.getElementById("loadingSpinner");

  submitBtn.disabled = loading;

  if (loading) {
    submitText.style.display = "none";
    loadingSpinner.style.display = "inline";
    console.log("🔄 Processing with AI...");
  } else {
    submitText.style.display = "inline";
    loadingSpinner.style.display = "none";
  }
}

// Show results
function showResults(data) {
  const resultsSection = document.getElementById("resultsSection");
  const resultMeta = document.getElementById("resultMeta");
  const analysisContent = document.getElementById("analysisContent");
  const rawDataSection = document.getElementById("rawDataSection");
  const rawDataContent = document.getElementById("rawDataContent");
  const analysisSection = document.getElementById("analysisSection");

  if (!resultsSection || !resultMeta || !analysisContent || !rawDataContent) {
    console.error("❌ Required DOM elements not found");
    showError(
      "Interface error: Could not display results. Please refresh the page."
    );
    return;
  }

  console.log("✅ Displaying results");

  // Update metadata
  resultMeta.innerHTML = `
        <div>📊 ${data.resultCount} records</div>
        <div>🤖 ${data.model || "AI"}</div>
        <div>⏱️ ${new Date(data.executionTime).toLocaleTimeString()}</div>
    `;

  // Show raw data
  if (data.rawResults && data.rawResults.length > 0) {
    rawDataContent.textContent = JSON.stringify(data.rawResults, null, 2);
  } else {
    rawDataContent.textContent = "No data found matching your query.";
  }

  // Show analysis
  if (data.analysis) {
    analysisContent.innerHTML = formatAnalysis(data.analysis);
  } else {
    analysisContent.innerHTML = "<p>Analysis not available</p>";
  }

  // Show results section
  resultsSection.style.display = "block";
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Format analysis text
function formatAnalysis(analysis) {
  return analysis
    .split("\n")
    .map((line) => {
      line = line.trim();
      if (!line) return "<br>";

      // Format headers and numbered points
      if (
        (line.length < 100 && /^[A-Z]/.test(line) && !line.endsWith(".")) ||
        /^\d+\./.test(line)
      ) {
        return `<p><strong>${escapeHtml(line)}</strong></p>`;
      }

      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Show error
function showError(message) {
  const errorSection = document.getElementById("errorSection");
  const errorMessage = document.getElementById("errorMessage");

  console.error("❌ Showing error:", message);

  errorMessage.textContent = message;
  errorSection.style.display = "block";
  errorSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Hide results
function hideResults() {
  document.getElementById("resultsSection").style.display = "none";
}

// Hide error
function hideError() {
  document.getElementById("errorSection").style.display = "none";
}

// Clear error
function clearError() {
  hideError();
  document.getElementById("queryInput").focus();
}

// Debug functions
window.testAPI = async function () {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log("🧪 API Test:", data);
    return data;
  } catch (error) {
    console.error("❌ API Test failed:", error);
    return null;
  }
};

// Ready message
window.addEventListener("load", function () {
  console.log("🎉 Interview Kickstart Rating Analyzer ready!");
  console.log("💡 Tips:");
  console.log("  - Use the Query Builder for complex filtering");
  console.log('  - Try: "Average rating for each instructor"');
  console.log('  - Try: "Sessions with attendance below 50%"');
  console.log("🔍 Debug: testAPI() - Test server connection");
});
