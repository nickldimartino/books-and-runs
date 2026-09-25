// Books & Runs — before-first-paint init script.
//
// Was four inline <script dangerouslySetInnerHTML> tags in app/layout.tsx;
// moved to this external file so the CSP in vercel.json can drop
// script-src 'unsafe-inline' — an external, same-origin script needs no
// special CSP allowance beyond the 'self' this app already grants.
// Loaded as a plain blocking <script src> (no async/defer), same position
// in <head> the inline tags held, so it still runs and paints before the
// rest of the page — that ordering is the entire point of every block below.
//
// The data below (every theme id + its --bg color, and the non-"off"
// colorblind mode ids) is duplicated by hand from app/lib/themeStore.ts and
// app/lib/colorblindStore.ts — the same trade-off THEME_BG itself already
// makes in that file, just one level further out. Keep in sync by hand when
// adding a theme or a colorblind mode.

(function () {
  var THEME_IDS = ["midnight","daylight","casino","pastel","arcade","sakura","noir","citrus","ember","frost","lagoon","meadow","sahara","coralsand","aurora","lilac","jade","champagne","verdigris","alabaster","valentines","sweetheart","stpatricks","cloverfield","springdusk","easter","july4th","starsandstripes","halloween","candycorn","thanksgiving","pumpkinspice","hanukkah","festivaloflights","christmas","candycane","newyears","confetti"];
  var THEME_BG = {"midnight":"#0a2b20","daylight":"#f4f1ea","pastel":"#eef1fb","casino":"#170a0a","arcade":"#14092b","noir":"#0d0d0d","sakura":"#fdf1f5","ember":"#0f0906","lagoon":"#04211f","sahara":"#2a1810","aurora":"#060b14","jade":"#0b1210","verdigris":"#0c1613","alabaster":"#f2f1ef","citrus":"#fff8ee","frost":"#f4f9fc","meadow":"#f9f8ec","coralsand":"#fdf3e7","lilac":"#f4f1f6","champagne":"#faf3e4","valentines":"#2b0a14","stpatricks":"#052e16","easter":"#fdf6fb","july4th":"#050e2e","halloween":"#0d0710","thanksgiving":"#2a1608","hanukkah":"#0a1230","festivaloflights":"#f2f6ff","christmas":"#0a2818","newyears":"#0a0a0c","sweetheart":"#fff0f4","cloverfield":"#f3fbf3","springdusk":"#1c1030","starsandstripes":"#f7f9fd","candycorn":"#fff8ec","pumpkinspice":"#fbf0e0","candycane":"#fef7f5","confetti":"#fffaf0"};
  var COLORBLIND_IDS = ["protanopia","deuteranopia","tritanopia"];
  var LOCALE_IDS = ["en","zh","ja","ko","de","fr","es","pt-BR","ru","it"];

  // Applies a previously-chosen theme before first paint, so static
  // export's server-rendered (theme-less) HTML doesn't flash Midnight
  // before swapping to whatever the visitor picked last time. Also
  // re-points the theme-color <meta> tag at the saved theme's own --bg.
  try {
    var t = localStorage.getItem("booksAndRuns:theme");
    if (THEME_IDS.indexOf(t) !== -1) {
      document.documentElement.setAttribute("data-theme", t);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m && THEME_BG[t]) m.setAttribute("content", THEME_BG[t]);
    }
  } catch (e) {}

  // Same reasoning, for the colorblind card-color override. "off" is
  // deliberately excluded: applyColorblindMode() never sets the attribute
  // for "off" (it removes it instead), and globals.css has no
  // [data-colorblind="off"] block to match anyway.
  try {
    var c = localStorage.getItem("booksAndRuns:colorblindMode");
    if (COLORBLIND_IDS.indexOf(c) !== -1) {
      document.documentElement.setAttribute("data-colorblind", c);
    }
  } catch (e) {}

  // Same reasoning again, for the text-size accessibility scale (see
  // app/lib/textScaleStore.ts) — "default" removes the attribute entirely
  // rather than storing it, so there's nothing to check against a fixed
  // list here beyond "is this one of the two non-default values."
  try {
    var ts = localStorage.getItem("booksAndRuns:textScale");
    if (ts === "large" || ts === "xlarge") {
      document.documentElement.setAttribute("data-text-scale", ts);
    }
  } catch (e) {}

  // Same reasoning again, for the card back — computed rather than just
  // copied from data-theme, since the saved choice might be "match"
  // (mirror the table theme, the default) or a real theme id of its own.
  try {
    var theme = THEME_IDS.indexOf(t) !== -1 ? t : "midnight";
    var cb = localStorage.getItem("booksAndRuns:cardBack");
    var effective = cb === "match" ? theme : THEME_IDS.indexOf(cb) !== -1 ? cb : theme;
    document.documentElement.setAttribute("data-cardback", effective);
  } catch (e) {}

  // Same reasoning again, for the display language (see
  // app/lib/localeStore.ts) — sets both the CSS hook (data-lang) and the
  // real <html lang> attribute before first paint, so a returning visitor
  // never sees a flash of English before LocaleProvider.tsx (app/lib/i18n/)
  // finishes loading their chosen locale's translated strings client-side.
  try {
    var lang = localStorage.getItem("booksAndRuns:locale");
    if (LOCALE_IDS.indexOf(lang) !== -1) {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("data-lang", lang);
    }
  } catch (e) {}

  // Arms the first-visit intro (see components/IntroSplash.tsx). Runs
  // before the body paints so html[data-intro]::before can cover the
  // screen with no flash of the home content underneath. Only the very
  // first entry to "/" in a browser session: a refresh keeps
  // sessionStorage so it won't replay, and reduced-motion skips it
  // entirely. The 4.5s self-clear is a safety net in case the React
  // component never mounts.
  try {
    if (location.pathname === "/" && !sessionStorage.getItem("booksAndRuns:introSeen")) {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        sessionStorage.setItem("booksAndRuns:introSeen", "1");
      } else {
        document.documentElement.setAttribute("data-intro", "1");
        setTimeout(function () {
          document.documentElement.removeAttribute("data-intro");
        }, 4500);
      }
    }
  } catch (e) {}
})();
