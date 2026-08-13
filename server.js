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


/* -----------------------------
   FILE HELPERS
------------------------------ */

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


/* -----------------------------
   ARCHITECTURE
------------------------------ */

app.get(
  "/api/architecture",
  (req,res)=>{

    res.sendFile(
      ARCHITECTURE
    );

  }
);


/* -----------------------------
   PUBLIC FEEDBACK
------------------------------ */

app.get(
  "/api/feedback",
  (req,res)=>{

    res.json(
      readFeedback()
    );

  }
);


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

      reviewed:
        b.reviewed || [],

      comments:
        b.comments || "",

      timestamp:
        new Date()
        .toISOString()

    };


    /*
      If the same reviewer submits
      the same role again, update the
      previous submission instead of
      creating duplicates.
    */

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


/* -----------------------------
   ADMIN AUTHENTICATION
------------------------------ */

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


/* -----------------------------
   ADMIN: VIEW FEEDBACK
------------------------------ */

app.get(
  "/api/admin/feedback",
  requireAdmin,
  (req,res)=>{

    res.json(
      readFeedback()
    );

  }
);


/* -----------------------------
   ADMIN: CLEAR RESPONSES
------------------------------ */

app.delete(
  "/api/admin/feedback",
  requireAdmin,
  (req,res)=>{

    const body =
      req.body || {};


    let rows =
      readFeedback();


    /*
      CLEAR EVERYTHING
    */

    if(body.all===true){

      const deleted =
        rows.length;


      writeFeedback([]);


      return res.json({

        ok:true,

        deleted,

        message:
        "All responses cleared."

      });

    }


    /*
      CLEAR SELECTED RESPONSES
    */

    const reviewer =
      String(
        body.reviewer ||
        ""
      ).trim();


    const vertical =
      String(
        body.vertical ||
        ""
      ).trim();


    const role =
      String(
        body.role ||
        ""
      ).trim();


    if(
      !reviewer &&
      !vertical &&
      !role
    ){

      return res
        .status(400)
        .json({

          error:
          "At least one filter is required."

        });

    }


    const originalCount =
      rows.length;


    rows=
      rows.filter(
        item=>{

          /*
            A response matches the
            selected filters only when
            every supplied filter matches.
          */

          if(
            reviewer &&
            item.reviewer!==reviewer
          ){
            return true;
          }


          if(
            vertical &&
            item.vertical!==vertical
          ){
            return true;
          }


          if(
            role &&
            item.role!==role
          ){
            return true;
          }


          /*
            All supplied filters matched,
            therefore DELETE this record.
          */

          return false;

        }
      );


    const deleted =
      originalCount -
      rows.length;


    writeFeedback(
      rows
    );


    res.json({

      ok:true,

      deleted,

      remaining:
      rows.length,

      message:
      "Selected responses cleared."

    });

  }
);


/* -----------------------------
   ADMIN: CSV EXPORT
------------------------------ */

app.get(
  "/api/admin/export.csv",
  requireAdmin,
  (req,res)=>{

    const rows =
      readFeedback();


    const arch=
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


    function name(code){

      return(
        arch
        .competencies
        ?.[code]
        ?.name
        ||
        code
      );

    }


    function esc(v){

      return `"${String(
        v??""
      ).replaceAll(
        '"',
        '""'
      )}"`;

    }


    const headers=[

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

            const m=
              mapped(
                row.vertical,
                row.role,
                code
              );


            let change=
              "No change";


            if(
              m!=="" &&
              Number(suggested)>
              Number(m)
            ){

              change=
                `Up: ${m} to ${suggested}`;

            }

            else if(
              m!=="" &&
              Number(suggested)<
              Number(m)
            ){

              change=
                `Down: ${m} to ${suggested}`;

            }


            output.push(

              [

                row.reviewer,

                row.vertical,

                row.role,

                `${code} - ${name(code)}`,

                m,

                suggested,

                change,

                (row.reviewed||[])
                  .includes(code)
                  ?
                  "Yes"
                  :
                  "No",

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

  }
);


/* -----------------------------
   ADMIN PAGE
------------------------------ */

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


/* -----------------------------
   STATIC FILES
------------------------------ */

app.use(
  express.static(
    ROOT
  )
);


/* -----------------------------
   SPA FALLBACK
------------------------------ */

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


/* -----------------------------
   START SERVER
------------------------------ */

app.listen(
  PORT,
  ()=>{

    console.log(
      `Nuvoco HR Competency Review running on port ${PORT}`
    );

  }
);
