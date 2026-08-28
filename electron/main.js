const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
let autoUpdater=null;
try{ ({autoUpdater}=require("electron-updater")); }catch(e){ console.error("electron-updater není dostupný:",e.message); }

const HOST = "127.0.0.1";
let PORT = 0; // 0 = Windows automaticky vybere volný port

let mainWindow = null;
let server = null;


const APP_DIR = path.join(__dirname, "..", "app");

function writeStartupLog(message){
  try{
    const file=path.join(app.getPath("userData"),"startup.log");
    const line=`[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(file,line,"utf8");
  }catch{}
}


let updateState={
  state:"idle",
  message:"Aktualizace jsou připravené.",
  currentVersion:"",
  availableVersion:"",
  percent:0,
  transferred:0,
  total:0,
  bytesPerSecond:0,
  releaseNotes:"",
  supported:false,
  configured:false,
  autoDownload:false,
  channel:"stable",
  reason:""
};
let updaterInitialized=false;
let notifiedUpdateVersion="";

function updateLog(message){
  writeStartupLog("UPDATE: "+message);
}
function isPortableBuild(){
  return !!process.env.PORTABLE_EXECUTABLE_FILE;
}
function updaterConfigExists(){
  try{return fs.existsSync(path.join(process.resourcesPath,"app-update.yml"))}
  catch{return false}
}
function normalizeReleaseNotes(notes){
  if(!notes)return"";
  if(typeof notes==="string")return notes.slice(0,6000);
  if(Array.isArray(notes))return notes.map(x=>typeof x==="string"?x:(x?.note||"")).filter(Boolean).join("\n").slice(0,6000);
  return String(notes).slice(0,6000);
}
function sendUpdateState(patch={}){
  updateState={...updateState,...patch,currentVersion:app.getVersion()};
  try{
    if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("update-status",updateState);
  }catch{}
}
function applyUpdatePreferences(preferences={}){
  if(!autoUpdater)return;
  const channel=preferences.channel==="beta"?"beta":"stable";
  autoUpdater.autoDownload=!!preferences.autoDownload;
  autoUpdater.allowPrerelease=channel==="beta";
  updateState.autoDownload=!!preferences.autoDownload;
  updateState.channel=channel;
}
function notifyUpdateAvailable(info){
  const version=info?.version||"";
  if(!version||version===notifiedUpdateVersion)return;
  notifiedUpdateVersion=version;
  try{
    if(Notification.isSupported()){
      const notes=normalizeReleaseNotes(info.releaseNotes).split("\n").find(Boolean)||"Klikni pro podrobnosti.";
      const notification=new Notification({
        title:`Kvaltík Hub ${version}`,
        body:`Je dostupná nová verze. ${notes}`.slice(0,220)
      });
      notification.on("click",()=>{
        if(mainWindow){
          if(mainWindow.isMinimized())mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("update-open-settings");
        }
      });
      notification.show();
    }
  }catch(e){
    updateLog(`Windows notifikace selhala: ${e.message}`);
  }
}
function createPreUpdateBackup(){
  try{
    const userData=app.getPath("userData");
    const backupsRoot=path.join(userData,"update-backups");
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const backupDir=path.join(backupsRoot,`before-${app.getVersion()}-${stamp}`);
    fs.mkdirSync(backupDir,{recursive:true});

    const importantFiles=[
      "hub-storage.json",
      "discord-config.json",
      "music-library.json"
    ];
    for(const name of importantFiles){
      const source=path.join(userData,name);
      if(fs.existsSync(source))fs.copyFileSync(source,path.join(backupDir,name));
    }

    fs.writeFileSync(path.join(backupDir,"backup-info.json"),JSON.stringify({
      createdAt:new Date().toISOString(),
      version:app.getVersion(),
      purpose:"before-update"
    },null,2),"utf8");

    updateLog(`Záloha vytvořena: ${backupDir}`);
    return {ok:true,path:backupDir};
  }catch(e){
    updateLog(`Záloha selhala: ${e.stack||e.message}`);
    return {ok:false,error:e.message};
  }
}
function initializeUpdater(){
  if(updaterInitialized)return;
  updaterInitialized=true;

  const portable=isPortableBuild();
  const configured=updaterConfigExists();
  const supported=!!autoUpdater&&app.isPackaged&&!portable;

  updateState={
    ...updateState,
    currentVersion:app.getVersion(),
    supported,
    configured,
    state:supported?"idle":"unsupported",
    message:supported
      ?(configured?"Připraveno ke kontrole aktualizací.":"GitHub aktualizace nejsou nakonfigurované.")
      :(portable?"Portable verze nepoužívá automatické aktualizace.":(!app.isPackaged?"Aktualizace fungují až v nainstalované aplikaci.":"Modul aktualizací není dostupný.")),
    reason:portable?"Portable verze se neaktualizuje automaticky.":(!app.isPackaged?"Spusť nainstalovaný Kvaltík Hub.":"")
  };

  if(!supported)return;

  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.allowPrerelease=false;

  autoUpdater.on("checking-for-update",()=>{
    updateLog("Kontroluji novou verzi.");
    sendUpdateState({state:"checking",message:"Kontroluji, jestli je dostupná nová verze.",percent:0});
  });
  autoUpdater.on("update-available",info=>{
    updateLog(`Dostupná verze ${info.version}`);
    sendUpdateState({
      state:"available",
      message:`Je dostupná nová verze Kvaltík Hub ${info.version}.`,
      availableVersion:info.version||"",
      releaseNotes:normalizeReleaseNotes(info.releaseNotes)
    });
    notifyUpdateAvailable(info);
  });
  autoUpdater.on("update-not-available",info=>{
    updateLog("Aplikace je aktuální.");
    sendUpdateState({
      state:"uptodate",
      message:"Používáš nejnovější verzi Kvaltík Hubu.",
      availableVersion:info?.version||app.getVersion(),
      percent:0
    });
  });
  autoUpdater.on("download-progress",progress=>{
    sendUpdateState({
      state:"downloading",
      message:"Stahuji aktualizaci na pozadí…",
      percent:Number(progress.percent||0),
      transferred:Number(progress.transferred||0),
      total:Number(progress.total||0),
      bytesPerSecond:Number(progress.bytesPerSecond||0)
    });
  });
  autoUpdater.on("update-downloaded",info=>{
    updateLog(`Aktualizace ${info.version} stažena.`);
    sendUpdateState({
      state:"downloaded",
      message:"Aktualizace je stažená. Po restartu se tiše nainstaluje.",
      availableVersion:info.version||updateState.availableVersion,
      percent:100,
      releaseNotes:normalizeReleaseNotes(info.releaseNotes)||updateState.releaseNotes
    });
  });
  autoUpdater.on("error",err=>{
    updateLog(`Chyba aktualizace: ${err?.stack||err?.message||err}`);
    sendUpdateState({
      state:"error",
      message:"Aktualizaci se nepodařilo zkontrolovat nebo stáhnout.",
      reason:err?.message||String(err||"Neznámá chyba")
    });
  });
}


function hubStoragePath(){
  return path.join(app.getPath("userData"),"hub-storage.json");
}
function loadHubStorage(){
  try{
    const file=hubStoragePath();
    if(!fs.existsSync(file))return {};
    const value=JSON.parse(fs.readFileSync(file,"utf8"));
    return value && typeof value==="object" && !Array.isArray(value) ? value : {};
  }catch(e){
    writeStartupLog(`Chyba čtení hub-storage.json: ${e.message}`);
    return {};
  }
}
function saveHubStorage(storage){
  try{
    const file=hubStoragePath();
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+".tmp";
    fs.writeFileSync(temp,JSON.stringify(storage,null,2),"utf8");
    fs.renameSync(temp,file);
    return true;
  }catch(e){
    writeStartupLog(`Chyba zápisu hub-storage.json: ${e.message}`);
    return false;
  }
}

function musicLibraryPath(){
  return path.join(app.getPath("userData"),"music-library.json");
}
function loadMusicLibrary(){
  try{
    if(!fs.existsSync(musicLibraryPath()))return [];
    const list=JSON.parse(fs.readFileSync(musicLibraryPath(),"utf8"));
    return Array.isArray(list)?list.filter(x=>x&&x.path&&fs.existsSync(x.path)):[];
  }catch{return []}
}
function saveMusicLibrary(list){
  fs.mkdirSync(path.dirname(musicLibraryPath()),{recursive:true});
  fs.writeFileSync(musicLibraryPath(),JSON.stringify(list,null,2),"utf8");
}
function musicPublicList(){
  return loadMusicLibrary().map(x=>({
    id:x.id,
    name:x.name,
    folder:path.basename(path.dirname(x.path)),
    url:`/api/music/${encodeURIComponent(x.id)}`
  }));
}

function configPath(){
  return path.join(app.getPath("userData"), "discord-config.json");
}
function defaultConfig(){
  return {
    guildId:"",
    inviteUrl:"",
    serverName:"Kvaltík Community",
    serverDescription:"Komunita kolem Farming Simulatoru, ETS 2 a Kvaltík Hubu."
  };
}
function loadConfig(){
  const file=configPath();
  try{
    if(!fs.existsSync(file)){
      const cfg=defaultConfig();
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,JSON.stringify(cfg,null,2),"utf8");
      return cfg;
    }
    return {...defaultConfig(),...JSON.parse(fs.readFileSync(file,"utf8"))};
  }catch(e){
    console.error("Discord config:",e);
    return defaultConfig();
  }
}
function saveConfig(cfg){
  const clean={
    guildId:String(cfg?.guildId||"").trim(),
    inviteUrl:String(cfg?.inviteUrl||"").trim(),
    serverName:String(cfg?.serverName||"Kvaltík Community").trim(),
    serverDescription:String(cfg?.serverDescription||"").trim()
  };
  fs.mkdirSync(path.dirname(configPath()),{recursive:true});
  fs.writeFileSync(configPath(),JSON.stringify(clean,null,2),"utf8");
  return clean;
}
async function discordFetch(url,options={}){
  const r=await fetch(url,options);
  if(!r.ok){
    const body=await r.text();
    throw new Error(`Discord API ${r.status}: ${body.slice(0,250)}`);
  }
  return r.json();
}
function json(res,code,data){
  res.writeHead(code,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store"
  });
  res.end(JSON.stringify(data));
}
function contentType(file){
  const ext=path.extname(file).toLowerCase();
  return ({
    ".html":"text/html; charset=utf-8",
    ".css":"text/css; charset=utf-8",
    ".js":"application/javascript; charset=utf-8",
    ".json":"application/json; charset=utf-8",
    ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
    ".svg":"image/svg+xml",".webp":"image/webp"
  })[ext]||"application/octet-stream";
}
function serveStatic(res,urlPath){
  let pathname=decodeURIComponent(urlPath);
  if(pathname==="/")pathname="/index.html";
  const file=path.normalize(path.join(APP_DIR,pathname));
  if(!file.startsWith(APP_DIR))return json(res,403,{error:"Forbidden"});
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())return json(res,404,{error:"Not found"});
  res.writeHead(200,{"Content-Type":contentType(file)});
  fs.createReadStream(file).pipe(res);
}
async function discordServerInfo(){
  const cfg=loadConfig();
  const fallback={
    name:cfg.serverName,
    description:cfg.serverDescription,
    inviteUrl:cfg.inviteUrl,
    widgetAvailable:false,
    presence_count:null,
    channels:[]
  };

  if(!cfg.guildId)return fallback;

  try{
    const widget=await discordFetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(cfg.guildId)}/widget.json`
    );
    return {
      ...fallback,
      ...widget,
      widgetAvailable:true,
      inviteUrl:widget.instant_invite||cfg.inviteUrl||""
    };
  }catch{
    return fallback;
  }
}
function startInternalServer(){
  return new Promise((resolve,reject)=>{
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,`http://${req.headers.host||`${HOST}:${PORT}`}`);
      try{

        if(req.method==="GET" && url.pathname==="/api/weather"){
          const city=(url.searchParams.get("city")||"Praha").trim();
          try{
            const geoUrl="https://geocoding-api.open-meteo.com/v1/search?count=1&language=cs&format=json&name="+encodeURIComponent(city);
            const geoRes=await fetch(geoUrl);
            if(!geoRes.ok)throw new Error("Geocoding");
            const geo=await geoRes.json();
            const loc=geo?.results?.[0];
            if(!loc)return json(res,404,{error:"Město nenalezeno"});
            const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
            const wRes=await fetch(weatherUrl);
            if(!wRes.ok)throw new Error("Weather");
            const w=await wRes.json();
            return json(res,200,{...w.current,locationName:[loc.name,loc.admin1].filter(Boolean).join(", ")});
          }catch(e){
            return json(res,503,{error:"Počasí není dostupné"});
          }
        }

        if(req.method==="GET" && url.pathname.startsWith("/api/music/")){
          const id=decodeURIComponent(url.pathname.slice("/api/music/".length));
          const item=loadMusicLibrary().find(x=>x.id===id);
          if(!item||!fs.existsSync(item.path))return json(res,404,{error:"Track not found"});
          const stat=fs.statSync(item.path);
          const ext=path.extname(item.path).toLowerCase();
          const type=
            ext===".mp3"?"audio/mpeg":
            ext===".wav"?"audio/wav":
            ext===".m4a"?"audio/mp4":
            ext===".aac"?"audio/aac":
            ext===".ogg"?"audio/ogg":
            ext===".flac"?"audio/flac":
            "application/octet-stream";
          const range=req.headers.range;
          if(range){
            const m=/bytes=(\d*)-(\d*)/.exec(range);
            const start=m&&m[1]?parseInt(m[1],10):0;
            const end=m&&m[2]?parseInt(m[2],10):stat.size-1;
            const safeStart=Math.max(0,Math.min(start,stat.size-1));
            const safeEnd=Math.max(safeStart,Math.min(end,stat.size-1));

            res.writeHead(206,{
              "Content-Type":type,
              "Content-Length":safeEnd-safeStart+1,
              "Content-Range":`bytes ${safeStart}-${safeEnd}/${stat.size}`,
              "Accept-Ranges":"bytes",
              "Cache-Control":"no-store"
            });
            return fs.createReadStream(item.path,{start:safeStart,end:safeEnd}).pipe(res);
          }
          res.writeHead(200,{"Content-Type":type,"Content-Length":stat.size,"Accept-Ranges":"bytes","Cache-Control":"no-store"});
          return fs.createReadStream(item.path).pipe(res);
        }

        if(req.method==="GET" && url.pathname==="/api/discord-server"){
          return json(res,200,await discordServerInfo());
        }
        return serveStatic(res,url.pathname);
      }catch(e){
        console.error("Internal server:",e);
        return json(res,500,{error:"Interní chyba Kvaltík Hubu"});
      }
    });

    server.once("error",reject);
    server.listen(PORT,HOST,()=>{
      const address=server.address();
      PORT=address && typeof address==="object" ? address.port : PORT;
      console.log(`Kvaltík Hub interní server běží na portu ${PORT}`);
      resolve(PORT);
    });
  });
}
function createWindow(){
  mainWindow=new BrowserWindow({
    width:1440,
    height:900,
    minWidth:1050,
    minHeight:700,
    backgroundColor:"#0b0f14",
    title:"Kvaltík Hub",
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,"preload.js"),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:false
    }
  });

  writeStartupLog(`Načítám aplikaci na http://${HOST}:${PORT}`);
  mainWindow.loadURL(`http://${HOST}:${PORT}`).catch(err=>{
    writeStartupLog(`loadURL chyba: ${err.message}`);
    dialog.showErrorBox("Kvaltík Hub","Nepodařilo se načíst uživatelské rozhraní.\n\n"+err.message);
  });

  mainWindow.webContents.on("did-finish-load",()=>{
    writeStartupLog("Renderer úspěšně načten.");
  });

  mainWindow.webContents.on("did-fail-load",(_event,errorCode,errorDescription)=>{
    writeStartupLog(`did-fail-load ${errorCode}: ${errorDescription}`);
  });

  mainWindow.webContents.on("render-process-gone",(_event,details)=>{
    writeStartupLog(`Renderer skončil: ${details.reason}`);
    if(!mainWindow?.isDestroyed()){
      dialog.showMessageBox(mainWindow,{
        type:"error",
        title:"Kvaltík Hub",
        message:"Uživatelské rozhraní aplikace se neočekávaně ukončilo.",
        detail:"Aplikaci zkus znovu spustit. Pokud se chyba opakuje, pošli soubor startup.log.",
        buttons:["Zavřít"]
      }).finally(()=>app.quit());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    shell.openExternal(url);
    return {action:"deny"};
  });

  mainWindow.on("closed",()=>{mainWindow=null});
}

