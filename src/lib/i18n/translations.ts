export type Lang = 'en' | 'zh' | 'ja';

// English is the source of truth for the key set; `zh` must mirror its keys.
const en = {
  'hero.eyebrow': 'PRIVACY-FIRST OCR',
  'hero.headPre': 'EXTRACT TEXT FROM ANY',
  'hero.headWord': 'IMAGE',
  'hero.headPost': '',
  'hero.sub':
    'On-device OCR powered by PaddleOCR PP-OCRv6. Extract text from images and PDFs — source files never leave your browser.',

  'upload.idle': 'SCANNER · IDLE',
  'upload.drop': 'Drop an image to scan',
  'upload.hint': 'or paste from clipboard · click to browse',
  'upload.aria': 'Upload an image or PDF to scan',
  'upload.errFormat': 'Unsupported format. Please use PNG, JPEG, WebP, BMP, or PDF.',
  'upload.errSize': 'File too large. Maximum size is {mb}MB.',
  'upload.truncated':
    'Only the first {rendered} of {total} pages were processed. The result is incomplete.',

  'spec.local.label': 'ON-DEVICE',
  'spec.local.desc':
    'OCR runs entirely in your browser. Source files are never uploaded to any server.',
  'spec.model.label': 'PP-OCRv6',
  'spec.model.desc':
    'PP-OCRv6 small — English (ASCII) is reliable; other scripts are degraded by an upstream model issue. Cached after first load.',
  'spec.scripts.label': 'ENGLISH-FIRST',
  'spec.scripts.desc':
    'English text, numbers and symbols. Non-ASCII scripts are not reliably recognized yet.',

  'progress.loading-models': 'Loading models',
  'progress.detecting': 'Detecting text',
  'progress.recognizing': 'Recognizing text',
  'step.load': 'LOAD',
  'step.detect': 'DETECT',
  'step.recognize': 'RECOGNIZE',

  'source.boxes': '{n} boxes',
  'source.showBoxes': 'Show detection boxes',
  'source.hideBoxes': 'Hide detection boxes',
  'source.zoomIn': 'Zoom in',
  'source.zoomOut': 'Zoom out',
  'source.zoomReset': 'Reset zoom',
  'source.imageUnavailable': 'The source image could not be displayed.',
  'source.prevPage': 'Previous page',
  'source.nextPage': 'Next page',

  'output.doc': 'DOCUMENT',
  'output.json': 'JSON',
  'output.lines': 'LINES · {n}',
  'output.noLines': 'No text lines recognized.',
  'output.allPages': 'ALL PAGES',

  'common.copy': 'Copy',
  'common.copied': 'Copied!',
  'common.download': 'Download result',
  'common.error': 'ERROR',
  'error.ocrFailed': 'OCR processing failed',
  'error.modelDownload': 'Could not download the OCR models',
  'error.dictionary': 'Could not load the OCR character dictionary',
  'error.imageDecode': 'The image could not be decoded',
  'error.pdf': 'The PDF could not be processed',

  'scan.new': 'New scan',
  'scan.processing': 'Scanning…',

  'footer.status': 'PP-OCRv6 · WASM · ON-DEVICE',
} as const;

export type TranslationKey = keyof typeof en;

const zh: Record<TranslationKey, string> = {
  'hero.eyebrow': '隐私优先 OCR',
  'hero.headPre': '从任意',
  'hero.headWord': '图像',
  'hero.headPost': '中提取文字',
  'hero.sub':
    '基于 PaddleOCR PP-OCRv6 的浏览器端 OCR。从图片和 PDF 中提取文字——源文件始终留在您的浏览器中。',

  'upload.idle': '扫描器 · 待机',
  'upload.drop': '拖入图片开始扫描',
  'upload.hint': '或从剪贴板粘贴 · 点击选择文件',
  'upload.aria': '上传图片或 PDF 进行扫描',
  'upload.errFormat': '不支持的格式。请使用 PNG、JPEG、WebP、BMP 或 PDF。',
  'upload.errSize': '文件过大，最大 {mb}MB。',
  'upload.truncated': '仅处理了前 {rendered} 页（共 {total} 页），结果不完整。',

  'spec.local.label': '本地运行',
  'spec.local.desc': 'OCR 完全在您的浏览器中运行。源文件永远不会上传到任何服务器。',
  'spec.model.label': 'PP-OCRv6',
  'spec.model.desc':
    'PP-OCRv6 small——英文（ASCII）识别可靠；其他文字受上游模型问题影响暂不可靠。首次加载后缓存。',
  'spec.scripts.label': '英文优先',
  'spec.scripts.desc': '识别英文、数字与符号；非 ASCII 文字暂不能可靠识别。',

  'progress.loading-models': '加载模型',
  'progress.detecting': '检测文字',
  'progress.recognizing': '识别文字',
  'step.load': '加载',
  'step.detect': '检测',
  'step.recognize': '识别',

  'source.boxes': '{n} 个文本框',
  'source.showBoxes': '显示检测框',
  'source.hideBoxes': '隐藏检测框',
  'source.zoomIn': '放大',
  'source.zoomOut': '缩小',
  'source.zoomReset': '重置缩放',
  'source.imageUnavailable': '无法显示原始图片。',
  'source.prevPage': '上一页',
  'source.nextPage': '下一页',

  'output.doc': '文档解析',
  'output.json': 'JSON',
  'output.lines': '逐行识别 · {n}',
  'output.noLines': '未识别到文本行。',
  'output.allPages': '全部页面',

  'common.copy': '复制',
  'common.copied': '已复制！',
  'common.download': '下载结果',
  'common.error': '错误',
  'error.ocrFailed': 'OCR 处理失败',
  'error.modelDownload': '无法下载 OCR 模型',
  'error.dictionary': '无法加载 OCR 字符字典',
  'error.imageDecode': '无法解码该图片',
  'error.pdf': '无法处理该 PDF',

  'scan.new': '新扫描',
  'scan.processing': '扫描中…',

  'footer.status': 'PP-OCRv6 · WASM · 本地运行',
};

