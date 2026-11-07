// The page behind a shared challenge link, play.battlechoc.com/<code> (nginx rewrites it to
// /play/<code>, see deploy/nginx/play.battlechoc.com.conf). Chat apps read its Open Graph tags for
// the link preview, which names the challenger; a browser runs the script and goes on to the game
// at battlechoc.com/?challenge=<code>. No HTTP redirect: crawlers would follow it and show the
// game's general preview instead.

const crypto = require('crypto');
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
const PREVIEW_IMAGE = 'https://battlechoc.com/images/challenge-preview.jpg';

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

// The page may run its own script and style, marked with the nonce of this response, and nothing
// else: no other script, no frame around it, no form. Its links and the redirect are navigations,
// which the policy does not limit, and crawlers read the Open Graph tags without running anything.
const contentSecurityPolicy = nonce => [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join('; ');

/**
 * The HTML of the page: code is a normalized challenge code or null, info the waiting challenge's
 * { from, language } or null (then the general preview), nonce the one of the response's content
 * security policy.
 */
const renderPlayPage = ({ code, info, nonce }) => {
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
<style nonce="${nonce}">body{margin:0;padding-top:30vh;background:#457B82;color:#fff;font-family:sans-serif;text-align:center}a{color:#fff}</style>
</head>
<body>
<p><a href="${target}">${escapeHtml(title)}</a></p>
<script nonce="${nonce}">location.replace(${JSON.stringify(target)});</script>
</body>
</html>
`;
};

/** GET /play/:code? with challengeInfo(code) → { from, language } | null (the lobby's waiting challenges). */
const registerPlayRoutes = (app, { challengeInfo, limit }) => {
    app.get(['/play', '/play/', '/play/:code'], limit, (req, res) => {
        const code = normalizeChallengeCode(req.params.code);
        const info = code ? challengeInfo(code) : null;
        const nonce = crypto.randomBytes(16).toString('base64');
        res.set('Cache-Control', 'no-store');
        res.set('Content-Security-Policy', contentSecurityPolicy(nonce));
        res.type('html').send(renderPlayPage({ code, info, nonce }));
    });
};

module.exports = { registerPlayRoutes, renderPlayPage };
