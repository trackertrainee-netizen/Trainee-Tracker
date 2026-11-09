// ---- Step-by-step task list (from the sheet) : [type, title, duration, monitored by]
const MODS=[
{n:"Module 1 · HR Onboarding",i:[
["PRE","Magnus Introduction","20 min","HR Team"],["PRE","Magnus Business Hierarchy","10 min","HR Team"],["PRE","Magnus Branch Hierarchy","10 min","HR Team"],
["TASK","Create complete business hierarchy and overview","40 min","HR Team"],["PRE","Student Life Cycle","40 min","HR Team"],
["TASK","Create a complete presentation of student life cycle","60 min","HR Team"],["TASK","Make a mock call to Magnus as a customer","30 min","HR Team"],
["PRE","Course structure presentation","50 min","HR Team"],["VIDEO","Marketing introduction","11 min","HR Team"],["TASK","Analyse marketing strategies of Magnus","30 min","HR Team"]]},
{n:"Module 2 · Marketing",i:[
["VIDEO","Target setting","2 hr 30 min","HR Team"],["TASK","Presentation on need and use of market segmentation and target setting","50 min","HR Team"],
["VIDEO","Customer acquisition","51 min","HR Team"],["TASK","Presentation on how to acquire customers as an EdTech","40 min","HR Team"],
["VIDEO","Branding","14 min","HR Team"],["TASK","Presentation on branding of Magnus","30 min","HR Team"],
["VIDEO","Orientation and meeting","1 hr 30 min","HR Team"],["TASK","Analyse current orientation meeting checklist and present","30 min","HR Team"]]},
{n:"Module 3 · Sales",i:[
["TASK","Orientation submission","1 hr 50 min","Senior Manager"],["VIDEO","Sales","1 hr 30 min","HR"],["VIDEO","Sales part 2","37 min","HR"],
["TASK","How a branch can achieve sales and monitor sales","40 min","Senior Manager"],["TASK","Final submission on marketing – what is Magnus and the marketing side of Magnus","60 min","Senior Manager"]]},
{n:"Module 4 · Branch & Productivity",i:[
["VIDEO","Business hierarchy","20 min","HR"],["VIDEO","Productivity – branch level","20 min","HR"],["VIDEO","Administration on KPI","37 min","HR"],["VIDEO","Profitability","30 min","HR"],
["TASK","Create branch level employee KPI and importance of productivity","50 min","HR"],["PRE","Loan and importance of skill loan","40 min","Loan Team"],["PRE","SCM and roles and responsibilities of SCM","60 min","SCM Head"]]},
{n:"Module 5 · SCM & Operations",i:[
["TASK","SCM – Billing sheet","120 min","SCM Head"],["TASK","SCM – Smart class","120 min","SCM Head"],["TASK","Final presentation on operations role","120 min","Asst. Operations"]]}];
const ST=[];MODS.forEach((m,mi)=>m.i.forEach(x=>ST.push({m:mi,t:x[0],n:x[1],d:x[2],by:x[3]})));
// DEPTS and BRANCHES now live in config.js
// ---- Duration helpers
const mins=d=>{const h=d.match(/(\d+)\s*hr/),n=d.match(/(\d+)\s*min/);return(h?+h[1]*60:0)+(n?+n[1]:0)};
const hm=m=>m>=60?Math.floor(m/60)+" hr"+(m%60?" "+m%60+" min":""):m+" min";
ST.forEach(x=>x.mn=mins(x.d));
// Calculate the overview and module rows from one shared set of table totals.
function timeStats(t){
 const logs=Array.isArray(t.logs)?t.logs:[];
 const stepFor=g=>Number.isInteger(g.s)?ST[g.s]:null;
 const elapsed=g=>{
  const end=Date.parse(g.c),start=Date.parse(g.st||g.a);
  return Number.isFinite(end)&&Number.isFinite(start)?Math.max(0,Math.round((end-start)/60000)):0;
 };
 const completed=logs.filter(g=>g.c&&stepFor(g));
 const verified=new Set(logs.filter(g=>g.vt&&stepFor(g)).map(g=>g.s));
 const modules=MODS.map((module,mi)=>{
  const steps=ST.map((step,i)=>({step,index:i})).filter(x=>x.step.m===mi);
  const moduleLogs=completed.filter(g=>stepFor(g).m===mi);
  return {
   name:module.n,
   plan:steps.reduce((sum,x)=>sum+x.step.mn,0),
   taken:moduleLogs.reduce((sum,g)=>sum+elapsed(g),0),
   verified:steps.filter(x=>verified.has(x.index)).length,
   steps:steps.length
  };
 });
 const types=["VIDEO","TASK","PRE"];
 const byType=Object.fromEntries(types.map(type=>{
  const steps=ST.filter(step=>step.t===type);
  return [type,{
   plan:steps.reduce((sum,step)=>sum+step.mn,0),
   count:steps.length,
   taken:completed.filter(g=>stepFor(g).t===type).reduce((sum,g)=>sum+elapsed(g),0)
  }];
 }));
 const total=modules.reduce((sum,module)=>sum+module.plan,0);
 const taken=modules.reduce((sum,module)=>sum+module.taken,0);
 const verifiedTime=logs.filter(g=>g.vt&&stepFor(g)).reduce((sum,g)=>sum+stepFor(g).mn,0);
 const completedPlan=completed.reduce((sum,g)=>sum+stepFor(g).mn,0);
 return {
  modules,byType,total,taken,verifiedTime,verifiedCount:verified.size,
  steps:ST.length,pace:completedPlan?Math.round(taken/completedPlan*100):null
 };
}
// ---- Module score + remark (stored per trainee in t.scores[moduleIndex] = {sc, rm})
const MAXSC=10; // maximum score per module - change here if you want a different scale
const modScore=(t,mi)=>{const v=t.scores&&t.scores[mi];return v&&v.sc!==""&&v.sc!=null?+v.sc:null};
const modRemark=(t,mi)=>(t.scores&&t.scores[mi]&&t.scores[mi].rm)||"";
const scoreSum=t=>MODS.reduce((s,_,mi)=>s+(modScore(t,mi)||0),0);
const scoredCount=t=>MODS.filter((_,mi)=>modScore(t,mi)!=null).length;
const scoreText=t=>scoreSum(t)+" / "+MODS.length*MAXSC;
const scoreSub=t=>scoredCount(t)+" of "+MODS.length+" modules scored";
// ---- Overview tiles and module table (per trainee)
function tiles(t){
 const stats=timeStats(t);
 const tile=(label,value,subtext,id)=>`<div class="tl"><span class="mu">${label}</span><b${id?` id="${id}"`:""}>${value}</b><span class="mu"${id?` id="${id}-sub"`:""}>${subtext}</span></div>`;
 return `<div class="card"><h2>Overview</h2><div class="tg">`
  +tile("Total task time (overall)",hm(stats.total),`${stats.steps} steps planned`)
  +tile("Total time taken (overall)",hm(stats.taken),"Completed steps only")
  +tile("Total verified",`${stats.verifiedCount} / ${stats.steps}`,"Steps verified")
  +tile("Total score",scoreText(t),scoreSub(t),"tot-sc")
  +`</div>`+modTable(stats,t)+`</div>`;
}
// ---- Module-wise: planned time vs time taken, verified count, score and remark
const modDone=(t,mi)=>ST.every((x,i)=>x.m!==mi||t.logs.some(g=>g.vt&&g.s===i));
function modTable(stats,t){
 const rows=stats.modules.map((module,mi)=>{
  const sc=modScore(t,mi),rm=modRemark(t,mi),ok=modDone(t,mi);
  const scoreCell=sc!=null?`<b>${sc} / ${MAXSC}</b>`:ok?`<button class="p sm" data-a="score" data-mi="${mi}">Add score</button>`:`<span class="lk">–</span>`;
  const remCell=sc!=null?`<div class="sp"><span>${rm?esc(rm):'<span class="lk">–</span>'}</span><button class="sm" data-a="score" data-mi="${mi}">Edit</button></div>`:`<span class="lk">–</span>`;
  return `<tr><td>${module.name}</td><td><b>${hm(module.plan)}</b></td><td><b>${hm(module.taken)}</b></td><td>${module.verified}/${module.steps}</td><td>${scoreCell}</td><td>${remCell}</td></tr>`}).join("");
 return `<h2 style="margin-top:22px">Module-wise summary</h2><div class="sc"><table><tr><th>Module</th><th>Total task time</th><th>Total time taken</th><th>Verified</th><th>Score (out of ${MAXSC})</th><th>Remark</th></tr>${rows}<tr><td><b>All modules</b></td><td><b>${hm(stats.total)}</b></td><td><b>${hm(stats.taken)}</b></td><td>${stats.verifiedCount}/${stats.steps}</td><td><b id="tot-sc-row">${scoreText(t)}</b></td><td></td></tr></table></div><div class="mu">Fixed time comes from the task sheet. Time taken counts only completed steps, from Start to Mark completed. Score and remark can be added once every step of a module is verified.</div>`;
}
// ---- Pop-up window asking for the module score and remark
function uploadModal(){
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div class="bd" data-a="uploadcancel"></div><div class="mb wide"><h2 id="upload-title">Upload video</h2><div class="mu">The server converts the video to HLS and uploads the playlist and segments.</div><form id="video-upload-form"><label class="fl">Video file<input id="video-file" name="video" type="file" accept="video/*" required></label><label class="fl">Parent folder<select id="video-parent-folder" name="parent_folder" required><option value="">Loading parent folders…</option></select></label><div id="parent-create-panel" hidden><label class="fl">New parent folder name<input id="new-parent-folder" type="text" placeholder="e.g. Marketing"></label><div class="row"><button type="button" data-a="parent-create-cancel">Cancel</button><button type="button" class="p" data-a="parent-create" id="parent-create-submit">Create parent folder</button></div></div><div id="parent-folder-status" class="mu" role="status" aria-live="polite"></div><label class="fl">Video folder inside parent<input id="video-folder" name="video_folder" type="text" placeholder="e.g. marketing-intro" required></label><div id="video-upload-status" class="mu upload-status" role="status" aria-live="polite"></div><div id="video-upload-progress" class="upload-progress" role="progressbar" aria-label="Video upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Upload starting" hidden><span class="upload-progress__bar"></span></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="uploadcancel">Cancel</button><button class="p" type="submit" id="video-upload-submit">Convert and upload</button></div></form></div></div>`;
}
function videoModal(){
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="video-title"><div class="bd" data-a="videocancel"></div><div class="mb wide"><h2 id="video-title">Watch video</h2><label class="fl">Video folder<select id="video-library-folder"><option value="">Loading folders…</option></select></label><div id="video-player-status" class="mu video-player-status" role="status" aria-live="polite"></div><video id="video-player" class="video-player" controls playsinline preload="metadata" hidden></video><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="videocancel">Close</button></div></div></div>`;
}
function modal(t){
 if(S.upload)return uploadModal();
 if(S.video)return videoModal();
 if(S.add)return addModal();
 if(!t)return"";
 if(S.edit)return `<div class="ov" role="dialog" aria-modal="true"><div class="bd" data-a="mcancel"></div><div class="mb"><h2 style="margin-top:2px">Edit trainee name</h2><label class="fl">Trainee name<input id="en-nm" type="text" value="${esc(t.name)}" placeholder="Full name"></label><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="mcancel">Cancel</button><button class="p" data-a="esave">Save</button></div></div></div>`;
 if(S.modal==null)return"";
 const mi=S.modal,sc=modScore(t,mi);
 return `<div class="ov" role="dialog" aria-modal="true"><div class="bd" data-a="mcancel"></div><div class="mb"><div class="mu">${esc(t.name)}</div><h2 style="margin-top:2px">${MODS[mi].n} completed 🎉</h2><div class="mu" style="margin-bottom:14px">Add the score and remark for this module.</div><label class="fl">Score (out of ${MAXSC})<input id="ms-sc" type="number" min="0" max="${MAXSC}" step="0.5" inputmode="decimal" value="${sc==null?"":sc}"></label><label class="fl">Remark<textarea id="ms-rm" rows="3" placeholder="Feedback on this module">${esc(modRemark(t,mi))}</textarea></label><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="mcancel">Later</button><button class="p" data-a="msave">Save</button></div></div></div>`;
}
function summ(t){
 const T=["VIDEO","TASK","PRE"];
 const cell=f=>{const a=ST.filter(f);return a.length?a.length+" · "+hm(a.reduce((s,x)=>s+x.mn,0)):"–"};
 let r=MODS.map((m,mi)=>`<tr><td>${m.n}</td>${T.map(k=>`<td>${cell(x=>x.m===mi&&x.t===k)}</td>`).join("")}<td><b>${cell(x=>x.m===mi)}</b></td></tr>`).join("");
 r+=`<tr><td><b>All modules</b></td>${T.map(k=>`<td><b>${cell(x=>x.t===k)}</b></td>`).join("")}<td><b>${cell(()=>true)}</b></td></tr>`;
 const ac=k=>t.logs.filter(g=>g.c&&ST[g.s].t===k).reduce((s,g)=>s+Math.round((new Date(g.c)-new Date(g.st||g.a))/60000),0);
 r+=`<tr><td>Actual time taken so far</td>${T.map(k=>`<td>${hm(ac(k))}</td>`).join("")}<td>${hm(ac("VIDEO")+ac("TASK")+ac("PRE"))}</td></tr>`;
 return `<div class="card"><h2>Duration summary</h2><div class="sc"><table><tr><th>Module</th><th>Videos</th><th>Tasks</th><th>Pre</th><th>Total</th></tr>${r}</table></div><div class="mu">Cells show number of steps · total planned duration. The last row is the trainee's actual time.</div></div>`;
}
// ---- Duration helpers
const pm=d=>{const h=/(\d+)\s*hr/.exec(d),m=/(\d+)\s*min/.exec(d);return (h?+h[1]*60:0)+(m?+m[1]:0)};
ST.forEach(x=>x.min=pm(x.d));
const VID=ST.filter(x=>x.t==="VIDEO"),VT=VID.reduce((a,x)=>a+x.min,0),AT=ST.reduce((a,x)=>a+x.min,0);
const mv=mi=>ST.filter(x=>x.m===mi&&x.t==="VIDEO").reduce((a,x)=>a+x.min,0);

