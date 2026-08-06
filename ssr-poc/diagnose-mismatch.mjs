import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const OUT="/home/han4wluc/repositories/RouteVN/routevn-creator-client/ssr-poc/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".json":"application/json"};
const serve=(root,port)=>new Promise(r=>{const s=createServer(async(q,res)=>{let f=path.join(root,decodeURIComponent(q.url.split("?")[0]));if(existsSync(f)&&statSync(f).isDirectory())f=path.join(f,"index.html");if(!existsSync(f))return res.writeHead(404).end();res.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"});res.end(await readFile(f));});s.listen(port,()=>r(s));});
const b=await chromium.launch();
const srv=await serve(path.join(OUT,"e_nested_dsd"),3310);
const ctx=await b.newContext({viewport:{width:1440,height:900}}); const p=await ctx.newPage();
// Block main.js: only the BLOCKING rtgl bundle runs. Any DOM change vs the
// served HTML is caused by rtgl-* primitives upgrading, not by the app.
await p.route("**/public/main.js*",r=>r.abort());
await p.goto("http://127.0.0.1:3310/projects/",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1500);
const live=await p.evaluate(()=>{
  // search all shadow roots
  const walk=(root,out=[])=>{root.querySelectorAll("*").forEach(n=>{if(n.tagName==="RTGL-FORM")out.push(n);if(n.shadowRoot)walk(n.shadowRoot,out);});return out;};
  const forms=walk(document);
  const f=forms.find(x=>x.id==="createProjectForm")||forms[0];
  if(!f)return {found:false,total:forms.length};
  return {found:true,id:f.id,childCount:f.children.length,
    childTags:[...f.children].map(c=>c.tagName.toLowerCase()+(c.getAttribute("slot")?`[slot=${c.getAttribute("slot")}]`:"")),
    hasShadow:Boolean(f.shadowRoot)};
});
const served=await readFile(path.join(OUT,"e_nested_dsd/projects/index.html"),"utf8");
const m=served.match(/<rtgl-form[^>]*id="createProjectForm"[^>]*>([\s\S]*?)<\/rtgl-form>/);
console.log("SERVED  (server HTML) direct child tags:", m?[...m[1].matchAll(/<(rtgl-[a-z-]+)[^>]*slot="([^"]*)"/g)].map(x=>`${x[1]}[slot=${x[2]}]`):"n/a");
console.log("LIVE    (after rtgl bundle, main.js blocked):", JSON.stringify(live));
await ctx.close(); srv.close(); await b.close();
