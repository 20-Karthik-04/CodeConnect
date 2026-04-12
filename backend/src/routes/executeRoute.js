import express from "express";
import { ENV } from "../lib/env.js";

const router = express.Router();

const JDOODLE_API = "https://api.jdoodle.com/v1/execute";

// JDoodle language config (matching Piston language names used in frontend)
const LANGUAGE_CONFIG = {
  javascript: { language: "nodejs",  versionIndex: "4" },
  python:     { language: "python3", versionIndex: "4" },
  java:       { language: "java",    versionIndex: "4" },
};

// POST /api/execute
// Proxies code execution to JDoodle Compiler API (free tier, no credit card needed)
router.post("/", async (req, res) => {
  try {
    const { language, files } = req.body;

    const config = LANGUAGE_CONFIG[language];
    if (!config) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    let sourceCode = files?.[0]?.content || "";

    // JDoodle requires the Java public class to be named exactly "Main".
    // Rename whatever class the user wrote (e.g. "Solution") to "Main".
    if (language === "java") {
      sourceCode = sourceCode.replace(
        /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/,
        "class Main {"
      );
    }

    const response = await fetch(JDOODLE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId:     ENV.JDOODLE_CLIENT_ID,
        clientSecret: ENV.JDOODLE_CLIENT_SECRET,
        script:       sourceCode,
        language:     config.language,
        versionIndex: config.versionIndex,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `JDoodle API error: ${response.status} - ${errorText}`,
      });
    }

    const data = await response.json();

    // Normalise JDoodle response to the { run: { output, stderr } } shape
    // that the frontend already expects (same as old Piston format)
    return res.json({
      run: {
        output: data.output || "",
        stderr: "",          // JDoodle merges stderr into output
      },
    });
  } catch (error) {
    console.error("Execute proxy error:", error);
    return res.status(500).json({ error: `Failed to execute code: ${error.message}` });
  }
});

export default router;
