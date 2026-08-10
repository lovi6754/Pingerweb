const $=id=>document.getElementById(id);
let projects=[];
const TOKEN_KEY="my_pinger_token";

function token(){return localStorage.getItem(TOKEN_KEY)||"";}
function authHeaders(){const t=token();return t?{"Authorization":"Bearer "+t}:{};}

async function api(url,options={}){
  const headers={"Content-Type":"application/json",...authHeaders(),...(options.headers||{})};
  const r=await fetch(url,{...options,headers});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){showLogin();throw new Error("Session expired. Please login again.");}
  if(!r.ok)throw new Error(d.error||"Request failed");
  return d;
}

function showLogin(){
  $("loginScreen").classList.remove("hidden");
  $("appShell").classList.add("hidden");
}
function showApp(){
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
}
async function start(){
  if(!token()){showLogin();return;}
  try{await api("/api/auth/check");showApp();await load();}
  catch(e){localStorage.removeItem(TOKEN_KEY);showLogin();}
}
async function login(e){
  e.preventDefault();
  $("loginError").textContent="";
  try{
    const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:$("loginKey").value.trim()})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Invalid access key.");
    localStorage.setItem(TOKEN_KEY,d.token);
    $("loginKey").value="";
    showApp();
    await load();
  }catch(err){$("loginError").textContent=err.message;}
}
async function logout(){
  try{await api("/api/logout",{method:"POST"});}catch(_){}
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}
$("loginForm").addEventListener("submit",login);
$("showKey").addEventListener("click",()=>{
  const i=$("loginKey");
  i.type=i.type==="password"?"text":"password";
  $("showKey").textContent=i.type==="password"?"Show":"Hide";
});
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function ago(v){if(!v)return"Never";const m=Math.floor((Date.now()-new Date(v))/60000);return m<1?"Just now":m<60?`${m} min ago`:`${Math.floor(m/60)}h ${m%60}m ago`;}

function render(){
  $("total").textContent=projects.length;
  $("online").textContent=projects.filter(x=>x.status==="ONLINE").length;
  $("issues").textContent=projects.filter(x=>["OFFLINE","ERROR"].includes(x.status)).length;
  $("updated").textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  $("count").textContent=`${projects.length} monitored endpoint${projects.length===1?"":"s"}`;

  if(!projects.length){
    $("projects").innerHTML='<div class="empty">No projects added yet.<br>Add your first URL above.</div>';
    $("next").textContent="Waiting";
    return;
  }

  const next=projects.filter(x=>x.active&&x.lastPing).map(x=>new Date(x.lastPing).getTime()+x.intervalMinutes*60000).sort((a,b)=>a-b)[0];
  $("next").textContent=next?new Date(next).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Within 1 min";

  $("projects").innerHTML=projects.map(p=>`
  <article class="project">
    <div class="project-head">
      <div><div class="name">${esc(p.name)}</div><div class="url">${esc(p.url)}</div></div>
      <span class="badge ${esc(p.status)}">${esc(p.status)}</span>
    </div>
    <div class="metrics">
      <div class="metric"><small>HTTP</small><b>${p.httpCode??"—"}</b></div>
      <div class="metric"><small>RESPONSE</small><b>${p.responseMs!=null?p.responseMs+" ms":"—"}</b></div>
      <div class="metric"><small>INTERVAL</small><b>${p.intervalMinutes} min</b></div>
    </div>
    <div class="last">Last ping: ${ago(p.lastPing)}${p.lastPing?" • "+new Date(p.lastPing).toLocaleString():""}</div>
    ${p.lastError?`<div class="err">${esc(p.lastError)}</div>`:""}
    <div class="actions">
      <button onclick="ping('${p._id}')">↯ Ping now</button>
      <button onclick="toggleProject('${p._id}',${!p.active})">${p.active?"Pause":"Resume"}</button>
      <button class="danger" onclick="removeProject('${p._id}')">Delete</button>
    </div>
  </article>`).join("");
}

async function load(){try{projects=await api("/api/projects");render()}catch(e){toast(e.message,true)}}
async function ping(id){toast("Pinging…");try{await api(`/api/projects/${id}/ping`,{method:"POST"});await load();toast("Ping completed.")}catch(e){toast(e.message,true)}}
async function toggleProject(id,active){try{await api(`/api/projects/${id}`,{method:"PATCH",body:JSON.stringify({active})});await load()}catch(e){toast(e.message,true)}}
async function removeProject(id){if(!confirm("Remove this project?"))return;try{await api(`/api/projects/${id}`,{method:"DELETE"});await load();toast("Project removed.")}catch(e){toast(e.message,true)}}
function toast(t,error=false){$("toast").textContent=t;$("toast").style.color=error?"#ff8997":"#9eacd0";}

$("form").addEventListener("submit",async e=>{
  e.preventDefault();toast("Adding project and running first ping…");
  try{
    await api("/api/projects",{method:"POST",body:JSON.stringify({name:$("name").value.trim(),url:$("url").value.trim(),interval:Number($("interval").value)})});
    e.target.reset();$("interval").value="10";await load();toast("Project added successfully.");
  }catch(err){toast(err.message,true)}
});
load();
setInterval(load,30000);