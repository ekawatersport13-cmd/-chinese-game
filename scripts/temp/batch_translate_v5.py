"""
Robust batch translation with REAL-TIME saving.
- Saves cache after every batch to prevent data loss
- Batch of 10 words, 3s delay
- Retries failed words individually
- Resumable: skip already-translated words
"""
import urllib.request, urllib.parse, ssl, json, time, os

ctx = ssl.create_default_context()
CACHE_FILE = r'D:\chinese\scripts\temp\translations_cache.json'
HSK_FILE = r'D:\chinese\scripts\temp\hsk_word_list.json'
CHAIN_FILE = r'D:\chinese\src\data\chain_dictionary.json'

def translate_batch(words, source='zh-CN', target='id'):
    text = ','.join(words)
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    url = f'https://api.mymemory.translated.net/get{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
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
        t = data.get('responseData', {}).get('translatedText', '').strip().rstrip('.,; ')
        if t and t.upper() != word.upper():  # skip if returns same word
            return t
    return None

def save_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

# Load existing chain dictionary
with open(CHAIN_FILE, 'r', encoding='utf-8') as f:
    existing_words = json.load(f).get('words', {})

# Load HSK word list
with open(HSK_FILE, 'r', encoding='utf-8') as f:
    hsk_words = json.load(f)

# Find words needing translation
need = [w for w in hsk_words if w['word'] not in existing_words]
print(f'HSK words total: {len(hsk_words)}', flush=True)
print(f'Already in chain dict: {len([w for w in hsk_words if w["word"] in existing_words])}', flush=True)
print(f'Need translation: {len(need)}', flush=True)

# Load cache (resumable)
cache = {}
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    print(f'Resuming from cache: {len(cache)} translations', flush=True)

to_translate = [w for w in need if w['word'] not in cache]
print(f'Remaining to translate: {len(to_translate)}', flush=True)

if len(to_translate) == 0:
    print('Nothing to translate!', flush=True)
    exit(0)

BATCH_SIZE = 10
failed_words = []
t0 = time.time()

# Phase 1: Batch translate
print('\n--- Phase 1: Batch ---', flush=True)
for i in range(0, len(to_translate), BATCH_SIZE):
    batch = to_translate[i:i+BATCH_SIZE]
    words_only = [w['word'] for w in batch]

    try:
        translations = translate_batch(words_only)
        if len(translations) == len(batch):
            for j, w in enumerate(batch):
                trans = translations[j].strip().rstrip('.,; ')
                if trans and trans.upper() != w['word'].upper():
                    cache[w['word']] = {
                        'meaning': trans,
                        'pinyin': w['pinyin'],
                        'hsk': w['hsk']
                    }
                else:
                    failed_words.append(w)
        else:
            failed_words.extend(batch)
    except Exception as e:
        print(f'    Batch error at {i}: {e}', flush=True)
        failed_words.extend(batch)

    done = min(i + BATCH_SIZE, len(to_translate))
    if done % 50 == 0 or done == len(to_translate):
        save_cache(cache)
        elapsed = time.time() - t0
        ok = len([v for v in cache.values() if v.get('meaning')])
        print(f'  [{done}/{len(to_translate)}] ok={ok} fail={len(failed_words)} elapsed={elapsed:.0f}s', flush=True)

    time.sleep(3)

print(f'\nPhase 1 done: {len(cache)} cached, {len(failed_words)} to retry', flush=True)
save_cache(cache)

# Phase 2: Retry failed individually
if failed_words:
    print(f'\n--- Phase 2: Retry {len(failed_words)} failed ---', flush=True)
    retry_ok = 0
    for i, w in enumerate(failed_words):
        if w['word'] in cache and cache[w['word']].get('meaning'):
            continue
        try:
            trans = translate_single(w['word'])
            if trans:
                cache[w['word']] = {
                    'meaning': trans,
                    'pinyin': w['pinyin'],
                    'hsk': w['hsk']
                }
                retry_ok += 1
        except:
            pass

        if (i + 1) % 10 == 0:
            save_cache(cache)
            elapsed = time.time() - t0
            print(f'  [{i+1}/{len(failed_words)}] retry_ok={retry_ok} elapsed={elapsed:.0f}s', flush=True)
        time.sleep(2)

    save_cache(cache)
    print(f'Retry done: {retry_ok} recovered', flush=True)

elapsed = time.time() - t0
ok_count = len([v for v in cache.values() if v.get('meaning')])
fail_count = len(cache) - ok_count
still_failed = [w['word'] for w in need if w['word'] not in cache or not cache[w['word']].get('meaning')]

print(f'\n=== DONE in {elapsed/60:.1f} min ===', flush=True)
print(f'Total translated: {ok_count}', flush=True)
print(f'Failed: {len(still_failed)}', flush=True)
if still_failed:
    print(f'Failed words: {still_failed[:50]}', flush=True)
print(f'Cache saved to: {CACHE_FILE}', flush=True)