const ja: Record<TranslationKey, string> = {
  'hero.eyebrow': 'プライバシー重視の OCR',
  'hero.headPre': 'あらゆる',
  'hero.headWord': '画像',
  'hero.headPost': 'から文字を抽出',
  'hero.sub':
    'PaddleOCR PP-OCRv6 によるオンデバイス OCR。画像や PDF から文字を抽出——ソースファイルはブラウザ内に留まります。',

  'upload.idle': 'スキャナー · 待機中',
  'upload.drop': '画像をドロップしてスキャン',
  'upload.hint': 'またはクリップボードから貼り付け · クリックして選択',
  'upload.aria': 'スキャンする画像または PDF をアップロード',
  'upload.errFormat':
    '対応していない形式です。PNG、JPEG、WebP、BMP、PDF のいずれかを使用してください。',
  'upload.errSize': 'ファイルが大きすぎます。最大サイズは {mb}MB です。',
  'upload.truncated':
    '全 {total} ページ中、最初の {rendered} ページのみ処理しました。結果は不完全です。',

  'spec.local.label': 'オンデバイス',
  'spec.local.desc':
    'OCR はすべてブラウザ内で実行されます。ソースファイルがサーバーにアップロードされることはありません。',
  'spec.model.label': 'PP-OCRv6',
  'spec.model.desc':
    'PP-OCRv6 small——英語（ASCII）は正確に認識します。他の文字体系は上流モデルの問題により未対応です。初回読み込み後はキャッシュされます。',
  'spec.scripts.label': '英語中心',
  'spec.scripts.desc': '英語・数字・記号を認識。ASCII 外の文字は現状正確に認識できません。',

  'progress.loading-models': 'モデルを読み込み中',
  'progress.detecting': '文字を検出中',
  'progress.recognizing': '文字を認識中',
  'step.load': '読込',
  'step.detect': '検出',
  'step.recognize': '認識',

  'source.boxes': '{n} 個の枠',
  'source.showBoxes': '検出枠を表示',
  'source.hideBoxes': '検出枠を非表示',
  'source.zoomIn': '拡大',
  'source.zoomOut': '縮小',
  'source.zoomReset': 'ズームをリセット',
  'source.imageUnavailable': '元の画像を表示できませんでした。',
  'source.prevPage': '前のページ',
  'source.nextPage': '次のページ',

  'output.doc': 'ドキュメント',
  'output.json': 'JSON',
  'output.lines': '行 · {n}',
  'output.noLines': 'テキスト行が認識されませんでした。',
  'output.allPages': 'すべてのページ',

  'common.copy': 'コピー',
  'common.copied': 'コピーしました！',
  'common.download': '結果をダウンロード',
  'common.error': 'エラー',
  'error.ocrFailed': 'OCR 処理に失敗しました',
  'error.modelDownload': 'OCR モデルをダウンロードできませんでした',
  'error.dictionary': 'OCR 文字辞書を読み込めませんでした',
  'error.imageDecode': '画像をデコードできませんでした',
  'error.pdf': 'PDF を処理できませんでした',

  'scan.new': '新規スキャン',
  'scan.processing': 'スキャン中…',

  'footer.status': 'PP-OCRv6 · WASM · オンデバイス',
};

export const translations: Record<Lang, Record<TranslationKey, string>> = { en, zh, ja };

/** Translate a key for a language, with optional `{param}` interpolation. */
export function translate(
  lang: Lang,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  let str = translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.split(`{${name}}`).join(String(value));
    }
  }
  return str;
}
