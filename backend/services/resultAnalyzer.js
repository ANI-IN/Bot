///Users/animesh/Desktop/session-analyzer-gemini/backend/services/resultAnalyzer.js
const Groq = require("groq-sdk");

class ResultAnalyzer {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    this.isInitialized = false;
    this.context = null;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      this.context = `You are a data analyst specializing in educational session ratings and performance metrics.

Your job is to analyze query results from a session rating database and provide clear, actionable insights.

CONTEXT ABOUT THE DATA:
- Sessions are educational classes with instructors
- Ratings are on a 1-5 scale (5 being excellent)
- Domains include: SRE, Cloud, Backend, Frontend, Data Science, etc.
- Each session has attendance and feedback metrics
- Data spans multiple quarters and years

ANALYSIS GUIDELINES:
1. When showing aggregated results (like "average rating for each instructor"), provide ALL results in a clear, organized format
2. For queries asking for lists, rankings, or comparisons, show the COMPLETE data
3. Include specific numbers and percentages when relevant
4. Compare performance where appropriate (vs average, trends over time)
5. Point out any concerning patterns (low ratings, poor attendance)
6. Keep responses focused and actionable
7. If no data found, explain what this means
8. Format numbers clearly (e.g., "4.2 out of 5", "85% attendance")
9. For large result sets, organize data in tables or clear lists
10. Always show ALL instructors/domains/entities when user asks for "each" or "all"

RESPONSE FORMAT:
- For aggregated queries (like "average rating for each instructor"), provide a COMPLETE list or table of ALL results
- Start with a direct answer to the user's question
- Show ALL data when user asks for "each", "all", or wants a complete list
- Follow with supporting details and context
- End with actionable insights or recommendations if applicable
- Keep it conversational but professional
- Format large lists in readable tables or organized sections

Do not:
- Include raw MongoDB queries or technical details
- Overwhelm with too many statistics
- Make assumptions beyond what the data shows`;

      this.isInitialized = true;
      console.log("✅ Groq Result Analyzer initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Groq Result Analyzer:", error);
      throw error;
    }
  }

  async analyzeResults(originalQuery, results) {
    if (!this.isInitialized) {
      throw new Error("Result Analyzer not initialized");
    }

    try {
      // Prepare results summary for analysis
      const resultSummary = this.prepareResultSummary(results);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: this.context,
          },
          {
            role: "user",
            content: `User asked: "${originalQuery}"

Query returned ${results.length} results.

${resultSummary}

Please analyze these results and provide clear insights about what this data tells us in response to the user's question. Show ALL the data when the user asks for complete lists or comparisons.`,
          },
        ],
        model: "llama3-70b-8192",
        temperature: 0.3,
        max_tokens: 2000,
        top_p: 0.9,
        stream: false,
      });

      const analysis = completion.choices[0]?.message?.content?.trim();

      if (!analysis) {
        throw new Error("No response from Groq API");
      }

      console.log("✅ Generated Analysis:", analysis);
      return analysis;
    } catch (error) {
      console.error("❌ Error analyzing results:", error.message);
      throw new Error(`Failed to analyze results: ${error.message}`);
    }
  }

  prepareResultSummary(results) {
    if (!results || results.length === 0) {
      return "No data found matching the query criteria.";
    }

    // For aggregated results (like instructor averages, domain stats), show ALL data
    if (this.isAggregatedData(results)) {
      return `Complete aggregated results (${
        results.length
      } records):\n${JSON.stringify(results, null, 2)}`;
    }

    // If results are simple and small, show all
    if (results.length <= 10) {
      return `Complete results: ${JSON.stringify(results, null, 2)}`;
    }

    // For large individual record sets, provide detailed summary
    let summary = `Data overview:\n`;
    summary += `- Total records: ${results.length}\n`;

    // Show more sample data for large datasets
    const sampleData = results.slice(0, 10);
    summary += `- Sample data (first 10 records): ${JSON.stringify(
      sampleData,
      null,
      2
    )}\n`;

    // Look for rating patterns if available
    const ratingsFound = results.filter(
      (r) => r.ratings && r.ratings.overallAverage
    );
    if (ratingsFound.length > 0) {
      const avgRating =
        ratingsFound.reduce((sum, r) => sum + r.ratings.overallAverage, 0) /
        ratingsFound.length;
      summary += `- Average rating across results: ${avgRating.toFixed(2)}\n`;
    }

    // Look for instructor patterns
    const instructors = [
      ...new Set(results.map((r) => r.instructor).filter(Boolean)),
    ];
    if (instructors.length > 0) {
      summary += `- Unique instructors: ${instructors.length} (${instructors
        .slice(0, 5)
        .join(", ")}${instructors.length > 5 ? "..." : ""})\n`;
    }

    // Look for domain patterns
    const domains = [...new Set(results.map((r) => r.domain).filter(Boolean))];
    if (domains.length > 0) {
      summary += `- Domains covered: ${domains.join(", ")}\n`;
    }

    return summary;
  }

  // Helper method to identify if results are aggregated data
  isAggregatedData(results) {
    if (!results || results.length === 0) return false;

    // Check if results look like aggregation output
    const firstResult = results[0];

    // Common aggregation patterns
    const hasAggregationFields =
      firstResult &&
      firstResult.hasOwnProperty("_id") &&
      (firstResult.hasOwnProperty("avgRating") ||
        firstResult.hasOwnProperty("averageRating") ||
        firstResult.hasOwnProperty("totalSessions") ||
        firstResult.hasOwnProperty("count") ||
        firstResult.hasOwnProperty("sum") ||
        firstResult.hasOwnProperty("avg"));

    // If it has aggregation fields and is reasonable size, show all
    return hasAggregationFields && results.length <= 200;
  }

  // Test connection to Groq
  async testConnection() {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: "Test connection. Respond with just: OK",
          },
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

module.exports = new ResultAnalyzer();
