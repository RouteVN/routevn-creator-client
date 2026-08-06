import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const OUT="/home/han4wluc/repositories/RouteVN/routevn-creator-client/ssr-poc/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json"};
const serve=(root,port)=>new Promise(r=>{const s=createServer(async(q,res)=>{let f=path.join(root,decodeURIComponent(q.url.split("?")[0]));if(existsSync(f)&&statSync(f).isDirectory())f=path.join(f,"index.html");if(!existsSync(f))return res.writeHead(404).end();res.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});res.end(await readFile(f));});s.listen(port,()=>r(s));});
const b=await chromium.launch();
for (const [i,v] of ["d_dsd_hydrate"].entries()){
  const port=3290+i; const srv=await serve(path.join(OUT,v),port);
  const ctx=await b.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
  await p.goto(`http://127.0.0.1:${port}/projects/`,{waitUntil:"load"}); await p.waitForTimeout(4000);
  const r=await p.evaluate(()=>{
    const app=document.querySelector("rvn-app"); const sc=app?.shadowRoot;
    const proj=sc?.querySelector("rvn-projects");
    return {
      appHydrated: globalThis.__rtglSsr?.hydrated ?? 0,
      appMismatched: globalThis.__rtglSsr?.mismatched ?? 0,
      projExists: Boolean(proj),
      projHasOwnShadow: Boolean(proj?.shadowRoot),
      projLightChildren: proj?.children.length ?? -1,     // server content, orphaned if >0
      projShadowViews: proj?.shadowRoot?.querySelectorAll("rtgl-view").length ?? -1,
      projLightViews: proj ? proj.querySelectorAll("rtgl-view").length : -1,
    };
  });
  console.log(JSON.stringify(r,null,1));
  await ctx.close(); srv.close();
}
await b.close();
