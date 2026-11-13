// ---- Report dashboard (read-only analytics built from the trainee data already loaded in S.t)
// Uses: MODS, ST, MAXSC, timeStats, modScore, status, biz, esc, hm, allow, scoped, S  (all defined in app.js)
let RPT_LAST=null,RPT_T=0; // animations play when a report view opens, not on every background refresh
const rptReset=()=>{RPT_LAST=null};
const RPT_STALL_DAYS=7; // started trainee with no activity for this many days is flagged "Stalled"

const rptLast=t=>{let m=0;(t.logs||[]).forEach(g=>[g.c,g.st,g.a].forEach(v=>{const x=Date.parse(v);if(Number.isFinite(x)&&x>m)m=x}));return m||null};
const rptAvg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const rptPct=v=>v==null?"–":Math.round(v)+"%";

// One row of metrics per trainee
function rptRow(t){
 const ts=timeStats(t),prog=ts.steps?ts.completedCount/ts.steps*100:0;
 const scored=MODS.map((_,mi)=>modScore(t,mi)).filter(v=>v!=null);
 const last=rptLast(t),idle=last?(Date.now()-last)/86400000:null;
 const started=(t.logs||[]).some(g=>g.st||g.c);
 let state=status(t)[0];
 if(state!=="Completed"&&started&&idle!=null&&idle>=RPT_STALL_DAYS)state="Stalled";
 else if(state==="Assigned – not started"&&!started)state="Not started";
 return {t,ts,prog,avgScore:rptAvg(scored),scored:scored.length,pace:ts.pace,last,idle,state,started};
}
const RPT_STATE_CLASS={"Completed":"rp-ok","In progress":"rp-prog","Ready for next task":"rp-prog","Stalled":"rp-bad","Not started":"rp-mu","Assigned – not started":"rp-mu"};

function rptBar(pct,cls){return `<div class="rp-bar" role="img" aria-label="${rptPct(pct)}"><span class="${cls||""}" style="width:${Math.max(0,Math.min(100,pct||0))}%"></span></div>`}

function rptGroup(rows,keyFn){
 const m=new Map();rows.forEach(r=>{const k=keyFn(r.t)||"–";if(!m.has(k))m.set(k,[]);m.get(k).push(r)});
 return [...m.entries()].map(([k,a])=>({k,n:a.length,done:a.filter(r=>r.state==="Completed").length,
  prog:rptAvg(a.map(r=>r.prog)),score:rptAvg(a.filter(r=>r.avgScore!=null).map(r=>r.avgScore)),pace:rptAvg(a.filter(r=>r.pace!=null).map(r=>r.pace))}))
  .sort((x,y)=>y.n-x.n);
}


