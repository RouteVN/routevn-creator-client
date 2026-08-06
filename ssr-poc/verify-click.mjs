import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const OUT="/home/han4wluc/repositories/RouteVN/routevn-creator-client/ssr-poc/out";
const SHOTS="/home/han4wluc/repositories/RouteVN/routevn-creator-client/ssr-poc/shots";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json"};
const serve=(root,port)=>new Promise(r=>{const s=createServer(async(q,res)=>{let f=path.join(root,decodeURIComponent(q.url.split("?")[0]));if(existsSync(f)&&statSync(f).isDirectory())f=path.join(f,"index.html");if(!existsSync(f))return res.writeHead(404).end();res.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});res.end(await readFile(f));});s.listen(port,()=>r(s));});
const b=await chromium.launch();
for (const [i,v] of ["c_dsd","d_dsd_hydrate"].entries()){
  const port=3280+i; const srv=await serve(path.join(OUT,v),port);
  const ctx=await b.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/projects/`,{waitUntil:"load"}); await p.waitForTimeout(4000);
  const before=await p.evaluate(()=>document.querySelectorAll("dialog[open]").length + (document.querySelector("rvn-app")?.shadowRoot?.querySelectorAll("dialog[open]").length||0));
  // click the visible "Create" button by its on-screen box
  const box=await p.evaluate(()=>{const sc=document.querySelector("rvn-app")?.shadowRoot;if(!sc)return null;
    const btn=[...sc.querySelectorAll("rtgl-button")].find(n=>n.textContent.trim()==="Create");
    if(!btn)return null;const r=btn.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};});
  if(box) await p.mouse.click(box.x,box.y);
  await p.waitForTimeout(1200);
  const after=await p.evaluate(()=>document.querySelectorAll("dialog[open]").length + (document.querySelector("rvn-app")?.shadowRoot?.querySelectorAll("dialog[open]").length||0));
  await p.screenshot({path:path.join(SHOTS,`${v}-clicked.png`)});
  console.log(`${v.padEnd(16)} buttonBox=${box?`${Math.round(box.w)}x${Math.round(box.h)}@${Math.round(box.x)},${Math.round(box.y)}`:"NOT FOUND"}  dialogsOpen ${before} -> ${after}  ${after>before?"INTERACTIVE":"no response"}`);
  await ctx.close(); srv.close();
}
await b.close();
