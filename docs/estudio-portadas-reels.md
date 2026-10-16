# Portadas de reels: estudio para el generador de HELM (17-10-2026)

Las citas van como [n] y la lista de fuentes está al final, con URL y fecha. Marco como **«no comprobado»** lo que no he podido sostener con una fuente. Donde pone **«observación propia»** hablo de perfiles públicos que revisé hoy, 17-10-2026, en instagram.com y YouTube; es una muestra pequeña, sin valor estadístico.

## Resumen

- **La portada sirve para convertir, no para conseguir alcance.** Mosseri dice que las portadas tienen un efecto «marginal» en el alcance, porque casi todos los reels se ven en Recomendaciones, donde la portada no aparece [5]. En YouTube Shorts pasa lo mismo: el 99,9 % de las visualizaciones son en el feed, donde no hay miniatura [11]. La portada trabaja en el perfil y en Explorar, es decir, cuando alguien decide si seguir la cuenta y qué otro vídeo ver.
- **El recorte que manda es el 3:4 centrado.** El área que siempre se ve es 1080×1440 dentro del lienzo de 1080×1920 [3][12].
- **La API permite poner la portada al publicar, pero no cambiarla después** [8][9].
- **Recomendación técnica:** el fotograma real más la tipografía compuesta por código como opción por defecto. La IA de imagen solo para la mitad «visual de tema», sin personas, o para limpiar el fondo con la cara protegida. **Nunca** para dibujar el texto ni para retocar la cara.

## 1. Dónde se ven las portadas y qué captan

### 1.1 Superficies

| Superficie | Qué se ve | Fuente |
|---|---|---|
| Cuadrícula del perfil | Recorte 3:4 centrado. Desde enero de 2025 la cuadrícula pasó de cuadrados a rectángulos verticales. Se pierden 240 px arriba y 240 px abajo. En la web medí proporción 0,750 y `object-fit: cover` centrado sobre una miniatura de 360×640. Hay un icono de reel arriba a la derecha | [1][2][3][12] |
| Pestaña Reels del perfil | En la web medí proporción 0,642, unos 1080×1682, y el contador de vistas abajo a la izquierda. En la app móvil: **no comprobado** | [12] |
| Explorar | Mosseri dice que es, junto con el perfil, donde más se ve la portada. El recorte exacto en 2026: **no comprobado** | [5] |
| Feed y pestaña Reels a pantalla completa | Se reproduce el vídeo, no la portada. La documentación de la API aún dice que al compartir al feed se usa un cuadrado central 1:1; probablemente es una nota antigua: **no comprobado** | [8] |

### 1.2 Peso en la captación

- **Alcance.**
  - Mosseri lo llama efecto «marginal» (16-09-2024) [5].
  - Las señales que más pesan son el tiempo de visualización, los «me gusta» y los envíos (23-01-2025) [6].
  - En su explicación del ranking de 2023, Instagram predice para Reels compartir, ver hasta el final, dar «me gusta» e ir a la página del audio. No menciona la portada [7].
- **Visitas al perfil, conversión a seguidor y ver varios vídeos seguidos.** No he encontrado ningún dato público de Meta: **no comprobado**.
  - La cifra de «hasta un 30 % más de visitas desde el perfil con portadas personalizadas» que circula en blogs no tiene fuente primaria: **no comprobado**.
  - Meta sí está invirtiendo en controlar cómo se ve el perfil a los visitantes. En marzo de 2026 permitió editar la miniatura de lo ya publicado [4].
  - YouTube reconoce que la página del canal funciona como portafolio que revisan las marcas [11].
- **Conclusión que sí se sostiene:** la portada es un activo de conversión en el perfil y de coherencia de marca, no de distribución.

### 1.3 Especificaciones

- **Lienzo:** 1080×1920 (9:16). Si no es 9:16, Instagram recorta el rectángulo 9:16 central [8].
- **Formato y peso por API:** JPEG, sRGB, 8 MB como máximo [8]. Que se acepte PNG por API: **no comprobado**. En la app se sube desde el carrete.
- **Ayuda oficial de Instagram:** todavía muestra 420×654 y «no se puede editar después de subirla». La página no tiene fecha y la contradicen fuentes de 2024 y 2026 [10][4][5].

### 1.4 Zonas seguras sobre 1080×1920

