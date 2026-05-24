"""
Quick test: translate a small batch to debug MyMemory API speed
"""
import urllib.request, urllib.parse, ssl, json, time

ctx = ssl.create_default_context()

def translate_batch(words, source='zh-CN', target='id'):
    text = ','.join(words)
    params = f'?langpair={source}|{target}&q={urllib.parse.quote(text)}'
    url = f'https://api.mymemory.translated.net/get{params}'

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    t0 = time.time()
    resp = urllib.request.urlopen(req, context=ctx, timeout=60)
    data = json.loads(resp.read().decode('utf-8'))
    elapsed = time.time() - t0

    if data.get('responseStatus') == 200:
        translated = data.get('responseData', {}).get('translatedText', '')
        matches = data.get('matches', [])
        return translated.split(','), elapsed, len(matches)
    return [], elapsed, 0

# Test with different batch sizes
for batch_size in [5, 10, 15, 20]:
    words = ['烧烤', '外卖', '方便面', '手机', '电脑', '漂亮', '高兴', '喜欢', '朋友', '老师',
             '工作', '学习', '饭店', '机场', '地铁', '太阳', '月亮', '星星', '天气', '下雨'][:batch_size]

    try:
        results, elapsed, matches = translate_batch(words)
        print(f'Batch size {batch_size}: {len(results)} results in {elapsed:.1f}s, matches={matches}')
        if len(results) == batch_size:
            for w, r in zip(words, results):
                print(f'  {w} -> {r}')
        else:
            print(f'  MISMATCH: expected {batch_size}, got {len(results)}')
            print(f'  Raw: {results[:5]}')
    except Exception as e:
        print(f'Batch size {batch_size}: ERROR - {e}')

    time.sleep(2)
