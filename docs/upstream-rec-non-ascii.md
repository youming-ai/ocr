# Upstream issue: PP-OCRv6/v5 rec models emit non-ASCII as UTF-8 bytes

Status: **open, upstream** · Affects `public/models/pp-ocrv6-small/rec.onnx` · Verified 2026-09-15

## Summary

The PP-OCRv6 small rec checkpoint transcribes every non-ASCII character as the CP1252 rendering of
its UTF-8 bytes (`本` → `æœ¬`, `é` → `Ã©`, `ñ` → `Ã±`); ASCII decodes perfectly. Fifteen CP1252 byte
values have no vocabulary entry, so those bytes are never emitted and the text is unrecoverable
downstream. Reproduces on PP-OCRv5 mobile and on RapidAI's re-export of this model, identically
under Python onnxruntime and onnxruntime-web. No public decoder (PaddleOCR, PaddleX, RapidOCR)
reassembles bytes, so we treat this as an upstream model/export issue and ship English-first.

| Input | Output | Interpretation |
|---|---|---|
| `The quick brown fox` | exact (conf 1.00) | ASCII unaffected |
| `本` (E6 9C AC) | `æœ¬` | CP1252 of the UTF-8 bytes |
| `日` (E6 97 A5) | `æ—¥` | ” |
| `é` (C3 A9) | `Ã©` | ” |
| `隐私优先` | `éšç§·14~å...^` | bytes dropped/garbled at missing values |

NFKC leaks into the labels too: `ü` (C3 BC) comes out as `Ã14` — `¼` (U+00BC) decomposes to `1⁄4`
and U+2044 is absent from the vocabulary.

## Evidence

1. **Official artifact**: `rec.onnx` sha256 `5435fd74…a24634` equals the LFS sha256 of
   `PaddlePaddle/PP-OCRv6_small_rec_onnx/inference.onnx`.
2. **Export is faithful**: head weight `linear_8.w_0` (120×18710) is byte-identical to a region of
   `PaddlePaddle/PP-OCRv6_small_rec/inference.pdiparams`; the graph has a single CTC head
   (`MultiHead/CTCHead/Linear`), one output (`fetch_name_0` = softmax over 18710 classes), no dead
   nodes.
3. **Vocabulary is correct**: the official `preprocessor_config.json` `character_list` (18710
   entries) matches our runtime dict entry-for-entry (only difference: index 0 is the literal
   `"blank"`).
4. **Not a runtime bug**: Python onnxruntime 1.19.2 and onnxruntime-web return identical argmax
   indices and confidences.
5. **Not v6-specific**: `PP-OCRv5_mobile_rec_onnx` + its dict, and RapidAI's re-exported
   `PP-OCRv6_rec_small.onnx` (sha256 matches their `default_models.yaml`), behave the same.
6. **No reassembly anywhere public**: PaddleOCR `main` (`CTCLabelDecode` is a plain character
   lookup), PaddleX `text_recognition/`, RapidOCR (`main` and `v2.0.7`), the `paddleocr` 3.7.0
   wheel. RapidOCR's non-ASCII tests cover only per-language v5 models, not the unified ones.

## Why there is no local fix

- 15 CP1252 bytes are absent from the vocabulary (0x81 0x8D 0x8F 0x90 0x9D, which CP1252 leaves
  undefined, plus 0x82 0x84 0x88 0x8B 0x98 0x9B 0xA0 0xA1 0xAD). Missing bytes cannot be rebuilt.
- Static share of characters whose bytes are all representable: zh 48–63 %, ja **23 %**, accented
  Latin 100 %.
- A structure-aware byte-reassembly PoC (UTF-8 state machine + NFKC fold tables) recovers **0 of 5**
  non-ASCII fixtures exactly — one noisy byte breaks the whole-line UTF-8 decode. It is kept as a
  diagnostic in `scripts/verify-rec-model.ts`, not in `src/`.
- The only other 18710-wide weight in `inference.pdiparams` is the NRTR target embedding
  ([18710, 120]); grafting it into the CTC graph yields garbage (conf 0.16) and its decoder is not
  part of the ONNX export.

Decision rule was “ship reassembly only above 90 % line recovery”; measured 0 %.

## Reproduce

```bash
bun scripts/verify-rec-model.ts            # full report
bun scripts/verify-rec-model.ts --guard    # CI: ASCII must decode exactly
```

Fixtures (rendered text lines, BGRA, ink-cropped) and ground truth live in
`src/__tests__/fixtures/rec/`.

## Upstream issue (paste-ready)

> **Title**: PP-OCRv5/v6 unified rec ONNX models output non-ASCII text as CP1252-rendered UTF-8
> bytes (`PP-OCRv6_small_rec_onnx`)
>
> **Environment**
> - Model: `PaddlePaddle/PP-OCRv6_small_rec_onnx/inference.onnx` (sha256 `5435fd74…a24634`)
> - Dict: the model's own `inference.yml` / `preprocessor_config.json` character list (18710
>   entries); runtime table `['blank'] + dict + [' ']`
> - Runtime: onnxruntime 1.19.2 (Python, CPU) — identical with onnxruntime-web
> - Preprocess: height 48, aspect-preserving width, `(x/255 − 0.5) / 0.5`, BGR per
>   `inference.yml` (`img_mode: BGR`); padding to 320 also tried, no change
>
> **Problem**: decoding with `CTCLabelDecode` semantics, every non-ASCII character comes out as the
> CP1252 rendering of its UTF-8 bytes (`本` → `æœ¬`, `日` → `æ—¥`, `é` → `Ã©`, `ñ` → `Ã±`), while
> ASCII decodes perfectly (`The quick brown fox`, conf 1.00). The same happens with
> `PP-OCRv5_mobile_rec_onnx` + its dict and with RapidAI's PP-OCRv6 re-export. We confirmed the
> ONNX head weight is byte-identical to `inference.pdiparams`, the vocabulary matches
> `preprocessor_config.json`, and Python/onnxruntime-web agree bit-for-bit — so this does not look
> like an export or runtime artifact.
>
> Several byte values (0x81 0x8D 0x8F 0x90 0x9D 0x82 0x84 0x88 0x8B 0x98 0x9B 0xA0 0xA1 0xAD) have
> no entry in the character list, so those bytes are never emitted and the text cannot be
> reconstructed downstream.
>
> **Question**: what is the intended pairing/postprocess for these unified models in non-Paddle
> runtimes — is a byte-level decode step required, or should the released checkpoints emit
> characters directly? Minimal reproduction (fixture images, expected text, raw outputs) available
> on request.

## Repository status

- Product copy (UI spec text, `public/llm.txt`, models README) is English-first with a pointer here.
- CI guards ASCII recognition via fixtures; non-ASCII fixtures are report-only until this closes.
