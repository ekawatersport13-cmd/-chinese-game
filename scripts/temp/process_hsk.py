import json, os

os.chdir(r'D:\chinese\scripts\temp')

# Load and merge HSK 1-6 exclusive files
all_words = []
for level in range(1, 7):
    fn = f'hsk_excl_{level}.json'
    with open(fn, 'r', encoding='utf-8') as f:
        entries = json.load(f)
    for e in entries:
        e['_hsk_level'] = level
    all_words.extend(entries)
    print(f'HSK {level}: {len(entries)} entries')

print(f'Total: {len(all_words)}')

# Extract simplified words with pinyin
word_list = []
for w in all_words:
    simp = w.get('simplified', '')
    if not simp:
        continue
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

# Show some samples per level
for lv in range(1, 7):
    lv_words = [w for w in word_list if w['hsk'] == lv]
    samples = lv_words[:3]
    print(f'\nHSK {lv} samples ({len(lv_words)} total):')
    for s in samples:
        print(f'  {s["word"]} ({s["pinyin"]})')

# Save word list
with open('hsk_word_list.json', 'w', encoding='utf-8') as f:
    json.dump(word_list, f, ensure_ascii=False, indent=2)
print(f'\nSaved hsk_word_list.json ({len(word_list)} words)')
