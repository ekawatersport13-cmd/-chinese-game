import urllib.request, ssl, json, os, time

os.chdir(r'D:\chinese\scripts\temp')
ctx = ssl.create_default_context()

def download(url, filename, timeout=30):
    """Download a file with retry"""
    for attempt in range(3):
        try:
            print(f'  Downloading {filename}... (attempt {attempt+1})')
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, context=ctx, timeout=timeout)
            data = resp.read()
            with open(filename, 'wb') as f:
                f.write(data)
            print(f'  OK: {len(data)} bytes')
            return data
        except Exception as e:
            print(f'  Error: {e}')
            if attempt < 2:
                time.sleep(2)
    return None

base = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/inclusive/new/'

# Download HSK levels 1-7 (new format, inclusive = cumulative)
all_words = []
for level in range(1, 8):
    fn = f'hsk_new_{level}.json'
    url = f'{base}{level}.json'
    data = download(url, fn, timeout=30)
    if data:
        entries = json.loads(data)
        print(f'  HSK {level}: {len(entries)} entries')
        all_words.extend(entries)

print(f'\nTotal entries downloaded: {len(all_words)}')

# Deduplicate by simplified character
seen = set()
unique = []
for w in all_words:
    key = w.get('simplified', '')
    if key not in seen:
        seen.add(key)
        unique.append(w)

print(f'After dedup: {len(unique)} unique entries')

# Save combined
with open('hsk_all_unique.json', 'w', encoding='utf-8') as f:
    json.dump(unique, f, ensure_ascii=False, indent=2)
print(f'Saved to hsk_all_unique.json')

# Print some stats
hsk_counts = {}
for w in unique:
    levels = w.get('level', [])
    for lv in levels:
        hsk_counts[lv] = hsk_counts.get(lv, 0) + 1
print(f'\nHSK distribution: {hsk_counts}')
