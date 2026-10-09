// caption.mjs - puerto JavaScript puro (ES module, solo stdlib Node) de caption.py
// Replica fielmente la logica de analyse() del script Python:
// lint de una caption de Instagram y la ventana visible del feed antes de "... more".
//
// Fidelidad:
//  - Las longitudes y los cortes se calculan por PUNTOS DE CODIGO Unicode, igual
//    que len()/slice en Python (no por unidades UTF-16 de JS).
//  - Las mismas expresiones regulares, umbrales y textos de detalle que el Python.

export const LIMIT = 2200;        // limite duro de caption en Instagram
export const TRUNCATE = 125;      // donde el feed corta a "... more" (aprox.)
export const HASHTAG_LIMIT = 5;   // tope de hashtags por post/reel desde 18 dic 2025

// --- helpers de puntos de codigo (equivalente a len()/[:] de Python) ---
const cp = (s) => Array.from(s);
const cpLen = (s) => cp(s).length;
const cpSlice = (s, n) => cp(s).slice(0, n).join("");

// Python str.strip()/rstrip(): quitan espacios en blanco Unicode.
const pyStrip = (s) => s.replace(/^\s+/u, "").replace(/\s+$/u, "");
const pyRStrip = (s) => s.replace(/\s+$/u, "");

// --- expresiones regulares (traducidas de caption.py) ---
const HASHTAG_RE = /(?:^|\s)(#[A-Za-z0-9_]+)/g;
const MENTION_RE = /(?:^|\s)(@[A-Za-z0-9_.]+)/g;
const LINK_RE = /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app)\/\S*/gi;
// [\U0001F300-\U0001FAFF  ☀(2600)-➿(27BF)  ←(2190)-⇿(21FF)  ️(FE0F)]
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu;
// \$\s?\d | \b\d[\d,.]*\b | (?<!^)\b[A-Z][a-z]{2,}\b   (re.MULTILINE)
const CONCRETE_RE = /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;