// ---- State
let S={t:[],sel:null,upload:false,video:false,hls:null};
// Data is stored on the Python server (data.json) through /api/trainees
const load=()=>fetch("/api/trainees").then(r=>r.json()).then(d=>{S.t=d}).catch(()=>alert("Cannot reach the server. Is app.py running?"));
const save=()=>fetch("/api/trainees",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(S.t)}).catch(()=>alert("Could not save. Is app.py running?"));
const now=()=>new Date().toISOString();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=i=>i?new Date(i).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):"–";
const took=(a,b)=>{if(!a||!b)return"–";const m=Math.round((new Date(b)-new Date(a))/60000);return m>=60?Math.floor(m/60)+" h "+m%60+" m":m+" m"};
const done=t=>t.logs.filter(l=>l.vt).length;
const cur=t=>{const l=t.logs[t.logs.length-1];return l.vt?null:l};
const waiting=t=>{const g=t.logs[t.logs.length-1];return g.vt&&g.s+1<ST.length?g.s+1:null};
const seg=t=>'<div class="seg">'+MODS.map((m,mi)=>{const a=ST.filter(x=>x.m===mi),n=a.filter(x=>t.logs.some(g=>g.vt&&g.s===ST.indexOf(x))).length;return `<i title="${m.n}"><b style="width:${n/a.length*100}%"></b></i>`}).join("")+'</div>';
const inr=v=>v?"₹"+Number(v).toLocaleString("en-IN"):"–";
const jd=v=>v?new Date(v+"T00:00").toLocaleDateString([],{dateStyle:"medium"}):"–";
const info=t=>[["Branch",esc(t.branch||"–")],["Department",esc(t.dept)],["Designation",esc(t.desg||"–")],["Joining date",jd(t.join)],["Salary / month",inr(t.sal)],["Wage / day",inr(t.wage)]];
const vmod=t=>{const sm=Math.max(...t.logs.map(q=>ST[q.s].m));return[S.vm==null?sm:Math.max(0,Math.min(S.vm,sm)),sm]};
const mshort=i=>MODS[ST[i].m].n.split(" · ")[0];
const status=t=>{const l=cur(t);return !l?(waiting(t)!=null?["Ready to start "+mshort(waiting(t)),"s-rdy"]:["Completed","ok s-done"]):l.c?["Awaiting verification","s-ver"]:l.st?["In progress","s-prog"]:["Assigned – not started","s-asg"]};

