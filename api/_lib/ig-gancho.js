// gancho.mjs
// Puerto fiel en JavaScript puro (solo stdlib de Node, sin dependencias, sin red)
// de skills/ig-reel/hookscore.py y de la clasificacion por hooks.json.
//
// Replica EXACTA de hookscore.py: las 5 comprobaciones, los DEALBREAKERS, y
//   overall = mean(scores)*0.6 + min(scores)*0.4 - flags*15, clamp 0..100,
//   redondeo a 1 decimal en score.
//
// No es TypeScript: sin anotaciones de tipo.

// ---------------------------------------------------------------------------
// Expresiones regulares (equivalentes a las de Python)
// ---------------------------------------------------------------------------

// WORD_RE = re.compile(r"[A-Za-z0-9$%'’-]+")
// CAPA ES: añadidas las letras acentuadas y la ñ para que el español tokenice
// bien ("tú", "años", "déjate"). El inglés no las lleva, así que los vectores
// verificados no cambian.
const WORD_RE = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9$%'’-]+/g;

// NUMBER_RE (re.IGNORECASE). Las piezas con comentarios en Python son solo
// concatenacion de strings; el patron efectivo es este:
const NUMBER_SRC =
  String.raw`\$\s?\d[\d,]*(?:\.\d+)?` +
  String.raw`|\b\d[\d,]*(?:\.\d+)?\s?` +
  String.raw`(?:%|k\b|x\b|hrs?\b|hours?\b|mins?\b|minutes?\b` +
  String.raw`|days?\b|weeks?\b|months?\b|years?\b)?`;
const NUMBER_RE_G = new RegExp(NUMBER_SRC, "gi");
const NUMBER_RE_Y = new RegExp(NUMBER_SRC, "iy"); // para re.match (ancla al inicio)

// PROPER_RE = re.compile(r"(?<!^)\b[A-Z][a-z]{2,}\b")  (SIN IGNORECASE)
const PROPER_SRC = String.raw`(?<!^)\b[A-Z][a-z]{2,}\b`;
const PROPER_RE_G = new RegExp(PROPER_SRC, "g");
const PROPER_RE_Y = new RegExp(PROPER_SRC, "y"); // para re.match

// HASHTAG_RE = re.compile(r"(?:^|\s)#\w+")
const HASHTAG_RE = /(?:^|\s)#\w+/;

// EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")  (☀=U+2600, ➿=U+27BF)
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}☀-➿]/u;

const SPOKEN_NUMBERS = new Set([
  "zero", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty",
  "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
  "billion", "dozen", "half", "twice", "triple",
  // CAPA ES (sin "uno/un/primero": son relleno más que cantidad, como en inglés)
  "cero", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "quince", "veinte", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa", "cien", "ciento", "mil", "millón",
  "millones", "docena", "mitad", "doble", "triple",
]);
const MONEY_WORDS = new Set([
  "dollars", "dollar", "bucks", "grand", "percent", "cents",
  "millionaire", "billionaire", "revenue", "profit", "salary", "rent",
  // CAPA ES
  "euros", "euro", "dólares", "dólar", "pavos", "céntimos", "facturación",
  "facturo", "ingresos", "beneficio", "beneficios", "sueldo", "salario",
  "alquiler", "millonario", "millonaria",
]);
const STAKES = new Set([
  "stop", "never", "wrong", "mistake", "mistakes", "lost", "lose", "losing",
  "cost", "costs", "broke", "broken", "failed", "failure", "fail", "nobody",
  "no", "not", "don't", "dont", "doesn't", "didn't", "can't", "won't",
  "quit", "quitting", "fired", "deleted", "delete", "killed", "kills", "kill",
  "replaced", "replaces", "cut", "beat", "free", "paid", "charged", "hired",
  "saved", "first",
  "banned", "illegal", "worst", "hate", "hated", "wasted", "waste", "scam",
  "lie", "lied", "lying", "truth", "secret", "hidden", "stole", "stolen",
  "before", "until", "instead", "but", "except", "unless", "problem",
  "risk", "danger", "warning", "regret", "wish", "should", "shouldn't",
  "still", "already", "only", "without", "versus", "vs", "actually",
  // CAPA ES
  "deja", "dejes", "nunca", "jamás", "error", "errores", "perdí", "perder",
  "perdiendo", "pierdes", "cuesta", "costó", "roto", "rota", "fracaso",
  "fallé", "fallar", "nadie", "sin", "borra", "borré", "borrar", "despedido",
  "despidieron", "reemplaza", "gratis", "pagado", "cobré", "cobran", "ahorré",
  "ahorra", "prohibido", "ilegal", "peor", "odio", "odié", "desperdicié",
  "estafa", "mentira", "mentí", "verdad", "secreto", "oculto", "robé",
  "robaron", "antes", "hasta", "problema", "riesgo", "peligro", "arrepiento",
  "debería", "deberías", "todavía", "contra",
]);
const WEAK_OPENERS = [
  "so", "ok", "okay", "hey", "hi", "hello", "guys", "yo", "alright",
  "welcome", "today", "basically", "honestly", "look", "listen", "um",
  "just", "let", "lets", "let's", "i wanted", "i want", "one of",
  "have you", "did you", "do you", "are you", "in this", "in today",
  "the thing", "a lot", "there is", "there are", "this is", "it is",
  "as a", "when it", "if you've", "you know",
  // CAPA ES: saludos y relleno que gastan el primer segundo sin decir nada
  "hola", "buenas", "bienvenidos", "bienvenido", "oye", "bueno", "vale",
  "básicamente", "sinceramente", "hoy", "en este", "os voy", "te voy",
  "quería", "una de", "esto es", "es que", "a ver", "pues", "mira que",
];
const IMPERATIVES = new Set([
  "stop", "steal", "copy", "delete", "try", "watch", "read", "save",
  "use", "build", "make", "write", "send", "take", "start", "quit",
  "never", "always", "don't", "dont", "do", "put", "run", "check",
  // CAPA ES
  "deja", "para", "roba", "copia", "borra", "prueba", "mira", "lee",
  "guarda", "usa", "construye", "haz", "escribe", "manda", "envía", "coge",
  "empieza", "pon", "corre", "revisa", "apunta", "escucha", "aprende",
]);

