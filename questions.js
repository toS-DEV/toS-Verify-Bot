const path = require('path');
const QUESTIONS = require(path.join(__dirname, 'data', 'questions.json'));

/**
 * Fisher-Yatesアルゴリズムでランダムにn問取得する。
 */
function pickRandomQuestions(n) {
  const shuffled = [...QUESTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function getQuestionsByIds(ids) {
  return ids.map((id) => QUESTIONS.find((q) => q.id === id)).filter(Boolean);
}

module.exports = { QUESTIONS, pickRandomQuestions, getQuestionsByIds };