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
// Business and department options are loaded from the database.
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
 const completedSteps=new Set(completed.map(g=>g.s));
 const modules=MODS.map((module,mi)=>{
  const steps=ST.map((step,i)=>({step,index:i})).filter(x=>x.step.m===mi);
  const moduleLogs=completed.filter(g=>stepFor(g).m===mi);
  return {
   name:module.n,
   plan:steps.reduce((sum,x)=>sum+x.step.mn,0),
   taken:moduleLogs.reduce((sum,g)=>sum+elapsed(g),0),
   completed:steps.filter(x=>completedSteps.has(x.index)).length,
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
 const completedPlan=completed.reduce((sum,g)=>sum+stepFor(g).mn,0);
 return {
  modules,byType,total,taken,completedCount:completedSteps.size,
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
  +tile("Total completed",`${stats.completedCount} / ${stats.steps}`,"Tasks completed")
  +tile("Total score",scoreText(t),scoreSub(t),"tot-sc")
  +`</div>`+modTable(stats,t)+`</div>`;
}
// ---- Module-wise: planned time vs time taken, completed count, score and remark
const modDone=(t,mi)=>ST.every((x,i)=>x.m!==mi||t.logs.some(g=>g.c&&g.s===i));
function modTable(stats,t){
 const rows=stats.modules.map((module,mi)=>{
  const sc=modScore(t,mi),rm=modRemark(t,mi),ok=modDone(t,mi);
  const scoreCell=sc!=null?`<b>${sc} / ${MAXSC}</b>`:ok&&allow("score")?`<button class="p sm" data-a="score" data-mi="${mi}">Add score</button>`:`<span class="lk">–</span>`;
  const remCell=sc!=null?`<div class="sp"><span>${rm?esc(rm):'<span class="lk">–</span>'}</span>${allow("score")?`<button class="sm" data-a="score" data-mi="${mi}">Edit</button>`:""}</div>`:`<span class="lk">–</span>`;
  return `<tr><td>${module.name}</td><td><b>${hm(module.plan)}</b></td><td><b>${hm(module.taken)}</b></td><td>${module.completed}/${module.steps}</td><td>${scoreCell}</td><td>${remCell}</td></tr>`}).join("");
 return `<h2 style="margin-top:22px">Module-wise summary</h2><div class="sc"><table><tr><th>Module</th><th>Total task time</th><th>Total time taken</th><th>Completed</th><th>Score (out of ${MAXSC})</th><th>Remark</th></tr>${rows}<tr><td><b>All modules</b></td><td><b>${hm(stats.total)}</b></td><td><b>${hm(stats.taken)}</b></td><td>${stats.completedCount}/${stats.steps}</td><td><b id="tot-sc-row">${scoreText(t)}</b></td><td></td></tr></table></div><div class="mu">Fixed time comes from the task sheet. Time taken counts only completed steps, from Start to Mark completed. Score and remark can be added once every step of a module is completed.</div>`;
}
// ---- Pop-up window asking for the module score and remark
function uploadModal(){
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div class="bd" data-a="uploadcancel"></div><div class="mb wide"><h2 id="upload-title">Upload video</h2><div class="mu">The server converts the video to HLS and uploads the playlist and segments.</div><form id="video-upload-form"><label class="fl">Video file<input id="video-file" name="video" type="file" accept="video/*" required></label><label class="fl">Parent folder<select id="video-parent-folder" name="parent_folder" required><option value="">Loading parent folders…</option></select></label><div id="parent-create-panel" hidden><label class="fl">New parent folder name<input id="new-parent-folder" type="text" placeholder="e.g. Marketing"></label><div class="row"><button type="button" data-a="parent-create-cancel">Cancel</button><button type="button" class="p" data-a="parent-create" id="parent-create-submit">Create parent folder</button></div></div><div id="parent-folder-status" class="mu" role="status" aria-live="polite"></div><label class="fl">Video folder inside parent<input id="video-folder" name="video_folder" type="text" placeholder="e.g. marketing-intro" required></label><div id="video-upload-status" class="mu upload-status" role="status" aria-live="polite"></div><div id="video-upload-progress" class="upload-progress" role="progressbar" aria-label="Video upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span class="upload-progress__bar"></span></div><div id="video-upload-meta" class="upload-meta" hidden><span id="video-upload-phase"></span><strong id="video-upload-pct">0%</strong></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="uploadcancel">Cancel</button><button class="p" type="submit" id="video-upload-submit">Convert and upload</button></div></form></div></div>`;
}
function traineeAccountModal(t){
 const done=S.accountDone;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="account-title"><div class="bd" data-a="accountcancel"></div><div class="mb"><h2 id="account-title">${done?"Login is ready":"Set trainee login"}</h2><div class="mu">Username: <b>${esc(t.name)}</b></div>${done?`<div class="mu" role="status" style="margin-top:12px">${esc(S.accountMsg)} Sign in with this name and the password you just set.</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button class="p" data-a="accountcancel">Done</button></div>`:`<div class="mu" style="margin:10px 0">Choose a password for this trainee. Use the trainee name above as the username.</div><label class="fl">New password<div class="pw-wrap"><input id="account-password" type="password" minlength="6" autocomplete="new-password" required>${passwordToggle("account-password")}</div></label><label class="fl">Type the password again<div class="pw-wrap"><input id="account-confirm" type="password" minlength="6" autocomplete="new-password" required>${passwordToggle("account-confirm")}</div></label><div class="lg-err" role="status" aria-live="polite">${esc(S.accountMsg)}</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="accountcancel">Cancel</button><button class="p" data-a="accountset">Save login</button></div>`}</div></div>`;
}
function replayRequestActions(stepIndex,request,isGate=false){
 if(request&&request.status==="approved"){
  return `<button type="button" class="p" data-a="replay-approved" data-id="${esc(request.id)}" data-step="${stepIndex}">Rewatch video</button>`;
 }
 if((request&&request.status==="pending")||S.videoReplayRequested)return"";
 if(!isGate&&!S.videoWatchSaved)return"";
 if(isGate&&(S.replayGateMsg||S.videoCompletionError))return"";
 if(S.replayRequestConfirmStep===stepIndex){
  return `<div class="replay-confirm" role="group" aria-label="Confirm video replay request"><span>Send a rewatch request to your business HR?</span><button type="button" class="p" data-a="replay-request-send" data-step="${stepIndex}">Send request</button><button type="button" data-a="replay-request-cancel">Cancel</button></div>`;
 }
 return `<button type="button" class="p" data-a="replay-request-confirm" data-step="${stepIndex}">Request replay</button>`;
}
function videoModal(){
 if(S.user.role==="trainee"&&S.videoStep!=null){
  const step=ST[S.videoStep];
  const request=(S.videoReplayRequests||[]).find(item=>item.step_index===S.videoStep);
  const replayStatus=(request&&request.status==="pending")||S.videoReplayRequested?"Your rewatch request is waiting for business HR approval.":request&&request.status==="approved"?"Business HR approved another viewing.":S.videoWatchSaved?"Video finished.":"Saving video completion…";
  const videoDisabled=S.videoFinished?"disabled":"",finishedHidden=S.videoFinished?"":"hidden";
  return `<div class="trainee-video-screen" id="trainee-video-shell" role="dialog" aria-modal="true" aria-labelledby="video-title"><header class="trainee-video-heading"><h1 id="video-title">${esc(step.n)}</h1><span>Training video · ${esc(MODS[step.m].n)}</span></header><video id="video-player" class="trainee-video-player" aria-labelledby="video-title" playsinline preload="auto"${S.videoAutoplay?" autoplay":""}></video><div id="video-player-status" class="trainee-video-status" role="status" aria-live="polite">Loading video…</div><div class="trainee-video-controls"><button type="button" class="video-control p" data-a="trainee-video-toggle" id="trainee-video-toggle" aria-label="Play video" title="Play video" ${videoDisabled}>${VIDEO_ICONS.play}</button><button type="button" class="video-control" data-a="trainee-video-rewind" aria-label="Rewind 10 seconds" title="Rewind 10 seconds" ${videoDisabled}>${VIDEO_ICONS.rewind}</button><button type="button" class="video-control" data-a="trainee-video-return" id="trainee-video-return" aria-label="Return to where you first rewound" title="Return to where you first rewound" ${videoDisabled} hidden>${VIDEO_ICONS.return}</button><button type="button" class="video-control" data-a="trainee-video-fullscreen" id="trainee-video-fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen" ${videoDisabled}>${VIDEO_ICONS.fullscreen}</button></div><section class="trainee-video-finished" id="trainee-video-finished" ${finishedHidden}><b>Video finished</b><div id="video-replay-status" class="trainee-video-status" role="status" aria-live="polite">${esc(replayStatus)}</div>${replayRequestActions(S.videoStep,request)}<button type="button" data-a="trainee-video-continue">Continue</button></section></div>`;
 }
 if(S.user.role==="trainee"&&S.replayGateStep!=null){
   const step=ST[S.replayGateStep],request=(S.videoReplayRequests||[]).find(item=>item.step_index===S.replayGateStep);
   const approved=request&&request.status==="approved",pending=request&&request.status==="pending";
   const checking=S.replayGateMsg==="Checking HR approval…";
   return `<div class="trainee-video-screen" id="trainee-video-shell" role="dialog" aria-modal="true" aria-labelledby="video-title"><header class="trainee-video-heading"><h1 id="video-title">${esc(step.n)}</h1><span>${S.videoCompletionError?"Unable to check whether this video was completed.":"This video has already been completed."}</span></header><div class="replay-gate-message" id="video-replay-status" role="status" aria-live="polite">${approved?"Business HR approved another viewing.":pending?"Your rewatch request is waiting for business HR approval.":esc(S.videoCompletionError||S.replayGateMsg||"Request another viewing from your business HR.")}</div>${replayRequestActions(S.replayGateStep,request,true)}<button type="button" data-a="replay-gate-close">${checking?"Cancel":"Back to training"}</button></div>`;
 }
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="video-title"><div class="bd" data-a="videocancel"></div><div class="mb wide"><h2 id="video-title">Watch video</h2><label class="fl">Video folder<select id="video-library-folder"><option value="">Loading folders…</option></select></label><div id="video-player-status" class="mu video-player-status" role="status" aria-live="polite"></div><video id="video-player" class="video-player" controls playsinline preload="metadata" hidden></video><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="videocancel">Close</button></div></div></div>`;
}
function replayRequestsModal(){
 const rows=(S.replayInboxData||[]).map(item=>{
  const trainee=S.t.find(record=>record.id===item.trainee_id),step=ST[item.step_index];
  const status=item.status==="approved"?"Approved":item.status==="declined"?"Declined":item.status==="used"?"Replay used":"Pending";
  return `<article class="replay-request"><div><b>${esc(trainee?trainee.name:"Trainee")}</b><div class="mu">${esc(step?step.n:"Video task")} · Requested ${fmt(item.created_at)}</div><span class="chip ${item.status==="pending"?"s-rdy":item.status==="approved"?"ok":"s-locked"}">${status}</span></div>${item.status==="pending"?`<div class="row"><button type="button" data-a="replay-decision" data-id="${esc(item.id)}" data-status="declined">Decline</button><button type="button" class="p" data-a="replay-decision" data-id="${esc(item.id)}" data-status="approved">Approve</button></div>`:""}</article>`;
 }).join("");
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="replay-inbox-title"><div class="bd" data-a="replay-inbox-close"></div><div class="mb wide"><h2 id="replay-inbox-title">Video replay requests</h2><div class="mu" role="status">${esc(S.replayInboxMsg||"")}</div>${rows||(!S.replayInboxMsg?"<div class=\"mu\">No replay requests yet.</div>":"")}<div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="replay-inbox-close">Close</button></div></div></div>`;
}
function mapModal(){
 const vs=mvideos(S.mm);
 if(S.mt==null||!vs.some(o=>o.i===S.mt))S.mt=vs.length?vs[0].i:null;
 if(S.mt!=null&&!S.mfTouched)S.mf=vfolder("",S.mt);
 const mapped=S.vmap["*"]||Object.values(S.vmap)[0]||{};
 const rows=Object.entries(mapped).map(([k,f])=>{const i=ST.findIndex((_,j)=>mkey(j)===k);return{k,f,i}}).sort((a,b)=>(a.i<0?9999:a.i)-(b.i<0?9999:b.i)).map(r=>{
  const x=r.i>=0?ST[r.i]:null,title=x?x.n:r.k.split("|").slice(1).join("|"),mod=x?MODS[x.m].n.split(" · ")[0]:"–";
  return `<tr><td>${r.i>=0?r.i+1:"–"}</td><td>${esc(mod)}</td><td>${esc(title)}</td><td>${esc(r.f)}</td><td><div class="map-act"><button type="button" class="sm" data-a="mapplay" data-f="${esc(r.f)}">▶ Play</button><button type="button" class="sm dgr" data-a="mapremove" data-k="${esc(r.k)}">Remove</button></div></td></tr>`}).join("");
 const folders=S.mf&&!S.folders.includes(S.mf)?[S.mf,...S.folders]:S.folders;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="map-title"><div class="bd" data-a="mapcancel"></div><div class="mb wide"><h2 id="map-title">Map videos to tasks</h2><div class="mu" style="margin:10px 0 14px">Choose a module and task, then select the shared video folder for all businesses.</div>
 <label class="fl">Module<select id="map-module">${MODS.map((m,i)=>`<option value="${i}"${i===S.mm?" selected":""}>${esc(m.n)}</option>`).join("")}</select></label>
 <label class="fl">Task<select id="map-task"${vs.length?"":" disabled"}>${vs.length?vs.map(o=>`<option value="${o.i}"${o.i===S.mt?" selected":""}>${o.i+1}. [VIDEO] ${esc(o.x.n)}${vfolder("",o.i)?" ✓ mapped":""}</option>`).join(""):'<option>No video tasks in this module</option>'}</select></label>
 <label class="fl">Video (playing location)<select id="map-folder"><option value="">${S.mfstat?esc(S.mfstat):"Select a video folder"}</option>${folders.map(f=>`<option value="${esc(f)}"${f===S.mf?" selected":""}>${esc(f)}</option>`).join("")}</select></label>
 <div id="map-msg" class="mu" role="status" aria-live="polite" style="min-height:1.4em;margin-top:8px">${esc(S.mmsg)}</div>
 <div class="row" style="margin-top:8px;justify-content:flex-end"><button type="button" data-a="mapcancel">Close</button><button type="button" class="p" data-a="mapsave"${S.mt!=null&&S.mf?"":" disabled"}>Save mapping</button></div>
 <h2 style="margin:22px 0 6px;font-size:1.25rem">Mapped for all businesses</h2>
 ${S.mplay?`<div id="map-player-status" class="mu video-player-status" role="status" aria-live="polite"></div><video id="map-player" class="video-player" controls playsinline preload="metadata" hidden></video><div class="row" style="margin:8px 0 12px;justify-content:flex-end"><button type="button" class="sm" data-a="mapstop">Close player</button></div>`:""}
 ${rows?`<div class="sc"><table><tr><th>#</th><th>Module</th><th>Task</th><th>Video folder</th><th></th></tr>${rows}</table></div>`:'<div class="mu">No videos mapped yet.</div>'}
 </div></div>`;
}
function modal(t){
 if(S.permissions)return permissionsModal();
 if(S.replayInbox)return replayRequestsModal();
 if(S.userManagement)return userManagementModal();
 if(S.userListModal)return managedUsersModal();
 if(S.settings)return settingsModal();
 if(S.userModal)return userModal();
 if(S.organization)return organizationModal();
 if(S.map)return mapModal();
 if(S.upload)return uploadModal();
 if(S.video)return videoModal();
 if(S.accountModal)return traineeAccountModal(t);
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
let S={t:[],sel:null,upload:false,video:false,videoStep:null,videoAutoplay:false,replayGateStep:null,replayGateMsg:"",replayRequestConfirmStep:null,completedVideoSteps:[],videoReplayRequests:[],videoCompletionError:"",videoFinished:false,videoWatchSaved:false,videoReplayRequested:false,videoReturnAt:null,videoLatestTime:0,videoSeekTarget:null,hls:null,view:"overview",bv:"overview",nav:"dashboard",map:false,replayInbox:false,replayInboxData:[],replayInboxMsg:"",pendingReplayCount:0,userListModal:false,managedUsers:[],usersLoading:false,usersMsg:"",userSearch:"",userReturnToList:false,settings:false,userManagement:false,userModal:false,userDraft:null,userMsg:"",organization:false,permissions:false,permissionDraft:null,permissionMsg:"",accountModal:false,accountDone:false,accountMsg:"",orgEntity:"business",orgParent:"",orgName:"",orgMsg:"",vmap:{},folders:[],mb:"Magnus",mm:0,mt:null,mf:"",mplay:"",mmsg:"",mfstat:"",himg:{},hmsg:{},hzoom:{},hpdf:{},user:null,options:{businesses:[],departments:[],designations:[]},addBiz:"",addDept:"",addDesg:"",addmsg:"",loginmsg:""};
let activeVideoUpload=null,replayNotificationTimer=null;
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
const canReviewReplays=()=>!!(S.user&&S.user.role==="business_hr"&&allow("replay"));
const canAddTrainee=()=>!!(allow("add")&&S.user&&["developer","business","business_hr"].includes(S.user.role));
const ALLBIZ=u=>u.role==="developer"||(u.role==="business_hr"&&!u.business_id);
const vbiz=()=>{const u=S.user;if(!u||u.role==="trainee")return[];if(ALLBIZ(u))return BIZ;return u.business&&u.business.name?[u.business.name]:[]};
const isOwn=t=>!!(S.user&&S.user.trainee_id===t.id);
const inScope=t=>{const u=S.user;if(!u)return false;
 if(ALLBIZ(u))return true;
 if(u.role==="business"||u.role==="business_hr"||u.role==="business_view")return vbiz().includes(biz(t))
  &&(!u.department||u.department.name===t.dept);
 if(u.role==="trainee")return isOwn(t);
 return false};
const scoped=()=>S.t.filter(inScope);
const ownRec=()=>S.t.find(isOwn)||null;
const oneBiz=()=>vbiz().length===1;
const roleLabel=()=>S.user?(ROLE_LABELS[S.user.role]||S.user.role):"";
const scopeLabel=()=>{const u=S.user;if(!u)return"";if(ALLBIZ(u))return"All businesses";
 if(u.business&&u.business.name)return [u.business.name,u.department&&u.department.name].filter(Boolean).join(" · ");
 return""};
const initView=()=>{S.sel=null;S.vm=null;S.q="";S.bv="overview";S.nav="dashboard";S.modal=null;S.edit=false;S.add=false;S.accountModal=false;S.accountDone=false;S.accountMsg="";S.upload=false;S.video=false;S.videoStep=null;S.replayGateStep=null;S.replayGateMsg="";S.replayRequestConfirmStep=null;S.completedVideoSteps=[];S.videoReplayRequests=[];S.videoCompletionError="";S.videoFinished=false;S.videoWatchSaved=false;S.videoReplayRequested=false;S.videoReturnAt=null;S.videoLatestTime=0;S.videoSeekTarget=null;S.map=false;S.replayInbox=false;S.replayInboxData=[];S.replayInboxMsg="";S.pendingReplayCount=0;S.settings=false;S.userManagement=false;S.userModal=false;S.userListModal=false;S.userDraft=null;S.userMsg="";S.managedUsers=[];S.usersLoading=false;S.usersMsg="";S.userSearch="";S.userReturnToList=false;S.organization=false;S.permissions=false;S.permissionDraft=null;S.view=oneBiz()?vbiz()[0]:"overview"};
async function login(username,password){
 const response=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Could not sign in.");
 S.user=result.user;
 S.loginmsg="";
 await loadOptions();
 await load();
 initView();
 if(S.user.role==="trainee")await loadVideoCompletions();
 if(S.user.role==="trainee"||S.user.role==="business_hr")await loadReplayRequests();
 render();
 loadMap();loadHier();
 startReplayNotificationPolling();
}
function logout(){
 if(replayNotificationTimer!==null){clearInterval(replayNotificationTimer);replayNotificationTimer=null}
 stopVideoPlayer();stopVideoPlayer("map-player");
 fetch("/api/logout",{method:"POST"}).catch(()=>{});
 S.user=null;S.t=[];S.loaded=false;initView();render();
}
function renderLogin(){
 const ap=document.getElementById("app");S.lv=null;
 if(ap.querySelector(".lgn"))return; // keep what the person has typed
 ap.classList.remove("an");
 ap.innerHTML=`<div class="lgn"><form class="card lgc" id="login-form"><div class="bk"><div class="lg">M</div><div><div class="brand">Magnus</div><div class="mu">Trainee Tracker</div></div></div><div><h1>Sign in</h1><div class="mu" style="margin-top:4px">Trainees use their name as username; admins may use email.</div></div><label class="fl">Username or email<input id="lg-username" name="username" autocomplete="username" required></label><label class="fl">Password<div class="pw-wrap"><input id="lg-p" name="password" type="password" autocomplete="current-password" required>${passwordToggle("lg-p")}</div></label><div id="lg-e" class="lg-err" role="alert" aria-live="polite">${esc(S.loginmsg)}</div><button class="p" type="submit">Sign in</button></form></div>`;
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
document.addEventListener("input",e=>{
 if(!S.addDraft)return;
 const fields={nm:"name",tp:"password",jd:"date",sl:"salary",wg:"wage"};
 if(fields[e.target.id])S.addDraft[fields[e.target.id]]=e.target.value;
});
// ---- Video map: shared across businesses, keyed by "moduleIndex|task title"
const mkey=i=>ST[i].m+"|"+ST[i].n;
const vfolder=(b,i)=>((S.vmap["*"]||S.vmap[b]||Object.values(S.vmap)[0]||{}))[mkey(i)]||"";
const mvideos=mi=>ST.map((x,i)=>({x,i})).filter(o=>o.x.m===mi&&o.x.t==="VIDEO");
const loadMap=()=>fetch("/api/video-map").then(r=>r.json()).then(d=>{if(d&&typeof d==="object"&&!d.error)S.vmap=d}).catch(()=>{});
const loadOptions=()=>fetch("/api/options").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load organization options.");S.options=d;BUSINESSES.splice(0,BUSINESSES.length,...d.businesses.map(x=>x.name));DEPTS.splice(0,DEPTS.length,...[...new Set(d.departments.map(x=>x.name))])});
const load=()=>fetch("/api/trainees").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load trainees.");if(!Array.isArray(d))throw new Error("The server returned invalid trainee data.");S.t=d;S.loaded=true});
const save=()=>{
 if(!S.loaded)return Promise.resolve();
 const body=JSON.stringify(S.t);
 S.t.forEach(trainee=>{delete trainee.account_password});
 return fetch("/api/trainees",{method:"PUT",headers:{"Content-Type":"application/json"},body}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not save trainee data.");return d}).catch(error=>{alert(error instanceof Error?error.message:String(error));return load().then(render).catch(loadError=>alert(loadError instanceof Error?loadError.message:String(loadError)))});
};
async function setTraineeLogin(t){
 const password=document.getElementById("account-password").value;
 const confirmation=document.getElementById("account-confirm").value;
 if(password.length<6){S.accountMsg="Password must be at least 6 characters.";render();return}
 if(password!==confirmation){S.accountMsg="The passwords do not match.";render();return}
 try{
  const response=await fetch(`/api/trainees/${encodeURIComponent(t.id)}/account`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not set the trainee login.");
  S.accountDone=true;S.accountMsg="The trainee login was saved.";
 }catch(error){S.accountMsg=error instanceof Error?error.message:String(error)}
 render();
}
const now=()=>new Date().toISOString();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const EYE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4-.8"/></svg>';
const VIDEO_ICONS={
 play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
 pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>',
 rewind:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/><path d="M12 8v8m0-8-2 2m2-2 2 2"/></svg>',
 return:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-2"/></svg>',
 fullscreen:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
 exitFullscreen:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5"/></svg>'
};
const passwordToggle=id=>`<button class="pw-toggle" type="button" data-a="password-toggle" data-target="${id}" aria-label="Show password" title="Show password">${EYE}</button>`;
const fmt=i=>i?new Date(i).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):"–";
const took=(a,b)=>{if(!a||!b)return"–";const m=Math.round((new Date(b)-new Date(a))/60000);return m>=60?Math.floor(m/60)+" h "+m%60+" m":m+" m"};
const done=t=>t.logs.filter(l=>l.c).length;
const cur=t=>{
 const l=t.logs[t.logs.length-1];
 if(!l.c)return l;
 return l.s+1<ST.length?{s:l.s+1,a:l.c,_pending:true}:null;
};
const needsPdf=x=>x.t==="PRE"||(x.t==="TASK"&&/presentation/i.test(x.n));
const PDFMAX=25*1024*1024;
const pdfSize=b=>b>=1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB";
const pdfLink=(t,l)=>`<a class="pdf-link" href="/api/presentations/${t.id}/${l.s}" target="_blank" rel="noopener">${esc(l.pdf.n)}</a>`;
const pdfUi=(t,l)=>l.pdf
 ?`<div class="pdf-box"><span class="pdf-ico">PDF</span><div class="pdf-meta">${pdfLink(t,l)}<div class="mu">${pdfSize(l.pdf.sz)} · uploaded ${fmt(l.pdf.at)}</div></div><label class="pdf-replace">Replace<input type="file" id="pdf-file" accept="application/pdf,.pdf" hidden></label></div><div id="pdf-status" class="mu" role="status"></div>`
 :`<div class="pdf-box pdf-empty"><div class="pdf-meta"><b>Upload your presentation (PDF)</b><div class="mu">PDF files only · up to 25 MB</div></div><input type="file" id="pdf-file" accept="application/pdf,.pdf"></div><div id="pdf-status" class="mu" role="status"></div>`;
const waiting=t=>{const g=t.logs[t.logs.length-1];return g.c&&g.s+1<ST.length?g.s+1:null};
const seg=t=>'<div class="seg">'+MODS.map((m,mi)=>{const a=ST.filter(x=>x.m===mi),n=a.filter(x=>t.logs.some(g=>g.c&&g.s===ST.indexOf(x))).length;return `<i title="${m.n}"><b style="width:${n/a.length*100}%"></b></i>`}).join("")+'</div>';
const inr=v=>v?"₹"+Number(v).toLocaleString("en-IN"):"–";
const jd=v=>v?new Date(v+"T00:00").toLocaleDateString([],{dateStyle:"medium"}):"–";
const info=t=>[["Department",esc(t.dept)],["Designation",esc(t.desg||"–")],["Joining date",jd(t.join)],["Salary / month",inr(t.sal)],["Wage / day",inr(t.wage)]].filter(x=>allow("salary")||!/^(Salary|Wage)/.test(x[0]));
const vmod=t=>{const next=waiting(t),sm=Math.max(...t.logs.map(q=>ST[q.s].m),next==null?0:ST[next].m);return[S.vm==null?sm:Math.max(0,Math.min(S.vm,sm)),sm]};
const mshort=i=>MODS[ST[i].m].n.split(" · ")[0];
const status=t=>{const l=cur(t);return !l?(waiting(t)!=null?["Ready for next task","s-rdy"]:["Completed","ok s-done"]):l.st?["In progress","s-prog"]:["Assigned – not started","s-asg"]};

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
 tmp.innerHTML=`<div class="shell">${side(t)}<main class="mn">${topbar()}${t?detail(t):list()}</main></div>`+modal(t);
 const oldVideoScreen=ap.querySelector(":scope > .trainee-video-screen"),newVideoScreen=tmp.querySelector(":scope > .trainee-video-screen");
 if(oldVideoScreen&&newVideoScreen){
  ap.querySelector(":scope > .shell").replaceWith(tmp.querySelector(":scope > .shell"));
  oldVideoScreen.className=newVideoScreen.className;
  oldVideoScreen.innerHTML=newVideoScreen.innerHTML;
  oldVideoScreen.setAttribute("aria-labelledby",newVideoScreen.getAttribute("aria-labelledby"));
 }else{
 const oldOv=ap.querySelector(":scope > .ov"),newOv=tmp.querySelector(":scope > .ov"),oldMb=oldOv&&oldOv.querySelector(".mb"),newMb=newOv&&newOv.querySelector(".mb");
 if(oldMb&&newMb&&oldOv.getAttribute("aria-labelledby")===newOv.getAttribute("aria-labelledby")){
  const bx=oldMb.scrollTop;
  ap.querySelector(":scope > .shell").replaceWith(tmp.querySelector(":scope > .shell")); // pop-up node is never detached, so its animation cannot restart
  oldMb.className=newMb.className;oldMb.innerHTML=newMb.innerHTML;oldMb.scrollTop=bx;
 }else ap.replaceChildren(...tmp.childNodes);
 }
 if(viewChanged){S.lv=vk;ap.classList.remove("an");void ap.offsetWidth;ap.classList.add("an");clearTimeout(S.antm);S.antm=setTimeout(()=>ap.classList.remove("an"),1400)}
 mountHierarchyPdfs(ap);
 if(S.add){const i=document.getElementById("nm");if(i)i.focus()}
 else if(t&&(S.modal!=null||S.edit)){const i=document.getElementById(S.edit?"en-nm":"ms-sc");if(i){i.focus();if(S.edit)i.select()}}
}
// ---- Left sidebar (dashboard layout)
function topbar(){
 const showSearch=!(S.nav==="dashboard"&&!S.sel&&S.view==="overview");
 const name=S.user.full_name||roleLabel(),initial=String(name).trim().slice(0,1).toUpperCase();
 const replayNotifications=canReviewReplays(),pending=S.pendingReplayCount||0;
 const notificationButton=`<button type="button" class="bell"${replayNotifications?' data-a="replay-inbox-open"':""} aria-label="${replayNotifications?`${pending} pending video replay requests`:"Notifications"}" title="${replayNotifications?"Video replay requests":"Notifications"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>${replayNotifications&&pending?`<span class="bell-count" aria-hidden="true">${pending>99?"99+":pending}</span>`:""}</button>`;
 return `<header class="topbar">${showSearch?`<label class="top-search"><span aria-hidden="true">⌕</span><input id="q" type="search" value="${esc(S.q||"")}" placeholder="Search trainees, departments, designations…" aria-label="Search trainees" autocomplete="off"></label>`:""}<div class="top-actions">${notificationButton}<details class="profile-menu"><summary class="top-profile"><span class="avatar">${esc(initial||"U")}</span><div><b>${esc(name)}</b><span>${esc(roleLabel())}</span></div><span class="profile-caret" aria-hidden="true">⌄</span></summary><div class="profile-dropdown">${allow("csv")?'<button type="button" data-a="csv"><span>Export CSV</span></button>':""}<button type="button" data-a="theme"><span>Toggle theme</span></button><button type="button" data-a="logout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg><span>Logout</span></button></div></details></div></header>`;
}
function side(t){
 const brand=`<div class="bk"><div class="lg">M</div><div><div class="brand">Magnus</div><div class="mu">Trainee Tracker</div></div></div>`;
 const navButton=(key,icon,label)=>`<button type="button" class="nav-link${S.nav===key?" active":""}" data-a="nav-${key}"><span class="nav-ico" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
 const mediaButton=(permission,action,icon,label)=>allow(permission)?`<button type="button" class="nav-link" data-a="${action}"><span class="nav-ico" aria-hidden="true">${icon}</span><span>${label}</span></button>`:"";
 const media=[mediaButton("upload","uploadopen","↑","Upload video"),S.user.role==="trainee"?"":mediaButton("watch","videoopen","▷","Watch video"),mediaButton("map","mapopen","↗","Map videos"),canReviewReplays()?'<button type="button" class="nav-link" data-a="replay-inbox-open"><span class="nav-ico" aria-hidden="true">↻</span><span>Replay requests</span></button>':""].filter(Boolean).join("");
 const detailTools=t?`<div class="side-section"><div class="side-label">Trainee</div>${S.user.role==="trainee"?"":'<button type="button" class="nav-link" data-a="back"><span class="nav-ico" aria-hidden="true">‹</span><span>All trainees</span></button>'}${allow("ename")?'<button type="button" class="nav-link" data-a="ename"><span class="nav-ico" aria-hidden="true">✎</span><span>Edit name</span></button>':""}${canAddTrainee()?'<button type="button" class="nav-link" data-a="accountopen"><span class="nav-ico" aria-hidden="true">🔑</span><span>Set login password</span></button>':""}${allow("del")?`<button type="button" class="nav-link danger-link" data-a="del" data-id="${t.id}"><span class="nav-ico" aria-hidden="true">×</span><span>Remove trainee</span></button>`:""}</div>`:"";
 return `<aside class="sb">${brand}<nav class="side-nav" aria-label="Main navigation"><div class="side-section"><div class="side-label">Navigation</div>${navButton("dashboard","▦","Dashboard")}<button type="button" class="nav-link${S.settings?" active":""}" data-a="settings-open"><span class="nav-ico" aria-hidden="true">⚙</span><span>Settings</span></button></div>${detailTools}${media?`<div class="side-section"><div class="side-label">Media</div>${media}</div>`:""}</nav><div class="sidebar-bottom"><div class="side-foot"><div class="side-brand"><span>DATA ANALYST TEAM</span><b>MAGNUS</b></div></div></aside>`;
}
// ---- Trainee cards, filtered by the search box (name, department, designation)
const filtered=()=>{const q=(S.q||"").trim().toLowerCase();return scoped().filter(t=>(S.view==="overview"||biz(t)===S.view)&&[t.name,t.dept,t.desg,biz(t)].some(v=>String(v||"").toLowerCase().includes(q)))};
const addDepts=(business=S.addBiz)=>{const org=S.options.businesses.find(x=>x.name===business);return S.options.departments.filter(x=>org&&x.business_id===org.id).filter((item,index,items)=>items.findIndex(other=>other.name===item.name)===index)};
const addDesignations=()=>{const departments=addDepts().filter(x=>x.name===S.addDept),departmentIds=new Set(departments.map(x=>x.id));return S.options.designations.filter(x=>departmentIds.has(x.department_id)).filter((item,index,items)=>items.findIndex(other=>other.title===item.title)===index)};
const canManageOrganization=()=>!!(S.user&&S.user.role==="developer");
const addOrgOption=entity=>canManageOrganization()?`<option value="__add_${entity}__">＋ Add ${entity}</option>`:"";
const addSelectOptions=(items,selected,value,label,emptyLabel,entity)=>{
 const placeholder=items.length?"":`<option value="" selected disabled>${emptyLabel}</option>`;
 return placeholder+items.map(item=>`<option value="${esc(value(item))}"${value(item)===selected?" selected":""}>${esc(label(item))}</option>`).join("")+addOrgOption(entity);
};
const addCategoryPanel=entity=>`<div id="add-category-${entity}" data-add-category-panel="${entity}" hidden><label class="fl">New ${entity} name<input id="add-category-name-${entity}" maxlength="120" placeholder="Enter ${entity} name"></label><div id="add-category-status-${entity}" class="lg-err" role="status"></div><div class="row"><button type="button" data-a="category-cancel" data-entity="${entity}">Cancel</button><button type="button" class="p" data-a="category-create" data-entity="${entity}">Add ${entity}</button></div></div>`;
const addDepartmentParent=()=>{const business=S.options.businesses.find(x=>x.name===S.addBiz);return business?business.id:""};
const addDesignationParent=()=>{const department=addDepts().find(x=>x.name===S.addDept);return department?department.id:""};
const organizationParents=entity=>{
 if(entity==="department")return S.options.businesses.map(x=>({id:x.id,label:x.name}));
 if(entity==="designation")return S.options.departments.map(department=>{
  const business=S.options.businesses.find(x=>x.id===department.business_id);
  return{id:department.id,label:[business&&business.name,department.name].filter(Boolean).join(" · ")};
 });
 return[];
};
function openOrganization(entity,parentId=""){
 if(!canManageOrganization())return;
 S.settings=false;S.organization=true;S.orgEntity=entity;S.orgParent=parentId||(organizationParents(entity)[0]||{}).id||"";S.orgName="";S.orgMsg="";render();
}
function organizationModal(){
 const labels={business:"Business",department:"Department",designation:"Designation"};
 const parents=organizationParents(S.orgEntity);
 const parent=S.orgEntity==="business"?"":`<label class="fl">Under<select id="org-parent">${parents.map(x=>`<option value="${esc(x.id)}"${x.id===S.orgParent?" selected":""}>${esc(x.label)}</option>`).join("")}</select></label>`;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="org-title"><div class="bd" data-a="orgclose"></div><div class="mb"><h2 id="org-title">Manage organization</h2><label class="fl">Record type<select id="org-entity">${Object.entries(labels).map(([key,label])=>`<option value="${key}"${key===S.orgEntity?" selected":""}>${label}</option>`).join("")}</select></label>${parent}<label class="fl">${labels[S.orgEntity]} name<input id="org-name" value="${esc(S.orgName)}" maxlength="120"></label><div class="lg-err" role="status">${esc(S.orgMsg)}</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="orgclose">Back to settings</button><button type="button" class="p" data-a="orgcreate"${S.orgEntity!=="business"&&!parents.length?" disabled":""}>Create ${labels[S.orgEntity]}</button></div></div></div>`;
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
    if(entity==="business"){S.addBiz=name;S.addDept="";S.addDesg=""}
    if(entity==="department"){
     const business=S.options.businesses.find(x=>x.id===parentId);
     S.addBiz=business?business.name:S.addBiz;S.addDept=name;S.addDesg="";
    }
    if(entity==="designation")S.addDesg=name;
   }
  }catch(error){S.orgMsg+=` The record was created, but organization options could not refresh: ${error instanceof Error?error.message:String(error)}`}
 }catch(error){S.orgMsg=error instanceof Error?error.message:String(error)}
 render();
}
function permissionsModal(){
 if(!S.user||S.user.role!=="developer")return "";
 const draft=S.permissionDraft||ROLE_PERMS,roles=Object.keys(ROLE_PERMS);
 const header=roles.map(role=>`<th>${esc(ROLE_LABELS[role]||role)}</th>`).join("");
 const rows=Object.entries(PERM_LABELS).map(([permission,label])=>`<tr><td>${esc(label)}</td>${roles.map(role=>`<td style="text-align:center"><input type="checkbox" class="permission-toggle" data-role="${esc(role)}" data-permission="${esc(permission)}"${draft[role]&&draft[role][permission]?" checked":""}${role==="developer"?" disabled":""} aria-label="${esc(label+" — "+(ROLE_LABELS[role]||role))}"></td>`).join("")}</tr>`).join("");
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="permissions-title"><div class="bd" data-a="permissions-close"></div><div class="mb wide acc"><h2 id="permissions-title">Role permissions</h2><div class="mu">Choose which actions are shown for each existing role. Developer permissions stay enabled.</div><div class="sc"><table><tr><th>Permission</th>${header}</tr>${rows}</table></div><div class="mu" role="status">${esc(S.permissionMsg||"")}</div><div class="mu" style="margin-top:8px">These switches control the app interface only; Supabase and API policies still enforce server-side access. Save applies on this browser. Download config.js and deploy it to share the settings with everyone.</div><div class="row" style="margin-top:14px;justify-content:flex-end"><button type="button" data-a="permissions-close">Close</button><button type="button" data-a="permissions-download">Download config.js</button><button type="button" class="p" data-a="permissions-save">Save permissions</button></div></div></div>`;
}
const canManageUsers=()=>!!(S.user&&["developer","business","business_hr","business_view"].includes(S.user.role));
function settingsModal(){
 const organization=canManageOrganization()?'<button type="button" class="settings-action" data-a="orgopen"><span>Manage organization</span><small>Businesses, departments and designations</small></button>':"";
 const userManagementDescription=S.user.role==="developer"?"Add and manage users, trainees, roles, and permissions":"Add and manage user accounts";
 const userManagement=canManageUsers()||canAddTrainee()?`<button type="button" class="settings-action" data-a="user-management-open"><span>User management</span><small>${userManagementDescription}</small></button>`:"";
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="bd" data-a="settings-close"></div><div class="mb settings-modal"><h2 id="settings-title">Settings</h2><div class="mu">Manage your workspace preferences.</div><div class="settings-actions">${organization}${userManagement}<button type="button" class="settings-action" data-a="theme"><span>Appearance</span><small>Switch between light and dark theme</small></button></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="settings-close">Close</button></div></div></div>`;
}
function userManagementModal(){
 if(!canManageUsers()&&!canAddTrainee())return "";
 const trainee=canAddTrainee()?'<button type="button" class="settings-action" data-a="settings-addtrainee"><span>Add trainee</span><small>Create a trainee login inside a business</small></button>':"";
 const user=canManageUsers()?'<button type="button" class="settings-action" data-a="useropen"><span>Add user</span><small>Create a sign-in account for staff</small></button>':"";
 const manageUsers=canManageUsers()?'<button type="button" class="settings-action" data-a="managed-users-open"><span>Manage users</span><small>View, edit, or remove user accounts</small></button>':"";
 const permissions=S.user.role==="developer"?'<button type="button" class="settings-action" data-a="permissions-open"><span>Roles &amp; permission</span><small>Choose which actions are available for each role</small></button>':"";
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="user-management-title"><div class="bd" data-a="user-management-close"></div><div class="mb settings-modal"><h2 id="user-management-title">User management</h2><div class="mu">Manage user accounts and access.</div><div class="settings-actions">${trainee}${user}${manageUsers}${permissions}</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="user-management-close">Back to settings</button></div></div></div>`;
}
function openUserModal(){
 if(!canManageUsers())return;
 const scopedBusiness=S.user.role==="business"||((S.user.role==="business_hr"||S.user.role==="business_view")&&S.user.business_id);
 const own=scopedBusiness?((S.user.business||{}).id||S.user.business_id||""):((S.options.businesses[0]||{}).id||"");
 S.settings=false;S.userManagement=false;S.userModal=true;S.userMsg="";
 S.userDraft={username:"",password:"",role:"business_view",business_id:own};
}
function userModal(){
 const d=S.userDraft||{},dev=S.user.role==="developer",businessView=S.user.role==="business_view";
 const chooseBusiness=dev||(S.user.role==="business_hr"&&!S.user.business_id);
 const roles=dev?["developer","business","business_hr","business_view"]:businessView?["business_view"]:["business","business_hr","business_view"];
 const needsBiz=d.role!=="developer";
 const editing=!!d.id,self=editing&&d.id===S.user.id;
 const bizOptions=dev&&!editing&&d.role==="business_hr"?`<option value="all"${d.business_id==="all"?" selected":""}>All businesses</option>`:"";
 const bizField=!needsBiz?"":chooseBusiness?`<label class="fl">Business<select id="u-biz">${bizOptions}${S.options.businesses.map(x=>`<option value="${esc(x.id)}"${x.id===d.business_id?" selected":""}>${esc(x.name)}</option>`).join("")}</select></label>`:`<div class="mu">New users are added to ${esc((S.user.business||{}).name||"your business")}.</div>`;
 const roleOptions=roles.map(r=>`<option value="${esc(r)}"${r===d.role?" selected":""}>${esc(ROLE_LABELS[r]||r)}</option>`).join("");
 const roleField=`<label class="fl">Role<select id="u-role"${self?" disabled":""}>${roleOptions}</select></label>`;
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="user-title"><div class="bd" data-a="userclose"></div><div class="mb"><h2 id="user-title">${editing?"Edit user":"Add users"}</h2><div class="mu">${editing?"Update the account details.":"Create a sign-in account. They log in with this username and password."}</div><label class="fl">Username<input id="u-name" maxlength="120" autocomplete="off" value="${esc(d.username||"")}"></label><label class="fl">Password<div class="pw-wrap"><input id="u-pass" type="password" minlength="6" autocomplete="new-password" value="${esc(d.password||"")}">${passwordToggle("u-pass")}</div>${editing?'<div class="mu">Leave blank to keep the current password.</div>':""}</label>${roleField}${bizField}<div class="lg-err" role="status">${esc(S.userMsg)}</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="userclose">Close</button><button type="button" class="p" data-a="usercreate">${editing?"Save changes":"Create user"}</button></div></div></div>`;
}
function managedUsersModal(){
 if(!canManageUsers())return "";
 const query=(S.userSearch||"").trim().toLowerCase();
 const users=S.managedUsers.filter(user=>[user.username,ROLE_LABELS[user.role]||user.role,user.role,user.business].some(value=>String(value||"").toLowerCase().includes(query)));
 const rows=users.map(user=>`<tr><td>${esc(user.username)}</td><td>${esc(ROLE_LABELS[user.role]||user.role)}</td><td>${esc(user.business||"—")}</td><td><div class="map-act"><button type="button" class="sm" data-a="user-edit" data-id="${esc(user.id)}">Edit</button><button type="button" class="sm dgr" data-a="user-delete" data-id="${esc(user.id)}"${user.id===S.user.id?" disabled":""}>Remove</button></div></td></tr>`).join("");
 const content=S.usersLoading?'<div class="mu">Loading users…</div>':S.usersMsg&&!S.managedUsers.length?`<div class="lg-err" role="status">${esc(S.usersMsg)}</div>`:rows?`<div class="sc"><table><tr><th>Username</th><th>Role</th><th>Business</th><th></th></tr>${rows}</table></div>`:S.managedUsers.length?'<div class="mu">No users match your search.</div>':'<div class="mu">No user accounts found.</div>';
 return `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="managed-users-title"><div class="bd" data-a="managed-users-close"></div><div class="mb wide"><h2 id="managed-users-title">Manage users</h2><label class="managed-user-search"><input id="managed-users-search" type="search" value="${esc(S.userSearch)}" placeholder="Search by name, business, or role…" aria-label="Search users by name, business, or role" autocomplete="off"></label><div class="mu" role="status">${S.usersMsg&&!S.usersLoading&&S.managedUsers.length?esc(S.usersMsg):""}</div>${content}<div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" data-a="managed-users-close">Back</button><button type="button" class="p" data-a="user-add-from-list">Add user</button></div></div></div>`;
}
async function loadManagedUsers(){
 S.usersLoading=true;S.usersMsg="Loading user accounts…";
 try{
  const response=await fetch("/api/users");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Could not load user accounts (HTTP ${response.status}).`);
  if(!Array.isArray(result))throw new Error("The server returned invalid user data.");
  S.managedUsers=result;S.usersMsg="";
 }catch(error){
  S.usersMsg=error instanceof Error?error.message:String(error);
 }finally{
  S.usersLoading=false;
 }
}
async function openManagedUsers(){
 if(!canManageUsers())return;
 S.userManagement=false;S.userListModal=true;S.managedUsers=[];S.userSearch="";S.usersLoading=true;S.usersMsg="Loading user accounts…";render();
 await loadManagedUsers();
 if(S.userListModal)render();
}
async function deleteManagedUser(id){
 if(!canManageUsers())return;
 const user=S.managedUsers.find(item=>item.id===id);
 if(!user||user.id===S.user.id||!confirm(`Remove ${user.username}'s user account?`))return;
 S.usersMsg=`Removing ${user.username}…`;render();
 try{
  const response=await fetch(`/api/users/${encodeURIComponent(id)}`,{method:"DELETE"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not remove the user account.");
  await loadManagedUsers();
  if(!S.usersMsg)S.usersMsg=`Removed ${user.username}.`;
 }catch(error){S.usersMsg=error instanceof Error?error.message:String(error)}
 if(S.userListModal)render();
}
async function createUser(){
 const d=S.userDraft;if(!d)return;
 const allowedRoles=S.user.role==="developer"?["developer","business","business_hr","business_view"]:S.user.role==="business"?["business","business_hr","business_view"]:S.user.role==="business_hr"?["business_hr","business_view"]:S.user.role==="business_view"?["business_view"]:[];
 if(!allowedRoles.includes(d.role)){S.userMsg="Your account cannot create that role.";render();return}
 const editing=!!d.id,businessSelect=document.getElementById("u-biz"),businessId=businessSelect?businessSelect.value:d.business_id||"";
 const allBusinesses=d.role==="business_hr"&&businessId==="all";
 const body={username:(d.username||"").trim(),password:d.password||"",role:d.role,business_id:d.role==="developer"?null:allBusinesses?"all":businessId||null};
 if(!body.username){S.userMsg="Enter a username.";render();return}
 if((!editing||body.password)&&body.password.length<6){S.userMsg="Password must be at least 6 characters.";render();return}
 if(body.role!=="developer"&&!body.business_id){S.userMsg="Choose a business.";render();return}
 try{
  const response=await fetch(editing?`/api/users/${encodeURIComponent(d.id)}`:"/api/users",{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Could not ${editing?"update":"create"} the user.`);
  const message=`${editing?"Updated":"Created"} ${ROLE_LABELS[body.role]||body.role} "${result.username||body.username}".`;
  if(editing||S.userReturnToList){
   S.userModal=false;S.userDraft=null;S.userReturnToList=false;S.userListModal=true;
   await loadManagedUsers();if(!S.usersMsg)S.usersMsg=message;
  }else{
   S.userDraft={username:"",password:"",role:d.role,business_id:d.business_id};
   S.userMsg=message;
  }
 }catch(error){S.userMsg=error instanceof Error?error.message:String(error)}
 render();
}
function openAddTrainee(business){
 S.settings=false;S.userManagement=false;S.organization=false;S.add=true;S.addmsg="";S.addDraft={name:"",password:"",date:new Date().toISOString().slice(0,10),salary:"",wage:""};
 S.addBiz=business||(S.view!=="overview"?S.view:(vbiz()[0]||""));S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||"";
}
document.addEventListener("input",e=>{
 if(!S.userDraft)return;
 const fields={"u-name":"username","u-pass":"password"};
 if(fields[e.target.id])S.userDraft[fields[e.target.id]]=e.target.value;
});
document.addEventListener("change",e=>{
 if(!S.userDraft)return;
 if(e.target.id==="u-role"){
  S.userDraft.role=e.target.value;
  if(e.target.value!=="business_hr"&&S.userDraft.business_id==="all")S.userDraft.business_id=(S.options.businesses[0]||{}).id||"";
  if(e.target.value!=="developer"&&!S.userDraft.business_id)S.userDraft.business_id=(S.options.businesses[0]||{}).id||"";
  render();
 }
 else if(e.target.id==="u-biz")S.userDraft.business_id=e.target.value;
});
function savePermissions(){
 if(!S.user||S.user.role!=="developer")return;
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
 if(!S.user||S.user.role!=="developer")return;
 const config=S.permissionDraft||ROLE_PERMS;
 const contents=[
  "// Role and permission configuration for Magnus Trainee Tracker.",
  `const DEPTS = ${JSON.stringify(DEPTS,null,2)};`,
  `const BUSINESSES = ${JSON.stringify(BUSINESSES,null,2)};`,
  `const SUBVIEWS = ${JSON.stringify(SUBVIEWS,null,2)};`,
  `const ROLE_LABELS = ${JSON.stringify(ROLE_LABELS,null,2)};`,
  `const PERM_LABELS = ${JSON.stringify(PERM_LABELS,null,2)};`,
  `const ROLE_PERMS = ${JSON.stringify(config,null,2)};`,
 ].join("\n\n")+"\n";
 const url=URL.createObjectURL(new Blob([contents],{type:"text/javascript"})),anchor=document.createElement("a");
 anchor.href=url;anchor.download="config.js";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const emptyMsg=()=>S.user&&S.user.role==="trainee"?"No trainee record is linked to this account. Please ask your administrator to check your login.":scoped().length?"No trainees match your search.":canAddTrainee()?"No trainees yet. Use Settings to add a trainee.":"No trainees to show yet.";
function tcards(){
 const q=(S.q||"").trim().toLowerCase(),L=filtered();
 return L.length?'<div class="gl">'+L.map(t=>{const[s,c]=status(t),l=cur(t),n=done(t);return `<div class="card item" data-a="open" data-id="${t.id}">
 <div class="sp"><b>${esc(t.name)}</b><span class="chip ${c}">${s}</span></div>
 <div class="mu">${[S.view==="overview"&&q?biz(t):"",t.dept,t.desg].filter(Boolean).map(esc).join(" · ")}${t.join?" · Joined "+jd(t.join):""}</div>
 ${seg(t)}
 <div class="mu">${n}/${ST.length} tasks completed${l?` · Now: Step ${l.s+1} – ${esc(ST[l.s].n)}`:""}</div></div>`}).join("")+'</div>':'<div class="mu">'+emptyMsg()+'</div>';
}
// ---- Hierarchy: Business > Department > trainees
const groupBy=(L,f)=>{const m=new Map();L.forEach(t=>{const k=f(t);if(!m.has(k))m.set(k,[]);m.get(k).push(t)});return[...m.entries()]};
function hierTrainees(L){
 return '<div class="hy-ts">'+L.map(t=>{const[s,c]=status(t);return `<div class="hy-t item" data-a="open" data-id="${t.id}" role="button" tabindex="0"><b>${esc(t.name)}</b><span class="mu">${esc(t.desg||"No designation")}</span><span class="chip ${c}">${s}</span></div>`}).join("")+'</div>';
}
function hierDepartments(L){
 return groupBy(L,t=>t.dept||"No department").map(([dp,dl])=>`<div class="hy-d"><div class="hy-h"><b>${esc(dp)}</b><span class="mu">${dl.length}</span></div>${hierTrainees(dl)}</div>`).join("");
}
function hierarchy(){
 const L=filtered();
 if(!L.length)return '<div class="mu">'+(S.t.length?"No trainees match your search.":"No trainees yet. Use Settings to add a trainee.")+'</div>';
 if(S.view!=="overview")return '<div class="card hy">'+hierDepartments(L)+'</div>';
 return BIZ.map(b=>{const bl=L.filter(t=>biz(t)===b);return bl.length?`<div class="card hy"><div class="hy-h hy-top"><h2>${esc(b)}</h2><span class="mu">${bl.length} ${bl.length===1?"trainee":"trainees"}</span></div>${hierDepartments(bl)}</div>`:""}).join("");
}
const bstats=L=>{const dn=L.filter(t=>status(t)[0]==="Completed").length;return{n:L.length,dn,ip:L.length-dn}};
function bizCards(){
 return '<div class="bg">'+vbiz().map(b=>{const k=bstats(scoped().filter(t=>biz(t)===b));return `<div class="card bz item biz-card" data-a="openbiz" data-b="${esc(b)}" role="button" tabindex="0" aria-label="View ${esc(b)} trainees">
  <div class="sp"><b>${esc(b)}</b></div>
  <div class="bn${k.n?"":" zero"}">${k.n}</div><div class="mu">${k.n===1?"trainee":"trainees"}</div>
  <div class="bs mu"><span>${k.ip} in progress</span><span>${k.dn} completed</span></div></div>`}).join("")+'</div>';
}
// ---- Hierarchy files (one image or PDF per business, stored in the bucket)
const HYMAX=10*1024*1024;
const loadHier=()=>fetch("/api/hierarchy-images").then(r=>r.json()).then(d=>{if(d&&!d.error)S.himg=d}).catch(()=>{});
function hierImages(){
 const L=S.view==="overview"?vbiz():vbiz().filter(b=>b===S.view);
 return L.map(b=>{
  const im=S.himg[b],msg=S.hmsg[b]||"",busy=msg.endsWith("…");
  const url="/api/hierarchy-images/"+encodeURIComponent(b)+"?v="+encodeURIComponent(im?im.at:"");
  const isPdf=im&&im.type==="application/pdf";
  const zoom=S.hzoom[b]||1;
  const controls=`<div class="hy-viewer-controls" role="group" aria-label="${esc(b)} hierarchy zoom controls"><button type="button" class="sm" data-a="hyzoom-out" data-b="${esc(b)}" aria-label="Zoom out">−</button><span data-hy-zoom>${Math.round(zoom*100)}%</span><button type="button" class="sm" data-a="hyzoom-in" data-b="${esc(b)}" aria-label="Zoom in">+</button><button type="button" class="sm" data-a="hyzoom-fit" data-b="${esc(b)}">Fit</button></div>`;
  const preview=im?(isPdf?`<div class="hy-viewer" data-hy-pdf data-b="${esc(b)}" data-url="${esc(url)}">${controls}<div class="hy-viewer-stage"><canvas aria-label="${esc(b)} hierarchy"></canvas><div class="mu hy-pdf-status" role="status" aria-live="polite">Loading hierarchy…</div></div></div>`:`<div class="hy-viewer" data-b="${esc(b)}">${controls}<div class="hy-viewer-stage"><img class="hy-img" data-hy-image src="${url}" alt="${esc(b)} hierarchy" style="width:${zoom*100}%"></div></div>`):`<div class="mu">No hierarchy file uploaded for ${esc(b)} yet.</div>`;
  return `<div class="card hyi"><div class="sp"><h2>${esc(b)} hierarchy</h2>${allow("hier")?`<div class="row">${im?`<button type="button" class="sm dgr" data-a="hyremove" data-b="${esc(b)}"${busy?" disabled":""}>Remove</button>`:""}<label class="hy-up${busy?" is-busy":""}">${im?"Replace file":"Upload image/PDF"}<input type="file" class="hy-file" data-b="${esc(b)}" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" hidden${busy?" disabled":""}></label></div>`:""}</div>
  ${im?`${preview}<div class="mu">${esc(im.name)} · ${pdfSize(im.size)} · uploaded ${fmt(im.at)}</div>`:preview}
  ${msg?`<div class="mu" role="status" style="margin-top:6px">${esc(msg)}</div>`:""}</div>`}).join("");
}
const HY_PDF_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
function mountHierarchyPdfs(root){
 const viewers=root.querySelectorAll("[data-hy-pdf]");
 if(!viewers.length)return;
 if(!window.pdfjsLib){
  viewers.forEach(view=>{view.querySelector(".hy-pdf-status").textContent="The hierarchy viewer could not be loaded."});
  return;
 }
 window.pdfjsLib.GlobalWorkerOptions.workerSrc=HY_PDF_WORKER;
 viewers.forEach(view=>{
  const business=view.dataset.b,url=view.dataset.url;
  let state=S.hpdf[business];
  if(!state||state.url!==url){
   if(state&&state.doc)state.doc.destroy();
   state=S.hpdf[business]={url,zoom:S.hzoom[business]||1,doc:null,loading:null,page:null,renderTask:null,renderId:0};
  }
  if(!state.loading)state.loading=window.pdfjsLib.getDocument(url).promise.then(doc=>{state.doc=doc;return doc}).catch(error=>{state.loading=null;throw error});
  state.loading.then(doc=>drawHierarchyPdf(view,state,doc)).catch(error=>{
   const status=view.querySelector(".hy-pdf-status");
   if(status&&status.isConnected)status.textContent="Could not display this PDF: "+(error instanceof Error?error.message:String(error));
  });
 });
}
async function drawHierarchyPdf(view,state,doc){
 if(!view.isConnected)return;
 const renderId=state.renderId=(state.renderId||0)+1;
 const stage=view.querySelector(".hy-viewer-stage"),canvas=view.querySelector("canvas"),status=view.querySelector(".hy-pdf-status");
 if(!stage||!canvas||!status)return;
 const width=stage.clientWidth;
 if(!width)return;
 try{
  const page=state.page||(state.page=await doc.getPage(1));
  if(!view.isConnected||state.renderId!==renderId)return;
  if(state.renderTask){
   const previous=state.renderTask;
   previous.cancel();
   try{await previous.promise}catch(error){if(!error||error.name!=="RenderingCancelledException")throw error}
  }
  if(!view.isConnected||state.renderId!==renderId)return;
  const base=page.getViewport({scale:1}),scale=width/base.width*state.zoom,viewport=page.getViewport({scale});
  const ratio=window.devicePixelRatio||1,context=canvas.getContext("2d");
  canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
  canvas.style.width=viewport.width+"px";canvas.style.height=viewport.height+"px";
  status.textContent="";
  const task=page.render({canvasContext:context,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
  state.renderTask=task;
  await task.promise;
  if(state.renderTask===task)state.renderTask=null;
 }catch(error){
  if(error&&error.name==="RenderingCancelledException")return;
  if(state.renderId!==renderId)return;
  state.renderTask=null;
  status.textContent="Could not display this PDF: "+(error instanceof Error?error.message:String(error));
 }
}
function setHierarchyZoom(button){
 const business=button.dataset.b,action=button.dataset.a;
 const current=S.hzoom[business]||1,next=action==="hyzoom-fit"?1:Math.max(.5,Math.min(3,current+(action==="hyzoom-in"?.25:-.25)));
 S.hzoom[business]=next;
 const viewer=Array.from(document.querySelectorAll(".hy-viewer")).find(item=>item.dataset.b===business);
 if(!viewer)return;
 const label=viewer.querySelector("[data-hy-zoom]");if(label)label.textContent=Math.round(next*100)+"%";
 const image=viewer.querySelector("[data-hy-image]");
 if(image)image.style.width=next*100+"%";
 const pdf=viewer.matches("[data-hy-pdf]")?viewer:viewer.querySelector("[data-hy-pdf]");
 if(pdf){const state=S.hpdf[business];if(state){state.zoom=next;if(state.doc)drawHierarchyPdf(pdf,state,state.doc)}}
}
window.addEventListener("resize",()=>{
 document.querySelectorAll("[data-hy-pdf]").forEach(view=>{
  const state=S.hpdf[view.dataset.b];
  if(state&&state.doc)drawHierarchyPdf(view,state,state.doc);
 });
});
async function hierUpload(inp){
 if(!allow("hier"))return;const b=inp.dataset.b,f=inp.files[0];inp.value="";if(!f)return;
 const setMsg=m=>{S.hmsg[b]=m;if(S.bv==="hierarchy"&&!S.sel)render()};
 const isImage=/^image\/(png|jpeg|gif|webp)$/.test(f.type),isPdf=f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf");
 if(!isImage&&!isPdf)return setMsg("Only PNG, JPG, GIF, WEBP, or PDF files are allowed.");
 if(f.size>HYMAX)return setMsg("File must be 10 MB or smaller.");
 setMsg("Uploading…");
 try{
  const fd=new FormData();fd.append("business",b);fd.append("file",f);
  const r=await fetch("/api/hierarchy-images",{method:"POST",body:fd}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Upload failed.");
  S.himg=d;setMsg("");
 }catch(err){setMsg(err instanceof Error?err.message:String(err))}
}
async function hierRemove(b){
 if(!confirm("Remove the "+b+" hierarchy file?"))return;
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
 if(S.view!=="overview"||S.nav==="trainees")return tcards();
 if(S.nav==="businesses")return (S.q||"").trim()?tcards():bizCards();
 return (S.q||"").trim()?tcards():'<h2 class="bh">Businesses</h2>'+bizCards();
}
function list(){
 const ov=S.view==="overview",k=bstats(ov?scoped():scoped().filter(t=>biz(t)===S.view));
 const st=(l,v,sub)=>`<div class="tl"><span class="mu">${l}</span><b>${v}</b><span class="mu">${sub}</span></div>`;
 const title=!ov?S.view:S.nav==="businesses"?"Businesses":S.nav==="trainees"?"Trainees":"Dashboard";
 const desc=!ov?`Follow every ${esc(S.view)} trainee through ${MODS.length} modules and ${ST.length} tasks, one step at a time.`:S.nav==="trainees"?"View and search trainees across the businesses in your scope.":S.nav==="businesses"?"Choose a business to view its trainees and hierarchy.":"Overall overview across all businesses. Open a business below to see its trainees and hierarchy.";
 return `${!ov&&!oneBiz()?'<button class="bk-btn" data-a="allbiz">← All businesses</button>':""}<div class="ph"><h1>${esc(title)}</h1><div class="mu">${desc}</div></div>
 <label class="fl vw"><span>View</span><select id="view">${[["overview","Overview"],["hierarchy","Hierarchy"]].map(([v,n])=>`<option value="${v}"${S.bv===v?" selected":""}>${n}</option>`).join("")}</select></label>
 <div class="tg">${st("Total trainees",k.n,"enrolled")}${st("In progress",k.ip,"working through steps")}${st("Completed",k.dn,"all tasks completed")}</div>
 <div id="tl">${listBody()}</div>`;
}
// ---- Add trainee pop-up form
function addModal(){
 const departments=addDepts(),designations=addDesignations();
 const draft=S.addDraft||{};
 return `<div class="ov" role="dialog" aria-modal="true"><div class="bd" data-a="mcancel"></div><div class="mb wide"><h2 style="margin-top:2px">Add trainee</h2><div class="fg"><label>Trainee name (login username)<input id="nm" placeholder="Full name" value="${esc(draft.name||"")}"></label><label>Login password<div class="pw-wrap"><input id="tp" type="password" minlength="6" autocomplete="new-password" value="${esc(draft.password||"")}">${passwordToggle("tp")}</div></label><label>Joining date<input id="jd" type="date" value="${esc(draft.date||new Date().toISOString().slice(0,10))}"></label><div><label>Business<select id="bz">${addSelectOptions(vbiz(),S.addBiz,x=>x,x=>x,"Choose business…","business")}</select></label>${addCategoryPanel("business")}</div><div><label>Department<select id="dp">${addSelectOptions(departments,S.addDept,x=>x.name,x=>x.name,"Choose department…","department")}</select></label>${addCategoryPanel("department")}</div><div><label>Designation<select id="ds">${addSelectOptions(designations,S.addDesg,x=>x.title,x=>x.title,"Choose designation…","designation")}</select></label>${addCategoryPanel("designation")}</div><label>Salary (₹ per month)<input id="sl" type="number" min="0" inputmode="numeric" placeholder="0" value="${esc(draft.salary||"")}"></label><label>Wage (₹ per day)<input id="wg" type="number" min="0" inputmode="numeric" placeholder="0" value="${esc(draft.wage||"")}"></label></div><div id="add-error" class="lg-err" role="status">${esc(S.addmsg||"")}</div><div class="mu" style="margin-top:12px">The trainee will sign in using their name and this password. To add a missing category, choose “＋ Add …” and enter its name. Step 1 is assigned right now; each next task unlocks after completion.</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button data-a="mcancel">Cancel</button><button class="p" data-a="add"${departments.length&&designations.length?"":" disabled"}>Create login &amp; assign Step 1</button></div></div></div>`;
}
function showAddCategory(entity){
 if(!canManageOrganization())return;
 document.querySelectorAll("[data-add-category-panel]").forEach(panel=>{panel.hidden=panel.dataset.addCategoryPanel!==entity});
 const selects={business:"bz",department:"dp",designation:"ds"};
 const selected={business:S.addBiz,department:S.addDept,designation:S.addDesg};
 const select=document.getElementById(selects[entity]);
 if(select)select.value=selected[entity]||"";
 const input=document.getElementById(`add-category-name-${entity}`);
 if(input)input.focus();
}
async function createAddCategory(entity){
 if(!canManageOrganization())return;
 const labels={business:"Business",department:"Department",designation:"Designation"};
 if(!Object.prototype.hasOwnProperty.call(labels,entity))return;
 const input=document.getElementById(`add-category-name-${entity}`);
 const status=document.getElementById(`add-category-status-${entity}`);
 const submit=document.querySelector(`[data-a="category-create"][data-entity="${entity}"]`);
 const name=(input.value||"").trim();
 if(!name){status.textContent=`Enter a ${entity} name.`;input.focus();return}
 const parents={department:addDepartmentParent,designation:addDesignationParent};
 const parentId=parents[entity]?parents[entity]():null;
 if(entity!=="business"&&!parentId){status.textContent=`Select a ${entity==="department"?"business":"department"} first.`;return}
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
  if(entity==="business"){S.addBiz=name;S.addDept="";S.addDesg=""}
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
  const l=cur(t),[s,c]=status(t),[vm,sm]=vmod(t);
  const timeline=MODS.map((module,mi)=>{
   const steps=ST.map((step,i)=>({step,index:i})).filter(item=>item.step.m===mi);
   const completed=steps.filter(item=>t.logs.some(g=>g.s===item.index&&g.c)).length;
   const first=t.logs.find(g=>ST[g.s]&&ST[g.s].m===mi);
   const entries=steps.map(({step:x,index:i})=>{
    const g=t.logs.find(q=>q.s===i)||(l&&l._pending&&l.s===i?l:null);
    const state=!g?["Locked","s-locked"]:g.c?["Completed","s-done"]:g.st?["In progress","s-prog"]:["Assigned","s-asg"];
    const attachment=g&&g.pdf
     ?`<div class="wt-file"><span class="pdf-ico">PDF</span><div><b>Uploaded presentation</b><div class="mu">${pdfLink(t,g)} · ${g.pdf.sz?pdfSize(g.pdf.sz):"Size unavailable"} · uploaded ${fmt(g.pdf.at)}</div></div></div>`
     :g&&needsPdf(x)?'<div class="wt-missing">Presentation PDF not uploaded</div>':"";
    const watch=S.user.role!=="trainee"&&S.user.role!=="business_hr"&&g&&x.t==="VIDEO"&&vfolder(biz(t),i)?`<button type="button" class="sm" data-a="watchstep" data-s="${i}">▶ Watch video</button>`:"";
    return `<article class="wt-item ${g?"":"is-locked"}"><div class="wt-node ${state[1]}" aria-hidden="true">${g&&g.c?"✓":i+1}</div><div class="wt-entry">
     <div class="wt-heading"><span class="chip wt-type">${x.t}</span><span class="chip ${state[1]}">${state[0]}</span></div>
     <h3 class="wt-title">${esc(x.n)}</h3><div class="mu">Planned ${x.d} · Monitored by ${esc(x.by)}</div>
     <div class="wt-meta"><span><b>Assigned</b> ${g?fmt(g.a):"–"}</span><span><b>Started</b> ${g?fmt(g.st):"–"}</span><span><b>Completed</b> ${g?fmt(g.c):"–"}</span><span><b>Time taken</b> ${g?took(g.st||g.a,g.c):"–"}</span></div>
     ${attachment}${watch}</div></article>`;
   }).join("");
   return `<section class="wt-module"><header class="wt-module-head"><b>${module.n}</b><span class="mu">${completed}/${steps.length} completed · ${first?"Started "+fmt(first.a):"Not started"}</span></header><div class="wt-list">${entries}</div></section>`;
  }).join("");
 const vn=ST.filter(x=>x.m===vm),vd=vn.filter(x=>t.logs.some(g=>g.c&&ST[g.s]===x)).length,w=waiting(t),can=w!=null&&ST[w].m===vm+1;
const nav=`<div class="navbar"><button class="gh" data-a="prev" ${vm<=0?"disabled":""}>‹ Previous</button><div class="nv"><b>${MODS[vm].n}</b><span class="mu">${vd}/${vn.length} completed · ${hm(vn.reduce((z,x)=>z+x.mn,0))} planned</span></div><button class="${can?"p":"gh"}" data-a="next" ${!allow("work")||!(vm<sm||can)?"disabled":""}>${can?"Start "+mshort(w)+" ›":"Next ›"}</button></div>${vm===sm&&vm+1<MODS.length&&!can?`<div class="mu" style="margin-top:8px;text-align:right">The next module unlocks when this one is complete.</div>`:""}`;
 let act="";
 if(l){
  const x=ST[l.s];
  const activity=l.st
   ?`<div class="mu" style="margin-bottom:8px">Started ${fmt(l.st)}</div>`
   :`<div class="mu" style="margin-bottom:8px">Assigned ${fmt(l.a)}. Time is counted only from when you press Start.</div>`;
  const actions=l.st
   ?(allow("work")&&needsPdf(x)?pdfUi(t,l)+(l.pdf?"":`<div class="mu" style="margin-bottom:8px">Upload your presentation (PDF) to enable completion.</div>`):"")+(allow("work")?`<button class="p" data-a="cmp" ${needsPdf(x)&&!l.pdf?"disabled":""}>Mark completed now</button>`:"")
   :allow("work")?'<button class="p" data-a="go">▶ Start task</button>':"";
   const videoNotice=S.user.role==="trainee"&&x.t==="VIDEO"&&!vfolder(biz(t),l.s)?'<div class="mu" style="margin-top:8px">This video has not been mapped yet. Please contact HR.</div>':"";
  act=`<div class="card cur"><div class="mu">Current · Step ${l.s+1} of ${ST.length} · ${MODS[x.m].n}</div>
 <h2 style="margin-top:4px"><span class="chip">${x.t}</span> ${esc(x.n)}</h2>
 <div class="mu">Duration ${x.d} · Monitored by ${x.by}</div>${S.user.role!=="trainee"&&S.user.role!=="business_hr"&&x.t==="VIDEO"&&vfolder(biz(t),l.s)?`<div style="margin-top:10px"><button type="button" class="sm gh" data-a="watchstep" data-s="${l.s}">▶ Watch this video</button></div>`:""}
  ${videoNotice}<div style="margin-top:10px">${activity}${actions}</div></div>`;
 }
 else if(waiting(t)!=null){const w=waiting(t),y=ST[w],moduleChanged=ST[w-1].m!==y.m;act=`<div class="card cur"><div class="mu">${moduleChanged?MODS[ST[w-1].m].n+" completed":"Previous task completed"}</div><h2 style="margin-top:4px">Next: ${moduleChanged?MODS[y.m].n:esc(y.n)}</h2><div class="mu" style="margin-bottom:10px">${moduleChanged?"First task: ":""}${esc(y.n)} (${y.d}). Start when you’re ready.</div>${allow("work")?`<button class="p" data-a="start">▶ Start ${moduleChanged?mshort(w):"task"}</button>`:""}</div>`}
 else act=`<div class="card cur ok"><b>All ${ST.length} tasks completed 🎉</b></div>`;
 return `<div class="card"><div class="sp"><h1>${esc(t.name)}</h1><span class="chip ${c}">${s}</span></div>
 <div class="dg">${info(t).map(x=>`<div><span class="mu">${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div>${seg(t)}<div class="mu">${done(t)}/${ST.length} tasks completed · Videos done: ${hm(t.logs.filter(l=>l.c&&ST[l.s].t==="VIDEO").reduce((a,l)=>a+ST[l.s].min,0))} of ${hm(VT)}</div></div>
 ${act}${tiles(t)}<div class="card"><h2>Task timeline</h2><p class="mu">Tasks are shown in order. Any presentation PDF uploaded for a task appears on its card.</p>${timeline}${nav}</div>`;
}

function openTaskVideo(t,stepIndex,autoplay=false){
 if(!t)return false;
 const folder=vfolder(biz(t),stepIndex);
 if(!folder||!ST[stepIndex]||ST[stepIndex].t!=="VIDEO")return false;
 S.add=false;S.edit=false;S.modal=null;S.upload=false;S.map=false;S.vpre=folder;S.video=true;
 S.videoStep=S.user.role==="trainee"?stepIndex:null;S.videoAutoplay=autoplay;S.replayGateStep=null;S.replayGateMsg="";
 if(S.user.role==="trainee"&&(S.videoCompletionError||S.completedVideoSteps.includes(stepIndex))){
  S.videoStep=null;S.replayGateStep=stepIndex;S.replayGateMsg=S.videoCompletionError||"Checking HR approval…";
 }
 S.videoFinished=false;S.videoWatchSaved=false;S.videoReplayRequested=false;S.replayRequestConfirmStep=null;S.videoReturnAt=null;S.videoLatestTime=0;S.videoSeekTarget=null;
 render();
 if(S.user.role!=="trainee"){loadVideoFolders(folder);return true}
 if(S.videoStep!=null){playVideo(folder,"video-player","video-player-status",autoplay);requestTraineeFullscreen()}
 else if(S.replayGateStep!=null)loadReplayRequestsForGate();
 return true;
}

// ---- Actions
document.addEventListener("click",e=>{
 S.cx=e.clientX;S.cy=e.clientY;
 const profileMenu=document.querySelector(".profile-menu");
 if(profileMenu&&!profileMenu.contains(e.target))profileMenu.open=false;
 const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a,t=S.t.find(x=>x.id===S.sel);
 let autoPlayVideoStep=null;
 if(a==="hyzoom-in"||a==="hyzoom-out"||a==="hyzoom-fit")return setHierarchyZoom(b);
 if(a==="password-toggle"){const input=document.getElementById(b.dataset.target);if(!input)return;const visible=input.type==="password";input.type=visible?"text":"password";b.setAttribute("aria-label",visible?"Hide password":"Show password");b.title=visible?"Hide password":"Show password";b.innerHTML=visible?EYE_OFF:EYE;return}
 if(a==="logout")return logout();
 if(["cmp","go","start","next"].includes(a)&&!allow("work"))return;
 const NEED={"settings-addtrainee":"add",addopen:"add",add:"add",accountopen:"add",accountset:"add",del:"del",ename:"ename",esave:"ename",uploadopen:"upload",hyremove:"hier",score:"score",msave:"score",csv:"csv"};
 if(a==="videoopen"&&S.user.role==="trainee")return;
 if(a==="watchstep")return openTaskVideo(t,+b.dataset.s);
 if(a==="replay-inbox-open"&&!canReviewReplays())return;
 if(a.startsWith("permissions-")&&S.user.role!=="developer")return;
 if(a.startsWith("org")&&!canManageOrganization())return;
 if(a.startsWith("user")&&!canManageUsers())return;
 if(a==="category-create")return createAddCategory(b.dataset.entity);
 if(a==="category-cancel"){
  document.querySelectorAll("[data-add-category-panel]").forEach(panel=>{panel.hidden=true});
  const selects={business:"bz",department:"dp",designation:"ds"};
  const selected={business:S.addBiz,department:S.addDept,designation:S.addDesg};
  const select=document.getElementById(selects[b.dataset.entity]);
  if(select)select.value=selected[b.dataset.entity]||"";
  const input=document.getElementById(`add-category-name-${b.dataset.entity}`);
  const status=document.getElementById(`add-category-status-${b.dataset.entity}`);
  if(input)input.value="";
  if(status)status.textContent="";
  return;
 }
 if(a.startsWith("map")&&!allow("map"))return;
 if(a==="trainee-video-toggle"){
  const player=document.getElementById("video-player");
  if(!player)return;
  if(player.paused){requestTraineeFullscreen();player.play().catch(error=>{const status=document.getElementById("video-player-status");if(status)status.textContent=`Playback could not start: ${error instanceof Error?error.message:String(error)}`})}
  else player.pause();
  return;
 }
 if(a==="trainee-video-fullscreen"){toggleTraineeFullscreen();return}
 if(a==="trainee-video-rewind"){
  const player=document.getElementById("video-player");if(!player)return;
  if(S.videoReturnAt==null){S.videoReturnAt=player.currentTime;updateTraineeVideoControls()}
  const target=Math.max(0,player.currentTime-10);S.videoSeekTarget=target;player.currentTime=target;return;
 }
 if(a==="trainee-video-return"){
  const player=document.getElementById("video-player");if(!player||S.videoReturnAt==null)return;
  const target=S.videoReturnAt;S.videoReturnAt=null;S.videoSeekTarget=target;player.currentTime=target;updateTraineeVideoControls();return;
 }
 if(a==="replay-request-confirm"){
  const stepIndex=Number(b.dataset.step);
  if(Number.isInteger(stepIndex)&&stepIndex>=0&&stepIndex<ST.length){S.replayRequestConfirmStep=stepIndex;render()}
  return;
 }
 if(a==="replay-request-cancel"){S.replayRequestConfirmStep=null;return render()}
 if(a==="replay-request-send")return requestVideoReplay(Number(b.dataset.step));
 if(a==="video-replay-request")return requestVideoReplay(S.videoStep==null?S.replayGateStep:S.videoStep);
 if(a==="replay-approved")return startApprovedReplay(b.dataset.id,Number(b.dataset.step));
 if(a==="replay-gate-close"){stopVideoPlayer();S.video=false;S.videoStep=null;S.videoAutoplay=false;S.replayGateStep=null;return render()}
 if(a==="trainee-video-continue"){
  if(!S.videoFinished)return;
  stopVideoPlayer();S.video=false;S.videoStep=null;S.videoAutoplay=false;S.videoFinished=false;render();return;
 }
 if(a==="replay-decision")return reviewVideoReplay(b.dataset.id,b.dataset.status);
 if(a==="replay-inbox-close"){S.replayInbox=false;S.replayInboxMsg="";return render()}
 if(NEED[a]&&(NEED[a]==="add"?!canAddTrainee():!allow(NEED[a])))return;
 if(a==="accountset")return setTraineeLogin(t);
 if(a==="open"){const o=S.t.find(x=>x.id===b.dataset.id);if(!o||!inScope(o))return}
 if(a==="openbiz"&&!vbiz().includes(b.dataset.b))return;
 if(a==="allbiz"&&oneBiz())return;
 if(a==="back"&&S.user.role==="trainee")return;
 if(a.startsWith("map")){return mapAction(a,b)}
 if(a==="hyremove")return hierRemove(b.dataset.b);
 if(a==="add"){const n=document.getElementById("nm").value.trim();if(!n)return document.getElementById("nm").focus();
  const password=document.getElementById("tp").value;if(password.length<6){S.addmsg="Password must be at least 6 characters.";document.getElementById("add-error").textContent=S.addmsg;return}
  const d=now(),g=i=>document.getElementById(i).value.trim(),business=g("bz"),department=g("dp"),designation=g("ds");
  if(!vbiz().includes(business)||!addDepts().some(x=>sameName(x.name,department))||!addDesignations().some(x=>sameName(x.title,designation))){S.addmsg="Choose an available business, department, and designation.";render();return}
  S.t.push({id:crypto.randomUUID(),biz:business,name:n,dept:department,desg:designation,join:g("jd"),sal:g("sl"),wage:g("wg"),start:d,logs:[{s:0,a:d}],account_password:password});S.add=false;S.addDraft=null;S.addmsg="";S.userManagement=true}
 else if(a==="nav-dashboard"){S.nav="dashboard";S.view="overview";S.bv="overview";S.q=""}
 else if(a==="nav-trainees"){S.nav="trainees";S.view="overview";S.bv="overview";S.q=""}
 else if(a==="nav-businesses"){S.nav="businesses";S.view="overview";S.bv="overview";S.q=""}
 else if(a==="openbiz"){S.nav="businesses";S.view=b.dataset.b;S.bv="overview";S.q=""}
 else if(a==="allbiz"){S.nav="businesses";S.view="overview";S.bv="overview";S.q=""}
 else  if(a==="open"){S.sel=b.dataset.id;S.vm=null;S.modal=null;S.edit=false}
 else if(a==="back"){S.sel=null;S.modal=null;S.edit=false}
 else if(a==="del"){if(!confirm("Remove this trainee and all their records?"))return;S.t=S.t.filter(x=>x.id!==b.dataset.id);S.sel=null}
 else if(a==="cmp"){const l=cur(t);if(needsPdf(ST[l.s])&&!l.pdf)return;l.c=now();if(l.s+1<ST.length)t.logs.push({s:l.s+1,a:now()})}
 else if(a==="start"){if(waiting(t)!=null){const step=waiting(t),d=now();t.logs.push({s:step,a:d,st:d});S.vm=null;if(S.user.role==="trainee"&&ST[step].t==="VIDEO"&&vfolder(biz(t),step))autoPlayVideoStep=step}}
 else if(a==="go"){const l=cur(t);if(l&&l._pending){const d=now();t.logs.push({s:l.s,a:l.a||d,st:d})}else if(l&&!l.st)l.st=now();if(S.user.role==="trainee"&&l&&ST[l.s].t==="VIDEO"&&vfolder(biz(t),l.s))autoPlayVideoStep=l.s}
 else if(a==="prev"){S.vm=vmod(t)[0]-1}
 else if(a==="next"){const[v,m]=vmod(t);if(v<m)S.vm=v+1;else if(waiting(t)!=null&&ST[waiting(t)].m===v+1){const step=waiting(t),d=now();t.logs.push({s:step,a:d,st:d});S.vm=null;if(S.user.role==="trainee"&&ST[step].t==="VIDEO"&&vfolder(biz(t),step))autoPlayVideoStep=step}}
 else if(a==="score"){S.modal=+b.dataset.mi}
 else if(a==="addopen"){S.add=true;S.addmsg="";S.addDraft={name:"",password:"",date:new Date().toISOString().slice(0,10),salary:"",wage:""};S.addBiz=b.dataset.b|| (S.view!=="overview"?S.view:(vbiz()[0]||""));S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||""}
 else if(a==="accountopen"){S.accountModal=true;S.accountDone=false;S.accountMsg=""}
 else if(a==="accountcancel"){S.accountModal=false;S.accountDone=false;S.accountMsg=""}
 else if(a==="settings-open"){S.userManagement=false;S.settings=true}
 else if(a==="useropen"){openUserModal()}
 else if(a==="userclose"){S.userModal=false;S.userDraft=null;S.userMsg="";if(S.userReturnToList){S.userReturnToList=false;S.userListModal=true}else S.userManagement=true}
 else if(a==="usercreate")return createUser();
 else if(a==="managed-users-open")return openManagedUsers();
 else if(a==="managed-users-close"){S.userListModal=false;S.usersMsg="";S.userManagement=true}
 else if(a==="user-add-from-list"){if(!canManageUsers())return;S.userReturnToList=true;S.userListModal=false;openUserModal();return render()}
 else if(a==="user-edit"){if(!canManageUsers())return;const user=S.managedUsers.find(item=>item.id===b.dataset.id);if(!user)return;S.userReturnToList=true;S.userListModal=false;S.userModal=true;S.userMsg="";S.userDraft={id:user.id,username:user.username,password:"",role:user.role,business_id:user.business_id};return render()}
 else if(a==="user-delete")return deleteManagedUser(b.dataset.id);
 else if(a==="settings-addtrainee"){openAddTrainee()}
 else if(a==="user-management-open"){if(!canManageUsers()&&!canAddTrainee())return;S.settings=false;S.userManagement=true}
 else if(a==="user-management-close"){S.userManagement=false;S.settings=true}
 else if(a==="settings-close"){S.settings=false}
 else if(a==="permissions-open"){if(!S.user||S.user.role!=="developer")return;S.settings=false;S.userManagement=false;S.permissions=true;S.permissionDraft=copyPermissions(ROLE_PERMS);S.permissionMsg=""}
 else if(a==="permissions-close"){S.permissions=false;S.permissionDraft=null;S.permissionMsg="";S.userManagement=true}
 else if(a==="permissions-save")return savePermissions();
 else if(a==="permissions-download")return downloadPermissionConfig();
 else if(a==="orgopen")return openOrganization("business");
 else if(a==="orgclose"){S.organization=false;S.settings=true}
 else if(a==="orgcreate")return createOrganizationRecord();
 else if(a==="uploadopen"){S.add=false;S.edit=false;S.modal=null;S.upload=true}
 else if(a==="uploadcancel"){cancelVideoUpload();return}
 else if(a==="parent-create-cancel"){document.getElementById("parent-create-panel").hidden=true;document.getElementById("parent-folder-status").textContent="";return}
 else if(a==="parent-create"){createParentFolder();return}
 else if(a==="videoopen"){S.add=false;S.edit=false;S.modal=null;S.upload=false;S.videoStep=null;S.video=true}
 else if(a==="videocancel"){stopVideoPlayer();S.video=false;S.videoStep=null;S.vpre=""}
 else if(a==="watchstep"){const st=+b.dataset.s,f=t?vfolder(biz(t),st):"";if(!f||!ST[st]||ST[st].t!=="VIDEO")return;S.add=false;S.edit=false;S.modal=null;S.upload=false;S.map=false;S.vpre=f;S.video=true;S.videoStep=S.user.role==="trainee"?st:null;S.replayGateStep=null;S.replayGateMsg="";if(S.user.role==="trainee"&&(S.videoCompletionError||S.completedVideoSteps.includes(st))){S.videoStep=null;S.replayGateStep=st;S.replayGateMsg=S.videoCompletionError||"Checking HR approval…"}S.videoFinished=false;S.videoWatchSaved=false;S.videoReplayRequested=false;S.replayRequestConfirmStep=null;S.videoReturnAt=null;S.videoLatestTime=0;S.videoSeekTarget=null}
 else if(a==="replay-inbox-open"){S.replayInbox=true;S.replayInboxData=[];S.replayInboxMsg="Loading requests…"}
 else if(a==="mcancel"){S.modal=null;S.edit=false;if(S.add)S.userManagement=true;S.add=false;S.addDraft=null}
 else if(a==="ename"){S.edit=true}
 else if(a==="esave"){const el=document.getElementById("en-nm"),n=el.value.trim();if(!n)return el.focus();t.name=n;S.edit=false}
 else if(a==="msave"){const el=document.getElementById("ms-sc"),n=+el.value;if(el.value.trim()===""||!Number.isFinite(n))return el.focus();
  t.scores=t.scores||{};t.scores[S.modal]={sc:Math.max(0,Math.min(MAXSC,n)),rm:document.getElementById("ms-rm").value.trim()};S.modal=null}
 else if(a==="theme")return toggleTheme();
 else if(a==="csv")return csv();
 if(["add","del","cmp","start","go","next","esave","msave"].includes(a))save();
 if(autoPlayVideoStep==null||!openTaskVideo(t,autoPlayVideoStep,true))render();
 if(a==="uploadopen")loadParentFolders();
 if(a==="videoopen")loadVideoFolders();
 if(a==="replay-inbox-open")loadReplayRequests();
});
document.addEventListener("fullscreenchange",updateTraineeVideoControls);

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
  S.addBiz=e.target.value;S.addDept=(addDepts()[0]||{}).name||"";S.addDesg=(addDesignations()[0]||{}).title||"";S.addmsg="";render();return
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
 if(player){player.onerror=null;player.onended=null;player.ontimeupdate=null;player.onseeking=null;player.pause();player.removeAttribute("src");player.load()}
 const shell=document.getElementById("trainee-video-shell");
 if(shell&&document.fullscreenElement===shell&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
}

function requestTraineeFullscreen(){
 const shell=document.getElementById("trainee-video-shell");
 const status=document.getElementById("video-player-status")||document.getElementById("video-replay-status");
 const fallback=()=>{if(status)status.textContent="Browser fullscreen is unavailable; the video remains in full-page view."};
 if(shell&&document.fullscreenElement===shell)return;
 if(!shell||!shell.requestFullscreen){fallback();return}
 shell.requestFullscreen().catch(fallback);
}
function toggleTraineeFullscreen(){
 const shell=document.getElementById("trainee-video-shell");
 if(!shell)return;
 if(document.fullscreenElement===shell&&document.exitFullscreen){
  document.exitFullscreen().catch(error=>{
   const status=document.getElementById("video-player-status");
   if(status)status.textContent=`Fullscreen could not close: ${error instanceof Error?error.message:String(error)}`;
  });
  return;
 }
 requestTraineeFullscreen();
}
async function saveVideoWatchCompletion(){
 const status=document.getElementById("video-player-status"),finished=document.getElementById("trainee-video-finished");
 if(finished)finished.hidden=false;
 document.querySelectorAll(".trainee-video-controls button").forEach(control=>{control.disabled=true});
 if(status)status.textContent="Video finished. Saving completion…";
 try{
  const response=await fetch("/api/video-watch-completions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({step_index:S.videoStep})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not save video completion.");
  S.videoWatchSaved=true;
  if(!S.completedVideoSteps.includes(S.videoStep))S.completedVideoSteps.push(S.videoStep);
  await loadReplayRequests();
  render();
 }catch(error){
  if(status)status.textContent=`Video ended, but completion could not be saved: ${error instanceof Error?error.message:String(error)}. Please contact HR.`;
  if(finished)finished.hidden=false;
 }
}
async function requestVideoReplay(stepIndex){
 const button=document.querySelector('[data-a="replay-request-send"]'),status=document.getElementById("video-replay-status");
 if(!Number.isInteger(stepIndex)||stepIndex<0||stepIndex>=ST.length||(S.videoStep===stepIndex&&!S.videoWatchSaved)||S.videoReplayRequested)return;
 if(button)button.disabled=true;
 if(status)status.textContent="Sending request to your business HR…";
 try{
  const response=await fetch("/api/video-replay-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({step_index:stepIndex})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not send the replay request.");
  S.videoReplayRequested=true;
  S.replayRequestConfirmStep=null;
  S.videoReplayRequests=[{step_index:stepIndex,status:"pending"},...S.videoReplayRequests.filter(item=>item.step_index!==stepIndex)];
  render();
 }catch(error){
  if(button)button.disabled=false;
  if(status)status.textContent=error instanceof Error?error.message:String(error);
 }
}
function updateTraineeVideoControls(){
 const player=document.getElementById("video-player"),toggle=document.getElementById("trainee-video-toggle"),back=document.getElementById("trainee-video-return"),fullscreen=document.getElementById("trainee-video-fullscreen"),shell=document.getElementById("trainee-video-shell");
 if(toggle&&player){
  const label=player.paused?"Play video":"Pause video";
  toggle.innerHTML=player.paused?VIDEO_ICONS.play:VIDEO_ICONS.pause;
  toggle.setAttribute("aria-label",label);toggle.title=label;
 }
 if(back)back.hidden=S.videoReturnAt==null;
 if(fullscreen){
  const active=document.fullscreenElement===shell,label=active?"Exit fullscreen":"Enter fullscreen";
  fullscreen.innerHTML=active?VIDEO_ICONS.exitFullscreen:VIDEO_ICONS.fullscreen;
  fullscreen.setAttribute("aria-label",label);fullscreen.title=label;
 }
}
async function loadReplayRequests(){
 try{
  const response=await fetch("/api/video-replay-requests");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not load replay requests.");
  if(!Array.isArray(result))throw new Error("The server returned an invalid replay request list.");
  S.videoReplayRequests=result;
  if(S.user&&S.user.role==="trainee"){
   const stepIndex=S.videoStep==null?S.replayGateStep:S.videoStep;
   const request=result.find(item=>item.step_index===stepIndex);
   S.videoReplayRequested=!!(request&&request.status==="pending");
  }
  if(canReviewReplays()){
   S.replayInboxData=result;
   S.pendingReplayCount=result.filter(item=>item.status==="pending").length;
   S.replayInboxMsg="";
  }
 }catch(error){
  if(canReviewReplays()){S.replayInboxData=[];S.pendingReplayCount=0;S.replayInboxMsg=error instanceof Error?error.message:String(error)}
  else S.videoReplayRequests=[];
 }
 if(S.replayInbox||(S.user&&S.user.role==="trainee"&&(S.replayGateStep!=null||(S.video&&S.videoFinished))))render();
 else updateReplayNotificationBadge();
}
function updateReplayNotificationBadge(){
 const bell=document.querySelector(".bell");
 if(!bell||!canReviewReplays())return;
 const count=S.pendingReplayCount||0;
 bell.setAttribute("aria-label",`${count} pending video replay requests`);
 bell.title="Video replay requests";
 let badge=bell.querySelector(".bell-count");
 if(count){
  if(!badge){badge=document.createElement("span");badge.className="bell-count";badge.setAttribute("aria-hidden","true");bell.appendChild(badge)}
  badge.textContent=count>99?"99+":String(count);
 }else if(badge)badge.remove();
}
function startReplayNotificationPolling(){
 if(replayNotificationTimer!==null){clearInterval(replayNotificationTimer);replayNotificationTimer=null}
 if(!S.user||!(S.user.role==="business_hr"||S.user.role==="trainee"))return;
 replayNotificationTimer=setInterval(()=>{
  if(document.visibilityState!=="visible")return;
  if(S.user.role==="business_hr"||S.videoFinished||S.replayGateStep!==null)loadReplayRequests();
 },30000);
}
async function loadVideoCompletions(){
 try{
  const response=await fetch("/api/video-watch-completions");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not load video completion.");
  if(!Array.isArray(result))throw new Error("The server returned an invalid video completion list.");
  S.completedVideoSteps=result.map(item=>item.step_index);
  S.videoCompletionError="";
 }catch(error){
  S.videoCompletionError=error instanceof Error?error.message:String(error);
 }
}
async function loadReplayRequestsForGate(){
 try{
  const response=await fetch("/api/video-replay-requests");
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not check HR approval.");
  if(!Array.isArray(result))throw new Error("The server returned an invalid replay request list.");
  S.videoReplayRequests=result;
  const request=result.find(item=>item.step_index===S.replayGateStep);
  S.videoReplayRequested=!!(request&&request.status==="pending");
  S.replayGateMsg="";
 }catch(error){S.videoReplayRequests=[];S.replayGateMsg=error instanceof Error?error.message:String(error)}
 if(S.video&&S.replayGateStep!=null)render();
}
async function startApprovedReplay(id,requestedStepIndex){
 const stepIndex=Number.isInteger(requestedStepIndex)?requestedStepIndex:S.replayGateStep;
 if(!Number.isInteger(stepIndex)||stepIndex<0||stepIndex>=ST.length)return;
 requestTraineeFullscreen();
 const trainee=ownRec(),folder=trainee?vfolder(biz(trainee),stepIndex):"";
 if(!folder){S.replayGateMsg="The video is no longer mapped. Ask HR for help.";return render()}
 try{
  const response=await fetch(`/api/video-replay-requests/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"used"})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not use the approved replay.");
  S.videoReplayRequests=S.videoReplayRequests.map(item=>item.id===id?{...item,status:"used"}:item);
  S.video=true;S.videoStep=stepIndex;S.replayGateStep=null;S.replayRequestConfirmStep=null;S.videoFinished=false;S.videoWatchSaved=false;S.videoReplayRequested=false;S.videoReturnAt=null;S.videoLatestTime=0;S.videoSeekTarget=null;S.vpre=folder;
  render();
  playVideo(folder,"video-player","video-player-status",true);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(S.videoStep!=null){
   const status=document.getElementById("video-replay-status");
   if(status)status.textContent=message;
  }else{
   S.replayGateMsg=message;
   render();
  }
 }
}
async function reviewVideoReplay(id,status){
 try{
  const response=await fetch(`/api/video-replay-requests/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Could not update the replay request.");
  S.replayInboxMsg=`Request ${status}.`;
  await loadReplayRequests();
 }catch(error){S.replayInboxMsg=error instanceof Error?error.message:String(error);render()}
}

function playVideo(folder,pid="video-player",sid="video-player-status",autoplay=false){
 const player=document.getElementById(pid),status=document.getElementById(sid);
 if(!player||!status)return;
 stopVideoPlayer(pid);
 if(!folder){player.hidden=true;status.textContent="Choose a folder to play its video.";return}
 if(pid==="video-player"&&S.user.role==="trainee"&&S.videoStep!=null){
  player.controls=false;
  player.onended=()=>{S.videoFinished=true;if(!S.completedVideoSteps.includes(S.videoStep))S.completedVideoSteps.push(S.videoStep);saveVideoWatchCompletion()};
  player.ontimeupdate=()=>{S.videoLatestTime=player.currentTime;updateTraineeVideoControls()};
  player.onseeking=()=>{
   if(S.videoSeekTarget!=null&&Math.abs(player.currentTime-S.videoSeekTarget)<0.5){S.videoLatestTime=player.currentTime;S.videoSeekTarget=null;return}
   if(player.currentTime>S.videoLatestTime+1){S.videoSeekTarget=S.videoLatestTime;player.currentTime=S.videoLatestTime;return}
   if(player.currentTime<S.videoLatestTime-1&&S.videoReturnAt==null){
    S.videoReturnAt=S.videoLatestTime;
    const back=document.getElementById("trainee-video-return");if(back)back.hidden=false;
   }
   S.videoLatestTime=player.currentTime;
  };
  player.onplay=updateTraineeVideoControls;
  player.onpause=updateTraineeVideoControls;
 }
 const playlist="/api/videos/"+folder.split("/").map(encodeURIComponent).join("/")+"/index.m3u8";
 player.hidden=false;
 player.onerror=()=>{status.textContent="Could not load this video. Check the playlist and storage."};
 const tryAutoplay=()=>{
  if(!autoplay)return;
  const attempt=player.play();
  if(attempt&&typeof attempt.catch==="function")attempt.catch(error=>{
   status.textContent=error&&error.name==="NotAllowedError"
    ?"Your browser blocked automatic playback. Press Play to begin."
    :"The video could not start. Press Play to try again.";
  });
 };
 status.textContent="Loading playlist…";
 if(player.canPlayType("application/vnd.apple.mpegurl")){
  player.src=playlist;
  tryAutoplay();
  return;
 }
 if(!window.Hls||!window.Hls.isSupported()){
  player.hidden=true;
  status.textContent="HLS playback is not supported in this browser.";
  return;
 }
 const hls=new window.Hls();
 S.hls=hls;
 hls.on(window.Hls.Events.MANIFEST_PARSED,()=>{
  status.textContent="Ready to play.";
  if(autoplay&&player.paused)tryAutoplay();
 });
 hls.on(window.Hls.Events.MEDIA_ATTACHED,()=>{if(autoplay&&player.paused)tryAutoplay()});
 hls.on(window.Hls.Events.ERROR,(_,data)=>{
  if(data.fatal){
   status.textContent="Could not load this video. Check the playlist and storage.";
   hls.destroy();
   if(S.hls===hls)S.hls=null;
  }
 });
 hls.loadSource(playlist);
 hls.attachMedia(player);
 tryAutoplay();
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
 const r=[["Trainee","Business","Department","Designation","Joining date","Salary","Wage","Step","Module","Type","Task","Monitored by","Assigned","Started","Completed"]];
 scoped().forEach(t=>t.logs.forEach(g=>{const x=ST[g.s];r.push([t.name,biz(t),t.dept,t.desg||"",t.join||"",allow("salary")?(t.sal||""):"",allow("salary")?(t.wage||""):"",g.s+1,MODS[x.m].n,x.t,x.n,x.by,g.a||"",g.st||"",g.c||""])}));
 const s=r.map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
 const u=URL.createObjectURL(new Blob([s],{type:"text/csv"})),a=document.createElement("a");a.href=u;a.download="trainee-log.csv";a.click();
}
document.addEventListener("keydown",e=>{
 if(S.video&&S.user&&S.user.role==="trainee"){
  if(["Escape","PrintScreen","ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();return}
 }
 if((e.key==="Enter"||e.key===" ")&&e.target.classList&&e.target.classList.contains("biz-card")){e.preventDefault();e.target.click();return}
 if(e.key==="Escape"){
  const profileMenu=document.querySelector(".profile-menu");
  if(profileMenu&&profileMenu.open){profileMenu.open=false;profileMenu.querySelector("summary").focus();return}
 }
 if((e.key==="Enter"||e.key===" ")&&e.target.classList&&e.target.classList.contains("hy-t")){e.preventDefault();e.target.click();return}
 if(e.key==="Escape"&&(S.modal!=null||S.edit||S.add||S.upload||S.video||S.map||S.settings||S.userManagement||S.userModal||S.userListModal||S.organization||S.permissions)){stopVideoPlayer();stopVideoPlayer("map-player");S.modal=null;S.edit=false;S.add=false;S.addDraft=null;S.upload=false;S.video=false;S.map=false;S.settings=false;S.userManagement=false;S.userModal=false;S.userListModal=false;S.userReturnToList=false;S.userDraft=null;S.organization=false;S.permissions=false;S.permissionDraft=null;S.mplay="";render()}
 else if(e.key==="Enter"&&S.add&&e.target.id.startsWith("add-category-name-")){const entity=e.target.id.slice("add-category-name-".length),b=document.querySelector(`[data-a="category-create"][data-entity="${entity}"]`);if(b)b.click()}
 else if(e.key==="Enter"&&S.add&&e.target.tagName==="INPUT"){const b=document.querySelector('[data-a="add"]');if(b)b.click()}
 else if(e.key==="Enter"&&e.target.id==="en-nm"){const b=document.querySelector('[data-a="esave"]');if(b)b.click()}
});
document.addEventListener("contextmenu",e=>{
 if(S.video&&S.user&&S.user.role==="trainee")e.preventDefault();
});
document.addEventListener("input",e=>{
 if(e.target.id==="org-name")S.orgName=e.target.value;
 if(S.add&&S.addDraft){
  const fields={nm:"name",jd:"date",sl:"salary",wg:"wage"};
  const field=fields[e.target.id];
  if(field)S.addDraft[field]=e.target.value;
 }
 if(e.target.id==="q"){S.q=e.target.value;const l=document.getElementById("tl");if(l)l.innerHTML=listBody()}
 if(e.target.id==="managed-users-search"){
  S.userSearch=e.target.value;
  const caret=e.target.selectionStart;
  render();
  const search=document.getElementById("managed-users-search");
  if(search){search.focus();if(caret!==null)search.setSelectionRange(caret,caret)}
 }
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
async function mapSend(key,folder){
 const r=await fetch("/api/video-map",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,folder})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||"Could not save the mapping.");
 S.vmap=d;
}
async function mapAction(a,b){
 if(a==="mapopen"){S.add=false;S.edit=false;S.modal=null;S.upload=false;S.video=false;stopVideoPlayer();
  S.map=true;S.mplay="";S.mmsg="";S.mfTouched=false;S.mfstat="Loading folders…";render();loadMap().then(()=>S.map&&mapRender());loadMapFolders();return}
 if(a==="mapcancel"){stopVideoPlayer("map-player");S.map=false;S.mplay="";return render()}
 if(a==="mapplay"){S.mplay=b.dataset.f;return mapRender()}
 if(a==="mapstop"){S.mplay="";return mapRender()}
 try{
  if(a==="mapsave"){if(S.mt==null||!S.mf)return;await mapSend(mkey(S.mt),S.mf);S.mmsg="Saved ✓ "+ST[S.mt].n+" now plays "+S.mf;S.mfTouched=false}
  else if(a==="mapremove"){if(!confirm("Remove this video mapping?"))return;await mapSend(b.dataset.k,null);S.mmsg="Mapping removed.";S.mfTouched=false;if(S.mplay&&!Object.values(S.vmap["*"]||{}).includes(S.mplay))S.mplay=""}
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
  await loadMap();
  initView();
  if(S.user.role==="trainee"){await loadVideoCompletions();await loadReplayRequests()}
  else if(S.user.role==="business_hr")await loadReplayRequests();
  render();loadHier();startReplayNotificationPolling();
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
function toggleTheme(){
 const n=curTheme()==="dark"?"light":"dark",h=document.documentElement;
 const apply=()=>{h.dataset.theme=n;try{localStorage.setItem("theme",n)}catch(e){}render()};
 const calm=matchMedia("(prefers-reduced-motion: reduce)").matches;
 if(document.startViewTransition&&!calm){
  // Circle grows from the spot you clicked and paints the new theme (like the reference video)
  const x=S.cx==null?innerWidth-40:S.cx,y=S.cy==null?40:S.cy;
  const r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(apply);
  vt.ready.then(()=>h.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${r}px at ${x}px ${y}px)`]},{duration:800,easing:"cubic-bezier(.65,0,.25,1)",pseudoElement:"::view-transition-new(root)"})).catch(()=>{});
  return;
 }
 h.classList.add("tx");setTimeout(()=>h.classList.remove("tx"),500);
 apply();
 document.querySelectorAll(".tt svg").forEach(v=>v.classList.add("spin"))}

// Soft light that follows the pointer on glass cards (CSS reads --mx / --my)
document.addEventListener("pointermove",e=>{
 const t=e.target.closest&&e.target.closest(".item,.tg>.tl,.bg .card,.settings-action");
 if(!t)return;const r=t.getBoundingClientRect();
 t.style.setProperty("--mx",(e.clientX-r.left)+"px");t.style.setProperty("--my",(e.clientY-r.top)+"px");
},{passive:true});