- **Zona crítica (cuadrícula):** y 240–1680, con margen lateral de 60 px.
- **Iconos de la cuadrícula (observación propia):** contador de vistas abajo a la izquierda (aprox. x 0–400, y 1560–1680) e icono de reel o de fijado arriba a la derecha (x 900–1080, y 240–340) [12].
- **Interfaz a pantalla completa:** importa solo si la portada se usa también como primer fotograma. Los porcentajes que se atribuyen a Meta (14 % arriba, 35 % abajo y 6 % a cada lado) son de anuncios y llegan por terceros, sin página de Meta verificada [3].
- **Banda de titular recomendada (doblemente segura):** x 60–1020, y 300–1250.

### 1.5 Subir o cambiar la portada

- **App:** se pone al publicar, con un fotograma o una imagen del carrete. Después de publicar también se puede editar: «Editar → Portada» y «Ajustar vista previa» para el recorte de la cuadrícula [2][4][5].
- **Graph API:** `POST /{ig-user-id}/media` con `media_type=REELS` [8].
  - `cover_url`: URL pública de la imagen de portada; Meta la descarga con cURL.
  - `thumb_offset`: el fotograma a usar, en milisegundos; por defecto 0.
  - Si se envían los dos, gana `cover_url`.
- **Después de publicar, por API:** solo se puede cambiar `comment_enabled`. Ni la portada ni el ajuste de la cuadrícula [9]. En HELM, cualquier cambio posterior tiene que ser manual en la app.

## 2. Referentes y qué hacen

### 2.1 YouTube: método y datos

- **MrBeast.**
  - Según un documento interno filtrado (autenticidad no confirmada), el proceso «empieza por el título y la miniatura». La portada tiene que cumplir lo que promete, o se hunde la duración media de visualización [15].
  - En 2023 dijo que cerrar la boca en sus miniaturas subió el tiempo de visualización. Lo vio en un A/B test, sin publicar cifras [16].
  - Observación propia: poco o ningún texto («DAY 201», «100 COPS» en una esquina), su cara a un lado, gran espectáculo visual, colores saturados y sonrisa con la boca cerrada.
- **Paddy Galloway.**
  - «Prueba del vistazo»: la miniatura se tiene que entender en milisegundos (10-07-2024) [17a].
  - Hacer 3 opciones de miniatura por vídeo (02-01-2024) [17b].
  - Planificar el título y la miniatura antes de grabar (10-05-2024) [17c].
  - «Menos de 5 palabras» y que título y miniatura se complementen: lo vi en un resumen de búsqueda del mismo hilo, no lo leí directamente.
  - CNBC resume su método en dos conceptos: titular e imagen (10-05-2026) [18].
- **Estudios.**
  - vidIQ, 500 vídeos que rompieron su media, junio de 2026: cara en el 69 %, que sube al 80 % en el top 50. Texto en el 72 %, con una **mediana de 5 palabras**. Expresión exagerada solo en el 5 % [13].
  - Thumbnail Bench, 11.223 miniaturas, septiembre de 2026: cara en el 71 % y cara «sorprendida» solo en el 11 % de las que tienen cara. Texto en el 77 %, **mediana de 4 palabras**. Texto blanco en el 68 %, todo en mayúsculas en el 62 % y con contorno, sombra o caja en el 73 %. Ningún rasgo aislado explica que una miniatura funcione mejor [14].
  - El estudio de Thumbnail Bench lo hace una empresa que vende miniaturas con IA y el etiquetado lo hizo un modelo de IA. Tómalo como orientativo.
- **YouTube Test & Compare:** hasta 3 variantes; gana la de mayor cuota de tiempo de visualización. Las variantes demasiado parecidas no dan ganador. No vale para Shorts [19].

### 2.2 Instagram y Reels (observación propia, 17-10-2026 [39])

