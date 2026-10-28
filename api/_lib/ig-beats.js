// beats.mjs - port fiel de skills/ig-reel/beats.py a JavaScript puro (solo stdlib de Node).
//
// Convierte un guion de Reel en un "beat sheet" cronometrado: estima los segundos
// de cada linea a ~165 wpm, apila los timecodes y marca los cuatro problemas que
// matan un Reel en el montaje (hook > 3s, un beat demasiado largo, una racha de
// lineas sin nada concreto, y que la ultima linea no cierre el loop con la primera).
//
// Mantiene las MISMAS formulas y el MISMO redondeo que el Python original.

// --- Constantes (equivalentes a las del beats.py) -------------------------
const WPM_DEFAULT = 165;
const HOOK_WINDOW = 3.0; // segundos. Pasado esto, el pulgar ya ha decidido.
const MAX_BEAT = 4.0;    // segundos en una sola idea sin cambio en pantalla.
const ABSTRACT_RUN = 3;  // beats seguidos sin nada comprobable.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for",
  "with", "that", "this", "it", "is", "are", "was", "were", "be", "been",
  "you", "your", "i", "my", "me", "we", "our", "they", "them", "he", "she",
  "so", "just", "not", "no", "do", "did", "does", "have", "has", "had",
  "will", "can", "at", "as", "by", "from", "out", "up", "off", "one", "all",
]);

