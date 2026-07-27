/**
 * Load the full PP-OCR character dictionary from a static file.
 *
 * Dev/SPA servers answer 200 with index.html for missing static files, so a
 * 200 response is not enough — we must reject HTML and implausibly short
 * payloads, otherwise CTC decoding would index into garbage "characters".
 *
 * This function throws instead of returning a degraded fallback dictionary;
 * the caller (OcrEngine) surfaces the error so users know to check the model
 * files rather than silently receiving garbage output.
 */
export async function loadFullDictionary(baseUrl = '/models/pp-ocrv6-small'): Promise<string[]> {
  const response = await fetch(`${baseUrl}/ppocrv6_dict.txt`);
  if (!response.ok) {
    throw new Error(`Failed to load OCR dictionary: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(text)) {
    throw new Error(
      `OCR dictionary endpoint at ${baseUrl}/ppocrv6_dict.txt returned HTML instead of text. ` +
        'The dictionary file is missing or the SPA fallback is intercepting the request.'
    );
  }

  // Match PaddleOCR's CTCLabelDecode exactly: each line is one character
  // entry kept verbatim (including the full-width space at U+3000); only the
  // trailing newline is dropped — internal blank lines, if any, are real
  // entries and must NOT be filtered, or every later index would shift.
  // CTC blank occupies index 0; the half-width space is appended last.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length < 100) {
    throw new Error(
      `OCR dictionary has only ${lines.length} entries (expected 1000+). ` +
        'The dictionary file may be incomplete or the wrong model is deployed.'
    );
  }

  return ['', ...lines, ' '];
}