| Creador | Patrón | Por qué funciona |
|---|---|---|
| **Kallaway** (462 mil) | Pantalla partida: arriba un visual que te mete en el tema (producto, escena), abajo su cara en un estudio oscuro. En la costura, 2 líneas de 2–4 palabras en mayúsculas blancas sobre cajas rojo teja. Serie casi idéntica en todos los reels | El tema se entiende de un vistazo y la cara da confianza. La cuadrícula parece un canal de noticias |
| **Hormozi** (5 M) | Él arriba y alguien del público abajo. En el centro, una caja roja con la pregunta en mayúsculas y entre comillas: «WHY DO MY EMPLOYEES LEAVE?» (3–6 palabras) | La pregunta en voz del cliente hace que el espectador se identifique. Formato de serie |
| **Codie Sanchez** (3,4 M) | Cara arriba o en el centro y caja blanca con texto negro en mayúsculas iniciales («3 Things to Do Before the Fed Cuts Rates»). Usa números. Algunas portadas son tarjetas de tuit, sin cara | La lista numerada promete algo concreto. La caja garantiza que se lea |
| **Ali Abdaal** (1,1 M) | El primer fotograma hace de portada: gancho en el tercio superior con tipografías variadas y la cara en el centro. Se ve el subtítulo quemado en el vídeo | Parece contenido nativo, pero la cuadrícula es poco coherente |
| **Iman Gadzhi** (3,1 M) | Solo 2 reels visibles. Fotogramas cinematográficos sin texto | Marca de estilo de vida; no sirve como modelo para negocio |
| **DotCSV** (106 mil) | Igual que Kallaway: visual del tema arriba y cara abajo sobre un fondo cálido constante. 2 líneas en blanco, en minúsculas normales, de 3–5 palabras («La IA explota las matemáticas») | La serie más limpia en español |
| **Jon Hernández** (248 mil) | Primer plano y una píldora oscura con el logo circular «IA» y 2–4 palabras («DESEMPLEO POR IA») en el tercio inferior | Etiqueta de serie con marca |
| **Romuald Fons** (294 mil) | Formato Hormozi en español: caja amarilla con texto negro y la pregunta del asistente en primera persona («Tengo lista de espera. ¿Cómo consigo mi propio local?»), unas 8–10 palabras | Los reels fijados con esta portada muestran entre 364 mil y 1 M de vistas; los que usan un fotograma con subtítulo, unas 12 mil. Es una correlación con sesgo de selección, no una prueba de causa |

**YouTube en español (observación propia [40]):**
- **Xavier Mitjana:** cara a la derecha y, a la izquierda, 2–3 palabras en mayúsculas condensadas con una palabra en amarillo («OLVIDA PHOTOSHOP», «EMPIEZA ASÍ») más logos de apps. A veces usa tarjetas de tuit de cuentas ajenas, lo que **no** hay que copiar por riesgo de suplantación.
- **Euge Oller:** cara a un lado, titular de 2–4 palabras con caja de resalte («¿CUÁL ESCOJO?») y logos.

**Dato clave:** en sus Shorts, Kallaway, Ali Abdaal, Hormozi, MrBeast y Euge Oller usan fotogramas sin diseñar. Hasta el 25-07-2026 YouTube no dejaba subir una portada personalizada para Shorts [11]. En Instagram, los mismos creadores sí diseñan la portada.

## 3. Patrones y reglas accionables

1. **Palabras:** entre 2 y 6. El ideal es 3–5, con 32 caracteres como máximo y 2 líneas (3 solo si incluye una pregunta citada) [13][14][17].
2. **Jerarquía:** un único mensaje y una sola palabra resaltada (color o caja). Como máximo 3 focos: cara, texto y un objeto [17a].
3. **Cara a un lado, texto al otro:**
   - En 9:16 suele funcionar mejor «arriba y abajo» que «izquierda y derecha».
   - Cara con expresión natural; las exageradas son minoría en las miniaturas que más funcionan [13][14].
   - Ojos abiertos y nítidos, boca cerrada o sonrisa [16].
4. **Legibilidad en el móvil (cálculo propio):**
   - Supuesto: pantalla de unos 390 pt y cuadrícula de 3 columnas, así que cada miniatura mide unos 130 pt de ancho y 1080 px pasan a escala ≈0,12.
   - Titular con cuerpo ≥110 px (mínimo absoluto 96 px) y altura de mayúscula ≥75 px.
   - Fuente gruesa o condensada, con contorno, sombra o caja (como el 73 % de los casos [14]).
   - Contraste ≥4,5:1 (criterio WCAG).
5. **Coherencia de la cuadrícula:** una o dos plantillas por cuenta, 2 colores de marca más blanco y negro, la misma fuente y la etiqueta o numeración de la serie siempre en el mismo sitio (Kallaway, DotCSV, Jon Hernández).
6. **Promesa cumplida:** el texto sale de lo que el vídeo realmente entrega [15].
7. **Complementar, no repetir:** no copiar la primera línea del caption [17].
8. **Ortografía española:** mayúsculas con tilde [38], signos «¿» y «¡», cifras en número.