// ---- Render
function render(){
 const t=S.sel&&S.t.find(x=>x.id===S.sel);
 const ap=document.getElementById("app");
 ap.innerHTML=`<div class="shell">${side(t)}<main class="mn">${t?detail(t):list()}</main></div>`+modal(t);
 const vk=(S.sel||"list")+":"+S.vm;
 if(vk!==S.lv){S.lv=vk;ap.classList.remove("an");void ap.offsetWidth;ap.classList.add("an")}
 if(S.add){const i=document.getElementById("nm");if(i)i.focus()}
 else if(t&&(S.modal!=null||S.edit)){const i=document.getElementById(S.edit?"en-nm":"ms-sc");if(i){i.focus();if(S.edit)i.select()}}
}
// ---- Left sidebar (dashboard layout)
function side(t){
 const brand=`<div class="bk"><div class="lg">M</div><div><div class="brand">Magnus</div><div class="mu">Trainee Tracker</div></div></div>`;
 const foot=`<div class="sf"><span class="mu">Theme</span>${tbtn()}</div>`;
 if(!t)return `<aside class="sb">${brand}
  <label class="fl sq"><span>Search</span><input id="q" type="search" value="${esc(S.q||"")}" placeholder="Name, department, designation…" autocomplete="off"></label>
  <button class="p" data-a="addopen">＋ Add trainee</button><button data-a="uploadopen">↑ Upload video</button><button data-a="videoopen">▶ Watch video</button><button data-a="csv">Export CSV</button>
  <div class="sg"></div>
  <div class="sd"><span class="mu">Training duration</span><b>${hm(AT)}</b><span class="mu">${ST.length} steps · ${hm(VT)} of video (${VID.length} videos)</span></div>${foot}</aside>`;
 return `<aside class="sb">${brand}
  <button data-a="back">← All trainees</button><button data-a="uploadopen">↑ Upload video</button><button data-a="videoopen">▶ Watch video</button><button data-a="ename">✎ Edit name</button><button class="dgr" data-a="del" data-id="${t.id}">Remove trainee</button>
  <div class="sg"></div>
  <div class="sd"><span class="mu">Viewing</span><b>${esc(t.name)}</b></div>${foot}</aside>`;
}
// ---- Trainee cards, filtered by the search box (name, department, designation, branch)
function tcards(){
 const q=(S.q||"").trim().toLowerCase();
 const L=S.t.filter(t=>[t.name,t.dept,t.desg,t.branch].some(v=>String(v||"").toLowerCase().includes(q)));
 return L.length?'<div class="gl">'+L.map(t=>{const[s,c]=status(t),l=cur(t),n=done(t);return `<div class="card item" data-a="open" data-id="${t.id}">
 <div class="sp"><b>${esc(t.name)}</b><span class="chip ${c}">${s}</span></div>
 <div class="mu">${[t.branch,t.dept,t.desg].filter(Boolean).map(esc).join(" · ")}${t.join?" · Joined "+jd(t.join):""}</div>
 ${seg(t)}
 <div class="mu">${n}/${ST.length} verified${l?` · Now: Step ${l.s+1} – ${esc(ST[l.s].n)}`:""}</div></div>`}).join("")+'</div>':'<div class="mu">'+(S.t.length?"No trainees match your search.":"No trainees yet. Use “Add trainee” in the sidebar.")+'</div>';
}
function list(){
 const n=S.t.length,aw=S.t.filter(t=>{const l=cur(t);return l&&l.c}).length,dn=S.t.filter(t=>status(t)[0]==="Completed").length,ip=n-aw-dn;
 const st=(l,v,sub)=>`<div class="tl"><span class="mu">${l}</span><b>${v}</b><span class="mu">${sub}</span></div>`;
 return `<div class="ph"><h1>Trainees</h1><div class="mu">Follow every trainee through ${MODS.length} modules and ${ST.length} tasks, one verified step at a time.</div></div>
 <div class="tg">${st("Total trainees",n,"enrolled")}${st("In progress",ip,"working through steps")}${st("Awaiting verification",aw,"needs a verifier")}${st("Completed",dn,"all steps verified")}</div>
 <div id="tl">${tcards()}</div>`;
}
// ---- Add trainee pop-up form
function addModal(){
 return `<div class="ov" role="dialog" aria-modal="true"><div class="bd" data-a="mcancel"></div><div class="mb wide"><h2 style="margin-top:2px">Add trainee</h2><div class="fg"><label>Trainee name<input id="nm" placeholder="Full name"></label><label>Joining date<input id="jd" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>Branch<select id="br"><option value="">Select branch</option>${BRANCHES.map(b=>`<option>${b}</option>`).join("")}</select></label><label>Department<select id="dp">${DEPTS.map(d=>`<option>${esc(d)}</option>`).join("")}</select></label><label>Designation<input id="ds" placeholder="e.g. Trainee Counsellor"></label><label>Salary (₹ per month)<input id="sl" type="number" min="0" inputmode="numeric" placeholder="0"></label><label>Wage (₹ per day)<input id="wg" type="number" min="0" inputmode="numeric" placeholder="0"></label></div><div class="mu" style="margin-top:12px">Step 1 is assigned right now. Each next step unlocks only after the previous one is completed and verified.</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="mcancel">Cancel</button><button class="p" data-a="add">Add trainee &amp; assign Step 1</button></div></div></div>`;
}
function detail(t){
 const l=cur(t),[s,c]=status(t);let rows="",lm=-1;const[vm,sm]=vmod(t);
 ST.forEach((x,i)=>{
  if(x.m!==vm)return;
  if(x.m!==lm){lm=x.m;const f0=t.logs.find(q=>ST[q.s].m===lm);rows+=`<tr class="mod"><td colspan="10">${MODS[lm].n} <span class="mu">· ${f0?"Started "+fmt(f0.a):"Not started"}</span> <span class="mu">· Video total: ${hm(mv(lm))}</span></td></tr>`}
  const g=t.logs.find(q=>q.s===i);
  const st=g?(g.vt?'<span class="ok">Verified</span>':g.c?'<span class="wa">Awaiting verify</span>':g.st?'<span class="wa">In progress</span>':'<span class="wa">Assigned</span>'):"Locked";
  rows+=`<tr class="${g?"":"lkd"}"><td>${i+1}</td><td>${x.t}</td><td>${esc(x.n)}</td><td>${x.d}</td><td>${x.by}</td><td>${g?fmt(g.st):"–"}</td><td>${g?fmt(g.c):"–"}</td><td>${g&&g.vt?esc(g.v):"–"}</td><td>${g?took(g.st||g.a,g.c):"–"}</td><td>${st}</td></tr>`});
 const vn=ST.filter(x=>x.m===vm),vd=vn.filter(x=>t.logs.some(g=>g.vt&&ST[g.s]===x)).length,w=waiting(t),can=w!=null&&ST[w].m===vm+1;
const nav=`<div class="navbar"><button class="gh" data-a="prev" ${vm<=0?"disabled":""}>‹ Previous</button><div class="nv"><b>${MODS[vm].n}</b><span class="mu">${vd}/${vn.length} verified · ${hm(vn.reduce((z,x)=>z+x.mn,0))} planned</span></div><button class="${can?"p":"gh"}" data-a="next" ${vm<sm||can?"":"disabled"}>${can?"Start "+mshort(w)+" ›":"Next ›"}</button></div>${vm===sm&&vm+1<MODS.length&&!can?`<div class="mu" style="margin-top:8px;text-align:right">The next module unlocks once this one is fully verified.</div>`:""}`;
 let act="";
 if(l){const x=ST[l.s];act=`<div class="card cur"><div class="mu">Current · Step ${l.s+1} of ${ST.length} · ${MODS[x.m].n}</div>
 <h2 style="margin-top:4px"><span class="chip">${x.t}</span> ${esc(x.n)}</h2>
 <div class="mu">Duration ${x.d} · Monitored by ${x.by}</div><div style="margin-top:10px">
 ${l.c?`<div class="mu" style="margin-bottom:8px">Completed ${fmt(l.c)}. ${l.s+1<ST.length&&ST[l.s+1].m!==x.m?"This is the last step of the module; the next module starts only when you press Start.":"Verification will assign the next step."}</div>
 <div class="row"><input id="vb" placeholder="Verified by (${esc(x.by)} – name)"><button class="p" data-a="ver">Verify &amp; assign next</button></div>`
 :l.st?`<div class="mu" style="margin-bottom:8px">Assigned ${fmt(l.st)}</div><button class="p" data-a="cmp">Mark completed now</button>`:`<div class="mu" style="margin-bottom:8px">Assigned but not started. Time is counted only from when you press Start.</div><button class="p" data-a="go">▶ Start task</button>`}</div></div>`}
 else if(waiting(t)!=null){const w=waiting(t),y=ST[w];act=`<div class="card cur"><div class="mu">${MODS[ST[w-1].m].n} finished and verified</div><h2 style="margin-top:4px">Next: ${MODS[y.m].n}</h2><div class="mu" style="margin-bottom:10px">First step: ${esc(y.n)} (${y.d}). Time is counted only from when you press Start.</div><button class="p" data-a="start">▶ Start ${mshort(w)}</button></div>`}
 else act=`<div class="card cur ok"><b>All ${ST.length} steps completed and verified 🎉</b></div>`;
 return `<div class="card"><div class="sp"><h1>${esc(t.name)}</h1><span class="chip ${c}">${s}</span></div>
 <div class="dg">${info(t).map(x=>`<div><span class="mu">${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div>${seg(t)}<div class="mu">${done(t)}/${ST.length} verified · Videos done: ${hm(t.logs.filter(l=>l.vt&&ST[l.s].t==="VIDEO").reduce((a,l)=>a+ST[l.s].min,0))} of ${hm(VT)}</div></div>
 ${act}${tiles(t)}<div class="card"><h2>Workflow log</h2><div class="sc"><table><tr><th>#</th><th>Type</th><th>Task</th><th>Planned</th><th>Monitor</th><th>Assigned</th><th>Completed</th><th>Verified by</th><th>Time taken</th><th>Status</th></tr>${rows}</table></div>${nav}</div>`;
}

// ---- Actions
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a,t=S.t.find(x=>x.id===S.sel);
 if(a==="add"){const n=document.getElementById("nm").value.trim();if(!n)return document.getElementById("nm").focus();
  const d=now();const g=i=>document.getElementById(i).value.trim();S.t.push({id:Date.now(),name:n,dept:g("dp"),branch:g("br"),desg:g("ds"),join:g("jd"),sal:g("sl"),wage:g("wg"),start:d,logs:[{s:0,a:d}]});S.add=false}
 else if(a==="open"){S.sel=+b.dataset.id;S.vm=null;S.modal=null;S.edit=false}
 else if(a==="back"){S.sel=null;S.modal=null;S.edit=false}
 else if(a==="del"){if(!confirm("Remove this trainee and all their records?"))return;S.t=S.t.filter(x=>x.id!==+b.dataset.id);S.sel=null}
 else if(a==="cmp"){cur(t).c=now()}
 else if(a==="ver"){const v=document.getElementById("vb").value.trim();if(!v)return document.getElementById("vb").focus();
  const l=cur(t),d=now();l.v=v;l.vt=d;if(l.s+1<ST.length&&ST[l.s+1].m===ST[l.s].m)t.logs.push({s:l.s+1,a:d});else if(modDone(t,ST[l.s].m)&&modScore(t,ST[l.s].m)==null)S.modal=ST[l.s].m}
 else if(a==="start"){if(waiting(t)!=null){const d=now();t.logs.push({s:waiting(t),a:d,st:d});S.vm=null}}
 else if(a==="go"){const l=cur(t);if(l&&!l.st)l.st=now()}
 else if(a==="prev"){S.vm=vmod(t)[0]-1}
 else if(a==="next"){const[v,m]=vmod(t);if(v<m)S.vm=v+1;else if(waiting(t)!=null&&ST[waiting(t)].m===v+1){const d=now();t.logs.push({s:waiting(t),a:d,st:d});S.vm=null}}
 else if(a==="score"){S.modal=+b.dataset.mi}
 else if(a==="addopen"){S.add=true}
 else if(a==="uploadopen"){S.add=false;S.edit=false;S.modal=null;S.upload=true}
 else if(a==="uploadcancel"){S.upload=false}
 else if(a==="parent-create-cancel"){document.getElementById("parent-create-panel").hidden=true;document.getElementById("parent-folder-status").textContent="";return}
 else if(a==="parent-create"){createParentFolder();return}
 else if(a==="videoopen"){S.add=false;S.edit=false;S.modal=null;S.upload=false;S.video=true}
 else if(a==="videocancel"){stopVideoPlayer();S.video=false}
 else if(a==="mcancel"){S.modal=null;S.edit=false;S.add=false}
 else if(a==="ename"){S.edit=true}
 else if(a==="esave"){const el=document.getElementById("en-nm"),n=el.value.trim();if(!n)return el.focus();t.name=n;S.edit=false}
 else if(a==="msave"){const el=document.getElementById("ms-sc"),n=+el.value;if(el.value.trim()===""||!Number.isFinite(n))return el.focus();
  t.scores=t.scores||{};t.scores[S.modal]={sc:Math.max(0,Math.min(MAXSC,n)),rm:document.getElementById("ms-rm").value.trim()};S.modal=null}
 else if(a==="theme")return toggleTheme();
 else if(a==="csv")return csv();
 save();render();
 if(a==="uploadopen")loadParentFolders();
 if(a==="videoopen")loadVideoFolders();
});

