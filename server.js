const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: "1mb" }));

const ROOT = __dirname;
const ARCHITECTURE = path.join(ROOT, "architecture.json");
const FEEDBACK = path.join(ROOT, "feedback.json");

function readFeedback() {
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK, "utf8"));
  } catch (e) {
    return [];
  }
}

function writeFeedback(rows) {
  fs.writeFileSync(
    FEEDBACK,
    JSON.stringify(rows, null, 2),
    "utf8"
  );
}

/* ---------------- PUBLIC PORTAL ---------------- */

app.get("/api/architecture", (req, res) => {
  res.sendFile(ARCHITECTURE);
});

app.get("/api/feedback", (req, res) => {
  res.json(readFeedback());
});

app.post("/api/feedback", (req, res) => {

  const b = req.body || {};

  if (!b.reviewer || !b.vertical || !b.role || !b.decision) {
    return res.status(400).json({
      error: "Reviewer, vertical, role and decision are required."
    });
  }

  const rows = readFeedback();

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

  writeFeedback(rows);

  res.json({
    ok: true,
    record
  });
});


/* ---------------- ADMIN LOGIN ---------------- */

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "change-this-password";

const adminTokens = new Set();

app.post("/api/admin/login", (req, res) => {

  const password = String(
    req.body?.password || ""
  );

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "Invalid password"
    });
  }

  const token = crypto
    .randomBytes(24)
    .toString("hex");

  adminTokens.add(token);

  res.json({
    ok: true,
    token
  });
});


function requireAdmin(req, res, next) {

  const token =
    req.headers["x-admin-token"];

  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({
      error: "Admin authentication required"
    });
  }

  next();
}


/* ---------------- ADMIN DATA ---------------- */

app.get(
  "/api/admin/feedback",
  requireAdmin,
  (req, res) => {

    res.json(readFeedback());

  }
);


/* ---------------- ADMIN EXPORT ---------------- */

app.get(
  "/api/admin/export.csv",
  requireAdmin,
  (req, res) => {

    const rows = readFeedback();

    const headers = [
      "Reviewer",
      "Organisation Vertical",
      "Role",
      "Decision",
      "Comments",
      "Timestamp"
    ];

    const escapeCSV = value =>
      `"${String(value ?? "")
        .replaceAll('"', '""')}"`;

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
  }
);


/* ---------------- ADMIN PAGE ---------------- */

app.get("/admin", (req, res) => {

  res.sendFile(
    path.join(ROOT, "admin.html")
  );

});


/* ---------------- WEBSITE ---------------- */

app.use(express.static(ROOT));


app.get("*", (req, res) => {

  res.sendFile(
    path.join(ROOT, "index.html")
  );

});


/* ---------------- START ---------------- */

app.listen(PORT, () => {

  console.log(
    `Nuvoco HR Competency Review running on port ${PORT}`
  );

});