**Errores típicos:**
- Texto fuera de la zona 3:4.
- Texto sobre los ojos o debajo de los iconos de la cuadrícula.
- Usar el subtítulo quemado como portada.
- Fotograma movido o pillado a mitad de palabra.
- Fuentes finas.
- Un estilo distinto en cada reel.
- Más de 8 palabras.
- Mayúsculas sin tilde.
- Tarjetas o logos que imitan a terceros.
- Retocar la cara con IA.

**Diferencias entre la portada de Reels y la miniatura de YouTube:**

| | Portada de Reels | Miniatura de YouTube |
|---|---|---|
| Formato | 9:16 visto en 3:4 | 16:9 |
| Peso | Marginal en alcance, útil en el perfil [5] | Decisiva: test por tiempo de visualización [19] |
| Dónde decide | Perfil y Explorar | Inicio y sugeridos |
| Se juzga… | En bloque (la serie importa más) | Una a una |
| Test A/B nativo | No he encontrado ninguno en Instagram: **no comprobado** | Hasta 3 variantes [19] |
| Iconos superpuestos | Vistas abajo a la izquierda y reel o fijado arriba a la derecha | Duración abajo a la derecha |
| Texto | Más tipo etiqueta o tema | Más curiosidad, complementaria al título |

## 4. Motores de IA para generar la portada

**Precios de referencia por imagen** (cuando se indica, a un tamaño equivalente a 1080×1920, unos 2 MP):

| Motor (actual) | Precio | Texto en la imagen | Edita una imagen de entrada | API y requisitos | Riesgos |
|---|---|---|---|---|---|
| **OpenAI GPT Image 2.5** Sunburst/Flare (08-09-2026) | Generar 1920×1080: $0,0045 / $0,0096 / $0,0395 (baja / media / alta). Editar en alta: $0,048 + unos $0,008 por referencia [22]. Calidad «max»: unos $0,21 [28] | GPT Image 2 es el n.º 1 en Text Rendering de LM Arena [29]. OpenAI admite que el texto «puede ser imperfecto» [21]. Español: **no comprobado** | Sí: hasta 16 referencias y máscara. N.º 1 y n.º 2 en la clasificación de edición de Artificial Analysis [22][28] | Verificación de organización. Tamaños múltiplos de 16, así que hay que pedir 1088×1920 y reescalar [21] | Registros de abuso hasta 30 días, posible retención cero (ZDR). Para imágenes con residencia de datos en la UE hace falta aprobación. No entrena con datos de la API [23]. Añade C2PA y SynthID [24] |
| **Google Nano Banana 2.1** (`gemini-nano-banana-2.1`) | $0,0336 (1K) / $0,0504 (2K). Nano Banana Pro: $0,134 [25] | «Texto legible y estilizado» según Google [26]. es-MX entre los idiomas de mejor rendimiento; es-ES no aparece [27] | Sí: hasta 5 personajes para mantener consistencia. N.º 3 en edición [26][28] | Solo de pago. En la capa de pago, los datos no se usan para mejorar productos; en la gratuita, sí [25] | SynthID en todas las imágenes [26] |
| **FLUX 3 Image** (BFL, 01-10-2026) | $0,048 (1K), $0,10 (1,5K); FLUX 3 Klein $0,009–0,014. Kontext pro/max (generación anterior): $0,04 / $0,08 [31][32] | **No comprobado** | Hasta 10 referencias y ediciones locales; afirmación del fabricante [32] | API propia | Empresa alemana. Retención y endpoint europeo: **no comprobado** |
| **Ideogram 4.5** | $0,03 / 0,06 / 0,10; generar con imagen fuente en alta $0,22 (dato de terceros, 14-10-2026) [30] | Fuerte en tipografía (una sola prueba, en inglés) [30]. Español: **no comprobado** | Cara real sin deformar: **no comprobado** | API | — |
| **Recraft V4.1** | $0,035 por imagen raster. La edición solo aparece con precio para V3: $0,04 [33] | Bueno en diseño y vectores | Foto con cara: **no comprobado** | API | — |
| **Seedream 5.0 Pro** (ByteDance) | $0,045 (≤2,36 MP) + $0,003 por referencia adicional (vía OpenRouter) [34] | — | N.º 7 en edición [28] | Vía OpenRouter | Transferencia internacional fuera de la UE: **no comprobado** |
| **Composición por código** (fotograma + HTML o canvas) | Prácticamente 0 € (solo cómputo propio) | Exacto y con la fuente de la marca | No altera la cara | Propia | No inventa escenas; depende de la calidad del fotograma |

