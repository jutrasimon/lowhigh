import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Game} from './game.js';
const products=JSON.parse(await readFile(new URL('./data/products.json',import.meta.url),'utf8'));
export function createServer(game=new Game(products)) {
  const limits=new Map();
  const server=http.createServer(async(req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    try {
      const url=new URL(req.url,'http://localhost');
      res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://www.ikea.com; media-src https://www.ikea.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      if(url.pathname==='/health')return send(200,{ok:true});
      if(url.pathname.startsWith('/api/')) {
        if(req.method!=='GET' && req.method!=='POST')return send(405,{error:'Méthode non permise.'});
        if(req.method==='POST') {
          if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Origine non permise.'});
          if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON requis.'});
        }
        const ip=req.socket.remoteAddress, now=Date.now();
        if(limits.size>10000)for(const[k,v]of limits)if(now-v.at>60000)limits.delete(k);
        let limit=limits.get(ip);if(!limit||now-limit.at>60000){limit={at:now,n:0};limits.set(ip,limit);}
        if(++limit.n>1500)return send(429,{error:'Trop de requêtes. Attends une minute.'});
        let data={};
        if(req.method==='POST') {let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,{error:'Requête trop longue.'});}try{data=JSON.parse(body);}catch{return send(400,{error:'JSON invalide.'});}if(!data||typeof data!=='object'||Array.isArray(data))return send(400,{error:'Requête invalide.'});}
        if(url.pathname==='/api/create'&&req.method==='POST')return send(201,game.create(data.name));
        if(url.pathname==='/api/join'&&req.method==='POST')return send(200,game.join(data.code,data.name));
        const match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{5})(?:\/(guess|start|next|leave))?$/);
        if(!match)return send(404,{error:'Route introuvable.'});
        const token=req.headers.authorization?.replace(/^Bearer /,'');
        if(req.method==='GET'&&!match[2])return send(200,game.state(match[1],token));
        if(req.method==='POST'&&match[2])return send(200,game.action(match[1],token,match[2],data));
        return send(405,{error:'Méthode non permise.'});
      }
      const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
      if(!files[url.pathname])return send(404,{error:'Introuvable.'});
      const [file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await readFile(new URL('./public/'+file,import.meta.url)));
    }catch(e){send(e.status||500,{error:e.status?e.message:'Erreur du serveur. Réessaie.'});}
  });
  const timer=setInterval(()=>game.cleanup(),60000);timer.unref();server.on('close',()=>clearInterval(timer));
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createServer().listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Low Ball High Ball → http://localhost:'+(process.env.PORT||3000)));
