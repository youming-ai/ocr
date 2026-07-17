/**
 * PP-OCR character dictionary (ppocr_keys_v1.txt).
 * Index 0 = blank token for CTC decoding.
 * Full dictionary: ~6628 characters (Chinese, English, symbols).
 *
 * For production, load the full dictionary from a static file.
 * This is a representative subset for testing.
 */
export const CHARACTER_DICT: string[] = [
  '', // 0: blank
  ' ',
  '!',
  '"',
  '#',
  '$',
  '%',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  '-',
  '.',
  '/',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ':',
  ';',
  '<',
  '=',
  '>',
  '?',
  '@',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  '[',
  '\\',
  ']',
  '^',
  '_',
  '`',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  '{',
  '|',
  '}',
  '~',
  // Chinese characters (representative subset — full dict has ~6500 more)
  '的',
  '一',
  '是',
  '不',
  '了',
  '人',
  '我',
  '在',
  '有',
  '他',
  '这',
  '为',
  '之',
  '大',
  '来',
  '以',
  '个',
  '中',
  '上',
  '们',
  '到',
  '说',
  '国',
  '和',
  '地',
  '也',
  '子',
  '时',
  '道',
  '出',
  '会',
  '三',
  '要',
  '于',
  '下',
  '得',
  '可',
  '你',
  '年',
  '生',
  '学',
  '对',
  '所',
  '自',
  '家',
  '之',
  '发',
  '成',
  '方',
  '多',
  '么',
  '去',
  '然',
  '经',
  '过',
  '法',
  '当',
  '起',
  '与',
  '好',
  '看',
  '定',
  '天',
  '明',
  '问',
  '同',
  '开',
  '从',
  '全',
  '长',
  '用',
  '世',
  '间',
  '日',
  '最',
  '新',
  '又',
  '其',
  '如',
  '行',
];

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