ipcMain.handle("discord-config-get",()=>loadConfig());
ipcMain.handle("discord-config-save",(_event,cfg)=>{
  try{
    const saved=saveConfig(cfg);
    return {ok:true,config:saved};
  }catch(e){
    return {ok:false,error:"Konfiguraci se nepodařilo uložit."};
  }
});




ipcMain.on("storage-get",(event,key)=>{
  try{
    const storage=loadHubStorage();
    event.returnValue=Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null;
  }catch{
    event.returnValue=null;
  }
});

ipcMain.on("storage-set",(event,payload)=>{
  try{
    const key=String(payload?.key||"");
    if(!key){event.returnValue=false;return}
    const storage=loadHubStorage();
    storage[key]=String(payload?.value??"");
    event.returnValue=saveHubStorage(storage);
  }catch{
    event.returnValue=false;
  }
});

ipcMain.on("storage-remove",(event,key)=>{
  try{
    const storage=loadHubStorage();
    delete storage[String(key||"")];
    event.returnValue=saveHubStorage(storage);
  }catch{
    event.returnValue=false;
  }
});

ipcMain.handle("update-get-info",()=>{
  initializeUpdater();
  return updateState;
});

ipcMain.handle("update-check",async(_event,preferences={})=>{
  initializeUpdater();
  if(!updateState.supported)return {ok:false,error:updateState.message};
  if(!updateState.configured)return {ok:false,error:"Aktualizace nejsou nakonfigurované pro GitHub Releases."};

  try{
    applyUpdatePreferences(preferences);
    sendUpdateState({
      autoDownload:!!preferences.autoDownload,
      channel:preferences.channel==="beta"?"beta":"stable"
    });
    await autoUpdater.checkForUpdates();
    return {ok:true};
  }catch(e){
    updateLog(`checkForUpdates chyba: ${e.stack||e.message}`);
    sendUpdateState({state:"error",message:"Kontrola aktualizací selhala.",reason:e.message});
    return {ok:false,error:e.message};
  }
});

