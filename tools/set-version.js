const fs=require("fs");
const path=require("path");

const version=process.argv[2];
if(!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)){
  console.error("Pouziti: node tools/set-version.js 15.0.1");
  process.exit(1);
}
const file=path.join(__dirname,"..","package.json");
const pkg=JSON.parse(fs.readFileSync(file,"utf8"));
pkg.version=version;
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+"\n","utf8");
console.log("Kvaltik Hub verze nastavena na",version);
