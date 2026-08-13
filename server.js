const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const FEEDBACK = path.join(DATA_DIR, "feedback.json");

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/architecture",(req,res)=>{
  res.sendFile(path.join(DATA_DIR,"architecture.json"));
});

app.get("/api/feedback",(req,res)=>{
  try { res.json(JSON.parse(fs.readFileSync(FEEDBACK,"utf8"))); }
  catch(e){ res.json([]); }
});

app.post("/api/feedback",(req,res)=>{
  const b=req.body||{};
  if(!b.reviewer || !b.vertical || !b.role || !b.decision)
    return res.status(400).json({error:"Reviewer, vertical, role and decision are required."});
  let rows=[];
  try { rows=JSON.parse(fs.readFileSync(FEEDBACK,"utf8")); } catch(e){}
  const now=new Date().toISOString();
  const record={...b,timestamp:now};
  const idx=rows.findIndex(x=>x.vertical===b.vertical && x.role===b.role && x.reviewer===b.reviewer);
  if(idx>=0) rows[idx]=record; else rows.push(record);
  fs.writeFileSync(FEEDBACK,JSON.stringify(rows,null,2));
  res.json({ok:true,record});
});

app.get("/api/export.csv",(req,res)=>{
  let rows=[];
  try { rows=JSON.parse(fs.readFileSync(FEEDBACK,"utf8")); } catch(e){}
  const headers=["Reviewer","Organisation Vertical","Role","Decision","Comments","Timestamp"];
  const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv=[headers.join(","),...rows.map(x=>[
    x.reviewer,x.vertical,x.role,x.decision,x.comments,x.timestamp
  ].map(esc).join(","))].join("\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="Nuvoco_HR_Competency_Feedback.csv"');
  res.send(csv);
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});
app.listen(PORT,()=>console.log(`Nuvoco HR Competency Review running on port ${PORT}`));
