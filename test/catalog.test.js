import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectProducts,updateProducts} from '../scripts/update-products.js';
import {verifyProducts} from '../scripts/audit-images.js';
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
  const result=await verifyProducts([{id:'a',images:[bad,good]},{id:'b',images:[bad]}],{
    request:async url=>new Response(null,{status:url===good?200:404,headers:{'content-type':url===good?'image/jpeg':'text/html'}})
  });
  assert.deepEqual(result.products.map(x=>({id:x.id,images:x.images})),[{id:'a',images:[good]}]);
  assert.equal(result.checked,2);
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
