# -*- coding: utf-8 -*-
"""簿記3級 1週間合格プランを作る。
出力: data_src/plan.json(アプリ用) と 簿記3級\\簿記3級_1週間の計画.xlsx(人が見る用)。
方針: 1日6時間。1〜5日目でテキストを1周しながら仕訳を毎日解く / 3日目と5日目に関門 / 6日目に模擬試験2回 / 7日目に受験(ネット試験)。
日付は持たない(1日目をいつにするかはアプリで選ぶ)。"""
import json
import os
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

HERE = Path(__file__).parent
OUT_JSON = HERE / "plan.json"
OUT_XLSX = HERE.parent.parent / "簿記3級" / "簿記3級_1週間の計画.xlsx"
DRILL = "仕訳ドリル15問（アプリの「今日」から。30分）"


def g(gid, label, typ, target):
    # typ: jr=仕訳問題の正答率(自動) / d3=第3問演習の正答率(自動) / score=模擬試験の点数(入力)
    return {"id": gid, "label": label, "type": typ, "target": target}


plan = [
    {"n": 1, "phase": "インプット", "theme": "簿記の基本〜掛け取引（第1〜4章）", "chs": [1, 2, 3, 4],
     "todo": ["ネット試験を7日目で予約する（日商簿記の公式サイトから。会場の空きと予約の締切りを確認。15分）",
              "第1〜4章を読み、1章読むごとにその章の問題を解く（4時間）",
              "×の仕訳を、答えを見ずに書けるまで解き直す（1時間）",
              DRILL],
     "memo": "⚠️ 予約は今日中に。電卓（12桁・関数電卓でないもの）も今日用意する"},
    {"n": 2, "phase": "インプット", "theme": "手形〜株式会社・税金（第5〜8章）", "chs": [5, 6, 7, 8],
     "todo": ["昨日の「間違えた問題」を解き直す（30分）",
              "第5〜8章を読み、1章読むごとにその章の問題を解く（4時間）",
              "×の仕訳を、答えを見ずに書けるまで解き直す（1時間）",
              DRILL],
     "memo": "第7章の減価償却と売却は、月割りの月数を指で数えてから計算する"},
    {"n": 3, "phase": "インプット", "theme": "繰延べ・見越し、貸倒れ、帳簿と伝票（第9〜11章）", "chs": [9, 10, 11],
     "todo": [DRILL,
              "第9〜11章を読み、1章読むごとにその章の問題を解く（3時間）",
              "第1問の模擬（仕訳15問・15分）を2回解く（1時間）",
              "「間違えた問題」を全部解き直す（1.5時間）"],
     "memo": "届かなければ4日目の朝に第1〜11章の×の仕訳を解き直してから進む",
     "gate": [g("g1-jr", "全部の仕訳問題の正答率", "jr", 70)]},
    {"n": 4, "phase": "決算", "theme": "決算・精算表・財務諸表（第12章）と第3問演習", "chs": [12],
     "todo": [DRILL,
              "第12章を読み、章の問題を解く（1.5時間）",
              "第3問 演習1・演習2を、各25分で解く（1時間）",
              "解説の決算整理仕訳を全部、自分で書き直す（1.5時間）",
              "「間違えた問題」を解き直す（1.5時間）"],
     "memo": "第3問は、決算整理を1つずつ下書きに仕訳してから金額を出す"},
    {"n": 5, "phase": "総仕上げ", "theme": "第3問演習3・第2問対策・仕訳の総ざらい", "chs": [11],
     "todo": [DRILL,
              "第3問 演習3を25分で解き、演習1・2も解き直す（2時間）",
              "第2問対策：第11章（補助簿・商品有高帳・伝票）を読み直し、計算問題を解く（1.5時間）",
              "「間違えた問題」を0問にする（2時間）"],
     "memo": "関門に届かなければ、6日目の午前を×の解き直しにあて、模擬試験は午後に1回だけにする",
     "gate": [g("g2-jr", "全部の仕訳問題の正答率", "jr", 85), g("g2-d3", "第3問 演習の正答率", "d3", 70)]},
    {"n": 6, "phase": "模擬試験", "theme": "模擬試験を2回（本番と同じ60分）", "chs": [],
     "todo": ["本番形式の模擬試験 第1回（アプリ・60分）を解く→第1問〜第3問の解説を読む（2時間）",
              "本番形式の模擬試験 第2回（アプリ・60分）を解く→解説を読む（2時間）",
              "模試で間違えた所を、テキストとアプリの問題で解き直す（1.5時間）",
              DRILL],
     "memo": "点数は関門に自動で入る。2回とも80点に届かなければ受験日を延ばすことも考える（予約の変更期限は会場ごとに確認）。余裕があれば市販の模試や日商のネット試験体験で操作にも慣れておく",
     "gate": [g("g3-m1", "模擬試験 第1回（100点満点）", "score", 80), g("g3-m2", "模擬試験 第2回（100点満点）", "score", 80)]},
    {"n": 7, "phase": "受験日", "theme": "受験日（ネット試験）", "chs": [13],
     "todo": ["第13章「本番の解き方」を読む（15分）",
              "第1問の模擬（仕訳15問）を1回解き、×を解き直す（45分）",
              "第3問の演習を1つ解き直す（30分）",
              "受験（60分）。持ち物：本人確認書類・電卓"],
     "memo": "第1問→第3問→第2問の順に解く。わからない問題に3分以上かけない",
     "gate": [g("g4-exam", "本番の点数", "score", 70)]},
]
for p in plan:
    p.setdefault("gate", None)
    p.setdefault("memo", "")
    p["todo"] = "\n".join(f"{'①②③④⑤'[i]}{t}" for i, t in enumerate(p["todo"]))
