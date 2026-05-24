import urllib.request, ssl, traceback, json, os

os.chdir(r'D:\chinese\scripts\temp')

try:
    ctx = ssl.create_default_context()
    url = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json'
    print(f'Downloading from {url}...')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=60)
    data = resp.read()
    with open('hsk_complete.json', 'wb') as f:
        f.write(data)
    print(f'Downloaded {len(data)} bytes')

    # Quick stats
    d = json.loads(data)
    print(f'Total entries: {len(d)}')
except Exception as e:
    traceback.print_exc()
