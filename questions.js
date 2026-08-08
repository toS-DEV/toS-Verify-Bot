const path = require('path');
const fs = require('fs');

const jsonPath = path.join(__dirname, 'data', 'questions.json');

function loadQuestions() {
  try {
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const questions = JSON.parse(rawData);

    const seenIds = new Set();
    const seenContents = new Set();
    const sanitized = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const baseId = q.id || `q_${i + 1}`;

      // 1. 完全重複のチェック（問題文・選択肢・正解インデックスがすべて同じならスキップ）
      const contentKey = `${q.question}_${JSON.stringify(q.choices)}_${q.answerIndex}`;
      if (seenContents.has(contentKey)) {
        console.warn(`[questions] 完全重複のためスキップしました: "${q.question}"`);
        continue;
      }
      seenContents.add(contentKey);

      // 2. ID重複の自動補正（中身は違うのにIDが被っている場合、末尾に _1, _2 を付与）
      let uniqueId = baseId;
      let counter = 1;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${baseId}_${counter}`;
        counter++;
      }

      if (uniqueId !== baseId) {
        console.warn(`[questions] ID重複を自動補正しました: ${baseId} -> ${uniqueId}`);
      }

      seenIds.add(uniqueId);
      sanitized.push({
        ...q,
        id: uniqueId,
      });
    }

    return sanitized;
  } catch (err) {
    console.error('[questions] JSONの読み込み失敗:', err.message);
    return [];
  }
}

function pickRandomQuestions(n) {
  const questions = loadQuestions();
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function getQuestionsByIds(ids) {
  const questions = loadQuestions();
  return ids.map((id) => questions.find((q) => q.id === id)).filter(Boolean);
}

module.exports = { pickRandomQuestions, getQuestionsByIds };