OUT_JSON.write_text(json.dumps(plan, ensure_ascii=False, indent=0), encoding="utf-8")

# ===== Excel(人が見る用) =====
wb = Workbook()
ws = wb.active
ws.title = "1週間の計画"
thin = Side(style="thin", color="BBBBBB")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
base = Font(name="メイリオ", size=10)
wrap = Alignment(wrap_text=True, vertical="center")
ws["A1"] = "簿記3級 1週間合格プラン（1日6時間）"
ws["A1"].font = Font(name="メイリオ", size=16, bold=True, color="1F5FAF")
ws["A2"], ws["C2"] = "1日目の日付", "←ここに1日目の日付を入れると、日付の列が埋まります"
ws["A2"].font = Font(name="メイリオ", bold=True)
ws["B2"].number_format = "yyyy/mm/dd"
ws["B2"].fill = PatternFill("solid", fgColor="FFF2CC")
headers = ["日目", "日付", "時期", "テーマ", "やること", "完了", "メモ", "関門"]
widths = [6, 13, 10, 36, 70, 6, 36, 34]
for c, (h, w) in enumerate(zip(headers, widths), 1):
    cell = ws.cell(row=4, column=c, value=h)
    cell.fill, cell.font = PatternFill("solid", fgColor="1F5FAF"), Font(bold=True, color="FFFFFF", name="メイリオ")
    cell.alignment, cell.border = Alignment(horizontal="center", vertical="center"), border
    ws.column_dimensions[cell.column_letter].width = w
for i, p in enumerate(plan, 5):
    gate = "\n".join(f"{x['label']}：{x['target']}{'%' if x['type'] in ('jr', 'd3') else '点'}以上" for x in (p["gate"] or []))
    vals = [f"{p['n']}日目", f'=IF($B$2="","",$B$2+{p["n"] - 1})', p["phase"], p["theme"], p["todo"], "", p["memo"], gate]
    for c, v in enumerate(vals, 1):
        cell = ws.cell(row=i, column=c, value=v)
        cell.font, cell.alignment, cell.border = base, wrap, border
    ws.cell(row=i, column=2).number_format = "m/d(aaa)"
    for c in (1, 2, 6):
        ws.cell(row=i, column=c).alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[i].height = 16 * (p["todo"].count("\n") + 1) + 8
dv = DataValidation(type="list", formula1='"✓"', allow_blank=True)
ws.add_data_validation(dv)
dv.add(f"F5:F{4 + len(plan)}")
ws.freeze_panes = "A5"
ws.cell(row=6 + len(plan), column=1, value="ふだんはアプリを使う：https://ry1124.github.io/boki3-study/").font = Font(name="メイリオ", color="1F5FAF")
os.makedirs(OUT_XLSX.parent, exist_ok=True)
wb.save(OUT_XLSX)
print(f"{len(plan)}日分 → {OUT_JSON.name} / {OUT_XLSX}")
