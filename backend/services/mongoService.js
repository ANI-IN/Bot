const { MongoClient } = require("mongodb");
const queryGenerator = require("./queryGenerator");

// FINAL FIX: Helper function to convert all date strings to Date objects
function convertDateStrings(obj) {
  // This regex matches "YYYY-MM-DDTHH:mm:ss.sssZ"
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (typeof value === "string" && isoDateRegex.test(value)) {
        obj[key] = new Date(value);
      } else if (typeof value === "object" && value !== null) {
        // As a fallback, handle the {$date: "..."} format in case the LLM still produces it
        if (value.$date && typeof value.$date === "string") {
          obj[key] = new Date(value.$date);
        } else {
          convertDateStrings(value); // Recurse into nested objects and arrays
        }
      }
    }
  }
  return obj;
}

class MongoService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) return;

      console.log("🔄 Connecting to MongoDB...");
      this.client = new MongoClient(process.env.MONGODB_URI);
      await this.client.connect();

      this.db = this.client.db(
        process.env.MONGODB_DB_NAME || "rating-analyzer"
      );
      this.collection = this.db.collection("sessions");

      this.isConnected = true;
      console.log("✅ Connected to MongoDB Atlas");

      const count = await this.testConnection();
      console.log(`📊 Database contains ${count} session records`);
    } catch (error) {
      console.error("❌ MongoDB connection failed:", error.message);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const count = await this.collection.countDocuments();
      return count;
    } catch (error) {
      throw new Error(`Database test failed: ${error.message}`);
    }
  }

  async executeQueryWithRetry(mongoQuery, originalQuery, maxRetries = 2) {
    let currentQuery = mongoQuery;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(
          `🔄 Executing query (attempt ${attempt + 1}/${maxRetries})`
        );

        // =========================================================================
        // FINAL FIX: Convert all date strings to Date objects before executing
        // This ensures the query matches the BSON Date type in your database.
        // =========================================================================
        const processedQuery = convertDateStrings(
          JSON.parse(JSON.stringify(currentQuery))
        ); // Deep copy to avoid side effects

        console.log(
          "Query (Processed for Dates):",
          JSON.stringify(processedQuery, null, 2)
        );

        const results = await this.collection
          .aggregate(processedQuery)
          .toArray();

        console.log(
          `✅ Query executed successfully, found ${results.length} results`
        );
        return results;
      } catch (error) {
        console.error(
          `❌ Query execution failed (attempt ${attempt + 1}): ${error.message}`
        );

        if (attempt === maxRetries - 1) {
          throw new Error(
            `Database query failed after ${maxRetries} attempts: ${error.message}`
          );
        }

        try {
          console.log("🔄 Attempting to fix query with Groq...");
          currentQuery = await queryGenerator.fixQuery(
            originalQuery,
            error.message,
            currentQuery
          );
          console.log("✅ Query fixed, retrying...");
        } catch (fixError) {
          console.error("❌ Failed to fix query:", fixError.message);
          throw new Error(`Query could not be fixed: ${fixError.message}`);
        }
      }
    }
  }

  async executeRawQuery(pipeline) {
    try {
      if (!this.isConnected) {
        throw new Error("Database not connected");
      }
      // Also process raw queries for dates
      const processedPipeline = convertDateStrings(
        JSON.parse(JSON.stringify(pipeline))
      );
      return await this.collection.aggregate(processedPipeline).toArray();
    } catch (error) {
      throw new Error(`Raw query execution failed: ${error.message}`);
    }
  }

  async getSampleData(limit = 3) {
    try {
      return await this.collection.find({}).limit(limit).toArray();
    } catch (error) {
      throw new Error(`Failed to get sample data: ${error.message}`);
    }
  }

  async getCollectionStats() {
    try {
      const stats = await this.db.runCommand({ collStats: "sessions" });
      return {
        documentCount: stats.count,
        avgDocumentSize: stats.avgObjSize,
        totalSize: stats.size,
        storageSize: stats.storageSize,
      };
    } catch (error) {
      throw new Error(`Failed to get collection stats: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        console.log("✅ MongoDB disconnected");
      }
    } catch (error) {
      console.error("❌ Error disconnecting from MongoDB:", error.message);
    }
  }
}

module.exports = new MongoService();
