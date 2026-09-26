"""Rebuild dated Canadian average-price questions from Statistics Canada table 18-10-0002-01."""
import csv
import io
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = 'https://www150.statcan.gc.ca/n1/en/tbl/csv/18100002-eng.zip'
SOURCE = 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000201'
PRODUCTS = {
    'Homogenized milk, 1 litre': ('Lait homogénéisé, 1 L', 'Lait', 'Lait'),
    'Butter, 454 grams': ('Beurre, 454 g', 'Beurre', 'Beurre'),
    'Eggs, 1 dozen': ('Œufs, une douzaine', 'Œufs', 'Œufs'),
    'Bread, 675 grams': ('Pain, 675 g', 'Pain', 'Pain'),
    'Apples, 1 kilogram': ('Pommes, 1 kg', 'Fruits', 'Fruits'),
    'Bananas, 1 kilogram': ('Bananes, 1 kg', 'Fruits', 'Fruits'),
    'Cabbage, 1 kilogram': ('Chou, 1 kg', 'Légumes', 'Légumes'),
    'Celery, 1 kilogram': ('Céleri, 1 kg', 'Légumes', 'Légumes'),
    'Ground beef, 1 kilogram': ('Bœuf haché, 1 kg', 'Bœuf', 'Bœuf'),
    'Coffee, roasted, 300 grams': ('Café torréfié, 300 g', 'Café', 'Café'),
    'Potatoes, 4.54 kilograms': ('Pommes de terre, 4,54 kg', 'Légumes', 'Légumes'),
}
YEARS = (1995, 2000, 2010, 2020)
groceries = json.loads((ROOT / 'data/grocery.json').read_text())
PHOTO_NAMES = {
    'Eggs, 1 dozen': 'Extra gros œufs', 'Bread, 675 grams': 'Pain aux graines non céréalières',
    'Apples, 1 kilogram': 'Pommes Honeycrisp', 'Celery, 1 kilogram': 'Céleri emballé',
    'Coffee, roasted, 300 grams': 'Café en grains aroma di casa',
}
photos = {}
for product_name, needle in PHOTO_NAMES.items():
    match = next(p for p in groceries if needle.lower() in p['name'].lower())
    photos[product_name] = (match['images'][0], match['providerSource'])
# Specific illustrative products not present in the compact grocery snapshot.
# Each image points back to its public épiceries.ca product record.
photos.update({
    'Homogenized milk, 1 litre': ('https://cdn.epiceries.ca/f0e0954f-2d16-422f-af63-e6f31f20c56d.5e5cd12d8bfad65785f281f560996b64.png', 'https://epiceries.ca/view?i=zLGYUMt7kSDr'),
    'Butter, 454 grams': ('https://cdn.epiceries.ca/e101e9c4-791d-4a76-b2ee-2dbe9e3153c9.1de04edce6d5a2b3987cc67439ab446f.jpeg', 'https://epiceries.ca/view?i=DtnUCVqAQcy6'),
    'Bananas, 1 kilogram': ('https://cdn.epiceries.ca/20139509001_enfr_front_1200.png', 'https://epiceries.ca/view?i=eKCFYIz7Th8l'),
    'Cabbage, 1 kilogram': ('https://cdn.epiceries.ca/692324_KG_ml_primary_na_na_042325_GPHP_VOILA_34249a3cf7dc5e28fcc5aba23bdaba8b8f7cfbb6.JPG', 'https://epiceries.ca/view?i=Ez2VWpxDiyYw'),
    'Ground beef, 1 kilogram': ('https://cdn.epiceries.ca/21615908_enfr_front_v2_1200.png', 'https://epiceries.ca/view?i=HS4NJyFUgGuC'),
    'Potatoes, 4.54 kilograms': ('https://cdn.epiceries.ca/11511577444382.jpg', 'https://epiceries.ca/view?i=g0F7VIfDste2'),
})

archive = subprocess.check_output(['curl', '--fail', '--location', '--silent', '--show-error', DATA])
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    rows = csv.DictReader(io.TextIOWrapper(zipped.open('18100002.csv'), encoding='utf-8-sig'))
    output = []
    for row in rows:
        if row['GEO'] != 'Canada' or row['REF_DATE'] not in {f'{year}-09' for year in YEARS}:
            continue
        if row['Products'] not in PRODUCTS or not row['VALUE'] or row['UOM'] != 'Dollars':
            continue
        name, category, _ = PRODUCTS[row['Products']]
        date = row['REF_DATE']
        output.append({
            'id': f"statcan-{date}-{list(PRODUCTS).index(row['Products'])}",
            'modes': ['history'], 'year': int(date[:4]), 'name': name,
            'category': category,
            'description': f"Prix moyen mensuel au Canada, septembre {date[:4]}. Format exact : {name}.",
            'priceCents': round(float(row['VALUE']) * 100), 'currency': 'CAD',
            'priceType': 'national-average', 'seller': 'Statistique Canada',
            'checkedAt': date, 'source': SOURCE, 'dataSource': DATA,
            'provider': 'statcan', 'images': [photos[row['Products']][0]],
            'imageSources': [photos[row['Products']][1]],
            'imageNote': 'Photo actuelle illustrative, sans lien avec le prix historique.',
            'priceNote': 'Moyenne mensuelle canadienne non désaisonnalisée; ce n’est pas le prix d’un magasin précis.',
        })

assert len(output) >= 40, f'Catalogue historique trop petit : {len(output)}'
output.sort(key=lambda p: (p['year'], p['name']))
(ROOT / 'data/history.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f'{len(output)} prix historiques enregistrés.')
