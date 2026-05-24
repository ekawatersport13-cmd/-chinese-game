"""
Robust translation: Chinese -> Indonesian via MyMemory API.
- Single word per request (most reliable)
- 2 second delay between requests
- Auto-retry on failure
- Resume from cache
"""
import urllib.request, urllib.parse, ssl, json, time, os

ctx = ssl.create_default_context()

def translate_single(word, source='zh-CN', target='id'):
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(word)}'
    url = f'https://api.mymemory.translated.net/get{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    data = json.loads(resp.read().decode('utf-8'))
    if data.get('responseStatus') == 200:
        text = data.get('responseData', {}).get('translatedText', '').strip().rstrip('.,; ')
        # Check if it looks like Indonesian (not English/garbage)
        if text and len(text) > 0 and not text.isascii() or any(c in text.lower() for c in 'aiueo'):
            return text
    return None

os.chdir(r'D:\chinese\scripts\temp')

# Load HSK word list
with open('hsk_word_list.json', 'r', encoding='utf-8') as f:
    hsk_words = json.load(f)

# Load existing chain dictionary
with open(r'D:\chinese\src\data\chain_dictionary.json', 'r', encoding='utf-8') as f:
    chain_data = json.load(f)
existing_words = chain_data.get('words', {})

# Find words needing translation
need_translation = []
for w in hsk_words:
    if w['word'] not in existing_words:
        need_translation.append(w)

# Load cache
cache_file = 'translations_cache.json'
cache = {}
if os.path.exists(cache_file):
    with open(cache_file, 'r', encoding='utf-8') as f:
        cache = json.load(f)

to_translate = [w for w in need_translation if w['word'] not in cache]
total = len(to_translate)
print(f'Total to translate: {total}', flush=True)

if total == 0:
    print('Nothing to translate!', flush=True)
    exit()

results = {}
failures = []
t0 = time.time()

for i, w in enumerate(to_translate):
    word = w['word']

    # Try up to 3 times
    trans = None
    for attempt in range(3):
        try:
            trans = translate_single(word)
            if trans:
                break
            time.sleep(2)
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
            continue

    if trans:
        results[word] = {
            'meaning': trans,
            'pinyin': w['pinyin'],
            'hsk': w['hsk']
        }
    else:
        failures.append(word)

    # Progress every 50 words
    done = i + 1
    if done % 50 == 0 or done == total:
        elapsed = time.time() - t0
        rate = done / elapsed if elapsed > 0 else 0
        eta = (total - done) / rate / 60 if rate > 0 else 0
        print(f'  [{done}/{total}] ok={len(results)} fail={len(failures)} rate={rate:.1f}/s ETA={eta:.0f}min', flush=True)

    time.sleep(1.5)  # Rate limiting

# Save cache
all_translations = {**cache, **results}
with open(cache_file, 'w', encoding='utf-8') as f:
    json.dump(all_translations, f, ensure_ascii=False, indent=2)

elapsed = time.time() - t0
print(f'\nDone in {elapsed/60:.1f}min! New: {len(results)}, Total: {len(all_translations)}, Failed: {len(failures)}', flush=True)

if failures:
    print(f'Failed words: {failures[:30]}', flush=True)
