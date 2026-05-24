"""
Merge translated words with existing chain_dictionary.json to create the final expanded version.
Usage: Run after batch_translate_v4.py completes.
"""
import json, os

os.chdir(r'D:\chinese\scripts\temp')

# Load existing chain dictionary
with open(r'D:\chinese\src\data\chain_dictionary.json', 'r', encoding='utf-8') as f:
    chain_data = json.load(f)

existing_words = chain_data.get('words', {})
print(f'Existing words: {len(existing_words)}')

# Load translation cache
cache_file = 'translations_cache.json'
if not os.path.exists(cache_file):
    print('ERROR: translations_cache.json not found! Run batch_translate_v4.py first.')
    exit(1)

with open(cache_file, 'r', encoding='utf-8') as f:
    translations = json.load(f)
print(f'Translated words: {len(translations)}')

# Count overlap
overlap = set(existing_words.keys()) & set(translations.keys())
print(f'Overlap (already in dict): {len(overlap)}')

# New words to add
new_words = {k: v for k, v in translations.items() if k not in existing_words}
print(f'New words to add: {len(new_words)}')

# Show sample of new words
print(f'\nSample new words:')
samples = list(new_words.items())[:20]
for word, info in samples:
    print(f'  {word} ({info.get("pinyin", "")}) - {info.get("meaning", "")} [HSK{info.get("hsk", "?")}]')

# Build new words dict in chain_dictionary format
new_chain_words = {}
for word, info in new_words.items():
    # Normalize pinyin: remove spaces between syllables for chain game
    pinyin = info.get('pinyin', '').replace(' ', '')
    new_chain_words[word] = {
        'pinyin': pinyin,
        'meaning': info.get('meaning', ''),
        'hsk': info.get('hsk', 0)
    }

# Also normalize existing words pinyin
normalized_existing = {}
for word, info in existing_words.items():
    pinyin = info.get('pinyin', '').replace(' ', '')
    normalized_existing[word] = {
        'pinyin': pinyin,
        'meaning': info.get('meaning', ''),
        'hsk': info.get('hsk', 0)
    }

# Merge
all_words = {**normalized_existing, **new_chain_words}
print(f'\nTotal words after merge: {len(all_words)}')

# Build chains (group by first character)
chains = {}
for word in all_words:
    first_char = word[0]
    if first_char not in chains:
        chains[first_char] = []
    chains[first_char].append(word)

# Build starters (chars that appear as first character)
starters = sorted(chains.keys())

# Stats
single_chain = sum(1 for k, v in chains.items() if len(v) <= 1)
multi_chain = sum(1 for k, v in chains.items() if len(v) > 1)
hsk_dist = {}
for word, info in all_words.items():
    hsk = info.get('hsk', 0)
    hsk_dist[hsk] = hsk_dist.get(hsk, 0) + 1

print(f'\nChain stats:')
print(f'  Unique first characters: {len(starters)}')
print(f'  Single-word chains: {single_chain}')
print(f'  Multi-word chains: {multi_chain}')
print(f'  HSK distribution: {hsk_dist}')

# Verify "烧烤" is included
if '烧烤' in all_words:
    print(f'\n  烧烤: {all_words["烧烤"]}')
else:
    print('\n  WARNING: 烧烤 not found!')

# Build final dictionary
final = {
    'words': all_words,
    'chains': chains,
    'starters': starters
}

# Save
output_path = r'D:\chinese\src\data\chain_dictionary.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, indent=2)

print(f'\nSaved to {output_path}')
print(f'File size: {os.path.getsize(output_path) / 1024:.0f} KB')
