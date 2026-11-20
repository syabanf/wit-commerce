import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectDelimiter, parseCsv, stripBom } from '../src/csv.ts'

describe('csv', () => {
  it('reads quoted cells with delimiters, doubled quotes and line breaks (RFC 4180)', () => {
    const text = 'handle,description\r\nTEE-1,"Soft, light ""cotton""\r\nsecond line"\r\nTEE-2,plain\r\n'
    assert.deepEqual(parseCsv(text), [
      ['handle', 'description'],
      ['TEE-1', 'Soft, light "cotton"\r\nsecond line'],
      ['TEE-2', 'plain'],
    ])
  })

  it('drops a byte order mark and skips blank lines', () => {
    const text = '﻿handle,sku\n\nTEE-1,TEE-1-M\n'
    assert.equal(stripBom(text).startsWith('handle'), true)
    assert.deepEqual(parseCsv(text), [
      ['handle', 'sku'],
      ['TEE-1', 'TEE-1-M'],
    ])
  })

  it('reads semicolon files, as Excel writes them in Indonesian locale', () => {
    const text = '﻿handle;price;description\nTEE-1;150000;"a; b"\n'
    assert.equal(detectDelimiter(text), ';')
    assert.deepEqual(parseCsv(text), [
      ['handle', 'price', 'description'],
      ['TEE-1', '150000', 'a; b'],
    ])
  })

  it('keeps empty cells and a last line without a line break', () => {
    assert.equal(detectDelimiter('a,b,c\n1;2'), ',')
    assert.deepEqual(parseCsv('a,,c\n,,'), [
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })

  it('stops after the limit, for a header preview', () => {
    assert.deepEqual(parseCsv('a,b\n1,2\n3,4\n', ',', 1), [['a', 'b']])
  })
})