**Riesgos comunes de la IA:**
- Deriva de la identidad facial y texto con erratas: falta de tildes y de «¿».
- Etiqueta «AI info» de Meta, que se activa por metadatos C2PA [24][37].
- Ley de IA (AI Act), art. 50: desde el 02-08-2026, una persona real manipulada que pueda pasar por auténtica es un «deepfake» y hay que avisar de forma visible. La parte artística tiene una obligación más ligera, pero la publicidad no queda exenta automáticamente [35].

**RGPD:**
- La foto de la cara es un dato personal. No es dato biométrico salvo que pase por un «tratamiento técnico específico» (considerando 51, criterio de la AEPD) [36].
- **Ojo:** comprobar con reconocimiento facial que la IA no ha cambiado la cara sería tratamiento biométrico (art. 9). Hay que comparar a nivel de píxel dentro de la máscara de la cara.
- Hace falta:
  - Encargo de tratamiento con el cliente y subencargo con el proveedor de IA (art. 28).
  - Garantías para transferencias internacionales (arts. 44–46).
  - Base legal y consentimiento de terceros o menores que aparezcan; mejor no enviar imágenes de terceros.
  - No usar nunca capas gratuitas.

**Recomendación:**
- **Por defecto,** composición por código. Un modelo de visión elige el fotograma (puntúa nitidez, ojos abiertos y expresión) y Satori, Playwright o Skia pintan la plantilla. Así hay texto exacto, la cara queda intacta, la serie es coherente, el coste es casi nulo y la cara no sale de vuestra infraestructura.
- **IA opcional en dos casos:**
  - (a) La mitad «visual de tema» de la plantilla partida, **sin personas**: Nano Banana 2.1 por coste o GPT Image 2.5 Flare por calidad.
  - (b) Limpiar o ampliar el fondo con la cara protegida por máscara, y después volver a pegar los píxeles originales de la cara.
- **Retoque «premium» de la persona:** solo con GPT Image 2.5 Sunburst, aprobación humana y aviso del art. 50.

## 5. Entregable

### 5.1 Reglas para el prompt del agente

```
ROL: Diseñas portadas de reels (es-ES) para cuentas de negocio y creadores.
ENTRADAS: caption, transcripción con tiempos, fotogramas candidatos, kit de marca
(fuentes, 2 colores, plantilla de serie, nº de serie), últimas 9 portadas.
SALIDA (JSON): 3 opciones {texto, palabra_resaltada, texto_secundario?, etiqueta_serie?,
plantilla_id, timestamp_fotograma, colores, justificación, checks}.

TEXTO
1. Saca la promesa más concreta que el vídeo CUMPLE (cifra, resultado, pregunta del cliente,
   nombre propio). Prohibido prometer lo que no está en la transcripción.
2. 2–6 palabras, ≤32 caracteres, máx. 2 líneas (3 si es pregunta citada).
3. Las 3 opciones deben diferir en ÁNGULO, no en sinónimos: (A) beneficio/cifra,
   (B) pregunta en voz del cliente o curiosidad, (C) contraria o nombre propio + novedad.
4. No repitas la 1ª línea del caption ni el gancho hablado literal; compleméntalos.
5. Una sola palabra resaltada. Mayúsculas con tilde, ¿ ¡ obligatorios, cifras en número,
   sin emojis en el titular, sin anglicismos salvo marcas.
6. No imites cuentas, logos o tuits de terceros; nada de afirmaciones de salud o ingresos garantizados.

FOTOGRAMA
7. Ojos abiertos, nítido, sin subtítulo quemado; expresión natural acorde al mensaje
   (evita la sorpresa exagerada); boca cerrada o sonrisa.
8. Cara ≥30 % de la altura del recorte 3:4; mirada a cámara o hacia el texto.

DISEÑO (lienzo 1080×1920)
9. Todo lo esencial en y 240–1680; titular en x 60–1020 / y 300–1250.
   Libres: abajo-izq (x0–400, y1560–1680) y arriba-der (x900–1080, y240–340).
10. Titular ≥110 px (mínimo 96), fuente gruesa, contorno, sombra o caja, contraste ≥4,5:1.
11. Respeta la plantilla y la paleta de la serie; varía solo el contenido.
12. Prueba del vistazo: renderiza a 130 px de ancho; si no se lee o hay >3 focos, simplifica.
13. Nunca generes texto ni caras con IA; IA solo para fondos sin personas o ampliaciones
    con la cara protegida por máscara (marca uso_ia=true si la usas).
CHECKS: OCR == texto, zona segura, contraste, cara intacta (diferencia de píxeles en la máscara),
JPEG sRGB ≤8 MB.
```

