import {readFile, writeFile, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const endpoint='https://prices.openfoodfacts.org/api/v1/prices?currency=CAD&type=PRODUCT&order_by=-date&size=100';
const output=new URL('../data/open-prices.json',import.meta.url);

export function selectProducts(items, today=new Date()) {
  const cutoff=new Date(today.getTime()-180*86400000).toISOString().slice(0,10);
  const seen=new Set(), stores=new Map(), products=[];
  for(const item of items) {
    const product=item.product, location=item.location;
    const name=product?.product_name?.trim(), seller=(location?.osm_name||location?.osm_brand||'').trim();
    const cents=Math.round(Number(item.price)*100);
    if(item.type!=='PRODUCT'||item.currency!=='CAD'||location?.osm_address_country_code!=='CA'||
      !name||!seller||!/^https:\/\/images\.openfoodfacts\.org\//.test(product?.image_url||'')||
      !Number.isSafeInteger(cents)||cents<200||cents>100000000||item.price_per||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')||item.date<cutoff||item.date>today.toISOString().slice(0,10)||
      item.duplicate_of||!/^\d+$/.test(String(item.id))||!product?.code||seen.has(product.code)||
      (stores.get(seller)||0)>=5)continue;
    seen.add(product.code);stores.set(seller,(stores.get(seller)||0)+1);
    const details=[product.brands?.trim(),product.quantity?.trim()].filter(Boolean);
    products.push({id:`op-${item.id}`,provider:'open-prices',name,description:details.join(' · ')||'Produit vendu au Canada',
      seller,priceCents:cents,currency:'CAD',images:[product.image_url],rating:null,reviewCount:0,
      source:`https://prices.openfoodfacts.org/prices/${item.id}`,checkedAt:item.date});
  }
  return products;
}

export async function fetchRecentProducts({request=fetch,today=new Date()}={}) {
  const response=await request(endpoint,{headers:{Accept:'application/json','User-Agent':'LowHigh/0.1 (https://github.com/jutrasimon/lowhigh)'},signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error(`Open Prices : HTTP ${response.status}`);
  const payload=await response.json();
  if(!Array.isArray(payload.items))throw Error('Réponse Open Prices invalide.');
  const products=selectProducts(payload.items,today);
  if(products.length<5)throw Error(`Seulement ${products.length} produits admissibles; catalogue précédent conservé.`);
  return products;
}

export async function updateProducts({request=fetch,destination=output,today=new Date()}={}) {
  const products=await fetchRecentProducts({request,today});
  const path=fileURLToPath(destination), temp=path+'.tmp';
  const content=JSON.stringify(products,null,2)+'\n';
  try {if(await readFile(path,'utf8')===content)return {count:products.length,changed:false};}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(temp,content);await rename(temp,path);
  return {count:products.length,changed:true};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  updateProducts().then(({count,changed})=>console.log(`${count} produits Open Prices ${changed?'actualisés':'inchangés'}.`)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
