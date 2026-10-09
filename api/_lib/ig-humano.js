// humano.mjs - puerto JavaScript puro (solo stdlib de Node, sin dependencias, sin red)
// de humanize.py + detect.py + slop.json (skills/ig-human).
//
// Exporta:
//   humanizar(texto) -> { limpio, cambios, marcados }
//   detectar(texto)  -> { ejes, score, veredicto }
//   detectar(antes, despues) -> idem, calculado sobre `despues`
//
// La lógica replica fielmente los scripts Python: mismos pasos, mismas
// expresiones regulares, misma ponderación (media*0.6 + min*0.4) y los
// mismos umbrales de veredicto.

// ----------------------------------------------------------------------------
// Lexicón embebido (slop.json, verbatim). Autocontenido: no se lee del disco.
// ----------------------------------------------------------------------------
const SLOP = JSON.parse("{\n  \"version\": \"1.0\",\n  \"note\": \"Lexicon used by humanize.py and detect.py. Replacements are plain-English and keep the sentence grammatical. The last block of each list is Instagram-specific: caption and voiceover slop that does not show up on other platforms. Edit freely - it is meant to be yours.\",\n  \"invisible\": [\n    {\n      \"cp\": \"U+200B\",\n      \"name\": \"ZERO WIDTH SPACE\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+200C\",\n      \"name\": \"ZERO WIDTH NON-JOINER\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+200D\",\n      \"name\": \"ZERO WIDTH JOINER\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+2060\",\n      \"name\": \"WORD JOINER\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+FEFF\",\n      \"name\": \"ZERO WIDTH NO-BREAK SPACE / BOM\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+00AD\",\n      \"name\": \"SOFT HYPHEN\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+180E\",\n      \"name\": \"MONGOLIAN VOWEL SEPARATOR\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+061C\",\n      \"name\": \"ARABIC LETTER MARK\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+200E\",\n      \"name\": \"LEFT-TO-RIGHT MARK\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+200F\",\n      \"name\": \"RIGHT-TO-LEFT MARK\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+E0000-U+E007F\",\n      \"name\": \"TAG CHARACTERS (invisible ASCII smuggling)\",\n      \"action\": \"delete\"\n    },\n    {\n      \"cp\": \"U+00A0\",\n      \"name\": \"NO-BREAK SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+202F\",\n      \"name\": \"NARROW NO-BREAK SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+2009\",\n      \"name\": \"THIN SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+2007\",\n      \"name\": \"FIGURE SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+2003\",\n      \"name\": \"EM SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+2002\",\n      \"name\": \"EN SPACE\",\n      \"action\": \"space\"\n    },\n    {\n      \"cp\": \"U+2063\",\n      \"name\": \"INVISIBLE SEPARATOR\",\n      \"action\": \"delete\"\n    }\n  ],\n  \"typographic\": [\n    {\n      \"from\": \"—\",\n      \"name\": \"EM DASH\",\n      \"to\": \", \"\n    },\n    {\n      \"from\": \"–\",\n      \"name\": \"EN DASH\",\n      \"to\": \"-\"\n    },\n    {\n      \"from\": \"‘\",\n      \"name\": \"LEFT SINGLE QUOTE\",\n      \"to\": \"'\"\n    },\n    {\n      \"from\": \"’\",\n      \"name\": \"RIGHT SINGLE QUOTE\",\n      \"to\": \"'\"\n    },\n    {\n      \"from\": \"“\",\n      \"name\": \"LEFT DOUBLE QUOTE\",\n      \"to\": \"\\\"\"\n    },\n    {\n      \"from\": \"”\",\n      \"name\": \"RIGHT DOUBLE QUOTE\",\n      \"to\": \"\\\"\"\n    },\n    {\n      \"from\": \"…\",\n      \"name\": \"HORIZONTAL ELLIPSIS\",\n      \"to\": \"...\"\n    },\n    {\n      \"from\": \"′\",\n      \"name\": \"PRIME\",\n      \"to\": \"'\"\n    },\n    {\n      \"from\": \"·\",\n      \"name\": \"MIDDLE DOT\",\n      \"to\": \"-\"\n    },\n    {\n      \"from\": \"•\",\n      \"name\": \"BULLET\",\n      \"to\": \"-\"\n    },\n    {\n      \"from\": \"→\",\n      \"name\": \"RIGHTWARDS ARROW\",\n      \"to\": \"->\"\n    }\n  ],\n  \"words\": [\n    {\n      \"find\": \"delve into\",\n      \"replace\": \"look at\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"delve\",\n      \"replace\": \"look\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"dive deep into\",\n      \"replace\": \"get into\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"deep dive\",\n      \"replace\": \"breakdown\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"leverage\",\n      \"replace\": \"use\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"leveraging\",\n      \"replace\": \"using\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"utilize\",\n      \"replace\": \"use\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"utilizing\",\n      \"replace\": \"using\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"harness\",\n      \"replace\": \"use\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"embark on\",\n      \"replace\": \"start\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"foster\",\n      \"replace\": \"build\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"facilitate\",\n      \"replace\": \"help\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"showcase\",\n      \"replace\": \"show\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"unlock\",\n      \"replace\": \"get\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"elevate\",\n      \"replace\": \"improve\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"streamline\",\n      \"replace\": \"simplify\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"spearhead\",\n      \"replace\": \"lead\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"underscore\",\n      \"replace\": \"show\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"underscores\",\n      \"replace\": \"shows\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"cultivate\",\n      \"replace\": \"build\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"amplify\",\n      \"replace\": \"boost\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"curate\",\n      \"replace\": \"pick\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"curated\",\n      \"replace\": \"picked\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"empower\",\n      \"replace\": \"let\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"revolutionize\",\n      \"replace\": \"change\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"transformative\",\n      \"replace\": \"big\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"robust\",\n      \"replace\": \"solid\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"seamless\",\n      \"replace\": \"clean\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"seamlessly\",\n      \"replace\": \"cleanly\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"pivotal\",\n      \"replace\": \"key\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"crucial\",\n      \"replace\": \"important\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"vital\",\n      \"replace\": \"important\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"comprehensive\",\n      \"replace\": \"complete\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"cutting-edge\",\n      \"replace\": \"new\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"game-changing\",\n      \"replace\": \"big\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"game-changer\",\n      \"replace\": \"big deal\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"groundbreaking\",\n      \"replace\": \"new\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"unparalleled\",\n      \"replace\": \"unmatched\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"invaluable\",\n      \"replace\": \"useful\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"meticulous\",\n      \"replace\": \"careful\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"meticulously\",\n      \"replace\": \"carefully\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"myriad of\",\n      \"replace\": \"many\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"myriad\",\n      \"replace\": \"many\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"multifaceted\",\n      \"replace\": \"complicated\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"holistic\",\n      \"replace\": \"whole\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"bespoke\",\n      \"replace\": \"custom\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"innovative\",\n      \"replace\": \"new\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"profound\",\n      \"replace\": \"big\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"remarkable\",\n      \"replace\": \"notable\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"compelling\",\n      \"replace\": \"convincing\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"tapestry\",\n      \"replace\": \"mix\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"realm\",\n      \"replace\": \"world\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"landscape\",\n      \"replace\": \"market\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"journey\",\n      \"replace\": \"process\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"testament to\",\n      \"replace\": \"proof of\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"cornerstone\",\n      \"replace\": \"base\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"beacon\",\n      \"replace\": \"signal\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"paradigm\",\n      \"replace\": \"model\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"synergy\",\n      \"replace\": \"overlap\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"ecosystem\",\n      \"replace\": \"system\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"treasure trove\",\n      \"replace\": \"pile\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"plethora of\",\n      \"replace\": \"lots of\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"plethora\",\n      \"replace\": \"lots\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"arsenal\",\n      \"replace\": \"set\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"north star\",\n      \"replace\": \"goal\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"moreover\",\n      \"replace\": \"also\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"furthermore\",\n      \"replace\": \"also\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"additionally\",\n      \"replace\": \"also\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"nevertheless\",\n      \"replace\": \"still\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"consequently\",\n      \"replace\": \"so\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"thus\",\n      \"replace\": \"so\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"hence\",\n      \"replace\": \"so\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"notably\",\n      \"replace\": \"\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"importantly\",\n      \"replace\": \"\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"ultimately\",\n      \"replace\": \"in the end\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"in essence\",\n      \"replace\": \"basically\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"in conclusion\",\n      \"replace\": \"so\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"when it comes to\",\n      \"replace\": \"with\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"in order to\",\n      \"replace\": \"to\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"a wide range of\",\n      \"replace\": \"many\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"it is worth noting that\",\n      \"replace\": \"note that\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"supercharge\",\n      \"replace\": \"speed up\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"skyrocket\",\n      \"replace\": \"raise\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"unleash\",\n      \"replace\": \"release\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"effortlessly\",\n      \"replace\": \"easily\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"captivating\",\n      \"replace\": \"interesting\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"stunning\",\n      \"replace\": \"good\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"breathtaking\",\n      \"replace\": \"striking\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"iconic\",\n      \"replace\": \"known\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"must-have\",\n      \"replace\": \"worth having\",\n      \"family\": \"adjectives\"\n    },\n    {\n      \"find\": \"no-brainer\",\n      \"replace\": \"obvious\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"hidden gem\",\n      \"replace\": \"good one\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"secret sauce\",\n      \"replace\": \"the actual method\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"ultimate guide\",\n      \"replace\": \"guide\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"level up\",\n      \"replace\": \"improve\",\n      \"family\": \"verbs\"\n    },\n    {\n      \"find\": \"hack\",\n      \"replace\": \"trick\",\n      \"family\": \"nouns\"\n    }\n  ],\n  \"phrases\": [\n    {\n      \"find\": \"in today's fast-paced world\",\n      \"replace\": \"right now\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"in today's digital age\",\n      \"replace\": \"right now\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"in the ever-evolving landscape of\",\n      \"replace\": \"in\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"in the ever-changing world of\",\n      \"replace\": \"in\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"let's face it\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"here's the thing\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"picture this\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"imagine a world where\",\n      \"replace\": \"imagine if\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"it's no secret that\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"we've all been there\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"let that sink in\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"the choice is yours\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"food for thought\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"the future is here\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"what are your thoughts?\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"drop a comment below\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"at the end of the day\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"needle-moving\",\n      \"replace\": \"useful\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"move the needle\",\n      \"replace\": \"make a difference\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"a testament to\",\n      \"replace\": \"proof of\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"had the opportunity to\",\n      \"replace\": \"got to\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"i am excited to announce\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"i'm thrilled to share\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"i am humbled to\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"without further ado\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"buckle up\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"the harsh truth is\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"spoiler alert\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"read that again\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"you're welcome\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"save this for later\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"who's with me\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"stop scrolling\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"don't scroll past this\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"in this video i'm going to show you\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"in today's video\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"watch till the end\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"you won't believe\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"nobody is talking about this\",\n      \"replace\": \"few people do this\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"no one is talking about this\",\n      \"replace\": \"few people do this\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"this changed everything\",\n      \"replace\": \"this worked\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"this is your sign to\",\n      \"replace\": \"\",\n      \"family\": \"openers\"\n    },\n    {\n      \"find\": \"little did i know\",\n      \"replace\": \"\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"fast forward to today\",\n      \"replace\": \"now\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"and just like that\",\n      \"replace\": \"\",\n      \"family\": \"connectives\"\n    },\n    {\n      \"find\": \"the rest is history\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"run don't walk\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"trust me on this one\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"don't sleep on this\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"follow for more\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"hit follow for more\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"double tap if\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"tag someone who needs this\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"let me know in the comments\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"share this with someone who needs it\",\n      \"replace\": \"\",\n      \"family\": \"closers\"\n    },\n    {\n      \"find\": \"the algorithm loves\",\n      \"replace\": \"Instagram pushes\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"beat the algorithm\",\n      \"replace\": \"get reach\",\n      \"family\": \"nouns\"\n    },\n    {\n      \"find\": \"go viral overnight\",\n      \"replace\": \"get reach\",\n      \"family\": \"nouns\"\n    }\n  ],\n  \"structures\": [\n    {\n      \"id\": \"not-just\",\n      \"regex\": \"(?i)\\\\bit'?s not (?:just|only) [^.!?\\\\n]{2,60}[,.] it'?s\\\\b\",\n      \"name\": \"\\\"It's not just X, it's Y\\\"\",\n      \"fix\": \"Say the one thing you actually mean. Delete the setup half.\"\n    },\n    {\n      \"id\": \"not-only\",\n      \"regex\": \"(?i)\\\\bnot only\\\\b[^.!?\\\\n]{2,80}\\\\bbut also\\\\b\",\n      \"name\": \"\\\"Not only X but also Y\\\"\",\n      \"fix\": \"Split into two sentences, or drop the weaker half.\"\n    },\n    {\n      \"id\": \"isnt-about\",\n      \"regex\": \"(?i)\\\\b(?:this|it) is(?:n'?t| not) about [^.!?\\\\n]{2,60}[.!] it'?s about\\\\b\",\n      \"name\": \"\\\"It isn't about X. It's about Y.\\\"\",\n      \"fix\": \"Lead with Y. The reversal is the tell.\"\n    },\n    {\n      \"id\": \"the-result\",\n      \"regex\": \"(?i)^\\\\s*(?:the result|the best part|the kicker|the catch)\\\\?\\\\s*$\",\n      \"name\": \"One-word rhetorical question line\",\n      \"fix\": \"Answer it inline instead of staging a reveal.\"\n    },\n    {\n      \"id\": \"heres-what\",\n      \"regex\": \"(?i)\\\\bhere'?s what (?:i|we) learned\\\\b\",\n      \"name\": \"\\\"Here's what I learned\\\"\",\n      \"fix\": \"State the lesson. Skip the announcement.\"\n    },\n    {\n      \"id\": \"triad\",\n      \"regex\": \"(?i)\\\\b\\\\w+, \\\\w+, and \\\\w+\\\\.\",\n      \"name\": \"Rule-of-three triad\",\n      \"fix\": \"Two items or four. Three is the model's default rhythm.\"\n    },\n    {\n      \"id\": \"rocket\",\n      \"regex\": \"[\\\\U0001F680\\\\U0001F525\\\\U0001F4A1\\\\u2728\\\\U0001F3AF]\",\n      \"name\": \"Rocket / fire / bulb / sparkle / dart emoji\",\n      \"fix\": \"One emoji max, and not one of these five.\"\n    },\n    {\n      \"id\": \"hashtag-wall\",\n      \"regex\": \"(?:#\\\\w+[ \\\\t]*){5,}\",\n      \"name\": \"Hashtag wall (5+)\",\n      \"fix\": \"Three hashtags. LinkedIn stopped rewarding the wall.\"\n    },\n    {\n      \"id\": \"as-an-ai\",\n      \"regex\": \"(?i)\\\\bas an ai\\\\b|\\\\bas a language model\\\\b\",\n      \"name\": \"Model self-reference\",\n      \"fix\": \"Delete the sentence.\"\n    },\n    {\n      \"id\": \"in-summary\",\n      \"regex\": \"(?i)^\\\\s*(?:in summary|to summarize|in conclusion)\\\\b\",\n      \"name\": \"Essay-closer opener\",\n      \"fix\": \"A post does not need a conclusion paragraph.\"\n    },\n    {\n      \"id\": \"engagement-bait\",\n      \"regex\": \"(?i)\\\\b(?:agree\\\\?|thoughts\\\\?|who else\\\\b|am i wrong\\\\?)\\\\s*$\",\n      \"name\": \"Reflex engagement bait\",\n      \"fix\": \"Ask a question only you could ask, about the specific thing above it.\"\n    },\n    {\n      \"id\": \"stop-scroll\",\n      \"regex\": \"(?im)^\\\\s*(?:stop scrolling|don'?t scroll|wait[,.]? don'?t scroll)\\\\b\",\n      \"name\": \"\\\"Stop scrolling\\\" opener\",\n      \"fix\": \"The scroll-stop has to be the claim itself. Asking for attention is the tell that you have not earned it.\"\n    },\n    {\n      \"id\": \"in-this-video\",\n      \"regex\": \"(?i)\\\\b(?:in (?:this|today'?s) (?:video|reel|post)|today i'?m going to show you|i'?m going to (?:show|teach) you how)\\\\b\",\n      \"name\": \"Video preamble (\\\"in this video I'm going to show you\\\")\",\n      \"fix\": \"Delete it and start at the payoff. The first two seconds decide the whole reel.\"\n    },\n    {\n      \"id\": \"emoji-bullets\",\n      \"regex\": \"(?m)^\\\\s*[\\\\U0001F300-\\\\U0001FAFF✅➡⬅✔✨]\\\\s*\\\\S\",\n      \"name\": \"Emoji bullet list\",\n      \"fix\": \"Use a hyphen or a line break. Emoji bullets are the single most template-looking thing in a caption.\"\n    },\n    {\n      \"id\": \"caps-shout\",\n      \"regex\": \"\\\\b[A-Z]{3,}\\\\b(?:\\\\s+\\\\b[A-Z]{3,}\\\\b){2,}\",\n      \"name\": \"Three or more shouted words in a row\",\n      \"fix\": \"Caps are a volume knob, not a highlighter. One word, at most.\"\n    },\n    {\n      \"id\": \"follow-bait\",\n      \"regex\": \"(?i)\\\\b(?:follow for more|tag someone who|double tap if|share this if|comment below if)\\\\b\",\n      \"name\": \"Reflex follow or tag bait\",\n      \"fix\": \"Ask for the one action this post actually earns. The generic ask trains the audience to ignore every ask.\"\n    }\n  ]\n}\n");

