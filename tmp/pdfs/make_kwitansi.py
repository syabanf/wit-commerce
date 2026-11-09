from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path('/Users/syabanf/Documents/works/red-commerce')
SOURCE_IMAGE = ROOT / 'tmp/pdfs/source-hi.png'
SIGNATURE_SOURCE_IMAGE = ROOT / 'tmp/pdfs/source-page2-hi.png'
OUTPUT = ROOT / 'output/pdf/Kwitansi_Perbaikan_RMP_Lantai_1_dan_Lantai_2.pdf'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = 612, 792
LEFT, RIGHT = 46, 566
COLS = [46, 71, 331, 374, 404, 474, 566]
GREEN = HexColor('#e3eedc')
PALE = HexColor('#f3f7f0')
DARK = HexColor('#202020')
LINE = HexColor('#888888')


floor_1 = [
    ('1', 'Area Kamar Tidur Tamu', [
        ('Pekerjaan Penggantian HPL Pintu', '1.60', 'm2', 400000, 640000),
        ('Pekerjaan Penggantian Daun Pintu', '1.60', 'm2', 500000, 800000),
    ]),
    ('2', 'Area Ruang Tamu', [
        ('Pekerjaan Pengecatan Dinding', '38.30', 'm2', 250000, 9573750),
        ('Pekerjaan Penggantian Plafon Gypsum', '7.50', 'm2', 250000, 1875000),
        ('Pekerjaan Pengecatan Plafon', '7.50', 'm2', 200000, 1500000),
        ('Pekerjaan Penggantian MCB', '6.00', 'unit', 500000, 3000000),
    ]),
    ('3', 'Area Ruang Makan', [
        ('Pekerjaan Pengecatan Dinding', '48.29', 'm2', 250000, 12071250),
        ('Pekerjaan Penggantian Plafon Gypsum', '13.13', 'm2', 200000, 2625000),
        ('Pekerjaan Pengecatan Plafon', '13.13', 'm2', 200000, 2625000),
    ]),
    ('4', 'Ruang Keluarga', [
        ('Pekerjaan Pengecatan Dinding', '56.61', 'm2', 250000, 14152500),
        ('Pekerjaan Penggantian Plafon Gypsum', '17.50', 'm2', 200000, 3500000),
        ('Pekerjaan Pengecatan Plafon', '17.50', 'm2', 200000, 3500000),
    ]),
    ('5', 'Area Dapur', [
        ('Pekerjaan Pengecatan Dinding', '38.30', 'm2', 250000, 9573750),
        ('Pekerjaan Penggantian Plafon Gypsum', '8.25', 'm2', 200000, 1650000),
        ('Pekerjaan Pengecatan Plafon', '8.25', 'm2', 200000, 1650000),
    ]),
]
floor_2 = [
    ('1', 'Area Ruang Duduk Atas', [
        ('Pekerjaan Pengecatan Dinding', '64.94', 'm2', 250000, 16233750),
        ('Pekerjaan Penggantian Plafon Gypsum', '23.63', 'm2', 200000, 4725000),
        ('Pekerjaan Pengecatan Plafon', '23.63', 'm2', 200000, 4725000),
    ]),
    ('2', 'Area Tangga', [
        ('Pekerjaan Pengecatan Dinding', '38.30', 'm2', 250000, 9573750),
        ('Pekerjaan Penggantian Plafon Gypsum', '8.13', 'm2', 200000, 1625000),
        ('Pekerjaan Pengecatan Plafon', '8.13', 'm2', 200000, 1625000),
    ]),
]


def rupiah(value):
    return f'Rp{value:,.0f}'.replace(',', '.')


sum_1 = sum(item[4] for _, _, rows in floor_1 for item in rows)
sum_2 = sum(item[4] for _, _, rows in floor_2 for item in rows)
assert (sum_1, sum_2, sum_1 + sum_2) == (68736250, 38507500, 107243750)


def line_text(c, text, x, y, font='Helvetica', size=8.2, align='left'):
    c.setFillColor(DARK)
    c.setFont(font, size)
    if align == 'right':
        c.drawRightString(x, y, text)
    elif align == 'center':
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)


