import urllib.request, ssl, json, os, time

os.chdir(r'D:\chinese\scripts\temp')
ctx = ssl.create_default_context()

def download(url, filename, timeout=60):
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
                time.sleep(3)
    return None

# Use exclusive (incremental) files - much smaller
base = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/'

all_words = []
for level in range(1, 8):
    fn = f'hsk_excl_{level}.json'
    url = f'{base}{level}.json'
    data = download(url, fn, timeout=60)
    if data:
        entries = json.loads(data)
        print(f'  HSK {level}: {len(entries)} entries')
        for e in entries:
            e['_hsk_level'] = level  # tag with HSK level
        all_words.extend(entries)

print(f'\nTotal: {len(all_words)} entries')

# Save raw
with open('hsk_exclusive_all.json', 'w', encoding='utf-8') as f:
    json.dump(all_words, f, ensure_ascii=False, indent=2)

# Extract simplified words with pinyin
word_list = []
for w in all_words:
    simp = w.get('simplified', '')
    if not simp:
        continue
    # Get pinyin from first form
    pinyin = ''
    forms = w.get('forms', [])
    if forms:
        trans = forms[0].get('transcriptions', {})
        pinyin = trans.get('pinyin', '')
    word_list.append({
        'word': simp,
        'pinyin': pinyin,
        'hsk': w.get('_hsk_level', 0)
    })

print(f'Words with pinyin: {len(word_list)}')

# Save word list
with open('hsk_word_list.json', 'w', encoding='utf-8') as f:
    json.dump(word_list, f, ensure_ascii=False, indent=2)

# Show sample
for w in word_list[:5]:
    print(f'  {w["word"]} ({w["pinyin"]}) HSK{w["hsk"]}')
print('  ...')