// Regex: se reutilizan las MISMAS expresiones que el Python (ASCII \b, flags g/m).
const WORD_RE = /[A-Za-z0-9$%'’-]+/g;
const DIGIT_COMMA_RE = /(?<=\d),(?=\d)/g;
const SENT_RE = /[^.!?]+[.!?]*/g;
const CONCRETE_RE = /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm;
const PRETTY_RE = /(\d)(?=(\d{3})+$)/g;

// --- Helpers de redondeo (replican round() y los formatos de Python) ------

// round() de Python 3: redondeo a par (banker's rounding).
function pyRound(x, nd) {
  const m = Math.pow(10, nd);
  const y = x * m;
  const f = Math.floor(y);
  const diff = y - f;
  const eps = 1e-9;
  let r;
  if (Math.abs(diff - 0.5) < eps) {
    r = (f % 2 === 0) ? f : f + 1; // mitad -> al par
  } else {
    r = Math.round(y);
  }
  return r / m;
}

const round2 = (x) => pyRound(x, 2);

// Equivalente a f"{x:.Nf}" (redondeo a par y N decimales fijos).
function fmt(x, nd) {
  return pyRound(x, nd).toFixed(nd);
}

// int() de Python: trunca hacia cero.
const toInt = (x) => Math.trunc(x);

// --- Funciones base (port de words / pretty / tc) -------------------------

function words(text) {
  const cleaned = text.replace(DIGIT_COMMA_RE, "");
  return cleaned.match(WORD_RE) || [];
}

function findall(re, text) {
  return text.match(re) || [];
}

function pretty(token) {
  return token.replace(PRETTY_RE, "$1,");
}

// f"{int(m)}:{s:04.1f}"  -> p.ej. "0:05.3"
function tc(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  let str = fmt(s, 1); // 1 decimal
  while (str.length < 4) str = "0" + str; // ancho minimo 4, relleno con ceros
  return `${m}:${str}`;
}

// --- split_beats ----------------------------------------------------------

function splitBeats(raw, wps) {
  const beats = [];
  const lines = raw.split(/\r\n|\r|\n/).map((l) => l.trim());
  for (const line of lines) {
    if (!line) continue;
    if (words(line).length / wps <= MAX_BEAT * 1.5) {
      beats.push(line);
      continue;
    }
    // Parrafo largo: cortar por fin de frase para que los tiempos signifiquen algo.
    const parts = findall(SENT_RE, line)
      .map((p) => p.trim())
      .filter((p) => p);
    let buf = "";
    for (const part of parts) {
      const candidate = (buf + " " + part).trim();
      if (buf && words(candidate).length / wps > MAX_BEAT) {
        beats.push(buf);
        buf = part;
      } else {
        buf = candidate;
      }
    }
    if (buf) beats.push(buf);
  }
  return beats;
}

// --- analyse (nucleo) -----------------------------------------------------

function analyse(raw, wpm = WPM_DEFAULT, target = null) {
  const wps = wpm / 60.0;
  const beats = splitBeats(raw, wps);
  if (beats.length === 0) return null;

  const rows = [];
  let clock = 0.0;
  beats.forEach((text, i) => {
    const n = words(text).length;
    const dur = n / wps;
    rows.push({
      n: i + 1,
      start: round2(clock),
      dur: round2(dur),
      words: n,
      text,
      concrete: findall(CONCRETE_RE, text).length,
      label: "",
      flags: [],
    });
    clock += dur;
  });
  const total = clock;

  // Etiquetar las posiciones estructurales de un Reel.
  for (const r of rows) {
    if (r.n === 1 || r.start + r.dur <= HOOK_WINDOW) {
      r.label = "HOOK";
    }
  }
  const lastRow = rows[rows.length - 1];
  lastRow.label = lastRow.label !== "HOOK" ? "CTA" : "HOOK/CTA";
  const half = total / 2;
  for (const r of rows) {
    if (!r.label && r.start <= half && half < r.start + r.dur) {
      r.label = "MID";
    }
  }

  const notes = [];
  if (rows[0].dur > HOOK_WINDOW) {
    rows[0].flags.push(`hook runs ${fmt(rows[0].dur, 1)}s, past the ${fmt(HOOK_WINDOW, 0)}s mark`);
    notes.push(
      `Beat 1 takes ${fmt(rows[0].dur, 1)}s to say. Cut it to ` +
      `${toInt(HOOK_WINDOW * wps)} words or fewer, or the hook lands after ` +
      "the decision has been made."
    );
  }
  if (rows[0].concrete === 0) {
    notes.push(
      "Beat 1 has no number and no name in it. Hooks without something " +
      "checkable are the ones that get scrolled."
    );
  }

  for (const r of rows) {
    if (r.dur > MAX_BEAT) r.flags.push(`${fmt(r.dur, 1)}s on one beat`);
  }
  const longBeats = rows.filter((r) => r.dur > MAX_BEAT).map((r) => r.n);
  if (longBeats.length) {
    notes.push(
      `Beat(s) ${longBeats.join(", ")} run past ${fmt(MAX_BEAT, 0)}s. ` +
      "Either split the line or change what is on screen inside it. " +
      "A static frame is where people leave."
    );
  }

  let run = 0;
  let start = null;
  for (const r of rows) {
    if (r.concrete === 0) {
      run += 1;
      start = start !== null ? start : r.n;
      if (run === ABSTRACT_RUN) {
        notes.push(
          `Beats ${start}-${r.n} have nothing concrete in them. ` +
          "Put a number, a name or a price in one of them."
        );
      }
    } else {
      run = 0;
      start = null;
    }
  }

  // Loop: la ultima linea devuelve a la primera?
  const firstSet = new Set(
    words(rows[0].text).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w))
  );
  const lastSet = new Set(
    words(lastRow.text).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w))
  );
  const loop = [...firstSet].filter((w) => lastSet.has(w)).map(pretty).sort();
  if (loop.length) {
    notes.push(
      `Loops: the last beat repeats "${loop.slice(0, 3).join(", ")}" from the hook. ` +
      "Second watches are free reach."
    );
  } else {
    notes.push(
      "No loop. The last beat shares no word with the hook, so the video " +
      "ends flat. Echoing one word from beat 1 is the cheapest replay you get."
    );
  }

  if (target) {
    const delta = total - target;
    if (Math.abs(delta) <= target * 0.1) {
      notes.push(`Length is on target (${fmt(total, 1)}s against ${target}s).`);
    } else if (delta > 0) {
      notes.push(`${fmt(delta, 1)}s over target. Cut about ${toInt(delta * wps)} words.`);
    } else {
      notes.push(
        `${fmt(-delta, 1)}s under target. Either add ${toInt(-delta * wps)} words ` +
        "or shoot it short. Short is usually right."
      );
    }
  }

  return {
    wpm,
    target,
    total_seconds: round2(total),
    total_words: rows.reduce((acc, r) => acc + r.words, 0),
    beats: rows,
    notes,
  };
}

// --- API publica para HELM ------------------------------------------------

/**
 * cronometrar(texto, objetivoSeg = 30)
 * Devuelve el beat sheet en claves en espanol para que HELM lo consuma.
 */