async function loadParentFolders(selectedFolder=""){
 const select=document.getElementById("video-parent-folder"),status=document.getElementById("parent-folder-status");
 status.textContent="Loading parent folders…";
 try{
  const response=await fetch("/api/video-folders");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not load parent folders.");
  if(!Array.isArray(result.folders))throw new Error("The server returned an invalid parent folder list.");
  select.replaceChildren(new Option("Select an existing parent folder",""));
  result.folders.forEach(folder=>select.add(new Option(folder,folder)));
  const addFolder=new Option("＋ Add parent folder…","__add_parent_folder__");
  addFolder.dataset.action="create-parent";
  select.add(addFolder);
  if(selectedFolder)select.value=selectedFolder;
  select.dataset.selectedFolder=select.value;
  status.textContent=result.folders.length?"Select a parent folder, or add one.":"No parent folders yet. Add one to continue.";
 }catch(error){
  select.replaceChildren(new Option("Unable to load parent folders",""));
  select.dataset.selectedFolder="";
  status.textContent=error instanceof Error?error.message:String(error);
 }
}

async function createParentFolder(){
 const input=document.getElementById("new-parent-folder"),status=document.getElementById("parent-folder-status"),submit=document.getElementById("parent-create-submit");
 const folder=input.value.trim();
 if(!folder){input.focus();return}
 submit.disabled=true;
 status.textContent="Creating parent folder…";
 try{
  const response=await fetch("/api/video-folders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not create parent folder.");
  input.value="";
  document.getElementById("parent-create-panel").hidden=true;
  await loadParentFolders(result.folder);
  status.textContent=`Parent folder "${result.folder}" created.`;
 }catch(error){
  status.textContent=error instanceof Error?error.message:String(error);
 }finally{
  if(submit.isConnected)submit.disabled=false;
 }
}

