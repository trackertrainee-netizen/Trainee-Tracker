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
  const scoreCell=sc!=null?`<b>${sc} / ${MAXSC}</b>`:ok&&allow("score")?`<button class="p sm" data-a="score" data-mi="${mi}">Add score</button>`:`<span class="lk">–</span>`;
  const remCell=sc!=null?`<div class="sp"><span>${rm?esc(rm):'<span class="lk">–</span>'}</span>${allow("score")?`<button class="sm" data-a="score" data-mi="${mi}">Edit</button>`:""}</div>`:`<span class="lk">–</span>`;
  return `<tr><td>${module.name}</td><td><b>${hm(module.plan)}</b></td><td><b>${hm(module.taken)}</b></td><td>${module.verified}/${module.steps}</td><td>${scoreCell}</td><td>${remCell}</td></tr>`}).join("");
 return `<h2 style="margin-top:22px">Module-wise summary</h2><div class="sc"><table><tr><th>Module</th><th>Total task time</th><th>Total time taken</th><th>Verified</th><th>Score (out of ${MAXSC})</th><th>Remark</th></tr>${rows}<tr><td><b>All modules</b></td><td><b>${hm(stats.total)}</b></td><td><b>${hm(stats.taken)}</b></td><td>${stats.verifiedCount}/${stats.steps}</td><td><b id="tot-sc-row">${scoreText(t)}</b></td><td></td></tr></table></div><div class="mu">Fixed time comes from the task sheet. Time taken counts only completed steps, from Start to Mark completed. Score and remark can be added once every step of a module is verified.</div>`;
}
// ---- Pop-up window asking for the module score and remark
function uploadModal(){
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div class="bd" data-a="uploadcancel"></div><div class="mb wide"><h2 id="upload-title">Upload video</h2><div class="mu">The server converts the video to HLS and uploads the playlist and segments.</div><form id="video-upload-form"><label class="fl">Video file<input id="video-file" name="video" type="file" accept="video/*" required></label><label class="fl">Parent folder<select id="video-parent-folder" name="parent_folder" required><option value="">Loading parent folders…</option></select></label><div id="parent-create-panel" hidden><label class="fl">New parent folder name<input id="new-parent-folder" type="text" placeholder="e.g. Marketing"></label><div class="row"><button type="button" data-a="parent-create-cancel">Cancel</button><button type="button" class="p" data-a="parent-create" id="parent-create-submit">Create parent folder</button></div></div><div id="parent-folder-status" class="mu" role="status" aria-live="polite"></div><label class="fl">Video folder inside parent<input id="video-folder" name="video_folder" type="text" placeholder="e.g. marketing-intro" required></label><div id="video-upload-status" class="mu upload-status" role="status" aria-live="polite"></div><div id="video-upload-progress" class="upload-progress" role="progressbar" aria-label="Video upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span class="upload-progress__bar"></span></div><div id="video-upload-meta" class="upload-meta" hidden><span id="video-upload-phase"></span><strong id="video-upload-pct">0%</strong></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="uploadcancel">Cancel</button><button class="p" type="submit" id="video-upload-submit">Convert and upload</button></div></form></div></div>`;
}
function videoModal(){
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="video-title"><div class="bd" data-a="videocancel"></div><div class="mb wide"><h2 id="video-title">Watch video</h2><label class="fl">Video folder<select id="video-library-folder"><option value="">Loading folders…</option></select></label><div id="video-player-status" class="mu video-player-status" role="status" aria-live="polite"></div><video id="video-player" class="video-player" controls playsinline preload="metadata" hidden></video><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="videocancel">Close</button></div></div></div>`;
}
function mapModal(){
 const vs=mvideos(S.mm);
 if(S.mt==null||!vs.some(o=>o.i===S.mt))S.mt=vs.length?vs[0].i:null;
 if(S.mt!=null&&!S.mfTouched)S.mf=vfolder(S.mb,S.mt);
 const mapped=S.vmap[S.mb]||{};
 const rows=Object.entries(mapped).map(([k,f])=>{const i=ST.findIndex((_,j)=>mkey(j)===k);return{k,f,i}}).sort((a,b)=>(a.i<0?9999:a.i)-(b.i<0?9999:b.i)).map(r=>{
  const x=r.i>=0?ST[r.i]:null,title=x?x.n:r.k.split("|").slice(1).join("|"),mod=x?MODS[x.m].n.split(" · ")[0]:"–";
  return `<tr><td>${r.i>=0?r.i+1:"–"}</td><td>${esc(mod)}</td><td>${esc(title)}</td><td>${esc(r.f)}</td><td><div class="map-act"><button type="button" class="sm" data-a="mapplay" data-f="${esc(r.f)}">▶ Play</button><button type="button" class="sm dgr" data-a="mapremove" data-k="${esc(r.k)}">Remove</button></div></td></tr>`}).join("");
 const folders=S.mf&&!S.folders.includes(S.mf)?[S.mf,...S.folders]:S.folders;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="map-title"><div class="bd" data-a="mapcancel"></div><div class="mb wide"><h2 id="map-title">Map videos to tasks</h2><div class="mu" style="margin:10px 0 14px">Pick the business, module and task, then choose the video folder that should play there.</div>
 <div class="fl"><span>Business</span><div class="pills">${BIZ.map(b=>`<button type="button" class="pill${b===S.mb?" on":""}" data-a="mapbiz" data-b="${esc(b)}">${esc(b)}</button>`).join("")}</div></div>
 <label class="fl">Module<select id="map-module">${MODS.map((m,i)=>`<option value="${i}"${i===S.mm?" selected":""}>${esc(m.n)}</option>`).join("")}</select></label>
 <label class="fl">Task<select id="map-task"${vs.length?"":" disabled"}>${vs.length?vs.map(o=>`<option value="${o.i}"${o.i===S.mt?" selected":""}>${o.i+1}. [VIDEO] ${esc(o.x.n)}${vfolder(S.mb,o.i)?" ✓ mapped":""}</option>`).join(""):'<option>No video tasks in this module</option>'}</select></label>
 <label class="fl">Video (playing location)<select id="map-folder"><option value="">${S.mfstat?esc(S.mfstat):"Select a video folder"}</option>${folders.map(f=>`<option value="${esc(f)}"${f===S.mf?" selected":""}>${esc(f)}</option>`).join("")}</select></label>
 <div id="map-msg" class="mu" role="status" aria-live="polite" style="min-height:1.4em;margin-top:8px">${esc(S.mmsg)}</div>
 <div class="row" style="margin-top:8px;justify-content:flex-end"><button type="button" data-a="mapcancel">Close</button><button type="button" class="p" data-a="mapsave"${S.mt!=null&&S.mf?"":" disabled"}>Save mapping</button></div>
 <h2 style="margin:22px 0 6px;font-size:1.25rem">Mapped for ${esc(S.mb)}</h2>
 ${S.mplay?`<div id="map-player-status" class="mu video-player-status" role="status" aria-live="polite"></div><video id="map-player" class="video-player" controls playsinline preload="metadata" hidden></video><div class="row" style="margin:8px 0 12px;justify-content:flex-end"><button type="button" class="sm" data-a="mapstop">Close player</button></div>`:""}
 ${rows?`<div class="sc"><table><tr><th>#</th><th>Module</th><th>Task</th><th>Video folder</th><th></th></tr>${rows}</table></div>`:'<div class="mu">No videos mapped for this business yet.</div>'}
 </div></div>`;
}
function modal(t){
 if(S.permissions)return permissionsModal();
 if(S.organization)return organizationModal();
 if(S.map)return mapModal();
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
const BIZ=BUSINESSES;
const biz=t=>t.biz||"";
let S={t:[],sel:null,upload:false,video:false,hls:null,view:"overview",bv:"overview",map:false,organization:false,permissions:false,permissionDraft:null,permissionMsg:"",orgEntity:"business",orgParent:"",orgName:"",orgMsg:"",vmap:{},folders:[],mb:"Magnus",mm:0,mt:null,mf:"",mplay:"",mmsg:"",mfstat:"",himg:{},hmsg:{},user:null,options:{businesses:[],branches:[],departments:[],designations:[]},addBiz:"",addBranch:"",addDept:"",addDesg:"",addmsg:"",loginmsg:""};
let activeVideoUpload=null;
// ---- Supabase Auth-backed roles
const sameName=(a,b)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();
const PERMISSION_STORAGE_KEY="mt_permissions";
const copyPermissions=permissions=>Object.fromEntries(Object.keys(permissions).map(role=>[role,{...permissions[role]}]));
function loadPermissionOverrides(){
 try{
  const saved=localStorage.getItem(PERMISSION_STORAGE_KEY);
  if(!saved)return;
  const permissions=JSON.parse(saved);
  if(!permissions||typeof permissions!=="object")throw new Error("Saved permissions are invalid.");
  Object.keys(ROLE_PERMS).forEach(role=>{
   if(role==="developer"||!permissions[role]||typeof permissions[role]!=="object")return;
   Object.keys(PERM_LABELS).forEach(key=>{
    const value=permissions[role][key];
    if(value===0||value===1||value===false||value===true)ROLE_PERMS[role][key]=value===1||value===true?1:0;
   });
  });
 }catch(error){console.warn("Could not load saved role permissions.",error)}
}
loadPermissionOverrides();
const allow=p=>!!(S.user&&ROLE_PERMS[S.user.role]&&ROLE_PERMS[S.user.role][p]);
const canAddTrainee=()=>!!(allow("add")&&S.user&&["developer","business"].includes(S.user.role));
const ALLBIZ=u=>u.role==="developer";
const vbiz=()=>{const u=S.user;if(!u||u.role==="trainee")return[];if(ALLBIZ(u))return BIZ;return u.business&&u.business.name?[u.business.name]:[]};
const isOwn=t=>!!(S.user&&S.user.trainee_id===t.id);
const inScope=t=>{const u=S.user;if(!u)return false;
 if(ALLBIZ(u))return true;
 if(u.role==="business"||u.role==="business_view")return vbiz().includes(biz(t))
  &&(!u.branch||u.branch.name===t.branch)&&(!u.department||u.department.name===t.dept);
 if(u.role==="trainee")return isOwn(t);
 return false};
const scoped=()=>S.t.filter(inScope);
const ownRec=()=>S.t.find(isOwn)||null;
const oneBiz=()=>vbiz().length===1;
const roleLabel=()=>S.user?(ROLE_LABELS[S.user.role]||S.user.role):"";
const scopeLabel=()=>{const u=S.user;if(!u)return"";if(ALLBIZ(u))return"All businesses";
 if(u.business&&u.business.name)return [u.business.name,u.branch&&u.branch.name,u.department&&u.department.name].filter(Boolean).join(" · ");
 return""};
const initView=()=>{S.sel=null;S.vm=null;S.q="";S.bv="overview";S.modal=null;S.edit=false;S.add=false;S.upload=false;S.video=false;S.map=false;S.organization=false;S.permissions=false;S.permissionDraft=null;S.view=oneBiz()?vbiz()[0]:"overview"};
async function login(username,password){
 const response=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Could not sign in.");
 S.user=result.user;
 S.loginmsg="";
 await loadOptions();
 await load();
 initView();render();
 loadMap();loadHier();
}
function logout(){
 stopVideoPlayer();stopVideoPlayer("map-player");
 fetch("/api/logout",{method:"POST"}).catch(()=>{});
 S.user=null;S.t=[];S.loaded=false;initView();render();
}
function renderLogin(){
 const ap=document.getElementById("app");S.lv=null;
 if(ap.querySelector(".lgn"))return; // keep what the person has typed
 ap.classList.remove("an");
 ap.innerHTML=`<div class="lgn"><form class="card lgc" id="login-form"><div class="bk"><div class="lg">M</div><div><div class="brand">Magnus</div><div class="mu">Trainee Tracker</div></div></div><div><h1>Sign in</h1><div class="mu" style="margin-top:4px">Use your developer username or Supabase Auth email.</div></div><label class="fl">Username or email<input id="lg-username" name="username" autocomplete="username" required></label><label class="fl">Password<div class="pw-wrap"><input id="lg-p" name="password" type="password" autocomplete="current-password" required>${passwordToggle("lg-p")}</div></label><div id="lg-e" class="lg-err" role="alert" aria-live="polite">${esc(S.loginmsg)}</div><button class="p" type="submit">Sign in</button></form></div>`;
 const username=document.getElementById("lg-username");if(username)username.focus();
}
document.addEventListener("submit",e=>{
 if(e.target.id!=="login-form")return;
 e.preventDefault();
 const button=e.target.querySelector('button[type="submit"]'),er=document.getElementById("lg-e");
 button.disabled=true;er.textContent="";
 login(document.getElementById("lg-username").value.trim(),document.getElementById("lg-p").value)
  .catch(error=>{er.textContent=error instanceof Error?error.message:String(error)})
  .finally(()=>{if(button.isConnected)button.disabled=false});
});
// ---- Video map: business -> {"moduleIndex|task title": "video folder"}
const mkey=i=>ST[i].m+"|"+ST[i].n;
const vfolder=(b,i)=>(S.vmap[b]||{})[mkey(i)]||"";
const mvideos=mi=>ST.map((x,i)=>({x,i})).filter(o=>o.x.m===mi&&o.x.t==="VIDEO");
const loadMap=()=>fetch("/api/video-map").then(r=>r.json()).then(d=>{if(d&&typeof d==="object"&&!d.error)S.vmap=d}).catch(()=>{});
const loadOptions=()=>fetch("/api/options").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load organization options.");S.options=d;BUSINESSES.splice(0,BUSINESSES.length,...d.businesses.map(x=>x.name));BRANCHES.splice(0,BRANCHES.length,...[...new Set(d.branches.map(x=>x.name))]);DEPTS.splice(0,DEPTS.length,...[...new Set(d.departments.map(x=>x.name))])});
const load=()=>fetch("/api/trainees").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load trainees.");if(!Array.isArray(d))throw new Error("The server returned invalid trainee data.");S.t=d;S.loaded=true});
const save=()=>S.loaded?fetch("/api/trainees",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(S.t)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not save trainee data.");return d}).catch(error=>{alert(error instanceof Error?error.message:String(error));return load().then(render).catch(loadError=>alert(loadError instanceof Error?loadError.message:String(loadError)))}):Promise.resolve();
const now=()=>new Date().toISOString();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const EYE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4-.8"/></svg>';
const passwordToggle=id=>`<button class="pw-toggle" type="button" data-a="password-toggle" data-target="${id}" aria-label="Show password" title="Show password">${EYE}</button>`;
const fmt=i=>i?new Date(i).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):"–";
const took=(a,b)=>{if(!a||!b)return"–";const m=Math.round((new Date(b)-new Date(a))/60000);return m>=60?Math.floor(m/60)+" h "+m%60+" m":m+" m"};
const done=t=>t.logs.filter(l=>l.vt).length;
const cur=t=>{const l=t.logs[t.logs.length-1];return l.vt?null:l};
const needsPdf=x=>x.t==="PRE"||(x.t==="TASK"&&/presentation/i.test(x.n));
const PDFMAX=25*1024*1024;
const pdfSize=b=>b>=1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB";
const pdfLink=(t,l)=>`<a class="pdf-link" href="/api/presentations/${t.id}/${l.s}" target="_blank" rel="noopener">${esc(l.pdf.n)}</a>`;
const pdfUi=(t,l)=>l.pdf
 ?`<div class="pdf-box"><span class="pdf-ico">PDF</span><div class="pdf-meta">${pdfLink(t,l)}<div class="mu">${pdfSize(l.pdf.sz)} · uploaded ${fmt(l.pdf.at)}</div></div><label class="pdf-replace">Replace<input type="file" id="pdf-file" accept="application/pdf,.pdf" hidden></label></div><div id="pdf-status" class="mu" role="status"></div>`
 :`<div class="pdf-box pdf-empty"><div class="pdf-meta"><b>Upload your presentation (PDF)</b><div class="mu">PDF files only · up to 25 MB</div></div><input type="file" id="pdf-file" accept="application/pdf,.pdf"></div><div id="pdf-status" class="mu" role="status"></div>`;
const waiting=t=>{const g=t.logs[t.logs.length-1];return g.vt&&g.s+1<ST.length?g.s+1:null};
const seg=t=>'<div class="seg">'+MODS.map((m,mi)=>{const a=ST.filter(x=>x.m===mi),n=a.filter(x=>t.logs.some(g=>g.vt&&g.s===ST.indexOf(x))).length;return `<i title="${m.n}"><b style="width:${n/a.length*100}%"></b></i>`}).join("")+'</div>';
const inr=v=>v?"₹"+Number(v).toLocaleString("en-IN"):"–";
const jd=v=>v?new Date(v+"T00:00").toLocaleDateString([],{dateStyle:"medium"}):"–";
const info=t=>[["Branch",esc(t.branch||"–")],["Department",esc(t.dept)],["Designation",esc(t.desg||"–")],["Joining date",jd(t.join)],["Salary / month",inr(t.sal)],["Wage / day",inr(t.wage)]].filter(x=>allow("salary")||!/^(Salary|Wage)/.test(x[0]));
const vmod=t=>{const sm=Math.max(...t.logs.map(q=>ST[q.s].m));return[S.vm==null?sm:Math.max(0,Math.min(S.vm,sm)),sm]};
const mshort=i=>MODS[ST[i].m].n.split(" · ")[0];
const status=t=>{const l=cur(t);return !l?(waiting(t)!=null?["Ready to start "+mshort(waiting(t)),"s-rdy"]:["Completed","ok s-done"]):l.c?["Awaiting verification","s-ver"]:l.st?["In progress","s-prog"]:["Assigned – not started","s-asg"]};

// ---- Render
function render(){
 if(!S.user)return renderLogin();
 if(S.user.role==="trainee"){const o=ownRec();S.sel=o?o.id:null}
 const t=S.sel&&S.t.find(x=>x.id===S.sel&&inScope(x));
 const ap=document.getElementById("app");
 const vk=(S.sel||"list")+":"+S.vm,viewChanged=vk!==S.lv;
 if(!viewChanged)ap.classList.remove("an"); // plain refresh: new elements must not fade/slide in again (that was the blinking)
 // Keep an open pop-up in place and only refresh its contents, so its fade/pop-in never replays (no blinking).
 const tmp=document.createElement("div");
 tmp.innerHTML=`<div class="shell">${side(t)}<main class="mn">${t?detail(t):list()}</main></div>`+modal(t);
 const oldOv=ap.querySelector(":scope > .ov"),newOv=tmp.querySelector(":scope > .ov"),oldMb=oldOv&&oldOv.querySelector(".mb"),newMb=newOv&&newOv.querySelector(".mb");
 if(oldMb&&newMb&&oldOv.getAttribute("aria-labelledby")===newOv.getAttribute("aria-labelledby")){
  const bx=oldMb.scrollTop;
  ap.querySelector(":scope > .shell").replaceWith(tmp.querySelector(":scope > .shell")); // pop-up node is never detached, so its animation cannot restart
  oldMb.className=newMb.className;oldMb.innerHTML=newMb.innerHTML;oldMb.scrollTop=bx;
 }else ap.replaceChildren(...tmp.childNodes);
 if(viewChanged){S.lv=vk;ap.classList.remove("an");void ap.offsetWidth;ap.classList.add("an");clearTimeout(S.antm);S.antm=setTimeout(()=>ap.classList.remove("an"),1400)}
 if(S.add){const i=document.getElementById("nm");if(i)i.focus()}
 else if(t&&(S.modal!=null||S.edit)){const i=document.getElementById(S.edit?"en-nm":"ms-sc");if(i){i.focus();if(S.edit)i.select()}}
}
// ---- Left sidebar (dashboard layout)
function side(t){
 const brand=`<div class="bk"><div class="lg">M</div><div><div class="brand">Magnus</div><div class="mu">Trainee Tracker</div></div></div>`;
 const foot=`<div class="sf"><span class="mu">Theme</span>${tbtn()}</div>`;
 const permissionButton=S.user.role==="developer"?'<button type="button" class="sm" data-a="permissions-open">Role permissions</button>':"";
 const who=`<div class="who"><div class="who-n">${esc(S.user.full_name||roleLabel())}</div><div class="mu">${esc(roleLabel())}${scopeLabel()?" · "+esc(scopeLabel()):""}</div><div class="who-b">${permissionButton}<button type="button" class="sm" data-a="logout">Sign out</button></div></div>`;
 const B=(p,h)=>allow(p)?h:"";
 const orgButton=canManageOrganization()?'<button data-a="orgopen">Manage organization</button>':"";
 if(!t)return `<aside class="sb">${brand}${who}
  ${S.user.role==="trainee"?"":`<label class="fl sq"><span>Search</span><input id="q" type="search" value="${esc(S.q||"")}" placeholder="Name, department, designation…" autocomplete="off"></label>`}
  ${canAddTrainee()?'<button class="p" data-a="addopen">＋ Add trainee</button>':""}${orgButton}${B("upload",'<button data-a="uploadopen">↑ Upload video</button>')}${B("watch",'<button data-a="videoopen">▶ Watch video</button>')}${B("map",'<button data-a="mapopen">🔗 Map videos</button>')}${B("csv",'<button data-a="csv">Export CSV</button>')}
  <div class="sg"></div>
  <div class="sd"><span class="mu">Training duration</span><b>${hm(AT)}</b><span class="mu">${ST.length} steps · ${hm(VT)} of video (${VID.length} videos)</span></div>${foot}</aside>`;
 return `<aside class="sb">${brand}${who}
  ${S.user.role==="trainee"?"":'<button data-a="back">← All trainees</button>'}${orgButton}${B("upload",'<button data-a="uploadopen">↑ Upload video</button>')}${B("watch",'<button data-a="videoopen">▶ Watch video</button>')}${B("map",'<button data-a="mapopen">🔗 Map videos</button>')}${B("ename",'<button data-a="ename">✎ Edit name</button>')}${B("del",`<button class="dgr" data-a="del" data-id="${t.id}">Remove trainee</button>`)}
  <div class="sg"></div>
  <div class="sd"><span class="mu">Viewing</span><b>${esc(t.name)}</b></div>${foot}</aside>`;
}
// ---- Trainee cards, filtered by the search box (name, department, designation, branch)
const filtered=()=>{const q=(S.q||"").trim().toLowerCase();return scoped().filter(t=>(S.view==="overview"||biz(t)===S.view)&&[t.name,t.dept,t.desg,t.branch,biz(t)].some(v=>String(v||"").toLowerCase().includes(q)))};
const addBranches=(business=S.addBiz)=>{const org=S.options.businesses.find(x=>x.name===business);return S.options.branches.filter(x=>org&&x.business_id===org.id)};
const addDepts=()=>{const branch=addBranches().find(x=>x.name===S.addBranch);return S.options.departments.filter(x=>branch&&x.branch_id===branch.id)};
const addDesignations=()=>{const dept=addDepts().find(x=>x.name===S.addDept);return S.options.designations.filter(x=>dept&&x.department_id===dept.id)};
const canManageOrganization=()=>!!(S.user&&S.user.role==="developer");
const addOrgOption=entity=>canManageOrganization()?`<option value="__add_${entity}__">＋ Add ${entity}</option>`:"";
const addSelectOptions=(items,selected,value,label,emptyLabel,entity)=>{
 const placeholder=items.length?"":`<option value="" selected disabled>${emptyLabel}</option>`;
 return placeholder+items.map(item=>`<option value="${esc(value(item))}"${value(item)===selected?" selected":""}>${esc(label(item))}</option>`).join("")+addOrgOption(entity);
};
const addCategoryPanel=entity=>`<div id="add-category-${entity}" data-add-category-panel="${entity}" hidden><label class="fl">New ${entity} name<input id="add-category-name-${entity}" maxlength="120" placeholder="Enter ${entity} name"></label><div id="add-category-status-${entity}" class="lg-err" role="status"></div><div class="row"><button type="button" data-a="category-cancel" data-entity="${entity}">Cancel</button><button type="button" class="p" data-a="category-create" data-entity="${entity}">Add ${entity}</button></div></div>`;
const addBranchParent=()=>{const business=S.options.businesses.find(x=>x.name===S.addBiz);return business?business.id:""};
const addDepartmentParent=()=>{const branch=addBranches().find(x=>x.name===S.addBranch);return branch?branch.id:""};
const addDesignationParent=()=>{const department=addDepts().find(x=>x.name===S.addDept);return department?department.id:""};
const organizationParents=entity=>{
 if(entity==="branch")return S.options.businesses.map(x=>({id:x.id,label:x.name}));
 if(entity==="department")return S.options.branches.map(branch=>{
  const business=S.options.businesses.find(x=>x.id===branch.business_id);
  return{id:branch.id,label:[business&&business.name,branch.name].filter(Boolean).join(" · ")};
 });
 if(entity==="designation")return S.options.departments.map(department=>{
  const branch=S.options.branches.find(x=>x.id===department.branch_id);
  const business=branch&&S.options.businesses.find(x=>x.id===branch.business_id);
  return{id:department.id,label:[business&&business.name,branch&&branch.name,department.name].filter(Boolean).join(" · ")};
 });
 return[];
};
function openOrganization(entity,parentId=""){
 if(!canManageOrganization())return;
 S.organization=true;S.orgEntity=entity;S.orgParent=parentId||(organizationParents(entity)[0]||{}).id||"";S.orgName="";S.orgMsg="";render();
}
function organizationModal(){
 const labels={business:"Business",branch:"Branch",department:"Department",designation:"Designation"};
 const parents=organizationParents(S.orgEntity);
 const parent=S.orgEntity==="business"?"":`<label class="fl">Under<select id="org-parent">${parents.map(x=>`<option value="${esc(x.id)}"${x.id===S.orgParent?" selected":""}>${esc(x.label)}</option>`).join("")}</select></label>`;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="org-title"><div class="bd" data-a="orgclose"></div><div class="mb"><h2 id="org-title">Manage organization</h2><label class="fl">Record type<select id="org-entity">${Object.entries(labels).map(([key,label])=>`<option value="${key}"${key===S.orgEntity?" selected":""}>${label}</option>`).join("")}</select></label>${parent}<label class="fl">${labels[S.orgEntity]} name<input id="org-name" value="${esc(S.orgName)}" maxlength="120"></label><div class="lg-err" role="status">${esc(S.orgMsg)}</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="orgclose">Close</button><button type="button" class="p" data-a="orgcreate"${S.orgEntity!=="business"&&!parents.length?" disabled":""}>Create ${labels[S.orgEntity]}</button></div></div></div>`;
}
async function createOrganizationRecord(){
 const entity=S.orgEntity,parentId=S.orgParent;
 const name=(document.getElementById("org-name").value||"").trim();
 if(!name){S.orgMsg="Enter a name.";render();return}
 if(S.orgEntity!=="business"&&!S.orgParent){S.orgMsg="Choose a parent organization.";render();return}
 try{
  const response=await fetch("/api/organization",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:S.orgEntity,name,parent_id:S.orgParent||null})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not create the organization record.");
  S.orgName="";
  S.orgMsg=`Created ${S.orgEntity} "${name}".`;
  try{
   await loadOptions();
   if(S.add){
    if(entity==="business"){S.addBiz=name;S.addBranch="";S.addDept="";S.addDesg=""}
    if(entity==="branch"){
     const business=S.options.businesses.find(x=>x.id===parentId);
     S.addBiz=business?business.name:S.addBiz;S.addBranch=name;S.addDept="";S.addDesg="";
    }
    if(entity==="department"){
     const branch=S.options.branches.find(x=>x.id===parentId);
     const business=branch&&S.options.businesses.find(x=>x.id===branch.business_id);
     S.addBiz=business?business.name:S.addBiz;S.addBranch=branch?branch.name:S.addBranch;S.addDept=name;S.addDesg="";
    }
    if(entity==="designation")S.addDesg=name;
   }
  }catch(error){S.orgMsg+=` The record was created, but organization options could not refresh: ${error instanceof Error?error.message:String(error)}`}
 }catch(error){S.orgMsg=error instanceof Error?error.message:String(error)}
 render();
}
function permissionsModal(){
 const draft=S.permissionDraft||ROLE_PERMS,roles=Object.keys(ROLE_PERMS);
 const header=roles.map(role=>`<th>${esc(ROLE_LABELS[role]||role)}</th>`).join("");
 const rows=Object.entries(PERM_LABELS).map(([permission,label])=>`<tr><td>${esc(label)}</td>${roles.map(role=>`<td style="text-align:center"><input type="checkbox" class="permission-toggle" data-role="${esc(role)}" data-permission="${esc(permission)}"${draft[role]&&draft[role][permission]?" checked":""}${role==="developer"?" disabled":""} aria-label="${esc(label+" — "+(ROLE_LABELS[role]||role))}"></td>`).join("")}</tr>`).join("");
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="permissions-title"><div class="bd" data-a="permissions-close"></div><div class="mb wide acc"><h2 id="permissions-title">Role permissions</h2><div class="mu">Choose which actions are shown for each existing role. Developer permissions stay enabled.</div><div class="sc"><table><tr><th>Permission</th>${header}</tr>${rows}</table></div><div class="mu" role="status">${esc(S.permissionMsg||"")}</div><div class="mu" style="margin-top:8px">These switches control the app interface only; Supabase and API policies still enforce server-side access. Save applies on this browser. Download config.js and deploy it to share the settings with everyone.</div><div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" data-a="permissions-close">Close</button><button type="button" data-a="permissions-download">Download config.js</button><button type="button" class="p" data-a="permissions-save">Save permissions</button></div></div></div>`;
}
function savePermissions(){
 if(!S.permissionDraft)return;
 Object.keys(ROLE_PERMS).forEach(role=>{
  if(role==="developer")return;
  Object.keys(PERM_LABELS).forEach(permission=>{ROLE_PERMS[role][permission]=S.permissionDraft[role][permission]?1:0});
 });
 try{
  localStorage.setItem(PERMISSION_STORAGE_KEY,JSON.stringify(ROLE_PERMS));
  S.permissionMsg="Permissions saved in this browser.";
 }catch(error){
  S.permissionMsg=`Permissions are active for this session, but could not be saved in this browser: ${error instanceof Error?error.message:String(error)}`;
 }
 render();
}
function downloadPermissionConfig(){
 const config=S.permissionDraft||ROLE_PERMS;
 const contents=[
  "// Role and permission configuration for Magnus Trainee Tracker.",
  `const DEPTS = ${JSON.stringify(DEPTS,null,2)};`,
  `const BRANCHES = ${JSON.stringify(BRANCHES,null,2)};`,
  `const BUSINESSES = ${JSON.stringify(BUSINESSES,null,2)};`,
  `const SUBVIEWS = ${JSON.stringify(SUBVIEWS,null,2)};`,
  `const ROLE_LABELS = ${JSON.stringify(ROLE_LABELS,null,2)};`,
  `const PERM_LABELS = ${JSON.stringify(PERM_LABELS,null,2)};`,
  `const ROLE_PERMS = ${JSON.stringify(config,null,2)};`,
 ].join("\n\n")+"\n";
 const url=URL.createObjectURL(new Blob([contents],{type:"text/javascript"})),anchor=document.createElement("a");
 anchor.href=url;anchor.download="config.js";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const emptyMsg=()=>S.user&&S.user.role==="trainee"?"No trainee record is linked to this account. Please ask your administrator to check your login.":scoped().length?"No trainees match your search.":canAddTrainee()?"No trainees yet. Use “Add trainee” in the sidebar.":"No trainees to show yet.";
function tcards(){
 const q=(S.q||"").trim().toLowerCase(),L=filtered();
 return L.length?'<div class="gl">'+L.map(t=>{const[s,c]=status(t),l=cur(t),n=done(t);return `<div class="card item" data-a="open" data-id="${t.id}">
 <div class="sp"><b>${esc(t.name)}</b><span class="chip ${c}">${s}</span></div>
 <div class="mu">${[S.view==="overview"&&q?biz(t):"",t.branch,t.dept,t.desg].filter(Boolean).map(esc).join(" · ")}${t.join?" · Joined "+jd(t.join):""}</div>
 ${seg(t)}
 <div class="mu">${n}/${ST.length} verified${l?` · Now: Step ${l.s+1} – ${esc(ST[l.s].n)}`:""}</div></div>`}).join("")+'</div>':'<div class="mu">'+emptyMsg()+'</div>';
}
// ---- Hierarchy: Business > Branch > Department > trainees
const groupBy=(L,f)=>{const m=new Map();L.forEach(t=>{const k=f(t);if(!m.has(k))m.set(k,[]);m.get(k).push(t)});return[...m.entries()]};
function hierTrainees(L){
 return '<div class="hy-ts">'+L.map(t=>{const[s,c]=status(t);return `<div class="hy-t item" data-a="open" data-id="${t.id}" role="button" tabindex="0"><b>${esc(t.name)}</b><span class="mu">${esc(t.desg||"No designation")}</span><span class="chip ${c}">${s}</span></div>`}).join("")+'</div>';
}
function hierBranches(L){
 return groupBy(L,t=>t.branch||"No branch").map(([br,bl])=>`<div class="hy-br"><div class="hy-h"><b>${esc(br)}</b><span class="mu">${bl.length} ${bl.length===1?"trainee":"trainees"}</span></div>`+
  groupBy(bl,t=>t.dept||"No department").map(([dp,dl])=>`<div class="hy-d"><div class="hy-h"><b>${esc(dp)}</b><span class="mu">${dl.length}</span></div>${hierTrainees(dl)}</div>`).join("")+'</div>').join("");
}
function hierarchy(){
 const L=filtered();
 if(!L.length)return '<div class="mu">'+(S.t.length?"No trainees match your search.":"No trainees yet. Use “Add trainee” in the sidebar.")+'</div>';
 if(S.view!=="overview")return '<div class="card hy">'+hierBranches(L)+'</div>';
 return BIZ.map(b=>{const bl=L.filter(t=>biz(t)===b);return bl.length?`<div class="card hy"><div class="hy-h hy-top"><h2>${esc(b)}</h2><span class="mu">${bl.length} ${bl.length===1?"trainee":"trainees"}</span></div>${hierBranches(bl)}</div>`:""}).join("");
}
const bstats=L=>{const aw=L.filter(t=>{const l=cur(t);return l&&l.c}).length,dn=L.filter(t=>status(t)[0]==="Completed").length;return{n:L.length,aw,dn,ip:L.length-aw-dn}};
function bizCards(){
 return '<h2 class="bh">Businesses</h2><div class="bg">'+vbiz().map(b=>{const k=bstats(scoped().filter(t=>biz(t)===b));return `<div class="card item bz" data-a="openbiz" data-b="${esc(b)}" role="button" tabindex="0">
  <div class="sp"><b>${esc(b)}</b></div>
  <div class="bn">${k.n}</div><div class="mu">${k.n===1?"trainee":"trainees"}</div>
  <div class="bs mu"><span>${k.ip} in progress</span><span>${k.aw} awaiting</span><span>${k.dn} completed</span></div></div>`}).join("")+'</div>';
}
// ---- Hierarchy images (one per business, stored in the bucket)
const HYMAX=10*1024*1024;
const loadHier=()=>fetch("/api/hierarchy-images").then(r=>r.json()).then(d=>{if(d&&!d.error)S.himg=d}).catch(()=>{});
function hierImages(){
 const L=S.view==="overview"?vbiz():vbiz().filter(b=>b===S.view);
 return L.map(b=>{
  const im=S.himg[b],msg=S.hmsg[b]||"",busy=msg.endsWith("…");
  const url="/api/hierarchy-images/"+encodeURIComponent(b)+"?v="+encodeURIComponent(im?im.at:"");
  return `<div class="card hyi"><div class="sp"><h2>${esc(b)} hierarchy</h2>${allow("hier")?`<div class="row">${im?`<button type="button" class="sm dgr" data-a="hyremove" data-b="${esc(b)}"${busy?" disabled":""}>Remove</button>`:""}<label class="hy-up${busy?" is-busy":""}">${im?"Replace image":"Upload image"}<input type="file" class="hy-file" data-b="${esc(b)}" accept="image/png,image/jpeg,image/gif,image/webp" hidden${busy?" disabled":""}></label></div>`:""}</div>
  ${im?`<a href="${url}" target="_blank" rel="noopener"><img class="hy-img" src="${url}" alt="${esc(b)} hierarchy"></a><div class="mu">${esc(im.name)} · ${pdfSize(im.size)} · uploaded ${fmt(im.at)}</div>`:`<div class="mu">No hierarchy image uploaded for ${esc(b)} yet.</div>`}
  ${msg?`<div class="mu" role="status" style="margin-top:6px">${esc(msg)}</div>`:""}</div>`}).join("");
}
async function hierUpload(inp){
 if(!allow("hier"))return;const b=inp.dataset.b,f=inp.files[0];inp.value="";if(!f)return;
 const setMsg=m=>{S.hmsg[b]=m;if(S.bv==="hierarchy"&&!S.sel)render()};
 if(!/^image\/(png|jpeg|gif|webp)$/.test(f.type))return setMsg("Only PNG, JPG, GIF or WEBP images are allowed.");
 if(f.size>HYMAX)return setMsg("Image must be 10 MB or smaller.");
 setMsg("Uploading…");
 try{
  const fd=new FormData();fd.append("business",b);fd.append("file",f);
  const r=await fetch("/api/hierarchy-images",{method:"POST",body:fd}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Upload failed.");
  S.himg=d;setMsg("");
 }catch(err){setMsg(err instanceof Error?err.message:String(err))}
}
async function hierRemove(b){
 if(!confirm("Remove the "+b+" hierarchy image?"))return;
 S.hmsg[b]="Removing…";render();
 try{
  const r=await fetch("/api/hierarchy-images/"+encodeURIComponent(b),{method:"DELETE"}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Could not remove the image.");
  S.himg=d;S.hmsg[b]="";
 }catch(err){S.hmsg[b]=err instanceof Error?err.message:String(err)}
 render();
}
function listBody(){
 if(S.bv==="hierarchy")return hierImages();
 return S.view==="overview"&&!(S.q||"").trim()?bizCards():tcards();
}
function list(){
 const ov=S.view==="overview",k=bstats(ov?scoped():scoped().filter(t=>biz(t)===S.view));
 const st=(l,v,sub)=>`<div class="tl"><span class="mu">${l}</span><b>${v}</b><span class="mu">${sub}</span></div>`;
 const desc=ov?"Overall overview across all businesses. Open a business below to see its trainees and hierarchy.":`Follow every ${esc(S.view)} trainee through ${MODS.length} modules and ${ST.length} tasks, one verified step at a time.`;
 return `${ov||oneBiz()?"":'<button class="bk-btn" data-a="allbiz">← All businesses</button>'}<div class="ph"><h1>${ov?"Trainees":esc(S.view)}</h1><div class="mu">${desc}</div></div>
 <label class="fl vw"><span>View</span><select id="view">${[["overview","Overview"],["hierarchy","Hierarchy"]].map(([v,n])=>`<option value="${v}"${S.bv===v?" selected":""}>${n}</option>`).join("")}</select></label>
 <div class="tg">${st("Total trainees",k.n,"enrolled")}${st("In progress",k.ip,"working through steps")}${st("Awaiting verification",k.aw,"needs a verifier")}${st("Completed",k.dn,"all steps verified")}</div>
 <div id="tl">${listBody()}</div>`;
}
// ---- Add trainee pop-up form
function addModal(){
 const branches=addBranches(),departments=addDepts(),designations=addDesignations();
 const draft=S.addDraft||{};
 return `<div class="ov" role="dialog" aria-modal="true"><div class="bd" data-a="mcancel"></div><div class="mb wide"><h2 style="margin-top:2px">Add trainee</h2><div class="fg"><label>Trainee name<input id="nm" placeholder="Full name" value="${esc(draft.name||"")}"></label><label>Joining date<input id="jd" type="date" value="${esc(draft.date||new Date().toISOString().slice(0,10))}"></label><div><label>Business<select id="bz">${addSelectOptions(vbiz(),S.addBiz,x=>x,x=>x,"Choose business…","business")}</select></label>${addCategoryPanel("business")}</div><div><label>Branch<select id="br">${addSelectOptions(branches,S.addBranch,x=>x.name,x=>x.name,"Choose branch…","branch")}</select></label>${addCategoryPanel("branch")}</div><div><label>Department<select id="dp">${addSelectOptions(departments,S.addDept,x=>x.name,x=>x.name,"Choose department…","department")}</select></label>${addCategoryPanel("department")}</div><div><label>Designation<select id="ds">${addSelectOptions(designations,S.addDesg,x=>x.title,x=>x.title,"Choose designation…","designation")}</select></label>${addCategoryPanel("designation")}</div><label>Salary (₹ per month)<input id="sl" type="number" min="0" inputmode="numeric" placeholder="0" value="${esc(draft.salary||"")}"></label><label>Wage (₹ per day)<input id="wg" type="number" min="0" inputmode="numeric" placeholder="0" value="${esc(draft.wage||"")}"></label></div><div class="lg-err" role="status">${esc(S.addmsg||"")}</div><div class="mu" style="margin-top:12px">To add a missing category, choose “＋ Add …”, enter its name here, and click Add. Step 1 is assigned right now. Each next step unlocks only after the previous one is completed and verified.</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="mcancel">Cancel</button><button class="p" data-a="add"${branches.length&&departments.length&&designations.length?"":" disabled"}>Add trainee &amp; assign Step 1</button></div></div></div>`;
}
function showAddCategory(entity){
 if(!canManageOrganization())return;
 document.querySelectorAll("[data-add-category-panel]").forEach(panel=>{panel.hidden=panel.dataset.addCategoryPanel!==entity});
 const selects={business:"bz",branch:"br",department:"dp",designation:"ds"};
 const selected={business:S.addBiz,branch:S.addBranch,department:S.addDept,designation:S.addDesg};
 const select=document.getElementById(selects[entity]);
 if(select)select.value=selected[entity]||"";
 const input=document.getElementById(`add-category-name-${entity}`);
 if(input)input.focus();
}
async function createAddCategory(entity){
 if(!canManageOrganization())return;
 const labels={business:"Business",branch:"Branch",department:"Department",designation:"Designation"};
 if(!Object.prototype.hasOwnProperty.call(labels,entity))return;
 const input=document.getElementById(`add-category-name-${entity}`);
 const status=document.getElementById(`add-category-status-${entity}`);
 const submit=document.querySelector(`[data-a="category-create"][data-entity="${entity}"]`);
 const name=(input.value||"").trim();
 if(!name){status.textContent=`Enter a ${entity} name.`;input.focus();return}
 const parents={branch:addBranchParent,department:addDepartmentParent,designation:addDesignationParent};
 const parentId=parents[entity]?parents[entity]():null;
 if(entity!=="business"&&!parentId){status.textContent=`Select a ${entity==="branch"?"business":entity==="department"?"branch":"department"} first.`;return}
 submit.disabled=true;
 status.textContent=`Adding ${entity}…`;
 try{
  const response=await fetch("/api/organization",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity,name,parent_id:parentId})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Could not add ${entity}.`);
  try{
   await loadOptions();
  }catch(error){
   throw new Error(`${labels[entity]} was created, but the dropdowns could not refresh: ${error instanceof Error?error.message:String(error)}`);
  }
  if(entity==="business"){S.addBiz=name;S.addBranch="";S.addDept="";S.addDesg=""}
  if(entity==="branch"){S.addBranch=name;S.addDept="";S.addDesg=""}
  if(entity==="department"){S.addDept=name;S.addDesg=""}
  if(entity==="designation")S.addDesg=name;
  S.addmsg="";
  render();
 }catch(error){
  status.textContent=error instanceof Error?error.message:String(error);
 }finally{
  if(submit.isConnected)submit.disabled=false;
 }
}
function detail(t){
 const l=cur(t),[s,c]=status(t);let rows="",lm=-1;const[vm,sm]=vmod(t);
 ST.forEach((x,i)=>{
  if(x.m!==vm)return;
  if(x.m!==lm){lm=x.m;const f0=t.logs.find(q=>ST[q.s].m===lm);rows+=`<tr class="mod"><td colspan="10">${MODS[lm].n} <span class="mu">· ${f0?"Started "+fmt(f0.a):"Not started"}</span> <span class="mu">· Video total: ${hm(mv(lm))}</span></td></tr>`}
  const g=t.logs.find(q=>q.s===i);
  const st=g?(g.vt?'<span class="ok">Verified</span>':g.c?'<span class="wa">Awaiting verify</span>':g.st?'<span class="wa">In progress</span>':'<span class="wa">Assigned</span>'):"Locked";
  rows+=`<tr class="${g?"":"lkd"}"><td>${i+1}</td><td>${x.t}</td><td>${esc(x.n)}${g&&x.t==="VIDEO"&&vfolder(biz(t),i)?` <button type="button" class="sm" data-a="watchstep" data-s="${i}">▶ Watch</button>`:""}</td><td>${x.d}</td><td>${x.by}</td><td>${g?fmt(g.st):"–"}</td><td>${g?fmt(g.c):"–"}</td><td>${g&&g.vt?esc(g.v):"–"}</td><td>${g?took(g.st||g.a,g.c):"–"}</td><td>${st}</td></tr>`});
 const vn=ST.filter(x=>x.m===vm),vd=vn.filter(x=>t.logs.some(g=>g.vt&&ST[g.s]===x)).length,w=waiting(t),can=w!=null&&ST[w].m===vm+1;
const nav=`<div class="navbar"><button class="gh" data-a="prev" ${vm<=0?"disabled":""}>‹ Previous</button><div class="nv"><b>${MODS[vm].n}</b><span class="mu">${vd}/${vn.length} verified · ${hm(vn.reduce((z,x)=>z+x.mn,0))} planned</span></div><button class="${can?"p":"gh"}" data-a="next" ${!allow("work")||!(vm<sm||can)?"disabled":""}>${can?"Start "+mshort(w)+" ›":"Next ›"}</button></div>${vm===sm&&vm+1<MODS.length&&!can?`<div class="mu" style="margin-top:8px;text-align:right">The next module unlocks once this one is fully verified.</div>`:""}`;
 let act="";
 if(l){
  const x=ST[l.s];
  const activity=l.c
   ?`<div class="mu" style="margin-bottom:8px">Completed ${fmt(l.c)}.${l.pdf?` Presentation: ${pdfLink(t,l)}.`:""} ${l.s+1<ST.length&&ST[l.s+1].m!==x.m?"This is the last step of the module; the next module starts only when you press Start.":"Verification will assign the next step."}</div>`
   :l.st
    ?`<div class="mu" style="margin-bottom:8px">Assigned ${fmt(l.st)}</div>`
    :`<div class="mu" style="margin-bottom:8px">Assigned but not started. Time is counted only from when you press Start.</div>`;
  const actions=l.c
   ?allow("verify")
    ?`<div class="row"><input id="vb" value="${esc(S.user.full_name||"")}" placeholder="Verified by (${esc(x.by)} – name)"><button class="p" data-a="ver">Verify &amp; assign next</button></div>`
    :'<div class="mu">Waiting for a verifier to review this step.</div>'
   :l.st
    ?(allow("work")&&needsPdf(x)?pdfUi(t,l)+(l.pdf?"":`<div class="mu" style="margin-bottom:8px">Upload your presentation (PDF) to enable completion.</div>`):"")+(allow("work")?`<button class="p" data-a="cmp" ${needsPdf(x)&&!l.pdf?"disabled":""}>Mark completed now</button>`:"")
    :allow("work")?'<button class="p" data-a="go">▶ Start task</button>':"";
  act=`<div class="card cur"><div class="mu">Current · Step ${l.s+1} of ${ST.length} · ${MODS[x.m].n}</div>
 <h2 style="margin-top:4px"><span class="chip">${x.t}</span> ${esc(x.n)}</h2>
 <div class="mu">Duration ${x.d} · Monitored by ${x.by}</div>${x.t==="VIDEO"&&vfolder(biz(t),l.s)?`<div style="margin-top:10px"><button type="button" class="sm gh" data-a="watchstep" data-s="${l.s}">▶ Watch this video</button></div>`:""}
 <div style="margin-top:10px">${activity}${actions}</div></div></div>`;
 }
 else if(waiting(t)!=null){const w=waiting(t),y=ST[w];act=`<div class="card cur"><div class="mu">${MODS[ST[w-1].m].n} finished and verified</div><h2 style="margin-top:4px">Next: ${MODS[y.m].n}</h2><div class="mu" style="margin-bottom:10px">First step: ${esc(y.n)} (${y.d}). Time is counted only from when you press Start.</div>${allow("work")?`<button class="p" data-a="start">▶ Start ${mshort(w)}</button>`:""}</div>`}
 else act=`<div class="card cur ok"><b>All ${ST.length} steps completed and verified 🎉</b></div>`;
 return `<div class="card"><div class="sp"><h1>${esc(t.name)}</h1><span class="chip ${c}">${s}</span></div>
 <div class="dg">${info(t).map(x=>`<div><span class="mu">${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div>${seg(t)}<div class="mu">${done(t)}/${ST.length} verified · Videos done: ${hm(t.logs.filter(l=>l.vt&&ST[l.s].t==="VIDEO").reduce((a,l)=>a+ST[l.s].min,0))} of ${hm(VT)}</div></div>
 ${act}${tiles(t)}<div class="card"><h2>Workflow log</h2><div class="sc"><table><tr><th>#</th><th>Type</th><th>Task</th><th>Planned</th><th>Monitor</th><th>Assigned</th><th>Completed</th><th>Verified by</th><th>Time taken</th><th>Status</th></tr>${rows}</table></div>${nav}</div>`;
}

// ---- Actions
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a,t=S.t.find(x=>x.id===S.sel);
 if(a==="password-toggle"){const input=document.getElementById(b.dataset.target);if(!input)return;const visible=input.type==="password";input.type=visible?"text":"password";b.setAttribute("aria-label",visible?"Hide password":"Show password");b.title=visible?"Hide password":"Show password";b.innerHTML=visible?EYE_OFF:EYE;return}
 if(a==="logout")return logout();
 if(["cmp","go","start","next"].includes(a)&&!allow("work"))return;
 const NEED={addopen:"add",add:"add",del:"del",ename:"ename",esave:"ename",uploadopen:"upload",hyremove:"hier",ver:"verify",score:"score",msave:"score",csv:"csv"};
 if(a.startsWith("permissions-")&&S.user.role!=="developer")return;
 if(a.startsWith("org")&&!canManageOrganization())return;
 if(a==="category-create")return createAddCategory(b.dataset.entity);
 if(a==="category-cancel"){
  document.querySelectorAll("[data-add-category-panel]").forEach(panel=>{panel.hidden=true});
  const selects={business:"bz",branch:"br",department:"dp",designation:"ds"};
  const selected={business:S.addBiz,branch:S.addBranch,department:S.addDept,designation:S.addDesg};
  const select=document.getElementById(selects[b.dataset.entity]);
  if(select)select.value=selected[b.dataset.entity]||"";
  const input=document.getElementById(`add-category-name-${b.dataset.entity}`);
  const status=document.getElementById(`add-category-status-${b.dataset.entity}`);
  if(input)input.value="";
  if(status)status.textContent="";
  return;
 }
 if(a.startsWith("map")&&!allow("map"))return;
 if(NEED[a]&&(NEED[a]==="add"?!canAddTrainee():!allow(NEED[a])))return;
 if(a==="open"){const o=S.t.find(x=>x.id===b.dataset.id);if(!o||!inScope(o))return}
 if(a==="openbiz"&&!vbiz().includes(b.dataset.b))return;
 if(a==="allbiz"&&oneBiz())return;
 if(a==="back"&&S.user.role==="trainee")return;
 if(a.startsWith("map")){return mapAction(a,b)}
 if(a==="hyremove")return hierRemove(b.dataset.b);
 if(a==="add"){const n=document.getElementById("nm").value.trim();if(!n)return document.getElementById("nm").focus();
  const d=now(),g=i=>document.getElementById(i).value.trim(),business=g("bz"),department=g("dp"),branch=g("br"),designation=g("ds");
  if(!vbiz().includes(business)||!addDepts().some(x=>sameName(x.name,department))||!addBranches(business).some(x=>sameName(x.name,branch))||!addDesignations().some(x=>sameName(x.title,designation))){S.addmsg="Choose an available business, branch, department, and designation.";render();return}
  S.t.push({id:crypto.randomUUID(),biz:business,name:n,dept:department,branch:branch,desg:designation,join:g("jd"),sal:g("sl"),wage:g("wg"),start:d,logs:[{s:0,a:d}]});S.add=false;S.addmsg=""}
 else if(a==="openbiz"){S.view=b.dataset.b;S.bv="overview";S.q=""}
 else if(a==="allbiz"){S.view="overview";S.bv="overview";S.q=""}
 else  if(a==="open"){S.sel=b.dataset.id;S.vm=null;S.modal=null;S.edit=false}
 else if(a==="back"){S.sel=null;S.modal=null;S.edit=false}
 else if(a==="del"){if(!confirm("Remove this trainee and all their records?"))return;S.t=S.t.filter(x=>x.id!==b.dataset.id);S.sel=null}
 else if(a==="cmp"){const l=cur(t);if(needsPdf(ST[l.s])&&!l.pdf)return;l.c=now()}
 else if(a==="ver"){const v=document.getElementById("vb").value.trim();if(!v)return document.getElementById("vb").focus();
  const l=cur(t),d=now();l.v=v;l.vt=d;if(l.s+1<ST.length&&ST[l.s+1].m===ST[l.s].m)t.logs.push({s:l.s+1,a:d});else if(modDone(t,ST[l.s].m)&&modScore(t,ST[l.s].m)==null&&allow("score"))S.modal=ST[l.s].m}
 else if(a==="start"){if(waiting(t)!=null){const d=now();t.logs.push({s:waiting(t),a:d,st:d});S.vm=null}}
 else if(a==="go"){const l=cur(t);if(l&&!l.st)l.st=now()}
 else if(a==="prev"){S.vm=vmod(t)[0]-1}
 else if(a==="next"){const[v,m]=vmod(t);if(v<m)S.vm=v+1;else if(waiting(t)!=null&&ST[waiting(t)].m===v+1){const d=now();t.logs.push({s:waiting(t),a:d,st:d});S.vm=null}}
 else if(a==="score"){S.modal=+b.dataset.mi}
 else  if(a==="addopen"){S.add=true;S.addmsg="";S.addDraft={name:"",date:new Date().toISOString().slice(0,10),salary:"",wage:""};S.addBiz=S.view!=="overview"?S.view:(vbiz()[0]||"");S.addBranch=(addBranches(S.addBiz)[0]||{}).name||"";S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||""}
 else if(a==="permissions-open"){S.permissions=true;S.permissionDraft=copyPermissions(ROLE_PERMS);S.permissionMsg=""}
 else if(a==="permissions-close"){S.permissions=false;S.permissionDraft=null;S.permissionMsg=""}
 else if(a==="permissions-save")return savePermissions();
 else if(a==="permissions-download")return downloadPermissionConfig();
 else if(a==="orgopen")return openOrganization("business");
 else if(a==="orgclose"){S.organization=false}
 else if(a==="orgcreate")return createOrganizationRecord();
 else if(a==="uploadopen"){S.add=false;S.edit=false;S.modal=null;S.upload=true}
 else if(a==="uploadcancel"){cancelVideoUpload();return}
 else if(a==="parent-create-cancel"){document.getElementById("parent-create-panel").hidden=true;document.getElementById("parent-folder-status").textContent="";return}
 else if(a==="parent-create"){createParentFolder();return}
 else if(a==="videoopen"){S.add=false;S.edit=false;S.modal=null;S.upload=false;S.video=true}
 else if(a==="videocancel"){stopVideoPlayer();S.video=false;S.vpre=""}
 else if(a==="watchstep"){const st=+b.dataset.s,f=t?vfolder(biz(t),st):"";if(!f)return;S.add=false;S.edit=false;S.modal=null;S.upload=false;S.map=false;S.vpre=f;S.video=true}
 else if(a==="mcancel"){S.modal=null;S.edit=false;S.add=false}
 else if(a==="ename"){S.edit=true}
 else if(a==="esave"){const el=document.getElementById("en-nm"),n=el.value.trim();if(!n)return el.focus();t.name=n;S.edit=false}
 else if(a==="msave"){const el=document.getElementById("ms-sc"),n=+el.value;if(el.value.trim()===""||!Number.isFinite(n))return el.focus();
  t.scores=t.scores||{};t.scores[S.modal]={sc:Math.max(0,Math.min(MAXSC,n)),rm:document.getElementById("ms-rm").value.trim()};S.modal=null}
 else if(a==="theme")return toggleTheme();
 else if(a==="csv")return csv();
 if(["add","del","cmp","ver","start","go","next","esave","msave"].includes(a))save();
 render();
 if(a==="uploadopen")loadParentFolders();
 if(a==="videoopen")loadVideoFolders();
 if(a==="watchstep")loadVideoFolders(S.vpre);
});

document.addEventListener("change",e=>{
 if(e.target.classList&&e.target.classList.contains("permission-toggle")){
  const role=e.target.dataset.role,permission=e.target.dataset.permission;
  if(S.permissions&&role!=="developer"&&S.permissionDraft&&S.permissionDraft[role]&&Object.prototype.hasOwnProperty.call(PERM_LABELS,permission)){
   S.permissionDraft[role][permission]=e.target.checked?1:0;
  }
  return;
 }
 if(e.target.id==="view"){S.bv=e.target.value;render();return}
 if(e.target.id==="org-entity"){S.orgEntity=e.target.value;S.orgParent=(organizationParents(S.orgEntity)[0]||{}).id||"";S.orgMsg="";render();return}
 if(e.target.id==="org-parent"){S.orgParent=e.target.value;return}
 if(e.target.id==="bz"){
  if(e.target.value==="__add_business__"&&canManageOrganization())return showAddCategory("business");
  S.addBiz=e.target.value;S.addBranch=(addBranches()[0]||{}).name||"";S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||"";S.addmsg="";render();return
 }
 if(e.target.id==="br"){
  if(e.target.value==="__add_branch__"&&canManageOrganization())return showAddCategory("branch");
  S.addBranch=e.target.value;S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||"";S.addmsg="";render();return
 }
 if(e.target.id==="dp"){
  if(e.target.value==="__add_department__"&&canManageOrganization())return showAddCategory("department");
  S.addDept=e.target.value;S.addDesg=(addDesignations()[0]||{}).title||"";S.addmsg="";render();return
 }
 if(e.target.id==="ds"){
  if(e.target.value==="__add_designation__"&&canManageOrganization())return showAddCategory("designation");
  S.addDesg=e.target.value;
 }
 const inp=e.target.closest&&e.target.closest("#pdf-file");
 if(inp)uploadPresentation(inp);
});
function uploadPresentation(inp){
 const file=inp.files[0];if(!file)return;
 const t=S.t.find(x=>x.id===S.sel),l=t&&cur(t);if(!l)return;
 const status=document.getElementById("pdf-status");
 const fail=m=>{if(status)status.textContent=m;inp.value=""};
 if(!/\.pdf$/i.test(file.name)||(file.type&&file.type!=="application/pdf"))return fail("Only PDF files are allowed.");
 if(file.size>PDFMAX)return fail("The PDF must be 25 MB or smaller.");
 const step=l.s,fd=new FormData();
 fd.append("trainee_id",t.id);fd.append("step",step);fd.append("file",file);
 inp.disabled=true;
 const xhr=new XMLHttpRequest();
 xhr.open("POST","/api/presentations");
 xhr.upload.onprogress=ev=>{if(ev.lengthComputable&&status)status.textContent="Uploading… "+Math.round(ev.loaded/ev.total*100)+"%"};
 xhr.onerror=()=>{inp.disabled=false;fail("Upload failed. Check your connection and try again.")};
 xhr.onload=()=>{
  let r={};try{r=JSON.parse(xhr.responseText||"{}")}catch(_){}
  if(xhr.status<200||xhr.status>=300){inp.disabled=false;return fail(r.error||"Upload failed.")}
  const lg=t.logs.find(g=>g.s===step);
  if(lg){lg.pdf={n:file.name,sz:file.size,at:now()};save();render()}
 };
 xhr.send(fd);
}

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

async function loadVideoFolders(pre=""){
 const select=document.getElementById("video-library-folder"),status=document.getElementById("video-player-status");
 try{
  const response=await fetch("/api/videos");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not load video folders.");
  if(!Array.isArray(result.folders))throw new Error("The server returned an invalid video folder list.");
  select.replaceChildren(new Option("Select a folder",""));
  result.folders.forEach(folder=>select.add(new Option(folder,folder)));
  if(pre){if(!result.folders.includes(pre))select.add(new Option(pre,pre));select.value=pre;playVideo(pre);return}
  if(result.folders.length)status.textContent="Choose a folder to play its video.";
  else{select.replaceChildren(new Option("No videos available",""));status.textContent="Upload a video first."}
 }catch(error){
  select.replaceChildren(new Option("Unable to load folders",""));
  status.textContent=error instanceof Error?error.message:String(error);
 }
}

function stopVideoPlayer(id="video-player"){
 if(S.hls){S.hls.destroy();S.hls=null}
 const player=document.getElementById(id);
 if(player){player.onerror=null;player.pause();player.removeAttribute("src");player.load()}
}

function playVideo(folder,pid="video-player",sid="video-player-status"){
 const player=document.getElementById(pid),status=document.getElementById(sid);
 if(!player||!status)return;
 stopVideoPlayer(pid);
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

function sendVideo(form,onProgress,active){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  const clear=()=>{if(active.xhr===xhr)active.xhr=null};
  xhr.open("POST","/api/videos");
  xhr.responseType="text";
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded,e.total)};
  xhr.upload.onload=()=>onProgress(1,1,true);
  xhr.onerror=()=>{clear();reject(new Error("Network error during upload."))};
  xhr.onabort=()=>{clear();reject(new Error("Upload cancelled."))};
  xhr.onload=()=>{
   clear();
   let result={};
   try{result=JSON.parse(xhr.responseText||"{}")}catch(_){}
   if(xhr.status>=200&&xhr.status<300)resolve(result);
   else reject(new Error(result.error||"Video upload failed."));
  };
  active.xhr=xhr;
  xhr.send(new FormData(form));
 });
}
async function cancelVideoUpload(){
 const active=activeVideoUpload;
 if(!active){S.upload=false;render();return}
 active.cancelled=true;
 if(active.xhr)active.xhr.abort();
 const status=document.getElementById("video-upload-status");
 if(status)status.textContent="Stopping upload…";
 if(active.jobId){
  try{
   const response=await fetch(`/api/video-jobs/${encodeURIComponent(active.jobId)}`,{method:"DELETE"});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"The server could not stop the upload.");
  }catch(error){
   active.cancelled=false;
   if(status&&status.isConnected){
    status.textContent=`Could not stop upload: ${error instanceof Error?error.message:String(error)}`;
    return;
   }
   throw error;
  }
 }
 S.upload=false;
 render();
}
async function pollVideoJob(id,onUpdate,active){
 for(;;){
  if(active.cancelled)throw new Error("Upload cancelled.");
  await new Promise(r=>setTimeout(r,800));
  let job;
  try{
   const r=await fetch("/api/video-jobs/"+encodeURIComponent(id),{cache:"no-store"});
   job=await r.json();
   if(!r.ok)throw new Error(job.error||"Could not read job status.");
  }catch(err){
   if(err instanceof TypeError)continue;
   throw err;
  }
  onUpdate(job);
  if(job.status==="cancelling"||job.status==="cancelled")throw new Error("Upload cancelled.");
  if(job.status==="done")return job;
  if(job.status==="error")throw new Error(job.error||"Video processing failed.");
 }
}
async function uploadVideo(){
 const form=document.getElementById("video-upload-form"),status=document.getElementById("video-upload-status"),progress=document.getElementById("video-upload-progress"),submit=document.getElementById("video-upload-submit"),meta=document.getElementById("video-upload-meta"),phase=document.getElementById("video-upload-phase"),pct=document.getElementById("video-upload-pct"),bar=progress.firstElementChild;
 if(!form.reportValidity())return;
 submit.disabled=true;
 progress.hidden=false;meta.hidden=false;
 progress.classList.remove("is-converting");
 let shown=0;
 const active={xhr:null,jobId:null,cancelled:false};
 activeVideoUpload=active;
 const setPct=v=>{const n=Math.max(shown,Math.min(100,Math.round(v)));shown=n;bar.style.width=n+"%";progress.setAttribute("aria-valuenow",n);pct.textContent=n+"%"};
 const fmt=b=>b>=1048576?(b/1048576).toFixed(1)+" MB":Math.round(b/1024)+" KB";
 setPct(0);
 phase.textContent="Uploading video to server…";
 status.classList.remove("upload-status--success");
 status.textContent="Keep this page open until the upload finishes.";
 try{
  // One bar for the whole job: 0-40% browser upload, 40-60% HLS split, 60-100% storage upload
  let result=await sendVideo(form,(loaded,total,done)=>{
   if(done){
    setPct(40);
    phase.textContent="Splitting video into HLS segments…";
    status.textContent="Upload received. Keep this page open.";
   }else{
    setPct(loaded/total*40);
    phase.textContent="Uploading video to server…";
    status.textContent=`Uploading ${fmt(loaded)} of ${fmt(total)}`;
   }
  },active);
  if(active.cancelled)throw new Error("Upload cancelled.");
  if(result.job_id){
   active.jobId=result.job_id;
   result=await pollVideoJob(result.job_id,job=>{
    const p=job.percent||0;
    if(job.status==="uploading"){
     setPct(60+p*0.4);
     phase.textContent="Uploading HLS segments to storage…";
     status.textContent="Almost done. Keep this page open.";
    }else{
     setPct(40+p*0.2);
     phase.textContent="Splitting video into HLS segments…";
     status.textContent="Converting video. Keep this page open.";
    }
   },active);
   setPct(100);
  }
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
  if(active.cancelled){
   if(status.isConnected)status.textContent="Upload cancelled.";
  }else status.textContent=`Upload failed: ${error instanceof Error?error.message:String(error)}`;
 }finally{
  if(activeVideoUpload===active)activeVideoUpload=null;
  progress.hidden=true;meta.hidden=true;
  progress.classList.remove("is-converting");
  if(submit.isConnected)submit.disabled=false;
 }
}
document.addEventListener("submit",e=>{
 if(e.target.id!=="video-upload-form")return;
 e.preventDefault();
 uploadVideo();
});
document.addEventListener("change",e=>{
 if(e.target.classList&&e.target.classList.contains("hy-file"))return hierUpload(e.target);
 const id=e.target.id;
 if(id==="map-module"){S.mm=+e.target.value;S.mt=null;S.mfTouched=false;S.mmsg="";return mapRender()}
 if(id==="map-task"){S.mt=+e.target.value;S.mfTouched=false;S.mmsg="";return mapRender()}
 if(id==="map-folder"){S.mf=e.target.value;S.mfTouched=true;S.mmsg="";return mapRender()}
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
 const r=[["Trainee","Business","Branch","Department","Designation","Joining date","Salary","Wage","Step","Module","Type","Task","Monitored by","Assigned","Completed","Verified by","Verified at"]];
 scoped().forEach(t=>t.logs.forEach(g=>{const x=ST[g.s];r.push([t.name,biz(t),t.branch||"",t.dept,t.desg||"",t.join||"",allow("salary")?(t.sal||""):"",allow("salary")?(t.wage||""):"",g.s+1,MODS[x.m].n,x.t,x.n,x.by,g.st||"",g.c||"",g.v||"",g.vt||""])}));
 const s=r.map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
 const u=URL.createObjectURL(new Blob([s],{type:"text/csv"})),a=document.createElement("a");a.href=u;a.download="trainee-log.csv";a.click();
}
document.addEventListener("keydown",e=>{
 if((e.key==="Enter"||e.key===" ")&&e.target.classList&&(e.target.classList.contains("bz")||e.target.classList.contains("hy-t"))){e.preventDefault();e.target.click();return}
 if(e.key==="Escape"&&(S.modal!=null||S.edit||S.add||S.upload||S.video||S.map||S.organization||S.permissions)){stopVideoPlayer();stopVideoPlayer("map-player");S.modal=null;S.edit=false;S.add=false;S.upload=false;S.video=false;S.map=false;S.organization=false;S.permissions=false;S.permissionDraft=null;S.mplay="";render()}
 else if(e.key==="Enter"&&S.add&&e.target.id.startsWith("add-category-name-")){const entity=e.target.id.slice("add-category-name-".length),b=document.querySelector(`[data-a="category-create"][data-entity="${entity}"]`);if(b)b.click()}
 else if(e.key==="Enter"&&S.add&&e.target.tagName==="INPUT"){const b=document.querySelector('[data-a="add"]');if(b)b.click()}
 else if(e.key==="Enter"&&e.target.id==="en-nm"){const b=document.querySelector('[data-a="esave"]');if(b)b.click()}
});
document.addEventListener("input",e=>{
 if(e.target.id==="org-name")S.orgName=e.target.value;
 if(S.add&&S.addDraft){
  const fields={nm:"name",jd:"date",sl:"salary",wg:"wage"};
  const field=fields[e.target.id];
  if(field)S.addDraft[field]=e.target.value;
 }
 if(e.target.id==="q"){S.q=e.target.value;const l=document.getElementById("tl");if(l)l.innerHTML=listBody()}
});
// ---- Map videos modal actions
function mapRender(){
 const box=document.querySelector(".mb"),top=box?box.scrollTop:0,fid=document.activeElement&&document.activeElement.id;
 stopVideoPlayer("map-player");render();
 const nb=document.querySelector(".mb");if(nb)nb.scrollTop=top;
 if(fid){const el=document.getElementById(fid);if(el)el.focus({preventScroll:true})}
 if(S.mplay)playVideo(S.mplay,"map-player","map-player-status");
}
async function loadMapFolders(){
 try{
  const r=await fetch("/api/videos"),d=await r.json().catch(()=>({}));
  if(!r.ok||!Array.isArray(d.folders))throw new Error(d.error||"Could not load video folders.");
  S.folders=d.folders;S.mfstat=d.folders.length?"":"No videos available";
 }catch(err){S.mfstat="Unable to load folders";S.mmsg=err instanceof Error?err.message:String(err)}
 if(S.map)mapRender();
}
async function mapSend(business,key,folder){
 const r=await fetch("/api/video-map",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({business,key,folder})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||"Could not save the mapping.");
 S.vmap=d;
}
async function mapAction(a,b){
 if(a==="mapopen"){S.add=false;S.edit=false;S.modal=null;S.upload=false;S.video=false;stopVideoPlayer();
  S.map=true;S.mplay="";S.mmsg="";S.mfTouched=false;S.mfstat="Loading folders…";render();loadMap().then(()=>S.map&&mapRender());loadMapFolders();return}
 if(a==="mapcancel"){stopVideoPlayer("map-player");S.map=false;S.mplay="";return render()}
 if(a==="mapbiz"){S.mb=b.dataset.b;S.mt=null;S.mfTouched=false;S.mmsg="";S.mplay="";return mapRender()}
 if(a==="mapplay"){S.mplay=b.dataset.f;return mapRender()}
 if(a==="mapstop"){S.mplay="";return mapRender()}
 try{
  if(a==="mapsave"){if(S.mt==null||!S.mf)return;await mapSend(S.mb,mkey(S.mt),S.mf);S.mmsg="Saved ✓ "+ST[S.mt].n+" now plays "+S.mf;S.mfTouched=false}
  else if(a==="mapremove"){if(!confirm("Remove this video mapping?"))return;await mapSend(S.mb,b.dataset.k,null);S.mmsg="Mapping removed.";S.mfTouched=false;if(S.mplay&&!(S.vmap[S.mb]&&Object.values(S.vmap[S.mb]).includes(S.mplay)))S.mplay=""}
 }catch(err){S.mmsg=err instanceof Error?err.message:String(err)}
 mapRender();
}
async function restoreSession(){
 try{
  const response=await fetch("/api/session"),result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Your session expired. Please sign in again.");
  S.user=result.user;
  await loadOptions();
  await load();
  initView();render();loadMap();loadHier();
 }catch(error){
  await fetch("/api/logout",{method:"POST"}).catch(()=>{});
  S.user=null;S.t=[];S.loaded=false;
  S.loginmsg=error instanceof Error&&error.message!=="Sign in to continue."?error.message:"";
  renderLogin();
 }
}
restoreSession();

// ---- Light / dark theme toggle (button sits in the page header; choice is remembered in this browser)
const curTheme=()=>document.documentElement.dataset.theme||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
const SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function tbtn(){const d=curTheme()==="dark",l=d?"Switch to light theme":"Switch to dark theme";return `<button class="tt" type="button" data-a="theme" title="${l}" aria-label="${l}">${d?SUN:MOON}</button>`}
function toggleTheme(){const n=curTheme()==="dark"?"light":"dark";const h=document.documentElement;h.classList.add("tx");setTimeout(()=>h.classList.remove("tx"),500);
 h.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}render();
 document.querySelectorAll(".tt svg").forEach(v=>v.classList.add("spin"))}