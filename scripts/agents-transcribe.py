#!/usr/bin/env python3
"""Transcribe un audio con Whisper y escribe el resultado en JSON por stdout.

Lo llama scripts/agents-worker.mjs:

    python agents-transcribe.py <ruta-audio> [modelo] [--palabras]

Con --palabras (lo usa el Editor de reels, api/_lib/editor/trabajo.js) pide
además las marcas de tiempo de cada palabra y añade a la salida
`"palabras": [{"w", "a", "b", "p"}]` (texto, inicio y fin en segundos y la
probabilidad). Sin la opción, la salida es exactamente la de siempre.

Se usa faster-whisper y no openai-whisper porque esta máquina no tiene GPU:
faster-whisper corre sobre CTranslate2 y en CPU va del orden de cuatro veces
más rápido con la misma calidad. Con `small` e int8, un reel de 60 s tarda
entre 20 y 40 segundos en cuatro núcleos.

Todo lo que se imprime por stdout es JSON y nada más: los avisos de las
librerías van a stderr a propósito, o romperían el JSON.parse del worker.
"""
import json
import os
import sys

# Dónde vive el modelo. Se fija aquí y no en el servicio de systemd para que
# funcione igual lanzado a mano que por el worker, y sobre todo para que NO
# dependa del usuario que lo ejecute: el modelo pesa 464 MB y, sin esto, cada
# usuario se lo descargaba otra vez en su propio ~/.cache.
os.environ.setdefault("HF_HOME", "/home/s4sf/helm-agents/modelos")


def salir(payload, codigo=0):
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.exit(codigo)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    palabras = "--palabras" in sys.argv[1:]
    if len(args) < 1:
        salir({"error": "falta la ruta del audio"}, 1)

    audio = args[0]
    modelo = args[1] if len(args) > 1 else "small"

    if not os.path.exists(audio):
        salir({"error": f"no existe el audio: {audio}"}, 1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        salir({"error": "falta faster-whisper en el venv. Instálalo con: "
                        "/home/s4sf/helm-agents/venv/bin/pip install faster-whisper"}, 1)

    try:
        # int8 es la cuantización que hace esto viable sin GPU. `cpu_threads=4`
        # coincide con los núcleos de la máquina; dejarlo en automático hace que
        # compita consigo mismo y va más lento.
        m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=4)

        # vad_filter recorta los silencios antes de transcribir. En reels con
        # música de fondo y pausas es lo que evita que Whisper se invente
        # frases enteras en los huecos, que es su fallo más típico.
        opciones = {}
        if palabras:
            opciones = {
                "word_timestamps": True,
                # Para editar hace falta lo que se dijo de verdad, repeticiones
                # y muletillas incluidas: Whisper tiende a «limpiar» y a juntar
                # dos tomas de la misma frase en una. Sin el texto anterior como
                # contexto y con un ejemplo literal delante, lo hace mucho menos.
                "condition_on_previous_text": False,
                "initial_prompt": "Eh… vale, a ver. Esta, esta IA hace… Esta IA hace que tu negocio venda más, ¿vale?",
                # Con marcas por palabra: salta lo que Whisper se invente en
                # silencios de más de 2 s.
                "hallucination_silence_threshold": 2.0,
            }

        segmentos, info = m.transcribe(
            audio,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            **opciones,
        )

        trozos = []
        lista = []
        for s in segmentos:
            texto = (s.text or "").strip()
            if texto:
                trozos.append({"inicio": round(s.start, 2), "fin": round(s.end, 2), "texto": texto})
            if palabras:
                for w in (s.words or []):
                    t = (w.word or "").strip()
                    if t:
                        lista.append({"w": t, "a": round(w.start, 3), "b": round(w.end, 3), "p": round(w.probability, 3)})

        salida = {
            "texto": " ".join(t["texto"] for t in trozos),
            "idioma": info.language,
            "duracion": round(info.duration, 2),
            "segmentos": trozos,
        }
        if palabras:
            salida["palabras"] = lista
        salir(salida)
    except Exception as e:  # noqa: BLE001 — el worker necesita el motivo entero
        salir({"error": f"{type(e).__name__}: {e}"}, 1)


if __name__ == "__main__":
    main()
