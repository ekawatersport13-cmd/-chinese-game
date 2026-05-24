import urllib.request, ssl, traceback, json, os

os.chdir(r'D:\chinese\scripts\temp')

# Test basic connectivity first
try:
    print('Testing connectivity...')
    ctx = ssl.create_default_context()
    # Test with a small request first
    req = urllib.request.Request('https://httpbin.org/get', headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=10)
    print(f'httpbin status: {resp.status}')
except Exception as e:
    print(f'httpbin failed: {e}')

# Test GitHub
try:
    print('Testing GitHub...')
    req = urllib.request.Request('https://api.github.com', headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, context=ctx, timeout=10)
    print(f'GitHub API status: {resp.status}')
except Exception as e:
    print(f'GitHub API failed: {e}')

# Test raw.githubusercontent.com with redirect handling
try:
    print('Testing raw.githubusercontent.com...')
    req = urllib.request.Request(
        'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/README.md',
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    resp = urllib.request.urlopen(req, context=ctx, timeout=15)
    data = resp.read()
    print(f'README.md: {len(data)} bytes')
    print(data[:200].decode('utf-8'))
except Exception as e:
    print(f'Raw GitHub failed: {e}')