ipcMain.handle("update-download",async()=>{
  initializeUpdater();
  if(!updateState.supported)return {ok:false,error:updateState.message};
  try{
    await autoUpdater.downloadUpdate();
    return {ok:true};
  }catch(e){
    updateLog(`downloadUpdate chyba: ${e.stack||e.message}`);
    return {ok:false,error:e.message};
  }
});

ipcMain.handle("update-install",(_event,preferences={})=>{
  initializeUpdater();
  if(updateState.state!=="downloaded")return {ok:false,error:"Aktualizace ještě není stažená."};

  if(preferences.backupBeforeUpdate!==false){
    const backup=createPreUpdateBackup();
    if(!backup.ok)return {ok:false,backupFailed:true,error:backup.error};
  }

  updateLog("Spouštím tichou instalaci stažené aktualizace.");
  // isSilent=true skryje průvodce NSIS; isForceRunAfter=true aplikaci po instalaci znovu spustí.
  setImmediate(()=>autoUpdater.quitAndInstall(true,true));
  return {ok:true};
});

ipcMain.handle("music-library-get",()=>musicPublicList());

ipcMain.handle("music-add-files",async()=>{
  const result=await dialog.showOpenDialog({
    title:"Vybrat hudbu",
    properties:["openFile","multiSelections"],
    filters:[{name:"Hudba",extensions:["mp3","wav","m4a","aac","ogg","flac"]}]
  });
  if(result.canceled)return {ok:true,added:0};

  const library=loadMusicLibrary();
  let added=0;
  for(const filePath of result.filePaths){
    const exists=library.some(x=>x.path===filePath);
    if(exists)continue;
    const id=require("crypto").createHash("sha1").update(filePath+Date.now()+Math.random()).digest("hex").slice(0,16);
    library.push({
      id,
      path:filePath,
      name:path.basename(filePath,path.extname(filePath))
    });
    added++;
  }
  saveMusicLibrary(library);
  return {ok:true,added};
});