// ---- Inline SVG charts (no libraries)
const RPT_HEX={"Completed":"#2f9e6e","In progress":"#2f78b5","Ready for next task":"#5b9bd5","Stalled":"#c0572b","Not started":"#9aa6b2","Assigned – not started":"#9aa6b2"};
function rptDonut(cnt,n,doneLabel){
 const r=52,c=2*Math.PI*r;let off=0;
 const segs=Object.keys(cnt).map((k,ix)=>{const len=cnt[k]/n*c,el=`<circle r="${r}" cx="70" cy="70" fill="none" stroke="${RPT_HEX[k]||"#9aa6b2"}" stroke-width="18" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" class="rp-arc" style="--d:${len} ${c-len};--k:${ix}" transform="rotate(-90 70 70)"><title>${esc(k)}: ${cnt[k]}</title></circle>`;off+=len;return el}).join("");
 return `<svg class="rp-svg" viewBox="0 0 140 140" role="img" aria-label="Status split"><circle r="${r}" cx="70" cy="70" fill="none" stroke="currentColor" opacity=".12" stroke-width="18"/>${segs}<text x="70" y="68" text-anchor="middle" class="rp-big">${n}</text><text x="70" y="86" text-anchor="middle" class="rp-sm">trainees</text></svg>`;
}
function rptColumns(mods){
 const W=420,H=190,pl=28,pb=34,bw=22,gap=(W-pl)/mods.length;
 const grid=[0,50,100].map(v=>{const y=H-pb-(H-pb-10)*v/100;return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".12"/><text x="${pl-5}" y="${y+3}" text-anchor="end" class="rp-sm">${v}</text>`}).join("");
 const bars=mods.map((m,i)=>{
  const x=pl+gap*i+gap/2,ch=(H-pb-10)*(m.comp||0)/100,sh=(H-pb-10)*((m.sc||0)/MAXSC);
  return `<rect style="--k:${i}" x="${x-bw-1}" y="${H-pb-ch}" width="${bw}" height="${ch}" rx="3" fill="#2f78b5"><title>${esc(m.n)}: ${rptPct(m.comp)} complete</title></rect>
  <rect style="--k:${i}" x="${x+1}" y="${H-pb-sh}" width="${bw}" height="${sh}" rx="3" fill="#c79a3f"><title>${esc(m.n)}: score ${m.sc==null?"–":m.sc.toFixed(1)}/${MAXSC}</title></rect>
  <text x="${x}" y="${H-pb+16}" text-anchor="middle" class="rp-sm">M${i+1}</text>`}).join("");
 return `<svg class="rp-svg rp-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="Module completion and score">${grid}${bars}</svg><div class="rp-key"><span><i style="background:#2f78b5"></i>Completion %</span><span><i style="background:#c79a3f"></i>Score (scaled to 100)</span></div>`;
}
function rptTrend(rows){
 const W=420,H=170,pl=28,pb=26,weeks=8,wk=7*864e5,end=Date.now(),pts=[];
 for(let i=weeks-1;i>=0;i--){const a=end-(i+1)*wk,b=end-i*wk;let c=0;rows.forEach(r=>(r.t.logs||[]).forEach(g=>{const x=Date.parse(g.c);if(x>a&&x<=b)c++}));pts.push(c)}
 const mx=Math.max(1,...pts),X=i=>pl+(W-pl-8)*i/(weeks-1),Y=v=>H-pb-(H-pb-14)*v/mx;
 const line=pts.map((v,i)=>(i?"L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)).join(" ");
 const area=line+` L${X(weeks-1)} ${H-pb} L${X(0)} ${H-pb} Z`;
 const dots=pts.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="#2f9e6e"><title>${v} steps completed, ${i===weeks-1?"this week":(weeks-1-i)+" wk ago"}</title></circle>`).join("");
 const lbl=pts.map((v,i)=>i%2===weeks%2?`<text x="${X(i)}" y="${H-8}" text-anchor="middle" class="rp-sm">${i===weeks-1?"now":"-"+(weeks-1-i)+"w"}</text>`:"").join("");
 return `<svg class="rp-svg rp-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="Steps completed per week"><line x1="${pl}" x2="${W}" y1="${H-pb}" y2="${H-pb}" stroke="currentColor" opacity=".2"/><text x="${pl-5}" y="${Y(mx)+3}" text-anchor="end" class="rp-sm">${mx}</text><text x="${pl-5}" y="${H-pb+3}" text-anchor="end" class="rp-sm">0</text><path class="rp-area" d="${area}" fill="#2f9e6e" opacity=".15"/><path class="rp-line" pathLength="1" d="${line}" fill="none" stroke="#2f9e6e" stroke-width="2.5"/>${dots}${lbl}</svg>`;
}
function rptScatter(rows){
 const W=420,H=190,pl=30,pb=28,pts=rows.filter(r=>r.avgScore!=null);
 if(!pts.length)return '<div class="mu">No scores recorded yet.</div>';
 const X=v=>pl+(W-pl-10)*v/100,Y=v=>H-pb-(H-pb-10)*v/MAXSC;
 const grid=[0,5,10].map(v=>`<line x1="${pl}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/><text x="${pl-5}" y="${Y(v)+3}" text-anchor="end" class="rp-sm">${v}</text>`).join("");
 const dots=pts.map(r=>`<circle cx="${X(r.prog)}" cy="${Y(r.avgScore)}" r="6" fill="${RPT_HEX[r.state]||"#9aa6b2"}" fill-opacity=".8" stroke="#fff" stroke-width="1"><title>${esc(r.t.name)}: ${Math.round(r.prog)}% done, avg score ${r.avgScore.toFixed(1)}</title></circle>`).join("");
 return `<svg class="rp-svg rp-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress versus score">${grid}${dots}<text x="${W/2}" y="${H-6}" text-anchor="middle" class="rp-sm">Progress % →</text></svg>`;
}

const rptLetters=t=>[...t].map((ch,i)=>`<span aria-hidden="true" style="--c:${i}">${ch===" "?"&nbsp;":esc(ch)}</span>`).join("");
// Call after every render(): count-up numbers and row stagger (only inside a freshly opened .rp-go report)
function rptAfter(root){
 const r=(root||document).querySelector(".rp.rp-go");if(!r)return;
 r.querySelectorAll(".sc table").forEach(tb=>[...tb.rows].forEach((tr,i)=>tr.style.setProperty("--i",Math.max(0,i-1))));
 if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
 (root||document).querySelectorAll(".tg>.tl>b").forEach(el=>{
  const m=el.textContent.match(/-?\d+(\.\d+)?/);if(!m)return;
  const end=+m[0],dec=m[1]?m[1].length-1:0,pre=el.textContent.slice(0,m.index),post=el.textContent.slice(m.index+m[0].length),t0=performance.now()+350,dur=1200;
  (function f(t){const p=Math.min(1,Math.max(0,(t-t0)/dur)),e=1-Math.pow(1-p,4);el.textContent=pre+(end*e).toFixed(dec)+post;if(p<1&&el.isConnected)requestAnimationFrame(f)})(performance.now());
 });
}
function reportDashboard(bz){ // bz = business name for the business-wise view, empty for the overall view
 const L=bz?scoped().filter(t=>biz(t)===bz):scoped();
 if(!L.length)return bz?`<div class="card"><h2>${esc(bz)} report</h2><div class="mu">No trainees in ${esc(bz)} yet.</div></div>`:"";
 const key=bz||"*",nowT=Date.now(),go=RPT_LAST!==key||nowT-RPT_T<1500;
 if(RPT_LAST!==key){RPT_LAST=key;RPT_T=nowT}
 const rows=L.map(rptRow);
 const n=rows.length,done=rows.filter(r=>r.state==="Completed").length,stalled=rows.filter(r=>r.state==="Stalled");
 const avgProg=rptAvg(rows.map(r=>r.prog)),avgScore=rptAvg(rows.filter(r=>r.avgScore!=null).map(r=>r.avgScore));
 const avgPace=rptAvg(rows.filter(r=>r.pace!=null).map(r=>r.pace));
 const kpi=(l,v,s)=>`<div class="tl"><span class="mu">${l}</span><b>${v}</b><span class="mu">${s}</span></div>`;
 const kpis=`${kpi("Trainees",n,"enrolled")}${kpi("Completed",done,"all tasks completed")}${kpi("Avg progress",rptPct(avgProg),"of "+ST.length+" steps")}${kpi("Avg score",avgScore==null?"–":avgScore.toFixed(1)+" / "+MAXSC,"scored modules")}${kpi("Avg pace",rptPct(avgPace),"time vs plan")}${kpi("Stalled",stalled.length,RPT_STALL_DAYS+"+ days idle")}`;
 const reportTitle=`<h2 class="rp-title" aria-label="${esc(bz?bz+" report":"Overall report")}">${rptLetters(bz?bz+" report":"Overall report")}</h2>`;

 // Module progress: average completion and average score per module
 const mods=MODS.map((m,mi)=>{
  const steps=ST.filter(x=>x.m===mi).length;
  const comp=rptAvg(rows.map(r=>steps?r.ts.modules[mi].completed/steps*100:0));
  const sc=rptAvg(rows.map(r=>modScore(r.t,mi)).filter(v=>v!=null));
  const plan=rows[0].ts.modules[mi].plan,taken=rptAvg(rows.filter(r=>r.ts.modules[mi].completed).map(r=>r.ts.modules[mi].taken));
  return {n:m.n,comp,sc,plan,taken};
 });
 const modHtml=mods.map(m=>`<div class="rp-ml"><div class="sp"><b>${esc(m.n)}</b><span class="mu">${rptPct(m.comp)} complete · score ${m.sc==null?"–":m.sc.toFixed(1)+" / "+MAXSC}</span></div>${rptBar(m.comp)}</div>`).join("");

 // Planned vs actual time by step type (average per trainee, only trainees who completed that type)
 const typeNames={VIDEO:"Videos",TASK:"Tasks",PRE:"Presentations"};
 const typeHtml=["VIDEO","TASK","PRE"].map(k=>{
  const plan=ST.filter(x=>x.t===k).reduce((s,x)=>s+x.mn,0);
  const taken=rptAvg(rows.map(r=>r.ts.byType[k].taken).filter(v=>v>0));
  const mx=Math.max(plan,taken||0)||1;
  return `<div class="rp-ml"><div class="sp"><b>${typeNames[k]}</b><span class="mu">plan ${hm(plan)} · actual avg ${taken==null?"–":hm(Math.round(taken))}</span></div>
   <div class="rp-dual"><div class="rp-bar"><span class="rp-plan" style="width:${plan/mx*100}%"></span></div><div class="rp-bar"><span class="${taken>plan?"rp-over":"rp-act"}" style="width:${(taken||0)/mx*100}%"></span></div></div></div>`}).join("");

 // Status split
 const order=["Completed","In progress","Ready for next task","Stalled","Not started","Assigned – not started"];
 const cnt={};rows.forEach(r=>cnt[r.state]=(cnt[r.state]||0)+1);
 const statusHtml=order.filter(k=>cnt[k]).map(k=>`<div class="rp-st"><span class="rp-dot ${RPT_STATE_CLASS[k]}"></span><span>${esc(k)}</span><b>${cnt[k]}</b></div>`).join("");

 // Business / department tables
 const grp=(title,list)=>`<div class="card"><h2>${title}</h2><div class="sc"><table><tr><th>${title.replace("By ","")}</th><th>Trainees</th><th>Completed</th><th>Avg progress</th><th>Avg score</th><th>Pace</th></tr>${
  list.map(g=>`<tr><td>${esc(g.k)}</td><td>${g.n}</td><td>${g.done}</td><td><div class="rp-cell">${rptBar(g.prog)}<span>${rptPct(g.prog)}</span></div></td><td>${g.score==null?"–":g.score.toFixed(1)+" / "+MAXSC}</td><td>${rptPct(g.pace)}</td></tr>`).join("")}</table></div></div>`;

 // Attention list + leaderboard
 const attn=stalled.length?`<div class="card rp-attn"><h2>Needs attention</h2><div class="mu" style="margin-bottom:.5rem">Started, but no activity for ${RPT_STALL_DAYS}+ days.</div>${stalled.sort((a,b)=>b.idle-a.idle).map(r=>`<div class="sp rp-li"><span><b>${esc(r.t.name)}</b> <span class="mu">${esc(biz(r.t))} · ${esc(r.t.dept||"")}</span></span><span class="mu">${Math.floor(r.idle)} days idle · ${Math.round(r.prog)}% done</span></div>`).join("")}</div>`:"";
 const sorted=[...rows].sort((a,b)=>b.prog-a.prog||((b.avgScore||0)-(a.avgScore||0)));
 const board=`<div class="card"><div class="sp"><h2>Trainee leaderboard</h2>${allow("csv")?`<button class="sm" data-a="report-csv" data-biz="${esc(bz||"")}">Export report CSV</button>`:""}</div><div class="sc"><table><tr><th>#</th><th>Trainee</th><th>Business</th><th>Department</th><th>Progress</th><th>Avg score</th><th>Pace</th><th>Last activity</th><th>Status</th></tr>${
  sorted.map((r,i)=>`<tr><td>${i+1}</td><td><b>${esc(r.t.name)}</b></td><td>${esc(biz(r.t))}</td><td>${esc(r.t.dept||"")}</td><td><div class="rp-cell">${rptBar(r.prog)}<span>${r.ts.completedCount}/${r.ts.steps}</span></div></td><td>${r.avgScore==null?"–":r.avgScore.toFixed(1)}</td><td>${rptPct(r.pace)}</td><td>${r.last?new Date(r.last).toLocaleDateString():"–"}</td><td><span class="rp-pill ${RPT_STATE_CLASS[r.state]||""}">${esc(r.state)}</span></td></tr>`).join("")}</table></div><div class="mu">Pace = time taken as % of planned time on completed steps (under 100% is faster than plan). Avg score is across scored modules only.</div></div>`;

 return `<div class="rp${go?" rp-go":""}">${reportTitle}
  <div class="tg">${kpis}</div>
  <div class="rp-charts"><div class="card"><h2>Status mix</h2><div class="rp-donut">${rptDonut(cnt,n)}<div>${statusHtml}</div></div></div><div class="card"><h2>Completion and score by module</h2>${rptColumns(mods)}</div><div class="card"><h2>Steps completed per week</h2>${rptTrend(rows)}</div><div class="card"><h2>Progress vs score</h2>${rptScatter(rows)}<div class="mu">Each dot is a trainee, colored by status.</div></div></div>
  <div class="rp-grid"><div class="card"><h2>Module progress</h2>${modHtml}</div>
  <div><div class="card"><h2>Planned vs actual time</h2>${typeHtml}<div class="rp-key"><span><i class="rp-plan"></i>Planned</span><span><i class="rp-act"></i>Actual</span><span><i class="rp-over"></i>Over plan</span></div></div></div></div>
  ${attn}${bz?"":grp("By business",rptGroup(rows,t=>biz(t)))}${grp("By department",rptGroup(rows,t=>t.dept))}${board}</div>`;
}

function reportCsv(bz){
 const q=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
 const head=["Trainee","Business","Department","Designation","Joining date","Steps completed","Total steps","Progress %","Avg module score","Modules scored","Pace %","Time taken (min)","Last activity","Status"];
 const body=scoped().filter(t=>!bz||biz(t)===bz).map(rptRow).map(r=>[r.t.name,biz(r.t),r.t.dept,r.t.desg||"",r.t.join||"",r.ts.completedCount,r.ts.steps,Math.round(r.prog),r.avgScore==null?"":r.avgScore.toFixed(2),r.scored,r.pace==null?"":r.pace,r.ts.taken,r.last?new Date(r.last).toISOString():"",r.state]);
 const s=[head,...body].map(a=>a.map(q).join(",")).join("\n");
 const u=URL.createObjectURL(new Blob([s],{type:"text/csv"})),a=document.createElement("a");a.href=u;a.download=bz?"trainee-report-"+bz.replace(/[^\w-]+/g,"_")+".csv":"trainee-report.csv";a.click();
}