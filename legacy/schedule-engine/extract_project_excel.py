import json
import math
import sys
from pathlib import Path

import pandas as pd


def clean_value(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "strftime") and value.__class__.__name__ in {"datetime", "date", "time"}:
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def clean_record(row):
    return {str(k): clean_value(v) for k, v in row.items()}


def records(df):
    return [clean_record(row) for row in df.to_dict(orient="records")]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: extract_project_excel.py <workbook.xlsx>")

    path = Path(sys.argv[1])
    xl = pd.ExcelFile(path)
    if len(xl.sheet_names) < 3:
        raise SystemExit(f"Expected at least 3 sheets, got {len(xl.sheet_names)}")

    project_records = []
    project_sheet_names = [
        name for name in xl.sheet_names
        if "项目信息" in name or "项目" in name and "任务" not in name and "进度" not in name
    ]
    if not project_sheet_names:
        project_sheet_names = [xl.sheet_names[0]]
    for sheet_name in project_sheet_names:
        df = pd.read_excel(path, sheet_name=sheet_name)
        for item in records(df):
            item["_sourceSheet"] = sheet_name
            project_records.append(item)

    actual_sheet_name = next((name for name in xl.sheet_names if "实际" in name or "进度" in name), xl.sheet_names[1])
    task_sheet_name = next((name for name in xl.sheet_names if "任务规则" in name or "规则" in name), xl.sheet_names[-1])
    actual_df = pd.read_excel(path, sheet_name=actual_sheet_name)
    task_df = pd.read_excel(path, sheet_name=task_sheet_name)

    payload = {
        "workbook": str(path),
        "sheets": xl.sheet_names,
        "projects": project_records,
        "actuals": records(actual_df),
        "taskRules": records(task_df),
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