ipcMain.handle("music-remove-track",(_event,id)=>{
  const library=loadMusicLibrary().filter(x=>x.id!==id);
  saveMusicLibrary(library);
  return {ok:true};
});

const gotLock=app.requestSingleInstanceLock();
if(!gotLock){
  app.quit();
}else{
  app.on("second-instance",()=>{
    if(mainWindow){
      if(mainWindow.isMinimized())mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async()=>{
    app.setAppUserModelId("cz.kvaltik.hub");
    writeStartupLog("Spouštím Kvaltík Hub.");
    try{
      await startInternalServer();
      writeStartupLog(`Interní server spuštěn na portu ${PORT}.`);
      initializeUpdater();
      createWindow();
    }catch(e){
      console.error(e);
      writeStartupLog(`Chyba startu: ${e.stack||e.message}`);
      const { dialog }=require("electron");
      dialog.showErrorBox(
        "Kvaltík Hub",
        `Aplikaci se nepodařilo spustit.\n\n${e.message}`
      );
      app.quit();
    }
  });

  app.on("window-all-closed",()=>{
    if(process.platform!=="darwin")app.quit();
  });

  app.on("activate",()=>{
    if(BrowserWindow.getAllWindows().length===0 && server)createWindow();
  });

  app.on("before-quit",()=>{
    try{server?.close()}catch{}
  });
}
