"use strict";
const messages = require("./messages.json");
function translate(language, zh, en) {
  if (language === "zh") return zh;
  return messages[zh]?.[language] || en || messages[zh]?.en || zh;
}
function resolveLanguage(preference, systemLocale) {
  const value = String(preference && preference !== "system" ? preference : systemLocale || "en").toLowerCase().replaceAll("_", "-");
  const base = value.split("-")[0];
  return ["zh", "en", "ja", "ko"].includes(base) ? base : "en";
}
module.exports = { translate, resolveLanguage };