async function loadVideoFolders(){
 const select=document.getElementById("video-library-folder"),status=document.getElementById("video-player-status");
 try{
  const response=await fetch("/api/videos");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not load video folders.");
  if(!Array.isArray(result.folders))throw new Error("The server returned an invalid video folder list.");
  select.replaceChildren(new Option("Select a folder",""));
  result.folders.forEach(folder=>select.add(new Option(folder,folder)));
  if(result.folders.length)status.textContent="Choose a folder to play its video.";
  else{select.replaceChildren(new Option("No videos available",""));status.textContent="Upload a video first."}
 }catch(error){
  select.replaceChildren(new Option("Unable to load folders",""));
  status.textContent=error instanceof Error?error.message:String(error);
 }
}

function stopVideoPlayer(){
 if(S.hls){S.hls.destroy();S.hls=null}
 const player=document.getElementById("video-player");
 if(player){player.onerror=null;player.pause();player.removeAttribute("src");player.load()}
}

function playVideo(folder){
 const player=document.getElementById("video-player"),status=document.getElementById("video-player-status");
 stopVideoPlayer();
 if(!folder){player.hidden=true;status.textContent="Choose a folder to play its video.";return}
 const playlist="/api/videos/"+folder.split("/").map(encodeURIComponent).join("/")+"/index.m3u8";
 player.hidden=false;
 player.onerror=()=>{status.textContent="Could not load this video. Check the playlist and storage."};
 status.textContent="Loading playlist…";
 if(player.canPlayType("application/vnd.apple.mpegurl")){
  player.src=playlist;
  return;
 }
 if(!window.Hls||!window.Hls.isSupported()){
  player.hidden=true;
  status.textContent="HLS playback is not supported in this browser.";
  return;
 }
 const hls=new window.Hls();
 S.hls=hls;
 hls.on(window.Hls.Events.MANIFEST_PARSED,()=>{status.textContent="Ready to play."});
 hls.on(window.Hls.Events.ERROR,(_,data)=>{
  if(data.fatal){
   status.textContent="Could not load this video. Check the playlist and storage.";
   hls.destroy();
   if(S.hls===hls)S.hls=null;
  }
 });
 hls.loadSource(playlist);
 hls.attachMedia(player);
}

