///Users/animesh/Desktop/session-analyzer-gemini/backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const queryGenerator = require("./services/queryGenerator");
const resultAnalyzer = require("./services/resultAnalyzer");
const mongoService = require("./services/mongoService");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// ✅ Lazy global initialization (safe for serverless)
const initPromise = (async function initializeContexts() {
  console.log("🔄 Initializing global contexts...");

  try {
    await queryGenerator.initialize();
    console.log("✅ Query Generator initialized");

    await resultAnalyzer.initialize();
    console.log("✅ Result Analyzer initialized");

    await mongoService.connect();
    console.log("✅ MongoDB connected");

    console.log("🎉 All global contexts initialized successfully!");
  } catch (error) {
    console.error("❌ Context initialization failed:", error.message);
    throw error;
  }
})();

// Main query endpoint
app.post("/api/query", async (req, res) => {
  try {
    await initPromise; // ✅ Ensure initialization is complete

    const { query } = req.body;
    if (!query || query.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Query is required",
      });
    }

    console.log(`\n📝 Processing query: "${query}"`);
    console.log("─".repeat(50));

    const mongoQuery = await queryGenerator.generateQuery(query);
    console.log("✅ MongoDB query generated");

    const results = await mongoService.executeQueryWithRetry(mongoQuery, query);
    console.log(
      `✅ Query executed successfully, ${results.length} results found`
    );

    const analysis = await resultAnalyzer.analyzeResults(query, results);
    console.log("✅ Results analyzed");

    console.log("─".repeat(50));
    console.log("🎉 Query processing completed successfully!\n");

    res.json({
      success: true,
      query: query,
      resultCount: results.length,
      analysis: analysis,
      rawResults: results.length <= 200 ? results : results.slice(0, 50),
      executionTime: new Date().toISOString(),
      model: "llama3-70b-8192",
    });
  } catch (error) {
    console.error("❌ Query processing failed:", error.message);
    console.log("─".repeat(50));

    if (error.message.includes("429") || error.message.includes("quota")) {
      res.status(429).json({
        success: false,
        error: "Gemini quota exceeded",
        details:
          "Daily free tier limit reached (50 requests). Try again tomorrow or upgrade to paid tier.",
        quotaInfo: {
          freeLimit: "50 requests/day",
          resetTime: "Midnight PST",
          upgradeUrl: "https://aistudio.google.com/",
          currentTime: new Date().toISOString(),
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || "An error occurred while processing your query",
      });
    }
  }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    await initPromise; // ✅ Ensure services are initialized

    const dbCount = await mongoService.testConnection();
    const queryGenTest = await queryGenerator.testConnection();
    const resultAnalyzerTest = await resultAnalyzer.testConnection();

    res.json({
      success: true,
      message: "Server and all services are healthy",
      details: {
        database: {
          connected: mongoService.isConnected,
          recordCount: dbCount,
        },
        gemini: {
          queryGenerator: queryGenTest,
          resultAnalyzer: resultAnalyzerTest,
        },
      },
      model: "llama3-70b-8192",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Health check failed:", error);
    res.status(500).json({
      success: false,
      error: "Health check failed",
      details: error.message,
    });
  }
});

// Test Gemini endpoint
app.get("/api/test-gemini", async (req, res) => {
  try {
    await initPromise;

    const queryGenTest = await queryGenerator.testConnection();
    const resultAnalyzerTest = await resultAnalyzer.testConnection();

    res.json({
      success: true,
      geminiTests: {
        queryGenerator: queryGenTest,
        resultAnalyzer: resultAnalyzerTest,
      },
      model: "llama3-70b-8192",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Gemini test failed",
      details: error.message,
    });
  }
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🔄 Shutting down gracefully...");
  await mongoService.disconnect();
  console.log("✅ Database disconnected");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

module.exports = app;
