const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "change-this-password";

app.use(
  express.json({
    limit: "1mb"
  })
);

const ROOT = __dirname;

const ARCHITECTURE = path.join(
  ROOT,
  "architecture.json"
);


/* =========================================================
   DATABASE
   ========================================================= */

if (!process.env.DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL is not configured."
  );

  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl:
    process.env.DATABASE_SSL === "false"
      ? false
      : {
          rejectUnauthorized: false
        }
});


/* =========================================================
   CREATE DATABASE TABLE
   ========================================================= */

async function initDatabase() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS competency_feedback (

      id BIGSERIAL PRIMARY KEY,

      reviewer TEXT NOT NULL,

      vertical TEXT NOT NULL,

      role TEXT NOT NULL,

      suggested_levels JSONB NOT NULL
        DEFAULT '{}'::jsonb,

      reviewed JSONB NOT NULL
        DEFAULT '[]'::jsonb,

      comments TEXT NOT NULL
        DEFAULT '',

      submitted_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

      UNIQUE (
        reviewer,
        vertical,
        role
      )

    )
  `);

  console.log(
    "PostgreSQL database initialized successfully."
  );
}


/* =========================================================
   READ FEEDBACK
   ========================================================= */

async function readFeedback() {

  const result = await pool.query(`
    SELECT

      reviewer,

      vertical,

      role,

      suggested_levels
        AS "suggestedLevels",

      reviewed,

      comments,

      submitted_at
        AS timestamp

    FROM competency_feedback

    ORDER BY submitted_at DESC
  `);

  return result.rows;
}


/* =========================================================
   ARCHITECTURE
   ========================================================= */

app.get(
  "/api/architecture",
  (req, res) => {

    res.sendFile(
      ARCHITECTURE
    );

  }
);


/* =========================================================
   PUBLIC: GET FEEDBACK
   ========================================================= */

app.get(
  "/api/feedback",
  async (req, res) => {

    try {

      const rows =
        await readFeedback();

      res.json(rows);

    } catch (error) {

      console.error(
        "Read feedback error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to read feedback."
      });

    }

  }
);


/* =========================================================
   PUBLIC: SUBMIT FEEDBACK
   ========================================================= */

app.post(
  "/api/feedback",
  async (req, res) => {

    const b =
      req.body || {};


    /* -------------------------
       VALIDATION
    ------------------------- */

    if (
      !b.reviewer ||
      !b.vertical ||
      !b.role ||
      !b.suggestedLevels
    ) {

      return res
        .status(400)
        .json({

          error:
            "Reviewer, vertical, role and suggested levels are required."

        });

    }


    try {

      const timestamp =
        new Date().toISOString();


      /*
        If the same reviewer submits
        the same role again, update
        the existing response.
      */

      const result =
        await pool.query(

          `
          INSERT INTO competency_feedback (

            reviewer,

            vertical,

            role,

            suggested_levels,

            reviewed,

            comments,

            submitted_at,

            updated_at

          )

          VALUES (

            $1,

            $2,

            $3,

            $4::jsonb,

            $5::jsonb,

            $6,

            $7::timestamptz,

            NOW()

          )

          ON CONFLICT (
            reviewer,
            vertical,
            role
          )

          DO UPDATE SET

            suggested_levels =
              EXCLUDED.suggested_levels,

            reviewed =
              EXCLUDED.reviewed,

            comments =
              EXCLUDED.comments,

            submitted_at =
              EXCLUDED.submitted_at,

            updated_at =
              NOW()

          RETURNING

            reviewer,

            vertical,

            role,

            suggested_levels
              AS "suggestedLevels",

            reviewed,

            comments,

            submitted_at
              AS timestamp
          `,

          [

            b.reviewer,

            b.vertical,

            b.role,

            JSON.stringify(
              b.suggestedLevels
            ),

            JSON.stringify(
              b.reviewed || []
            ),

            b.comments || "",

            timestamp

          ]

        );


      res.json({

        ok: true,

        record:
          result.rows[0]

      });


    } catch (error) {

      console.error(
        "Feedback save failed:",
        error
      );


      res
        .status(500)
        .json({

          error:
            "Unable to save feedback."

        });

    }

  }
);


/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

const adminTokens =
  new Set();


app.post(
  "/api/admin/login",
  (req, res) => {

    const password =
      String(
        req.body?.password || ""
      );


    if (
      password !==
      ADMIN_PASSWORD
    ) {

      return res
        .status(401)
        .json({

          error:
            "Invalid password"

        });

    }


    const token =
      crypto
        .randomBytes(24)
        .toString("hex");


    adminTokens.add(
      token
    );


    res.json({

      ok: true,

      token

    });

  }
);


/* =========================================================
   ADMIN AUTH MIDDLEWARE
   ========================================================= */

function requireAdmin(
  req,
  res,
  next
) {

  const token =
    req.headers[
      "x-admin-token"
    ];


  if (
    !token ||
    !adminTokens.has(
      token
    )
  ) {

    return res
      .status(401)
      .json({

        error:
          "Admin authentication required"

      });

  }


  next();

}


/* =========================================================
   ADMIN: VIEW FEEDBACK
   ========================================================= */

app.get(
  "/api/admin/feedback",
  requireAdmin,
  async (req, res) => {

    try {

      const rows =
        await readFeedback();

      res.json(rows);

    } catch (error) {

      console.error(
        "Admin feedback error:",
        error
      );

      res
        .status(500)
        .json({

          error:
            "Unable to read feedback."

        });

    }

  }
);


/* =========================================================
   ADMIN: CLEAR RESPONSES
   ========================================================= */

app.delete(
  "/api/admin/feedback",
  requireAdmin,
  async (req, res) => {

    const body =
      req.body || {};


    try {

      /* -------------------------
         CLEAR EVERYTHING
      ------------------------- */

      if (
        body.all === true
      ) {

        const result =
          await pool.query(
            `
            DELETE FROM
              competency_feedback
            `
          );


        return res.json({

          ok: true,

          deleted:
            result.rowCount,

          message:
            "All responses cleared."

        });

      }


      /* -------------------------
         CLEAR SELECTED
      ------------------------- */

      const reviewer =
        String(
          body.reviewer || ""
        ).trim();


      const vertical =
        String(
          body.vertical || ""
        ).trim();


      const role =
        String(
          body.role || ""
        ).trim();


      if (
        !reviewer &&
        !vertical &&
        !role
      ) {

        return res
          .status(400)
          .json({

            error:
              "At least one filter is required."

          });

      }


      const conditions = [];

      const values = [];


      if (reviewer) {

        values.push(
          reviewer
        );

        conditions.push(
          `reviewer = $${values.length}`
        );

      }


      if (vertical) {

        values.push(
          vertical
        );

        conditions.push(
          `vertical = $${values.length}`
        );

      }


      if (role) {

        values.push(
          role
        );

        conditions.push(
          `role = $${values.length}`
        );

      }


      const result =
        await pool.query(

          `
          DELETE FROM
            competency_feedback

          WHERE
            ${conditions.join(
              " AND "
            )}
          `,

          values

        );


      const remaining =
        await pool.query(
          `
          SELECT
            COUNT(*)::int AS count

          FROM
            competency_feedback
          `
        );


      res.json({

        ok: true,

        deleted:
          result.rowCount,

        remaining:
          remaining.rows[0].count,

        message:
          "Selected responses cleared."

      });


    } catch (error) {

      console.error(
        "Delete feedback error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            "Unable to clear responses."

        });

    }

  }
);


/* =========================================================
   ADMIN: CSV EXPORT
   ========================================================= */

app.get(
  "/api/admin/export.csv",
  requireAdmin,
  async (req, res) => {

    try {

      const rows =
        await readFeedback();


      const arch =
        JSON.parse(
          fs.readFileSync(
            ARCHITECTURE,
            "utf8"
          )
        );


      function mapped(
        vertical,
        role,
        code
      ) {

        const section =
          arch.sections?.find(
            x =>
              x.name ===
              vertical
          );


        const r =
          section?.roles?.find(
            x =>
              x.name ===
              role
          );


        return (
          r?.scores?.[code]
          ?? ""
        );

      }


      function name(code) {

        return (
          arch
            .competencies
            ?.[code]
            ?.name
          ||
          code
        );

      }


      function esc(value) {

        return `"${String(
          value ?? ""
        ).replaceAll(
          '"',
          '""'
        )}"`;

      }


      const headers = [

        "Reviewer",

        "Organisation Vertical",

        "Role",

        "Competency",

        "Mapped Level",

        "Recommended Level",

        "Change",

        "Reviewed",

        "Comments",

        "Timestamp"

      ];


      const output = [

        headers.join(",")

      ];


      rows.forEach(
        row => {

          Object.entries(
            row.suggestedLevels || {}
          ).forEach(
            ([code, suggested]) => {

              const mappedLevel =
                mapped(
                  row.vertical,
                  row.role,
                  code
                );


              let change =
                "No change";


              if (
                mappedLevel !== "" &&
                Number(suggested) >
                Number(mappedLevel)
              ) {

                change =
                  `Up: ${mappedLevel} to ${suggested}`;

              }


              else if (
                mappedLevel !== "" &&
                Number(suggested) <
                Number(mappedLevel)
              ) {

                change =
                  `Down: ${mappedLevel} to ${suggested}`;

              }


              output.push(

                [

                  row.reviewer,

                  row.vertical,

                  row.role,

                  `${code} - ${name(code)}`,

                  mappedLevel,

                  suggested,

                  change,

                  (
                    row.reviewed ||
                    []
                  ).includes(code)
                    ? "Yes"
                    : "No",

                  row.comments,

                  row.timestamp

                ]

                .map(
                  esc
                )

                .join(",")

              );

            }

          );

        }

      );


      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );


      res.setHeader(
        "Content-Disposition",
        'attachment; filename="Nuvoco_HR_Competency_Feedback_Detailed.csv"'
      );


      res.send(
        output.join("\n")
      );


    } catch (error) {

      console.error(
        "CSV export error:",
        error
      );


      res
        .status(500)
        .json({

          error:
            "Unable to export."

        });

    }

  }
);


/* =========================================================
   ADMIN PAGE
   ========================================================= */

app.get(
  "/admin",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "admin.html"
      )
    );

  }
);


/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
  express.static(
    ROOT
  )
);


/* =========================================================
   SPA FALLBACK
   ========================================================= */

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );

  }
);


/* =========================================================
   START SERVER
   ========================================================= */

initDatabase()

  .then(
    () => {

      app.listen(
        PORT,
        () => {

          console.log(
            `Nuvoco HR Competency Review running on port ${PORT}`
          );

        }
      );

    }
  )

  .catch(
    error => {

      console.error(
        "Database initialization failed:",
        error
      );

      process.exit(1);

    }
  );
