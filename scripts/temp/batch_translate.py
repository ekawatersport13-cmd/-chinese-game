"""
Batch translate Chinese words to Indonesian using MyMemory API.
Uses batch mode (comma-separated) for efficiency.
Rate limit: ~5000 words/day free.
"""
import urllib.request, urllib.parse, ssl, json, time, os

ctx = ssl.create_default_context()

def translate_batch(words, source='zh-CN', target='id'):
    """Translate a batch of words (comma-separated) via MyMemory"""
    text = ','.join(words)
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    url = f'https://api.mymemory.translated.net/get{params}'

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=30)
    data = json.loads(resp.read().decode('utf-8'))

    if data.get('responseStatus') == 200:
        translated = data.get('responseData', {}).get('translatedText', '')
        return translated.split(',')
    return []

def translate_single(word, source='zh-CN', target='id'):
    """Translate a single word for better quality"""
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(word)}'
    url = f'https://api.mymemory.translated.net/get{params}'

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    data = json.loads(resp.read().decode('utf-8'))

    if data.get('responseStatus') == 200:
        return data.get('responseData', {}).get('translatedText', '')
    return None

# Load HSK word list
os.chdir(r'D:\chinese\scripts\temp')
with open('hsk_word_list.json', 'r', encoding='utf-8') as f:
    hsk_words = json.load(f)

# Load existing chain dictionary
with open(r'D:\chinese\src\data\chain_dictionary.json', 'r', encoding='utf-8') as f:
    chain_data = json.load(f)
existing_words = chain_data.get('words', {})

# Find words that need Indonesian translation
need_translation = []
for w in hsk_words:
    word = w['word']
    if word not in existing_words:
        need_translation.append(w)

print(f'HSK words: {len(hsk_words)}')
print(f'Already in chain dict: {len(existing_words)}')
print(f'Need translation: {len(need_translation)}')

# Load existing translations cache (if any)
cache_file = 'translations_cache.json'
cache = {}
if os.path.exists(cache_file):
    with open(cache_file, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    print(f'Cached translations: {len(cache)}')

# Filter out already cached
to_translate = [w for w in need_translation if w['word'] not in cache]
print(f'Remaining to translate: {len(to_translate)}')

# Batch translate (max 15 words per batch for reliability)
BATCH_SIZE = 15
results = {}
total = len(to_translate)
batch_num = 0

for i in range(0, min(total, 5000), BATCH_SIZE):  # Cap at 5000 words/day limit
    batch = to_translate[i:i+BATCH_SIZE]
    words_only = [w['word'] for w in batch]
    batch_num += 1

    try:
        translations = translate_batch(words_only)

        # If batch size matches, use batch results; otherwise retry individually
        if len(translations) == len(batch):
            for j, w in enumerate(batch):
                trans = translations[j].strip()
                # Clean up common issues
                trans = trans.rstrip('.')
                results[w['word']] = {
                    'meaning': trans,
                    'pinyin': w['pinyin'],
                    'hsk': w['hsk']
                }
        else:
            # Batch failed, retry individually
            for w in batch:
                try:
                    trans = translate_single(w['word'])
                    if trans:
                        trans = trans.strip().rstrip('.')
                        results[w['word']] = {
                            'meaning': trans,
                            'pinyin': w['pinyin'],
                            'hsk': w['hsk']
                        }
                    time.sleep(0.3)
                except:
                    pass

        # Progress
        done = min(i + BATCH_SIZE, total)
        if done % 100 == 0 or done == total:
            print(f'  Progress: {done}/{total} ({done*100//total}%) - translated {len(results)} words')

        time.sleep(1)  # Rate limiting: 1 second between batches

    except Exception as e:
        print(f'  Batch {batch_num} error at word {i}: {e}')
        time.sleep(3)

# Merge with cache
all_translations = {**cache, **results}
print(f'\nTotal new translations: {len(results)}')
print(f'Total translations (with cache): {len(all_translations)}')

# Save translations cache
with open(cache_file, 'w', encoding='utf-8') as f:
    json.dump(all_translations, f, ensure_ascii=False, indent=2)
print(f'Saved translations_cache.json')

# Show sample results
print(f'\nSample translations:')
samples = list(results.items())[:20]
for word, info in samples:
    print(f'  {word} ({info["pinyin"]}) - {info["meaning"]} [HSK{info["hsk"]}]')
