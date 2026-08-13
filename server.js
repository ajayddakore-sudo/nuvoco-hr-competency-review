const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT =
  process.env.PORT || 10000;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  "change-this-password";


app.use(
  express.json({
    limit:"1mb"
  })
);


const ROOT =
  __dirname;

const ARCHITECTURE =
  path.join(
    ROOT,
    "architecture.json"
  );

const FEEDBACK =
  path.join(
    ROOT,
    "feedback.json"
  );


/* READ FEEDBACK */

function readFeedback(){

  try{

    return JSON.parse(
      fs.readFileSync(
        FEEDBACK,
        "utf8"
      )
    );

  }catch(e){

    return [];

  }

}


/* WRITE FEEDBACK */

function writeFeedback(rows){

  fs.writeFileSync(
    FEEDBACK,
    JSON.stringify(
      rows,
      null,
      2
    ),
    "utf8"
  );

}


/* ARCHITECTURE API */

app.get(
  "/api/architecture",
  (req,res)=>{

    res.sendFile(
      ARCHITECTURE
    );

  }
);


/* FEEDBACK API */

app.get(
  "/api/feedback",
  (req,res)=>{

    res.json(
      readFeedback()
    );

  }
);


/* SAVE REVIEW */

app.post(
  "/api/feedback",
  (req,res)=>{

    const b =
      req.body || {};


    if(
      !b.reviewer ||
      !b.vertical ||
      !b.role ||
      !b.suggestedLevels
    ){

      return res
        .status(400)
        .json({

          error:
          "Reviewer, vertical, role and suggested levels are required."

        });

    }


    const rows =
      readFeedback();


    const record={

      reviewer:
        b.reviewer,

      vertical:
        b.vertical,

      role:
        b.role,

      suggestedLevels:
        b.suggestedLevels,

      comments:
        b.comments || "",

      timestamp:
        new Date()
        .toISOString()

    };


    const index =
      rows.findIndex(
        x=>
          x.vertical===
            b.vertical &&

          x.role===
            b.role &&

          x.reviewer===
            b.reviewer
      );


    if(index>=0){

      rows[index]=
        record;

    }else{

      rows.push(
        record
      );

    }


    writeFeedback(
      rows
    );


    res.json({

      ok:true,

      record

    });

  }
);


/* ADMIN LOGIN */

const adminTokens =
  new Set();


app.post(
  "/api/admin/login",
  (req,res)=>{

    const password =
      String(
        req.body?.password ||
        ""
      );


    if(
      password !==
      ADMIN_PASSWORD
    ){

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

      ok:true,

      token

    });

  }
);


/* ADMIN AUTH */

function requireAdmin(
  req,
  res,
  next
){

  const token =
    req.headers[
      "x-admin-token"
    ];


  if(
    !token ||
    !adminTokens.has(
      token
    )
  ){

    return res
      .status(401)
      .json({

        error:
        "Admin authentication required"

      });

  }


  next();

}


/* ADMIN FEEDBACK */

app.get(
  "/api/admin/feedback",
  requireAdmin,
  (req,res)=>{

    res.json(
      readFeedback()
    );

  }
);


/* ADMIN CSV EXPORT */

app.get(
  "/api/admin/export.csv",
  requireAdmin,
  (req,res)=>{

    const rows =
      readFeedback();


    const headers=[

      "Reviewer",

      "Organisation Vertical",

      "Role",

      "Competency",

      "Mapped Level",

      "Suggested Level",

      "Change",

      "Comments",

      "Timestamp"

    ];


    const arch=
      JSON.parse(
        fs.readFileSync(
          ARCHITECTURE,
          "utf8"
        )
      );


    function getMapped(
      vertical,
      role,
      code
    ){

      const s=
        arch.sections
        ?.find(
          x=>
            x.name===
            vertical
        );


      const r=
        s?.roles
        ?.find(
          x=>
            x.name===
            role
        );


      return(
        r?.scores?.[code]
        ??
        ""
      );

    }


    function getName(code){

      return(
        arch
        .competencies
        ?.[code]
        ?.name
        ||
        code
      );

    }


    function escapeCSV(v){

      return `"${String(
        v??""
      ).replaceAll(
        '"',
        '""'
      )}"`;

    }


    const output=[
      headers.join(",")
    ];


    rows.forEach(
      row=>{

        Object
        .entries(
          row.suggestedLevels||{}
        )
        .forEach(
          ([code,suggested])=>{

            const mapped=
              getMapped(
                row.vertical,
                row.role,
                code
              );


            let change=
              "No change";


            if(
              mapped!=="" &&
              Number(suggested)>
              Number(mapped)
            ){

              change=
                `Up: ${mapped} to ${suggested}`;

            }


            else if(
              mapped!=="" &&
              Number(suggested)<
              Number(mapped)
            ){

              change=
                `Down: ${mapped} to ${suggested}`;

            }


            output.push(

              [

                row.reviewer,

                row.vertical,

                row.role,

                `${code} - ${getName(code)}`,

                mapped,

                suggested,

                change,

                row.comments,

                row.timestamp

              ]
              .map(
                escapeCSV
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
      'attachment; filename="Nuvoco_HR_Competency_Feedback.csv"'
    );


    res.send(
      output.join("\n")
    );

  }
);


/* ADMIN PAGE */

app.get(
  "/admin",
  (req,res)=>{

    res.sendFile(
      path.join(
        ROOT,
        "admin.html"
      )
    );

  }
);


/* STATIC FILES */

app.use(
  express.static(
    ROOT
  )
);


/* MAIN WEBSITE */

app.get(
  "*",
  (req,res)=>{

    res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );

  }
);


/* START */

app.listen(
  PORT,
  ()=>{

    console.log(
      `Nuvoco HR Competency Review running on port ${PORT}`
    );

  }
);