async function uploadVideo(){
 const form=document.getElementById("video-upload-form"),status=document.getElementById("video-upload-status"),progress=document.getElementById("video-upload-progress"),submit=document.getElementById("video-upload-submit");
 if(!form.reportValidity())return;
 const bar=progress.querySelector(".upload-progress__bar");
 submit.disabled=true;
 progress.hidden=false;
 progress.setAttribute("aria-valuenow","0");
 progress.setAttribute("aria-valuetext","Upload starting");
 progress.classList.remove("upload-progress--indeterminate");
 bar.style.width="0%";
 status.classList.remove("upload-status--success");
 status.textContent="Uploading video…";
 try{
  const result=await new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();
   xhr.open("POST","/api/videos");
   xhr.upload.addEventListener("progress",event=>{
    if(!event.lengthComputable||!event.total){
     progress.classList.add("upload-progress--indeterminate");
     progress.removeAttribute("aria-valuenow");
     progress.setAttribute("aria-valuetext","Uploading");
     return;
    }
    const percent=Math.floor(event.loaded/event.total*100);
    progress.classList.remove("upload-progress--indeterminate");
    progress.setAttribute("aria-valuenow",String(percent));
    progress.setAttribute("aria-valuetext",`Uploading ${percent}%`);
    bar.style.width=`${percent}%`;
    status.textContent=`Uploading video… ${percent}%`;
   });
   xhr.upload.addEventListener("load",()=>{
    progress.classList.remove("upload-progress--indeterminate");
    progress.setAttribute("aria-valuenow","100");
    progress.setAttribute("aria-valuetext","Upload complete; processing video");
    bar.style.width="100%";
    status.textContent="Upload received. Converting and uploading to storage…";
   });
   xhr.addEventListener("load",()=>{
    let result={};
    try{result=JSON.parse(xhr.responseText||"{}")}catch{reject(new Error("Server returned an invalid upload response."));return}
    if(xhr.status<200||xhr.status>=300)reject(new Error(result&&result.error||"Video upload failed."));
    else resolve(result);
   });
   xhr.addEventListener("error",()=>reject(new Error("Network error during video upload.")));
   xhr.addEventListener("abort",()=>reject(new Error("Video upload was interrupted.")));
   xhr.send(new FormData(form));
  });
  status.classList.add("upload-status--success");
  status.replaceChildren();
  const icon=document.createElement("span");
  icon.className="upload-complete-icon";
  icon.setAttribute("aria-hidden","true");
  icon.textContent="✓";
  const message=document.createElement("span");
  message.textContent=`Upload complete. Playlist: ${result.playlist}`;
  status.append(icon,message);
 }catch(error){
  status.classList.remove("upload-status--success");
  status.textContent=`Upload failed: ${error instanceof Error?error.message:String(error)}`;
 }finally{
  progress.hidden=true;
  if(submit.isConnected)submit.disabled=false;
 }
}
document.addEventListener("submit",e=>{
 if(e.target.id!=="video-upload-form")return;
 e.preventDefault();
 uploadVideo();
});
document.addEventListener("change",e=>{
 if(e.target.id==="video-parent-folder"){
  const select=e.target,option=select.selectedOptions[0];
  if(option&&option.dataset.action==="create-parent"){
   select.value=select.dataset.selectedFolder||"";
   document.getElementById("parent-create-panel").hidden=false;
   document.getElementById("new-parent-folder").focus();
  }else select.dataset.selectedFolder=select.value;
 }else if(e.target.id==="video-library-folder")playVideo(e.target.value);
});

