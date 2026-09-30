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

  // Automated holiday theming (see app/lib/holidayTheme.ts, the TS source
  // of truth this is hand-duplicated from by the same necessity as
  // THEME_IDS/THEME_BG above — holidayTheme.test.ts evaluates this exact
  // block against that module across a wide date range to keep the two
  // honest, instead of trusting them to stay in sync by eye). For 7 days
  // before/after each of 9 US holidays, the *displayed* theme below
  // defaults to that holiday's dark/light pair, without ever touching the
  // saved "booksAndRuns:theme" value itself — see that file's own doc.
  var HOLIDAY_WINDOW_DAYS = 7;
  function easterDate(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var mm = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * mm + 114) / 31);
    var day = ((h + l - 7 * mm + 114) % 31) + 1;
    return [month, day];
  }
  function thanksgivingDate(year) {
    var nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    var firstThursday = 1 + ((4 - nov1Dow + 7) % 7);
    return [11, firstThursday + 21];
  }
  // Hand-maintained — see holidayTheme.ts's own table doc.
  var HANUKKAH_FIRST_NIGHT = {2024:[12,25],2025:[12,14],2026:[12,4],2027:[12,24],2028:[12,12],2029:[12,1],2030:[12,20],2031:[12,9],2032:[11,27],2033:[12,16],2034:[12,6],2035:[12,25]};
  var HOLIDAYS = [
    { id: "valentines", dark: "valentines", light: "sweetheart", center: function () { return [2, 14]; } },
    { id: "stpatricks", dark: "stpatricks", light: "cloverfield", center: function () { return [3, 17]; } },
    { id: "easter", dark: "springdusk", light: "easter", center: easterDate },
    { id: "july4th", dark: "july4th", light: "starsandstripes", center: function () { return [7, 4]; } },
    { id: "halloween", dark: "halloween", light: "candycorn", center: function () { return [10, 31]; } },
    { id: "thanksgiving", dark: "thanksgiving", light: "pumpkinspice", center: thanksgivingDate },
    { id: "hanukkah", dark: "hanukkah", light: "festivaloflights", center: function (y) { return HANUKKAH_FIRST_NIGHT[y] || null; } },
    { id: "christmas", dark: "christmas", light: "candycane", center: function () { return [12, 25]; } },
    { id: "newyears", dark: "newyears", light: "confetti", center: function () { return [1, 1]; } }
  ];
  function activeHoliday(now) {
    var y0 = now.getUTCFullYear();
    var todayMs = Date.UTC(y0, now.getUTCMonth(), now.getUTCDate());
    var best = null;
    for (var hi = 0; hi < HOLIDAYS.length; hi++) {
      var def = HOLIDAYS[hi];
      for (var yo = -1; yo <= 1; yo++) {
        var year = y0 + yo;
        var c = def.center(year);
        if (!c) continue;
        var centerMs = Date.UTC(year, c[0] - 1, c[1]);
        var distance = Math.abs(Math.round((todayMs - centerMs) / 86400000));
        if (distance > HOLIDAY_WINDOW_DAYS) continue;
        if (!best || distance < best.distance) best = { def: def, distance: distance, centerMs: centerMs };
      }
    }
    if (!best) return null;
    // Midnight UTC of the day *after* the window's last day — see
    // holidayTheme.ts's own comment on why this is exclusive, not inclusive.
    return { id: best.def.id, dark: best.def.dark, light: best.def.light, windowEndMs: best.centerMs + (HOLIDAY_WINDOW_DAYS + 1) * 86400000 };
  }
  function prefersDark() {
    try { return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return true; }
  }
  function holidayOptOutActive(active) {
    try {
      var raw = localStorage.getItem("booksAndRuns:holidayThemeOptOut");
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      return !!parsed && parsed.holidayId === active.id && typeof parsed.untilMs === "number" && Date.now() < parsed.untilMs;
    } catch (e) { return false; }
  }
  function getDisplayTheme(saved, now) {
    var active = activeHoliday(now);
    if (!active) return saved;
    if (holidayOptOutActive(active)) return saved;
    return prefersDark() ? active.dark : active.light;
  }

  // Applies a previously-chosen theme (or the holiday default, see above)
  // before first paint, so static export's server-rendered (theme-less)
  // HTML doesn't flash Midnight before swapping to the real thing. Also
  // re-points the theme-color <meta> tag at the displayed theme's --bg.
  var t;
  try {
    var savedTheme = localStorage.getItem("booksAndRuns:theme");
    t = THEME_IDS.indexOf(savedTheme) !== -1 ? savedTheme : "midnight";
    var displayTheme = getDisplayTheme(t, new Date());
    document.documentElement.setAttribute("data-theme", displayTheme);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && THEME_BG[displayTheme]) m.setAttribute("content", THEME_BG[displayTheme]);
    t = displayTheme;
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

  // Same reasoning again, for the in-app Reduce motion setting (see
  // app/lib/motion.ts) — lives inside the settings JSON blob rather than its
  // own key, so parse it here. Only "on" sets the attribute; "system" is
  // handled by the OS media queries in globals.css.
  try {
    var hs = JSON.parse(localStorage.getItem("booksAndRuns:settings") || "{}");
    if (hs && hs.reduceMotion === "on") {
      document.documentElement.setAttribute("data-reduce-motion", "on");
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

  // First-visit page tips (see app/components/PageTip.tsx, tipsStore.ts):
  // PageTip is server-rendered visible so it never pops in after hydration
  // (a layout shift); this stamps the ids already dismissed onto <html>, and
  // globals.css hides `[data-tip=<id>]` for each — before first paint, so a
  // returning visitor never sees a dismissed tip at all.
  try {
    var seenRaw = localStorage.getItem("booksAndRuns:seenTips");
    var seenIds = seenRaw ? JSON.parse(seenRaw) : [];
    if (Array.isArray(seenIds)) {
      document.documentElement.setAttribute(
        "data-seen-tips",
        seenIds.filter(function (x) { return typeof x === "string" && /^[a-z-]+$/.test(x); }).join(" ")
      );
    }
  } catch (e) {}

  // Two more layout-stability hints for Home (see the data-home-* attributes
  // in app/page.tsx and their CSS in globals.css). The prerendered HTML has to
  // pick one Home layout for everybody; these say which visitors it doesn't
  // apply to, before first paint, so nothing pops in or out afterwards:
  //   data-started    — this device has started a game (Quests card shows)
  //   data-signed-in  — a Supabase session is stored here (Sign-in prompt
  //                     hidden, "Your games" skeleton shown)
  try {
    if (localStorage.getItem("booksAndRuns:hasStartedAGame") === "1") {
      document.documentElement.setAttribute("data-started", "1");
    }
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k)) {
        document.documentElement.setAttribute("data-signed-in", "1");
        break;
      }
    }
  } catch (e) {}

  // Home's Today card remembers its selected tab (Daily / Weekly / Quests) and
  // the dismissed guest sign-in prompt — both stamped here so the prerendered
  // layout already matches before first paint (see app/globals.css).
  try {
    var tt = localStorage.getItem("booksAndRuns:todayTab");
    if (tt === "daily" || tt === "weekly" || tt === "quests") {
      document.documentElement.setAttribute("data-today-tab", tt);
    }
    if (localStorage.getItem("booksAndRuns:hadMpGames") === "1") {
      document.documentElement.setAttribute("data-had-games", "1");
    }
    if (localStorage.getItem("booksAndRuns:signInPromptDismissed") === "1") {
      document.documentElement.setAttribute("data-signin-dismissed", "1");
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
      if (document.documentElement.hasAttribute("data-reduce-motion") || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        sessionStorage.setItem("booksAndRuns:introSeen", "1");
      } else {
        document.documentElement.setAttribute("data-intro", "1");
        setTimeout(function () {
          document.documentElement.removeAttribute("data-intro");
        }, 4500);
      }
    }
  } catch (e) {}

  // Snapshot every attribute set on <html> above. React 19 clears the
  // attributes it doesn't own on <html> when it hydrates (a fresh profile
  // loses data-intro, data-seen-tips, data-started, data-signed-in,
  // data-reduce-motion… ~60 ms in), which cut the intro short, re-showed
  // dismissed tips and hid the Quests card. components/HtmlAttrsRestore.tsx
  // puts back whatever is missing, in a layout effect (before paint).
  try {
    var snap = {};
    var attrs = document.documentElement.attributes;
    for (var a = 0; a < attrs.length; a++) snap[attrs[a].name] = attrs[a].value;
    window.__brHtmlAttrs = snap;
  } catch (e) {}
})();
