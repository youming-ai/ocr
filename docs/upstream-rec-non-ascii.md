# PP-OCRv6 small rec: non-ASCII text decodes as UTF-8 bytes (upstream issue)

Status: **open, upstream** · Tracked for the shipped model `public/models/pp-ocrv6-small/rec.onnx` ·
Last verified: 2026-09-15

## TL;DR

The PP-OCRv6 small recognition model (and, in testing, every Paddle "unified" multilingual rec
checkpoint we could obtain — PP-OCRv5 mobile and RapidAI's re-export included) transcribes every
non-ASCII glyph as a *sequence of vocabulary classes spelling the character's UTF-8 bytes rendered
through CP1252*. ASCII decodes perfectly. There is no local decode-side fix: several byte values
are not representable in the vocabulary, so their information is absent from the model output.

The application therefore ships **English/ASCII-first** until upstream resolves this. The
recognition-regression tool (`bun scripts/verify-rec-model.ts`) guards ASCII in CI and reports
non-ASCII numbers on demand.

## Observed behaviour

With the shipped `rec.onnx` + `ppocrv6_dict.txt` (the model's own
`preprocessor_config.json:character_list`, verified equal to our dict — 18710 entries, one
difference: index 0 is the literal string `"blank"`):

| Input text | Decoded output | Interpretation |
|---|---|---|
| `The quick brown fox` | `The quick brown fox` (conf 1.00) | ASCII exact |
| `本` (E6 9C AC) | `æœ¬` (conf 0.89–0.91) | CP1252(E6 9C AC) |
| `日` (E6 97 A5) | `æ—¥` | CP1252(E6 97 A5) |
| `é` (C3 A9) | `Ã©` | CP1252(C3 A9) |
| `ñ` (C3 B1) | `Ã±` | CP1252(C3 B1) |
| `隐私优先` | `éšç§·14~å...^` | byte stream with dropped/garbled positions |

NFKC also leaks into the labels: `ü` (C3 BC) comes out as `Ã14` — `¼` (U+00BC, the CP1252
rendering of 0xBC) has compatibility decomposition `1⁄4`, and U+2044 is not in the vocabulary, so
the model emits `1`, `4`.

## Evidence chain (all reproduced locally, both runtimes)

1. **Model provenance is official.** `rec.onnx` sha256
   `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634` equals the LFS sha256 of
   `PaddlePaddle/PP-OCRv6_small_rec_onnx/inference.onnx`.
2. **The ONNX export is faithful.** The head weight `linear_8.w_0` (120×18710, ~9 MB) is
   byte-identical to a region of the official `PaddlePaddle/PP-OCRv6_small_rec/inference.pdiparams`.
   Graph inspection: single CTC head (`MultiHead/CTCHead/Linear` per the PIR program), one output
   `fetch_name_0` = softmax over 18710 classes, no dead nodes.
3. **The vocabulary is correct.** The official `preprocessor_config.json` `character_list`
   (18710 entries) matches our runtime dict entry-for-entry.
4. **Not a runtime bug.** Python `onnxruntime` 1.19.2 and Bun `onnxruntime-web` produce
   bit-identical outputs (same argmax indices and confidences) for the same inputs.
5. **Not v6-specific.** `PP-OCRv5_mobile_rec_onnx` + its own dict and RapidAI's re-exported
   `PP-OCRv6_rec_small.onnx` (sha256 matches RapidOCR's `default_models.yaml`) behave identically.
6. **No public implementation reassembles bytes.** Checked: PaddleOCR `main`
   (`ppocr/postprocess/rec_postprocess.py` — `CTCLabelDecode` is a plain character-table lookup),
   PaddleX (`paddlex/inference/models/text_recognition/`), RapidOCR (`main` and `v2.0.7`,
   `rapidocr_onnxruntime/ch_ppocr_rec/utils.py`), and the `paddleocr` 3.7.0 wheel.
   RapidOCR's non-ASCII regression tests cover only the *per-language* v5 models, not the unified
   ones.

## Why no local fix

- 15 CP1252 byte values have no vocabulary entry (0x81, 0x8D, 0x8F, 0x90, 0x9D — undefined in
  CP1252 — plus 0x82, 0x84, 0x88, 0x8B, 0x98, 0x9B, 0xA0, 0xA1, 0xAD). Bytes the vocabulary cannot
  express never appear in the output; they cannot be reconstructed downstream.
- Static "bytes representable" rate over our fixtures: zh 48–63 %, ja **23 %** (kana continuation
  bytes land heavily in the missing range), accented Latin 100 %.
- Measured line-level recovery with a structure-aware byte-reassembly PoC (UTF-8 state machine,
  NFKC fold tables, whole-line fallback): **0 / 5 non-ASCII fixtures** exact; even the Latin
  fixture fails because a single noisy accent class breaks the whole-line UTF-8 decode.
- The model's ONNX graph contains only the CTC head; the other vocab-sized weight in
  `inference.pdiparams` is the NRTR target embedding ([18710, 120]), which cannot be decoded as
  CTC (grafting it produces garbage at 0.16 confidence).

Decision rule was "ship reassembly only above 90 % line recovery" — measured 0 %, so the PoC lives
in `scripts/verify-rec-model.ts` as a diagnostic, not in `src/`.

## Reproduce

```bash
bun scripts/verify-rec-model.ts            # full report (all fixtures)
bun scripts/verify-rec-model.ts --guard    # CI guard: ASCII must decode exactly
```

Fixtures are committed renders (ink-bbox cropped, BGRA) in `src/__tests__/fixtures/rec/` with
ground truth in `manifest.json`.

## Upstream issue (paste-ready)

Title: **PP-OCRv5/v6 unified rec ONNX models output non-ASCII text as CP1252-rendered UTF-8 bytes
(PP-OCRv6_small_rec_onnx)**

> **Environment**
> - Model: `PaddlePaddle/PP-OCRv6_small_rec_onnx` `inference.onnx`
>   (sha256 `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634`)
> - Dict: the model's own `inference.yml` / `preprocessor_config.json` character list (18710
>   entries), runtime table `['blank'] + dict + [' ']`
> - Runtime: onnxruntime 1.19.2 (Python, CPU) — identical results with onnxruntime-web
> - Preprocess: height 48, aspect-preserving width, `(x/255 - 0.5) / 0.5`, BGR (per
>   `inference.yml` `img_mode: BGR`); padding to 320 also tested, no change
>
> **Description**
> Decoding with `CTCLabelDecode` semantics (argmax → character table), every non-ASCII character
> comes out as the CP1252 rendering of its UTF-8 bytes, e.g.
> `本` → `æœ¬` (E6 9C AC), `日` → `æ—¥`, `é` → `Ã©`, `ñ` → `Ã±`. ASCII text decodes perfectly
> (`The quick brown fox` → exact, conf 1.00). The same behaviour reproduces with
> `PP-OCRv5_mobile_rec_onnx` + its dict, and with RapidAI's re-export of PP-OCRv6 small rec.
>
> We verified the ONNX head weight is byte-identical to `inference.pdiparams`, the vocabulary
> matches `preprocessor_config.json`, and Python/onnxruntime-web agree bit-for-bit — so this does
> not look like an export or runtime artifact.
>
> Additionally, several byte values (0x81 0x8D 0x8F 0x90 0x9D 0x82 0x84 0x88 0x8B 0x98 0x9B 0xA0
> 0xA1 0xAD) have no entry in the character list, so those bytes are never emitted and the text
> cannot be reconstructed downstream.
>
> **Question**: what is the intended pairing/postprocess for these unified models in non-Paddle
> runtimes — is a byte-level decode step required, or are the released checkpoints expected to
> emit characters directly? A minimal reproduction (fixture images + expected text + outputs) can
> be provided.

## Honest-copy status in this repo

- `public/models/pp-ocrv6-small/README.md` documents the limitation and links here.
- UI spec copy / `llm.txt` claim English-first with a note about CJK degradation.
- CI guards ASCII recognition; non-ASCII fixtures are report-only.
