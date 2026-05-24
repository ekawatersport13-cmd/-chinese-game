import json

with open('D:/chinese/src/data/guess_who_advanced.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Description words and their pinyin (mixed format, same as original)
WORD_PINYIN = {
    '他': 'tā', '她': 'tā', '是': 'shì', '在': 'zài', '很': 'hěn',
    '学生': 'xuéshēng', '老师': 'lǎoshī', '运动员': 'yùndòngyuán',
    '校长': 'xiàozhǎng', '保安': 'bǎoān', '清洁工': 'qīngjiégōng',
    '图书管理员': 'túshū guǎnlǐyuán', '摄影师': 'shèyǐngshī',
    '小贩': 'xiǎofàn', '游客': 'yóukè',
    '爸爸': 'bàba', '妈妈': 'māma', '爷爷': 'yéye', '奶奶': 'nǎinai',
    '哥哥': 'gēge', '姐姐': 'jiějie', '弟弟': 'dìdi', '妹妹': 'mèimei',
    '小朋友': 'xiǎopéngyǒu', '老人': 'lǎorén',
    '在学习': 'zài xuéxí', '在看书': 'zài kànshū', '在跑步': 'zài pǎobù',
    '在做饭': 'zài zuòfàn', '在拍照': 'zài pāizhào', '在写字': 'zài xiězì',
    '在吃饭': 'zài chīfàn', '在睡觉': 'zài shuìjiào', '在唱歌': 'zài chànggē',
    '在喝水': 'zài hēshuǐ', '在喝茶': 'zài hēchá', '在画画': 'zài huàhuà',
    '在看电视': 'zài kàn diànshì', '在买东西': 'zài mǎi dōngxi',
    '在休息': 'zài xiūxi', '在打太极': 'zài dǎ tàijí',
    '在打扫': 'zài dǎsǎo', '在打电话': 'zài dǎ diànhuà',
    '在操场上': 'zài cāochǎng shàng', '在食堂里': 'zài shítáng lǐ',
    '在教室里': 'zài jiàoshì lǐ', '在图书馆里': 'zài túshūguǎn lǐ',
    '在卧室里': 'zài wòshì lǐ', '在厨房里': 'zài chúfáng lǐ',
    '在客厅里': 'zài kètīng lǐ', '在花园里': 'zài huāyuán lǐ',
    '在草地上': 'zài cǎodì shàng', '在树下': 'zài shù xià',
    '在喷泉旁': 'zài pēnquán páng', '在长椅上': 'zài chángyǐ shàng',
    '很开心': 'hěn kāixīn', '很难过': 'hěn nánguò', '很生气': 'hěn shēngqì',
    '很惊讶': 'hěn jīngyà',
    '是': 'shì', '老年的': 'lǎonián de', '的': 'de',
}

def phrase_to_pinyin(phrase):
    """Convert a sentence to pinyin. Try matching longest phrases first."""
    result = []
    # Sort by length descending for greedy matching
    sorted_words = sorted(WORD_PINYIN.keys(), key=len, reverse=True)
    remaining = phrase
    while remaining:
        matched = False
        for word in sorted_words:
            if remaining.startswith(word):
                result.append(WORD_PINYIN[word])
                remaining = remaining[len(word):]
                matched = True
                break
        if not matched:
            # Skip unrecognized character
            remaining = remaining[1:]
    return ' '.join(result)

def desc_to_pinyin(desc):
    """Convert full description to pinyin (sentence-separated with dots)."""
    sentences = desc.split('。')
    parts = []
    for s in sentences:
        s = s.strip()
        if s:
            parts.append(phrase_to_pinyin(s))
    return '. '.join(parts) + '.'

# Location display text
LOC_TEXT = {
    '操场': '在操场上', '食堂': '在食堂里', '教室': '在教室里',
    '图书馆': '在图书馆里', '卧室': '在卧室里', '厨房': '在厨房里',
    '客厅': '在客厅里', '花园': '在花园里', '草地': '在草地上',
    '树下': '在树下', '喷泉旁': '在喷泉旁', '长椅上': '在长椅上',
}

ROLE_TEXT = {
    '学生': '学生', '老师': '老师', '运动员': '运动员',
    '校长': '校长', '保安': '保安', '清洁工': '清洁工',
    '图书管理员': '图书管理员', '摄影师': '摄影师',
    '卖东西的人': '小贩', '游客': '游客',
    '爸爸': '爸爸', '妈妈': '妈妈', '爷爷': '爷爷', '奶奶': '奶奶',
    '哥哥': '哥哥', '姐姐': '姐姐', '弟弟': '弟弟', '妹妹': '妹妹',
    '小朋友': '小朋友', '老人': '老人',
}

EXPR_TEXT = {
    'happy': '很开心', 'sad': '很难过', 'angry': '很生气',
    'surprised': '很惊讶', 'neutral': '',
}

for scene_name, scene_data in data['scenes'].items():
    for card in scene_data['characters']:
        attrs = card['attributes']
        parts = []

        age_prefix = ''
        if attrs['age'] == '老年':
            age_prefix = '老年的'
        role_name = ROLE_TEXT.get(attrs['role'], attrs['role'])
        pronoun = '他' if attrs['gender'] == '男' else '她'
        parts.append(f'{pronoun}是{age_prefix}{role_name}。')

        if attrs['action']:
            parts.append(f'{pronoun}{attrs["action"]}。')

        if attrs['location']:
            loc_text = LOC_TEXT.get(attrs['location'], '在' + attrs['location'])
            parts.append(f'{pronoun}{loc_text}。')

        expr = EXPR_TEXT.get(attrs['expression'], '')
        if expr:
            parts.append(f'{pronoun}{expr}。')

        new_desc = ' '.join(parts)
        card['description'] = new_desc
        card['descriptionPinyin'] = desc_to_pinyin(new_desc)

with open('D:/chinese/src/data/guess_who_advanced.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

total = sum(len(s['characters']) for s in data['scenes'].values())
print(f'Updated {total} cards - descriptions simplified (removed visible info)')

# Verify
for scene_name in ['school', 'family', 'park']:
    print(f'\n=== {scene_name} (first 2) ===')
    for card in data['scenes'][scene_name]['characters'][:2]:
        print(f'{card["id"]}:')
        print(f'  DESC: {card["description"]}')
        print(f'  PINY: {card["descriptionPinyin"]}')
