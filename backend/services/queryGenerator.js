// 📄 QueryGenerator.js – Fully Updated with Date Handling Fixes & Better Instructions

const Groq = require("groq-sdk");

// ✅ Converts ISO date strings & {$date: "..."} into native Date objects
function convertDateStrings(obj) {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (typeof value === "string" && isoDateRegex.test(value)) {
        obj[key] = new Date(value);
      } else if (typeof value === "object" && value !== null) {
        if (value.$date && typeof value.$date === "string") {
          obj[key] = new Date(value.$date);
        } else {
          convertDateStrings(value); // Recursively handle nested objects/arrays
        }
      }
    }
  }
  return obj;
}

class QueryGenerator {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.isInitialized = false;
    this.context = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.context = `You are a MongoDB query generator for a session rating database.

DATABASE SCHEMA:
Collection: sessions
Structure:
- topicCode: string
- type: string
- domain: string
- class: string
- cohorts: array of strings
- instructor: string
- sessionDate: Date
- ratings.overallAverage: number
- ratings.totalResponses: number
- ratings.studentsAttended: number
- ratings.percentRated: number
- ratings.yesResponses / noResponses / yesPercent / noPercent: number
- metadata.lastSyncedAt: Date
- createdAt, updatedAt: Date

IMPORTANT RULES:
1. Always return ONLY valid MongoDB aggregation pipelines as JSON arrays.
2. Use syntax: [{ "$match": { ... } }, { "$group": { ... } }, ...].
3. For date filtering, always use string format like: "2025-01-01T00:00:00.000Z" (ISO 8601).
   - Do NOT use ISODate(...), new Date(), or { "$date": ... }
   - Just return plain strings — the system will convert to Date objects.
4. For quarters: Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec.
5. Use $year, $month, $dateToString or $dateTrunc for grouping by time.
6. Use case-insensitive regex ("i") where text may vary in casing.
7. Always double-quote all JSON keys and string values.
8. If no valid query can be generated, return: []
9. Do not return markdown, comments, or explanations — ONLY the raw JSON array.
10. Avoid any write operations like $out or $merge.
11. Never include trailing commas at the end of arrays or objects.
12. Return clean, valid JSON. Your output will be parsed with JSON.parse().

EXAMPLES:

Query: "Sessions in 2025"
Response: [
  {
    "$match": {
      "sessionDate": {
        "$gte": "2025-01-01T00:00:00.000Z",
        "$lte": "2025-12-31T23:59:59.999Z"
      }
    }
  }
]

Query: "Top 5 instructors in Data Science by average rating in 2025"
Response: [
  {
    "$match": {
      "domain": "Data Science",
      "sessionDate": {
        "$gte": "2025-01-01T00:00:00.000Z",
        "$lte": "2025-12-31T23:59:59.999Z"
      }
    }
  },
  {
    "$group": {
      "_id": "$instructor",
      "avgRating": { "$avg": "$ratings.overallAverage" },
      "totalSessions": { "$sum": 1 }
    }
  },
  { "$sort": { "avgRating": -1 } },
  { "$limit": 5 }
]

Always return ONLY the JSON array.`;

      this.isInitialized = true;
      console.log("✅ Groq Query Generator initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Groq Query Generator:", error);
      throw error;
    }
  }

  async generateQuery(userQuery) {
    if (!this.isInitialized) throw new Error("Query Generator not initialized");

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: this.context },
          {
            role: "user",
            content: `User Query: "${userQuery}"\n\nMongoDB Pipeline:`,
          },
        ],
        model: "llama3-70b-8192",
        temperature: 0.1,
        max_tokens: 1000,
        top_p: 0.8,
        stream: false,
      });

      let cleaned = completion.choices[0]?.message?.content?.trim();
      if (!cleaned) throw new Error("No response from Groq API");

      if (cleaned.includes("```json")) {
        cleaned = cleaned.replace(/```json\n?/, "").replace(/\n?```/, "");
      } else if (cleaned.includes("```")) {
        cleaned = cleaned.replace(/```\n?/, "").replace(/\n?```/, "");
      }

      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error("Query must be an array");

      const processedQuery = convertDateStrings(parsed);
      console.log(
        "✅ Final MongoDB Query:",
        JSON.stringify(processedQuery, null, 2)
      );

      return processedQuery;
    } catch (error) {
      console.error("❌ Error generating query:", error.message);
      throw new Error(`Failed to generate MongoDB query: ${error.message}`);
    }
  }

  async fixQuery(originalQuery, errorMessage, failedQuery) {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: this.context },
          {
            role: "user",
            content: `The previous MongoDB query failed with error: \"${errorMessage}\"\n\nUser Query: \"${originalQuery}\"\nFailed Query: ${JSON.stringify(
              failedQuery
            )}\n\nPlease return a corrected MongoDB pipeline:`,
          },
        ],
        model: "llama3-70b-8192",
        temperature: 0.1,
        max_tokens: 1000,
        top_p: 0.8,
        stream: false,
      });

      let fixed = completion.choices[0]?.message?.content?.trim();
      if (!fixed) throw new Error("No response from Groq API");

      if (fixed.includes("```json")) {
        fixed = fixed.replace(/```json\n?/, "").replace(/\n?```/, "");
      } else if (fixed.includes("```")) {
        fixed = fixed.replace(/```\n?/, "").replace(/\n?```/, "");
      }

      const parsed = JSON.parse(fixed);
      const processed = convertDateStrings(parsed);
      console.log(
        "✅ Fixed MongoDB Query:",
        JSON.stringify(processed, null, 2)
      );
      return processed;
    } catch (error) {
      console.error("❌ Error fixing query:", error.message);
      throw new Error(`Failed to fix query: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "user", content: "Test connection. Respond with just: OK" },
        ],
        model: "llama3-70b-8192",
        temperature: 0,
        max_tokens: 10,
        stream: false,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      return response && response.includes("OK");
    } catch (error) {
      console.error("Groq connection test failed:", error);
      return false;
    }
  }
}

module.exports = new QueryGenerator();
