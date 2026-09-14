import messages from "../packages/messages.json" with { type: "json" };
export function translate(language, zh, en) {
  if (language === "zh") return zh;
  return messages[zh]?.[language] || en || messages[zh]?.en || zh;
}
export function setLanguage(language) {
  document.documentElement.lang = { zh: "zh-CN", en: "en", ja: "ja", ko: "ko" }[language] || "zh-CN";
}

// Adapted from the pinned desktop controller's readingLanguageFor. Metadata
// chooses its reading font by script; the operator's UI language is separate.
export function readingLanguageFor(text, context, language, themeId) {
  const value = String(text || '');
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u3040-\u30ff\u31f0-\u31ff]/u.test(value)) return 'ja';
  if (/\p{Script=Han}/u.test(value)) {
    const japaneseTheme = ['j-pop', 'anime', 'vocaloid'].includes(themeId);
    const japaneseContext = /[\u3040-\u30ff\u31f0-\u31ff]/u.test(context || '');
    return language === 'ja' || japaneseTheme || japaneseContext ? 'ja' : 'zh-CN';
  }
  return 'en';
}
