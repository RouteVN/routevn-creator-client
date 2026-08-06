import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const OUT="/home/han4wluc/repositories/RouteVN/routevn-creator-client/ssr-poc/out/e_nested_dsd";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json"};
const srv=await new Promise(r=>{const s=createServer(async(q,res)=>{let f=path.join(OUT,decodeURIComponent(q.url.split("?")[0]));if(existsSync(f)&&statSync(f).isDirectory())f=path.join(f,"index.html");if(!existsSync(f))return res.writeHead(404).end();res.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});res.end(await readFile(f));});s.listen(3350,()=>r(s));});
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
// main.js blocked: ONLY the blocking rtgl bundle runs. Any diff vs the served
// HTML is caused by a primitive mutating light DOM at parse time.
await p.route("**/public/main.js*",r=>r.abort());
await p.goto("http://127.0.0.1:3350/project/images/?p=demo-project",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
const live=await p.evaluate(()=>{
  const out=[];
  const walk=(root)=>{root.querySelectorAll("*").forEach(n=>{
    if(n.tagName==="RTGL-VIEW"){
      const kids=[...n.children].map(c=>c.tagName.toLowerCase()+(c.hasAttribute("data-rtgl-popover-content")?"[popover-wrapper]":""));
      // record views whose children include something suspicious
      if(kids.length) out.push({attrs:n.getAttributeNames().join(","), kids});
    }
    if(n.shadowRoot)walk(n.shadowRoot);});};
  walk(document);
  return out.slice(0,40);
});
const served=await readFile(path.join(OUT,"project/images/index.html"),"utf8");
console.log("served <a> count:", (served.match(/<a /g)||[]).length);
console.log("live rtgl-view children containing an <a>:", live.filter(v=>v.kids.includes("a")).length);
console.log("sample live rtgl-view child lists:");
live.filter(v=>v.kids.length>1).slice(0,6).forEach(v=>console.log("  ", JSON.stringify(v.kids), " attrs:", v.attrs.slice(0,60)));
await ctx.close(); srv.close(); await b.close();
