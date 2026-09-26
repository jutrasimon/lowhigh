import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,score,AUCTION_CASH_CENTS} from '../game.js';
import {createServer} from '../server.js';
const products=Array.from({length:5},(_,i)=>({id:'p'+i,name:'Produit réel test',description:'Description',images:['https://example.com/photo.jpg'],priceCents:10000,source:'https://example.com',checkedAt:'2026-09-21'}));
function setup(options){const game=new Game(products,options),a=game.create('Simon'),b=game.join(a.code,'Alex');return{game,a,b,call:(s,t,d)=>game.action(s.code,s.token,t,d),view:s=>game.state(s.code,s.token)};}
test('La proximité est symétrique, plafonnée et proportionnelle au prix',()=>{assert.equal(score(10000,10000),100);assert.equal(score(9000,10000),90);assert.equal(score(11000,10000),90);assert.equal(score(100000,10000),0);assert.equal(score(0,10000),0);assert.equal(score(900,1000),90);});
test('L’hôte remplace un produit sans photo ou défectueux sans consommer la manche',()=>{
  let now=1000;
  const catalog=[...products,...[5,6].map(i=>({...products[0],id:'p'+i})),{...products[0],id:'sans-photo',images:[]}];
  const game=new Game(catalog,{now:()=>now}),a=game.create('A'),b=game.join(a.code,'B');
  const call=(who,type,data={})=>game.action(who.code,who.token,type,data),view=()=>game.state(a.code,a.token);
  call(a,'start');assert.notEqual(view().product.id,'sans-photo');
  const first=view().product.id,key=view().roundKey;
  call(a,'guess',{round:0,cents:10000});
  assert.throws(()=>call(b,'skip'),/hôte/);
  now+=2000;call(a,'skip',{round:0,roundKey:key});
  assert.equal(view().round,0);assert.notEqual(view().product.id,first);assert.notEqual(view().roundKey,key);
  assert.equal(view().myGuess,null);assert.equal(view().players[0].score,0);assert.equal(view().deadline,now+45000);
  call(a,'guess',{round:0,cents:10000});call(b,'guess',{round:0,cents:11000});
  assert.throws(()=>call(b,'revealSkip'),/hôte/);
  call(a,'revealSkip',{round:0,roundKey:view().roundKey});assert.equal(view().revealSkipped,true);
});
test('Une partie complète, sans fuite, réponses verrouillées, égalités et revanche',()=>{const {a,b,call,view}=setup();assert.throws(()=>call(b,'start'),/hôte/);call(a,'start');for(let round=0;round<5;round++){const s=view(a);assert.equal(s.round,round);assert.equal(s.priceCents,undefined);assert.equal(s.source,undefined);assert.equal(s.product.priceCents,undefined);assert.ok(s.players.every(p=>!p.token));call(a,'guess',{round,cents:9000});assert.equal(view(b).myGuess,null);assert.equal(view(b).results,undefined);assert.throws(()=>call(a,'guess',{round,cents:10000}),/verrouillée/);call(b,'guess',{round,cents:11000});const r=view(a);assert.equal(r.phase,'reveal');assert.equal(r.priceCents,10000);assert.deepEqual(r.results.map(p=>p.points),[140,140]);assert.equal(r.players[0].score,(round+1)*140);view(a);assert.equal(view(a).players[0].score,(round+1)*140);call(a,'next',{round});}assert.equal(view(a).phase,'finished');call(a,'start');assert.equal(view(a).round,0);assert.equal(view(a).players[0].score,0);});
test('Chronomètre serveur, absence à zéro, réponse tardive refusée',()=>{let now=1000;const {a,b,call,view}=setup({now:()=>now,roundMs:100});call(a,'start');call(a,'guess',{round:0,cents:10000});now+=101;assert.throws(()=>call(b,'guess',{round:0,cents:10000}),/terminée/);const s=view(a);assert.equal(s.phase,'reveal');assert.equal(s.results.find(p=>p.name==='Alex').points,0);assert.equal(s.results.find(p=>p.name==='Simon').points,150);});
test('Identité, prix invalides et manche périmée sont rejetés',()=>{const {a,game,call}=setup();assert.throws(()=>game.state(a.code,'wrong'),/Session invalide/);call(a,'start');for(const cents of[-1,NaN,Infinity,1.2,'99',100000001])assert.throws(()=>call(a,'guess',{round:0,cents}),/prix/);assert.throws(()=>call(a,'guess',{round:9,cents:100}),/autre manche/);assert.throws(()=>game.join(a.code,'Late'),/commencée/);});
test('Reconnexion, transfert d’hôte, expiration et salon vide',()=>{let now=1000;const {game,a,b,view,call}=setup({now:()=>now,ttlMs:120000});const original=view(a).me;assert.equal(view(a).me,original);now+=61000;assert.equal(view(b).host,view(b).me);call(b,'leave');assert.equal(view(a).host,original);now+=120001;assert.throws(()=>view(a),/expiré/);const c=game.create('C');game.action(c.code,c.token,'leave');assert.equal(game.rooms.size,0);});
test('Capacité, minimum de joueurs et noms',()=>{const game=new Game(products);assert.throws(()=>game.create('  '));const a=game.create('A');assert.throws(()=>game.action(a.code,a.token,'start'),/deux joueurs/);assert.throws(()=>game.join(a.code,'a'),/déjà pris/);for(let i=0;i<7;i++)game.join(a.code,'N'+i);assert.throws(()=>game.join(a.code,'Nine'),/complet/);});
test('Un joueur parti ne reçoit pas le bonus des joueurs restants',()=>{const {a,b,game,call,view}=setup();const c=game.join(a.code,'C');call(a,'start');call(c,'guess',{round:0,cents:10000});call(c,'leave');call(a,'guess',{round:0,cents:9000});call(b,'guess',{round:0,cents:8000});assert.equal(view(a).results.find(x=>x.name==='Simon').bonus,50);});
test('Modes et années filtrent la banque, l’hôte configure entre deux parties',()=>{
  const catalog=[...products,...Array.from({length:5},(_,i)=>({...products[i],id:'c'+i,modes:['expert','auction'],currency:'USD'})),
    ...Array.from({length:5},(_,i)=>({...products[i],id:'h'+i,modes:['history'],year:2000})),
    {...products[0],id:'h2020',modes:['history'],year:2020}];
  const game=new Game(catalog),a=game.create('A'),b=game.join(a.code,'B');
  assert.throws(()=>game.action(b.code,b.token,'config',{mode:'history'}),/hôte/);
  assert.throws(()=>game.action(a.code,a.token,'config',{mode:'unknown'}),/inconnu/);
  game.action(a.code,a.token,'config',{mode:'history',historyYear:2000});
  game.action(a.code,a.token,'start');
  assert.equal(game.state(a.code,a.token).total,5);
  assert.equal(game.state(a.code,a.token).product.year,2000);
  assert.throws(()=>game.action(a.code,a.token,'config',{mode:'auction'}),/entre deux parties/);
});
test('Enchères : mises secrètes, budget, invendu et revente finale',()=>{
  const lots=Array.from({length:5},(_,i)=>({...products[i],id:'lot'+i,name:'Lot '+i,modes:['auction'],currency:'USD',priceCents:100000+i*10000}));
  let now=0;const game=new Game(lots,{now:()=>now,roundMs:100}),a=game.create('A'),b=game.join(a.code,'B');
  const call=(s,type,data={})=>game.action(s.code,s.token,type,data),view=s=>game.state(s.code,s.token);
  call(a,'config',{mode:'auction'});call(a,'start');
  assert.equal(view(a).startingCashCents,AUCTION_CASH_CENTS);
  for(let round=0;round<5;round++){
    const product=view(a).product;
    assert.equal(view(a).priceCents,undefined);assert.equal(view(a).auctionLots,undefined);
    call(a,'guess',{round,cents:round===0?50000:0});
    assert.equal(view(b).myGuess,null);assert.equal(view(b).results,undefined);
    if(round===0)assert.throws(()=>call(b,'guess',{round,cents:AUCTION_CASH_CENTS+1}),/supérieure/);
    call(b,'guess',{round,cents:0});
    const reveal=view(b);assert.equal(reveal.priceCents,undefined);assert.equal(reveal.source,undefined);
    assert.equal(reveal.results.find(x=>x.winner)?.name,round===0?'A':undefined);
    if(round===0)assert.equal(view(a).players.find(x=>x.id===view(a).me).cashCents,AUCTION_CASH_CENTS-50000);
    call(a,'next',{round});
  }
  const final=view(a);assert.equal(final.phase,'finished');assert.equal(final.auctionLots.length,5);
  const bought=final.auctionLots.find(x=>x.owner===final.me);
  assert.equal(bought.bid,50000);
  const winner=final.players.find(x=>x.id===final.me);
  assert.equal(winner.assetCents,bought.priceCents);
  assert.equal(winner.totalCents,AUCTION_CASH_CENTS-50000+bought.priceCents);
  assert.equal(final.auctionLots.filter(x=>x.owner===null).length,4);
  call(a,'config',{mode:'real'});assert.equal(view(a).phase,'lobby');
});
test('Enchères : égalité départagée une seule fois, liquidités réellement limitées',()=>{
  const game=new Game(products.map(p=>({...p,modes:['auction'],currency:'USD'})));
  const a=game.create('A'),b=game.join(a.code,'B');
  const call=(s,type,data={})=>game.action(s.code,s.token,type,data),view=s=>game.state(s.code,s.token);
  call(a,'config',{mode:'auction'});call(a,'start');
  call(a,'guess',{round:0,cents:AUCTION_CASH_CENTS});call(b,'guess',{round:0,cents:AUCTION_CASH_CENTS});
  const result=view(a).results;assert.equal(result.filter(x=>x.winner).length,1);
  const winner=result.find(x=>x.winner);assert.equal(view(a).players.find(x=>x.id===winner.id).cashCents,0);
  call(a,'next',{round:0});
  const session=winner.id===view(a).me?a:b;
  assert.throws(()=>call(session,'guess',{round:1,cents:1}),/supérieure/);
  call(session,'guess',{round:1,cents:0});
});
test('Une personne joue les quatre modes avec trois bots, y compris la liquidation aux enchères',()=>{
  const catalog=[...products,
    ...products.map((x,i)=>({...x,id:'collectible-'+i,modes:['expert','auction'],currency:'USD',priceCents:50000+i*50000})),
    ...products.map((x,i)=>({...x,id:'old-'+i,modes:['history'],year:2000}))];
  let now=1000;const game=new Game(catalog,{now:()=>now,roundMs:100});
  for(const mode of ['real','expert','auction','history']){
    const me=game.create('Solo');
    const call=(type,data={})=>game.action(me.code,me.token,type,data),view=()=>game.state(me.code,me.token);
    call('bots',{count:3});call('config',{mode,historyYear:mode==='history'?2000:'mix'});
    assert.equal(view().players.filter(x=>x.bot).length,3);
    assert.throws(()=>game.state(me.code,null),/Session invalide/);
    call('start');
    for(let round=0;round<5;round++){
      assert.equal(view().phase,'guess');assert.equal(view().priceCents,undefined);
      call('guess',{round,cents:mode==='auction'?5000:10000});
      assert.equal(view().results,undefined);
      now+=40;const reveal=view();assert.equal(reveal.phase,'reveal');
      assert.equal(reveal.players.filter(x=>x.answered).length,4);
      assert.equal(reveal.results.length,4);
      if(mode==='auction'){
        assert.equal(reveal.priceCents,undefined);
        assert.ok(reveal.players.every(x=>x.cashCents>=0));
      }
      call('next',{round});
    }
    const final=view();assert.equal(final.phase,'finished');
    if(mode==='auction')assert.equal(final.auctionLots.length,5);
    else assert.ok(final.players.some(x=>x.score>0));
    call('leave');assert.throws(()=>view(),/introuvable/);
  }
});
test('Bots : seul l’hôte choisit leur nombre, le salon garde sa capacité',()=>{
  const game=new Game(products),a=game.create('Alex · bot'),b=game.join(a.code,'B');
  assert.throws(()=>game.action(b.code,b.token,'bots',{count:3}),/hôte/);
  assert.throws(()=>game.action(a.code,a.token,'bots',{count:4}),/0 à 3/);
  game.action(a.code,a.token,'bots',{count:3});
  const bots=game.state(a.code,a.token).players.filter(x=>x.bot);
  assert.equal(bots.length,3);assert.equal(new Set(game.state(a.code,a.token).players.map(x=>x.name)).size,5);
  for(let i=0;i<3;i++)game.join(a.code,'Human '+i);
  assert.throws(()=>game.join(a.code,'Too many'),/complet/);
  game.action(a.code,a.token,'bots',{count:0});game.join(a.code,'Human 4');
  assert.throws(()=>game.action(a.code,a.token,'bots',{count:3}),/8 joueurs/);
  game.action(a.code,a.token,'bots',{count:2});assert.equal(game.state(a.code,a.token).players.filter(x=>x.bot).length,2);
});
test('HTTP : deux navigateurs, round trip, fichiers privés inaccessibles',async()=>{const server=createServer(new Game(products));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const req=async(path,data,token)=>{const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,data:await r.json()};};try{assert.equal((await fetch(base+'/')).status,200);for(const path of['/data/products.json','/game.js','/.git/config'])assert.equal((await fetch(base+path)).status,404);const a=(await req('/api/create',{name:'Host'})).data;const b=(await req('/api/join',{name:'Guest',code:a.code})).data;const root='/api/rooms/'+a.code;assert.equal((await req(root)).status,401);assert.equal((await req(root+'/start',{},b.token)).status,403);assert.equal((await req(root+'/start',{},a.token)).data.phase,'guess');await req(root+'/guess',{round:0,cents:10000},a.token);const hidden=(await req(root,null,b.token)).data;assert.equal(hidden.priceCents,undefined);assert.equal(hidden.myGuess,null);const reveal=(await req(root+'/guess',{round:0,cents:5000},b.token)).data;assert.equal(reveal.phase,'reveal');assert.equal(reveal.results[0].points,150);assert.equal((await req(root+'/next',{round:0},a.token)).data.round,1);assert.equal((await req(root+'/next',{round:0},a.token)).status,400);}finally{await new Promise(r=>server.close(r));}});
test('HTTP : créer un salon solo et ajouter trois bots',async()=>{
  let now=1000;const server=createServer(new Game(products,{now:()=>now,roundMs:100}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,data,token)=>{
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
    return {status:response.status,data:await response.json()};
  };
  try{
    const a=(await request('/api/create',{name:'Solo'})).data,root='/api/rooms/'+a.code;
    assert.equal((await request(root+'/bots',{count:3})).status,401);
    const lobby=(await request(root+'/bots',{count:3},a.token)).data;
    assert.equal(lobby.players.filter(p=>p.bot).length,3);
    assert.equal((await request(root+'/start',{},a.token)).data.phase,'guess');
    await request(root+'/guess',{round:0,cents:9000},a.token);
    now+=40;
    const reveal=await fetch(base+root,{headers:{Authorization:'Bearer '+a.token}}).then(r=>r.json());
    assert.equal(reveal.phase,'reveal');assert.equal(reveal.results.length,4);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
