const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "1mb" }));

// All files are in the ROOT folder of your GitHub repository
const ROOT = __dirname;
const ARCHITECTURE = path.join(ROOT, "architecture.json");
const FEEDBACK = path.join(ROOT, "feedback.json");

// Serve the website from the root folder
app.use(express.static(ROOT));

// Load competency architecture
app.get("/api/architecture", (req, res) => {
  try {
    res.sendFile(ARCHITECTURE);
  } catch (e) {
    res.status(500).json({
      error: "Could not load architecture."
    });
  }
});

// View submitted feedback
app.get("/api/feedback", (req, res) => {
  try {
    const rows = JSON.parse(
      fs.readFileSync(FEEDBACK, "utf8")
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

// Save feedback
app.post("/api/feedback", (req, res) => {
  const b = req.body || {};

  if (!b.reviewer || !b.vertical || !b.role || !b.decision) {
    return res.status(400).json({
      error: "Reviewer, vertical, role and decision are required."
    });
  }

  let rows = [];

  try {
    rows = JSON.parse(
      fs.readFileSync(FEEDBACK, "utf8")
    );
  } catch (e) {
    rows = [];
  }

  const record = {
    ...b,
    timestamp: new Date().toISOString()
  };

  const index = rows.findIndex(
    x =>
      x.vertical === b.vertical &&
      x.role === b.role &&
      x.reviewer === b.reviewer
  );

  if (index >= 0) {
    rows[index] = record;
  } else {
    rows.push(record);
  }

  fs.writeFileSync(
    FEEDBACK,
    JSON.stringify(rows, null, 2),
    "utf8"
  );

  res.json({
    ok: true,
    record
  });
});

// Export feedback as CSV
app.get("/api/export.csv", (req, res) => {
  let rows = [];

  try {
    rows = JSON.parse(
      fs.readFileSync(FEEDBACK, "utf8")
    );
  } catch (e) {
    rows = [];
  }

  const headers = [
    "Reviewer",
    "Organisation Vertical",
    "Role",
    "Decision",
    "Comments",
    "Timestamp"
  ];

  const escapeCSV = value =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const csv = [
    headers.join(","),
    ...rows.map(row =>
      [
        row.reviewer,
        row.vertical,
        row.role,
        row.decision,
        row.comments,
        row.timestamp
      ]
        .map(escapeCSV)
        .join(",")
    )
  ].join("\n");

  res.setHeader(
    "Content-Type",
    "text/csv; charset=utf-8"
  );

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Nuvoco_HR_Competency_Feedback.csv"'
  );

  res.send(csv);
});

// Open the website
app.get("*", (req, res) => {
  res.sendFile(
    path.join(ROOT, "index.html")
  );
});

// Start server
app.listen(PORT, () => {
  console.log(
    `Nuvoco HR Competency Review running on port ${PORT}`
  );
});
