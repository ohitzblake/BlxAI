// server.js
const express = require("express");
const fetch = require("node-fetch");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(express.json({ limit: "1mb" }));
const PORT = process.env.PORT || 3000;

// --- Call DeepSeek Chat API ---
async function callDeepSeek(prompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set in environment");

  const body = {
    model: "deepseek-chat", // use "deepseek-coder" if you want coding focus
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1200,
  };

  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });

  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.choices[0].message.content;
}

// --- Chat Endpoint ---
app.post("/api/chat", async (req, res) => {
  try {
    const msg = req.body.message || "";
    const reply = await callDeepSeek(msg);

    // Detect if user asked for a file
    if (/\.sii/i.test(msg) || /create.*file/i.test(msg)) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blxai-"));
      const filename = "output.sii";
      fs.writeFileSync(path.join(tmpDir, filename), reply, "utf8");

      const zipPath = path.join(tmpDir, "output.zip");
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        archive.file(path.join(tmpDir, filename), { name: filename });
        archive.finalize();
      });

      const id = path.basename(tmpDir);
      const servePath = `/files/${id}.zip`;
      const filesDir = path.join(__dirname, "files");
      if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir);
      const finalPath = path.join(filesDir, id + ".zip");
      fs.copyFileSync(zipPath, finalPath);

      const downloadUrl = `${req.protocol}://${req.get("host")}${servePath}`;
      return res.json({ reply, downloadUrl });
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// --- Static for file downloads ---
app.use("/files", express.static(path.join(__dirname, "files")));

app.listen(PORT, () => console.log("Server listening on", PORT));
