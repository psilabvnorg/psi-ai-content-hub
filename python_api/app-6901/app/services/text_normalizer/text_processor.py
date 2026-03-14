"""
Python equivalent of the JS text preprocessing pipeline.

Covers:
  - text-cleaner.js          → clean_text_for_tts(), chunk_text()
  - vietnamese-processor.js  → process_vietnamese_text()
  - vietnamese-detector.js   → is_vietnamese_word()
  - transliterator.js        → transliterate_word()
  - acronyms.csv / non-vietnamese-words.csv support

Usage:
    from text_processor import process_text_for_tts, chunk_text

    # Vietnamese
    chunks = chunk_text(process_text_for_tts("Xin chào 123 thế giới!"))

    # Other languages (English, Indonesian — basic clean only)
    from text_processor import clean_text_for_tts, chunk_text_i18n
    chunks = chunk_text_i18n(clean_text_for_tts("Hello world.", lang="en"))
"""

import csv
import re
import unicodedata
from pathlib import Path


# ---------------------------------------------------------------------------
# Vietnamese number words
# ---------------------------------------------------------------------------

_DIGITS = {
    '0': 'không', '1': 'một', '2': 'hai', '3': 'ba', '4': 'bốn',
    '5': 'năm',   '6': 'sáu', '7': 'bảy', '8': 'tám', '9': 'chín',
}
_TEENS = {
    10: 'mười', 11: 'mười một', 12: 'mười hai', 13: 'mười ba',
    14: 'mười bốn', 15: 'mười lăm', 16: 'mười sáu', 17: 'mười bảy',
    18: 'mười tám', 19: 'mười chín',
}
_TENS = {
    2: 'hai mươi', 3: 'ba mươi', 4: 'bốn mươi', 5: 'năm mươi',
    6: 'sáu mươi', 7: 'bảy mươi', 8: 'tám mươi', 9: 'chín mươi',
}


def number_to_words(num_str: str) -> str:
    num_str = num_str.lstrip('0') or '0'
    if num_str.startswith('-'):
        return 'âm ' + number_to_words(num_str[1:])
    try:
        num = int(num_str)
    except ValueError:
        return num_str

    if num == 0:
        return 'không'
    if num < 10:
        return _DIGITS[str(num)]
    if num < 20:
        return _TEENS[num]
    if num < 100:
        tens, units = divmod(num, 10)
        if units == 0:
            return _TENS[tens]
        if units == 1:
            return _TENS[tens] + ' mốt'
        if units == 4:
            return _TENS[tens] + ' tư'
        if units == 5:
            return _TENS[tens] + ' lăm'
        return _TENS[tens] + ' ' + _DIGITS[str(units)]
    if num < 1000:
        hundreds, rem = divmod(num, 100)
        r = _DIGITS[str(hundreds)] + ' trăm'
        if rem == 0:
            return r
        if rem < 10:
            return r + ' lẻ ' + _DIGITS[str(rem)]
        return r + ' ' + number_to_words(str(rem))
    if num < 1_000_000:
        thousands, rem = divmod(num, 1000)
        r = number_to_words(str(thousands)) + ' nghìn'
        if rem == 0:
            return r
        if rem < 100:
            if rem < 10:
                return r + ' không trăm lẻ ' + _DIGITS[str(rem)]
            return r + ' không trăm ' + number_to_words(str(rem))
        return r + ' ' + number_to_words(str(rem))
    if num < 1_000_000_000:
        millions, rem = divmod(num, 1_000_000)
        r = number_to_words(str(millions)) + ' triệu'
        if rem == 0:
            return r
        if rem < 100:
            if rem < 10:
                return r + ' không trăm lẻ ' + _DIGITS[str(rem)]
            return r + ' không trăm ' + number_to_words(str(rem))
        return r + ' ' + number_to_words(str(rem))
    if num < 1_000_000_000_000:
        billions, rem = divmod(num, 1_000_000_000)
        r = number_to_words(str(billions)) + ' tỷ'
        if rem == 0:
            return r
        if rem < 100:
            if rem < 10:
                return r + ' không trăm lẻ ' + _DIGITS[str(rem)]
            return r + ' không trăm ' + number_to_words(str(rem))
        return r + ' ' + number_to_words(str(rem))
    # Very large: digit by digit
    return ' '.join(_DIGITS.get(d, d) for d in num_str)


# ---------------------------------------------------------------------------
# Vietnamese processor (mirrors vietnamese-processor.js)
# ---------------------------------------------------------------------------

def _normalize_unicode(text: str) -> str:
    return unicodedata.normalize('NFC', text)


def _remove_special_chars(text: str) -> str:
    text = text.replace('&', ' và ')
    text = text.replace('@', ' a còng ')
    text = text.replace('#', ' thăng ')
    text = re.sub(r'\*', '', text)
    text = text.replace('_', ' ')
    text = re.sub(r'~|`|\^', '', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'www\.\S+', '', text)
    text = re.sub(r'\S+@\S+\.\S+', '', text)
    return text


def _normalize_punctuation(text: str) -> str:
    text = re.sub(r'[""„‟]', '"', text)
    text = re.sub(r"[''‚‛]", "'", text)
    text = re.sub(r'[–—−]', '-', text)
    text = re.sub(r'\.{3,}', '...', text)
    text = text.replace('…', '...')
    text = re.sub(r'([!?.]{2,})', lambda m: m.group(0)[0], text)
    return text


