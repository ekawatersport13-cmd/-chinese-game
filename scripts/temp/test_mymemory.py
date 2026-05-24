import urllib.request, ssl, json, time

ctx = ssl.create_default_context()

def translate_mymemory(text, source='zh-CN', target='id', email=None):
    """Translate using MyMemory API (free, no key needed)"""
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    if email:
        params += f'&de={email}'
    url = f'https://api.mymemory.translated.net/get{params}'

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    data = json.loads(resp.read().decode('utf-8'))

    if data.get('responseStatus') == 200:
        matches = data.get('responseData', {}).get('translatedText', '')
        return matches
    return None

import urllib.parse

# Test with sample words
test_words = [
    '烧烤', '外卖', '方便面', '手机', '电脑',
    '漂亮', '高兴', '喜欢', '朋友', '老师',
    '工作', '学习', '饭店', '机场', '地铁',
    '太阳', '月亮', '星星', '天气', '下雨',
    '烧烤',
]

print('Testing MyMemory Translation API (Chinese -> Indonesian)')
print('=' * 60)

for word in test_words:
    try:
        result = translate_mymemory(word)
        if result:
            print(f'  {word} -> {result}')
        else:
            print(f'  {word} -> [NO RESULT]')
        time.sleep(0.5)  # Be polite with rate limiting
    except Exception as e:
        print(f'  {word} -> [ERROR: {e}]')

# Test batch (comma-separated)
print('\nBatch test (multiple words at once):')
batch = '烧烤,外卖,方便面,手机,电脑,漂亮,高兴'
try:
    result = translate_mymemory(batch)
    print(f'  Input:  {batch}')
    print(f'  Output: {result}')
except Exception as e:
    print(f'  Error: {e}')
