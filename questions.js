const path = require('path');
const fs = require('fs');

const jsonPath = path.join(__dirname, 'data', 'questions.json');

function loadQuestions() {
  try {
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    return JSON.parse(rawData);
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

module.exports = { QUESTIONS, pickRandomQuestions, getQuestionsByIds };