### 5.2 Plantillas (lienzo 1080×1920; zona 3:4 = y 240–1680)

1. **T1 Partida tema/cara** (Kallaway, DotCSV)
   - Visual del tema en y 0–960; cara en y 960–1920, con los ojos hacia y≈1150–1250.
   - Titular en la costura (y 820–1100): 2 líneas de 120–150 px, condensadas en mayúsculas, blanco sobre cajas con el color de marca (radio 16) y ancho ≤920 px.
2. **T2 Pregunta del cliente** (Hormozi, Romuald Fons)
   - Creador en y 240–960; cliente o plano recurso en y 960–1680.
   - Caja centrada en la costura (y 840–1120) con la pregunta entre comillas, 3 líneas como máximo de ≥96 px, negro sobre amarillo o blanco sobre rojo.
3. **T3 Titular superior** (Ali Abdaal, Xavier Mitjana)
   - Titular en y 300–620: 1–2 líneas de 140–180 px, con una palabra en color.
   - Cara centrada debajo, con los ojos en y≈850–950 y sin solaparse con el texto.
4. **T4 Etiqueta de serie** (Jon Hernández)
   - Primer plano a sangre.
   - Píldora oscura de 170 px de alto en y 1100–1270, con un logo circular de 130 px y 2–4 palabras en mayúsculas de ≥90 px.
5. **T5 Número grande** (Codie Sanchez)
   - Cifra de 420–520 px en x 60–420 / y 320–820.
   - Al lado, 2 líneas de 110 px (x 440–1020).
   - Cara en y 820–1680.
6. **T6 Nota o tuit propio**
   - Tarjeta blanca (radio 36) en x 90–990 / y 360–1000, con el avatar y el @ **del propio cliente** y 1–3 líneas de 80–96 px en negro.
   - Cara debajo.
7. **T7 Producto o local** (negocios sin cara)
   - Foto a sangre.
   - Caja del titular en y 1050–1250, logo pequeño en y ≥300 y una etiqueta circular de oferta o precio de 220 px.
8. **T8 Comparativa o antes/después**
   - Dos mitades arriba y abajo con etiquetas «ANTES / DESPUÉS» o «X vs Y» de 100 px.
   - Insignia circular «VS» de 200 px en el centro de la costura (y 960).

## Fuentes

