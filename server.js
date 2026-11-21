const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3200;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_GATEWAY_URL = (process.env.AI_GATEWAY_URL || "").replace(/\\/+$/, "");
const AI_GATEWAY_TOKEN = process.env.AI_GATEWAY_TOKEN || "";
const AI_GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "auto";
const DATA_FILE = path.join(__dirname, "data.json");

const agents = [
 {id:"jigarim",name:"Jigarim",role:"Bosh yordamchi (robot)",dept:"Boshqaruv",color:"#7aa2ff",keywords:["reja","yakun","fayl","boshqaruv"]},
 {id:"sardor",name:"Sardor",role:"Montajchi",dept:"Video studiya",color:"#ff8a5c",keywords:["montaj","render","mp4","ffmpeg"]},
 {id:"dilnoza",name:"Dilnoza",role:"Muqova dizayneri",dept:"Video studiya",color:"#ff6fa8",keywords:["muqova","cover","jpg","png","dizayn"]},
 {id:"elyor",name:"Elyor",role:"Sifat nazoratchisi",dept:"Video studiya",color:"#58d6a7",keywords:["tekshir","sifat","whisper","transkripsiya"]},
 {id:"ssenariychi",name:"Ssenariychi",role:"Ssenariy muallifi",dept:"Kontent va marketing",color:"#c58bff",keywords:["ssenariy","kurs","matn","md"]},
 {id:"laylo",name:"Laylo",role:"SMM menejer",dept:"Kontent va marketing",color:"#ffd166",keywords:["instagram","telegram","obunachi","marketing"]},
 {id:"otabek",name:"Otabek",role:"Tahlilchi",dept:"Kontent va marketing",color:"#4fd1e8",keywords:["insights","statistika","hisobot","tahlil"]},
 {id:"jamshid",name:"Jamshid",role:"Dasturchi",dept:"Texnik bo‘lim",color:"#9be15d",keywords:["js","html","py","node","npm","server","kod"]},
 {id:"umida",name:"Umida",role:"Xotira kotibi",dept:"Texnik bo‘lim",color:"#f59f7c",keywords:["memory","xotira","eslab qol"]},
];

function load(){ try{return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));}catch{return {events:[],tasks:[]};} }
function save(d){ fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2)); }
function json(res,code,obj){res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj));}
function body(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>100000)reject(new Error("So‘rov juda katta"));});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"));}catch{reject(new Error("JSON xato"));}});});}
function authorized(req){return ADMIN_PASSWORD && req.headers["x-admin-password"]===ADMIN_PASSWORD;}
function chooseAgent(text){const t=text.toLowerCase();return agents.find(a=>a.keywords.some(k=>t.includes(k)))||agents[0];}
async function askClaude(prompt){
 const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":CLAUDE_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:process.env.CLAUDE_MODEL||"claude-sonnet-4-5",max_tokens:1600,system:"Siz AGENTLAR OFISI tizimidagi yordamchisiz. O‘zbek tilida aniq va amaliy javob bering. Xavfli yoki bajarilmagan ishni bajarildi deb ko‘rsatmang.",messages:[{role:"user",content:prompt}]})});
 const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||"Claude API xatosi"); return (j.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
}
async function askGateway(prompt){\n const r=await fetch(AI_GATEWAY_URL.replace(/\\/+$/, "")+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+AI_GATEWAY_TOKEN},body:JSON.stringify({model:AI_GATEWAY_MODEL,messages:[{role:"system",content:"Siz AGENTLAR OFISI tizimidagi yordamchisiz. O‘zbek tilida aniq va amaliy javob bering."},{role:"user",content:prompt}]})});\n const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||"AI Gateway xatosi"); return j.choices?.[0]?.message?.content||"Javob olinmadi";\n}\nasync function askOpenAI(prompt){
 const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",messages:[{role:"system",content:"Siz AGENTLAR OFISI tizimidagi yordamchisiz. O‘zbek tilida aniq va amaliy javob bering."},{role:"user",content:prompt}]})});
 const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||"OpenAI API xatosi"); return j.choices?.[0]?.message?.content||"Javob olinmadi";
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(req.method==="GET" && url.pathname==="/"){return fs.createReadStream(path.join(__dirname,"public/index.html")).pipe(res);}
 if(req.method==="GET" && url.pathname==="/api/status"){
   if(!authorized(req)) return json(res,401,{error:"Parol noto‘g‘ri"});
   const d=load(); return json(res,200,{agents,events:d.events.slice(-40).reverse(),tasks:d.tasks.slice(-30).reverse(),providers:{claude:!!CLAUDE_API_KEY,openai:!!OPENAI_API_KEY,gateway:!!AI_GATEWAY_URL&&!!AI_GATEWAY_TOKEN}});
 }
 if(req.method==="POST" && url.pathname==="/api/command"){
   if(!authorized(req)) return json(res,401,{error:"Parol noto‘g‘ri"});
   try{
    const b=await body(req); const prompt=String(b.prompt||"").trim(); const provider=["openai","gateway"].includes(b.provider)?b.provider:"claude";
    if(!prompt) return json(res,400,{error:"Vazifa matnini kiriting"});
    const agent=agents.find(a=>a.id===b.agent)||chooseAgent(prompt);
    if(provider==="claude"&&!CLAUDE_API_KEY) return json(res,400,{error:"ANTHROPIC_API_KEY serverda sozlanmagan"});
    if(provider==="openai"&&!OPENAI_API_KEY) return json(res,400,{error:"OPENAI_API_KEY serverda sozlanmagan"});\n    if(provider==="gateway"&&(!AI_GATEWAY_URL||!AI_GATEWAY_TOKEN)) return json(res,400,{error:"AI_GATEWAY_URL yoki AI_GATEWAY_TOKEN serverda sozlanmagan"});
    const id=Date.now().toString(36); const d=load();
    const task={id,agent:agent.name,agentId:agent.id,provider,status:"working",prompt,createdAt:new Date().toISOString()};
    d.tasks.push(task); d.events.push({id,agent:agent.name,text:"Vazifani qabul qildi",at:task.createdAt}); save(d);
    try{
      const fullPrompt="Sizning lavozimingiz: "+agent.role+". Vazifa: "+prompt;\n      const result=provider==="claude"?await askClaude(fullPrompt):provider==="gateway"?await askGateway(fullPrompt):await askOpenAI(fullPrompt);
      task.status="done"; task.result=result; task.finishedAt=new Date().toISOString();
      d.events.push({id,agent:agent.name,text:"Vazifani yakunladi",at:task.finishedAt}); save(d);
      return json(res,200,{task});
    }catch(e){task.status="failed";task.error=e.message;save(d);return json(res,502,{error:e.message,task});}
   }catch(e){return json(res,400,{error:e.message});}
 }
 if(req.method==="GET" && url.pathname==="/health") return json(res,200,{ok:true});
 res.writeHead(404);res.end("Not found");
});
server.listen(PORT,"0.0.0.0",()=>console.log("AGENTLAR OFISI running on "+PORT));