const DEALBREAKERS = [
  [/^\s*(?:stop scrolling|don'?t scroll)/i,
    'Opens with "stop scrolling". Asking for attention proves you have not earned it.'],
  [/\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b/i,
    "Video preamble. Delete it and open on the payoff."],
  [/^\s*(?:hey |hi |what'?s up |welcome )/i,
    "Greeting. Nobody came to the feed to be greeted."],
  [HASHTAG_RE,
    "Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere."],
  [EMOJI_RE,
    "Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both."],
  // CAPA ES
  [/^\s*(?:deja de deslizar|no sigas deslizando|para de deslizar|no deslices|no te vayas)/i,
    'Abre con "deja de deslizar". Pedir atención demuestra que no te la has ganado.'],
  [/\b(?:en (?:este|el) (?:vídeo|video|reel)|(?:os|te) voy a (?:enseñar|mostrar|contar|explicar)|hoy (?:os|te) (?:enseño|cuento|explico))\b/i,
    "Preámbulo de vídeo. Bórralo y abre con lo bueno."],
  [/^\s*(?:hola|buenas|qué tal|que tal|qué pasa|que pasa|bienvenid)/i,
    "Saludo. Nadie ha venido al feed a que lo saluden."],
];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function clamp(n) {
  return Math.max(0.0, Math.min(100.0, n));
}

function round1(x) {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

function mean(arr) {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

// re.match: intenta casar desde el inicio (no exige la cadena completa).
function reMatchSticky(stickyRe, str) {
  stickyRe.lastIndex = 0;
  return stickyRe.test(str);
}

// WORD_RE.findall tras quitar comas entre digitos ("$18,000" es una palabra).
function words(text) {
  const cleaned = text.replace(/(?<=\d),(?=\d)/g, "");
  return cleaned.match(WORD_RE) || [];
}

function stripQuotes(w) {
  // .strip("'’")
  return w.replace(/^['’]+/, "").replace(/['’]+$/, "");
}

// ---------------------------------------------------------------------------
// Las cinco comprobaciones
// ---------------------------------------------------------------------------

function checkLength(text) {
  const w = words(text);
  const n = w.length;
  const secs = n / 2.75;
  const chars = text.trim().length;
  let score;
  if (n >= 5 && n <= 12) {
    score = 100.0;
  } else if (n < 5) {
    score = clamp(100 - (5 - n) * 20);
  } else {
    score = clamp(100 - (n - 12) * 11);
  }
  if (chars > 60) score -= 12;
  return [clamp(score), `${n} words, ${chars} chars, ~${secs.toFixed(1)}s spoken (want 5-12 words)`];
}

function checkSpecificity(text) {
  const nums = (text.match(NUMBER_RE_G) || [])
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const propers = new Set(text.match(PROPER_RE_G) || []);
  const low = words(text).map((w) => stripQuotes(w.toLowerCase()));
  const spoken = low.filter((w) => SPOKEN_NUMBERS.has(w) || MONEY_WORDS.has(w));
  const hits = nums.length + propers.size + spoken.length;
  const score = hits === 0 ? 15.0 : clamp(45 + hits * 30);
  const found = [
    ...nums.slice(0, 2),
    ...[...propers].sort().slice(0, 2),
    ...spoken.slice(0, 2),
  ].join(", ");
  const detail = `${hits} concrete marker(s)` +
    (found ? `: ${found}` : " - no number, no name, nothing checkable");
  return [score, detail];
}

function checkStakes(text) {
  const w = words(text).map((x) => stripQuotes(x.toLowerCase()));
  const hits = w.filter((x) => STAKES.has(x));
  const markers = [...new Set(hits)].sort();
  if (/\$\s?\d/.test(text)) markers.push("a price");
  const n = markers.length;
  let score;
  if (n === 0) score = 20.0;
  else if (n === 1) score = 70.0;
  else score = 100.0;
  const detail = `${n} tension marker(s)` +
    (markers.length ? `: ${markers.slice(0, 4).join(", ")}` : " - nothing is at stake in this line");
  return [clamp(score), detail];
}

function checkFrontload(text) {
  const w = words(text);
  if (w.length === 0) return [0.0, "empty"];
  const low = w.map((x) => stripQuotes(x.toLowerCase()));
  const opener = low.slice(0, 2).join(" ");
  let penalty = 0;
  let hitOpener = null;
  for (const weak of WEAK_OPENERS) {
    if (opener.startsWith(weak) || low[0] === weak) {
      penalty = 30;
      hitOpener = weak;
      break;
    }
  }
  let payload = null;
  for (let i = 0; i < low.length; i++) {
    const token = low[i];
    if (
      STAKES.has(token) ||
      SPOKEN_NUMBERS.has(token) ||
      MONEY_WORDS.has(token) ||
      reMatchSticky(NUMBER_RE_Y, w[i]) ||
      (i && reMatchSticky(PROPER_RE_Y, w[i]))
    ) {
      payload = i;
      break;
    }
  }
  let base;
  let where;
  if (payload === null) {
    base = 30.0;
    where = "no payload word anywhere in the line";
  } else if (payload <= 3) {
    base = 100.0;
    where = `payload at word ${payload + 1}`;
  } else if (payload <= 6) {
    base = 70.0;
    where = `payload at word ${payload + 1}, could move forward`;
  } else {
    base = 40.0;
    where = `payload at word ${payload + 1}, too late`;
  }
  const detail = where + (hitOpener ? `; weak opener "${hitOpener}"` : "");
  return [clamp(base - penalty), detail];
}

// CAPA ES: segunda y primera persona en español, por token (robusto con tildes,
// donde \b de JS falla). "tú/tu/te/ti..." = le habla al espectador; "yo/mi/me..."
// = primera persona sin nombrar a nadie.
const DIR2_ES = new Set([
  "tú", "tu", "te", "ti", "tuyo", "tuya", "tuyos", "tuyas", "contigo",
  "vosotros", "vosotras", "vuestro", "vuestra", "usted", "ustedes",
]);
const DIR1_ES = new Set([
  "yo", "mi", "mí", "me", "nosotros", "nosotras", "nuestro", "nuestra", "conmigo",
]);

function checkAddress(text) {
  const low = text.toLowerCase();
  const w = words(text).map((x) => stripQuotes(x.toLowerCase()));
  if (/\b(you|your|you're|youre|yourself)\b/.test(low) || w.some((x) => DIR2_ES.has(x))) {
    return [100.0, "speaks to the viewer"];
  }
  if (w.length && IMPERATIVES.has(w[0])) {
    return [90.0, `imperative opener ("${w[0]}")`];
  }
  if (/\b(i|my|me|we|our)\b/.test(low) || w.some((x) => DIR1_ES.has(x))) {
    return [70.0, "first person, no viewer named"];
  }
  return [35.0, "third person, nobody in the room"];
}

const CHECKS = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"];

function run(text) {
  const results = {
    LENGTH: checkLength(text),
    SPECIFICITY: checkSpecificity(text),
    STAKES: checkStakes(text),
    FRONTLOAD: checkFrontload(text),
    ADDRESS: checkAddress(text),
  };
  const flags = DEALBREAKERS
    .filter(([pattern]) => pattern.test(text))
    .map(([, msg]) => msg);
  const scores = CHECKS.map((c) => results[c][0]);
  let overall = mean(scores) * 0.6 + Math.min(...scores) * 0.4 - flags.length * 15;
  overall = clamp(overall);
  const verdict =
    overall >= 70 && Math.min(...scores) >= 55 && flags.length === 0
      ? "STRONG"
      : overall >= 50
      ? "OK"
      : "WEAK";
  return { results, overall, verdict, flags };
}

// min(CHECKS, key=...) en Python devuelve el PRIMER minimo segun el orden de CHECKS.
function weakestOf(results) {
  let best = CHECKS[0];
  let bestScore = results[CHECKS[0]][0];
  for (const c of CHECKS) {
    if (results[c][0] < bestScore) {
      bestScore = results[c][0];
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// API publica: puntuarGancho
// ---------------------------------------------------------------------------

export function puntuarGancho(texto) {
  const { results, overall, verdict, flags } = run(texto);
  const checks = {};
  for (const c of CHECKS) {
    checks[c] = { score: round1(results[c][0]), detail: results[c][1] };
  }
  return {
    checks,
    weakest: weakestOf(results),
    flags,
    score: round1(overall),
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Formulas de hooks.json + clasificacion (classify_order, mas especifico primero)
// ---------------------------------------------------------------------------

// Cada formula: { clave (=id), id, nombre (=name), match (RegExp, case-insensitive) }
export const FORMULAS_GANCHO = [
  { clave: 1, id: 1, nombre: "Cost Confession",
    match: /\$\s?\d[\d,]*\s+(?:is|was) what\b|\bcost (?:me|us|him|her|them)\b|\blost\b[^.!?]{0,20}\$\s?\d/i },
  { clave: 2, id: 2, nombre: "Negative Command",
    match: /^\s*(?:stop|quit|never|don'?t|dont|please)\b[^.!?]{0,30}\b(?:do|be|make|buy|use|start|say|post|send|take|charge)?\b|\b(?:do not|don'?t|dont|never) (?:do|be|make|buy|use|start|say|post|take)\b|\bquit your\b/i },
  { clave: 3, id: 3, nombre: "Nobody Tells You",
    match: /\b(?:nobody|no one|nobody ever)\s+(?:ever\s+)?(?:tells|told|talks|talked|says|said|mentions|teaches)\b|\bwhat (?:nobody|no one) (?:tells|says)\b/i },
  { clave: 4, id: 4, nombre: "The Replacement",
    match: /\breplaced?\b[^.!?]*\$\s?\d|\$\s?\d[^.!?]*\breplaced?\b|\binstead of (?:paying|hiring)\b/i },
  { clave: 5, id: 5, nombre: "Time Collapse",
    match: /\bused to take\b|\bnow (?:it )?(?:only )?takes?\b|\btakes? (?:me )?\d+\s*(?:sec|second|min|minute|hour|hr)/i },
  { clave: 6, id: 6, nombre: "The Receipt",
    match: /\bi\s+\w+(?:ed)?\s+[^.!?]{0,30}\bfor\s+\d+\s+(?:days?|weeks?|months?|years?)\b|\bhere (?:are|is) (?:the|my)\b[^.!?]*\bnumbers\b|\bwe(?:'ll| will)? do \$\s?\d/i },
  { clave: 7, id: 7, nombre: "Wrong Way, Right Way",
    match: /\b(?:big(?:gest)?|common|the) mistake\b|\bmistake (?:that|people|i)\b|\byou'?(?:re| are) doing\b[^.!?]*\bwrong\b|\bdoing (?:it|this) wrong\b/i },
  { clave: 8, id: 8, nombre: "Insider Leak",
    match: /\bi (?:spent|worked|ran|was|have been)\b[^.!?]*\b\d+\s*\+?\s*years?\b|\bwe never (?:told|said|showed)\b|\bnobody (?:puts|tells you about)\b|\bi (?:sell|sold|run)\b[^.!?]*\$\s?\d/i },
  { clave: 9, id: 9, nombre: "The Steal",
    match: /^\s*steal\b|\bsteal (?:this|these|my)\b|^\s*(?:here'?s|this is) (?:the|my) (?:exact|literal)\b/i },
  { clave: 10, id: 10, nombre: "If This, Then Watch",
    match: /^\s*if (?:you|i|we|your|my|they)\b/i },
  { clave: 11, id: 11, nombre: "Numbered With A Favourite",
    match: /^\s*(?:here are\s+)?\d+\s+\w+|\bnumber \d+\b|\b(?:three|four|five|seven|ten)\s+\w+\s+(?:every|that|you)\b/i },
  { clave: 12, id: 12, nombre: "The Objection",
    match: /^\s*["“'][^"”']{5,120}["”'][,.]?\s*(?:fine|ok|okay|sure|right|here)/i },
  { clave: 13, id: 13, nombre: "Before And After, On Screen",
    match: /\b(?:this|that) was\b[^.!?]*[.!?]\s*(?:this|that) is\b|\bbefore\b[^.!?]*\bafter\b|\bi (?:look|looked) back at\b/i },
  { clave: 14, id: 14, nombre: "The Callout",
    match: /^\s*(?:every|all|any)\s+\w+|^\s*[a-z][\w ]{2,28}(?:ers|ists|ors|ants)\b\s*[,:]|^\s*for (?:viewers|people|anyone|those|everyone)\b|^\s*(?:attention|listen up)\b/i },
  { clave: 15, id: 15, nombre: "The Flop Record",
    match: /\bmy first\s+\d+\b|\bfirst\s+\d+\s+(?:reels?|videos?|posts?|clients?|months?)\b/i },
  { clave: 16, id: 16, nombre: "The Verbatim Question",
    match: /^\s*["“']?(?:how|what|what'?s|why|when|where|who|which|can|should|do|does|did|is|are|have you|would you)\b[^?]{3,110}\?/i },
  { clave: 17, id: 17, nombre: "Head To Head",
    match: /\b(?:vs\.?|versus)\b|\bdifferences? between\b|\b(?:a|the) or (?:b|the)\b/i },
  { clave: 18, id: 18, nombre: "Cold Open Demo",
    match: /^\s*watch (?:what|this|me)\b|^\s*(?:let me|lemme) show you\b|^\s*repeat after me\b/i },
  { clave: 19, id: 19, nombre: "The Deadline",
    match: /\bbefore (?:you|it|they|the)\b[^.!?]*\b(?:change|changes|end|ends|close|closes|expires|goes)\b|\bchanges on\b|\bby 20\d\d\b/i },
  { clave: 20, id: 20, nombre: "Permission",
    match: /\byou (?:do not|don'?t|dont) need\b|\bstop (?:trying to|worrying about)\b/i },
  { clave: 21, id: 21, nombre: "Mid-Sentence Start",
    match: /^\s*(?:\.\.\.|…)|^\s*(?:and (?:that'?s|that is|then) when|so (?:he|she|they) (?:said|asked))\b|^\s*(?:uh|um)\b/i },
  { clave: 22, id: 22, nombre: "Contrarian Flip",
    match: /^\s*[A-Za-z][\w' ]{2,34}\b(?:finish|finishes|win|wins|lose|loses|beats?|is|are)\s+(?:first|last|dead|wrong|right|better|overrated|underrated)\b/i },
  { clave: 23, id: 23, nombre: "The Statistic",
    match: /^\s*\d[\d,.]*\s?%|\b\d[\d,.]*\s?%\s+of\b/i },
  { clave: 24, id: 24, nombre: "The Reveal",
    match: /^\s*(?:so,?\s+)?(?:this|these|here) (?:is|are)\s+(?:the\s+)?(?:new|my new)\b|^\s*(?:so,?\s+)?this (?:new|tiny|little)\b|^\s*this \w+ has (?:the|a)\b/i },
  { clave: 25, id: 25, nombre: "Someone Else's Result",
    match: /\bthere (?:was|is) (?:one|a|this)\b|\b(?:one|a) (?:guy|girl|creator|student|founder|kid|client|friend) (?:i know |who |that )(?:\w+ed|grew|made|built|went|took|got|hit)\b|\bwe had a new\b/i },
  { clave: 26, id: 26, nombre: "The Superlative",
    match: /^\s*(?:the\s+)?(?:fastest|quickest|best|worst|biggest|greatest|easiest|hardest|only|number one|#1|most important)\s+\w+|\bthe (?:fastest|best|worst|biggest|greatest|only) way to\b/i },
];

// classify_order de hooks.json (mas especifico primero, case-insensitive).
const CLASSIFY_ORDER = [
  1, 23, 5, 4, 3, 15, 20, 7, 9, 26, 25, 24, 18, 17, 8, 6, 16, 12, 10, 2, 13, 19, 21, 22, 11, 14,
];

const _BY_ID = new Map(FORMULAS_GANCHO.map((f) => [f.id, f]));

export function clasificaGancho(texto) {
  for (const id of CLASSIFY_ORDER) {
    const f = _BY_ID.get(id);
    if (f && f.match.test(texto)) {
      return { clave: f.clave, nombre: f.nombre };
    }
  }
  return null; // abstencion
}

export default { puntuarGancho, FORMULAS_GANCHO, clasificaGancho };
