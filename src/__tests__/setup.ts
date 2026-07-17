// pdfjs-dist requires DOMMatrix even when only imported; Bun/Node test env lacks it.
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixStub {
    multiply(_other: DOMMatrixStub): DOMMatrixStub {
      return this;
    }
    translate(_tx?: number, _ty?: number, _tz?: number): DOMMatrixStub {
      return this;
    }
    scale(_scaleX?: number, _scaleY?: number, _scaleZ?: number): DOMMatrixStub {
      return this;
    }
  }
  globalThis.DOMMatrix = DOMMatrixStub as unknown as typeof DOMMatrix;
}
