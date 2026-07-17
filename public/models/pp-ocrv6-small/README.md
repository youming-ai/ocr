# PP-OCRv6 Small ONNX Models

On-device OCR models loaded by `src/lib/ocr/model-loader.ts` via ONNX Runtime Web.

- `det.onnx` — Text detection (DBNet). Input `x` [N,3,H,W]. ~9.9 MB.
- `rec.onnx` — Text recognition (SVTR-LCNet + CTC). Input `x` [N,3,48,W], output
  last dim **18710 = 18708 dict chars + blank(index 0) + trailing space**. ~21.2 MB.
- `ppocrv6_dict.txt` — Character dictionary for CTC decoding, **18708 entries**.
  Extracted verbatim from the rec model's `inference.yml` `character_dict`
  (identical to PaddleOCR `ppocr/utils/dict/ppocrv6_dict.txt`). The pipeline reads
  `numClasses` from the rec output at runtime, so no decode-code change is needed.
- Direction classification (`cls.onnx`) is intentionally not used in this pipeline.
  The small model build does not ship a cls model, and the UI is a two-stage
  detection → recognition flow.

## Language support

Unified multilingual recognition: **Simplified/Traditional Chinese, English,
Japanese (incl. hiragana 86 + katakana 94), and 46 Latin-script languages** (French,
German, Spanish, Vietnamese, …), plus Greek. Dict has 15565 CJK ideographs.

Not covered (need a PP-OCRv5 per-language rec model instead): Korean (Hangul),
Cyrillic (Russian/…), Arabic, Devanagari (Hindi/…), Thai, Tamil, Telugu.

## How to obtain

Official pre-exported ONNX on HuggingFace (no paddle2onnx conversion needed):

```bash
base=https://huggingface.co/PaddlePaddle
curl -L -o det.onnx "$base/PP-OCRv6_small_det_onnx/resolve/main/inference.onnx"
curl -L -o rec.onnx "$base/PP-OCRv6_small_rec_onnx/resolve/main/inference.onnx"
# dict lives in the rec repo's inference.yml (character_dict), or fetch:
curl -L -o ppocrv6_dict.txt \
  "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/ppocrv6_dict.txt"
```

Other tiers: `PP-OCRv6_{tiny,medium}_{det,rec}_onnx`. Tiny's rec dict lacks kana
(no Japanese); medium is larger/more accurate. When swapping rec + dict, bump
`DB_VERSION` in `model-loader.ts` to invalidate cached models for returning users.

Compatibility: input name `x`, height 48, normalization `(x/255 - 0.5)/0.5`, CTC
blank at index 0 + trailing space — all matched by `preprocessor.ts` / `pipeline.ts`.
Verify after any swap by OCR-ing a kana sample and confirming hiragana/katakana decode.
