import json
import math
import posixpath
import re
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS, "pr": PACKAGE_REL_NS}

BUILTIN_DATE_STYLE_IDS = {
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    45,
    46,
    47,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    58,
}


def col_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha()).upper()
    value = 0
    for char in letters:
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value


def is_blank(value):
    return value is None or str(value).strip() == ""


def clean_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    if math.isnan(number):
        return None
    if number.is_integer():
        return int(number)
    return number


def excel_serial_to_date(value):
    try:
        serial = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(serial):
        return None
    date = datetime(1899, 12, 30) + timedelta(days=serial)
    return date.strftime("%Y-%m-%d")


def looks_like_date_header(header):
    if header is None:
        return False
    return any(marker in str(header) for marker in ["日期", "时间", "开始", "完成", "通过", "过审", "更新"])


def is_date_format(code):
    if not code:
        return False
    stripped = re.sub(r'".*?"', "", code.lower())
    stripped = re.sub(r"\[[^\]]+\]", "", stripped)
    return any(marker in stripped for marker in ["yy", "yyyy", "m/d", "d/m", "dd", "日期", "时间"])


def load_shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("m:si", NS):
        parts = [node.text or "" for node in item.findall(".//m:t", NS)]
        strings.append("".join(parts))
    return strings


def load_date_style_indexes(archive):
    if "xl/styles.xml" not in archive.namelist():
        return set()
    root = ET.fromstring(archive.read("xl/styles.xml"))
    custom_formats = {}
    for item in root.findall("m:numFmts/m:numFmt", NS):
        num_fmt_id = item.attrib.get("numFmtId")
        if num_fmt_id:
            custom_formats[int(num_fmt_id)] = item.attrib.get("formatCode", "")

    date_style_indexes = set()
    for index, xf in enumerate(root.findall("m:cellXfs/m:xf", NS)):
        num_fmt_id = int(xf.attrib.get("numFmtId", "0"))
        if num_fmt_id in BUILTIN_DATE_STYLE_IDS or is_date_format(custom_formats.get(num_fmt_id)):
            date_style_indexes.add(index)
    return date_style_indexes


def load_sheet_paths(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target_by_rid = {
        rel.attrib.get("Id"): rel.attrib.get("Target", "")
        for rel in rels.findall("pr:Relationship", NS)
    }

    sheets = []
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        name = sheet.attrib.get("name", "")
        rid = sheet.attrib.get(f"{{{REL_NS}}}id")
        target = target_by_rid.get(rid, "")
        if not target:
            continue
        if target.startswith("/"):
            sheet_path = target.lstrip("/")
        else:
            sheet_path = posixpath.normpath(posixpath.join("xl", target))
        sheets.append((name, sheet_path))
    return sheets


def read_cell(cell, shared_strings, date_style_indexes):
    cell_type = cell.attrib.get("t")
    style_index = int(cell.attrib.get("s", "-1"))

    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS)) or None

    value_node = cell.find("m:v", NS)
    if value_node is None or value_node.text is None:
        return None
    raw = value_node.text

    if cell_type == "s":
        try:
            return shared_strings[int(raw)]
        except (ValueError, IndexError):
            return raw
    if cell_type == "b":
        return raw == "1"
    if style_index in date_style_indexes:
        return excel_serial_to_date(raw)
    return clean_number(raw)


def read_sheet(archive, sheet_path, shared_strings, date_style_indexes):
    root = ET.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall("m:sheetData/m:row", NS):
        values = {}
        max_col = 0
        for cell in row.findall("m:c", NS):
            ref = cell.attrib.get("r", "")
            index = col_index(ref)
            if index <= 0:
                continue
            values[index] = read_cell(cell, shared_strings, date_style_indexes)
            max_col = max(max_col, index)
        rows.append([values.get(index) for index in range(1, max_col + 1)])
    return rows


def normalize_header(value):
    return "" if is_blank(value) else str(value).strip()


def clean_record_value(header, value):
    if is_blank(value):
        return None
    if looks_like_date_header(header) and isinstance(value, (int, float)) and 20000 <= float(value) <= 60000:
        return excel_serial_to_date(value)
    return value


def records_from_rows(rows):
    if not rows:
        return []
    headers = [normalize_header(value) for value in rows[0]]
    records = []
    for row_index, row in enumerate(rows[1:], start=2):
        record = {"_rowNumber": row_index}
        has_value = False
        for index, header in enumerate(headers):
            if not header:
                continue
            value = row[index] if index < len(row) else None
            cleaned = clean_record_value(header, value)
            if not is_blank(cleaned):
                has_value = True
            record[header] = cleaned
        if has_value:
            records.append(record)
    return records


def pick_sheet(sheet_names, candidates, fallback_index):
    for name in sheet_names:
        if any(candidate in name for candidate in candidates):
            return name
    if 0 <= fallback_index < len(sheet_names):
        return sheet_names[fallback_index]
    return None


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: extract_modeling_excel.py <workbook.xlsx>")

    path = Path(sys.argv[1])
    if not path.exists():
        raise SystemExit(f"Workbook not found: {path}")

    with zipfile.ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        date_style_indexes = load_date_style_indexes(archive)
        sheet_paths = load_sheet_paths(archive)
        if not sheet_paths:
            raise SystemExit("Workbook has no sheets")

        sheet_names = [name for name, _path in sheet_paths]
        rows_by_sheet = {
            name: read_sheet(archive, sheet_path, shared_strings, date_style_indexes)
            for name, sheet_path in sheet_paths
        }

    style_sheet_name = pick_sheet(sheet_names, ["建模款式", "款式明细", "上传用款式明细"], 0)
    feedback_sheet_name = pick_sheet(sheet_names, ["建模反馈", "反馈"], 1)

    payload = {
        "workbook": str(path),
        "sheets": sheet_names,
        "styleSheet": style_sheet_name,
        "feedbackSheet": feedback_sheet_name,
        "styles": records_from_rows(rows_by_sheet.get(style_sheet_name, [])) if style_sheet_name else [],
        "feedbacks": records_from_rows(rows_by_sheet.get(feedback_sheet_name, []))
        if feedback_sheet_name and feedback_sheet_name != style_sheet_name
        else [],
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
