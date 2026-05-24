import json

with open(r'D:\chinese\src\data\chain_dictionary.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

words = data.get('words', {})
chains = data.get('chains', {})
starters = data.get('starters', [])

print(f'Current chain_dictionary stats:')
print(f'  Total words: {len(words)}')
print(f'  Chain starters: {len(starters)}')
print(f'  Unique first chars in chains: {len(chains)}')

# Count words per HSK level
hsk_counts = {}
for word, info in words.items():
    hsk = info.get('hsk', 0)
    hsk_counts[hsk] = hsk_counts.get(hsk, 0) + 1
print(f'  HSK distribution: {hsk_counts}')

# Find words with only 1 chain entry
single_chain = {k: v for k, v in chains.items() if len(v) <= 1}
print(f'  First-chars with <=1 word: {len(single_chain)}')

# Sample current words
print(f'\nSample words:')
samples = list(words.items())[:10]
for w, info in samples:
    print(f'  {w} ({info.get("pinyin", "")}) - {info.get("meaning", "")} [HSK{info.get("hsk", "?")}]')
