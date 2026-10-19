// 免费VPS/优惠福利情报系统:轮询 RSS → 打标签 → SSE 实时推送
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||8080, EVERY=(+process.env.POLL_SEC||300)*1000;
const FEEDS=[
  {name:'LowEndTalk',url:'https://lowendtalk.com/categories/offers/feed.rss'},
  {name:'LowEndBox',url:'https://lowendbox.com/feed/'},
  ...(process.env.EXTRA_FEEDS?process.env.EXTRA_FEEDS.split(',').map((u,i)=>({name:'自定义'+(i+1),url:u})):[])
];
const FILE=path.join(__dirname,'items.json');
let items=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):[];
const seen=new Set(items.map(i=>i.id));
const clients=new Set();
const dec=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const strip=s=>dec(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(b,t)=>{const m=b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'i'));return m?m[1]:''};
function classify(title,desc){
  const t=(title+' '+desc).toLowerCase(),tags=[];
  if(/\bfree\b|免费|\$0\b|0\s*\/\s*(mo|yr|month|year)/.test(t))tags.push('免费');
  if(/coupon|promo code|code:|discount|优惠|折扣|% off|off\b/.test(t))tags.push('优惠码');
  if(/black friday|cyber monday|christmas|new year|flash sale|限时|黑五|special/.test(t))tags.push('限时');
  if(/giveaway|bonus|credit|reward|红包|赠送|福利/.test(t))tags.push('福利');
  if(/kvm|vps/.test(t))tags.push('VPS');
  if(/dedicated|server/.test(t)&&!tags.includes('VPS'))tags.push('服务器');
  const pm=t.match(/\$\s?(\d+(?:\.\d+)?)\s*(?:\/|per)?\s*(mo|month|yr|year|annual)?/);
  return {tags,price:pm?`$${pm[1]}${pm[2]?'/'+(/^m/.test(pm[2])?'月':'年'):''}`:null,
    hot:tags.includes('免费')||tags.includes('福利')||tags.length>=3};
}
async function pull(f){
  const r=await fetch(f.url,{headers:{'user-agent':'Mozilla/5.0 deals-bot'},signal:AbortSignal.timeout(15000)});
  const xml=await r.text(),fresh=[];
  for(const b of xml.split(/<item[\s>]/).slice(1)){
    const link=strip(tag(b,'link')),title=strip(tag(b,'title'));
    if(!title||!link)continue;
    const id=strip(tag(b,'guid'))||link;if(seen.has(id))continue;
    const desc=strip(tag(b,'description')||tag(b,'content:encoded')).slice(0,400);
    const d=new Date(strip(tag(b,'pubDate'))||Date.now());
    fresh.push({id,title,link,desc,source:f.name,time:isNaN(d)?Date.now():+d,...classify(title,desc)});
  }
  return fresh;
}
let status={};
async function poll(first){
  for(const f of FEEDS){
    try{const fresh=await pull(f);status[f.name]={ok:true,at:Date.now(),n:fresh.length};
      fresh.sort((a,b)=>a.time-b.time);
      for(const it of fresh){seen.add(it.id);items.push(it);if(!first)broadcast(it)}
    }catch(e){status[f.name]={ok:false,at:Date.now(),err:String(e.message)}}
  }
  items.sort((a,b)=>b.time-a.time);items=items.slice(0,1000);
  fs.writeFileSync(FILE,JSON.stringify(items));
}
function broadcast(it){for(const c of clients)c.write(`event: deal\ndata: ${JSON.stringify(it)}\n\n`)}
const json=(res,o)=>{res.writeHead(200,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'});res.end(JSON.stringify(o))};
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/events'){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
    res.write('retry: 3000\n\n');clients.add(res);
    const hb=setInterval(()=>res.write(': hb\n\n'),20000);
    req.on('close',()=>{clients.delete(res);clearInterval(hb)});return;
  }
  if(u.pathname==='/api/deals'){
    const tg=u.searchParams.get('tag'),q=(u.searchParams.get('q')||'').toLowerCase();
    return json(res,{status,total:items.length,
      items:items.filter(i=>(!tg||i.tags.includes(tg))&&(!q||(i.title+i.desc).toLowerCase().includes(q))).slice(0,+u.searchParams.get('n')||150)});
  }
  if(u.pathname==='/api/refresh'){await poll();return json(res,{ok:true,status})}
  if(u.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  res.writeHead(404);res.end('not found');
}).listen(PORT,'0.0.0.0',()=>console.log('listening',PORT));
poll(items.length===0).then(()=>setInterval(()=>poll(),EVERY));
