import { randomBytes, randomInt } from 'node:crypto';
export function score(guess, price) { return Math.max(0, Math.round(100 * (1 - Math.abs(guess - price) / price))); }
export const AUCTION_CASH_CENTS=2500000;
const modes=['real','expert','auction','history'];
const botNames=['Alex · bot','Jo · bot','Max · bot'];
export class Game {
  constructor(products, {now = Date.now, roundMs = 45000, ttlMs = 2 * 3600000} = {}) {
    this.products = products; this.rooms = new Map(); this.now = now; this.roundMs = roundMs; this.ttlMs = ttlMs;
  }
  fail(message, status = 400) { throw Object.assign(new Error(message), {status}); }
  name(name) { if (typeof name !== 'string' || !name.trim() || name.trim().length > 20) this.fail('Choisis un prénom de 1 à 20 caractères.'); return name.trim(); }
  create(name) {
    this.cleanup(); if(this.rooms.size >= 200) this.fail('Trop de salons. Réessaie plus tard.', 503);
    name = this.name(name);
    let code; do { code = Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while(this.rooms.has(code));
    const room = {code, phase:'lobby', mode:'real', historyYear:'mix', players:[], round:-1, deck:[], answers:{}, results:[], holdings:[], updated:this.now(), deadline:0};
    this.rooms.set(code, room); return this.add(room, name);
  }
  add(room, name) {
    name=this.name(name);
    if(room.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())) this.fail('Ce prénom est déjà pris.');
    const player={id:randomBytes(8).toString('hex'), token:randomBytes(24).toString('hex'),name,score:0,cashCents:AUCTION_CASH_CENTS,seen:this.now()};
    room.players.push(player); room.host ||= player.id; room.updated=this.now();
    return {code:room.code,token:player.token};
  }
  room(code) {
    const r=this.rooms.get(String(code).toUpperCase());
    if(!r || this.now()-r.updated>this.ttlMs) { if(r)this.rooms.delete(r.code); this.fail('Salon introuvable ou expiré.',404); }
    this.tick(r); return r;
  }
  join(code,name) {
    const r=this.room(code);
    if(r.phase!=='lobby')this.fail('La partie est déjà commencée.');
    if(r.players.length>=8)this.fail('Le salon est complet.');
    return this.add(r,name);
  }
  auth(code,token) {
    const r=this.room(code), p=typeof token==='string'&&token?r.players.find(p=>!p.bot&&p.token===token):null;
    if(!p)this.fail('Session invalide. Rejoins le salon.',401);
    p.seen=this.now(); r.updated=this.now();
    const host=r.players.find(p=>p.id===r.host);
    if(!host || this.now()-host.seen>60000) r.host=p.id;
    return [r,p];
  }
  nextRound(r) {
    r.round++; r.answers={}; r.results=[];r.botAt={};
    if(r.round>=r.deck.length){r.phase='finished'; return;}
    r.phase='guess'; r.deadline=this.now()+this.roundMs;
    for(const player of r.players.filter(p=>p.bot))r.botAt[player.id]=this.now()+Math.max(1,Math.floor(this.roundMs*(.12+randomInt(20)/100)));
  }
  botAnswer(r,player) {
    const price=r.deck[r.round].priceCents,style=player.botStyle;
    if(r.mode==='auction') {
      const ranges=[[.65,1.05],[.85,1.3],[.45,1.4]];
      const [low,high]=ranges[style];
      return Math.min(player.cashCents,Math.max(0,Math.round(price*(low+Math.random()*(high-low))/500)*500));
    }
    const ranges=[[.8,1.12],[.55,1.45],[.7,1.3]];
    const [low,high]=ranges[style];
    return Math.max(0,Math.round(price*(low+Math.random()*(high-low))/25)*25);
  }
  reveal(r) {
    if(r.phase!=='guess')return;
    if(r.mode==='auction') {
      const bids=r.players.map(p=>({id:p.id,name:p.name,bid:r.answers[p.id]??null}));
      const highest=Math.max(0,...bids.map(x=>x.bid??0));
      const tied=bids.filter(x=>x.bid===highest && highest>0);
      const winner=tied.length?tied[randomInt(tied.length)]:null;
      if(winner){r.players.find(p=>p.id===winner.id).cashCents-=highest;r.holdings.push({round:r.round,owner:winner.id,bid:highest});}
      r.results=bids.map(x=>({...x,winner:x.id===winner?.id})).sort((a,b)=>(b.bid??-1)-(a.bid??-1));
      r.phase='reveal';return;
    }
    const price=r.deck[r.round].priceCents;
    const diffs=Object.values(r.answers).map(g=>Math.abs(g-price));
    const best=diffs.length ? Math.min(...diffs):Infinity;
    r.results=r.players.map(p=>{
      const guess=r.answers[p.id]; const answered=guess!==undefined;
      const closest=answered && Math.abs(guess-price)===best;
      const base=answered?score(guess,price):0, bonus=closest?50:0;
      p.score+=base+bonus;
      return {id:p.id,name:p.name,guess:answered?guess:null,base,bonus,points:base+bonus,closest};
    }).sort((a,b)=>b.points-a.points);
    r.phase='reveal';
  }
  tick(r){
    if(r.phase!=='guess')return;
    const now=this.now();
    for(const bot of r.players.filter(p=>p.bot))if(!Object.hasOwn(r.answers,bot.id)&&now>=r.botAt[bot.id])r.answers[bot.id]=this.botAnswer(r,bot);
    if(now>=r.deadline||r.players.every(p=>Object.hasOwn(r.answers,p.id)))this.reveal(r);
  }
  action(code,token,type,data={}) {
    const [r,p]=this.auth(code,token);
    if(type==='guess') {
      if(r.phase!=='guess')this.fail('Cette manche est terminée.');
      if(data.round!==r.round)this.fail('Cette réponse appartient à une autre manche.');
      if(Object.hasOwn(r.answers,p.id))this.fail('Ta réponse est déjà verrouillée.');
      const max=r.mode==='auction'?p.cashCents:100000000;
      if(!Number.isSafeInteger(data.cents)||data.cents<0||data.cents>max)this.fail(r.mode==='auction'?'Mise invalide ou supérieure à ton argent disponible.':'Entre un prix entre 0 et 1 000 000 $.');
      r.answers[p.id]=data.cents;
      if(r.players.every(p=>Object.hasOwn(r.answers,p.id)))this.reveal(r);
    } else if(type==='leave') {
      r.players=r.players.filter(x=>x.id!==p.id); delete r.answers[p.id];
      if(!r.players.some(x=>!x.bot)){this.rooms.delete(r.code);return {ok:true};}
      if(r.host===p.id)r.host=r.players.find(x=>!x.bot).id;
      if(r.phase==='guess' && r.players.every(p=>Object.hasOwn(r.answers,p.id)))this.reveal(r);
      return {ok:true};
    } else {
      if(r.host!==p.id)this.fail('Seul l’hôte peut faire ça.',403);
      if(type==='config') {
        if(r.phase!=='lobby'&&r.phase!=='finished')this.fail('Change le mode entre deux parties.');
        if(!modes.includes(data.mode))this.fail('Mode de jeu inconnu.');
        const years=[...new Set(this.products.filter(x=>x.modes?.includes('history')).map(x=>x.year))].sort();
        if(data.historyYear!==undefined && data.historyYear!=='mix' && !years.includes(data.historyYear))this.fail('Année indisponible.');
        r.mode=data.mode;r.historyYear=data.historyYear??r.historyYear;
        if(r.phase==='finished'){r.phase='lobby';r.round=-1;r.deck=[];r.results=[];r.answers={};r.holdings=[];r.players.forEach(x=>{x.score=0;x.cashCents=AUCTION_CASH_CENTS;});}
      } else if(type==='bots') {
        if(r.phase!=='lobby')this.fail('Ajoute des bots avant la partie.');
        if(!Number.isInteger(data.count)||data.count<0||data.count>3)this.fail('Choisis de 0 à 3 bots.');
        const humans=r.players.filter(x=>!x.bot);
        if(humans.length+data.count>8)this.fail('Le salon est limité à 8 joueurs.');
        r.players=humans;
        for(let i=0;i<data.count;i++){
          let name=botNames[i],suffix=1;
          while(r.players.some(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase()))name=`Bot ${i+1}-${suffix++}`;
          r.players.push({id:randomBytes(8).toString('hex'),token:null,name,bot:true,botStyle:i,score:0,cashCents:AUCTION_CASH_CENTS,seen:this.now()});
        }
      } else if(type==='start') {
        if(r.phase!=='lobby' && r.phase!=='finished')this.fail('La partie est déjà en cours.');
        if(r.players.length<2)this.fail('Il faut au moins deux joueurs.');
        r.deck=this.products.filter(x=>(x.modes||['real']).includes(r.mode)&&(r.mode!=='history'||r.historyYear==='mix'||x.year===r.historyYear));
        if(!r.deck.length)this.fail('Aucun produit disponible pour ce mode et cette année.');
        for(let i=r.deck.length-1;i>0;i--){const j=randomInt(i+1);[r.deck[i],r.deck[j]]=[r.deck[j],r.deck[i]];}
        r.deck=r.deck.slice(0,5); r.round=-1;r.holdings=[];
        r.players.forEach(p=>{p.score=0;p.cashCents=AUCTION_CASH_CENTS;});this.nextRound(r);
      } else if(type==='next') {
        if(r.phase!=='reveal' || data.round!==r.round)this.fail('Impossible de passer à la manche suivante.'); this.nextRound(r);
      } else this.fail('Action inconnue.');
    }
    return this.view(r,p);
  }
  view(r,p) {
    this.tick(r);
    const product=r.deck[r.round];
    const auction=r.mode==='auction',finished=r.phase==='finished';
    const years=[...new Set(this.products.filter(x=>x.modes?.includes('history')).map(x=>x.year))].sort();
    return {code:r.code,phase:r.phase,mode:r.mode,historyYear:r.historyYear,historyYears:years,currency:auction?'USD':product?.currency||'CAD',startingCashCents:auction?AUCTION_CASH_CENTS:undefined,me:p.id,host:r.host,round:r.round,total:r.deck.length||5,deadline:r.deadline,serverTime:this.now(),
      players:r.players.map(x=>({id:x.id,name:x.name,bot:!!x.bot,score:x.score,cashCents:auction?x.cashCents:undefined,assetCents:auction&&finished?r.holdings.filter(h=>h.owner===x.id).reduce((sum,h)=>sum+r.deck[h.round].priceCents,0):undefined,totalCents:auction&&finished?x.cashCents+r.holdings.filter(h=>h.owner===x.id).reduce((sum,h)=>sum+r.deck[h.round].priceCents,0):undefined,online:x.bot||this.now()-x.seen<15000,answered:Object.hasOwn(r.answers,x.id)})),
      myGuess:r.answers[p.id]??null,
      product:product?{id:product.id,name:product.name,seller:product.seller,description:product.description,images:product.images||[],imageNote:product.imageNote,category:product.category,year:product.year,rating:product.rating,reviewCount:product.reviewCount,video:product.video||null,provider:product.provider||null}:null,
      ...(r.phase==='reveal'&&product?(auction?{results:r.results}:{priceCents:product.priceCents,source:product.source,imageSource:product.imageSources?.[0],checkedAt:product.checkedAt,priceNote:product.priceNote,results:r.results}):{}),
      ...(finished&&auction?{auctionLots:r.deck.map((item,i)=>({round:i,name:item.name,priceCents:item.priceCents,source:item.source,imageSource:item.imageSources?.[0],checkedAt:item.checkedAt,bid:r.holdings.find(h=>h.round===i)?.bid??null,owner:r.holdings.find(h=>h.round===i)?.owner??null}))}:{}),
      ...(finished&&!auction?{results:r.results,priceCents:product?.priceCents,source:product?.source,checkedAt:product?.checkedAt}:{}),
    };
  }
  state(code,token){const [r,p]=this.auth(code,token);return this.view(r,p);}
  cleanup(){for(const [code,r]of this.rooms)if(this.now()-r.updated>this.ttlMs)this.rooms.delete(code);}
}
