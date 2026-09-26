import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const catalogs=['products','open-prices','grocery','collectibles','history'];
const target=new URL('../data/verified-photos.json',import.meta.url);
const allowed=/^https:\/\/(?:www\.ikea\.com|images\.openfoodfacts\.org|cdn\.epiceries\.ca|www\.christies\.com)\//;
const maxBytes=5*1024*1024;

export function imageMime(bytes){
  const b=Buffer.from(bytes);
  if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
  if(b.subarray(0,4).toString()==='GIF8')return 'image/gif';
  if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(b.subarray(4,8).toString()==='ftyp'&&['avif','avis'].includes(b.subarray(8,12).toString()))return 'image/avif';
  return null;
}

export async function imageWorks(url,request=fetch){
  if(typeof url!=='string'||!allowed.test(url))return false;
  try{
    const response=await request(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
    if(!response.ok||!response.body)return false;
    const reader=response.body.getReader(),{value}=await reader.read();await reader.cancel();
    return !!value&&!!imageMime(value);
  }catch{return false;}
}

export async function downloadImage(url,request=fetch){
  if(typeof url!=='string'||!allowed.test(url))throw Error('Source photo non permise.');
  const response=await request(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body||Number(response.headers.get('content-length'))>maxBytes)throw Error('Photo indisponible.');
  const parts=[];let size=0;
  for await(const part of response.body){size+=part.length;if(size>maxBytes)throw Error('Photo trop volumineuse.');parts.push(part);}
  const bytes=Buffer.concat(parts),mime=imageMime(bytes);
  if(!mime||bytes.length<1000)throw Error('Format de photo invalide.');
  return {bytes,mime};
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
