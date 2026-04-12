import express from "express";

const router = express.Router();

const PISTON_API = "https://emkc.org/api/v2/piston";

// POST /api/execute
// Proxies code execution to Piston API server-side to avoid CORS/auth issues
router.post("/", async (req, res) => {
  try {
    const { language, version, files } = req.body;

    const response = await fetch(`${PISTON_API}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language, version, files }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Piston API error: ${response.status} - ${errorText}`,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Execute proxy error:", error);
    return res.status(500).json({ error: `Failed to execute code: ${error.message}` });
  }
});

export default router;
