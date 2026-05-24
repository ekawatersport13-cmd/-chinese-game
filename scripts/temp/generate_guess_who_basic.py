"""
生成"猜猜我是谁"初级模式卡牌数据
单字 + 词语混合，输出到 src/data/guess_who_basic.json
"""
import json

# ---- 加载数据 ----
chars = json.load(open('D:/chinese/src/data/characters.json', 'r', encoding='utf-8'))['characters']
chain = json.load(open('D:/chinese/src/data/chain_dictionary.json', 'r', encoding='utf-8'))['words']


def get_tones(pinyin: str) -> list[str]:
    """提取拼音字符串里每个音节的声调（返回列表，多字词有多个声调）"""
    tone_map = {
        'ā':'1','á':'2','ǎ':'3','à':'4',
        'ē':'1','é':'2','ě':'3','è':'4',
        'ī':'1','í':'2','ǐ':'3','ì':'4',
        'ō':'1','ó':'2','ǒ':'3','ò':'4',
        'ū':'1','ú':'2','ǔ':'3','ù':'4',
        'ǖ':'1','ǘ':'2','ǚ':'3','ǜ':'4',
    }
    tones = []
    current_tone = '5'
    for ch in pinyin:
        if ch in tone_map:
            current_tone = tone_map[ch]
        elif ch == ' ':
            tones.append(current_tone)
            current_tone = '5'
    tones.append(current_tone)
    return tones


def first_tone(pinyin: str) -> str:
    """返回第一个音节的声调"""
    return get_tones(pinyin)[0]


cards = []

# ---- 单字卡（来自 characters.json）----
for word, info in chars.items():
    pinyin = info.get('pinyin', '')
    components = info.get('components', [])
    # 跳过没有偏旁的独体字（components 为空或 components 里只有自身）
    # 但初级模式里独体字也可以，靠 HSK/声调/意思来问
    card = {
        'id': f'char_{word}',
        'type': 'char',           # 单字
        'word': word,
        'pinyin': pinyin,
        'indonesian': info.get('indonesian', ''),
        'hsk': info.get('hsk', 0),
        'components': components,
        'componentCount': len(components),
        'firstChar': word[0],
        'lastChar': word[-1],
        'charCount': len(word),
        'tones': get_tones(pinyin),
        'firstTone': first_tone(pinyin),
    }
    cards.append(card)

# ---- 词语卡（来自 chain_dictionary.json，选 2-3 字词）----
# 筛选：2字词为主，排除太生僻的，选 HSK 1-4 常用词
word_cards = []
for word, info in chain.items():
    if len(word) < 2 or len(word) > 3:
        continue
    hsk = info.get('hsk', 0)
    meaning = info.get('meaning', '')
    if not meaning:
        continue
    # 优先 HSK 1-3，再补 HSK 4
    pinyin = info.get('pinyin', '')
    word_cards.append({
        'id': f'word_{word}',
        'type': 'word',           # 词语
        'word': word,
        'pinyin': pinyin,
        'indonesian': meaning,
        'hsk': hsk,
        'components': [],
        'componentCount': 0,
        'firstChar': word[0],
        'lastChar': word[-1],
        'charCount': len(word),
        'tones': get_tones(pinyin),
        'firstTone': first_tone(pinyin),
    })

# 按 HSK 优先排序，选前 500 个词语卡（覆盖各级别）
word_cards.sort(key=lambda x: (x['hsk'], x['word']))
# 每个 HSK 级别各取一定数量
from collections import defaultdict
by_hsk = defaultdict(list)
for c in word_cards:
    by_hsk[c['hsk']].append(c)

selected_words = []
targets = {1: 80, 2: 80, 3: 80, 4: 80, 5: 100, 6: 80}
for level, count in targets.items():
    selected_words.extend(by_hsk[level][:count])

cards.extend(selected_words)

# ---- 整理所有可用的属性集合（用于前端渲染问题按钮）----
all_radicals = sorted(set(c for card in cards if card['type'] == 'char' for c in card['components']))
all_hsk_levels = sorted(set(card['hsk'] for card in cards if card['hsk'] > 0))
all_tones = ['1', '2', '3', '4', '5']
all_char_counts = sorted(set(card['charCount'] for card in cards))
all_first_chars = sorted(set(card['firstChar'] for card in cards))
all_last_chars = sorted(set(card['lastChar'] for card in cards))

output = {
    'cards': cards,
    'meta': {
        'totalCards': len(cards),
        'charCards': sum(1 for c in cards if c['type'] == 'char'),
        'wordCards': sum(1 for c in cards if c['type'] == 'word'),
        'allRadicals': all_radicals[:80],  # 最多 80 个常用偏旁
        'allHskLevels': all_hsk_levels,
        'allTones': all_tones,
        'allCharCounts': all_char_counts,
    }
}

with open('D:/chinese/src/data/guess_who_basic.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Total cards: {len(cards)}")
print(f"  Char cards: {sum(1 for c in cards if c['type'] == 'char')}")
print(f"  Word cards: {sum(1 for c in cards if c['type'] == 'word')}")
print(f"  All radicals: {len(all_radicals)}")
print(f"  HSK distribution: { {k: sum(1 for c in cards if c['hsk'] == k) for k in all_hsk_levels} }")
print(f"\nSample char card: {cards[0]}")
print(f"\nSample word card: {next(c for c in cards if c['type'] == 'word')}")
