import {readFile, writeFile, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// A modest, manual snapshot: four distinct products from each of 20 categories.
const categories = [1,2,7,9,10,11,12,16,17,22,25,28,29,32,34,36,37,44,52,63];
const names = new Map([
  [1,'Légumes'],[2,'Fruits'],[7,'Lait'],[9,'Œufs'],[10,'Beurre'],[11,'Fromage'],
  [12,'Yogourt'],[16,'Poulet'],[17,'Bœuf'],[22,'Poisson'],[25,'Pâtes'],
  [28,'Céréales'],[29,'Conserves'],[32,'Tartinades'],[34,'Condiments'],
  [36,'Jus'],[37,'Café'],[44,'Pain'],[52,'Desserts glacés'],[63,'Croustilles']
]);
const stores = {maxi:'Maxi',iga:'IGA',superc:'Super C',metro:'Metro',provigo:'Provigo',walmart:'Walmart'};
const target = new URL('../data/grocery.json',import.meta.url);

export function selectGrocery(groups, today=new Date()) {
  const cutoff=new Date(today.getTime()-45*86400000).toISOString().slice(0,10);
  const seen=new Set(), products=[];
  for(const [category, candidates] of groups) {
    const byStore=new Map(); let picked=0;
    for(const item of candidates) {
      const name=item.name?.trim(), size=item.size?.trim()||'', date=item.updated?.slice(0,10);
      const cents=Math.round(Number(item.price)*100), seller=stores[item.store];
      if(!name||name.length<5||name.length>95||/24h d.?avis|vari[eé]tal|livraison|lot de \d{2,}/i.test(name)||
        !seller||!/^https:\/\/cdn\.epiceries\.ca\//.test(item.image||'')||/coming-soon/i.test(item.image)||
        !/^https:\/\//.test(item.link||'')||!/^https:\/\/epiceries\.ca\//.test(item.url||'')||
        !Number.isSafeInteger(cents)||cents<50||cents>15000||!date||date<cutoff||
        date>today.toISOString().slice(0,10)||seen.has(item.id)||(byStore.get(seller)||0)>=2)continue;
      seen.add(item.id);byStore.set(seller,(byStore.get(seller)||0)+1);picked++;
      const unit=/_KG(?:\?|$)/i.test(item.link)?'Prix pour 1 kg':/_LB(?:\?|$)/i.test(item.link)?'Prix pour 1 lb':null;
      products.push({id:`epi-${item.id}`,modes:['real'],category:names.get(category),name,
        description:[item.brand,size,unit].filter(Boolean).join(' · ')||names.get(category),seller,
        priceCents:cents,currency:'CAD',priceType:'listed',images:[item.image],imageSources:[item.url],
        source:item.link,providerSource:item.url,provider:'epiceries-ca',checkedAt:date,
        rating:null,reviewCount:0});
      if(picked===4)break;
    }
  }
  return products;
}

export async function fetchGrocery({request=fetch,today=new Date()}={}) {
  const groups=[];
  for(const category of categories) {
    const url=`https://www.epiceries.ca/api?endpoint=search&category=${category}&limit=40&sort=updated_desc`;
    const res=await request(url,{headers:{Accept:'application/json','User-Agent':'LowHigh/0.1 (https://github.com/jutrasimon/lowhigh)'},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error(`épiceries.ca : HTTP ${res.status}, catégorie ${category}`);
    const body=await res.json();
    if(!body.ok||!Array.isArray(body.data?.results))throw Error('Réponse épiceries.ca invalide.');
    groups.push([category,body.data.results]);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const products=selectGrocery(groups,today);
  if(products.length<40)throw Error(`Seulement ${products.length} produits admissibles; instantané conservé.`);
  return products;
}

export async function updateGrocery(options={}) {
  const products=await fetchGrocery(options),path=fileURLToPath(options.destination||target),temp=path+'.tmp';
  const content=JSON.stringify(products,null,2)+'\n';
  try{if(await readFile(path,'utf8')===content)return {count:products.length,changed:false};}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(temp,content);await rename(temp,path);
  return {count:products.length,changed:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url))updateGrocery().then(x=>console.log(`${x.count} produits épiceries.ca ${x.changed?'enregistrés':'inchangés'}.`)).catch(e=>{console.error(e.message);process.exitCode=1;});
