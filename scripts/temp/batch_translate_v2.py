"""
Optimized batch translation: Chinese -> Indonesian via MyMemory API.
Batch size 20, 1.5s per batch, ~4 min for 3717 words.
"""
import urllib.request, urllib.parse, ssl, json, time, os, sys

ctx = ssl.create_default_context()

def translate_batch(words, source='zh-CN', target='id'):
    text = ','.join(words)
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    url = f'https://api.mymemory.translated.net/get{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=30)
    data = json.loads(resp.read().decode('utf-8'))
    if data.get('responseStatus') == 200:
        return data.get('responseData', {}).get('translatedText', '').split(',')
    return []

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
print(f'Total to translate: {len(to_translate)}', flush=True)

BATCH_SIZE = 20
results = {}
failures = []

for i in range(0, len(to_translate), BATCH_SIZE):
    batch = to_translate[i:i+BATCH_SIZE]
    words_only = [w['word'] for w in batch]

    try:
        translations = translate_batch(words_only)

        if len(translations) == len(batch):
            for j, w in enumerate(batch):
                trans = translations[j].strip().rstrip('.,; ')
                # Skip if translation is English or garbage
                if trans and not trans.isdigit() and len(trans) > 0:
                    results[w['word']] = {
                        'meaning': trans,
                        'pinyin': w['pinyin'],
                        'hsk': w['hsk']
                    }
                else:
                    failures.append(w['word'])
        else:
            # Mismatch - mark all as failure
            for w in batch:
                failures.append(w['word'])

        done = min(i + BATCH_SIZE, len(to_translate))
        print(f'  [{done}/{len(to_translate)}] translated {len(results)}, failed {len(failures)}', flush=True)

    except Exception as e:
        for w in batch:
            failures.append(w['word'])
        print(f'  [{i}] ERROR: {e}', flush=True)

    time.sleep(1.5)

# Merge with cache and save
all_translations = {**cache, **results}
with open(cache_file, 'w', encoding='utf-8') as f:
    json.dump(all_translations, f, ensure_ascii=False, indent=2)

print(f'\nDone! New: {len(results)}, Total: {len(all_translations)}, Failed: {len(failures)}', flush=True)

if failures:
    print(f'Failed words (first 20): {failures[:20]}', flush=True)
