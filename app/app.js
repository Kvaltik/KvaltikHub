// Kvaltík Hub persistent storage.
// Desktop verze ukládá data do Electron userData, takže nezávisí na náhodném HTTP portu.
const hubStorage = window.kvaltikDesktop?.storageGet ? {
  getItem(key){
    const value=window.kvaltikDesktop.storageGet(key);
    return value===undefined||value===null?null:String(value);
  },
  setItem(key,value){
    window.kvaltikDesktop.storageSet(key,String(value));
  },
  removeItem(key){
    window.kvaltikDesktop.storageRemove(key);
  }
} : localStorage;

const USERS_KEY="kvaltikHubUsersV2";
const SESSION_KEY="kvaltikHubSessionV2";

const defaultUserData={
  ets2:[],farming:[],gallery:[],
  about:{name:"Kvaltík",motto:"Farming • ETS 2 • YouTube",bio:"Farming, kamiony, doprava a tvorba videí.",profileImage:""},
  socials:{youtube:"",instagram:"",twitch:"",tiktok:"",web:""},
  discord:{name:"Kvaltík Community",invite:"",description:"Přidej odkaz na svůj Discord server."},
  company:null,drivers:[],fleet:[],finance:[],
  etsFinance:[],farmMachines:[],farmFields:[],farmStorage:[],farmFinance:[],farmJobs:[],farmFuel:[],fieldHistory:[],
  friends:[],weatherCity:"Praha",
  planner:[],notifications:[],youtubeVideos:[],etsService:[],farmManagement:[],pins:[],musicFavorites:[],musicHistory:[],
  trash:[],budgets:{ets:0,farming:0,monthly:0},security:{pinHash:"",autoLockMinutes:0},weatherCities:["Praha"],
  backupSettings:{daily:true,keep:10,lastDate:""},youtubeTemplates:[],
  farmProfiles:[],activeFarmId:"",onboardingDone:false,
  dashboardWidgets:{weather:true,clock:true,finance:true,nextService:true,lastTrip:true,nowPlaying:true,nextStream:true},
  betaFeatures:{experimentalTab:false,newCharts:true,weatherAlerts:false},
  updateSettings:{autoCheck:true,autoDownload:false,backupBeforeUpdate:true,channel:"stable"},
  projects:[],notes:[],theme:"dark"
};

let currentUser=null;
let data=structuredClone(defaultUserData);
let autoLockTimer=null,lastIdleReset=0;
function scheduleAutoLock(){
  clearTimeout(autoLockTimer);autoLockTimer=null;
  const minutes=Number(data.security?.autoLockMinutes||0);
  if(!currentUser||!data.security?.pinHash||minutes<=0)return;
  autoLockTimer=setTimeout(()=>{
    const entered=prompt("Kvaltík Hub byl automaticky uzamčen. Zadej PIN:");
    if(entered===null||simpleHash(entered)!==data.security.pinHash){clearSession();currentUser=null;showAuth();toast("Aplikace zůstala uzamčená.");return}
    toast("Kvaltík Hub byl odemčen.");scheduleAutoLock();
  },minutes*60000);
}
function resetAutoLock(){const now=Date.now();if(now-lastIdleReset<10000)return;lastIdleReset=now;scheduleAutoLock()}
document.addEventListener("click",resetAutoLock);document.addEventListener("keydown",resetAutoLock);document.addEventListener("mousemove",resetAutoLock);

function getUsers(){try{return JSON.parse(hubStorage.getItem(USERS_KEY))||{}}catch{return {}}}
function saveUsers(users){hubStorage.setItem(USERS_KEY,JSON.stringify(users))}
function simpleHash(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}
function userDataKey(username){return "kvaltikHubDataV2_"+username.toLowerCase()}
function loadUserData(username){
  try{
    const saved=JSON.parse(hubStorage.getItem(userDataKey(username)));
    return saved?{...structuredClone(defaultUserData),...saved}:structuredClone(defaultUserData)
  }catch{return structuredClone(defaultUserData)}
}
function saveData(message){
  if(!currentUser)return;
  saveActiveFarmSnapshot();
  hubStorage.setItem(userDataKey(currentUser.username),JSON.stringify(data));
  renderAll();
  if(message)toast(message);
}
const farmDataKeys=["farming","farmMachines","farmFields","farmStorage","farmFinance","farmJobs","farmFuel","fieldHistory","farmManagement","planner","gallery","friends"];
function farmSnapshot(){return Object.fromEntries(farmDataKeys.map(k=>[k,structuredClone(data[k]||[])]))}
function saveActiveFarmSnapshot(){const profile=(data.farmProfiles||[]).find(x=>x.id===data.activeFarmId);if(profile)profile.snapshot=farmSnapshot()}
function renderFarmProfiles(){const select=document.getElementById("activeFarmSelect");if(!select)return;const profiles=data.farmProfiles||[];select.innerHTML=profiles.map(x=>`<option value="${esc(x.id)}" ${x.id===data.activeFarmId?'selected':''}>${esc(x.name)}</option>`).join('')||'<option value="">Moje farma</option>'}
function createFarmProfile(values,useCurrent=false){const profile={id:"farmprofile_"+Date.now(),name:values.name,map:values.map||"",manager:values.manager||"",created:values.created||new Date().toISOString().slice(0,10),snapshot:useCurrent?farmSnapshot():Object.fromEntries(farmDataKeys.map(k=>[k,[]]))};data.farmProfiles=data.farmProfiles||[];data.farmProfiles.push(profile);data.activeFarmId=profile.id;if(!useCurrent)farmDataKeys.forEach(k=>data[k]=[]);data.onboardingDone=true;return profile}
function farmProfileFields(){return[{name:"name",label:"Název farmy",required:true,full:true},{name:"map",label:"Mapa / herní kariéra"},{name:"manager",label:"Správce farmy"},{name:"created",label:"Založeno",type:"date"}]}
function ensureFarmOnboarding(){if(data.onboardingDone&&data.farmProfiles?.length){renderFarmProfiles();return}openModal("Vítej v Kvaltík Hub Farming",farmProfileFields(),o=>{createFarmProfile(o,true);saveData("Farma je připravená. Vítej!")},{name:"Moje farma",manager:currentUser?.username||"",created:new Date().toISOString().slice(0,10)})}
function setSession(username,remember=true){
  if(remember){
    hubStorage.setItem(SESSION_KEY,username);
    sessionStorage.removeItem(SESSION_KEY);
  }else{
    hubStorage.removeItem(SESSION_KEY);
    sessionStorage.setItem(SESSION_KEY,username);
  }
}
function clearSession(){
  hubStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

const authScreen=document.getElementById("authScreen");
const appShell=document.getElementById("appShell");

function showApp(){
  if(data.security?.pinHash){
    const entered=prompt("Zadej PIN pro odemknutí Kvaltík Hubu:");
    if(entered===null||simpleHash(entered)!==data.security.pinHash){toast("Nesprávný PIN.");currentUser=null;showAuth();return}
  }
  ensureDailyBackup();
  authScreen.classList.add("hidden");
  appShell.classList.remove("locked");
  document.getElementById("loggedUserLabel").textContent="👤 "+currentUser.username;
  document.getElementById("accountInfo").textContent=`Uživatel: ${currentUser.username} • E-mail: ${currentUser.email}`;
  document.getElementById("welcomeTitle").textContent=`Vítej, ${data.about.name||currentUser.username}! 🚜🚛`;
  renderAll();
  setTimeout(ensureFarmOnboarding,250);
  scheduleAutoLock();
  setTimeout(()=>initUpdaterUi(true),1000);
}
function showAuth(){
  authScreen.classList.remove("hidden");
  appShell.classList.add("locked");
  const loading=document.getElementById("loadingScreen");
  if(loading){
    loading.classList.add("hide");
    setTimeout(()=>loading.remove(),500);
  }
}

function login(username,password,remember=true){
  const users=getUsers();
  const key=username.trim().toLowerCase();
  const user=users[key];
  if(!user||user.passwordHash!==simpleHash(password))return false;
  currentUser={username:user.username,email:user.email};
  data=loadUserData(user.username);
  setSession(user.username,remember);
  showApp();
  return true;
}
function register(username,email,password){
  const users=getUsers();
  const key=username.trim().toLowerCase();
  if(users[key])return {ok:false,msg:"Toto uživatelské jméno už existuje."};
  users[key]={username:username.trim(),email:email.trim(),passwordHash:simpleHash(password)};
  saveUsers(users);
  hubStorage.setItem(userDataKey(username),JSON.stringify(structuredClone(defaultUserData)));
  return {ok:true};
}
document.querySelectorAll(".auth-tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".auth-tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".auth-form").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.auth+"Form").classList.add("active");
});
document.getElementById("loginForm").onsubmit=e=>{
  e.preventDefault();
  const remember=document.getElementById("rememberLogin").checked;
  if(!login(
    document.getElementById("loginUsername").value,
    document.getElementById("loginPassword").value,
    remember
  )){
    toast("Nesprávné jméno nebo heslo.");
  }
};
document.getElementById("registerForm").onsubmit=e=>{
  e.preventDefault();
  const u=document.getElementById("registerUsername").value.trim();
  const email=document.getElementById("registerEmail").value.trim();
  const p=document.getElementById("registerPassword").value;
  const p2=document.getElementById("registerPassword2").value;
  if(p!==p2){toast("Hesla se neshodují.");return}
  const r=register(u,email,p);
  if(!r.ok){toast(r.msg);return}
  toast("Účet byl vytvořen. Teď se můžeš přihlásit.");
  document.querySelector('[data-auth="login"]').click();
  document.getElementById("loginUsername").value=u;
};
document.getElementById("logoutBtn").onclick=()=>{clearSession();currentUser=null;data=structuredClone(defaultUserData);showAuth()};
document.getElementById("addFarmProfileBtn").onclick=()=>openModal("Nová farma",farmProfileFields(),o=>{saveActiveFarmSnapshot();createFarmProfile(o,false);saveData("Nová farma byla vytvořena.")},{created:new Date().toISOString().slice(0,10)});
document.getElementById("activeFarmSelect").onchange=e=>{saveActiveFarmSnapshot();const profile=data.farmProfiles.find(x=>x.id===e.target.value);if(!profile)return;data.activeFarmId=profile.id;farmDataKeys.forEach(k=>data[k]=structuredClone(profile.snapshot?.[k]||[]));saveData(`Aktivní farma: ${profile.name}`)};

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function safeHttpUrl(value){try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)?url.href:""}catch{return""}}
function formatDate(v){if(!v)return"—";return new Date(v+"T12:00:00").toLocaleDateString("cs-CZ")}
function number(v){return new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:1}).format(Number(v||0))}
function euro(v){return new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:0}).format(Number(v||0))+" €"}

const pages={
  dashboard:["Přehled farmy","Stroje, pole, práce, servis a finance"],ets2:["ETS 2","Kniha jízd Euro Truck Simulator 2"],company:["Virtuální firma","ETS 2 dopravní společnost"],
  "ets-fleet":["ETS 2 – Vozový park","Tahače a firemní vozidla"],
  "ets-finance":["ETS 2 – Finance","Příjmy a výdaje"],
  "farm-machines":["Farming – Stroje","Evidence zemědělské techniky"],
  "farm-fields":["Farming – Pole","Pole, plodiny a stavy"],
  "farm-storage":["Farming – Sklady","Sila, sklady a zásoby"],
  "farm-finance":["Farming – Finance","Příjmy a výdaje farmy"],
  "farm-jobs":["Zakázky a práce","Plánování a průběh farmářských zakázek"],
  "farm-fuel":["Tankování","Spotřeba paliva a provozní náklady"],
  "field-history":["Historie polí","Práce, plodiny, výnosy a náklady podle polí"],
  friends:["Tým farmy","Přátelé, spoluhráči a společné práce"],
  planner:["Chytrý plánovač","Kalendář, úkoly a připomínky"],notifications:["Centrum oznámení","Historie důležitých událostí"],
  youtube:["YouTube centrum","Tvorba videí od nápadu po vydání"],statistics:["Statistiky","Výsledky, grafy a rekordy"],
  "ets-service":["ETS 2 servis","Servisní historie a plánované intervaly"],"farm-management":["Farming management","Kompletní správa farmy"],
  search:["Globální vyhledávání","Hledání, oblíbené, widgety a exporty"],
  tools:["Nástroje 19.1","Zálohy, reporty, rozpočty, počasí a zabezpečení"],
  farming:["Farming","Kniha jízd a prací"],gallery:["Obrázky","Screenshoty a náhledovky"],socials:["Sociální sítě","Odkazy na profily"],discord:["Discord","Komunitní server"],
  projects:["Další projekty","Nápady a rozpracované věci"],notes:["Poznámky","Rychlé zápisky"],settings:["Nastavení","Zálohy a účet"]
};
function goTo(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav-item,.nav-subitem").forEach(x=>x.classList.remove("active"));
  document.getElementById("page-"+page)?.classList.add("active");
  const navTarget=document.querySelector(`[data-page="${page}"]`);
  navTarget?.classList.add("active");
  navTarget?.closest(".nav-folder")?.classList.add("open");
  document.getElementById("pageTitle").textContent=pages[page][0];
  document.getElementById("pageSubtitle").textContent=pages[page][1];
  document.getElementById("sidebar").classList.remove("open");
  if(page==="tools")loadForecast(data.weatherCity||"Praha");
}
document.querySelectorAll(".nav-item,.nav-subitem").forEach(b=>b.onclick=()=>goTo(b.dataset.page));
document.querySelectorAll(".nav-folder-toggle").forEach(b=>b.onclick=()=>b.closest(".nav-folder").classList.toggle("open"));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>goTo(b.dataset.go));

function renderDashboard(){
  document.getElementById("statEtsTrips").textContent=data.farmMachines.length;
  document.getElementById("statEtsKm").textContent=number(data.farmMachines.reduce((s,x)=>s+Number(x.hours||0),0))+" h";
  document.getElementById("statFarmJobs").textContent=data.farming.length;
  document.getElementById("statImages").textContent=data.farmFields.length;
  const activeFarm=data.farmProfiles?.find(x=>x.id===data.activeFarmId);
  document.getElementById("welcomeTitle").textContent=`${activeFarm?.name||"Moje farma"} • ${data.about.name||currentUser?.username||"Kvaltík"} 🚜`;

  const services=data.farmMachines.filter(m=>Number(m.nextServiceHours)>0).sort((a,b)=>(Number(a.nextServiceHours)-Number(a.hours||0))-(Number(b.nextServiceHours)-Number(b.hours||0))).slice(0,4);
  document.getElementById("recentEts").innerHTML=services.length?services.map(m=>{const left=Number(m.nextServiceHours)-Number(m.hours||0);return `<div class="mini-item"><strong>${esc(m.brand)} ${esc(m.model)}</strong><small>${left<=0?'⚠️ Servis je potřeba provést':`Do servisu zbývá ${number(left)} h`}</small></div>`}).join(""):`<div class="empty">Zatím není naplánovaný žádný servis.</div>`;
  const farm=[...data.farming].slice(-4).reverse();
  document.getElementById("recentFarm").innerHTML=farm.length?farm.map(x=>`<div class="mini-item"><strong>${esc(x.work)}</strong><small>${formatDate(x.date)} • ${esc(x.machine)} • ${esc(x.map)}</small></div>`).join(""):`<div class="empty">Zatím tu není žádná Farming práce.</div>`;
}
function renderEts(){
  const tbody=document.getElementById("etsTableBody");
  const totalKm=data.ets2.reduce((s,x)=>s+Number(x.km||0),0);
  const totalIncome=data.ets2.reduce((s,x)=>s+Number(x.income||0),0);
  const companyTrips=data.ets2.filter(x=>x.companyId&&data.company&&x.companyId===data.company.id).length;
  document.getElementById("etsTripsStat").textContent=data.ets2.length;
  document.getElementById("etsKmStat").textContent=number(totalKm)+" km";
  document.getElementById("etsIncomeStat").textContent=euro(totalIncome);
  document.getElementById("etsCompanyTripsStat").textContent=companyTrips;
  tbody.innerHTML=data.ets2.length?[...data.ets2].reverse().map((x,ri)=>{
    const i=data.ets2.length-1-ri;
    const companyName=x.companyId&&data.company&&x.companyId===data.company.id?data.company.name:(x.company||"—");
    return `<tr><td>${formatDate(x.date)}</td><td><strong>${esc(x.from)} → ${esc(x.to)}</strong></td><td>${esc(x.truck)}</td><td>${esc(x.cargo)}</td><td>${esc(companyName||"—")}</td><td>${number(x.km)} km</td><td>${euro(x.income)}</td><td><button class="action-btn" onclick="editEts(${i})">✏️</button><button class="action-btn" onclick="deleteEts(${i})">🗑️</button></td></tr>`;
  }).join(""):`<tr><td colspan="8"><div class="empty">Zatím nemáš žádnou jízdu.</div></td></tr>`;
}

