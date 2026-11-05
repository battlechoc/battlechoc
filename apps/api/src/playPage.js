// The page behind a shared challenge link, play.battlechoc.com/<code> (nginx rewrites it to
// /play/<code>, see deploy/nginx/play.battlechoc.com.conf). Chat apps read its Open Graph tags for
// the link preview, which names the challenger; a browser runs the script and goes on to the game
// at battlechoc.com/?challenge=<code>. No HTTP redirect: crawlers would follow it and show the
// game's general preview instead.

const {
    live,
    translate,
    translationKeys,
    setCurrentLanguage,
    getCurrentLanguage,
} = require('@battlechoc/battlechoc-shared-functions');

const { normalizeChallengeCode, formatChallengeCode } = live;

const GAME_URL = 'https://battlechoc.com/';
const PLAY_URL = 'https://play.battlechoc.com/';
const PREVIEW_IMAGE = 'https://battlechoc.com/images/challenge-preview.png';

const escapeHtml = text => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const inLanguage = (language, fn) => {
    const previous = getCurrentLanguage();
    try {
        setCurrentLanguage(language || 'en');
        return fn();
    } finally {
        setCurrentLanguage(previous);
    }
};

/**
 * The HTML of the page: code is a normalized challenge code or null, info the waiting challenge's
 * { from, language } or null (then the general preview).
 */
const renderPlayPage = ({ code, info }) => {
    const language = info ? info.language || 'en' : 'en';
    const { title, text } = inLanguage(language, () => ({
        title: info ? translate(translationKeys.CHALLENGE_PREVIEW_TITLE, info.from) : 'battlechoc',
        text: translate(translationKeys.CHALLENGE_PREVIEW_TEXT),
    }));
    const formatted = code ? formatChallengeCode(code) : null;
    const target = formatted ? `${GAME_URL}?challenge=${formatted}` : GAME_URL;
    const pageUrl = formatted ? `${PLAY_URL}${formatted}` : PLAY_URL;
    return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="battlechoc">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(text)}">
<meta property="og:image" content="${PREVIEW_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body style="margin:0;padding-top:30vh;background:#457B82;color:#fff;font-family:sans-serif;text-align:center">
<p><a href="${target}" style="color:#fff">${escapeHtml(title)}</a></p>
<script>location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
};

/** GET /play/:code? with challengeInfo(code) → { from, language } | null (the lobby's waiting challenges). */
const registerPlayRoutes = (app, { challengeInfo, limit }) => {
    app.get(['/play', '/play/', '/play/:code'], limit, (req, res) => {
        const code = normalizeChallengeCode(req.params.code);
        const info = code ? challengeInfo(code) : null;
        res.set('Cache-Control', 'no-store');
        res.type('html').send(renderPlayPage({ code, info }));
    });
};

module.exports = { registerPlayRoutes, renderPlayPage };
