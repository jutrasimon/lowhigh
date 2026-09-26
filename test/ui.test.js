import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Game} from '../game.js';

test('Les quatre modes rendent le lobby, la manche, la révélation et la fin',async()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},setAttribute(){}});
    return elements.get(id);
  };
  const context=vm.createContext({document:{querySelector:element},sessionStorage:{getItem(){}},setTimeout(){},clearTimeout(){},navigator:{},location:{},URL,URLSearchParams,Intl,Date,FormData,AbortSignal,fetch});
  const script=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).split('async function poll(){')[0];
  vm.runInContext(script+'\nglobalThis.preview=s=>{state=s;render();return app.innerHTML}',context);
  const catalogs=await Promise.all(['grocery','collectibles','history'].map(async name=>JSON.parse(await readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8'))));
  const game=new Game(catalogs.flat());
  const draw=state=>{context.sample=state;return vm.runInContext('preview(sample)',context);};
  for(const mode of ['real','expert','auction','history']){
    const a=game.create('A'),b=game.join(a.code,'B');
    const call=(who,type,data={})=>game.action(who.code,who.token,type,data),view=()=>game.state(a.code,a.token);
    call(a,'config',{mode,historyYear:mode==='history'?2000:'mix'});
    const lobby=draw(view());
    assert.match(lobby,/mode-select/);
    assert.match(lobby,new RegExp(`mode-bubble--${mode}`));
    assert.match(lobby,mode==='history'?/En 2000, combien ça coûtait au Canada\?/:/mode-bubble.*role="status"/);
    assert.match(draw(view()),/id="bots"/);
    call(a,'start');assert.match(draw(view()),/guess-form/);
    for(let round=0;round<5;round++){
      call(a,'guess',{round,cents:100});call(b,'guess',{round,cents:0});
      assert.match(draw(view()),mode==='auction'?/MISES RÉVÉLÉES/:/PRIX DE RÉFÉRENCE/);
      call(a,'next',{round});
    }
    assert.match(draw(view()),mode==='auction'?/VENTE FINALE/:/CLASSEMENT FINAL/);
  }
});
