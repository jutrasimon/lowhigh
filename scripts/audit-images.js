import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const catalogs=['products','open-prices','grocery','collectibles','history'];
const target=new URL('../data/verified-photos.json',import.meta.url);

export async function imageWorks(url,request=fetch){
  if(typeof url!=='string'||!/^https:\/\/(?:www\.ikea\.com|images\.openfoodfacts\.org|cdn\.epiceries\.ca|www\.christies\.com)\//.test(url))return false;
  try{
    let response=await request(url,{method:'HEAD',signal:AbortSignal.timeout(12000)});
    if(response.status===403||response.status===405){
      response=await request(url,{headers:{Range:'bytes=0-0'},signal:AbortSignal.timeout(12000)});
      await response.body?.cancel();
    }
    return response.ok&&response.headers.get('content-type')?.startsWith('image/')===true;
  }catch{return false;}
}

export async function verifyProducts(items,{request=fetch,concurrency=8}={}){
  const urls=[...new Set(items.flatMap(x=>x.images||[]))],status=new Map();
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,urls.length)},async()=>{
    while(cursor<urls.length){const url=urls[cursor++];status.set(url,await imageWorks(url,request));}
  }));
  const products=items.map(item=>({...item,images:(item.images||[]).filter(url=>status.get(url))})).filter(item=>item.images.length);
  return {products,validUrls:urls.filter(url=>status.get(url)),checked:urls.length};
}

export async function audit(){
  const items=[];
  for(const name of catalogs){try{items.push(...JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
  const result=await verifyProducts(items);
  await writeFile(target,JSON.stringify({checkedAt:new Date().toISOString().slice(0,10),urls:result.validUrls},null,2)+'\n');
  return {products:result.products.length,total:items.length,validPhotos:result.validUrls.length,checked:result.checked};
}
if(process.argv[1]===fileURLToPath(import.meta.url))audit().then(x=>console.log(x)).catch(e=>{console.error(e);process.exitCode=1;});