const ASKS = [
  [/\bcomment (?:the word |")?[A-Z0-9]{2,}\b/i, "comment a keyword"],
  [/\b(?:dm|message) me\b/i, "DM me"],
  [/\bsave (?:this|it)\b/i, "save this"],
  [/\bshare (?:this|it)\b/i, "share this"],
  [/\bfollow (?:me|for)\b/i, "follow"],
  [/\blink in (?:my )?bio\b/i, "link in bio"],
  [/\b(?:swipe|tap) (?:through|left|right|for|to)\b/i, "swipe or tap"],
  [/\btell me\b|\bwhat would you\b|\bwhich one\b/i, "answer a question"],
  // CAPA ES
  [/\b(?:comenta|coméntame|comentame|escribe|pon) (?:la palabra |")?[A-ZÁÉÍÓÚÑ0-9]{2,}\b/i, "comentar una palabra"],
  [/\b(?:escríbeme|escribeme|mándame|mandame|háblame|hablame)\b|\bpor (?:dm|mp|mensaje privado|privado)\b/i, "escríbeme por DM"],
  [/\bgu[aá]rda(?:te)? (?:esto|este|lo)\b/i, "guardar"],
  [/\b(?:comparte) (?:esto|este|lo)\b/i, "compartir"],
  [/\b(?:s[ií]gueme|s[ií]guenos)\b/i, "seguir"],
  [/\b(?:link|enlace) en (?:la |mi )?bio\b/i, "enlace en la bio"],
  [/\bdime\b|\bqué (?:prefieres|opinas|harías)\b|\bcu[aá]l (?:eliges|prefieres)\b/i, "responder una pregunta"],
];

const FILLER_TAGS = new Set([
  "#viral", "#fyp", "#explore", "#explorepage", "#foryou", "#foryoupage",
  "#trending", "#instagood", "#love", "#follow", "#like4like", "#reels",
  "#reelsinstagram", "#viralreels", "#instadaily",
]);

// findall con un grupo de captura -> lista del grupo 1 (como re.findall en Python)
function findallGroup1(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}
// findall sin grupos -> lista de coincidencias completas
function findallFull(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) out.push(m[0]);
  return out;
}
// re.search(...) -> booleano. Clona para evitar estado lastIndex en regex globales.
function reSearch(re, text) {
  const r = new RegExp(re.source, re.flags.replace("g", ""));
  return r.test(text);
}

// escape para construir regex a partir de un hashtag literal (re.escape)
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Formato "%.1f" de Python: redondeo medio-a-par sobre el valor double.
function fmt1(x) {
  const neg = x < 0;
  let v = Math.abs(x);
  const scaled = v * 10;
  let floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r;
  const eps = 1e-9;
  if (Math.abs(diff - 0.5) < eps) {
    r = floor % 2 === 0 ? floor : floor + 1; // half to even
  } else {
    r = Math.round(scaled);
  }
  const res = r / 10;
  return (neg && res !== 0 ? "-" : "") + res.toFixed(1);
}

// visible_window: lo que muestra el feed; Instagram corta a mitad de palabra.
export function visibleWindow(text, cut) {
  const flat = pyStrip(text);
  return cpLen(flat) <= cut ? flat : cpSlice(flat, cut);
}

export function lintarCaption(texto, opciones = { keywords: [] }) {
  const cut = (opciones && Number.isInteger(opciones.truncate)) ? opciones.truncate : TRUNCATE;
  const rawKeywords = (opciones && opciones.keywords) || [];

  // text = text.rstrip(); stripped = text.strip()
  const text = pyRStrip(texto);
  const stripped = pyStrip(text);
  const chars = cpLen(stripped);
  const lines = stripped.split("\n");
  const firstLine = lines.length ? pyStrip(lines[0]) : "";
  const tags = findallGroup1(HASHTAG_RE, stripped);
  const mentions = findallGroup1(MENTION_RE, stripped);
  const links = findallFull(LINK_RE, stripped);
  const emoji = findallFull(EMOJI_RE, stripped);
  const windowStr = visibleWindow(stripped, cut);
  const truncated = chars > cut;
  const asks = ASKS.filter(([pat]) => reSearch(pat, stripped)).map(([, name]) => name);
  const filler = tags.filter((t) => FILLER_TAGS.has(t.toLowerCase()));
  const keywords = rawKeywords.map((k) => k.trim()).filter((k) => k);

  const checks = [];
  const add = (nombre, estado, detalle) => checks.push({ nombre, estado, detalle });

  // LENGTH
  add("LENGTH", chars > LIMIT ? "FAIL" : "PASS",
    `${chars} / ${LIMIT} characters` + (chars > LIMIT ? `, ${chars - LIMIT} over the limit` : ""));

  // FIRST LINE
  const flLen = cpLen(firstLine);
  if (!firstLine) {
    add("FIRST LINE", "FAIL", "the caption opens on a blank line");
  } else if (firstLine.startsWith("#") || firstLine.startsWith("@")) {
    add("FIRST LINE", "FAIL",
      "opens on a hashtag or a mention, which is the one position worth a sentence");
  } else if (flLen > cut) {
    add("FIRST LINE", "WARN",
      `${flLen} characters, so it gets cut at ${cut} mid-thought. ` +
      "Fine if the cut is a cliffhanger, bad if it is a subordinate clause");
  } else {
    add("FIRST LINE", "PASS", `${flLen} characters, lands whole`);
  }

  // HOOK IS CONCRETE
  const concreteCount = findallFull(CONCRETE_RE, windowStr).length;
  const concreteHit = reSearch(CONCRETE_RE, windowStr);
  add("HOOK IS CONCRETE", concreteHit ? "PASS" : "WARN",
    `${concreteCount} number(s) or name(s) in the visible window` +
    (concreteHit ? "" : " - nothing checkable before the tap"));

  // HASHTAGS
  if (tags.length > HASHTAG_LIMIT) {
    add("HASHTAGS", "FAIL",
      `${tags.length} tags, over Instagram's cap of ${HASHTAG_LIMIT}. ` +
      "Tags past the fifth do not count and the block reads as old");
  } else if (tags.length === HASHTAG_LIMIT && filler.length) {
    add("HASHTAGS", "WARN",
      `${tags.length} tags, at the cap, and ${filler.length} of them generic. Spend the five on topics`);
  } else if (filler.length) {
    add("HASHTAGS", "WARN",
      `${tags.length} tags, ${filler.length} of them generic ` +
      `(${filler.slice(0, 3).join(", ")}). Those describe nothing`);
  } else {
    add("HASHTAGS", "PASS", `${tags.length} tag(s)` + (tags.length ? `: ${tags.join(" ")}` : ""));
  }

  // TAG PLACEMENT
  if (!tags.length) {
    add("TAG PLACEMENT", "PASS", "no tags to place");
  } else if (tags.some((t) => reSearch(new RegExp("(?:^|\\s)" + reEscape(t) + "\\b"), windowStr))) {
    add("TAG PLACEMENT", "WARN",
      "a hashtag is inside the visible window, spending feed space on a label");
  } else {
    add("TAG PLACEMENT", "PASS", "tags are below the fold");
  }

  // LINKS
  add("LINKS", links.length ? "WARN" : "PASS",
    links.length
      ? `${links.length} link(s) in the caption, and captions are not clickable. Move it to the bio or the DM`
      : "no dead links in the body");

  // ONE ASK
  if (asks.length === 1) {
    add("ONE ASK", "PASS", `one call to action: ${asks[0]}`);
  } else if (!asks.length) {
    add("ONE ASK", "WARN", "no call to action. Decide what this post is for");
  } else {
    add("ONE ASK", "WARN", `${asks.length} asks (${asks.join(", ")}). Two asks is the same as none`);
  }

  // EMOJI
  const density = (emoji.length * 100) / Math.max(chars, 1);
  add("EMOJI", density > 4 ? "WARN" : "PASS",
    `${emoji.length} emoji, ${fmt1(density)} per 100 characters` +
    (density > 4 ? " - reads as decoration" : ""));

  // SEARCH TERMS
  if (keywords.length) {
    const low = stripped.toLowerCase();
    const winLow = windowStr.toLowerCase();
    const found = keywords.filter((k) => low.includes(k.toLowerCase()));
    const missing = keywords.filter((k) => !low.includes(k.toLowerCase()));
    const inWindow = found.filter((k) => winLow.includes(k.toLowerCase()));
    const status = !missing.length ? "PASS" : (found.length ? "WARN" : "FAIL");
    add("SEARCH TERMS", status,
      `${found.length}/${keywords.length} present` +
      (found.length ? `, ${inWindow.length} in the visible window` : "") +
      (missing.length ? `. Missing: ${missing.join(", ")}` : ""));
  }

  const fails = checks.filter((c) => c.estado === "FAIL").length;
  const warns = checks.filter((c) => c.estado === "WARN").length;
  const veredicto = fails ? "FIX" : (warns ? "REVIEW" : "READY");

  return {
    ventana: windowStr,          // la previsualizacion del feed (string)
    visible: cpLen(windowStr),   // numero de caracteres visibles
    truncated,                   // si corta (chars > cut) -> donde corta
    characters: chars,
    limit: LIMIT,
    truncate_at: cut,
    first_line_chars: flLen,
    hashtags: tags,
    mentions,
    links,
    emoji: emoji.length,
    asks,
    checks,
    veredicto,
  };
}

export default lintarCaption;
