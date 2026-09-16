# PP-OCRv6 Small ONNX Models

On-device OCR models loaded by `src/lib/ocr/model-loader.ts` via ONNX Runtime Web.

- `det.onnx` — DBNet text detection. Input `x` [N,3,H,W]. ~9.9 MB.
- `rec.onnx` — CTC recognition (SVTR-LCNet). Input `x` [N,3,48,W]; output last dim
  **18710 = 18708 dict chars + blank (index 0) + trailing space**. ~21.2 MB.
- `ppocrv6_dict.txt` — 18708-entry character dictionary, matching the rec model's own
  `inference.yml` / `preprocessor_config.json` character list.
- `cls.onnx` is intentionally unused: this build ships no direction classifier, and the UI is a
  two-stage detect → recognise flow.

## Known issue: non-ASCII text

**All non-ASCII scripts currently decode as mojibake** (`本` → `æœ¬`, `é` → `Ã©`): the released
checkpoint emits each character's UTF-8 bytes rendered through CP1252, and 15 byte values have no
dictionary entry, so those bytes are never emitted and the text cannot be reconstructed. ASCII is
unaffected. Verified identical on PP-OCRv5 mobile, on RapidAI's re-export, and under both Python
onnxruntime and onnxruntime-web; the ONNX head weight is byte-identical to the official
`inference.pdiparams`.

Evidence, the filed upstream issue
([PaddlePaddle/PaddleOCR#18364](https://github.com/PaddlePaddle/PaddleOCR/issues/18364)) and the
reproducer (`bun scripts/verify-rec-model.ts`) are documented in
[docs/upstream-rec-non-ascii.md](https://github.com/youming-ai/ocr/blob/main/docs/upstream-rec-non-ascii.md).
Treat the app as **English/ASCII-first** until that closes.

Nominal dictionary coverage (pending the fix): Simplified/Traditional Chinese, English, Japanese
(hiragana + katakana), 46 Latin-script languages, Greek — 15565 CJK ideographs. Not covered
(needs a PP-OCRv5 per-language model): Korean, Cyrillic, Arabic, Devanagari, Thai, Tamil, Telugu.

## How to obtain

Official pre-exported ONNX on HuggingFace (no paddle2onnx conversion needed):

```bash
base=https://huggingface.co/PaddlePaddle
curl -L -o det.onnx "$base/PP-OCRv6_small_det_onnx/resolve/main/inference.onnx"
curl -L -o rec.onnx "$base/PP-OCRv6_small_rec_onnx/resolve/main/inference.onnx"
# the dict lives in the rec repo's inference.yml (character_dict), or fetch:
curl -L -o ppocrv6_dict.txt \
  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/ppocrv6_dict.txt"
```

Other tiers: `PP-OCRv6_{tiny,medium}_{det,rec}_onnx` (tiny's dict has no kana). When swapping
rec or dict, bump `DB_VERSION` in `model-loader.ts` to invalidate cached models.

Compatibility contract matched by `preprocessor.ts` / `pipeline.ts`: input name `x`, height 48,
BGR channel order, detector `(x/255 − mean)/std` with the model's ImageNet constants, recogniser
`(x/255 − 0.5)/0.5`, CTC blank at index 0 plus a trailing space.