function currentCompanyTrips(){
  if(!data.company)return [];
  return data.ets2.filter(x=>x.companyId===data.company.id);
}
function renderCompany(){
  const empty=document.getElementById("companyEmpty");
  const content=document.getElementById("companyContent");
  if(!data.company){
    empty.style.display="block";content.style.display="none";return;
  }
  empty.style.display="none";content.style.display="block";
  const c=data.company;
  document.getElementById("companyNameDisplay").textContent=c.name||"Virtuální firma";
  document.getElementById("companyDescDisplay").textContent=c.description||"Bez popisu";
  document.getElementById("companyHqDisplay").textContent="📍 "+(c.hq||"Neuvedeno");
  document.getElementById("companyFoundedDisplay").textContent="📅 "+(c.founded?formatDate(c.founded):"Neuvedeno");
  const logo=document.getElementById("companyLogoBox");
  if(c.logo){logo.style.backgroundImage=`url("${c.logo}")`;logo.textContent=""}else{logo.style.backgroundImage="";logo.textContent=(c.name||"K").charAt(0).toUpperCase()}

  const trips=currentCompanyTrips();
  const km=trips.reduce((s,x)=>s+Number(x.km||0),0);
  const revenue=trips.reduce((s,x)=>s+Number(x.income||0),0);
  const extraIncome=data.finance.filter(x=>x.type==="Příjem").reduce((s,x)=>s+Number(x.amount||0),0);
  const expenses=data.finance.filter(x=>x.type==="Výdaj").reduce((s,x)=>s+Number(x.amount||0),0);
  document.getElementById("companyTripsStat").textContent=trips.length;
  document.getElementById("companyKmStat").textContent=number(km)+" km";
  document.getElementById("companyIncomeStat").textContent=euro(revenue);
  document.getElementById("companyDriversStat").textContent=data.drivers.length;
  document.getElementById("companyRevenue").textContent=euro(revenue);
  document.getElementById("companyExtraIncome").textContent=euro(extraIncome);
  document.getElementById("companyExpenses").textContent=euro(expenses);
  document.getElementById("companyBalance").textContent=euro(revenue+extraIncome-expenses);

  document.getElementById("companyRecentTrips").innerHTML=trips.length?[...trips].slice(-5).reverse().map(x=>`<div class="mini-item"><strong>${esc(x.from)} → ${esc(x.to)}</strong><small>${formatDate(x.date)} • ${esc(x.truck)} • ${number(x.km)} km • ${euro(x.income)}</small></div>`).join(""):`<div class="empty">Zatím nejsou žádné firemní jízdy.</div>`;

  document.getElementById("driversGrid").innerHTML=data.drivers.length?data.drivers.map((d,i)=>{
    const driverTrips=trips.filter(t=>t.driverId===d.id);
    const dkm=driverTrips.reduce((s,x)=>s+Number(x.km||0),0);
    const dinc=driverTrips.reduce((s,x)=>s+Number(x.income||0),0);
    return `<div class="driver-card"><h4>👤 ${esc(d.name)}</h4><p>${esc(d.role||"Řidič")}</p><div class="card-kpis"><div class="card-kpi"><small>Jízdy</small><strong>${driverTrips.length}</strong></div><div class="card-kpi"><small>Kilometry</small><strong>${number(dkm)} km</strong></div><div class="card-kpi"><small>Výdělek</small><strong>${euro(dinc)}</strong></div><div class="card-kpi"><small>Datum nástupu</small><strong>${d.joined?formatDate(d.joined):"—"}</strong></div></div><div class="card-actions"><button class="secondary-btn" onclick="editDriver(${i})">Upravit</button><button class="danger-btn" onclick="deleteDriver(${i})">Smazat</button></div></div>`
  }).join(""):`<div class="empty" style="grid-column:1/-1">Zatím nemáš žádné řidiče.</div>`;

  document.getElementById("fleetGrid").innerHTML=data.fleet.length?data.fleet.map((v,i)=>`<div class="vehicle-card"><h4>🚛 ${esc(v.brand)} ${esc(v.model)}</h4><p>${esc(v.plate||"Bez SPZ")}</p><div class="card-kpis"><div class="card-kpi"><small>Typ</small><strong>${esc(v.type||"Tahač")}</strong></div><div class="card-kpi"><small>Stav km</small><strong>${number(v.odometer)} km</strong></div><div class="card-kpi"><small>Výkon</small><strong>${esc(v.power||"—")}</strong></div><div class="card-kpi"><small>Stav</small><strong>${esc(v.status||"Aktivní")}</strong></div></div><div class="card-actions"><button class="secondary-btn" onclick="editVehicle(${i})">Upravit</button><button class="danger-btn" onclick="deleteVehicle(${i})">Smazat</button></div></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Vozový park je zatím prázdný.</div>`;

  document.getElementById("financeTableBody").innerHTML=data.finance.length?[...data.finance].reverse().map((f,ri)=>{const i=data.finance.length-1-ri;return `<tr><td>${formatDate(f.date)}</td><td>${esc(f.type)}</td><td>${esc(f.category)}</td><td>${esc(f.description||"—")}</td><td>${f.type==="Výdaj"?"−":"+"}${euro(f.amount)}</td><td><button class="action-btn" onclick="editFinance(${i})">✏️</button><button class="action-btn" onclick="deleteFinance(${i})">🗑️</button></td></tr>`}).join(""):`<tr><td colspan="6"><div class="empty">Zatím tu nejsou žádné finanční položky.</div></td></tr>`;
}


function renderEtsFleetPage(){
  const el=document.getElementById("etsFleetCards"); if(!el)return;
  el.innerHTML=data.fleet.length?data.fleet.map((v,i)=>`<div class="vehicle-card"><h4>🚛 ${esc(v.brand)} ${esc(v.model)}</h4><p>${esc(v.plate||"Bez SPZ")}</p><div class="card-kpis"><div class="card-kpi"><small>Typ</small><strong>${esc(v.type||"Tahač")}</strong></div><div class="card-kpi"><small>Stav km</small><strong>${number(v.odometer)} km</strong></div><div class="card-kpi"><small>Výkon</small><strong>${esc(v.power||"—")}</strong></div><div class="card-kpi"><small>Stav</small><strong>${esc(v.status||"Aktivní")}</strong></div></div><div class="card-actions"><button class="secondary-btn" onclick="editVehicle(${i})">Upravit</button><button class="danger-btn" onclick="deleteVehicle(${i})">Smazat</button></div></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Vozový park je prázdný.</div>`;
}
function renderMoneySection(items,prefix,tableId){
  const income=items.filter(x=>x.type==="Příjem").reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=items.filter(x=>x.type==="Výdaj").reduce((s,x)=>s+Number(x.amount||0),0);
  document.getElementById(prefix+"Income").textContent=euro(income);
  document.getElementById(prefix+"Expense").textContent=euro(expense);
  document.getElementById(prefix+"Balance").textContent=euro(income-expense);
  document.getElementById(prefix+"Count").textContent=items.length;
  const table=document.getElementById(tableId);
  table.innerHTML=items.length?[...items].reverse().map((f,ri)=>{const i=items.length-1-ri;const del=prefix==="etsFinance"?"deleteEtsFinance":"deleteFarmFinance";const edit=prefix==="etsFinance"?"editEtsFinance":"editFarmFinance";return `<tr><td>${formatDate(f.date)}</td><td>${esc(f.type)}</td><td>${esc(f.category)}</td><td>${esc(f.description||"—")}</td><td>${f.type==="Výdaj"?"−":"+"}${euro(f.amount)}</td><td><button class="action-btn" onclick="${edit}(${i})">✏️</button><button class="action-btn" onclick="${del}(${i})">🗑️</button></td></tr>`}).join(""):`<tr><td colspan="6"><div class="empty">Zatím tu nejsou žádné položky.</div></td></tr>`;
}
function renderEtsFinancePage(){renderMoneySection(data.etsFinance,"etsFinance","etsFinanceTable")}
function renderFarmFinancePage(){renderMoneySection(data.farmFinance,"farmFinance","farmFinanceTable")}
function renderFarmMachines(){
  const el=document.getElementById("farmMachinesGrid"); if(!el)return;
  el.innerHTML=data.farmMachines.length?data.farmMachines.map((m,i)=>{
    const photos=machinePhotos(m),services=m.services||[],next=Number(m.nextServiceHours||0),remaining=next-Number(m.hours||0),due=next>0&&remaining<=0;
    return `<div class="vehicle-card machine-card ${due?'machine-service-due':''}">${photos[0]?`<img class="machine-photo" src="${photos[0]}" alt="${esc(m.brand)} ${esc(m.model)}">`:`<div class="machine-photo-placeholder">🚜</div>`}<h4>🚜 ${esc(m.brand)} ${esc(m.model)}</h4><p>${esc(m.type||"Stroj")}</p><div class="card-kpis"><div class="card-kpi"><small>Motohodiny</small><strong>${number(m.hours)} h</strong></div><div class="card-kpi"><small>Další servis</small><strong>${next?`${number(next)} h`:'Nenastaven'}</strong></div></div>${next?`<div class="service-reminder ${due?'due':''}">${due?'⚠️ Servis je potřeba provést':`🔧 Do servisu zbývá ${number(remaining)} h`}</div>`:''}<div class="machine-meta">📷 ${photos.length} • 🛠️ ${services.length} servisů</div><div class="card-actions"><button class="secondary-btn" onclick="openMachineDetails(${i})">Detail</button><button class="secondary-btn" onclick="addMachinePhotos(${i})">+ Fotky</button><button class="secondary-btn" onclick="addMachineService(${i})">+ Servis</button><button class="secondary-btn" onclick="editFarmMachine(${i})">Upravit</button><button class="danger-btn" onclick="deleteFarmMachine(${i})">Smazat</button></div></div>`;
  }).join(""):`<div class="empty" style="grid-column:1/-1">Nemáš přidaný žádný stroj.</div>`;
}
function renderFarmFields(){
  const el=document.getElementById("farmFieldsGrid"); if(!el)return;
  el.innerHTML=data.farmFields.length?data.farmFields.map((f,i)=>`<div class="project-card"><h4>🌾 Pole ${esc(f.number)}</h4><p>${esc(f.crop||"Bez plodiny")}</p><div class="project-meta"><span class="tag">${esc(f.area||"—")} ha</span><span class="tag">${esc(f.status||"Volné")}</span></div><div class="card-actions"><button class="secondary-btn" onclick="editFarmField(${i})">Upravit</button><button class="danger-btn" onclick="deleteFarmField(${i})">Smazat</button></div></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Nemáš přidané žádné pole.</div>`;
}
function renderFarmStorage(){
  const el=document.getElementById("farmStorageGrid"); if(!el)return;
  el.innerHTML=data.farmStorage.length?data.farmStorage.map((s,i)=>`<div class="project-card"><h4>🏚️ ${esc(s.name)}</h4><p>${esc(s.product||"Prázdný sklad")}</p><div class="project-meta"><span class="tag">${number(s.amount)} l</span><span class="tag">Kapacita ${number(s.capacity)} l</span></div><div class="card-actions"><button class="secondary-btn" onclick="editFarmStorage(${i})">Upravit</button><button class="danger-btn" onclick="deleteFarmStorage(${i})">Smazat</button></div></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Nemáš přidaný žádný sklad.</div>`;
}

function renderFarm(){
  const tbody=document.getElementById("farmTableBody");
  tbody.innerHTML=data.farming.length?[...data.farming].reverse().map((x,ri)=>{
    const i=data.farming.length-1-ri;
    return `<tr><td>${formatDate(x.date)}</td><td>${esc(x.map)}</td><td><strong>${esc(x.machine)}</strong></td><td>${esc(x.work)}</td><td>${esc(x.field||"—")}</td><td>${number(x.hours)} h</td><td><button class="action-btn" onclick="editFarm(${i})">✏️</button><button class="action-btn" onclick="deleteFarm(${i})">🗑️</button></td></tr>`;
  }).join(""):`<tr><td colspan="7"><div class="empty">Zatím nemáš žádný Farming záznam.</div></td></tr>`;
}

function renderFriends(){
  const friends=data.friends||[];
  const q=(document.getElementById("friendSearch")?.value||"").trim().toLowerCase();
  const filter=document.getElementById("friendFilter")?.value||"all";
  let shown=friends.filter(f=>{
    const text=[f.name,f.nickname,f.discord,f.steam,f.note].join(" ").toLowerCase();
    const matchesText=!q||text.includes(q);
    const matchesFilter=
      filter==="all"||
      (filter==="favorite"&&f.favorite)||
      (filter==="active"&&f.status!=="Neaktivní")||
      (filter==="discord"&&f.discord);
    return matchesText&&matchesFilter;
  });

  document.getElementById("friendsCount").textContent=friends.length;
  document.getElementById("favoriteFriendsCount").textContent=friends.filter(f=>f.favorite).length;
  const activities=friends.flatMap(f=>f.activities||[]);
  document.getElementById("etsFriendsCount").textContent=number(activities.reduce((s,x)=>s+Number(x.hours||0),0))+" h";
  document.getElementById("farmFriendsCount").textContent=euro(activities.reduce((s,x)=>s+Number(x.reward||0),0));
  document.getElementById("dashboardFriendsCount").textContent=friends.length;

  document.getElementById("friendsGrid").innerHTML=shown.length?shown.map((f,idx)=>{
    const i=friends.indexOf(f);
    return `<div class="friend-card">
      <div class="friend-card-head">
        ${f.photo?`<img class="friend-avatar friend-photo" src="${f.photo}" alt="${esc(f.name)}">`:`<div class="friend-avatar">${esc((f.name||"?").charAt(0).toUpperCase())}</div>`}
        <div><h4>${esc(f.name)}</h4><p>${esc(f.nickname||"")}</p></div>
        <div class="friend-favorite">${f.favorite?"⭐":"☆"}</div>
      </div>
      <div class="friend-links">
        ${f.discord?`<div>💬 Discord: ${esc(f.discord)}</div>`:""}
        ${f.steam?`<div>🎮 Steam: ${esc(f.steam)}</div>`:""}
        <div>🚜 ${esc(f.role||"Spoluhráč")} • ${esc(f.status||"Aktivní")}</div>
        <div>🌾 Společné práce: ${(f.activities||[]).length} • ${number((f.activities||[]).reduce((s,x)=>s+Number(x.hours||0),0))} h</div>
        ${f.rating?`<div>⭐ Hodnocení: ${esc(f.rating)}/5</div>`:""}
        ${f.note?`<div>📝 ${esc(f.note)}</div>`:""}
      </div>
      <div class="card-actions">
        <button class="secondary-btn" onclick="toggleFriendFavorite(${i})">${f.favorite?"Odebrat ⭐":"Přidat ⭐"}</button>
        <button class="secondary-btn" onclick="addFriendActivity(${i})">+ Práce</button>
        <button class="secondary-btn" onclick="showFriendHistory(${i})">Historie</button>
        <button class="secondary-btn" onclick="editFriend(${i})">Upravit</button>
        <button class="danger-btn" onclick="deleteFriend(${i})">Smazat</button>
      </div>
    </div>`;
  }).join(""):`<div class="empty" style="grid-column:1/-1">Žádní přátelé neodpovídají filtru.</div>`;
}

function updateClock(){
  try{
    const now=new Date();
    const fullTime=now.toLocaleTimeString("cs-CZ",{
      hour:"2-digit",minute:"2-digit",second:"2-digit"
    });
    const shortTime=now.toLocaleTimeString("cs-CZ",{
      hour:"2-digit",minute:"2-digit"
    });
    const fullDate=now.toLocaleDateString("cs-CZ",{
      weekday:"long",day:"numeric",month:"long",year:"numeric"
    });
    const shortDate=now.toLocaleDateString("cs-CZ",{
      day:"2-digit",month:"2-digit",year:"numeric"
    });

    const dashboardClock=document.getElementById("currentClock");
    const dashboardDate=document.getElementById("currentDate");
    const topClock=document.getElementById("topClock");
    const topDate=document.getElementById("topClockDate");

    if(dashboardClock)dashboardClock.textContent=fullTime;
    if(dashboardDate)dashboardDate.textContent=fullDate;
    if(topClock)topClock.textContent=shortTime;
    if(topDate)topDate.textContent=shortDate;
  }catch(e){
    console.error("Clock error:",e);
  }
}

function weatherDescription(code){
  const map={
    0:["☀️","Jasno"],1:["🌤️","Převážně jasno"],2:["⛅","Polojasno"],3:["☁️","Zataženo"],
    45:["🌫️","Mlha"],48:["🌫️","Mrznoucí mlha"],
    51:["🌦️","Slabé mrholení"],53:["🌦️","Mrholení"],55:["🌧️","Silné mrholení"],
    61:["🌦️","Slabý déšť"],63:["🌧️","Déšť"],65:["🌧️","Silný déšť"],
    71:["🌨️","Slabé sněžení"],73:["🌨️","Sněžení"],75:["❄️","Silné sněžení"],
    80:["🌦️","Přeháňky"],81:["🌧️","Přeháňky"],82:["⛈️","Silné přeháňky"],
    95:["⛈️","Bouřka"],96:["⛈️","Bouřka s kroupami"],99:["⛈️","Silná bouřka"]
  };
  return map[code]||["🌦️","Neznámé počasí"];
}

async function loadWeather(){
  const city=(data.weatherCity||"Praha").trim();
  document.getElementById("weatherCityLabel").textContent=city;
  document.getElementById("weatherText").textContent="Načítám...";
  try{
    const r=await fetch("/api/weather?city="+encodeURIComponent(city));
    if(!r.ok)throw new Error("weather");
    const w=await r.json();
    const [icon,text]=weatherDescription(Number(w.weather_code));
    document.getElementById("weatherIcon").textContent=icon;
    document.getElementById("weatherTemp").textContent=`${Math.round(Number(w.temperature_2m))} °C`;
    document.getElementById("weatherText").textContent=`${text} • vítr ${Math.round(Number(w.wind_speed_10m||0))} km/h`;
    document.getElementById("weatherCityLabel").textContent=w.locationName||city;
  }catch{
    document.getElementById("weatherIcon").textContent="⚠️";
    document.getElementById("weatherTemp").textContent="— °C";
    document.getElementById("weatherText").textContent="Počasí není dostupné";
  }
}

let musicPlaylist=[];
let musicIndex=-1;
let musicShuffle=false;
let musicRepeat=false;

function formatMusicTime(sec){
  if(!Number.isFinite(sec))return"0:00";
  const m=Math.floor(sec/60),s=Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
function renderMusicPlaylist(){
  const list=document.getElementById("musicPlaylistList");
  if(!list)return;
  list.innerHTML=musicPlaylist.length?musicPlaylist.map((t,i)=>`<div class="music-list-item ${i===musicIndex?"active":""}">
    <button onclick="playMusicIndex(${i})"><strong>${esc(t.name)}</strong><small>${esc(t.folder||"Lokální hudba")}</small></button>
    <button class="action-btn" onclick="toggleMusicFavorite('${encodeURIComponent(t.id)}')">${data.musicFavorites.includes(t.id)?"❤️":"🤍"}</button><button class="action-btn" onclick="removeMusicTrack(${i})">🗑️</button>
  </div>`).join(""):`<div class="empty">Playlist je prázdný.</div>`;
}
async function loadSavedMusic(){
  if(!window.kvaltikDesktop?.getMusicLibrary){
    console.warn("Music bridge is not available.");
    return;
  }
  try{
    musicPlaylist=await window.kvaltikDesktop.getMusicLibrary()||[];
    renderMusicPlaylist();
    if(musicPlaylist.length&&musicIndex<0)musicIndex=0;
    if(musicIndex>=musicPlaylist.length)musicIndex=musicPlaylist.length-1;
    updateMusicLabels();
  }catch(e){
    console.error("Music library load error:",e);
    toast("Playlist se nepodařilo načíst.");
  }
}
function updateMusicLabels(){
  const t=musicPlaylist[musicIndex];
  const title=t?.name||"Žádná skladba";
  const meta=t?.folder||"Klikni na „Přidat hudbu“";
  document.getElementById("musicTrackTitle").textContent=title;
  document.getElementById("musicTrackMeta").textContent=meta;
  document.getElementById("dashboardTrackName").textContent=t?.name||"Nic nehraje";
  document.getElementById("dashboardTrackArtist").textContent=t?.folder||"Vyber skladby dole";
}
window.playMusicIndex=async i=>{
  if(i<0||i>=musicPlaylist.length)return;
  musicIndex=i;

  const track=musicPlaylist[i];
  const audio=document.getElementById("musicAudio");
  if(!audio||!track?.url)return;

  try{
    audio.pause();
    audio.src=track.url;
    audio.load();

    updateMusicLabels();
    renderMusicPlaylist();

    await audio.play();
    data.musicHistory=[{id:track.id,name:track.name,playedAt:new Date().toISOString()},...(data.musicHistory||[]).filter(x=>x.id!==track.id)].slice(0,50);
    if(currentUser)hubStorage.setItem(userDataKey(currentUser.username),JSON.stringify(data));
  }catch(e){
    console.error("Music playback error:",e);
    document.getElementById("musicPlayBtn").textContent="▶";
    toast("Skladbu se nepodařilo přehrát. Zkus MP3, WAV, M4A, AAC, OGG nebo FLAC.");
  }
};
window.removeMusicTrack=async i=>{
  if(!window.kvaltikDesktop?.removeMusicTrack)return;
  await window.kvaltikDesktop.removeMusicTrack(musicPlaylist[i]?.id);
  if(i===musicIndex){document.getElementById("musicAudio").pause();musicIndex=-1}
  await loadSavedMusic();
};

function renderGallery(){
  document.getElementById("galleryGrid").innerHTML=data.gallery.length?data.gallery.map((img,i)=>`<div class="gallery-item"><img src="${img.data}" alt="${esc(img.name)}"><button onclick="deleteImage(${i})">🗑️</button></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Nahraj první obrázek.</div>`;
}
function renderAbout(){
  document.getElementById("aboutName").value=data.about.name||"";
  document.getElementById("aboutMotto").value=data.about.motto||"";
  document.getElementById("aboutBio").value=data.about.bio||"";
  document.getElementById("profileDisplayName").textContent=data.about.name||"Kvaltík";
  document.getElementById("profileDisplayBio").textContent=data.about.bio||"";
  const avatar=document.getElementById("profileAvatar"), hero=document.getElementById("heroBadge");
  if(data.about.profileImage){
    avatar.style.backgroundImage=`url("${data.about.profileImage}")`;avatar.textContent="";
    hero.style.backgroundImage=`url("${data.about.profileImage}")`;hero.textContent="";
  }else{
    avatar.style.backgroundImage="";hero.style.backgroundImage="";
    const l=(data.about.name||"K").charAt(0).toUpperCase();avatar.textContent=l;hero.textContent=l;
  }
}
function renderSocials(){
  ["youtube","instagram","twitch","tiktok","web"].forEach(k=>document.getElementById("social"+k.charAt(0).toUpperCase()+k.slice(1)).value=data.socials[k]||"");
  const names={youtube:"YouTube",instagram:"Instagram",twitch:"Twitch",tiktok:"TikTok",web:"Web"};
  const icons={youtube:"▶️",instagram:"📸",twitch:"🟣",tiktok:"🎵",web:"🌍"};
  const items=Object.entries(data.socials).filter(([,v])=>v);
  document.getElementById("socialCards").innerHTML=items.length?items.map(([k,v])=>`<div class="social-card"><h4>${icons[k]} ${names[k]}</h4><a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a></div>`).join(""):`<div class="empty" style="grid-column:1/-1">Vyplň odkazy nahoře a ulož je.</div>`;
}

async function loadDiscordServerInfo(){
  const liveName=document.getElementById("discordLiveName");
  if(!liveName)return;
  let info=null;
  if(discordAuthAvailable()){
    try{
      const r=await fetch("/api/discord-server");
      if(r.ok)info=await r.json();
    }catch{}
  }

  const fallbackName=data.discord.name||"Kvaltík Community";
  const fallbackDescription=data.discord.description||"Komunita kolem Kvaltík Hubu.";
  const fallbackInvite=data.discord.invite||"";

  document.getElementById("discordLiveName").textContent=info?.name||fallbackName;
  document.getElementById("discordLiveDescription").textContent=info?.description||fallbackDescription;
  document.getElementById("discordOnlineCount").textContent=info?.presence_count??"—";
  document.getElementById("discordChannelCount").textContent=Array.isArray(info?.channels)?info.channels.length:"—";
  document.getElementById("discordWidgetStatus").textContent=info?.widgetAvailable?"Online":"Nedostupný";

  const invite=info?.instant_invite||info?.inviteUrl||fallbackInvite;
  ["discordLiveInvite","discordJoinTop"].forEach(id=>{
    const a=document.getElementById(id);
    if(invite){a.href=invite;a.classList.remove("disabled")}
    else{a.href="#";a.classList.add("disabled")}
  });

  const logo=document.getElementById("discordServerIcon");
  if(info?.icon_url){
    logo.style.backgroundImage=`url("${info.icon_url}")`;logo.textContent="";
  }else{
    logo.style.backgroundImage="";logo.textContent="💬";
  }

  document.getElementById("discordServerHint").textContent=
    info?.widgetAvailable
      ?"Živé údaje jsou načtené přímo z Discord Server Widgetu."
      :"Živé údaje nejsou dostupné. Zobrazuji uložené informace; zkontroluj ID serveru a povolení Server Widgetu.";
}


function renderDiscord(){
  loadDesktopDiscordConfig();
  document.getElementById("discordName").value=data.discord.name||"";
  document.getElementById("discordInvite").value=data.discord.invite||"";
  document.getElementById("discordDescription").value=data.discord.description||"";
  loadDiscordServerInfo();
}
function renderProjects(){
  document.getElementById("projectsGrid").innerHTML=data.projects.length?[...data.projects].reverse().map((x,ri)=>{const i=data.projects.length-1-ri,p=Math.max(0,Math.min(100,Number(x.progress||0)));return `<div class="project-card"><h4>${esc(x.name)}</h4><p>${esc(x.description||"Bez popisu")}</p><div class="project-meta"><span class="tag">${esc(x.type)}</span><span class="tag">${esc(x.status)}</span>${x.deadline?`<span class="tag">📅 ${formatDate(x.deadline)}</span>`:""}</div><div class="project-progress"><i style="width:${p}%"></i></div><small>${p} % • ${esc(x.checklist||"Bez checklistu")}</small><div class="card-actions"><button class="secondary-btn" onclick="togglePin('Project','project_${i}','${encodeURIComponent(x.name)}')">📌</button><button class="secondary-btn" onclick="editProject(${i})">Upravit</button><button class="danger-btn" onclick="deleteProject(${i})">Smazat</button></div></div>`}).join(""):`<div class="empty" style="grid-column:1/-1">Zatím tu nemáš žádný projekt.</div>`;
}
function renderNotes(){
  document.getElementById("notesGrid").innerHTML=data.notes.length?[...data.notes].reverse().map((x,ri)=>{const i=data.notes.length-1-ri;return `<div class="note-card"><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p><div class="project-meta"><span class="tag">${formatDate(x.date)}</span></div><div class="card-actions"><button class="secondary-btn" onclick="editNote(${i})">Upravit</button><button class="danger-btn" onclick="deleteNote(${i})">Smazat</button></div></div>`}).join(""):`<div class="empty" style="grid-column:1/-1">Zatím tu nemáš žádnou poznámku.</div>`;
}
function applyTheme(){document.body.classList.toggle("light",data.theme==="light");document.getElementById("themeBtn").textContent=data.theme==="light"?"☀️":"🌙"}
function renderWeatherSettings(){const el=document.getElementById("weatherCityInput");if(el)el.value=data.weatherCity||"Praha"}
function renderAll(){
  const renderers=[renderFarmProfiles,renderDashboard,renderEts,renderCompany,renderEtsFleetPage,renderEtsFinancePage,renderFarm,renderFarmMachines,renderFarmFields,renderFarmStorage,renderFarmFinancePage,renderFarmOperations,renderFriends,renderGallery,renderAbout,renderSocials,renderDiscord,renderProjects,renderNotes,renderWeatherSettings,renderHub2,renderTools2,applyTheme];
  renderers.forEach(fn=>{try{fn()}catch(err){console.error("Render error:",fn.name,err)}});
}

const modal=document.getElementById("modal"),modalForm=document.getElementById("modalForm");
function optimizeUploadedImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Fotku se nepodařilo načíst."));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error("Vybraný obrázek se nepodařilo otevřít."));
      image.onload=()=>{
        const maxSide=1600,scale=Math.min(1,maxSide/Math.max(image.width,image.height));
        const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
        const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
        const context=canvas.getContext("2d");context.fillStyle="#ffffff";context.fillRect(0,0,width,height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(image,0,0,width,height);
        resolve(canvas.toDataURL("image/jpeg",.86));
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderFarmOperations(){
  const jobs=document.getElementById("farmJobsGrid");
  if(jobs){
    const counts={planned:data.farmJobs.filter(x=>x.status==="Plánováno").length,active:data.farmJobs.filter(x=>x.status==="Probíhá").length,done:data.farmJobs.filter(x=>x.status==="Hotovo").length};
    document.getElementById("farmJobsSummary").innerHTML=`<div class="stat-card"><span>📅</span><div><strong>${counts.planned}</strong><small>Plánováno</small></div></div><div class="stat-card"><span>🚜</span><div><strong>${counts.active}</strong><small>Probíhá</small></div></div><div class="stat-card"><span>✅</span><div><strong>${counts.done}</strong><small>Hotovo</small></div></div>`;
    jobs.innerHTML=data.farmJobs.length?[...data.farmJobs].reverse().map((x,ri)=>{const i=data.farmJobs.length-1-ri;return `<article class="project-card"><span class="job-status status-${x.status==='Hotovo'?'done':x.status==='Probíhá'?'active':'planned'}">${esc(x.status)}</span><h4>${esc(x.title)}</h4><p>${esc(x.work||'Práce')} • ${esc(x.field||'Bez pole')}</p><div class="project-meta"><span class="tag">📅 ${formatDate(x.date)}</span><span class="tag">🚜 ${esc(x.machine||'Bez stroje')}</span>${x.team?`<span class="tag">👥 ${esc(x.team)}</span>`:''}${x.hours?`<span class="tag">⏱️ ${number(x.hours)} h</span>`:''}${x.reward?`<span class="tag">💰 ${euro(x.reward)}</span>`:''}</div><div class="card-actions"><button class="secondary-btn" onclick="advanceFarmJob(${i})">Další stav</button><button class="secondary-btn" onclick="editFarmJob(${i})">Upravit</button><button class="danger-btn" onclick="deleteFarmJob(${i})">Smazat</button></div></article>`}).join(''):'<div class="empty">Zatím nejsou vytvořené žádné zakázky.</div>';
  }
  const fuel=document.getElementById("farmFuelTableBody");
  if(fuel){
    const liters=data.farmFuel.reduce((s,x)=>s+Number(x.liters||0),0),cost=data.farmFuel.reduce((s,x)=>s+Number(x.total||0),0);
    document.getElementById("fuelLitersStat").textContent=number(liters)+" l";document.getElementById("fuelCostStat").textContent=euro(cost);document.getElementById("fuelCountStat").textContent=data.farmFuel.length;
    fuel.innerHTML=data.farmFuel.length?[...data.farmFuel].reverse().map((x,ri)=>{const i=data.farmFuel.length-1-ri,previous=[...data.farmFuel.slice(0,i)].reverse().find(y=>y.machine===x.machine&&Number(y.hours)<Number(x.hours)),delta=previous?Number(x.hours)-Number(previous.hours):0,consumption=delta>0?Number(x.liters)/delta:0;return `<tr><td>${formatDate(x.date)}</td><td>${esc(x.machine)}</td><td>${number(x.hours)} h</td><td>${number(x.liters)} l</td><td>${consumption?`${number(consumption)} l/h`:'—'}</td><td>${number(x.price)} €</td><td>${euro(x.total)}</td><td><button class="action-btn" onclick="editFarmFuel(${i})">✏️</button><button class="action-btn" onclick="deleteFarmFuel(${i})">🗑️</button></td></tr>`}).join(''):'<tr><td colspan="8"><div class="empty">Zatím není zaznamenané žádné tankování.</div></td></tr>';
  }
  const history=document.getElementById("fieldHistoryList");
  if(history){
    const select=document.getElementById("fieldHistoryFilter"),selected=select?.value||"";if(select){const names=[...new Set([...data.farmFields.map(x=>x.number),...data.fieldHistory.map(x=>x.field)].filter(Boolean))];select.innerHTML='<option value="">Všechna pole</option>'+names.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}
    const filter=select?.value||"";const items=data.fieldHistory.map((x,i)=>({...x,_i:i})).filter(x=>!filter||x.field===filter);
    history.innerHTML=items.length?[...items].reverse().map(x=>`<article class="smart-item"><div><span class="smart-badge">${esc(x.action)}</span><h4>${esc(x.field)}${x.crop?` • ${esc(x.crop)}`:''}</h4><p>${formatDate(x.date)} • ${esc(x.machine||'Bez stroje')}${x.yield?` • výnos ${number(x.yield)} t`:''}${x.cost?` • ${euro(x.cost)}`:''}</p><small>${esc(x.note||'')}</small></div><div class="smart-actions"><button onclick="editFieldHistory(${x._i})">Upravit</button><button class="danger-mini" onclick="deleteFieldHistory(${x._i})">Smazat</button></div></article>`).join(''):'<div class="empty">Pro vybrané pole zatím není žádná historie.</div>';
  }
}
function machinePhotos(machine){return Array.isArray(machine.photos)&&machine.photos.length?machine.photos:(machine.image?[machine.image]:[])}
function openModal(title,fields,onSubmit,values={}){
  document.getElementById("modalTitle").textContent=title;
  modalForm.innerHTML=fields.map(f=>{
    const val=values[f.name]??"";
    if(f.type==="textarea")return `<label class="${f.full?'full':''}">${f.label}<textarea name="${f.name}" rows="${f.rows||4}" ${f.required?'required':''}>${esc(val)}</textarea></label>`;
    if(f.type==="file")return `<label class="${f.full?'full':''}">${f.label}${val?`<img class="modal-image-preview" src="${val}" alt="Současná fotografie">`:''}<input type="file" name="${f.name}" accept="${f.accept||'image/*'}"></label>`;
    if(f.type==="select")return `<label class="${f.full?'full':''}">${f.label}<select name="${f.name}">${f.options.map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join("")}</select></label>`;
    return `<label class="${f.full?'full':''}">${f.label}<input type="${f.type||'text'}" name="${f.name}" value="${esc(val)}" ${f.required?'required':''} ${f.step?`step="${f.step}"`:''}></label>`;
  }).join("")+`<div class="full" style="display:flex;justify-content:flex-end;gap:10px"><button type="button" class="secondary-btn" id="cancelModal">Zrušit</button><button class="primary-btn">Uložit</button></div>`;
  modal.classList.add("open");
  document.getElementById("cancelModal").onclick=closeModal;
  modalForm.onsubmit=async e=>{
    e.preventDefault();
    const formData=new FormData(modalForm),result={};
    for(const f of fields){
      const value=formData.get(f.name);
      if(f.type!=="file"){result[f.name]=value;continue}
      if(value instanceof File&&value.size){
        if(!value.type.startsWith("image/")){toast("Vybraný soubor není obrázek.");return}
        if(value.size>12*1024*1024){toast("Fotka může mít maximálně 12 MB.");return}
        try{result[f.name]=await optimizeUploadedImage(value)}catch(error){toast(error.message);return}
      }else result[f.name]=values[f.name]||"";
    }
    await onSubmit(result);closeModal();
  }
}
function closeModal(){modal.classList.remove("open")}
document.getElementById("modalClose").onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};

function buildEtsFields(){
  const companyOptions=["Soukromá jízda"];
  if(data.company)companyOptions.push(data.company.name);
  const driverOptions=["— Nevybrán —",...data.drivers.map(d=>d.name)];
  return [
    {name:"date",label:"Datum",type:"date",required:true},{name:"truck",label:"Tahač / vozidlo",required:true},
    {name:"from",label:"Odkud",required:true},{name:"to",label:"Kam",required:true},{name:"cargo",label:"Náklad",required:true},
    {name:"km",label:"Kilometry",type:"number",step:"0.1",required:true},{name:"income",label:"Výdělek (€)",type:"number"},
    {name:"companyChoice",label:"Jízda pro",type:"select",options:companyOptions},
    {name:"driverChoice",label:"Řidič",type:"select",options:driverOptions},
    {name:"note",label:"Poznámka",type:"textarea",full:true}
  ];
}
function normalizeEtsForm(o){
  const copy={...o};
  if(data.company&&o.companyChoice===data.company.name){
    copy.companyId=data.company.id;copy.company=data.company.name;
  }else{copy.companyId="";copy.company=""}
  const drv=data.drivers.find(d=>d.name===o.driverChoice);
  copy.driverId=drv?drv.id:"";
  delete copy.companyChoice;delete copy.driverChoice;
  return copy;
}
function etsValuesForEdit(x){
  return {...x,companyChoice:(x.companyId&&data.company&&x.companyId===data.company.id)?data.company.name:"Soukromá jízda",driverChoice:(data.drivers.find(d=>d.id===x.driverId)||{}).name||"— Nevybrán —"};
}
document.getElementById("addEtsBtn").onclick=()=>openModal("Přidat ETS 2 jízdu",buildEtsFields(),o=>{data.ets2.push(normalizeEtsForm(o));saveData("ETS 2 jízda byla uložena.")},{date:new Date().toISOString().slice(0,10),companyChoice:data.company?data.company.name:"Soukromá jízda"});
window.editEts=i=>openModal("Upravit ETS 2 jízdu",buildEtsFields(),o=>{data.ets2[i]=normalizeEtsForm(o);saveData("Jízda byla upravena.")},etsValuesForEdit(data.ets2[i]));
window.deleteEts=i=>{if(confirm("Smazat jízdu?")){data.ets2.splice(i,1);saveData("Jízda byla smazána.")}};


const companyFields=[
  {name:"name",label:"Název firmy",required:true,full:true},
  {name:"hq",label:"Sídlo firmy",required:true},
  {name:"founded",label:"Datum založení",type:"date"},
  {name:"description",label:"Popis firmy",type:"textarea",full:true}
];
function createCompany(){
  openModal("Založit virtuální firmu",companyFields,o=>{
    data.company={id:"company_"+Date.now(),...o,logo:""};
    saveData("Virtuální firma byla založena.");
  },{name:"Kvaltík Transport",founded:new Date().toISOString().slice(0,10)});
}
document.getElementById("addCompanyBtn").onclick=createCompany;
document.getElementById("addCompanyBtn2").onclick=createCompany;
document.getElementById("editCompanyBtn").onclick=()=>{if(!data.company)return;openModal("Upravit virtuální firmu",companyFields,o=>{data.company={...data.company,...o};saveData("Firma byla upravena.")},data.company)};
document.getElementById("deleteCompanyBtn").onclick=()=>{if(!data.company)return;if(confirm("Opravdu smazat virtuální firmu? Firemní jízdy zůstanou v knize jízd, ale přestanou být propojené s firmou.")){data.company=null;data.drivers=[];data.fleet=[];data.finance=[];saveData("Virtuální firma byla smazána.")}};

const driverFields=[
  {name:"name",label:"Jméno řidiče",required:true,full:true},
  {name:"role",label:"Pozice",type:"select",options:["Majitel","Řidič","Dispečer","Manažer"]},
  {name:"joined",label:"Datum nástupu",type:"date"},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addDriverBtn").onclick=()=>openModal("Přidat řidiče",driverFields,o=>{data.drivers.push({id:"driver_"+Date.now(),...o});saveData("Řidič byl přidán.")},{role:"Řidič",joined:new Date().toISOString().slice(0,10)});
window.editDriver=i=>openModal("Upravit řidiče",driverFields,o=>{data.drivers[i]={...data.drivers[i],...o};saveData("Řidič byl upraven.")},data.drivers[i]);
window.deleteDriver=i=>{if(confirm("Smazat tohoto řidiče?")){data.drivers.splice(i,1);saveData("Řidič byl smazán.")}};

const vehicleFields=[
  {name:"brand",label:"Značka",required:true},{name:"model",label:"Model",required:true},
  {name:"type",label:"Typ",type:"select",options:["Tahač","Nákladní auto","Dodávka","Jiné"]},
  {name:"plate",label:"SPZ"},{name:"odometer",label:"Stav km",type:"number",step:"0.1"},
  {name:"power",label:"Výkon",placeholder:"např. 770 hp"},
  {name:"status",label:"Stav",type:"select",options:["Aktivní","V servisu","Odstavené","Prodáno"]},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addVehicleBtn").onclick=()=>openModal("Přidat vozidlo",vehicleFields,o=>{data.fleet.push({id:"vehicle_"+Date.now(),...o});saveData("Vozidlo bylo přidáno.")},{type:"Tahač",status:"Aktivní"});
window.editVehicle=i=>openModal("Upravit vozidlo",vehicleFields,o=>{data.fleet[i]={...data.fleet[i],...o};saveData("Vozidlo bylo upraveno.")},data.fleet[i]);
window.deleteVehicle=i=>{if(confirm("Smazat toto vozidlo?")){data.fleet.splice(i,1);saveData("Vozidlo bylo smazáno.")}};

const financeFields=[
  {name:"date",label:"Datum",type:"date",required:true},
  {name:"type",label:"Typ",type:"select",options:["Výdaj","Příjem"]},
  {name:"category",label:"Kategorie",type:"select",options:["Palivo","Servis","Pokuta","Nákup vozidla","Prodej vozidla","Mzdy","Garáž","Jiné"]},
  {name:"amount",label:"Částka (€)",type:"number",step:"0.01",required:true},
  {name:"description",label:"Popis",type:"textarea",full:true}
];
document.getElementById("addFinanceBtn").onclick=()=>openModal("Přidat finanční položku",financeFields,o=>{data.finance.push({id:"finance_"+Date.now(),...o});saveData("Finanční položka byla přidána.")},{date:new Date().toISOString().slice(0,10),type:"Výdaj",category:"Palivo"});
window.editFinance=i=>openModal("Upravit finanční položku",financeFields,o=>{data.finance[i]={...data.finance[i],...o};saveData("Položka byla upravena.")},data.finance[i]);
window.deleteFinance=i=>{if(confirm("Smazat tuto finanční položku?")){data.finance.splice(i,1);saveData("Položka byla smazána.")}};

document.querySelectorAll(".company-tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".company-tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".company-tab-panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("company-tab-"+btn.dataset.companyTab).classList.add("active");
});


document.getElementById("addEtsVehicleBtn").onclick=()=>document.getElementById("addVehicleBtn").click();

const moneyFields=[
  {name:"date",label:"Datum",type:"date",required:true},
  {name:"type",label:"Typ",type:"select",options:["Příjem","Výdaj"]},
  {name:"category",label:"Kategorie",type:"select",options:["Zakázka","Palivo","Servis","Pokuta","Nákup","Prodej","Mzdy","Jiné"]},
  {name:"amount",label:"Částka (€)",type:"number",step:"0.01",required:true},
  {name:"description",label:"Popis",type:"textarea",full:true}
];
document.getElementById("addEtsFinanceBtn").onclick=()=>openModal("ETS 2 – finanční položka",moneyFields,o=>{data.etsFinance.push({id:"etsf_"+Date.now(),...o});saveData("ETS 2 finanční položka byla přidána.")},{date:new Date().toISOString().slice(0,10),type:"Výdaj",category:"Palivo"});
window.editEtsFinance=i=>openModal("Upravit ETS 2 finance",moneyFields,o=>{data.etsFinance[i]={...data.etsFinance[i],...o};saveData("Položka byla upravena.")},data.etsFinance[i]);
window.deleteEtsFinance=i=>{if(confirm("Smazat položku?")){data.etsFinance.splice(i,1);saveData("Položka byla smazána.")}};

document.getElementById("addFarmFinanceBtn").onclick=()=>openModal("Farming – finanční položka",moneyFields,o=>{data.farmFinance.push({id:"farmf_"+Date.now(),...o});saveData("Farming finanční položka byla přidána.")},{date:new Date().toISOString().slice(0,10),type:"Výdaj",category:"Palivo"});
window.editFarmFinance=i=>openModal("Upravit Farming finance",moneyFields,o=>{data.farmFinance[i]={...data.farmFinance[i],...o};saveData("Položka byla upravena.")},data.farmFinance[i]);
window.deleteFarmFinance=i=>{if(confirm("Smazat položku?")){data.farmFinance.splice(i,1);saveData("Položka byla smazána.")}};

const machineFields=[
  {name:"brand",label:"Značka",required:true},{name:"model",label:"Model",required:true},
  {name:"image",label:"Fotografie stroje (max. 12 MB)",type:"file",accept:"image/*",full:true},
  {name:"type",label:"Typ",type:"select",options:["Traktor","Kombajn","Řezačka","Nakladač","Přívěs","Jiné"]},
  {name:"hours",label:"Motohodiny",type:"number",step:"0.1"},
  {name:"nextServiceHours",label:"Připomenout servis při motohodinách",type:"number",step:"0.1"},
  {name:"status",label:"Stav",type:"select",options:["Aktivní","V servisu","Odstavený","Prodán"]},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addFarmMachineBtn").onclick=()=>openModal("Přidat Farming stroj",machineFields,o=>{data.farmMachines.push({id:"machine_"+Date.now(),photos:o.image?[o.image]:[],services:[],...o});saveData("Stroj byl přidán.")},{type:"Traktor",status:"Aktivní"});
window.editFarmMachine=i=>openModal("Upravit stroj",machineFields,o=>{const old=data.farmMachines[i],photos=machinePhotos(old);if(o.image&&o.image!==old.image){if(photos.length)photos[0]=o.image;else photos.push(o.image)}data.farmMachines[i]={...old,...o,photos};saveData("Stroj byl upraven.")},data.farmMachines[i]);
window.deleteFarmMachine=i=>{if(confirm("Smazat stroj?")){data.farmMachines.splice(i,1);saveData("Stroj byl smazán.")}};

window.addMachinePhotos=i=>{
  const input=document.createElement("input");input.type="file";input.accept="image/*";input.multiple=true;
  input.onchange=async()=>{const machine=data.farmMachines[i],photos=machinePhotos(machine);for(const file of [...input.files]){if(photos.length>=10){toast("Ke stroji lze uložit nejvýše 10 fotografií.");break}if(!file.type.startsWith("image/")||file.size>12*1024*1024){toast(`Fotka ${file.name} není podporovaná nebo je větší než 12 MB.`);continue}try{photos.push(await optimizeUploadedImage(file))}catch(error){toast(error.message)}}machine.photos=photos;machine.image=photos[0]||"";saveData("Fotografie byly přidány do galerie.")};input.click();
};
window.deleteMachinePhoto=(i,p)=>{if(!confirm("Odstranit tuto fotografii?"))return;const machine=data.farmMachines[i],photos=machinePhotos(machine);photos.splice(p,1);machine.photos=photos;machine.image=photos[0]||"";saveData("Fotografie byla odstraněna.");openMachineDetails(i)};
window.setMainMachinePhoto=(i,p)=>{const machine=data.farmMachines[i],photos=machinePhotos(machine),chosen=photos.splice(p,1)[0];photos.unshift(chosen);machine.photos=photos;machine.image=photos[0];saveData("Hlavní fotografie byla změněna.");openMachineDetails(i)};
window.openMachineDetails=i=>{const m=data.farmMachines[i],photos=machinePhotos(m),services=[...(m.services||[])].reverse();document.getElementById("modalTitle").textContent=`${m.brand} ${m.model}`;modalForm.innerHTML=`<div class="full machine-gallery">${photos.length?photos.map((photo,p)=>`<div class="machine-gallery-item"><img src="${photo}" alt="Fotografie stroje"><div><button type="button" class="secondary-btn" onclick="setMainMachinePhoto(${i},${p})">${p===0?'Hlavní':'Nastavit hlavní'}</button><button type="button" class="danger-btn" onclick="deleteMachinePhoto(${i},${p})">Smazat</button></div></div>`).join(''):'<div class="empty">Galerie je zatím prázdná.</div>'}</div><div class="full detail-toolbar"><button type="button" class="primary-btn" onclick="addMachinePhotos(${i})">+ Přidat fotografie</button><button type="button" class="primary-btn" onclick="addMachineService(${i})">+ Přidat servis</button></div><div class="full"><h3>🛠️ Servisní historie</h3><div class="machine-service-list">${services.length?services.map((s,ri)=>{const si=(m.services||[]).length-1-ri;return `<article><div><strong>${esc(s.type||'Servis')}</strong><small>${formatDate(s.date)} • ${number(s.hours)} h${s.cost?` • ${euro(s.cost)}`:''}</small><p>${esc(s.note||'')}</p></div><button type="button" class="danger-btn" onclick="deleteMachineService(${i},${si})">Smazat</button></article>`}).join(''):'<div class="empty">Zatím nebyl zaznamenán žádný servis.</div>'}</div></div><div class="full detail-toolbar"><button type="button" class="secondary-btn" id="cancelModal">Zavřít</button></div>`;modalForm.onsubmit=e=>e.preventDefault();modal.classList.add("open");document.getElementById("cancelModal").onclick=closeModal};
const machineServiceFields=[{name:"date",label:"Datum",type:"date",required:true},{name:"type",label:"Typ servisu",type:"select",options:["Pravidelný servis","Oprava","Výměna oleje","Pneumatiky","Kontrola","Jiné"]},{name:"hours",label:"Stav motohodin",type:"number",step:"0.1",required:true},{name:"cost",label:"Cena",type:"number",step:"0.01"},{name:"nextServiceHours",label:"Další servis při motohodinách",type:"number",step:"0.1"},{name:"note",label:"Poznámka",type:"textarea",full:true}];
window.addMachineService=i=>{const m=data.farmMachines[i];openModal(`Servis – ${m.brand} ${m.model}`,machineServiceFields,o=>{m.services=m.services||[];m.services.push({id:"mservice_"+Date.now(),...o});if(Number(o.hours)>Number(m.hours||0))m.hours=o.hours;if(o.nextServiceHours)m.nextServiceHours=o.nextServiceHours;saveData("Servis byl uložen do historie.")},{date:new Date().toISOString().slice(0,10),type:"Pravidelný servis",hours:m.hours||0,nextServiceHours:m.nextServiceHours||""})};
window.deleteMachineService=(i,s)=>{if(!confirm("Smazat servisní záznam?"))return;data.farmMachines[i].services.splice(s,1);saveData("Servisní záznam byl smazán.");openMachineDetails(i)};

function farmOptions(items,empty){return [empty,...items.filter(Boolean)]}
function jobFields(){return[{name:"title",label:"Název zakázky",required:true,full:true},{name:"date",label:"Datum",type:"date",required:true},{name:"status",label:"Stav",type:"select",options:["Plánováno","Probíhá","Hotovo"]},{name:"field",label:"Pole",type:"select",options:farmOptions(data.farmFields.map(x=>x.number),"Bez pole")},{name:"machine",label:"Stroj",type:"select",options:farmOptions(data.farmMachines.map(x=>`${x.brand} ${x.model}`),"Bez stroje")},{name:"team",label:"Člen týmu",type:"select",options:farmOptions(data.friends.map(x=>x.name),"Bez spoluhráče")},{name:"work",label:"Druh práce",type:"select",options:["Orba","Setí","Hnojení","Postřik","Sklizeň","Přeprava","Jiné"]},{name:"hours",label:"Doba práce (h)",type:"number",step:"0.1"},{name:"reward",label:"Celková odměna (€)",type:"number",step:"0.01"},{name:"teamReward",label:"Podíl spoluhráče (€)",type:"number",step:"0.01"},{name:"note",label:"Poznámka",type:"textarea",full:true}]}
document.getElementById("addFarmJobBtn").onclick=()=>openModal("Nová zakázka",jobFields(),o=>{data.farmJobs.push({id:"job_"+Date.now(),...o});saveData("Zakázka byla vytvořena.")},{date:new Date().toISOString().slice(0,10),status:"Plánováno"});
window.editFarmJob=i=>openModal("Upravit zakázku",jobFields(),o=>{data.farmJobs[i]={...data.farmJobs[i],...o};saveData("Zakázka byla upravena.")},data.farmJobs[i]);
window.advanceFarmJob=i=>{const states=["Plánováno","Probíhá","Hotovo"],x=data.farmJobs[i];x.status=states[Math.min(states.length-1,Math.max(0,states.indexOf(x.status))+1)];if(x.status==="Hotovo"&&x.team&&!x.teamActivityId){const friend=data.friends.find(f=>f.name===x.team);if(friend){friend.activities=friend.activities||[];const activity={id:"teamwork_"+Date.now(),date:x.date,work:x.work,field:x.field,machine:x.machine,hours:x.hours,reward:x.teamReward,note:`Zakázka: ${x.title}`};friend.activities.push(activity);x.teamActivityId=activity.id}}saveData("Stav zakázky byl změněn.")};
window.deleteFarmJob=i=>{if(confirm("Smazat zakázku?")){data.farmJobs.splice(i,1);saveData("Zakázka byla smazána.")}};

function fuelFields(){return[{name:"date",label:"Datum",type:"date",required:true},{name:"machine",label:"Stroj",type:"select",options:farmOptions(data.farmMachines.map(x=>`${x.brand} ${x.model}`),"Jiný stroj")},{name:"hours",label:"Stav motohodin",type:"number",step:"0.1"},{name:"liters",label:"Natankováno (l)",type:"number",step:"0.01",required:true},{name:"price",label:"Cena za litr (€)",type:"number",step:"0.001",required:true},{name:"note",label:"Poznámka",type:"textarea",full:true}]}
function syncFuelFinance(x){const total=Number(x.liters||0)*Number(x.price||0);x.total=total;let f=data.farmFinance.find(y=>y.sourceId===x.id);if(!f){f={id:"ff_"+Date.now(),sourceId:x.id,type:"Výdaj",category:"Palivo"};data.farmFinance.push(f)}Object.assign(f,{date:x.date,amount:total,description:`Tankování – ${x.machine}`})}
document.getElementById("addFarmFuelBtn").onclick=()=>openModal("Přidat tankování",fuelFields(),o=>{const x={id:"fuel_"+Date.now(),...o};data.farmFuel.push(x);syncFuelFinance(x);saveData("Tankování a výdaj byly uloženy.")},{date:new Date().toISOString().slice(0,10)});
window.editFarmFuel=i=>openModal("Upravit tankování",fuelFields(),o=>{data.farmFuel[i]={...data.farmFuel[i],...o};syncFuelFinance(data.farmFuel[i]);saveData("Tankování bylo upraveno.")},data.farmFuel[i]);
window.deleteFarmFuel=i=>{if(!confirm("Smazat tankování i propojený výdaj?"))return;const id=data.farmFuel[i].id;data.farmFuel.splice(i,1);data.farmFinance=data.farmFinance.filter(x=>x.sourceId!==id);saveData("Tankování bylo smazáno.")};

function historyFields(){return[{name:"date",label:"Datum",type:"date",required:true},{name:"field",label:"Pole",type:"select",options:farmOptions(data.farmFields.map(x=>x.number),"Jiné pole")},{name:"action",label:"Práce",type:"select",options:["Orba","Kultivace","Setí","Hnojení","Postřik","Sklizeň","Vápnění","Jiné"]},{name:"crop",label:"Plodina"},{name:"machine",label:"Stroj",type:"select",options:farmOptions(data.farmMachines.map(x=>`${x.brand} ${x.model}`),"Bez stroje")},{name:"yield",label:"Výnos (t)",type:"number",step:"0.01"},{name:"cost",label:"Náklady (€)",type:"number",step:"0.01"},{name:"note",label:"Poznámka",type:"textarea",full:true}]}
function syncHistoryFinance(x){let f=data.farmFinance.find(y=>y.sourceId===x.id);if(Number(x.cost||0)<=0){data.farmFinance=data.farmFinance.filter(y=>y.sourceId!==x.id);return}if(!f){f={id:"ff_"+Date.now(),sourceId:x.id,type:"Výdaj",category:"Zakázka"};data.farmFinance.push(f)}Object.assign(f,{date:x.date,amount:Number(x.cost),description:`${x.action} – pole ${x.field}`})}
document.getElementById("addFieldHistoryBtn").onclick=()=>openModal("Nový záznam pole",historyFields(),o=>{const x={id:"fieldwork_"+Date.now(),...o};data.fieldHistory.push(x);syncHistoryFinance(x);saveData("Historie pole byla uložena.")},{date:new Date().toISOString().slice(0,10),action:"Setí"});
window.editFieldHistory=i=>openModal("Upravit historii pole",historyFields(),o=>{data.fieldHistory[i]={...data.fieldHistory[i],...o};syncHistoryFinance(data.fieldHistory[i]);saveData("Historie pole byla upravena.")},data.fieldHistory[i]);
window.deleteFieldHistory=i=>{if(!confirm("Smazat záznam pole i propojený výdaj?"))return;const id=data.fieldHistory[i].id;data.fieldHistory.splice(i,1);data.farmFinance=data.farmFinance.filter(x=>x.sourceId!==id);saveData("Záznam pole byl smazán.")};
document.getElementById("fieldHistoryFilter").onchange=renderFarmOperations;

const fieldFields=[
  {name:"number",label:"Číslo / název pole",required:true},
  {name:"area",label:"Rozloha (ha)",type:"number",step:"0.01"},
  {name:"crop",label:"Plodina"},
  {name:"status",label:"Stav",type:"select",options:["Volné","Zaseto","Roste","Připraveno ke sklizni","Sklizeno"]},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addFarmFieldBtn").onclick=()=>openModal("Přidat pole",fieldFields,o=>{data.farmFields.push({id:"field_"+Date.now(),...o});saveData("Pole bylo přidáno.")},{status:"Volné"});
window.editFarmField=i=>openModal("Upravit pole",fieldFields,o=>{data.farmFields[i]={...data.farmFields[i],...o};saveData("Pole bylo upraveno.")},data.farmFields[i]);
window.deleteFarmField=i=>{if(confirm("Smazat pole?")){data.farmFields.splice(i,1);saveData("Pole bylo smazáno.")}};

const storageFields=[
  {name:"name",label:"Název skladu",required:true},{name:"product",label:"Komodita"},
  {name:"amount",label:"Množství (l)",type:"number",step:"1"},
  {name:"capacity",label:"Kapacita (l)",type:"number",step:"1"},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addFarmStorageBtn").onclick=()=>openModal("Přidat sklad",storageFields,o=>{data.farmStorage.push({id:"storage_"+Date.now(),...o});saveData("Sklad byl přidán.")});
window.editFarmStorage=i=>openModal("Upravit sklad",storageFields,o=>{data.farmStorage[i]={...data.farmStorage[i],...o};saveData("Sklad byl upraven.")},data.farmStorage[i]);
window.deleteFarmStorage=i=>{if(confirm("Smazat sklad?")){data.farmStorage.splice(i,1);saveData("Sklad byl smazán.")}};

const farmFields=[
  {name:"date",label:"Datum",type:"date",required:true},{name:"map",label:"Mapa / farma",required:true},{name:"machine",label:"Stroj",required:true},
  {name:"work",label:"Práce",required:true},{name:"field",label:"Pole"},{name:"hours",label:"Motohodiny",type:"number",step:"0.1"},
  {name:"income",label:"Výdělek (€)",type:"number"},{name:"note",label:"Poznámka",type:"textarea",full:true}
];
document.getElementById("addFarmBtn").onclick=()=>openModal("Přidat Farming záznam",farmFields,o=>{data.farming.push(o);saveData("Farming záznam byl uložen.")},{date:new Date().toISOString().slice(0,10)});
window.editFarm=i=>openModal("Upravit Farming záznam",farmFields,o=>{data.farming[i]=o;saveData("Záznam byl upraven.")},data.farming[i]);
window.deleteFarm=i=>{if(confirm("Smazat záznam?")){data.farming.splice(i,1);saveData("Záznam byl smazán.")}};


const friendFields=[
  {name:"name",label:"Jméno",required:true},
  {name:"nickname",label:"Přezdívka"},
  {name:"photo",label:"Profilová fotografie (max. 12 MB)",type:"file",accept:"image/*",full:true},
  {name:"discord",label:"Discord"},{name:"steam",label:"Steam"},
  {name:"role",label:"Role",type:"select",options:["Spoluhráč","Řidič","Pracovník","Správce","Majitel"]},
  {name:"status",label:"Stav",type:"select",options:["Aktivní","Neaktivní"]},
  {name:"rating",label:"Hodnocení 1–5",type:"number",step:"1"},{name:"profile",label:"Odkaz na profil",type:"url"},
  {name:"favorite",label:"Oblíbený",type:"select",options:["Ne","Ano"]},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
function normalizeFriend(o){return {...o,favorite:o.favorite==="Ano"}}
function friendEditValues(f){
  return {...f,favorite:f.favorite?"Ano":"Ne"};
}
document.getElementById("addFriendBtn").onclick=()=>openModal("Přidat člena týmu",friendFields,o=>{data.friends.push({id:"friend_"+Date.now(),activities:[],...normalizeFriend(o)});saveData("Člen týmu byl přidán.")},{role:"Spoluhráč",status:"Aktivní",favorite:"Ne"});
window.editFriend=i=>openModal("Upravit člena týmu",friendFields,o=>{data.friends[i]={...data.friends[i],...normalizeFriend(o)};saveData("Člen týmu byl upraven.")},friendEditValues(data.friends[i]));
window.deleteFriend=i=>{if(confirm("Smazat tohoto přítele?")){data.friends.splice(i,1);saveData("Přítel byl smazán.")}};
window.toggleFriendFavorite=i=>{data.friends[i].favorite=!data.friends[i].favorite;saveData()};
document.getElementById("friendSearch").oninput=renderFriends;
document.getElementById("friendFilter").onchange=renderFriends;
const friendActivityFields=[{name:"date",label:"Datum",type:"date",required:true},{name:"work",label:"Práce",required:true},{name:"field",label:"Pole"},{name:"machine",label:"Stroj"},{name:"hours",label:"Společné hodiny",type:"number",step:"0.1"},{name:"reward",label:"Podíl na odměně (€)",type:"number",step:"0.01"},{name:"rating",label:"Hodnocení spolupráce 1–5",type:"number",step:"1"},{name:"note",label:"Poznámka",type:"textarea",full:true}];
window.addFriendActivity=i=>openModal(`Společná práce – ${data.friends[i].name}`,friendActivityFields,o=>{const f=data.friends[i];f.activities=f.activities||[];f.activities.push({id:"teamwork_"+Date.now(),...o});if(o.rating)f.rating=o.rating;saveData("Společná práce byla uložena.")},{date:new Date().toISOString().slice(0,10)});
window.showFriendHistory=i=>{const f=data.friends[i],items=[...(f.activities||[])].reverse();document.getElementById("modalTitle").textContent=`Historie – ${f.name}`;modalForm.innerHTML=`<div class="full machine-service-list">${items.length?items.map((x,ri)=>{const ai=(f.activities||[]).length-1-ri;return `<article><div><strong>${esc(x.work)}</strong><small>${formatDate(x.date)} • ${esc(x.field||'Bez pole')} • ${number(x.hours)} h${x.reward?` • ${euro(x.reward)}`:''}</small><p>${esc(x.machine||'')}${x.note?` • ${esc(x.note)}`:''}</p></div><button type="button" class="danger-btn" onclick="deleteFriendActivity(${i},${ai})">Smazat</button></article>`}).join(''):'<div class="empty">Zatím není uložená žádná společná práce.</div>'}</div><div class="full detail-toolbar"><button type="button" class="secondary-btn" id="cancelModal">Zavřít</button></div>`;modalForm.onsubmit=e=>e.preventDefault();modal.classList.add("open");document.getElementById("cancelModal").onclick=closeModal};
window.deleteFriendActivity=(i,a)=>{if(!confirm("Smazat společnou práci?"))return;data.friends[i].activities.splice(a,1);saveData("Společná práce byla smazána.");showFriendHistory(i)};

// Centrum 2.0
const plannerFields=[
  {name:"title",label:"Název",required:true,full:true},{name:"type",label:"Typ",type:"select",options:["Setí","Hnojení","Postřik","Sklizeň","Servis","Zakázka","Připomínka"]},
  {name:"date",label:"Datum",type:"date",required:true},{name:"time",label:"Čas",type:"time"},{name:"repeat",label:"Opakování",type:"select",options:["Nikdy","Denně","Týdně","Měsíčně"]},{name:"priority",label:"Priorita",type:"select",options:["Běžná","Důležitá","Kritická"]},
  {name:"note",label:"Poznámka",type:"textarea",full:true}
];
const videoFields=[
  {name:"title",label:"Název videa",required:true,full:true},{name:"status",label:"Stav",type:"select",options:["Nápad","Natočit","Střih","Náhled","Vydat","Vydáno"]},
  {name:"releaseDate",label:"Termín vydání",type:"date"},{name:"players",label:"Spoluhráči"},{name:"tags",label:"Tagy",full:true},
  {name:"description",label:"Popis",type:"textarea",full:true},{name:"url",label:"Odkaz na video",type:"url",full:true}
];
const serviceFields=[
  {name:"date",label:"Datum",type:"date",required:true},{name:"type",label:"Typ",type:"select",options:["Tankování","Servis","Pneumatiky","Nehoda","Pokuta","Garáž","Návěs"]},
  {name:"vehicle",label:"Tahač / položka",required:true},{name:"km",label:"Stav km",type:"number",step:"0.1"},{name:"cost",label:"Cena (€)",type:"number",step:"0.01"},
  {name:"liters",label:"Palivo (l)",type:"number",step:"0.01"},{name:"pricePerLiter",label:"Cena za litr (€)",type:"number",step:"0.001"},
  {name:"nextDate",label:"Další servis",type:"date"},{name:"nextKm",label:"Další servis v km",type:"number"},{name:"note",label:"Poznámka",type:"textarea",full:true}
];
const farmManagementFields=[
  {name:"date",label:"Datum",type:"date",required:true},{name:"type",label:"Oblast",type:"select",options:["Zvířata","Výroba","Náhradní díl","Pracovník","Mapa / bod farmy","Budova / místo","Dokument","Osivo","Hnojivo","Krmivo","Kontrakt"]},
  {name:"name",label:"Název / položka",required:true},{name:"amount",label:"Množství / údaj"},{name:"minimum",label:"Minimální zásoba",type:"number"},{name:"status",label:"Stav",type:"select",options:["Aktivní","Plánováno","Probíhá","Hotovo","Nízká zásoba","Pozastaveno"]},
  {name:"value",label:"Hodnota (€)",type:"number",step:"0.01"},{name:"link",label:"Odkaz na dokument / mapu",type:"url",full:true},{name:"note",label:"Poznámka",type:"textarea",full:true}
];
function byDate(a,b){return String(a.date||a.releaseDate||"9999").localeCompare(String(b.date||b.releaseDate||"9999"))}
function actionButtons(kind,i,label,id){return `<div class="smart-actions"><button onclick="edit${kind}(${i})">Upravit</button><button onclick="togglePin('${kind}','${encodeURIComponent(id)}','${encodeURIComponent(label)}')">📌</button><button class="danger-mini" onclick="delete${kind}(${i})">Smazat</button></div>`}
function renderPlanner2(){
  const list=document.getElementById("plannerList");if(!list)return;
  const sorted=data.planner.map((x,i)=>({...x,_i:i})).sort(byDate);
  const today=new Date().toISOString().slice(0,10), upcoming=sorted.filter(x=>!x.done&&x.date>=today);
  document.getElementById("plannerSummary").innerHTML=`<div class="stat-card"><span>📅</span><strong>${upcoming.length}</strong><small>nadcházejících</small></div><div class="stat-card"><span>✅</span><strong>${data.planner.filter(x=>x.done).length}</strong><small>splněných</small></div><div class="stat-card"><span>🎥</span><strong>${upcoming.filter(x=>["Stream","Video"].includes(x.type)).length}</strong><small>obsah</small></div>`;
  list.innerHTML=sorted.length?sorted.map(x=>`<article class="smart-item ${x.done?'is-done':''}"><button class="check-btn" onclick="togglePlanner(${x._i})">${x.done?'✓':'○'}</button><div><span class="smart-badge">${esc(x.type)}</span><h4>${esc(x.title)}</h4><p>${formatDate(x.date)} ${x.time?`• ${esc(x.time)}`:''} • ${esc(x.priority||'Běžná')}</p><small>${esc(x.note||'')}</small></div>${actionButtons('Planner',x._i,x.title,x.id)}</article>`).join(""):`<div class="empty">Zatím tu není žádná událost.</div>`;
}
function generatedNotifications(){
  const now=new Date(), limit=new Date(Date.now()+7*86400000);
  const planned=data.planner.filter(x=>!x.done&&x.date).filter(x=>{const d=new Date(x.date+"T23:59:59");return d>=now&&d<=limit}).map(x=>({id:"plan_"+x.id,type:x.type,title:x.title,text:`Termín ${formatDate(x.date)}${x.time?` v ${x.time}`:''}`,date:x.date,read:false,generated:true}));
  const services=data.farmMachines.filter(m=>Number(m.nextServiceHours)>0&&Number(m.nextServiceHours)-Number(m.hours||0)<=10).map(m=>{const left=Number(m.nextServiceHours)-Number(m.hours||0);return{id:`farm_service_${m.id}_${m.nextServiceHours}`,type:"Servis stroje",title:`${m.brand} ${m.model}`,text:left<=0?`Servis je potřeba provést (${number(m.hours)} h).`:`Do servisu zbývá ${number(left)} motohodin.`,date:new Date().toISOString().slice(0,10),read:false,generated:true}});
  const stock=data.farmManagement.filter(x=>Number(x.minimum)>0&&Number(x.amount)<=Number(x.minimum)).map(x=>({id:`stock_${x.id}_${x.amount}`,type:"Nízká zásoba",title:x.name,text:`Zbývá ${x.amount}; nastavené minimum je ${x.minimum}.`,date:new Date().toISOString().slice(0,10),read:false,generated:true}));
  return [...planned,...services,...stock];
}
function renderNotifications2(){
  const el=document.getElementById("notificationList");if(!el)return;
  const own=data.notifications||[], generated=generatedNotifications().filter(g=>!own.some(x=>x.id===g.id&&x.dismissed));
  const items=[...generated,...own.filter(x=>!x.dismissed)].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  el.innerHTML=items.length?items.map(x=>`<article class="smart-item ${x.read?'is-read':''}"><div class="notice-dot"></div><div><span class="smart-badge">${esc(x.type||'Oznámení')}</span><h4>${esc(x.title)}</h4><p>${esc(x.text||'')} ${x.date?`• ${formatDate(x.date)}`:''}</p></div><div class="smart-actions"><button onclick="readNotification('${esc(x.id)}')">${x.read?'Přečteno':'Přečíst'}</button><button onclick="dismissNotification('${esc(x.id)}')">Skrýt</button></div></article>`).join(""):`<div class="empty">Žádná nová oznámení.</div>`;
}
function renderYoutube2(){
  const board=document.getElementById("youtubeBoard");if(!board)return;
  const states=["Nápad","Natočit","Střih","Náhled","Vydat","Vydáno"];
  board.innerHTML=states.map(status=>`<div class="kanban-column"><h4>${status} <span>${data.youtubeVideos.filter(x=>x.status===status).length}</span></h4>${data.youtubeVideos.map((x,i)=>({...x,_i:i})).filter(x=>x.status===status).map(x=>`<article class="kanban-card"><strong>${esc(x.title)}</strong><small>${x.releaseDate?formatDate(x.releaseDate):'Bez termínu'}</small><p>${esc(x.players||'')}</p>${actionButtons('Video',x._i,x.title,x.id)}</article>`).join("")||'<div class="empty small">Prázdné</div>'}</div>`).join("");
}
function monthBuckets(items,valueKey){const out={};items.forEach(x=>{if(!x.date)return;const k=x.date.slice(0,7);out[k]=(out[k]||0)+Number(x[valueKey]||0)});return Object.entries(out).sort().slice(-6)}
function chartHtml(entries,suffix){const max=Math.max(1,...entries.map(x=>x[1]));return entries.length?entries.map(([k,v])=>`<div class="bar-row"><small>${k}</small><div><i style="width:${Math.max(3,v/max*100)}%"></i></div><strong>${number(v)} ${suffix}</strong></div>`).join(""):'<div class="empty">Zatím nejsou data.</div>'}
function renderStatistics2(){
  const cards=document.getElementById("statisticsCards");if(!cards)return;
  const farmHours=data.farming.reduce((s,x)=>s+Number(x.hours||0),0),income=data.farmFinance.filter(x=>x.type==="Příjem").reduce((s,x)=>s+Number(x.amount||0),0),expense=data.farmFinance.filter(x=>x.type==="Výdaj").reduce((s,x)=>s+Number(x.amount||0),0),fuel=data.farmFuel.reduce((s,x)=>s+Number(x.liters||0),0);
  cards.innerHTML=`<div class="stat-card"><span>⏱️</span><strong>${number(farmHours)} h</strong><small>Odpracováno</small></div><div class="stat-card"><span>💶</span><strong>${euro(income-expense)}</strong><small>Zisk farmy</small></div><div class="stat-card"><span>⛽</span><strong>${number(fuel)} l</strong><small>Spotřeba paliva</small></div><div class="stat-card"><span>🌾</span><strong>${data.farmFields.length}</strong><small>Polí</small></div>`;
  document.getElementById("etsMonthlyChart").innerHTML=chartHtml(monthBuckets(data.farmFinance,"amount"),"€");document.getElementById("farmMonthlyChart").innerHTML=chartHtml(monthBuckets(data.farming,"hours"),"h");
}
function renderRecordList(target,items,kind){const el=document.getElementById(target);if(!el)return;el.innerHTML=items.length?items.map((x,i)=>{const link=safeHttpUrl(x.link);return `<article class="smart-item"><div><span class="smart-badge">${esc(x.type)}</span><h4>${esc(x.vehicle||x.name)}</h4><p>${formatDate(x.date)} • ${x.cost?euro(x.cost):x.amount||x.status||''}</p><small>${esc(x.note||'')}${x.nextDate?` • Další termín ${formatDate(x.nextDate)}`:''}</small>${link?`<p><a class="record-link" href="${esc(link)}" target="_blank" rel="noopener">Otevřít dokument nebo mapu ↗</a></p>`:''}</div>${actionButtons(kind,i,x.vehicle||x.name,x.id)}</article>`}).join(""):'<div class="empty">Zatím tu nejsou žádné záznamy.</div>'}
function searchableRecords(){
  const groups=[["Jízda",data.ets2,x=>`${x.truck} ${x.from} ${x.to} ${x.cargo}`],["Stroj",data.farmMachines,x=>`${x.brand} ${x.model} ${x.note}`],["Servis",data.etsService,x=>`${x.vehicle} ${x.type} ${x.note}`],["Farma",data.farmManagement,x=>`${x.name} ${x.type} ${x.note}`],["Poznámka",data.notes,x=>`${x.title} ${x.text}`],["Projekt",data.projects,x=>`${x.name} ${x.description}`],["Kamarád",data.friends,x=>`${x.name} ${x.nickname} ${x.note}`],["Video",data.youtubeVideos,x=>`${x.title} ${x.description} ${x.tags}`]];
  return groups.flatMap(([type,items,text])=>items.map((x,i)=>({type,index:i,title:x.title||x.name||x.vehicle||x.model||x.truck||type,text:text(x),date:x.date||x.releaseDate||""})));
}
function renderSearch2(){
  const input=document.getElementById("globalSearchInput"),results=document.getElementById("globalSearchResults");if(!input||!results)return;
  const q=input.value.trim().toLocaleLowerCase("cs"),found=q?searchableRecords().filter(x=>(x.title+" "+x.text).toLocaleLowerCase("cs").includes(q)):[];
  document.getElementById("globalSearchCount").textContent=`${found.length} výsledků`;
  results.innerHTML=q?(found.map(x=>`<article class="smart-item"><div><span class="smart-badge">${esc(x.type)}</span><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p></div></article>`).join("")||'<div class="empty">Nic jsme nenašli.</div>'):'<div class="empty">Začni psát hledaný výraz.</div>';
  document.getElementById("pinnedItems").innerHTML=(data.pins||[]).map((x,i)=>`<div class="pin-row"><span>📌 ${esc(x.label)}</span><button onclick="removePin(${i})">✕</button></div>`).join("")||'<div class="empty small">Nic není připnuté.</div>';
  const widgetLabels={weather:"Počasí",clock:"Hodiny",finance:"Finance",nextService:"Další servis",lastTrip:"Poslední jízda",nowPlaying:"Právě hraje",nextStream:"Další stream"};
  document.getElementById("widgetSettings").innerHTML=Object.entries(widgetLabels).map(([k,v])=>`<label><span>${v}</span><input type="checkbox" ${data.dashboardWidgets[k]?'checked':''} onchange="setWidget('${k}',this.checked)"></label>`).join("");
  const betaLabels={experimentalTab:"Experimentální záložka",newCharts:"Nové grafy",weatherAlerts:"Upozornění na bouřky"};
  document.getElementById("betaFeatureSettings").innerHTML=Object.entries(betaLabels).map(([k,v])=>`<label><span>${v}</span><input type="checkbox" ${data.betaFeatures[k]?'checked':''} onchange="setBeta('${k}',this.checked)"></label>`).join("");
}
function renderHub2(){renderPlanner2();renderNotifications2();renderYoutube2();renderStatistics2();renderRecordList("etsServiceList",data.etsService,"Service");renderRecordList("farmManagementList",data.farmManagement,"FarmManagement");renderSearch2()}

function backupKey(){return "kvaltikHubAutoBackupsV2_"+(currentUser?.username||"").toLowerCase()}
function getAutoBackups(){try{return JSON.parse(hubStorage.getItem(backupKey()))||[]}catch{return []}}
function createAutoBackup(manual=false){
  if(!currentUser)return;
  const snapshot=structuredClone(data);delete snapshot.trash;
  const list=[{id:"backup_"+Date.now(),createdAt:new Date().toISOString(),manual,data:snapshot},...getAutoBackups()];
  hubStorage.setItem(backupKey(),JSON.stringify(list.slice(0,Math.max(1,Number(data.backupSettings?.keep||10)))));
  data.backupSettings={...data.backupSettings,lastDate:new Date().toISOString().slice(0,10)};
  hubStorage.setItem(userDataKey(currentUser.username),JSON.stringify(data));
}
function ensureDailyBackup(){
  data.backupSettings={daily:true,keep:10,lastDate:"",...(data.backupSettings||{})};
  const today=new Date().toISOString().slice(0,10);
  if(data.backupSettings.daily&&data.backupSettings.lastDate!==today)createAutoBackup(false);
}
function pushTrash(type,item){data.trash=data.trash||[];data.trash.unshift({id:"trash_"+Date.now(),type,deletedAt:new Date().toISOString(),item:structuredClone(item)});if(data.trash.length>100)data.trash.length=100}
const trashTargets={Planner:"planner",Video:"youtubeVideos",Service:"etsService",FarmManagement:"farmManagement",Project:"projects",Note:"notes"};
function renderTools2(){
  const root=document.getElementById("autoBackupList");if(!root)return;
  document.getElementById("dailyBackupToggle").checked=data.backupSettings?.daily!==false;
  root.innerHTML=getAutoBackups().map((x,i)=>`<div class="compact-row"><span>${x.manual?'Ruční':'Denní'} • ${new Date(x.createdAt).toLocaleString('cs-CZ')}</span><button onclick="restoreAutoBackup(${i})">Obnovit</button></div>`).join("")||'<div class="empty small">Žádná automatická záloha.</div>';
  document.getElementById("etsBudgetInput").value=data.budgets?.ets||"";document.getElementById("farmBudgetInput").value=data.budgets?.farming||"";
  const month=new Date().toISOString().slice(0,7),etsSpent=data.etsFinance.filter(x=>x.type==="Výdaj"&&String(x.date).startsWith(month)).reduce((s,x)=>s+Number(x.amount||0),0),farmSpent=data.farmFinance.filter(x=>x.type==="Výdaj"&&String(x.date).startsWith(month)).reduce((s,x)=>s+Number(x.amount||0),0);
  document.getElementById("budgetStatus").innerHTML=`<div class="budget-line"><span>ETS: ${euro(etsSpent)} / ${euro(data.budgets?.ets)}</span><progress max="${Math.max(1,Number(data.budgets?.ets||1))}" value="${etsSpent}"></progress></div><div class="budget-line"><span>Farming: ${euro(farmSpent)} / ${euro(data.budgets?.farming)}</span><progress max="${Math.max(1,Number(data.budgets?.farming||1))}" value="${farmSpent}"></progress></div>`;
  document.getElementById("autoLockInput").value=data.security?.autoLockMinutes||0;
  document.getElementById("weatherCityChips").innerHTML=(data.weatherCities||[data.weatherCity]).map(c=>`<button onclick="selectWeatherCity('${encodeURIComponent(c)}')">${esc(c)}</button>`).join("");
  document.getElementById("youtubeTemplateList").innerHTML=(data.youtubeTemplates||[]).map((x,i)=>`<div class="compact-row"><span>${esc(x.name)}</span><button onclick="useYoutubeTemplate(${i})">Použít</button><button onclick="deleteYoutubeTemplate(${i})">✕</button></div>`).join("")||'<div class="empty small">Žádné šablony.</div>';
  document.getElementById("trashList").innerHTML=(data.trash||[]).map((x,i)=>`<div class="compact-row"><span>${esc(x.type)} • ${new Date(x.deletedAt).toLocaleString('cs-CZ')}</span><button onclick="restoreTrash(${i})">Obnovit</button></div>`).join("")||'<div class="empty small">Koš je prázdný.</div>';
}
let forecastCity="";
async function loadForecast(city){
  const el=document.getElementById("weatherForecast");if(!el)return;forecastCity=city;el.innerHTML='<div class="empty">Načítám předpověď…</div>';
  try{const r=await fetch('/api/weather?city='+encodeURIComponent(city));if(!r.ok)throw new Error();const w=await r.json(),d=w.daily;el.innerHTML=d.time.map((date,i)=>`<div class="forecast-day"><strong>${new Date(date+'T12:00:00').toLocaleDateString('cs-CZ',{weekday:'short'})}</strong><span>${weatherDescription(Number(d.weather_code[i]))[0]}</span><small>${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])} °C</small><small>Déšť ${d.precipitation_probability_max[i]||0} %</small></div>`).join("")}catch{el.innerHTML='<div class="empty">Předpověď není dostupná.</div>'}
}
window.restoreAutoBackup=i=>{if(!confirm("Obnovit tuto zálohu?"))return;data={...structuredClone(defaultUserData),...getAutoBackups()[i].data};saveData("Záloha byla obnovena.")};
window.restoreTrash=i=>{const x=data.trash[i],target=trashTargets[x.type];if(target&&Array.isArray(data[target]))data[target].push(x.item);data.trash.splice(i,1);saveData("Položka byla obnovena.")};
window.selectWeatherCity=value=>{const city=decodeURIComponent(value);data.weatherCity=city;saveData();loadForecast(city)};
window.useYoutubeTemplate=i=>{const t=data.youtubeTemplates[i];openModal("Video ze šablony",videoFields,o=>{data.youtubeVideos.push({id:"video_"+Date.now(),...o});saveData("Video bylo vytvořeno ze šablony.")},{status:"Nápad",description:t.text})};window.deleteYoutubeTemplate=i=>{data.youtubeTemplates.splice(i,1);saveData()};
window.toggleMusicFavorite=id=>{id=decodeURIComponent(id);const i=data.musicFavorites.indexOf(id);if(i>=0)data.musicFavorites.splice(i,1);else data.musicFavorites.push(id);saveData();renderMusicPlaylist()};

document.getElementById("dailyBackupToggle").onchange=e=>{data.backupSettings.daily=e.target.checked;saveData("Nastavení záloh bylo uloženo.")};document.getElementById("backupNowBtn").onclick=()=>{createAutoBackup(true);renderTools2();toast("Záloha byla vytvořena.")};
document.getElementById("saveBudgetsBtn").onclick=()=>{data.budgets={...data.budgets,ets:Number(document.getElementById("etsBudgetInput").value||0),farming:Number(document.getElementById("farmBudgetInput").value||0)};saveData("Rozpočty byly uloženy.")};
document.getElementById("addWeatherCityBtn").onclick=()=>{const city=document.getElementById("weatherCityV2Input").value.trim();if(!city)return;data.weatherCities=[...new Set([...(data.weatherCities||[]),city])];data.weatherCity=city;saveData("Město bylo přidáno.");loadForecast(city)};
document.getElementById("saveSecurityBtn").onclick=()=>{const pin=document.getElementById("securityPinInput").value.trim();data.security={pinHash:pin?simpleHash(pin):(data.security?.pinHash||""),autoLockMinutes:Number(document.getElementById("autoLockInput").value||0)};document.getElementById("securityPinInput").value="";saveData("Zabezpečení bylo uloženo.");scheduleAutoLock()};document.getElementById("lockNowBtn").onclick=()=>{const entered=prompt("Pro odemknutí zadej PIN:");if(!data.security?.pinHash)toast("Nejdřív nastav PIN.");else if(simpleHash(entered||"")!==data.security.pinHash)toast("Nesprávný PIN.");else toast("Aplikace je odemknutá.")};
document.getElementById("addYoutubeTemplateBtn").onclick=()=>{const name=document.getElementById("youtubeTemplateName").value.trim(),text=document.getElementById("youtubeTemplateText").value.trim();if(!name)return;data.youtubeTemplates.push({name,text});saveData("Šablona byla uložena.")};
document.getElementById("emptyTrashBtn").onclick=()=>{if(confirm("Trvale vysypat koš?")){data.trash=[];saveData("Koš byl vysypán.")}};document.getElementById("printReportBtn").onclick=()=>window.print();

document.getElementById("addPlannerBtn").onclick=()=>openModal("Nová událost",plannerFields,o=>{data.planner.push({id:"planner_"+Date.now(),done:false,...o});saveData("Událost byla přidána.")},{date:new Date().toISOString().slice(0,10),type:"Úkol",priority:"Běžná"});
window.editPlanner=i=>openModal("Upravit událost",plannerFields,o=>{data.planner[i]={...data.planner[i],...o};saveData("Událost byla upravena.")},data.planner[i]);window.deletePlanner=i=>{if(confirm("Přesunout událost do koše?")){pushTrash("Planner",data.planner[i]);data.planner.splice(i,1);saveData()}};window.togglePlanner=i=>{const item=data.planner[i];item.done=!item.done;if(item.done&&item.repeat&&item.repeat!=="Nikdy"){const next=structuredClone(item),d=new Date(item.date+"T12:00:00");if(item.repeat==="Denně")d.setDate(d.getDate()+1);if(item.repeat==="Týdně")d.setDate(d.getDate()+7);if(item.repeat==="Měsíčně")d.setMonth(d.getMonth()+1);next.id="planner_"+Date.now();next.date=d.toISOString().slice(0,10);next.done=false;data.planner.push(next)}saveData()};
document.getElementById("addVideoBtn").onclick=()=>openModal("Nové YouTube video",videoFields,o=>{data.youtubeVideos.push({id:"video_"+Date.now(),...o});saveData("Video bylo přidáno.")},{status:"Nápad"});window.editVideo=i=>openModal("Upravit video",videoFields,o=>{data.youtubeVideos[i]={...data.youtubeVideos[i],...o};saveData()},data.youtubeVideos[i]);window.deleteVideo=i=>{if(confirm("Přesunout video do koše?")){pushTrash("Video",data.youtubeVideos[i]);data.youtubeVideos.splice(i,1);saveData()}};
document.getElementById("addEtsServiceBtn").onclick=()=>openModal("Servisní záznam",serviceFields,o=>{data.etsService.push({id:"service_"+Date.now(),...o});saveData("Servisní záznam byl přidán.")},{date:new Date().toISOString().slice(0,10),type:"Servis"});window.editService=i=>openModal("Upravit servis",serviceFields,o=>{data.etsService[i]={...data.etsService[i],...o};saveData()},data.etsService[i]);window.deleteService=i=>{if(confirm("Přesunout záznam do koše?")){pushTrash("Service",data.etsService[i]);data.etsService.splice(i,1);saveData()}};
document.getElementById("addFarmManagementBtn").onclick=()=>openModal("Farming management",farmManagementFields,o=>{data.farmManagement.push({id:"farmmg_"+Date.now(),...o});saveData("Záznam farmy byl přidán.")},{date:new Date().toISOString().slice(0,10),type:"Kontrakt",status:"Plánováno"});window.editFarmManagement=i=>openModal("Upravit záznam",farmManagementFields,o=>{data.farmManagement[i]={...data.farmManagement[i],...o};saveData()},data.farmManagement[i]);window.deleteFarmManagement=i=>{if(confirm("Přesunout záznam do koše?")){pushTrash("FarmManagement",data.farmManagement[i]);data.farmManagement.splice(i,1);saveData()}};
window.togglePin=(type,id,label)=>{id=decodeURIComponent(id);label=decodeURIComponent(label);const idx=data.pins.findIndex(x=>x.type===type&&x.id===id);if(idx>=0)data.pins.splice(idx,1);else data.pins.push({type,id,label});saveData(idx>=0?"Položka byla odepnuta.":"Položka byla připnuta.")};window.removePin=i=>{data.pins.splice(i,1);saveData()};
window.setWidget=(key,value)=>{data.dashboardWidgets[key]=value;saveData()};window.setBeta=(key,value)=>{data.betaFeatures[key]=value;saveData()};
document.getElementById("globalSearchInput").oninput=renderSearch2;
window.readNotification=id=>{let x=data.notifications.find(n=>n.id===id);if(!x){const g=generatedNotifications().find(n=>n.id===id);if(g){x={...g};data.notifications.push(x)}}if(x)x.read=true;saveData()};
window.dismissNotification=id=>{let x=data.notifications.find(n=>n.id===id);if(!x)data.notifications.push({id,dismissed:true});else x.dismissed=true;saveData()};document.getElementById("markNotificationsBtn").onclick=()=>{generatedNotifications().forEach(g=>{if(!data.notifications.some(x=>x.id===g.id))data.notifications.push({...g,read:true})});data.notifications.forEach(x=>x.read=true);saveData("Oznámení jsou přečtená.")};
function downloadText(name,text,type="text/plain"){const blob=new Blob([text],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function csv(rows){return rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\n")}
document.getElementById("exportStatsBtn").onclick=()=>downloadText("kvaltik-farming-statistiky.csv",csv([["Kategorie","Hodnota"],["Stroje",data.farmMachines.length],["Pole",data.farmFields.length],["Pracovní záznamy",data.farming.length],["Motohodiny",data.farming.reduce((s,x)=>s+Number(x.hours||0),0)],["Palivo (l)",data.farmFuel.reduce((s,x)=>s+Number(x.liters||0),0)],["Příjmy",data.farmFinance.filter(x=>x.type==="Příjem").reduce((s,x)=>s+Number(x.amount||0),0)],["Výdaje",data.farmFinance.filter(x=>x.type==="Výdaj").reduce((s,x)=>s+Number(x.amount||0),0)]]),"text/csv;charset=utf-8");
document.getElementById("exportJobsBtn").onclick=()=>downloadText("kvaltik-zakazky.csv",csv([["Datum","Název","Stav","Pole","Stroj","Práce","Odměna","Poznámka"],...data.farmJobs.map(x=>[x.date,x.title,x.status,x.field,x.machine,x.work,x.reward,x.note])]),"text/csv;charset=utf-8");
document.getElementById("exportFuelBtn").onclick=()=>downloadText("kvaltik-tankovani.csv",csv([["Datum","Stroj","Motohodiny","Litry","Cena za litr","Celkem","Poznámka"],...data.farmFuel.map(x=>[x.date,x.machine,x.hours,x.liters,x.price,x.total,x.note])]),"text/csv;charset=utf-8");
document.getElementById("exportFieldsBtn").onclick=()=>downloadText("kvaltik-historie-poli.csv",csv([["Datum","Pole","Práce","Plodina","Stroj","Výnos","Náklady","Poznámka"],...data.fieldHistory.map(x=>[x.date,x.field,x.action,x.crop,x.machine,x.yield,x.cost,x.note])]),"text/csv;charset=utf-8");
document.getElementById("exportFinanceBtn").onclick=()=>downloadText("kvaltik-finance.csv",csv([["Sekce","Datum","Typ","Kategorie","Částka","Popis"],...data.etsFinance.map(x=>["ETS",x.date,x.type,x.category,x.amount,x.description]),...data.farmFinance.map(x=>["Farming",x.date,x.type,x.category,x.amount,x.description])]),"text/csv;charset=utf-8");
document.getElementById("exportAllV2Btn").onclick=()=>downloadText(`kvaltik-hub-komplet-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:2,exportedAt:new Date().toISOString(),user:currentUser?.username,data},null,2),"application/json");

const projectFields=[
  {name:"name",label:"Název projektu",required:true,full:true},{name:"type",label:"Typ",type:"select",options:["Aplikace","Web","YouTube","Farming","ETS 2","Doprava","Jiné"]},
  {name:"status",label:"Stav",type:"select",options:["Nápad","Plánování","Rozpracováno","Pozastaveno","Hotovo"]},{name:"deadline",label:"Deadline",type:"date"},{name:"progress",label:"Dokončeno (%)",type:"number"},
  {name:"checklist",label:"Checklist (odděluj čárkou)",full:true},{name:"files",label:"Soubory / odkazy",type:"textarea",full:true},{name:"description",label:"Popis",type:"textarea",full:true}
];
document.getElementById("addProjectBtn").onclick=()=>openModal("Nový projekt",projectFields,o=>{data.projects.push(o);saveData("Projekt byl vytvořen.")},{type:"Aplikace",status:"Nápad"});
window.editProject=i=>openModal("Upravit projekt",projectFields,o=>{data.projects[i]=o;saveData("Projekt byl upraven.")},data.projects[i]);
window.deleteProject=i=>{if(confirm("Smazat projekt?")){data.projects.splice(i,1);saveData("Projekt byl smazán.")}};

const noteFields=[{name:"title",label:"Název",required:true,full:true},{name:"text",label:"Text poznámky",type:"textarea",required:true,full:true,rows:7},{name:"date",label:"Datum",type:"date",full:true}];
document.getElementById("addNoteBtn").onclick=()=>openModal("Nová poznámka",noteFields,o=>{data.notes.push(o);saveData("Poznámka byla uložena.")},{date:new Date().toISOString().slice(0,10)});
window.editNote=i=>openModal("Upravit poznámku",noteFields,o=>{data.notes[i]=o;saveData("Poznámka byla upravena.")},data.notes[i]);
window.deleteNote=i=>{if(confirm("Smazat poznámku?")){data.notes.splice(i,1);saveData("Poznámka byla smazána.")}};

document.getElementById("aboutForm").onsubmit=e=>{
  e.preventDefault();
  data.about.name=document.getElementById("aboutName").value.trim();
  data.about.motto=document.getElementById("aboutMotto").value.trim();
  data.about.bio=document.getElementById("aboutBio").value.trim();
  saveData("Profil byl uložen.");
};
document.getElementById("profileImageInput").onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  if(file.size>2*1024*1024){toast("Profilový obrázek musí mít méně než 2 MB.");return}
  const r=new FileReader();r.onload=()=>{data.about.profileImage=r.result;saveData("Profilový obrázek byl uložen.")};r.readAsDataURL(file);
};
document.getElementById("imageInput").onchange=e=>{
  const files=[...e.target.files].slice(0,12);
  let left=files.length;if(!left)return;
  files.forEach(file=>{
    if(!file.type.startsWith("image/")){if(--left===0)saveData();return}
    if(file.size>3*1024*1024){toast(`${file.name}: max 3 MB`);if(--left===0)saveData();return}
    const r=new FileReader();r.onload=()=>{data.gallery.push({name:file.name,data:r.result});if(--left===0)saveData("Obrázky byly nahrány.")};r.readAsDataURL(file);
  });
  e.target.value="";
};
window.deleteImage=i=>{if(confirm("Smazat obrázek?")){data.gallery.splice(i,1);saveData("Obrázek byl smazán.")}};

document.getElementById("socialForm").onsubmit=e=>{
  e.preventDefault();["youtube","instagram","twitch","tiktok","web"].forEach(k=>data.socials[k]=document.getElementById("social"+k.charAt(0).toUpperCase()+k.slice(1)).value.trim());saveData("Sociální sítě byly uloženy.");
};
document.getElementById("discordForm").onsubmit=async e=>{
  e.preventDefault();
  data.discord={
    name:document.getElementById("discordName").value.trim(),
    invite:document.getElementById("discordInvite").value.trim(),
    description:document.getElementById("discordDescription").value.trim()
  };
  if(window.kvaltikDesktop?.saveDiscordConfig){
    const result=await window.kvaltikDesktop.saveDiscordConfig({
      guildId:document.getElementById("discordGuildId").value.trim(),
      inviteUrl:data.discord.invite,
      serverName:data.discord.name,
      serverDescription:data.discord.description
    });
    if(!result?.ok){
      toast(result?.error||"Discord konfiguraci se nepodařilo uložit.");
      return;
    }
  }
  saveData("Discord nastavení bylo uloženo.");
};
document.getElementById("refreshDiscordInfoBtn").onclick=async()=>{await loadDiscordServerInfo();toast("Discord informace byly obnoveny.")};



document.getElementById("weatherRefreshBtn").onclick=loadWeather;
document.getElementById("saveWeatherCityBtn").onclick=()=>{
  data.weatherCity=document.getElementById("weatherCityInput").value.trim()||"Praha";
  saveData("Město pro počasí bylo uloženo.");
  loadWeather();
};
document.getElementById("addMusicBtn").onclick=async()=>{
  if(!window.kvaltikDesktop?.addMusicFiles){
    toast("Přidávání hudby je dostupné v desktopové verzi.");
    return;
  }
  const result=await window.kvaltikDesktop.addMusicFiles();
  if(result?.ok){
    await loadSavedMusic();
    if(musicPlaylist.length&&musicIndex<0)musicIndex=0;
    toast(result.added?`Přidáno skladeb: ${result.added}`:"Nebyla vybrána žádná hudba.");
  }
};
document.getElementById("musicPlaylistBtn").onclick=()=>document.getElementById("musicPlaylistDrawer").classList.toggle("open");
document.getElementById("closePlaylistBtn").onclick=()=>document.getElementById("musicPlaylistDrawer").classList.remove("open");
document.getElementById("musicPrevBtn").onclick=()=>{
  if(!musicPlaylist.length)return;
  playMusicIndex((musicIndex-1+musicPlaylist.length)%musicPlaylist.length);
};
document.getElementById("musicNextBtn").onclick=()=>{
  if(!musicPlaylist.length)return;
  playMusicIndex(musicShuffle?Math.floor(Math.random()*musicPlaylist.length):(musicIndex+1)%musicPlaylist.length);
};
document.getElementById("musicShuffleBtn").onclick=e=>{musicShuffle=!musicShuffle;e.currentTarget.classList.toggle("active",musicShuffle);toast(musicShuffle?"Náhodné přehrávání zapnuto.":"Náhodné přehrávání vypnuto.")};
document.getElementById("musicRepeatBtn").onclick=e=>{musicRepeat=!musicRepeat;document.getElementById("musicAudio").loop=musicRepeat;e.currentTarget.classList.toggle("active",musicRepeat);toast(musicRepeat?"Opakování zapnuto.":"Opakování vypnuto.")};
document.getElementById("musicPlayBtn").onclick=async()=>{
  const audio=document.getElementById("musicAudio");
  if(!musicPlaylist.length)return;
  if(musicIndex<0)musicIndex=0;
  if(!audio.src){playMusicIndex(musicIndex);return}
  if(audio.paused){try{await audio.play()}catch{};document.getElementById("musicPlayBtn").textContent="⏸"}
  else{audio.pause();document.getElementById("musicPlayBtn").textContent="▶"}
};
document.getElementById("musicVolume").oninput=e=>{
  const value=Math.max(0,Math.min(100,Number(e.target.value)||0));
  document.getElementById("musicAudio").volume=value/100;
  try{hubStorage.setItem("kvaltikHubMusicVolume",String(value))}catch{}
};
document.getElementById("musicProgress").oninput=e=>{
  const a=document.getElementById("musicAudio");
  if(Number.isFinite(a.duration))a.currentTime=(Number(e.target.value)/100)*a.duration;
};
document.getElementById("musicAudio").ontimeupdate=e=>{
  const a=e.target;
  document.getElementById("musicCurrentTime").textContent=formatMusicTime(a.currentTime);
  document.getElementById("musicDuration").textContent=formatMusicTime(a.duration);
  if(Number.isFinite(a.duration)&&a.duration>0)document.getElementById("musicProgress").value=(a.currentTime/a.duration)*100;
};
document.getElementById("musicAudio").onended=()=>document.getElementById("musicNextBtn").click();
document.getElementById("musicAudio").onplay=()=>document.getElementById("musicPlayBtn").textContent="⏸";
document.getElementById("musicAudio").onpause=()=>document.getElementById("musicPlayBtn").textContent="▶";
document.getElementById("musicAudio").onloadedmetadata=e=>{
  document.getElementById("musicDuration").textContent=formatMusicTime(e.target.duration);
};
document.getElementById("musicAudio").onerror=e=>{
  const code=e.target?.error?.code;
  console.error("Audio element error:",code,e.target?.error);
  document.getElementById("musicPlayBtn").textContent="▶";
  if(e.target?.src)toast("Chyba při načítání hudebního souboru.");
};


document.getElementById("checkUpdatesBtn").onclick=()=>checkForUpdates(true);
document.getElementById("downloadUpdateBtn").onclick=async()=>{
  const result=await window.kvaltikDesktop?.downloadUpdate?.();
  if(result&&!result.ok)toast(result.error||"Aktualizaci se nepodařilo stáhnout.");
};
document.getElementById("installUpdateBtn").onclick=async()=>{
  if(!confirm("Kvaltík Hub se zavře, tiše nainstaluje novou verzi a znovu spustí. Pokračovat?"))return;

  const prefs=getUpdatePrefs();
  const result=await window.kvaltikDesktop?.installUpdate?.({
    backupBeforeUpdate:prefs.backupBeforeUpdate
  });

  if(result&&!result.ok){
    if(result.backupFailed){
      const withoutBackup=confirm("Bezpečnostní zálohu se nepodařilo vytvořit.\n\nChceš pokračovat bez zálohy?");
      if(withoutBackup)await window.kvaltikDesktop?.installUpdate?.({backupBeforeUpdate:false});
    }else toast(result.error||"Aktualizaci se nepodařilo nainstalovat.");
  }
};
document.getElementById("autoCheckUpdatesToggle").onchange=saveUpdatePreferences;
document.getElementById("autoDownloadUpdatesToggle").onchange=saveUpdatePreferences;
document.getElementById("backupBeforeUpdateToggle").onchange=saveUpdatePreferences;
document.getElementById("updateChannelSelect").onchange=()=>{
  saveUpdatePreferences();
  updateNoticeDismissedVersion="";
  checkForUpdates(false);
};
document.getElementById("updateNoticeCloseBtn").onclick=()=>{
  updateNoticeDismissedVersion=updateLastState?.availableVersion||"";
  document.getElementById("updateNoticeBanner").style.display="none";
};
document.getElementById("updateNoticeActionBtn").onclick=()=>{
  if(updateLastState?.state==="downloaded")document.getElementById("installUpdateBtn").click();
  else document.querySelector('[data-settings-tab="updates"]')?.click();
};

if(window.kvaltikDesktop?.onUpdateStatus){
  window.kvaltikDesktop.onUpdateStatus(state=>renderUpdateState(state));
}
if(window.kvaltikDesktop?.onOpenUpdateSettings){
  window.kvaltikDesktop.onOpenUpdateSettings(()=>{
    document.querySelector('[data-page="settings"]')?.click();
    setTimeout(()=>document.querySelector('[data-settings-tab="updates"]')?.click(),100);
  });
}

document.getElementById("themeBtn").onclick=()=>{data.theme=data.theme==="dark"?"light":"dark";saveData()};
document.getElementById("menuBtn").onclick=()=>document.getElementById("sidebar").classList.toggle("open");

document.getElementById("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`kvaltik-hub-${currentUser.username}-zaloha.json`;a.click();URL.revokeObjectURL(a.href);toast("Záloha byla vytvořena.");
};
document.getElementById("importInput").onchange=e=>{
  const file=e.target.files[0];if(!file)return;const r=new FileReader();
  r.onload=()=>{try{data={...structuredClone(defaultUserData),...JSON.parse(r.result)};saveData("Záloha byla obnovena.")}catch{alert("Neplatná záloha.")}};r.readAsText(file)
};
document.getElementById("clearBtn").onclick=()=>{if(confirm("Opravdu vymazat data tohoto účtu?")){data=structuredClone(defaultUserData);saveData("Data byla vymazána.")}};

function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__tt);window.__tt=setTimeout(()=>t.classList.remove("show"),2200)}


document.querySelectorAll(".settings-tab").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll(".settings-tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".settings-panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("settings-tab-"+btn.dataset.settingsTab)?.classList.add("active");
});



function initClockAndMusic(){
  updateClock();
  setInterval(updateClock,1000);

  const audio=document.getElementById("musicAudio");
  const volume=document.getElementById("musicVolume");
  const savedVolume=Number(hubStorage.getItem("kvaltikHubMusicVolume")||75);
  const safeVolume=Number.isFinite(savedVolume)?Math.max(0,Math.min(100,savedVolume)):75;
  if(volume)volume.value=String(safeVolume);
  if(audio)audio.volume=safeVolume/100;

  setTimeout(()=>loadSavedMusic(),250);
  setTimeout(()=>loadWeather(),600);
}

initClockAndMusic();


let updateUiInitialized=false;
let updateLastState=null;
let updateNoticeDismissedVersion="";

function humanBytes(bytes){
  const n=Number(bytes||0);
  if(!Number.isFinite(n)||n<=0)return"0 MB";
  if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;
  return`${(n/1024/1024).toFixed(1)} MB`;
}
function setUpdatePill(text,type=""){
  const pill=document.getElementById("updateStatusPill");
  if(!pill)return;
  pill.textContent=text;
  pill.className="update-status-pill"+(type?` ${type}`:"");
}
function getUpdatePrefs(){
  const p=data.updateSettings||{};
  return{
    autoCheck:p.autoCheck!==false,
    autoDownload:!!p.autoDownload,
    backupBeforeUpdate:p.backupBeforeUpdate!==false,
    channel:p.channel==="beta"?"beta":"stable"
  };
}
function renderBackupPreference(){
  const el=document.getElementById("updateBackupStatusText");
  if(!el)return;
  el.textContent=getUpdatePrefs().backupBeforeUpdate
    ?"Před instalací se automaticky vytvoří záloha."
    :"Automatická záloha je vypnutá.";
}
function showUpdateNotice(state){
  const banner=document.getElementById("updateNoticeBanner");
  if(!banner)return;
  const version=state?.availableVersion||"";
  const visible=["available","downloading","downloaded"].includes(state?.state)
    &&version&&version!==updateNoticeDismissedVersion;
  banner.style.display=visible?"grid":"none";
  if(!visible)return;

  const title=document.getElementById("updateNoticeTitle");
  const text=document.getElementById("updateNoticeText");
  const btn=document.getElementById("updateNoticeActionBtn");

  if(state.state==="downloaded"){
    title.textContent=`Aktualizace ${version} je připravená`;
    text.textContent="Je stažená a čeká na instalaci.";
    btn.textContent="Nainstalovat";
  }else if(state.state==="downloading"){
    title.textContent=`Stahuji Kvaltík Hub ${version}`;
    text.textContent=`Staženo ${Math.round(Number(state.percent||0))} %.`;
    btn.textContent="Zobrazit";
  }else{
    title.textContent=`Je dostupná nová verze ${version}`;
    text.textContent=state.releaseNotes
      ?"V aplikaci jsou dostupné poznámky k této verzi."
      :"Nová verze Kvaltík Hubu je připravená.";
    btn.textContent="Zobrazit";
  }
}
function renderUpdateState(state){
  if(!state)return;
  updateLastState=state;

  const current=document.getElementById("updateCurrentVersion");
  const latest=document.getElementById("updateLatestVersion");
  const status=document.getElementById("updateStatusText");
  const checkBtn=document.getElementById("checkUpdatesBtn");
  const downloadBtn=document.getElementById("downloadUpdateBtn");
  const installBtn=document.getElementById("installUpdateBtn");
  const progressWrap=document.getElementById("updateProgressWrap");
  const progressFill=document.getElementById("updateProgressFill");
  const progressPercent=document.getElementById("updateProgressPercent");
  const progressDetail=document.getElementById("updateProgressDetail");
  const notesBox=document.getElementById("updateReleaseNotes");
  const notesText=document.getElementById("updateReleaseNotesText");
  const configText=document.getElementById("updateConfigText");

  if(current)current.textContent=state.currentVersion||"—";
  if(latest)latest.textContent=state.availableVersion||state.currentVersion||"—";
  if(status)status.textContent=state.message||"—";

  if(configText){
    if(!state.supported)configText.textContent=state.reason||"Automatické aktualizace nejsou v této verzi dostupné.";
    else if(!state.configured)configText.textContent="GitHub aktualizace nejsou nakonfigurované.";
    else configText.textContent=`GitHub Releases jsou připravené • kanál ${getUpdatePrefs().channel==="beta"?"Beta":"Stable"}.`;
  }

  if(checkBtn)checkBtn.disabled=state.state==="checking"||state.state==="downloading"||!state.supported;
  if(downloadBtn){
    downloadBtn.style.display=(state.state==="available"&&!getUpdatePrefs().autoDownload)?"inline-block":"none";
  }
  if(installBtn)installBtn.style.display=state.state==="downloaded"?"inline-block":"none";

  if(progressWrap)progressWrap.style.display=state.state==="downloading"?"block":"none";
  if(progressFill)progressFill.style.width=`${Math.max(0,Math.min(100,Number(state.percent||0)))}%`;
  if(progressPercent)progressPercent.textContent=`${Math.round(Number(state.percent||0))} %`;
  if(progressDetail)progressDetail.textContent=`${humanBytes(state.transferred)} / ${humanBytes(state.total)} • ${humanBytes(state.bytesPerSecond)}/s`;

  if(notesBox&&notesText){
    if(state.releaseNotes){
      notesBox.style.display="block";
      notesText.textContent=state.releaseNotes;
    }else notesBox.style.display="none";
  }

  const typeMap={idle:"",checking:"info",available:"warning",downloading:"info",downloaded:"success",uptodate:"success",error:"error",unsupported:"warning"};
  const textMap={idle:"Připraveno",checking:"Kontroluji",available:"Nová verze",downloading:"Stahuji",downloaded:"Připraveno",uptodate:"Aktuální",error:"Chyba",unsupported:"Nedostupné"};
  setUpdatePill(textMap[state.state]||"Čekám",typeMap[state.state]||"");
  showUpdateNotice(state);
}
async function initUpdaterUi(force=false){
  if(updateUiInitialized&&!force)return;
  if(!window.kvaltikDesktop?.getUpdateInfo)return;
  updateUiInitialized=true;

  const prefs=getUpdatePrefs();
  document.getElementById("autoCheckUpdatesToggle").checked=prefs.autoCheck;
  document.getElementById("autoDownloadUpdatesToggle").checked=prefs.autoDownload;
  document.getElementById("backupBeforeUpdateToggle").checked=prefs.backupBeforeUpdate;
  document.getElementById("updateChannelSelect").value=prefs.channel;
  renderBackupPreference();

  try{
    const info=await window.kvaltikDesktop.getUpdateInfo();
    renderUpdateState(info);
    if(prefs.autoCheck&&info?.supported&&info?.configured){
      setTimeout(()=>checkForUpdates(false),2500);
    }
  }catch(e){
    renderUpdateState({state:"error",message:"Stav aktualizací se nepodařilo načíst.",supported:false,currentVersion:"—"});
  }
}
async function checkForUpdates(showToast=true){
  if(!window.kvaltikDesktop?.checkForUpdates)return;
  const prefs=getUpdatePrefs();
  const result=await window.kvaltikDesktop.checkForUpdates({
    autoDownload:prefs.autoDownload,
    channel:prefs.channel
  });
  if(result&&!result.ok&&showToast)toast(result.error||"Kontrola aktualizací se nepodařila.");
}
function saveUpdatePreferences(){
  data.updateSettings={
    autoCheck:document.getElementById("autoCheckUpdatesToggle").checked,
    autoDownload:document.getElementById("autoDownloadUpdatesToggle").checked,
    backupBeforeUpdate:document.getElementById("backupBeforeUpdateToggle").checked,
    channel:document.getElementById("updateChannelSelect").value==="beta"?"beta":"stable"
  };
  saveData("Nastavení aktualizací bylo uloženo.");
  renderBackupPreference();
}

function migrateLegacyBrowserStorage(){
  if(!window.kvaltikDesktop?.storageGet)return;
  try{
    const migrationKey="kvaltikHubDesktopStorageMigratedV16";
    if(hubStorage.getItem(migrationKey)==="1")return;

    const knownKeys=[USERS_KEY,SESSION_KEY];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k && (k.startsWith("kvaltikHubDataV2_") || knownKeys.includes(k))){
          if(hubStorage.getItem(k)===null){
            const value=localStorage.getItem(k);
            if(value!==null)hubStorage.setItem(k,value);
          }
        }
      }
    }catch(e){
      console.warn("Migrace starého localStorage nebyla dostupná:",e);
    }
    hubStorage.setItem(migrationKey,"1");
  }catch(e){
    console.warn("Migrace desktop úložiště:",e);
  }
}

(function init(){
  migrateLegacyBrowserStorage();
  appShell.classList.add("locked");

  const loadingScreen=document.getElementById("loadingScreen");
  const loadingProgress=document.getElementById("loadingProgress");
  const loadingPercent=document.getElementById("loadingPercent");
  const loadingText=document.getElementById("loadingText");

  let startupFinished=false;

  function revealAppOrLogin(){
    if(startupFinished)return;
    startupFinished=true;
    if(window.__kvaltikStartupFailsafe){
      clearTimeout(window.__kvaltikStartupFailsafe);
      window.__kvaltikStartupFailsafe=null;
    }
    try{
      const session=hubStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY);
      if(session){
        const users=getUsers();
        const u=users[session.toLowerCase()];
        if(u){
          currentUser={username:u.username,email:u.email};
          data=loadUserData(u.username);
          showApp();
        }else{
          clearSession();
          showAuth();
        }
      }else{
        showAuth();
      }
    }catch(err){
      console.error("Kvaltík Hub startup error:",err);
      clearSession();
      showAuth();
    }

    if(loadingScreen){
      loadingScreen.classList.add("hide");
      setTimeout(()=>loadingScreen.remove(),500);
    }
  }

  // Bezpečnostní pojistka: loading nikdy nezůstane viset.
  setTimeout(revealAppOrLogin,5000);

  const steps=[
    {p:15,t:"Načítám Kvaltík Hub..."},
    {p:32,t:"Kontroluji uživatelský účet..."},
    {p:52,t:"Načítám ETS 2 a Farming data..."},
    {p:72,t:"Připravuji virtuální firmu..."},
    {p:88,t:"Načítám projekty a Discord..."},
    {p:100,t:"Hotovo!"}
  ];

  let step=0;

  function nextStep(){
    try{
      const s=steps[step];
      if(loadingProgress)loadingProgress.style.width=s.p+"%";
      if(loadingPercent)loadingPercent.textContent=s.p+" %";
      if(loadingText)loadingText.textContent=s.t;
      step++;

      if(step<steps.length){
        setTimeout(nextStep,220);
      }else{
        setTimeout(revealAppOrLogin,250);
      }
    }catch(err){
      console.error("Loading screen error:",err);
      revealAppOrLogin();
    }
  }

  setTimeout(nextStep,120);
})();
