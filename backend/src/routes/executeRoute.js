import express from "express";
import { ENV } from "../lib/env.js";

const router = express.Router();

const JUDGE0_API = "https://judge0-ce.p.rapidapi.com";

// Judge0 language IDs (matching Piston language names used in frontend)
const LANGUAGE_IDS = {
  javascript: 63,  // Node.js 12.14.0
  python: 71,      // Python 3.8.1
  java: 62,        // Java OpenJDK 13.0.1
};

// POST /api/execute
// Proxies code execution to Judge0 CE (replaces Piston which now requires paid auth)
router.post("/", async (req, res) => {
  try {
    const { language, files } = req.body;

    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    const sourceCode = files?.[0]?.content || "";

    // Submit to Judge0 with wait=true for synchronous response
    const response = await fetch(`${JUDGE0_API}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-key": ENV.JUDGE0_API_KEY,
        "x-rapidapi-host": "judge0-ce.p.rapidapi.com",
      },
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Judge0 API error: ${response.status} - ${errorText}`,
      });
    }

    const data = await response.json();

    // Normalise Judge0 response to match the Piston format the frontend expects
    return res.json({
      run: {
        output: data.stdout || "",
        stderr: data.stderr || data.compile_output || "",
      },
    });
  } catch (error) {
    console.error("Execute proxy error:", error);
    return res.status(500).json({ error: `Failed to execute code: ${error.message}` });
  }
});

export default router;