// CAPA ES: léxico de «slop» en español. Mismo formato {find,replace,family} que
// el inglés, así que pasa por la misma maquinaria de sustitución. (La limpieza
// de invisibles y la tipografía —em dash, comillas, puntos suspensivos— ya son
// agnósticas del idioma.) Ninguna entrada empieza ni acaba en letra acentuada,
// para que los \b de las fronteras de palabra casen bien.
SLOP.words.push(
  { find: "aprovechar", replace: "usar", family: "verbos" },
  { find: "aprovechando", replace: "usando", family: "verbos" },
  { find: "potenciar", replace: "mejorar", family: "verbos" },
  { find: "impulsar", replace: "subir", family: "verbos" },
  { find: "optimizar", replace: "mejorar", family: "verbos" },
  { find: "maximizar", replace: "subir", family: "verbos" },
  { find: "desbloquear", replace: "conseguir", family: "verbos" },
  { find: "revolucionar", replace: "cambiar", family: "verbos" },
  { find: "empoderar", replace: "permitir", family: "verbos" },
  { find: "fomentar", replace: "crear", family: "verbos" },
  { find: "profundizar", replace: "ver", family: "verbos" },
  { find: "robusto", replace: "sólido", family: "adjetivos" },
  { find: "integral", replace: "completo", family: "adjetivos" },
  { find: "holístico", replace: "completo", family: "adjetivos" },
  { find: "innovador", replace: "nuevo", family: "adjetivos" },
  { find: "disruptivo", replace: "nuevo", family: "adjetivos" },
  { find: "puntero", replace: "nuevo", family: "adjetivos" },
  { find: "cautivador", replace: "interesante", family: "adjetivos" },
  { find: "fascinante", replace: "interesante", family: "adjetivos" },
  { find: "asombroso", replace: "bueno", family: "adjetivos" },
  { find: "impresionante", replace: "bueno", family: "adjetivos" },
  { find: "crucial", replace: "importante", family: "adjetivos" },
  { find: "fundamental", replace: "clave", family: "adjetivos" },
);
SLOP.phrases.push(
  { find: "en el mundo actual", replace: "ahora", family: "aperturas" },
  { find: "en la era digital", replace: "ahora", family: "aperturas" },
  { find: "en el acelerado mundo de hoy", replace: "ahora", family: "aperturas" },
  { find: "déjame decirte", replace: "", family: "aperturas" },
  { find: "la cruda verdad es", replace: "", family: "aperturas" },
  { find: "no es ningún secreto que", replace: "", family: "aperturas" },
  { find: "deja de deslizar", replace: "", family: "aperturas" },
  { find: "no sigas deslizando", replace: "", family: "aperturas" },
  { find: "en el vídeo de hoy", replace: "", family: "aperturas" },
  { find: "no te lo vas a creer", replace: "", family: "aperturas" },
  { find: "sin más preámbulos", replace: "", family: "aperturas" },
  { find: "sígueme para más", replace: "", family: "cierres" },
  { find: "guarda esto para después", replace: "", family: "cierres" },
  { find: "etiqueta a alguien que", replace: "", family: "cierres" },
  { find: "comparte esto con alguien que", replace: "", family: "cierres" },
  { find: "al final del día", replace: "", family: "cierres" },
  { find: "en resumen", replace: "", family: "conectores" },
  { find: "cabe destacar que", replace: "nota que", family: "conectores" },
  { find: "es importante señalar que", replace: "", family: "conectores" },
  { find: "dicho esto", replace: "", family: "conectores" },
  { find: "esto lo cambió todo", replace: "esto funcionó", family: "aperturas" },
  { find: "el algoritmo premia", replace: "Instagram empuja", family: "nombres" },
);

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------
function splitWords(s) {
  const t = s.trim();
  return t === "" ? [] : t.split(/\s+/);
}

