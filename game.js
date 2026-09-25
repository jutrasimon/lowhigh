import { randomBytes, randomInt } from 'node:crypto';
export function score(guess, price) { return Math.max(0, Math.round(100 * (1 - Math.abs(guess - price) / price))); }
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
    const room = {code, phase:'lobby', players:[], round:-1, deck:[], answers:{}, results:[], updated:this.now(), deadline:0};
    this.rooms.set(code, room); return this.add(room, name);
  }
  add(room, name) {
    name=this.name(name);
    if(room.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())) this.fail('Ce prénom est déjà pris.');
    const player={id:randomBytes(8).toString('hex'), token:randomBytes(24).toString('hex'),name,score:0,seen:this.now()};
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
    const r=this.room(code), p=r.players.find(p=>p.token===token);
    if(!p)this.fail('Session invalide. Rejoins le salon.',401);
    p.seen=this.now(); r.updated=this.now();
    const host=r.players.find(p=>p.id===r.host);
    if(!host || this.now()-host.seen>60000) r.host=p.id;
    return [r,p];
  }
  nextRound(r) {
    r.round++; r.answers={}; r.results=[];
    if(r.round>=r.deck.length){r.phase='finished'; return;}
    r.phase='guess'; r.deadline=this.now()+this.roundMs;
  }
  reveal(r) {
    if(r.phase!=='guess')return;
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
  tick(r){if(r.phase==='guess' && this.now()>=r.deadline)this.reveal(r);}
  action(code,token,type,data={}) {
    const [r,p]=this.auth(code,token);
    if(type==='guess') {
      if(r.phase!=='guess')this.fail('Cette manche est terminée.');
      if(data.round!==r.round)this.fail('Cette réponse appartient à une autre manche.');
      if(Object.hasOwn(r.answers,p.id))this.fail('Ta réponse est déjà verrouillée.');
      if(!Number.isSafeInteger(data.cents)||data.cents<0||data.cents>100000000)this.fail('Entre un prix entre 0 et 1 000 000 $.');
      r.answers[p.id]=data.cents;
      if(r.players.every(p=>Object.hasOwn(r.answers,p.id)))this.reveal(r);
    } else if(type==='leave') {
      r.players=r.players.filter(x=>x.id!==p.id); delete r.answers[p.id];
      if(!r.players.length){this.rooms.delete(r.code);return {ok:true};}
      if(r.host===p.id)r.host=r.players[0].id;
      if(r.phase==='guess' && r.players.every(p=>Object.hasOwn(r.answers,p.id)))this.reveal(r);
      return {ok:true};
    } else {
      if(r.host!==p.id)this.fail('Seul l’hôte peut faire ça.',403);
      if(type==='start') {
        if(r.phase!=='lobby' && r.phase!=='finished')this.fail('La partie est déjà en cours.');
        if(r.players.length<2)this.fail('Il faut au moins deux joueurs.');
        r.deck=[...this.products];
        for(let i=r.deck.length-1;i>0;i--){const j=randomInt(i+1);[r.deck[i],r.deck[j]]=[r.deck[j],r.deck[i]];}
        r.deck=r.deck.slice(0,5); r.round=-1;r.players.forEach(p=>p.score=0);this.nextRound(r);
      } else if(type==='next') {
        if(r.phase!=='reveal' || data.round!==r.round)this.fail('Impossible de passer à la manche suivante.'); this.nextRound(r);
      } else this.fail('Action inconnue.');
    }
    return this.view(r,p);
  }
  view(r,p) {
    this.tick(r);
    const product=r.deck[r.round];
    return {code:r.code,phase:r.phase,me:p.id,host:r.host,round:r.round,total:r.deck.length||Math.min(5,this.products.length),deadline:r.deadline,serverTime:this.now(),
      players:r.players.map(x=>({id:x.id,name:x.name,score:x.score,online:this.now()-x.seen<15000,answered:Object.hasOwn(r.answers,x.id)})),
      myGuess:r.answers[p.id]??null,
      product:product?{id:product.id,name:product.name,seller:product.seller,description:product.description,images:product.images,rating:product.rating,reviewCount:product.reviewCount,video:product.video||null,provider:product.provider||null}:null,
      ...(['reveal','finished'].includes(r.phase)&&product?{priceCents:product.priceCents,source:product.source,checkedAt:product.checkedAt,results:r.results}:{} )};
  }
  state(code,token){const [r,p]=this.auth(code,token);return this.view(r,p);}
  cleanup(){for(const [code,r]of this.rooms)if(this.now()-r.updated>this.ttlMs)this.rooms.delete(code);}
}