def row(c, y, height, values=None, kind='normal'):
    bottom = y - height
    if kind in ('header', 'section', 'total'):
        c.setFillColor(GREEN if kind != 'total' else PALE)
        c.rect(LEFT, bottom, RIGHT - LEFT, height, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(LEFT, bottom, RIGHT, bottom)
    c.line(LEFT, y, RIGHT, y)
    if values:
        no, desc, vol, sat, unit, amount = values
        fs = 7.35 if kind == 'normal' else 7.6
        weight = 'Helvetica-Bold' if kind in ('header', 'section', 'total') else 'Helvetica'
        baseline = bottom + (height - fs) / 2 + 1.3
        if no:
            line_text(c, no, (COLS[0] + COLS[1]) / 2, baseline, weight, fs, 'center')
        if desc:
            line_text(c, desc, COLS[1] + 3, baseline, weight, fs)
        if vol:
            line_text(c, vol, COLS[3] - 3, baseline, weight, fs, 'right')
        if sat:
            line_text(c, sat, (COLS[3] + COLS[4]) / 2, baseline, weight, fs, 'center')
        if unit:
            line_text(c, unit, COLS[5] - 3, baseline, weight, fs, 'right')
        if amount:
            line_text(c, amount, COLS[6] - 3, baseline, weight, fs, 'right')
    return bottom


def detail_section(c, y, title, groups, subtotal):
    y = row(c, y, 14, ('', title, '', '', '', ''), 'section')
    for no, place, details in groups:
        y = row(c, y, 12.4, (no, place, '', '', '', ''))
        for work, vol, sat, unit, amount in details:
            y = row(c, y, 11.6, ('', '  > ' + work, vol, sat, rupiah(unit), rupiah(amount)))
    y = row(c, y, 14.5, ('', 'Subtotal ' + title, '', '', '', rupiah(subtotal)), 'total')
    return y


source = Image.open(SOURCE_IMAGE).convert('RGB')
header_height_pt = 113
crop_height_px = round(header_height_pt * source.width / PAGE_W)
header = source.crop((0, 0, source.width, crop_height_px))
signature_source = Image.open(SIGNATURE_SOURCE_IMAGE).convert('RGB')
signature_scale = signature_source.width / PAGE_W
signature = signature_source.crop(
    tuple(round(value * signature_scale) for value in (119, 509, 265, 554))
)

c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
c.setTitle('Kwitansi Perbaikan RMP - Lantai 1 dan Lantai 2')
c.setAuthor('CV. Ragam Media Promo')
c.drawImage(ImageReader(header), 0, PAGE_H - header_height_pt, width=PAGE_W, height=header_height_pt)

line_text(c, 'KWITANSI', PAGE_W / 2, 653, 'Helvetica-Bold', 15, 'center')
c.setStrokeColor(HexColor('#73916f'))
c.setLineWidth(1)
c.line(LEFT, 644, RIGHT, 644)

line_text(c, 'Nomor kwitansi : KWT/102/090426/RMP', LEFT, 629, size=8.6)
line_text(c, 'Tanggal : 07 Juli 2026', RIGHT, 629, size=8.6, align='right')
line_text(c, 'Telah diterima dari', LEFT, 615, size=8.6)
line_text(c, ':  Bpk Irfan', 149, 615, size=8.6)
line_text(c, 'Uang sejumlah', LEFT, 601, size=8.6)
line_text(c, ':  ' + rupiah(sum_1 + sum_2), 149, 601, 'Helvetica-Bold', 8.6)
line_text(c, 'Terbilang', LEFT, 587, size=8.6)
line_text(c, ':  Seratus Tujuh Juta Dua Ratus Empat Puluh Tiga Ribu', 149, 587, size=8.35)
line_text(c, '   Tujuh Ratus Lima Puluh Rupiah', 149, 574, size=8.35)
line_text(c, 'Untuk pembayaran pekerjaan perbaikan sesuai SPH No. 102/090426/RMP:', LEFT, 559, size=8.5)

top = 548
c.setStrokeColor(LINE)
c.setLineWidth(0.5)
y = row(c, top, 16, ('No', 'Pekerjaan', 'Vol', 'Sat', 'Harga Satuan', 'Jumlah Harga'), 'header')
y = detail_section(c, y, 'A. LANTAI BAWAH (LANTAI 1)', floor_1, sum_1)
y = detail_section(c, y, 'B. LANTAI ATAS (LANTAI 2)', floor_2, sum_2)
y = row(c, y, 18, ('', 'TOTAL', '', '', '', rupiah(sum_1 + sum_2)), 'total')
assert y >= 118, f'Table overlaps signature: {y}'
for x in COLS:
    c.line(x, top, x, y)
c.setStrokeColor(HexColor('#555555'))
c.rect(LEFT, y, RIGHT - LEFT, top - y, fill=0, stroke=1)

line_text(c, 'Nilai di atas belum termasuk PPN 11%.', LEFT, y - 13, size=7.9)
line_text(c, 'Bandung, 07 Juli 2026', 405, 105, size=8.4)
line_text(c, 'CV. Ragam Media Promo', 405, 91, size=8.4)
c.drawImage(ImageReader(signature), 405, 43, width=151, height=46)
line_text(c, 'Josef Machmud', 405, 32, size=8.4)
line_text(c, 'Page 1 of 1', PAGE_W / 2, 19, size=7.3, align='center')
c.save()
print(OUTPUT)
print('table_bottom', y)
