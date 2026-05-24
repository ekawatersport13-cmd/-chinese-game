#!/usr/bin/env python3
"""
Scrape HSK vocabulary from suaramandarin.com
HSK 1-5 with Indonesian translations
"""
import json
import re
import time
import urllib.request
from urllib.error import HTTPError

BASE_URL = "https://www.suaramandarin.com/2022/10/kosakata-hsk-{level}.html"

def fetch_page(level):
    url = BASE_URL.format(level=level)
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode('utf-8', errors='ignore')
    except HTTPError as e:
        print(f"HSK{level}: HTTP {e.code}")
        return None
    except Exception as e:
        print(f"HSK{level}: Error - {e}")
        return None

def parse_table(html):
    """Extract vocabulary from HTML table cells"""
    words = []
    # Find all td cells with class et7 (data rows)
    cells = re.findall(r'<td class="et7"[^>]*>(.*?)</td>', html, re.DOTALL)

    # Each row has 5 cells: No, Character, Pinyin, English, Indonesia
    # Filter out cells that are just numbers (No column) and empty cells
    data_cells = []
    for cell in cells:
        text = re.sub(r'<[^>]+>', '', cell).strip()
        # Skip pure number cells (the No. column) and empty cells
        if text and not re.match(r'^\d+$', text):
            data_cells.append(text)

    # Group by 4: Character, Pinyin, English, Indonesia
    i = 0
    while i <= len(data_cells) - 4:
        char = data_cells[i].strip()
        pinyin = data_cells[i+1].strip()
        english = data_cells[i+2].strip()
        indonesia = data_cells[i+3].strip()

        # Validate: character should contain Chinese characters
        # pinyin should look like pinyin (latin letters with tone marks)
        # Skip rows where pinyin looks like English (data misalignment)
        is_chinese = bool(re.search(r'[\u4e00-\u9fff]', char))
        is_pinyin = bool(re.match(r'^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s\'-]+$', pinyin))

        if is_chinese and is_pinyin and indonesia:
            words.append({
                'word': char,
                'pinyin': pinyin,
                'meaning': indonesia,
                'english': english,
                'hsk': None
            })
            i += 4
        else:
            # Data misalignment, skip one cell and try again
            i += 1

    return words

def main():
    all_words = {}

    for level in range(1, 6):
        print(f"Fetching HSK {level}...")
        html = fetch_page(level)
        if not html:
            continue

        words = parse_table(html)
        print(f"  Found {len(words)} words")

        for w in words:
            w['hsk'] = level
            # Use word as key, avoid duplicates (keep lower HSK level)
            if w['word'] not in all_words:
                all_words[w['word']] = w

        time.sleep(2)  # Be polite

    # Save
    output = {
        'words': all_words,
        'meta': {
            'source': 'suaramandarin.com',
            'levels': 'HSK 1-5',
            'total': len(all_words),
            'date': '2026-05-23'
        }
    }

    with open('suaramandarin_hsk.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nTotal unique words: {len(all_words)}")

    # Show sample
    sample = list(all_words.values())[:5]
    print("\nSample:")
    for w in sample:
        print(f"  {w['word']} ({w['pinyin']}): {w['meaning']} [HSK{w['hsk']}]")

if __name__ == '__main__':
    main()
