import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectProducts,updateProducts} from '../scripts/update-products.js';
import {verifyProducts,imageMime} from '../scripts/audit-images.js';
import {createServer} from '../server.js';
import {Game} from '../game.js';

const today=new Date('2026-09-25T12:00:00Z');
const sample=(id,overrides={})=>({id,type:'PRODUCT',currency:'CAD',price:14.49,price_per:null,date:'2026-09-19',
  product:{code:String(id),product_name:'Fromage Havarti',brands:'Saputo',quantity:'750 g',image_url:'https://images.openfoodfacts.org/images/products/test.jpg'},
  location:{osm_name:'Costco',osm_address_country_code:'CA'},...overrides});

test('Les relevés canadiens valides deviennent des produits avec vendeur, date et source',()=>{
  const products=selectProducts([sample(1),sample(2,{product:{...sample(2).product,code:'1'}}),sample(3,{currency:'USD'}),sample(4,{date:'2025-01-01'})],today);
  assert.equal(products.length,1);
  assert.deepEqual({price:products[0].priceCents,seller:products[0].seller,date:products[0].checkedAt,source:products[0].source},
    {price:1449,seller:'Costco',date:'2026-09-19',source:'https://prices.openfoodfacts.org/prices/1'});
});
test('L’audit écarte les photos mortes et les produits sans autre image',async()=>{
  const good='https://cdn.epiceries.ca/good.jpg',bad='https://cdn.epiceries.ca/missing.jpg';
  const avif=Buffer.concat([Buffer.from('0000001c6674797061766966','hex'),Buffer.alloc(1024)]);
  const result=await verifyProducts([{id:'a',images:[bad,good]},{id:'b',images:[bad]}],{
    request:async url=>new Response(url===good?avif:null,{status:url===good?200:404,headers:{'content-type':url===good?'image/png':'text/html'}})
  });
  assert.deepEqual(result.products.map(x=>({id:x.id,images:x.images})),[{id:'a',images:[good]}]);
  assert.equal(result.checked,2);
  assert.equal(imageMime(avif),'image/avif');
});
test('Le serveur sert une photo AVIF sous le bon type malgré le type erroné du fournisseur',async()=>{
  const photo='https://cdn.epiceries.ca/photo.png';
  const bytes=Buffer.concat([Buffer.from('0000001c6674797061766966','hex'),Buffer.alloc(1024)]);
  const product={id:'image-test',name:'Produit',description:'Format test',images:[photo],priceCents:1000};
  const server=createServer(new Game([product]),async()=>[],async()=>new Response(bytes,{status:200,headers:{'content-type':'image/png'}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const post=async(path,body,token)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}).then(r=>r.json());
    const a=await post('/api/create',{name:'A'});await post('/api/join',{name:'B',code:a.code});
    const state=await post('/api/rooms/'+a.code+'/start',{},a.token);
    assert.match(state.product.images[0],/^\/image\/[a-f0-9]{32}$/);
    assert.equal(state.product.backupImages[0],photo);
    const response=await fetch(base+state.product.images[0]);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/avif');
    assert.equal((await response.arrayBuffer()).byteLength,bytes.length);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Les photos Christie’s gardent leur URL directe',async()=>{
  const photo='https://www.christies.com/img/LotImages/test.jpg';
  const game=new Game([{id:'lot',name:'Lot',images:[photo],priceCents:1000,modes:['expert']}]);
  const server=createServer(game);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{assert.equal(game.products[0].images[0],photo);assert.equal(game.products[0].backupImages[0],photo);}
  finally{await new Promise(resolve=>server.close(resolve));}
});

test('Une mise à jour insuffisante préserve le catalogue précédent',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'lowhigh-products-')),path=join(directory,'products.json');
  try{
    await writeFile(path,'ancien catalogue');
    await assert.rejects(updateProducts({destination:pathToFileURL(path),today,request:async()=>({ok:true,json:async()=>({items:[sample(1)]})})}),/catalogue précédent conservé/);
    assert.equal(await readFile(path,'utf8'),'ancien catalogue');
    const result=await updateProducts({destination:pathToFileURL(path),today,request:async()=>({ok:true,json:async()=>({items:Array.from({length:5},(_,i)=>sample(i+1))})})});
    assert.deepEqual(result,{count:5,changed:true});
    assert.equal(JSON.parse(await readFile(path,'utf8')).length,5);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Seul l’hôte actualise le catalogue au lobby, sans interrompre les manches',async()=>{
  const before=Array.from({length:5},(_,i)=>({id:'old'+i,priceCents:1000}));
  const fresh=Array.from({length:5},(_,i)=>({id:'new'+i,priceCents:2000}));
  const game=new Game(before),server=createServer(game,async()=>fresh);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(path,data,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};};
  try{
    const host=(await post('/api/create',{name:'Host'})).body;
    const guest=(await post('/api/join',{name:'Guest',code:host.code})).body;
    const route='/api/rooms/'+host.code;
    assert.equal((await post(route+'/refresh',{},guest.token)).status,403);
    assert.equal((await post(route+'/refresh',{},host.token)).body.catalogCount,5);
    assert.deepEqual(game.products.map(p=>p.id).slice(-5),fresh.map(p=>p.id));
    assert.equal((await post(route+'/refresh',{},host.token)).status,429);
    await post(route+'/start',{},host.token);
    assert.equal((await post(route+'/refresh',{},host.token)).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
