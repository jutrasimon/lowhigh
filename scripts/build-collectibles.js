// Curated sold lots; run manually to verify the published result and image.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
const curl=promisify(execFile);
const root='https://onlineonly.christies.com/s/';
const lots=[
  ['skybreakers-between-heaven-earth/campo-del-cielo-meteorite-natural-hole-7/283136','Météorite Campo del Cielo percée naturellement','Météorites',4826,'Spécimen de fer de 971 g, avec trou naturel et socle.'],
  ['jim-irsay-collection-online/fender-musical-instrument-corp-corona-california-2023-453/288986','Fender Telecaster B-Bender 2023','Musique',1905,'Guitare électrique Fender American Professional II avec mécanisme B-Bender.'],
  ['jim-irsay-collection-online/fender-musical-instrument-corp-corona-california-2004-448/288980','Fender Stratocaster Custom Shop 2004','Musique',5715,'Édition 50e anniversaire de la Stratocaster.'],
  ['watches-online/patek-philippe-ref-4824-1-gondolo-18k-yellow-gold-rectangular-shaped-259/187464','Patek Philippe Gondolo en or 18 carats','Montres',8820,'Montre bracelet rectangulaire à quartz, référence 4824/1.'],
  ['deep-impact-lunar-martian-other-rare-meteorites/allende-complete-slice-oldest-matter-mankind-can-touch-36/177184','Tranche de météorite Allende','Météorites',5292,'Tranche complète de la chondrite carbonée Allende.'],
  ['deep-impact-lunar-martian-other-rare-meteorites/diamonds-outer-space-complete-slice-dhofar-1989-63/177211','Tranche de météorite Dhofar 1989','Météorites',2268,'Tranche complète de météorite uréilite trouvée à Oman.'],
  ['deep-impact-martian-lunar-other-rare-meteorites/canyon-diablo-meteorite-interior-exterior-revealed-end-piece-19/142792','Météorite Canyon Diablo','Météorites',3780,'Fragment de fer météoritique montrant l’intérieur et l’extérieur.'],
  ['deep-impact-martian-lunar-other-rare-meteorites/dronino-meteorite-natural-tabletop-sculpture-outer-space-5/52959','Météorite Dronino sculpturale','Météorites',9375,'Météorite ferreuse à forme de sculpture de table.'],
  ['exceptional-literature-collection-theodore-b-baum-part-two/what-makes-sammy-run-367/126670','What Makes Sammy Run? première édition signée','Livres',3250,'Roman de Budd Schulberg de 1941, dédicacé à Paul Bartel.'],
  ['arts-asia-online/utagawa-hiroshige-1797-1858-100/230766','Estampe de Hiroshige : lune à Ryogoku','Art',2016,'Gravure sur bois japonaise représentant le pont Ryogoku, vers 1831–1832.'],
  ['selections-geddy-lee-collection-important-baseball-memorabilia-online/1924-world-series-program-at-new-york-312/202107','Programme de la Série mondiale 1924','Sport',378,'Programme du match no 3 à New York, avec annotations de pointage.'],
  ['handbags-online-new-york-edit/custom-gris-tourterelle-bleu-arctic-clemence-leather-birkin-35-brushed-101/268858','Sac Hermès Birkin 35 de 2000','Mode',8890,'Cuir Clémence gris et bleu, quincaillerie palladium brossé.'],
  ['selections-geddy-lee-collection-important-baseball-memorabilia-online/waite-hoyt-single-signed-baseball-psa-dna-453/202320','Balle de baseball signée Waite Hoyt','Sport',756,'Balle signée avec attestation PSA/DNA.'],
  ['ann-gordon-getty-collection-aesthetic-decoration-temple-wings/flowers-shakespeares-garden-279/183128','Flowers from Shakespeare’s Garden et aquarelles','Livres',2016,'Première édition de 1906 accompagnée de cinq aquarelles originales de Walter Crane.'],
  ['maurice-sendak-artist-collector-connoisseur-online/samuel-palmer-1805-1881-108/257306','The Rising Moon, gravure de Samuel Palmer','Art',1386,'Eau-forte de 1857 intitulée aussi An English Pastoral.'],
];
function meta(html,key){return html.match(new RegExp(`<meta property="${key}" content="([^"]+)"`))?.[1]?.replaceAll('&amp;','&');}
async function one([path,name,category,expected,description],i){
  const source=root+path;
  const {stdout:html}=await curl('curl',['--fail','--location','--silent','--show-error','--max-time','30',source],{maxBuffer:10*1024*1024});
  const amount=Number(html.match(/"price_realised":"([0-9.]+)"/)?.[1]);
  const currency=html.match(/"price_realised_txt":"([A-Z]{3})/)?.[1];
  const image=meta(html,'og:image');
  const checkedAt=html.match(/"end_date":"(20\d\d-\d\d-\d\d)T/)?.[1];
  if(amount!==expected||currency!=='USD'||!image||!checkedAt)throw Error(`Lot non vérifié : ${source} (${amount} ${currency}, ${checkedAt})`);
  const prefix=image.match(/^(.*_\d{4}_)\d{3}\(/)?.[1];
  const images=[...new Set((html.match(/https:\/\/www\.christies\.com\/img\/LotImages\/[^"\s<>]+?\.jpg/g)||[])
    .filter(url=>prefix&&url.startsWith(prefix)))].slice(0,3);
  return {id:`christies-${i+1}`,modes:['expert','auction'],name,category,description,
    priceCents:Math.round(amount*100),currency:'USD',priceType:'sold',seller:'Christie’s',
    checkedAt,source,provider:'christies',images:images.length?images:[image],imageSources:[source],
    priceNote:'Prix réalisé publié par Christie’s; valeur de référence pour le jeu, frais et conditions de vente selon la fiche.'};
}
const result=[];
for(let i=0;i<lots.length;i+=4)result.push(...await Promise.all(lots.slice(i,i+4).map((v,j)=>one(v,i+j))));
await writeFile(new URL('../data/collectibles.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(`${result.length} lots Christie’s vérifiés.`);
