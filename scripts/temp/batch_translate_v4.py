"""
Hybrid translation: batch mode with smart retry.
- Batch of 10 words (reliable size based on testing)
- 3 second delay between batches
- Failed words retried individually
"""
import urllib.request, urllib.parse, ssl, json, time, os

ctx = ssl.create_default_context()

def translate_batch(words, source='zh-CN', target='id'):
    text = ','.join(words)
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    url = f'https://api.mymemory.translated.net/get{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=20)
    data = json.loads(resp.read().decode('utf-8'))
    if data.get('responseStatus') == 200:
        return data.get('responseData', {}).get('translatedText', '').split(',')
    return []

def translate_single(word, source='zh-CN', target='id'):
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(word)}'
    url = f'https://api.mymemory.translated.net/get{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    data = json.loads(resp.read().decode('utf-8'))
    if data.get('responseStatus') == 200:
        return data.get('responseData', {}).get('translatedText', '').strip().rstrip('.,; ')
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
    print(f'Cached: {len(cache)}', flush=True)

to_translate = [w for w in need_translation if w['word'] not in cache]
total = len(to_translate)
print(f'To translate: {total}', flush=True)

BATCH_SIZE = 10
results = {}
failed_words = []  # Will retry these individually later
t0 = time.time()

# Phase 1: Batch translate
print('\n--- Phase 1: Batch translation ---', flush=True)
for i in range(0, total, BATCH_SIZE):
    batch = to_translate[i:i+BATCH_SIZE]
    words_only = [w['word'] for w in batch]

    try:
        translations = translate_batch(words_only)
        if len(translations) == len(batch):
            for j, w in enumerate(batch):
                trans = translations[j].strip().rstrip('.,; ')
                if trans and len(trans) > 0:
                    results[w['word']] = {
                        'meaning': trans,
                        'pinyin': w['pinyin'],
                        'hsk': w['hsk']
                    }
                else:
                    failed_words.append(w)
        else:
            # Batch mismatch - add to individual retry queue
            failed_words.extend(batch)

    except Exception as e:
        failed_words.extend(batch)

    done = min(i + BATCH_SIZE, total)
    if done % 100 == 0 or done == total:
        elapsed = time.time() - t0
        print(f'  [{done}/{total}] batch_ok={len(results)} batch_fail={len(failed_words)}', flush=True)

    time.sleep(3)

print(f'\nBatch phase done: {len(results)} translated, {len(failed_words)} to retry', flush=True)

# Phase 2: Retry failed words individually
print('\n--- Phase 2: Individual retry ---', flush=True)
retry_ok = 0
for i, w in enumerate(failed_words):
    if w['word'] in results:
        continue
    try:
        trans = translate_single(w['word'])
        if trans and len(trans) > 0:
            results[w['word']] = {
                'meaning': trans,
                'pinyin': w['pinyin'],
                'hsk': w['hsk']
            }
            retry_ok += 1
    except:
        pass

    if (i + 1) % 20 == 0 or (i + 1) == len(failed_words):
        print(f'  [{i+1}/{len(failed_words)}] retry_ok={retry_ok}', flush=True)

    time.sleep(2)

# Save
all_translations = {**cache, **results}
with open(cache_file, 'w', encoding='utf-8') as f:
    json.dump(all_translations, f, ensure_ascii=False, indent=2)

elapsed = time.time() - t0
still_failed = [w['word'] for w in failed_words if w['word'] not in results]
print(f'\nDone in {elapsed/60:.1f}min!', flush=True)
print(f'  New translations: {len(results)}', flush=True)
print(f'  Total (with cache): {len(all_translations)}', flush=True)
print(f'  Still failed: {len(still_failed)}', flush=True)
if still_failed:
    print(f'  Failed: {still_failed[:30]}', flush=True)
