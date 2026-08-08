import fs from "node:fs"
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("="))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]))
const BASE="https://merchant-api.ifood.com.br", M="f10f1cb5-a341-4ca5-8b21-7f076c35cb5b"
const b=new URLSearchParams({grantType:"client_credentials",clientId:env.IFOOD_CLIENT_ID,clientSecret:env.IFOOD_CLIENT_SECRET})
const tj=await (await fetch(`${BASE}/authentication/v1.0/oauth/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b})).json()
const H={Authorization:`Bearer ${tj.accessToken}`}
const P=`${BASE}/financial/v3.0/merchants/${M}/reconciliation/on-demand`
for (const comp of ["2026-05","2026-06","2026-08"]) {
  const r=await fetch(P,{method:"POST",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify({competence:comp})})
  const txt=await r.text()
  const id=(txt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)||[])[0]
  console.log(`\n${comp}  POST ${r.status}  id=${id??"—"}`)
  if(!id){ console.log("   corpo:", txt.slice(0,160)); continue }
  for (const espera of [20000,30000,40000]) {
    await new Promise(s=>setTimeout(s,espera))
    const g=await fetch(`${P}/${id}`,{headers:H})
    const t=await g.text()
    let j={}; try{ j=JSON.parse(t) }catch{}
    console.log(`   +${espera/1000}s → HTTP ${g.status} status=${j.status??"?"} arquivo=${j.filePath?"sim":"não"}`)
    if(j.status==="processed"||g.status===404) break
  }
}
