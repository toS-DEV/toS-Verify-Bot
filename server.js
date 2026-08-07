const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const { pickRandomQuestions, getQuestionsByIds } = require('./quizData');

function createServer(discordActions) {
  const {
    grantVerifiedRole,
    hasUnverifiedRole,
  } = discordActions;

  const {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_REDIRECT_URI,
    SESSION_SECRET,
    RECAPTCHA_SITE_KEY,
    RECAPTCHA_SECRET_KEY,
    COOLDOWN_MINUTES = '1',
    MAX_WRONG_STREAK = '3',
    QUIZ_QUESTION_COUNT = '3',
  } = process.env;

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(session({
    secret: SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 30 }, // 30分
  }));

  function requireLogin(req, res, next) {
    if (!req.session.discordUser) {
      return res.redirect('/');
    }
    next();
  }

  // ---- トップページ ----
  app.get('/', (req, res) => {
    res.render('login', { loggedIn: !!req.session.discordUser });
  });

  // ---- OAuth2: Discordへリダイレクト ----
  app.get('/auth/discord', (req, res) => {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      prompt: 'consent',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  // ---- OAuth2: コールバック ----
  app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('認証コードがありません。最初からやり直してください。');

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: DISCORD_REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('[oauth] token exchange failed:', errText);
        return res.status(400).send('認証に失敗しました。もう一度お試しください。');
      }

      const tokenData = await tokenRes.json();

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const user = await userRes.json();

      req.session.discordUser = { id: user.id, username: `${user.username}` };
      res.redirect('/quiz');
    } catch (e) {
      console.error('[oauth] error:', e);
      res.status(500).send('認証中にエラーが発生しました。');
    }
  });

  // ---- クイズ表示 ----
  app.get('/quiz', requireLogin, async (req, res) => {
    const discordId = req.session.discordUser.id;
    const member = db.getMember(discordId);

    if (!member) {
      return res.render('blocked', {
        reason: 'サーバーの参加記録が見つかりません。一度サーバーから退出し、再度参加してからお試しください。',
      });
    }

    if (member.status === 'verified') {
      return res.render('success', { alreadyVerified: true });
    }

    // 非認証ロールが付いている場合はクイズに入れない（再参加必須）
    const unverified = await hasUnverifiedRole(discordId).catch(() => false);
    if (unverified || member.status === 'unverified') {
      return res.render('blocked', {
        reason: '非認証ロールが付与されています。再挑戦するには一度サーバーから退出し、再度参加してください。',
      });
    }

    // クールタイム中か確認
    const now = Date.now();
    if (member.cooldown_until && member.cooldown_until > now) {
      const remainingSec = Math.ceil((member.cooldown_until - now) / 1000);
      return res.render('wait', { remainingSec });
    }

    const questions = pickRandomQuestions(Number(QUIZ_QUESTION_COUNT) || 3);
    req.session.quizQuestionIds = questions.map((q) => q.id);

    res.render('quiz', {
      questions: questions.map((q) => ({ id: q.id, question: q.question, choices: q.choices })),
    });
  });

  // ---- クイズ採点 ----
  app.post('/quiz/submit', requireLogin, async (req, res) => {
    const discordId = req.session.discordUser.id;
    const member = db.getMember(discordId);
    if (!member) return res.redirect('/quiz');

    const questionIds = req.session.quizQuestionIds || [];
    if (questionIds.length === 0) return res.redirect('/quiz');

    const questions = getQuestionsByIds(questionIds);
    const allCorrect = questions.every((q) => {
      const submitted = req.body[q.id];
      return submitted !== undefined && Number(submitted) === q.answerIndex;
    });

    req.session.quizQuestionIds = null;

    if (allCorrect) {
      req.session.quizPassed = true;
      return res.redirect('/captcha');
    }

    // 不正解: クールタイム付与 + 連続不正解カウント
    const cooldownMs = (Number(COOLDOWN_MINUTES) || 1) * 60 * 1000;
    db.setCooldown(discordId, Date.now() + cooldownMs);
    const streak = db.incrementWrongStreak(discordId);

    const maxStreak = Number(MAX_WRONG_STREAK) || 3;
    if (streak >= maxStreak) {
      try {
        await discordActions.grantUnverifiedRole(discordId);
        db.setStatus(discordId, 'unverified');
      } catch (e) {
        console.error('[quiz] 非認証ロール付与に失敗:', e.message);
      }
      return res.render('blocked', {
        reason: `クイズに${maxStreak}回連続で不正解だったため、非認証ロールが付与されました。再挑戦するには一度サーバーから退出し、再度参加してください。`,
      });
    }

    res.render('fail', {
      cooldownMinutes: Number(COOLDOWN_MINUTES) || 1,
      streak,
      maxStreak,
    });
  });

  // ---- reCAPTCHA表示 ----
  app.get('/captcha', requireLogin, (req, res) => {
    if (!req.session.quizPassed) return res.redirect('/quiz');
    res.render('captcha', { siteKey: RECAPTCHA_SITE_KEY });
  });

  // ---- reCAPTCHA検証 → ロール付与 ----
  app.post('/captcha/verify', requireLogin, async (req, res) => {
    if (!req.session.quizPassed) return res.redirect('/quiz');

    const token = req.body['g-recaptcha-response'];
    if (!token) {
      return res.render('captcha', {
        siteKey: RECAPTCHA_SITE_KEY,
        error: 'reCAPTCHAにチェックを入れてください。',
      });
    }

    try {
      const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: RECAPTCHA_SECRET_KEY,
          response: token,
        }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        return res.render('captcha', {
          siteKey: RECAPTCHA_SITE_KEY,
          error: 'reCAPTCHAの検証に失敗しました。もう一度お試しください。',
        });
      }

      const discordId = req.session.discordUser.id;
      await grantVerifiedRole(discordId);
      db.setStatus(discordId, 'verified');
      db.resetWrongStreak(discordId);
      req.session.quizPassed = false;

      res.render('success', { alreadyVerified: false });
    } catch (e) {
      console.error('[captcha] error:', e);
      res.status(500).send('検証中にエラーが発生しました。しばらくしてから再度お試しください。');
    }
  });

  return app;
}

module.exports = createServer;