def _remove_thousand_separators(text: str) -> str:
    def _remove(m):
        return m.group(0).replace('.', '')
    return re.sub(r'\d{1,3}(?:\.\d{3})+(?=\s|$|[^\d.,])', _remove, text)


def _convert_ranges_with_units(text: str) -> str:
    measurement_units = [
        'm', 'cm', 'mm', 'km', 'dm', 'hm', 'dam', 'inch',
        'kg', 'g', 'mg', 't', 'tấn', 'yến', 'lạng',
        'ml', 'l', 'lít',
        'm²', 'm2', 'km²', 'km2', 'ha', 'cm²', 'cm2',
        'm³', 'm3', 'cm³', 'cm3', 'km³', 'km3',
        's', 'sec', 'min', 'h', 'hr', 'hrs',
        'km/h', 'kmh', 'm/s', 'ms', 'mm/h', 'cm/s',
        '°C', '°F', '°K', '°R', '°Re', '°Ro', '°N', '°D',
        'đồng', 'VND', 'vnđ', 'đ', 'USD', '$',
    ]
    all_units = sorted(set(measurement_units), key=len, reverse=True)
    unit_pattern = '|'.join(re.escape(u) for u in all_units)

    # Ranges: 1-10kg
    def _range_repl(m):
        n1, n2, unit = m.group(1), m.group(2), m.group(3)
        sep = '' if unit.lower() == 'đ' else ' '
        return f'{n1} đến {n2}{sep}{unit}'
    text = re.sub(rf'(\d+)\s*[-–—]\s*(\d+)\s*({unit_pattern})\b', _range_repl, text, flags=re.IGNORECASE)

    # Fractions: 1/10kg
    def _frac_repl(m):
        n1, n2, unit = m.group(1), m.group(2), m.group(3)
        sep = '' if unit.lower() == 'đ' else ' '
        return f'{n1} phần {n2}{sep}{unit}'
    text = re.sub(rf'(\d+)\s*[/:|]\s*(\d+)\s*({unit_pattern})\b', _frac_repl, text, flags=re.IGNORECASE)

    return text


def _convert_year_range(text: str) -> str:
    def _repl(m):
        return number_to_words(m.group(1)) + ' đến ' + number_to_words(m.group(2))
    return re.sub(r'(\d{4})\s*[-–—]\s*(\d{4})', _repl, text)


def _is_valid_date(day, month, year=None):
    d, mo = int(day), int(month)
    if year and not (1000 <= int(year) <= 9999):
        return False
    return 1 <= d <= 31 and 1 <= mo <= 12