function occurrences(text, ch) {
  if (ch === "") return 0;
  return text.split(ch).length - 1;
}

function replaceAllStr(text, find, repl) {
  return text.split(find).join(repl);
}

function hex(n) {
  return n.toString(16).toUpperCase();
}

// 'U+200B' -> 0x200B ;  'U+E0000-U+E007F' -> [0xE0000, 0xE007F]
function parseCp(spec) {
  if (spec.includes("-")) {
    const [a, b] = spec.split("-");
    return [parseInt(a.slice(2), 16), parseInt(b.slice(2), 16)];
  }
  return parseInt(spec.slice(2), 16);
}

// Escapa un literal para incrustarlo en una regex (fuera de clase de caracteres),
// replicando el conjunto de re.escape de Python (que SÍ escapa el espacio).
// Luego quien lo use convierte el espacio escapado en \s+.
const PY_SPECIAL = new Set("()[]{}?*+-|^$\\.&~# \t\n\r\v\f".split(""));
function escapeLiteralPy(str) {
  let out = "";
  for (const ch of str) {
    if (ch === " ") {
      out += "\\s+"; // re.escape(' ') -> '\\ ', y humanize.py lo cambia por '\\s+'
    } else if (PY_SPECIAL.has(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

// Convierte una regex estilo Python (de slop.json "structures") a {source, flags}
// de JavaScript. Todas las de Python se compilan con re.MULTILINE.
function convertPyRegex(src) {
  let flags = new Set(["g", "m"]); // g para contar/sustituir; m = re.MULTILINE
  // bandera inline al principio: (?i), (?im), (?m), ...
  const m = src.match(/^\(\?([a-z]+)\)/);
  if (m) {
    for (const f of m[1]) flags.add(f);
    src = src.slice(m[0].length);
  }
  // \U0001F680 -> \u{1F680}
  let needU = false;
  src = src.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => {
    needU = true;
    return "\\u{" + hex(parseInt(h, 16)) + "}";
  });
  if (needU) flags.add("u");
  return { source: src, flags: [...flags].join("") };
}

function countMatches(text, src) {
  const { source, flags } = convertPyRegex(src);
  let re;
  try {
    re = new RegExp(source, flags);
  } catch (e) {
    return 0; // Python: except re.error -> se ignora la estructura
  }
  const found = text.match(re);
  return found ? found.length : 0;
}

// ----------------------------------------------------------------------------
// humanize.py
// ----------------------------------------------------------------------------
const URL_RE = /https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g;
const SENT_RE = /[^.!?\n]+[.!?]*/g;

function protectUrls(text) {
  const found = [];
  const out = text.replace(URL_RE, (m0) => {
    found.push(m0);
    return "\x00URL" + (found.length - 1) + "\x00";
  });
  return [out, found];
}

function restoreUrls(text, found) {
  for (let i = 0; i < found.length; i++) {
    text = replaceAllStr(text, "\x00URL" + i + "\x00", found[i]);
  }
  return text;
}

function passInvisible(text, lex) {
  const hits = [];
  for (const entry of lex.invisible) {
    const cp = parseCp(entry.cp);
    if (Array.isArray(cp)) {
      const pattern = new RegExp("[\\u{" + hex(cp[0]) + "}-\\u{" + hex(cp[1]) + "}]", "gu");
      const found = text.match(pattern);
      const n = found ? found.length : 0;
      if (n) {
        hits.push({ name: entry.cp + " " + entry.name, count: n, action: entry.action });
        text = text.replace(pattern, entry.action === "delete" ? "" : " ");
      }
    } else {
      const ch = String.fromCodePoint(cp);
      const n = occurrences(text, ch);
      if (n) {
        hits.push({ name: entry.cp + " " + entry.name, count: n, action: entry.action });
        text = replaceAllStr(text, ch, entry.action === "delete" ? "" : " ");
      }
    }
  }
  // Cualquier carácter de formato (categoría Unicode Cf) restante es invisible.
  const stray = text.match(/\p{Cf}/gu);
  if (stray && stray.length) {
    hits.push({ name: "other invisible format chars", count: stray.length, action: "delete" });
    text = text.replace(/\p{Cf}/gu, "");
  }
  return [text, hits];
}

function passTypographic(text, lex) {
  const hits = [];
  for (const entry of lex.typographic) {
    const ch = entry.from;
    const n = occurrences(text, ch);
    if (!n) continue;
    hits.push({ name: ch + " " + entry.name, count: n, to: entry.to.trim() || "(space)" });
    if (ch === "—") {
      // em dash: " word — word " y "word—word" colapsan a coma + espacio.
      text = text.replace(/\s*—\s*/g, ", ");
    } else if (ch === "–") {
      text = text.replace(/\s*–\s*(?=\d)/g, "-"); // 5–10 -> 5-10
      text = text.replace(/\s+–\s+/g, ", "); // usado como em dash
      text = replaceAllStr(text, "–", "-");
    } else {
      text = replaceAllStr(text, ch, entry.to);
    }
  }
  // Una coma insertada antes de otra puntuación se lee mal.
  text = text.replace(/,\s*([,.;:!?])/g, "$1");
  text = text.replace(/,\s*\n/g, "\n");
  return [text, hits];
}

function isUpperStr(s) {
  const hasCased = /[a-zA-Z]/.test(s);
  const hasLower = /[a-z]/.test(s);
  return hasCased && !hasLower;
}

function matchCase(src, repl) {
  if (!repl) return repl;
  if (isUpperStr(src) && src.length > 1) return repl.toUpperCase();
  if (/[A-Z]/.test(src[0])) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}

function passLexical(text, lex) {
  const hits = [];
  // Combinados: phrases + words, ordenados por longitud de "find" desc (estable).
  // Deduplicado por "find" (minúsculas) quedándose con el ÚLTIMO: así una entrada
  // en español gana al cognado inglés idéntico (p. ej. "crucial" -> "importante",
  // no "important"). El inglés no tiene finds repetidos, así que no le afecta.
  const porFind = new Map();
  for (const e of lex.phrases.concat(lex.words)) porFind.set(e.find.toLowerCase(), e);
  const combined = [...porFind.values()];
  const entries = combined
    .map((e, i) => [e, i])
    .sort((a, b) => b[0].find.length - a[0].find.length || a[1] - b[1])
    .map((p) => p[0]);

  for (const entry of entries) {
    const find = entry.find;
    const source = "\\b" + escapeLiteralPy(find) + "\\b";
    const pattern = new RegExp(source, "gi");
    const found = text.match(pattern);
    if (!found) continue;
    hits.push({
      find: find,
      replace: entry.replace || "(deleted)",
      count: found.length,
      family: entry.family,
    });
    text = text.replace(pattern, (m0) => matchCase(m0, entry.replace));
  }

  // Limpieza tras las supresiones.
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/gm, "");
  text = text.replace(/^[ \t](?=\S)/gm, ""); // un espacio dejado por una supresión
  text = text.replace(/\s+([,.;:!?])/g, "$1");
  text = text.replace(/,\s*([,.;:!?])/g, "$1");
  text = replaceAllStr(text, "...", "\x00ELL\x00"); // proteger elipsis reales
  text = text.replace(/\.\s*\.+/g, ".");
  text = text.replace(/([!?])\s*\./g, "$1");
  text = replaceAllStr(text, "\x00ELL\x00", "...");
  text = text.replace(/^[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  // em dash -> coma seguida de conectiva: promover a punto.
  text = text.replace(/,\s*(also|so|still|basically|in the end)\s*,\s*/g, (m0, g1) => {
    return ". " + g1[0].toUpperCase() + g1.slice(1) + ", ";
  });
  return [text, hits];
}

function scanStructures(text, lex) {
  const flags = [];
  for (const s of lex.structures) {
    const n = countMatches(text, s.regex);
    if (n) flags.push({ name: s.name, count: n, fix: s.fix });
  }
  // Uniformidad de longitud de frase (estructural también).
  const sents = text.match(SENT_RE) || [];
  const lens = sents.map((s) => splitWords(s).length).filter((n) => n > 2);
  if (lens.length >= 4) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const varr = lens.reduce((a, n) => a + (n - mean) ** 2, 0) / lens.length;
    const cv = mean ? Math.sqrt(varr) / mean : 0;
    if (cv < 0.35) {
      flags.push({
        name: "Uniform sentence length (variation " + cv.toFixed(2) + ")",
        count: lens.length,
        fix: "Break one sentence in half. Let another run long. Machines write even.",
      });
    }
  }
  return flags;
}

function restoreCapitals(original, text) {
  const starts = [];
  const re = /(?:^|[.!?]\s+|\n)\s*([A-Za-z])/g;
  let m;
  while ((m = re.exec(original)) !== null) starts.push(m[1]);
  if (!starts.length) return text;
  const uppers = starts.filter((c) => /[A-Z]/.test(c)).length;
  if (uppers * 2 < starts.length) return text;
  return text.replace(
    /(?:^|(?<=[.!?] )|(?<=[.!?]\n)|(?<=\n))\s*([a-z])/g,
    (m0, g1) => m0.slice(0, -1) + g1.toUpperCase()
  );
}

function humanize(text, lex) {
  const rawForCase = text;
  let urls;
  [text, urls] = protectUrls(text);
  let inv, typo, lexi;
  [text, inv] = passInvisible(text, lex);
  [text, typo] = passTypographic(text, lex);
  [text, lexi] = passLexical(text, lex);
  text = restoreCapitals(rawForCase, text);
  text = restoreUrls(text, urls);
  const clean = text.trim() + "\n";
  return {
    clean,
    report: {
      invisible: inv,
      typographic: typo,
      lexical: lexi,
      structures: scanStructures(text, lex),
    },
  };
}

// API pública: humanizar
export function humanizar(texto) {
  const { clean, report } = humanize(String(texto), SLOP);
  const cambios = [];
  for (const h of report.invisible) cambios.push({ tipo: "invisible", detalle: h });
  for (const h of report.typographic) cambios.push({ tipo: "tipografia", detalle: h });
  for (const h of report.lexical) cambios.push({ tipo: "lexico", detalle: h });
  const marcados = report.structures.map((h) => ({ tipo: "estructura", detalle: h }));
  return { limpio: clean, cambios, marcados };
}

// ----------------------------------------------------------------------------
// detect.py
// ----------------------------------------------------------------------------
const WORD_RE = /[A-Za-z']+/g;
const CONTRACTIONS = /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi;
const PRONOUNS = /\b(i|me|my|mine|we|us|our|you|your)\b/gi;
const NUMBERS = /\b\d[\d,.]*%?\b|\$\d/g;
const PROPER = /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm;

function clamp(n) {
  return Math.max(0.0, Math.min(100.0, n));
}

function scale(value, human, machine) {
  if (human === machine) return 50.0;
  return clamp(((value - machine) / (human - machine)) * 100);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pstdev(arr) {
  const m = mean(arr);
  const v = arr.reduce((a, n) => a + (n - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function sentences(text) {
  const found = text.match(SENT_RE) || [];
  return found.map((s) => s.trim()).filter((s) => splitWords(s).length > 2);
}

function wordsOf(text) {
  return text.match(WORD_RE) || [];
}

function countAll(text, re) {
  const found = text.match(re);
  return found ? found.length : 0;
}

function checkBurstiness(text) {
  const lens = sentences(text).map((s) => splitWords(s).length);
  if (lens.length < 4) return [50.0, "too short to judge"];
  const mn = mean(lens);
  const cv = mn ? pstdev(lens) / mn : 0;
  const score = scale(cv, 0.7, 0.22);
  return [score, "variation " + cv.toFixed(2) + " across " + lens.length + " sentences (want 0.55+)"];
}

function checkSpecificity(text) {
  const w = wordsOf(text);
  if (w.length < 25) return [50.0, "too short to judge"];
  const per100 = 100 / w.length;
  const properSet = new Set(text.match(PROPER) || []);
  const hits = countAll(text, NUMBERS) + properSet.size;
  const density = hits * per100;
  const score = scale(density, 6.0, 0.5);
  return [score, hits + " concrete markers, " + density.toFixed(1) + " per 100 words (want 4+)"];
}

function checkSlop(text, lex) {
  const w = wordsOf(text);
  if (!w.length) return [50.0, "empty"];
  let hits = 0;
  const found = [];
  for (const entry of lex.words.concat(lex.phrases)) {
    const source = "\\b" + escapeLiteralPy(entry.find) + "\\b";
    const n = countAll(text, new RegExp(source, "gi"));
    if (n) {
      hits += n;
      found.push(entry.find);
    }
  }
  const density = (hits * 100) / w.length;
  const score = scale(density, 0.0, 4.0);
  let detail = hits + " stock terms, " + density.toFixed(1) + " per 100 words";
  if (found.length) {
    const sorted = found.slice().sort();
    detail += " (" + sorted.slice(0, 4).join(", ") + (found.length > 4 ? ", ..." : "") + ")";
  }
  return [score, detail];
}

function checkFingerprint(text) {
  const invisible = countAll(text, /\p{Cf}/gu);
  const em = occurrences(text, "—");
  const curly = ["‘", "’", "“", "”"].reduce((a, c) => a + occurrences(text, c), 0);
  const ellip = occurrences(text, "…");
  const nbsp = [" ", " ", " "].reduce((a, c) => a + occurrences(text, c), 0);
  const total = invisible * 4 + em * 2 + curly + ellip + nbsp;
  const per1k = (total * 1000) / Math.max(text.length, 1);
  const score = scale(per1k, 0.0, 12.0);
  const detail =
    invisible + " invisible, " + em + " em dash, " + curly + " curly quote, " + ellip + " ellipsis, " + nbsp + " hard space";
  return [score, detail];
}

function checkVoice(text, lex) {
  const w = wordsOf(text);
  if (w.length < 25) return [50.0, "too short to judge"];
  const per100 = 100 / w.length;
  const contractions = countAll(text, CONTRACTIONS) * per100;
  const person = countAll(text, PRONOUNS) * per100;
  let tells = 0;
  const names = [];
  for (const s of lex.structures) {
    const n = countMatches(text, s.regex);
    if (n) {
      tells += n;
      names.push(s.id);
    }
  }
  const bulletRe = /^\s*[-*•]\s+(.+)$/gm;
  const bullets = [];
  let bm;
  while ((bm = bulletRe.exec(text)) !== null) bullets.push(splitWords(bm[1]).length);
  const uniform = bullets.length >= 3 && pstdev(bullets) < 1.6;
  let score =
    scale(contractions, 3.0, 0.0) * 0.35 + scale(person, 8.0, 1.0) * 0.35 + clamp(100 - tells * 22) * 0.3;
  if (uniform) {
    score -= 12;
    names.push("uniform-bullets");
  }
  let detail =
    contractions.toFixed(1) + " contractions, " + person.toFixed(1) + " personal pronouns per 100 words, " + tells + " structural tell(s)";
  if (names.length) detail += " [" + names.slice(0, 4).join(", ") + "]";
  return [clamp(score), detail];
}

// Claves internas (como detect.py) y claves de eje expuestas (SLOP vs "SLOP DENSITY").
const CHECKS = ["BURSTINESS", "SPECIFICITY", "SLOP DENSITY", "FINGERPRINT", "VOICE"];
const AXIS_KEY = {
  BURSTINESS: "BURSTINESS",
  SPECIFICITY: "SPECIFICITY",
  "SLOP DENSITY": "SLOP",
  FINGERPRINT: "FINGERPRINT",
  VOICE: "VOICE",
};

function runDetect(text, lex) {
  const results = {};
  results["BURSTINESS"] = checkBurstiness(text);
  results["SPECIFICITY"] = checkSpecificity(text);
  results["SLOP DENSITY"] = checkSlop(text, lex);
  results["FINGERPRINT"] = checkFingerprint(text);
  results["VOICE"] = checkVoice(text, lex);
  const scores = CHECKS.map((c) => results[c][0]);
  const overall = mean(scores) * 0.6 + Math.min(...scores) * 0.4;
  const minScore = Math.min(...scores);
  const verdict = overall >= 70 && minScore >= 55 ? "PASS" : overall >= 50 ? "REVIEW" : "FLAGGED";
  return { results, overall, verdict };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// API pública: detectar(texto) o detectar(antes, despues)
export function detectar(a, b) {
  const text = b === undefined ? String(a) : String(b);
  const { results, overall, verdict } = runDetect(text, SLOP);
  const ejes = {};
  for (const c of CHECKS) {
    ejes[AXIS_KEY[c]] = { score: round1(results[c][0]), detalle: results[c][1] };
  }
  return { ejes, score: round1(overall), veredicto: verdict };
}

export { SLOP };
