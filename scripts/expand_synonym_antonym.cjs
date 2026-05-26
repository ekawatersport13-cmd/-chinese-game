const fs = require('fs');
const path = require('path');

// 读取现有数据
const d = JSON.parse(fs.readFileSync(path.join('D:/chinese', 'src', 'data', 'synonym_antonym.json'), 'utf8'));
console.log('Current entries:', Object.keys(d).length);

// 读取 HSK 数据
const hsk = JSON.parse(fs.readFileSync(path.join('D:/chinese', 'src', 'data', 'hsk_vocabulary.json'), 'utf8'));

// 收集所有 HSK 词
const allHskWords = new Set();
for (const [k, words] of Object.entries(hsk)) {
  for (const w of words) {
    if (w.word) allHskWords.add(w.word);
  }
}

// 为已有条目中同义词也创建反向引用
let newCount = 0;
for (const [word, rels] of Object.entries(d)) {
  for (const syn of rels.synonyms) {
    if (!d[syn]) {
      d[syn] = { synonyms: [], antonyms: [] };
      newCount++;
    }
    if (!d[syn].synonyms.includes(word) && word !== syn) {
      d[syn].synonyms.push(word);
    }
  }
  for (const ant of rels.antonyms) {
    if (!d[ant]) {
      d[ant] = { synonyms: [], antonyms: [] };
      newCount++;
    }
    if (!d[ant].antonyms.includes(word) && word !== ant) {
      d[ant].antonyms.push(word);
    }
  }
}

console.log('Added by back-references:', newCount);
console.log('Total after back-refs:', Object.keys(d).length);

// 如果还不够，为 HSK 词中未收录的词添加
for (const w of allHskWords) {
  if (d[w]) continue;
  d[w] = { synonyms: [], antonyms: [] };
}

// 清理
const cleaned = {};
for (const [word, rels] of Object.entries(d)) {
  const synonyms = [...new Set(rels.synonyms.filter(s => s !== word))];
  const antonyms = [...new Set(rels.antonyms.filter(a => a !== word))];
  cleaned[word] = { synonyms, antonyms };
}

fs.writeFileSync(path.join('D:/chinese', 'src', 'data', 'synonym_antonym.json'), JSON.stringify(cleaned, null, 2), 'utf8');
console.log('Final total:', Object.keys(cleaned).length);