export function cronometrar(texto, objetivoSeg = 30) {
  const a = analyse(texto, WPM_DEFAULT, objetivoSeg);
  if (!a) {
    return { beats: [], totalSeg: 0, palabras: 0, avisos: ["empty script"] };
  }
  return {
    beats: a.beats.map((r) => ({
      t: tc(r.start),
      dur: r.dur,
      etiqueta: r.label,
      linea: r.text,
    })),
    totalSeg: a.total_seconds,
    palabras: a.total_words,
    avisos: a.notes,
  };
}

// Rubrica de auditoria de perfil (contenido de ig-profile/rubric.json tal cual).
export const RUBRICA_PERFIL = {
  version: "1.0",
  total: 100,
  note: "Twelve items. Score each honestly - a generous score helps nobody. Most first-pass profiles land in the 30s and 40s. The weighting is deliberate: the name field, the first bio line and the pinned three are worth more than the photo, because they are what a stranger who arrived from one reel actually processes before deciding to follow.",
  items: [
    {
      id: "name_field",
      points: 12,
      full_marks: "The name field (30 characters, the bold line, not the handle) carries the name plus what they do in words people search: 'Dana Ruiz | Proposal templates'. This field is indexed by Instagram search and most accounts waste it on a name alone.",
      common_fail: "Just a name, or a name with an emoji.",
    },
    {
      id: "bio_first_line",
      points: 12,
      full_marks: "Line one names who this is for and what changes for them, in their words. Not a job title, not a list of adjectives, not three emoji separated by bars.",
      common_fail: "'Entrepreneur | Coffee lover | Dog dad'.",
    },
    {
      id: "bio_body",
      points: 8,
      full_marks: "The rest of the 150 characters carries one piece of proof or one specific offer, and reads as sentences rather than a pipe-separated list.",
      common_fail: "Keyword soup, or blank space.",
    },
    {
      id: "pinned_three",
      points: 10,
      full_marks: "Three posts pinned to the top of the grid, doing three different jobs: the best proof, the clearest explanation of the offer, and the best introduction to the person. Not the three highest-view posts by accident.",
      common_fail: "Nothing pinned, so the top of the grid is whatever was posted last.",
    },
    {
      id: "link",
      points: 8,
      full_marks: "One destination that matches what the bio just promised. Up to five links are allowed; more than two is a menu, and a menu converts worse than a door.",
      common_fail: "A link tree with eleven options, or no link at all.",
    },
    {
      id: "highlights",
      points: 8,
      full_marks: "Four to six highlights named for the questions a buyer actually asks: Pricing, Results, How it works, About. Covers consistent. Nothing older than a year sitting at the front.",
      common_fail: "'Random', 'Life', 'Faves', or 14 highlights in no order.",
    },
    {
      id: "grid_legibility",
      points: 8,
      full_marks: "The first nine covers are legible at thumbnail size and say what the account is about without a single tap. Reel covers are chosen deliberately, not left as frame one.",
      common_fail: "Nine covers of a face mid-word with no text.",
    },
    {
      id: "photo",
      points: 6,
      full_marks: "Face fills roughly 60% of a circle that renders at about 40 pixels. Eyes visible, shot in the last two years, background not competing.",
      common_fail: "A full-body shot, a logo for a personal brand, or a photo taken at arm's length in a dark room.",
    },
    {
      id: "handle",
      points: 6,
      full_marks: "Readable, sayable out loud, and the same handle as the other platforms. No stacked underscores or numbers standing in for letters.",
      common_fail: "A handle nobody can spell after hearing it once.",
    },
    {
      id: "category_contact",
      points: 6,
      full_marks: "Professional account with a category that matches the offer, and contact buttons that work. Email that is checked, not the one from 2019.",
      common_fail: "Personal account, so there are no insights and no contact button.",
    },
    {
      id: "recent_activity",
      points: 10,
      full_marks: "Posted in the last seven days and replied to comments on the most recent post. An account that last posted in March reads as closed.",
      common_fail: "A five-week gap, or a wall of unanswered comments.",
    },
    {
      id: "story_presence",
      points: 6,
      full_marks: "A story up right now, or at least most days. It is the difference between a profile and a person.",
      common_fail: "No ring, ever.",
    },
  ],
};