def _convert_date(text: str) -> str:
    # date ranges: dd-dd/mm or dd-dd/mm/yyyy
    def _range_date(m):
        d1, d2, mo, yr = m.group(1), m.group(2), m.group(3), m.group(4)
        if _is_valid_date(d1, mo, yr) and _is_valid_date(d2, mo, yr):
            r = f'{number_to_words(d1)} đến {number_to_words(d2)} tháng {number_to_words(mo)}'
            if yr:
                r += f' năm {number_to_words(yr)}'
            return r
        return m.group(0)
    text = re.sub(r'(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*[/\-]\s*(\d{1,2})(?:\s*[/\-]\s*(\d{4}))?', _range_date, text)

    # DD/MM/YYYY
    def _full_date(m):
        d, mo, yr = m.group(1), m.group(2), m.group(3)
        if _is_valid_date(d, mo, yr):
            return f'ngày {number_to_words(d)} tháng {number_to_words(mo)} năm {number_to_words(yr)}'
        return m.group(0)
    text = re.sub(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', _full_date, text)

    # MM/YYYY
    def _month_year(m):
        mo, yr = m.group(1), m.group(2)
        if 1 <= int(mo) <= 12 and 1000 <= int(yr) <= 9999:
            return f'tháng {number_to_words(mo)} năm {number_to_words(yr)}'
        return m.group(0)
    text = re.sub(r'(?:tháng\s+)?(\d{1,2})\s*[/\-]\s*(\d{4})(?![/\-]\d)', _month_year, text)

    # DD/MM
    def _day_month(m):
        d, mo = m.group(1), m.group(2)
        if _is_valid_date(d, mo):
            return f'{number_to_words(d)} tháng {number_to_words(mo)}'
        return m.group(0)
    text = re.sub(r'(\d{1,2})\s*[/\-]\s*(\d{1,2})(?![/\-]\d)(?!\d*\s*%)', _day_month, text)

    # tháng X
    def _thang(m):
        mo = m.group(1)
        return 'tháng ' + number_to_words(mo) if 1 <= int(mo) <= 12 else m.group(0)
    text = re.sub(r'tháng\s*(\d+)', _thang, text)

    # ngày X
    def _ngay(m):
        d = m.group(1)
        return 'ngày ' + number_to_words(d) if 1 <= int(d) <= 31 else m.group(0)
    text = re.sub(r'ngày\s*(\d+)', _ngay, text)

    return text


def _convert_time(text: str) -> str:
    # HH:MM:SS or HH:MM
    def _hms(m):
        h, mi, s = m.group(1), m.group(2), m.group(3)
        r = number_to_words(h) + ' giờ'
        if mi:
            r += ' ' + number_to_words(mi) + ' phút'
        if s:
            r += ' ' + number_to_words(s) + ' giây'
        return r
    text = re.sub(r'(\d{1,2}):(\d{2})(?::(\d{2}))?', _hms, text)

    # 15h30
    def _hm(m):
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return number_to_words(str(h)) + ' giờ ' + number_to_words(str(mi))
        return m.group(0)
    text = re.sub(r'(\d{1,2})h(\d{2})(?![a-zà-ỹ])', _hm, text, flags=re.IGNORECASE)

    # 15h
    def _h(m):
        h = int(m.group(1))
        if 0 <= h <= 23:
            return number_to_words(str(h)) + ' giờ'
        return m.group(0)
    text = re.sub(r'(\d{1,2})h(?![a-zà-ỹ\d])', _h, text, flags=re.IGNORECASE)

    # X giờ Y phút
    text = re.sub(r'(\d+)\s*giờ\s*(\d+)\s*phút',
                  lambda m: number_to_words(m.group(1)) + ' giờ ' + number_to_words(m.group(2)) + ' phút', text)
    # X giờ
    text = re.sub(r'(\d+)\s*giờ(?!\s*\d)',
                  lambda m: number_to_words(m.group(1)) + ' giờ', text)
    return text


def _convert_roman_numerals(text: str, unlimited: bool = False) -> str:
    _MAP = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    _VALID_PAIRS = {'I': {'V', 'X'}, 'X': {'L', 'C'}, 'C': {'D', 'M'}}

    def _roman_to_arabic(s):
        s = s.upper()
        if not re.match(r'^[IVXLCDM]+$', s):
            return None
        if re.search(r'([IVXLCD])\1{3,}', s) or re.search(r'VV|LL|DD', s):
            return None
        result, i = 0, 0
        while i < len(s):
            cur = _MAP[s[i]]
            nxt = _MAP[s[i + 1]] if i + 1 < len(s) else 0
            if cur < nxt:
                if s[i] not in _VALID_PAIRS or s[i + 1] not in _VALID_PAIRS[s[i]]:
                    return None
                result += nxt - cur
                i += 2
            else:
                result += cur
                i += 1
        return result if result > 0 else None

    def _repl(m):
        before, roman = m.group(1), m.group(2)
        if before and re.search(r'[\wà-ỹ]', before):
            return m.group(0)
        if roman != roman.upper():
            return m.group(0)
        arabic = _roman_to_arabic(roman)
        if arabic is None:
            return m.group(0)
        if not unlimited and not (1 <= arabic <= 30):
            return m.group(0)
        return (before or '') + str(arabic)

    return re.sub(r'(^|[\s\W])([IVXLCDMivxlcdm]+)(?=[\s\W]|$)', _repl, text)


def _convert_ordinal(text: str) -> str:
    _ORD = {'1':'nhất','2':'hai','3':'ba','4':'tư','5':'năm',
            '6':'sáu','7':'bảy','8':'tám','9':'chín','10':'mười'}
    def _repl(m):
        prefix, num = m.group(1), m.group(2)
        return prefix + ' ' + (_ORD.get(num) or number_to_words(num))
    return re.sub(r'(thứ|lần|bước|phần|chương|tập|số)\s*(\d+)', _repl, text, flags=re.IGNORECASE)


def _convert_currency(text: str) -> str:
    def _vnd(m):
        return number_to_words(m.group(1).replace(',', '')) + ' đồng'
    def _usd(m):
        return number_to_words(m.group(1).replace(',', '')) + ' đô la'

    text = re.sub(r'(\d+(?:,\d+)?)\s*(?:đồng|VND|vnđ)\b', _vnd, text, flags=re.IGNORECASE)
    text = re.sub(r'(\d+(?:,\d+)?)đ(?![a-zà-ỹ])', _vnd, text, flags=re.IGNORECASE)
    text = re.sub(r'\$\s*(\d+(?:,\d+)?)', _usd, text)
    text = re.sub(r'(\d+(?:,\d+)?)\s*(?:USD|\$)', _usd, text, flags=re.IGNORECASE)
    return text


def _convert_percentage(text: str) -> str:
    # Ranges: 3-5%
    text = re.sub(r'(\d+)\s*[-–—]\s*(\d+)\s*%',
                  lambda m: f'{number_to_words(m.group(1))} đến {number_to_words(m.group(2))} phần trăm', text)
    # Decimal: 3,2%
    text = re.sub(r'(\d+),(\d+)\s*%',
                  lambda m: f'{number_to_words(m.group(1))} phẩy {number_to_words(m.group(2).lstrip("0") or "0")} phần trăm', text)
    # Whole: 50%
    text = re.sub(r'(\d+)\s*%',
                  lambda m: number_to_words(m.group(1)) + ' phần trăm', text)
    return text


def _convert_phone(text: str) -> str:
    def _digits(m):
        return ' '.join(_DIGITS.get(d, d) for d in re.findall(r'\d', m.group(0)))
    text = re.sub(r'0\d{9,10}', _digits, text)
    text = re.sub(r'\+84\d{9,10}', _digits, text)
    return text


def _convert_decimal(text: str) -> str:
    def _repl(m):
        int_part = number_to_words(m.group(1))
        dec_part = number_to_words(m.group(2).lstrip('0') or '0')
        return f'{int_part} phẩy {dec_part}'
    return re.sub(r'(\d+),(\d+)(?=\s|$|[^\d,])', _repl, text)


def _convert_measurement_units(text: str) -> str:
    unit_map = {
        'km/h': 'ki-lô-mét trên giờ', 'kmh': 'ki-lô-mét trên giờ',
        'm/s': 'mét trên giây',        'mm/h': 'mi-li-mét trên giờ',
        'cm/s': 'xăng-ti-mét trên giây',
        'km²': 'ki-lô-mét vuông',      'km2': 'ki-lô-mét vuông',
        'km³': 'ki-lô-mét khối',       'km3': 'ki-lô-mét khối',
        'cm²': 'xăng-ti-mét vuông',    'cm2': 'xăng-ti-mét vuông',
        'cm³': 'xăng-ti-mét khối',     'cm3': 'xăng-ti-mét khối',
        'm²':  'mét vuông',            'm2':  'mét vuông',
        'm³':  'mét khối',             'm3':  'mét khối',
        'dam': 'đề-ca-mét',            'hm':  'héc-tô-mét',
        'dm':  'đề-xi-mét',            'km':  'ki-lô-mét',
        'cm':  'xăng-ti-mét',          'mm':  'mi-li-mét',
        'mg':  'mi-li-gam',            'ml':  'mi-li-lít',
        'sec': 'giây',                 'min': 'phút',
        'hrs': 'giờ',                  'hr':  'giờ',
        'ms':  'mét trên giây',
        'ha':  'héc-ta',               'inch':'in',
        'kg':  'ki-lô-gam',            'lít': 'lít',
        'tấn': 'tấn',                  'yến': 'yến',
        'lạng':'lạng',
        '°C':  'độ C',                 '°F':  'độ F',
        '°K':  'độ K',                 '°R':  'độ R',
        'm':   'mét',                  'g':   'gam',
        'l':   'lít',                  't':   'tấn',
        'h':   'giờ',                  's':   'giây',
    }
    for unit in sorted(unit_map, key=len, reverse=True):
        esc = re.escape(unit)
        if len(unit) == 1:
            pattern = rf'(\d+)\s*{esc}(?!\s*[a-zA-Zà-ỹ])(?=\s*[^a-zA-Zà-ỹ]|$)'
        else:
            pattern = rf'(\d+)\s*{esc}(?=\s|[^\w]|$)'
        text = re.sub(pattern, lambda m, u=unit: m.group(1) + ' ' + unit_map[u], text, flags=re.IGNORECASE)
    return text


def _convert_standalone_numbers(text: str) -> str:
    return re.sub(r'\b\d+\b', lambda m: number_to_words(m.group(0)), text)


def _clean_whitespace(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def process_vietnamese_text(text: str, unlimited_roman: bool = False) -> str:
    """Mirror of processVietnameseText() in vietnamese-processor.js"""
    if not text:
        return ''
    text = _normalize_unicode(text)
    text = _remove_special_chars(text)
    text = _normalize_punctuation(text)
    text = _remove_thousand_separators(text)
    text = _convert_ranges_with_units(text)
    text = _convert_year_range(text)
    text = _convert_date(text)
    text = _convert_time(text)
    text = _convert_roman_numerals(text, unlimited=unlimited_roman)
    text = _convert_ordinal(text)
    text = _convert_currency(text)
    text = _convert_percentage(text)
    text = _convert_phone(text)
    text = _convert_decimal(text)
    text = _convert_measurement_units(text)
    text = _convert_standalone_numbers(text)
    text = _clean_whitespace(text)
    return text


# ---------------------------------------------------------------------------
# Vietnamese word detector (mirrors vietnamese-detector.js)
# ---------------------------------------------------------------------------

_VN_ACCENT_RE  = re.compile(r'[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]', re.IGNORECASE)
_EN_SPECIAL_RE = re.compile(r'[fwzj]', re.IGNORECASE)
_VN_ONSETS     = {
    'b','c','d','đ','g','h','k','l','m','n','p','q','r','s','t','v','x',
    'ch','gh','gi','kh','ng','nh','ph','qu','th','tr',
}
_VN_ENDINGS    = {'p','t','c','m','n','ng','ch','nh'}
_VN_VOWELS_RE  = re.compile(r'^([^ueoaiy]*)([ueoaiy]+)([^ueoaiy]*)$')


def is_vietnamese_word(word: str) -> bool:
    if not word:
        return False
    w = word.lower().strip()
    if _VN_ACCENT_RE.search(w):
        return True
    if _EN_SPECIAL_RE.search(w):
        return False
    m = _VN_VOWELS_RE.match(w)
    if not m:
        return False
    onset, vowel, ending = m.group(1), m.group(2), m.group(3)
    if onset and onset not in _VN_ONSETS:
        return False
    if ending and ending not in _VN_ENDINGS:
        return False
    if re.search(r'ee|oo|ea|oa|ae|ie', vowel):
        if vowel not in ('oa', 'oe', 'ua', 'uy'):
            return False
    return True


# ---------------------------------------------------------------------------
# Transliterator (mirrors transliterator.js)
# ---------------------------------------------------------------------------

_HIGH_PRIORITY_RULES = [
    (re.compile(r'tion$'), 'ân'),   (re.compile(r'sion$'), 'ân'),
    (re.compile(r'age$'),  'ây'),   (re.compile(r'ing$'),  'ing'),
    (re.compile(r'ture$'), 'chờ'),  (re.compile(r'cial$'), 'xô'),
    (re.compile(r'tial$'), 'xô'),
    (re.compile(r'aught'), 'ót'),   (re.compile(r'ought'), 'ót'),
    (re.compile(r'ound'),  'ao'),   (re.compile(r'ight'),  'ai'),
    (re.compile(r'eigh'),  'ây'),   (re.compile(r'ough'),  'ao'),
    (re.compile(r'\bst(?!r)'), 't'),(re.compile(r'\bstr'), 'tr'),
    (re.compile(r'\bsch'), 'c'),    (re.compile(r'\bsc(?=h)'), 'c'),
    (re.compile(r'\bsc|\bsk'), 'c'),(re.compile(r'\bsp'), 'p'),
    (re.compile(r'\btr'), 'tr'),    (re.compile(r'\bbr'), 'r'),
    (re.compile(r'\bcr|\bpr|\bgr|\bdr|\bfr'), 'r'),
    (re.compile(r'\bbl|\bcl|\bsl|\bpl'), 'l'),
    (re.compile(r'\bfl'), 'ph'),
    (re.compile(r'ck'), 'c'),       (re.compile(r'sh'), 's'),
    (re.compile(r'ch'), 'ch'),      (re.compile(r'th'), 'th'),
    (re.compile(r'ph'), 'ph'),      (re.compile(r'wh'), 'q'),
    (re.compile(r'qu'), 'q'),       (re.compile(r'kn'), 'n'),
    (re.compile(r'wr'), 'r'),
]

_ENDING_RULES = [
    (re.compile(r'le$'), 'ồ'),
    (re.compile(r'ook$'), 'úc'),   (re.compile(r'ood$'), 'út'),
    (re.compile(r'ool$'), 'un'),   (re.compile(r'oom$'), 'um'),
    (re.compile(r'oon$'), 'un'),   (re.compile(r'oot$'), 'út'),
    (re.compile(r'iend$'), 'en'),  (re.compile(r'end$'), 'en'),
    (re.compile(r'eau$'), 'iu'),
    (re.compile(r'ail$'), 'ain'),  (re.compile(r'ain$'), 'ain'),
    (re.compile(r'ait$'), 'ât'),
    (re.compile(r'oat$'), 'ốt'),   (re.compile(r'oad$'), 'ốt'),
    (re.compile(r'oal$'), 'ôn'),
    (re.compile(r'eep$'), 'íp'),   (re.compile(r'eet$'), 'ít'),
    (re.compile(r'eel$'), 'in'),
    (re.compile(r'atch$'), 'át'),  (re.compile(r'etch$'), 'éch'),
    (re.compile(r'itch$'), 'ích'), (re.compile(r'otch$'), 'ốt'),
    (re.compile(r'utch$'), 'út'),
    (re.compile(r'edge$'), 'ét'),  (re.compile(r'idge$'), 'ít'),
    (re.compile(r'odge$'), 'ót'),  (re.compile(r'udge$'), 'út'),
    (re.compile(r'ack$'), 'ác'),   (re.compile(r'eck$'), 'éc'),
    (re.compile(r'ick$'), 'ích'),  (re.compile(r'ock$'), 'óc'),
    (re.compile(r'uck$'), 'úc'),
    (re.compile(r'ash$'), 'át'),   (re.compile(r'esh$'), 'ét'),
    (re.compile(r'ish$'), 'ít'),   (re.compile(r'osh$'), 'ốt'),
    (re.compile(r'ush$'), 'út'),
    (re.compile(r'ath$'), 'át'),   (re.compile(r'eth$'), 'ét'),
    (re.compile(r'ith$'), 'ít'),   (re.compile(r'oth$'), 'ót'),
    (re.compile(r'uth$'), 'út'),
    (re.compile(r'ate$'), 'ây'),   (re.compile(r'ete$'), 'ét'),
    (re.compile(r'ite$'), 'ai'),   (re.compile(r'ote$'), 'ốt'),
    (re.compile(r'ute$'), 'út'),
    (re.compile(r'ade$'), 'ây'),   (re.compile(r'ede$'), 'ét'),
    (re.compile(r'ide$'), 'ai'),   (re.compile(r'ode$'), 'ốt'),
    (re.compile(r'ude$'), 'út'),
    (re.compile(r'ake$'), 'ây'),   (re.compile(r'ame$'), 'am'),
    (re.compile(r'ane$'), 'an'),   (re.compile(r'ape$'), 'ếp'),
    (re.compile(r'ike$'), 'íc'),   (re.compile(r'ime$'), 'am'),
    (re.compile(r'ine$'), 'ai'),   (re.compile(r'oke$'), 'ốc'),
    (re.compile(r'ome$'), 'om'),   (re.compile(r'one$'), 'oăn'),
    (re.compile(r'uke$'), 'ấc'),   (re.compile(r'ume$'), 'uym'),
    (re.compile(r'une$'), 'uyn'),
    (re.compile(r'ase$'), 'ây'),   (re.compile(r'ise$'), 'ai'),
    (re.compile(r'ose$'), 'âu'),
    (re.compile(r'all$'), 'âu'),   (re.compile(r'ell$'), 'eo'),
    (re.compile(r'ill$'), 'iu'),   (re.compile(r'oll$'), 'ôn'),
    (re.compile(r'ull$'), 'un'),
    (re.compile(r'ang$'), 'ang'),  (re.compile(r'eng$'), 'ing'),
    (re.compile(r'ong$'), 'ong'),  (re.compile(r'ung$'), 'âng'),
    (re.compile(r'air$'), 'e'),    (re.compile(r'ear$'), 'ia'),
    (re.compile(r'ire$'), 'ai'),   (re.compile(r'ure$'), 'iu'),
    (re.compile(r'our$'), 'ao'),   (re.compile(r'ore$'), 'o'),
    (re.compile(r'ork$'), 'ót'),
    (re.compile(r'ee$'), 'i'),     (re.compile(r'ea$'), 'i'),
    (re.compile(r'oo$'), 'u'),     (re.compile(r'oa$'), 'oa'),
    (re.compile(r'oe$'), 'oe'),    (re.compile(r'ai$'), 'ai'),
    (re.compile(r'ay$'), 'ay'),    (re.compile(r'au$'), 'au'),
    (re.compile(r'aw$'), 'â'),     (re.compile(r'ei$'), 'ây'),
    (re.compile(r'ey$'), 'ây'),    (re.compile(r'oi$'), 'oi'),
    (re.compile(r'oy$'), 'oi'),    (re.compile(r'ou$'), 'u'),
    (re.compile(r'ow$'), 'ô'),     (re.compile(r'ue$'), 'ue'),
    (re.compile(r'ui$'), 'ui'),    (re.compile(r'ie$'), 'ai'),
    (re.compile(r'eu$'), 'iu'),
    (re.compile(r'ar$'), 'a'),     (re.compile(r'er$'), 'ơ'),
    (re.compile(r'ir$'), 'ơ'),     (re.compile(r'or$'), 'o'),
    (re.compile(r'ur$'), 'ơ'),
    (re.compile(r'al$'), 'an'),    (re.compile(r'el$'), 'eo'),
    (re.compile(r'il$'), 'iu'),    (re.compile(r'ol$'), 'ôn'),
    (re.compile(r'ul$'), 'un'),
    (re.compile(r'ab$'), 'áp'),    (re.compile(r'ad$'), 'át'),
    (re.compile(r'ag$'), 'ác'),    (re.compile(r'ak$'), 'át'),
    (re.compile(r'ap$'), 'áp'),    (re.compile(r'at$'), 'át'),
    (re.compile(r'eb$'), 'ép'),    (re.compile(r'ed$'), 'ét'),
    (re.compile(r'eg$'), 'ét'),    (re.compile(r'ek$'), 'éc'),
    (re.compile(r'ep$'), 'ép'),    (re.compile(r'et$'), 'ét'),
    (re.compile(r'ib$'), 'íp'),    (re.compile(r'id$'), 'ít'),
    (re.compile(r'ig$'), 'íc'),    (re.compile(r'ik$'), 'íc'),
    (re.compile(r'ip$'), 'íp'),    (re.compile(r'it$'), 'ít'),
    (re.compile(r'ob$'), 'óp'),    (re.compile(r'od$'), 'ót'),
    (re.compile(r'og$'), 'óc'),    (re.compile(r'ok$'), 'óc'),
    (re.compile(r'op$'), 'óp'),    (re.compile(r'ot$'), 'ót'),
    (re.compile(r'ub$'), 'úp'),    (re.compile(r'ud$'), 'út'),
    (re.compile(r'ug$'), 'úc'),    (re.compile(r'uk$'), 'úc'),
    (re.compile(r'up$'), 'úp'),    (re.compile(r'ut$'), 'út'),
    (re.compile(r'am$'), 'am'),    (re.compile(r'an$'), 'an'),
    (re.compile(r'em$'), 'em'),    (re.compile(r'en$'), 'en'),
    (re.compile(r'im$'), 'im'),    (re.compile(r'in$'), 'in'),
    (re.compile(r'om$'), 'om'),    (re.compile(r'on$'), 'on'),
    (re.compile(r'um$'), 'âm'),    (re.compile(r'un$'), 'ân'),
    (re.compile(r'as$'), 'ẹt'),    (re.compile(r'es$'), 'ẹt'),
    (re.compile(r'is$'), 'ít'),    (re.compile(r'os$'), 'ọt'),
    (re.compile(r'us$'), 'ợt'),
    (re.compile(r'aa$'), 'a'),     (re.compile(r'ii$'), 'i'),
    (re.compile(r'uu$'), 'u'),
]

_GENERAL_RULES = [
    (re.compile(r'j'), 'd'),  (re.compile(r'z'), 'd'),
    (re.compile(r'w'), 'u'),  (re.compile(r'x'), 'x'),
    (re.compile(r'v'), 'v'),  (re.compile(r'f'), 'ph'),
    (re.compile(r's'), 'x'),  (re.compile(r'c'), 'k'),
    (re.compile(r'q'), 'ku'),
    (re.compile(r'a'), 'a'),  (re.compile(r'e'), 'e'),
    (re.compile(r'i'), 'i'),  (re.compile(r'o'), 'o'),
    (re.compile(r'u'), 'u'),
]

_VN_VOWELS_STR = 'aeiouăâêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ'
_VALID_ENDINGS_SET = {'p','t','c','m','n','g','s'}
_VALID_PAIRS_SET = {'ch','th','ph','sh','ng','tr','nh','gh','kh'}
_CONSONANTS = set('bcdfghjklmnpqrstvwxz')


def _apply_rules(w, rules):
    for pat, rep in rules:
        w = pat.sub(rep, w)
    return w


def _process_syllable(s: str) -> str:
    s = s.strip()
    if not s:
        return ''
    if s.startswith('y'):
        s = 'd' + s[1:]
    s = _apply_rules(s, _HIGH_PRIORITY_RULES)
    s = _apply_rules(s, _ENDING_RULES)
    s = _apply_rules(s, _GENERAL_RULES)
    s = re.sub(r'([bcdfghjklmnpqrstvwxz])y', r'\1i', s)
    s = re.sub(r'y$', 'i', s)

    # Remove invalid double consonants
    s = re.sub(r'([brlptdgmnckxsvfzjwqh])\1+', r'\1', s)

    # Filter invalid consonant clusters
    result, i = '', 0
    while i < len(s):
        if i < len(s) - 1 and s[i] in _CONSONANTS and s[i+1] in _CONSONANTS:
            pair = s[i:i+2]
            if pair in _VALID_PAIRS_SET:
                result += pair
                i += 2
            else:
                result += s[i+1]
                i += 2
        else:
            result += s[i]
            i += 1
    s = result

    # c/k rule
    if not any(s.startswith(p) for p in ('ch','th','ph','sh')):
        if s and s[0] in ('k', 'c'):
            next_c = s[1:2]
            s = ('k' if next_c in ('i','e','y') else 'c') + s[1:]

    # Validate final consonant
    if len(s) > 1 and s[-1] not in _VN_VOWELS_STR:
        last = s[-1]
        if last not in _VALID_ENDINGS_SET:
            s = s[:-1] + ('n' if last == 'l' else '')

    return s


def _english_to_vietnamese(word: str) -> str:
    w = word.lower().strip()
    if w.startswith('y'):
        w = 'd' + w[1:]
    if w.startswith('d'):
        w = 'đ' + w[1:]

    w = _apply_rules(w, _HIGH_PRIORITY_RULES)
    w = _apply_rules(w, _ENDING_RULES)
    w = _apply_rules(w, _GENERAL_RULES)
    w = re.sub(r'([bcdfghjklmnpqrstvwxz])y', r'\1i', w)
    w = re.sub(r'y$', 'i', w)

    vowel_class = _VN_VOWELS_STR
    syllable_pattern = re.compile(rf'[^{re.escape(vowel_class)}]*[{re.escape(vowel_class)}]+[ptcmngs]?(?![{re.escape(vowel_class)}])')
    parts = syllable_pattern.findall(w)
    if not parts:
        return w

    final_parts = [p for p in (_process_syllable(p) for p in parts) if p]
    return '-'.join(final_parts)


def transliterate_word(word: str) -> str:
    if not word:
        return word or ''
    if is_vietnamese_word(word):
        return word
    return _english_to_vietnamese(word)


# ---------------------------------------------------------------------------
# text-cleaner.js equivalents
# ---------------------------------------------------------------------------

_EMOJI_RE = re.compile(
    r'[\U0001F600-\U0001F64F]|[\U0001F300-\U0001F5FF]|[\U0001F680-\U0001F6FF]'
    r'|[\U0001F1E0-\U0001F1FF]|[\U00002600-\U000026FF]|[\U00002700-\U000027BF]'
    r'|[\U0001F900-\U0001F9FF]|[\uFE0F]|[\u200D]',
    re.UNICODE
)

_TRANSLITERATION_SKIP = {'mc'}


def clean_text_for_tts(text: str, lang: str = 'vi') -> str:
    """
    Mirror of cleanTextForTTS().
    lang='vi'  → Vietnamese version (keeps dashes between numbers)
    lang='en'  → i18n version (converts / to 'slash', strips dashes)
    """
    if not text:
        return ''
    text = _EMOJI_RE.sub('', text)
    if lang != 'vi':
        text = re.sub(r'\b/\b', ' slash ', text)
        text = re.sub(r'[/\\()¯]', '', text)
        text = re.sub(r'["""]', '', text)
        text = re.sub(r'\b_\b', ' ', text)
        text = re.sub(r'\b-\b', ' ', text)
        text = re.sub(r'[^\u0000-\u024F]', '', text)
    else:
        text = re.sub(r'[\\()¯]', '', text)
        text = re.sub(r'["""]', '', text)
        text = re.sub(r'\s—', '.', text)
        text = re.sub(r'\b_\b', ' ', text)
        text = re.sub(r'(?<!\d)-(?!\d)', ' ', text)
        text = re.sub(r'[^\u0000-\u024F\u1E00-\u1EFF]', '', text)
    # Replace commas with periods so chunk_text / chunk_text_i18n splits
    # at every comma boundary → shorter chunks → better per-sentence prosody.
    text = text.replace(',', '.')
    return text.strip()


def _load_csv_map(path: str) -> dict[str, str]:
    """Load a two-column CSV (original, replacement) into a dict sorted by key length desc."""
    result = {}
    try:
        with open(path, newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            next(reader, None)  # skip header
            for row in reader:
                if len(row) >= 2 and row[0].strip() and row[1].strip():
                    result[row[0].strip().lower()] = row[1].strip()
    except FileNotFoundError:
        pass
    return dict(sorted(result.items(), key=lambda x: len(x[0]), reverse=True))


def convert_acronyms(text: str, acronym_map: dict) -> str:
    for acronym, replacement in acronym_map.items():
        esc = re.sub(r'[+?^${}()|[\]\\]', lambda m: '\\' + m.group(0), acronym)
        text = re.sub(rf'\b{esc}\b', replacement, text, flags=re.IGNORECASE)
    return text


def replace_non_vietnamese_words(text: str, replacement_map: dict) -> str:
    for original, replacement in replacement_map.items():
        esc = re.escape(original)
        def _repl(m, rep=replacement):
            return rep[0].upper() + rep[1:] if m.group(0)[0].isupper() else rep
        text = re.sub(rf'\b{esc}\b', _repl, text, flags=re.IGNORECASE)
    return text


def apply_transliteration(text: str, replacement_map: dict) -> str:
    word_re = re.compile(r'(?:^|[^\w\u00C0-\u1EFF])([\w\u00C0-\u1EFF]+)(?=[^\w\u00C0-\u1EFF]|$)')
    processed = set()

    for m in word_re.finditer(text):
        word = m.group(1)
        word_lower = word.lower()
        if word_lower in processed:
            continue
        processed.add(word_lower)
        if word_lower in replacement_map:
            continue
        if is_vietnamese_word(word) or is_vietnamese_word(word_lower):
            continue
        if len(word) == 1:
            continue
        if word_lower in _TRANSLITERATION_SKIP:
            continue
        transliterated = transliterate_word(word)
        esc = re.escape(word)
        not_word = r'[^\w\u00C0-\u1EFF]'
        pat = re.compile(rf'(?:^|({not_word}))({esc})(?={not_word}|$)', re.IGNORECASE)
        def _repl(mo, t=transliterated):
            boundary = mo.group(1) or ''
            wp = mo.group(2)
            result = t[0].upper() + t[1:] if wp and wp[0].isupper() else t
            return boundary + result
        text = pat.sub(_repl, text)

    return text


def process_text_for_tts(
    text: str,
    acronym_map: dict = None,
    replacement_map: dict = None,
    enable_transliteration: bool = True,
    unlimited_roman: bool = False,
) -> str:
    """
    Full Vietnamese preprocessing pipeline.
    Mirror of processTextForTTS() in text-cleaner.js.

    Pass acronym_map / replacement_map loaded from your CSV files,
    or leave None to skip those steps.
    """
    if not text:
        return ''

    # Step 1: basic clean
    text = clean_text_for_tts(text, lang='vi')

    # Step 2: Vietnamese number/date/time/etc normalisation
    text = process_vietnamese_text(text, unlimited_roman=unlimited_roman)

    # Step 2.5: lowercase for map matching
    text = text.lower()

    # Step 3: acronym expansion
    if acronym_map:
        text = convert_acronyms(text, acronym_map)

    # Step 4: non-Vietnamese word replacement from CSV
    if replacement_map:
        text = replace_non_vietnamese_words(text, replacement_map)

    # Step 4.5: transliterate remaining foreign words
    if enable_transliteration:
        text = apply_transliteration(text, replacement_map or {})

    return text


def chunk_text(text: str) -> list[str]:
    """
    Mirror of chunkText() in text-cleaner.js (Vietnamese version).
    Splits on .!? boundaries, adds trailing period if missing.
    """
    if not text:
        return []
    chunks = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if not re.search(r'[.!?]$', line):
            line += '.'
        for sentence in re.split(r'(?<=[.!?])(?=\s|$)', line):
            s = sentence.strip()
            if s:
                chunks.append(s)
    return chunks


def chunk_text_i18n(text: str) -> list[str]:
    """
    Mirror of chunkText() in text-cleaner-i18n.js (English/other languages).
    Combines short sentences, splits long ones (max 500 chars).
    """
    MIN_LEN, MAX_LEN = 4, 500
    if not text:
        return []
    chunks = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if not re.search(r'[.!?]$', line):
            line += '.'
        sentences = re.split(r'(?<=[.!?])(?=\s|$)', line)
        current = ''
        for sentence in sentences:
            s = sentence.strip()
            if not s:
                continue
            if len(s) > MAX_LEN:
                if current:
                    chunks.append(current)
                    current = ''
                words = s.split(' ')
                long_chunk = ''
                for word in words:
                    candidate = (long_chunk + ' ' + word).strip()
                    if len(candidate) <= MAX_LEN:
                        long_chunk = candidate
                    else:
                        if long_chunk:
                            chunks.append(long_chunk)
                        long_chunk = word
                current = long_chunk
                continue
            candidate = (current + ' ' + s).strip()
            if len(candidate) > MAX_LEN:
                if current:
                    chunks.append(current)
                current = s
            elif len(candidate) < MIN_LEN:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = s
        if current:
            chunks.append(current)
    return chunks


# ---------------------------------------------------------------------------
# Quick demo
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    # Load CSVs (adjust paths as needed)
    base = Path(__file__).parent / 'public'
    acronym_map     = _load_csv_map(str(base / 'acronyms.csv'))
    replacement_map = _load_csv_map(str(base / 'non-vietnamese-words.csv'))

    samples = [
        "Hôm nay ngày 25/3/2026, nhiệt độ 32°C, giá vàng tăng 3-5%.",
        "Doanh thu Q1 đạt 1.500.000đ, tương đương $60 USD.",
        "Cuộc họp lúc 9h30, địa điểm: 140 Nguyễn Huệ, TP.HCM.",
        "AI và machine learning đang phát triển mạnh mẽ.",
    ]

    print("=== Vietnamese pipeline ===")
    for s in samples:
        processed = process_text_for_tts(s, acronym_map, replacement_map)
        chunks = chunk_text(processed)
        print(f"IN : {s}")
        print(f"OUT: {chunks}")
        print()

    print("=== English (i18n) pipeline ===")
    en_samples = ["Hello world! How are you?", "The price is $99.99."]
    for s in en_samples:
        cleaned = clean_text_for_tts(s, lang='en')
        chunks = chunk_text_i18n(cleaned)
        print(f"IN : {s}")
        print(f"OUT: {chunks}")
        print()