1. Business Today, 21-01-2025. https://www.businesstoday.in/technology/news/story/instagram-head-announces-big-changes-3-minute-reels-and-new-look-for-profile-grid-461527-2025-01-21
2. Kapwing, 30-12-2025. https://www.kapwing.com/resources/instagrams-new-grid-layout-size-and-dimensions-2025/
3. Hopper HQ, 18-09-2026. https://www.hopperhq.com/blog/instagram-reel-size/
4. Social Media Today, 01-03-2026. https://www.socialmediatoday.com/news/instagram-introduces-thumbnail-post-editing-for-grids/813444/
5. Lindsey Gamble, 16-09-2024. https://www.lindseygamble.com/blog/cover-photos-for-reels-have-minimal-impact-according-to-instagram-head-adam-mosseri
6. Social Samosa, 23-01-2025. https://www.socialsamosa.com/news-2/instagram-reveals-key-factors-for-boosting-reach-8646916
7. Instagram, «Instagram Ranking Explained», 31-05-2023 (anterior a 2024). https://about.instagram.com/blog/announcements/instagram-ranking-explained/
8. Meta, IG User Media, consultado el 17-10-2026. https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
9. Meta, IG Media, consultado el 17-10-2026. https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media
10. Ayuda de Instagram, sin fecha (visto en resultado de búsqueda). https://help.instagram.com/1038071743007909/
11. PPC Land, 26-07-2026. https://ppc.land/youtube-ends-2-year-wait-for-shorts-thumbnails-but-blocks-a-b-testing/
12. Observación propia del DOM de instagram.com, 17-10-2026.
13. vidIQ, junio y julio de 2026. https://vidiq.com/research/youtube-thumbnail-study/
14. Net Influencer / Thumbnail Bench, 21-09-2026. https://www.netinfluencer.com/?p=53558
15. Simon Willison, 15-09-2024. https://simonwillison.net/2024/Sep/15/how-to-succeed-in-mrbeast-production/
16. Creator Handbook, 07-09-2023. https://www.creatorhandbook.net/mrbeast-claims-closing-his-mouth-in-thumbnails-is-better-for-views/
17. Paddy Galloway en X: (a) 10-07-2024 https://x.com/PaddyG96/status/1811083499044044951 · (b) 02-01-2024 https://twitter.com/PaddyG96/status/1742221359613190312 · (c) 10-05-2024 https://x.com/PaddyG96/status/1788967959882346991
18. CNBC, 10-05-2026. https://www.cnbc.com/2026/05/10/youtube-advisors-mrbeast-top-creators-platform-viewership.html
19. Ayuda de YouTube, consultada el 17-10-2026. https://support.google.com/youtube/answer/16391400
20. OpenAI, precios, consultado el 17-10-2026. https://developers.openai.com/api/docs/pricing
21. OpenAI, guía de generación de imágenes, consultada el 17-10-2026. https://developers.openai.com/api/docs/guides/image-generation
22. fal.ai, GPT Image 2.5, 08/10-09-2026. https://fal.ai/gpt-image-2.5
23. OpenAI, controles de datos, consultado el 17-10-2026. https://developers.openai.com/api/docs/guides/your-data
24. OpenAI, C2PA, consultado el 17-10-2026. https://help.openai.com/en/articles/8912793-c2pa-in-images
25. Google, precios de la API de Gemini, consultado el 17-10-2026. https://ai.google.dev/gemini-api/docs/pricing
26. Google, generación de imágenes con Gemini, consultado el 17-10-2026. https://ai.google.dev/gemini-api/docs/image-generation
27. Google Cloud, limitaciones de la generación de imágenes, actualizado el 15-10-2026. https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/gemini-image-generation-limitations
28. Artificial Analysis, clasificación de edición, consultada el 17-10-2026. https://artificialanalysis.ai/image/leaderboard/editing
29. AlphaSignal, 30-07-2026. https://alphasignal.ai/news/lm-arena-breaks-down-52-image-models-across-7-categories-with-28m-votes
30. Wireflow, 14-10-2026. https://www.wireflow.ai/blog/ideogram-api-pricing
31. Ayuda de BFL, 12-06-2026. https://help.bfl.ai/articles/7424166364-wip-welcome-to-the-forest
32. Kingy AI, 01-10-2026, https://kingy.ai/ai-launch-tracker/flux-3-image-2026-10-01/ · BFL docs, consultado el 17-10-2026, https://docs.bfl.ai/quick_start/pricing
33. Recraft, precios, consultado el 17-10-2026. https://www.recraft.ai/docs/api-reference/pricing.md
34. OpenRouter, Seedream 5.0 Pro, consultado el 17-10-2026. https://openrouter.ai/bytedance-seed/seedream-5-0-pro-20260812
35. Praxikon, 10-10-2026. https://www.praxikon.com/en/posts/article-50-transparency-deadline-2-august-2026
36. AEPD, guía de control de presencia biométrico (2023, anterior a 2024). https://www.aepd.es/guias/guia-control-presencia-biometrico.pdf
37. TechCrunch, 01-07-2024. https://techcrunch.com/2024/07/01/meta-changes-its-label-from-made-with-ai-to-ai-info-to-indicate-use-of-ai-in-photos
38. RAE, tilde en las mayúsculas, consultado el 17-10-2026. https://www.rae.es/espanol-al-dia/tilde-en-las-mayusculas
39. Observación propia, 17-10-2026: instagram.com/kallaway, /hormozi, /codiesanchez, /aliabdaal, /imangadzhi, /dotcsv, /jonhernandezia, /romualdfons (pestaña Reels).
40. Observación propia, 17-10-2026: miniaturas de YouTube de los canales @MrBeast, @aliabdaal, @kallaway, @ImanGadzhi, @AlexHormozi, @XavierMitjana y @EugeOller.