function csv(){
 const r=[["Trainee","Branch","Department","Designation","Joining date","Salary","Wage","Step","Module","Type","Task","Monitored by","Assigned","Completed","Verified by","Verified at"]];
 S.t.forEach(t=>t.logs.forEach(g=>{const x=ST[g.s];r.push([t.name,t.branch||"",t.dept,t.desg||"",t.join||"",t.sal||"",t.wage||"",g.s+1,MODS[x.m].n,x.t,x.n,x.by,g.st||"",g.c||"",g.v||"",g.vt||""])}));
 const s=r.map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
 const u=URL.createObjectURL(new Blob([s],{type:"text/csv"})),a=document.createElement("a");a.href=u;a.download="trainee-log.csv";a.click();
}
document.addEventListener("keydown",e=>{
 if(e.key==="Escape"&&(S.modal!=null||S.edit||S.add||S.upload||S.video)){if(S.video)stopVideoPlayer();S.modal=null;S.edit=false;S.add=false;S.upload=false;S.video=false;render()}
 else if(e.key==="Enter"&&S.add&&e.target.tagName==="INPUT"){const b=document.querySelector('[data-a="add"]');if(b)b.click()}
 else if(e.key==="Enter"&&e.target.id==="en-nm"){const b=document.querySelector('[data-a="esave"]');if(b)b.click()}
});
document.addEventListener("input",e=>{if(e.target.id==="q"){S.q=e.target.value;const l=document.getElementById("tl");if(l)l.innerHTML=tcards()}});
load().then(render);

// ---- Light / dark theme toggle (button sits in the page header; choice is remembered in this browser)
const curTheme=()=>document.documentElement.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function tbtn(){const d=curTheme()==="dark",l=d?"Switch to light theme":"Switch to dark theme";return `<button class="tt" type="button" data-a="theme" title="${l}" aria-label="${l}">${d?SUN:MOON}</button>`}
function toggleTheme(){const n=curTheme()==="dark"?"light":"dark";const h=document.documentElement;h.classList.add("tx");setTimeout(()=>h.classList.remove("tx"),500);
 h.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}render();
 document.querySelectorAll(".tt svg").forEach(v=>v.classList.add("spin"))}