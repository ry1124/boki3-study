# -*- coding: utf-8 -*-
"""テキスト(boki3.md)・仕訳と計算問題(shiwake.txt)・第3問の演習(dai3.py)・計画(plan.json)から js/data.js を作る。
問題やテキストを直したらこのスクリプトを実行し、js/version.js を上げて公開する。"""
import hashlib
import html
import json
import re
from pathlib import Path

from dai2 import EXAMS, PROBLEMS
from dai3 import SETS

HERE = Path(__file__).parent
APP = HERE.parent
PLAN_JSON = HERE / "plan.json"   # make_plan.py が作る

# 勘定科目(グループ: A資産 L負債 N純資産 R収益 E費用 / X現金過不足・損益など)。選択肢はこの並び順で表示する
ACCOUNTS = {
    "A": "現金 小口現金 当座預金 普通預金 定期預金 受取手形 電子記録債権 売掛金 クレジット売掛金 繰越商品 前払金 "
         "貸付金 手形貸付金 従業員貸付金 未収入金 立替金 従業員立替金 仮払金 仮払消費税 仮払法人税等 受取商品券 "
         "差入保証金 前払保険料 前払家賃 前払利息 未収利息 未収家賃 未収地代 貯蔵品 建物 備品 車両運搬具 土地",
    "L": "支払手形 電子記録債務 買掛金 前受金 借入金 手形借入金 当座借越 未払金 預り金 所得税預り金 社会保険料預り金 "
         "仮受金 仮受消費税 未払消費税 未払法人税等 未払配当金 未払利息 未払家賃 未払給料 未払保険料 前受家賃 前受地代 "
         "前受利息 前受手数料",
    "C": "貸倒引当金 建物減価償却累計額 備品減価償却累計額 車両運搬具減価償却累計額",   # 資産から差し引く科目
    "N": "資本金 利益準備金 繰越利益剰余金",
    "R": "売上 受取手数料 受取家賃 受取地代 受取利息 雑益 貸倒引当金戻入 償却債権取立益 固定資産売却益",
    "E": "仕入 発送費 支払運賃 給料 法定福利費 広告宣伝費 支払手数料 支払家賃 支払地代 旅費交通費 通信費 消耗品費 "
         "水道光熱費 租税公課 保険料 修繕費 雑費 支払利息 貸倒損失 貸倒引当金繰入 減価償却費 雑損 固定資産売却損 "
         "法人税、住民税及び事業税",
    "X": "現金過不足 損益 売上原価",
}
GROUP = {a: g for g, names in ACCOUNTS.items() for a in names.split()}
ORDER = {a: i for i, a in enumerate(a for names in ACCOUNTS.values() for a in names.split())}

# 間違えやすい組み合わせ。選択肢に正解の相方を混ぜる
CONFUSE = [("売掛金", "未収入金"), ("買掛金", "未払金"), ("前払金", "前受金"), ("仮払金", "仮受金"),
           ("立替金", "預り金"), ("受取手形", "支払手形"), ("電子記録債権", "電子記録債務"), ("貸付金", "借入金"),
           ("手形貸付金", "受取手形"), ("手形借入金", "支払手形"), ("受取利息", "支払利息"), ("雑損", "雑益"),
           ("仮払消費税", "仮受消費税"), ("貸倒損失", "貸倒引当金"), ("固定資産売却益", "固定資産売却損"),
           ("当座預金", "現金"), ("普通預金", "当座預金"), ("仕入", "売上"), ("発送費", "仕入")]


def inline(text):
    t = html.escape(text, quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)


def md_to_html(md):
    """このテキストで使っている書式(見出し・段落・箇条書き・番号付き・入れ子・表・太字)だけを変換する"""
    out, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("### "):
            out.append(f"<h3>{inline(ln[4:])}</h3>")
            i += 1
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r"-+", c) for c in r)]
            t = "<div class='table-wrap'><table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body)
            out.append(t + "</tbody></table></div>")
        elif re.match(r"^(- |\d+\. )", ln):
            items = []
            while i < len(lines) and re.match(r"^( {4})?(- |\d+\. )", lines[i]):
                sub = lines[i].startswith("    ")
                m = re.match(r"^(?: {4})?(- |\d+\. )(.*)$", lines[i])
                kind = "ul" if m.group(1) == "- " else "ol"
                if sub and items:
                    items[-1]["sub"].append((kind, m.group(2)))
                else:
                    items.append({"kind": kind, "text": m.group(2), "sub": []})
                i += 1
            tag = items[0]["kind"]
            s = f"<{tag}>"
            for it in items:
                s += f"<li>{inline(it['text'])}"
                if it["sub"]:
                    st = it["sub"][0][0]
                    s += f"<{st}>" + "".join(f"<li>{inline(x)}</li>" for _, x in it["sub"]) + f"</{st}>"
                s += "</li>"
            out.append(s + f"</{tag}>")
        else:
            out.append(f"<p>{inline(ln)}</p>")
            i += 1
    return "\n".join(out)


def parse_ox(block, chap_id):
    """「### 確認問題」節から、○×問題と答え・解説を取り出す"""
    qs = re.findall(r"^\d+\. (.+)$", block, re.M)
    ans_line = re.search(r"\*\*答え\*\*：(.+)$", block, re.M).group(1)
    answers = {}
    for m in re.finditer(r"(\d+) ([○×])(?:（(.*?)）)?", ans_line):
        answers[int(m.group(1))] = (m.group(2) == "○", m.group(3) or "")
    assert len(qs) == len(answers), f"{chap_id}: 問題{len(qs)}問と答え{len(answers)}個が合わない"
    return [{"id": f"{chap_id}-q{n}", "t": "ox", "q": q, "a": answers[n][0], "exp": answers[n][1]}
            for n, q in enumerate(qs, 1)]


def amount(s):
    return int(s.replace(",", ""))


def parse_bank():
    """shiwake.txt を章ごとの仕訳問題・計算問題にする"""
    bank, ch = {}, None
    text = "\n".join(l for l in (HERE / "shiwake.txt").read_text(encoding="utf-8").split("\n") if not l.startswith("#"))
    for block in re.split(r"\n\s*\n", text):
        lines = [l.strip() for l in block.strip().split("\n") if l.strip()]
        if lines and lines[0].startswith("@"):
            ch = int(lines.pop(0)[1:])
        if not lines:
            continue
        q = {"dr": [], "cr": [], "extra": []}
        for l in lines:
            k, v = l.split(":", 1)
            v = v.strip()
            if k == "Q": q["t"], q["q"] = "jr", v
            elif k == "N": q["t"], q["q"] = "num", v
            elif k == "D": q["dr"].append([v.rsplit(" ", 1)[0], amount(v.rsplit(" ", 1)[1])])
            elif k == "C": q["cr"].append([v.rsplit(" ", 1)[0], amount(v.rsplit(" ", 1)[1])])
            elif k == "A": q["ans"] = amount(v)
            elif k == "E": q["exp"] = v
            elif k == "S": q["extra"] = [x.strip() for x in v.split(",") if x.strip()]
            else: raise ValueError(f"知らない行: {l}")
        bank.setdefault(ch, []).append(q)
    return bank


def options(q, pool, seed):
    """仕訳問題の選択肢: 正解の科目＋指定の科目＋間違えやすい相方＋同じ章の科目から、6〜8個"""
    right = [a for a, _ in q["dr"] + q["cr"]]
    opts = list(dict.fromkeys(right + q["extra"]))
    for a in right:
        for x, y in CONFUSE:
            if a in (x, y):
                opts.append(y if a == x else x)
    opts = list(dict.fromkeys(opts))
    rest = sorted(set(pool) - set(opts), key=lambda a: hashlib.md5((seed + a).encode()).hexdigest())
    want = max(6, min(8, len(right) + 4))
    opts += rest[:max(0, want - len(opts))]
    for a in opts:
        assert a in GROUP, f"{seed}: 勘定科目の一覧にない「{a}」"
    return sorted(opts, key=lambda a: ORDER[a])


def build_questions(cid, items):
    out, pool = [], [a for q in items if q["t"] == "jr" for a, _ in q["dr"] + q["cr"]]
    nj = nn = 0
    for q in items:
        if q["t"] == "jr":
            nj += 1
            qid = f"{cid}-j{nj}"
            sd, sc = sum(x for _, x in q["dr"]), sum(x for _, x in q["cr"])
            assert sd == sc, f"{qid}: 借方{sd:,}と貸方{sc:,}が合わない「{q['q'][:20]}」"
            assert len(q["dr"]) <= 4 and len(q["cr"]) <= 4, f"{qid}: 1つの側は4行まで"
            out.append({"id": qid, "t": "jr", "q": q["q"], "dr": q["dr"], "cr": q["cr"],
                        "opts": options(q, pool, qid), "exp": q.get("exp", "")})
        else:
            nn += 1
            out.append({"id": f"{cid}-n{nn}", "t": "num", "q": q["q"], "ans": q["ans"], "exp": q.get("exp", "")})
    return out


def build_subject(bank):
    md = (HERE / "boki3.md").read_text(encoding="utf-8")
    sections = re.split(r"^## ", md, flags=re.M)[1:]
    intro, chapters = "", []
    for sec in sections:
        title, body = sec.split("\n", 1)
        m = re.match(r"第(\d+)章 (.+)", title)
        if not m:
            intro = md_to_html(body)
            continue
        no = int(m.group(1))
        cid = f"boki-{no:02d}"
        parts = re.split(r"^### 確認問題.*$", body, flags=re.M)
        lead = parts[0].strip().split("\n", 1)[0]
        quiz = build_questions(cid, bank.get(no, [])) + (parse_ox(parts[1], cid) if len(parts) > 1 else [])
        chapters.append({"id": cid, "no": no, "title": m.group(2), "lead": lead, "html": md_to_html(parts[0]), "quiz": quiz})
    return {"id": "boki", "name": "簿記3級", "intro": intro, "chapters": chapters}


# ===== 第3問: 試算表に決算整理仕訳を当てて答えを計算する =====
def sign(acc):
    """借方残高を＋とする科目か"""
    return 1 if GROUP[acc] in ("A", "E", "X") else -1


def build_dai3(s):
    tb = [list(r) for r in s["tb"]]
    dr = sum(r[1] for r in tb)
    cr = sum(r[2] or 0 for r in tb)
    for r in tb:
        if r[2] is None:
            r[2] = dr - cr
            assert r[2] > 0, f"{s['id']}: 繰越利益剰余金がマイナスになる"
    assert sum(r[1] for r in tb) == sum(r[2] for r in tb), f"{s['id']}: 試算表の貸借が合わない"
    bal = {}
    for a, d, c in tb:
        assert a in GROUP, f"{s['id']}: 勘定科目の一覧にない「{a}」"
        bal[a] = bal.get(a, 0) + d - c
    re_before = -bal["繰越利益剰余金"]
    before = dict(bal)

    def pretax():
        return sum(-v for a, v in bal.items() if GROUP[a] == "R") - sum(
            v for a, v in bal.items() if GROUP[a] == "E" and a != "法人税、住民税及び事業税")

    adj = []
    for row in s["adj"]:
        text, d, c = row[:3]
        assert sum(x for _, x in d) == sum(x for _, x in c), f"{s['id']}: 決算整理の貸借が合わない「{text[:20]}」"
        if len(row) > 3:   # 法人税等: 税引前当期純利益×税率と一致するか
            want = round(pretax() * row[3])
            assert d[0][1] == want, f"{s['id']}: 法人税等は{want:,}円のはず（税引前{pretax():,}円）"
            assert f"{want:,}" in text, f"{s['id']}: 問題文の法人税等の金額が{want:,}円になっていない"
        for a, x in d:
            assert a in GROUP, f"{s['id']}: 勘定科目の一覧にない「{a}」"
            bal[a] = bal.get(a, 0) + x
        for a, x in c:
            assert a in GROUP, f"{s['id']}: 勘定科目の一覧にない「{a}」"
            bal[a] = bal.get(a, 0) - x
        adj.append({"text": text, "dr": [list(x) for x in d], "cr": [list(x) for x in c]})

    ni = sum(-v for a, v in bal.items() if GROUP[a] == "R") - sum(v for a, v in bal.items() if GROUP[a] == "E")
    assets = sum(v for a, v in bal.items() if GROUP[a] in ("A", "C"))
    liab = sum(-v for a, v in bal.items() if GROUP[a] == "L")
    equity = sum(-v for a, v in bal.items() if GROUP[a] == "N") + ni
    assert assets == liab + equity, f"{s['id']}: 貸借対照表が合わない（資産{assets:,} 負債＋純資産{liab + equity:,}）"
    for a, v in bal.items():
        assert GROUP[a] != "X" or v == 0, f"{s['id']}: 決算整理後も{a}に残高{v:,}が残っている"

    if s.get("mock"):   # 模擬試験: 財務諸表を作り、決算で金額が変わる行を空欄にする
        fs = fs_rows(bal, ni, re_before + ni, before)
        nb = sum(r["blank"] for part in fs.values() for rows in part.values() for r in rows)
        print(f"  {s['id']}: 当期純利益 {ni:,} / 資産合計 {assets:,} / 空欄 {nb}個")
        return {"id": s["id"], "title": s["title"], "lead": s["lead"], "tb": tb, "adj": adj, "fs": fs}

    def answer(how):
        if how == "ni": return ni
        if how == "re": return re_before + ni
        if how == "assets": return assets
        acc = how.split(":", 1)[1]
        return bal.get(acc, 0) * sign(acc)

    blanks = [{"label": lab, "ans": answer(how)} for lab, how in s["ask"]]
    print(f"  {s['id']}: 当期純利益 {ni:,} / 資産合計 {assets:,} / " + "・".join(f"{b['label']} {b['ans']:,}" for b in blanks))
    return {"id": s["id"], "title": s["title"], "lead": s["lead"], "tb": tb, "adj": adj, "blanks": blanks}


# ===== 模擬試験の第3問: 財務諸表 =====
FS_NAME = {"繰越商品": "商品", "仕入": "売上原価", "売上": "売上高"}
FS_NAME.update({a: "前払費用" for a in "前払保険料 前払家賃 前払利息".split()})
FS_NAME.update({a: "未収収益" for a in "未収利息 未収家賃 未収地代".split()})
FS_NAME.update({a: "未払費用" for a in "未払利息 未払家賃 未払給料 未払保険料".split()})
FS_NAME.update({a: "前受収益" for a in "前受家賃 前受地代 前受利息 前受手数料".split()})
CONTRA_OF = {"売掛金": "貸倒引当金", "受取手形": "貸倒引当金", "建物": "建物減価償却累計額",
             "備品": "備品減価償却累計額", "車両運搬具": "車両運搬具減価償却累計額"}


def fs_lines(bal, groups):
    """財務諸表の行(表示名でまとめる)。資産の下に、その資産から差し引く貸倒引当金・減価償却累計額を置く"""
    out = {}
    for a in sorted(bal, key=ORDER.get):
        if GROUP[a] not in groups or GROUP[a] == "C" or bal[a] == 0 or a == "繰越利益剰余金":
            continue
        lab = FS_NAME.get(a, a)
        out.setdefault(lab, {"label": lab, "amt": 0, "contra": False})["amt"] += bal[a] * sign(a)
        c = CONTRA_OF.get(a)
        if c and bal.get(c):
            assert not (a in ("売掛金", "受取手形") and bal.get("受取手形") and bal.get("売掛金")), "貸倒引当金は売掛金だけの問題にする"
            out[c] = {"label": "貸倒引当金" if c == "貸倒引当金" else "減価償却累計額", "amt": -bal[c], "contra": True, "key": c}
    return out


def fs_rows(bal, ni, re_total, before):
    def part(groups, extra=None):
        now, old = fs_lines(bal, groups), fs_lines(before, groups)
        rows = [dict(r, blank=(k not in old or old[k]["amt"] != r["amt"])) for k, r in now.items()]
        if extra:
            rows.append(extra)
        for r in rows:
            r.pop("key", None)
        return rows
    fs = {"pl": {"exp": part("E", {"label": "当期純利益", "amt": ni, "contra": False, "blank": True}), "rev": part("R")},
          "bs": {"asset": part("AC"), "liab": part("L"),
                 "eq": part("N", {"label": "繰越利益剰余金", "amt": re_total, "contra": False, "blank": True})}}
    tot = lambda rows: sum(-r["amt"] if r["contra"] else r["amt"] for r in rows)
    assert tot(fs["pl"]["exp"]) == tot(fs["pl"]["rev"]), "損益計算書の左右が合わない"
    assert tot(fs["bs"]["asset"]) == tot(fs["bs"]["liab"]) + tot(fs["bs"]["eq"]), "貸借対照表の左右が合わない"
    return fs


# ===== 計画: その日に読む章 =====
def build_plan():
    days = json.loads(PLAN_JSON.read_text(encoding="utf-8"))
    for p in days:
        p["ch"] = [f"boki-{n:02d}" for n in p["chs"]]
    return days


bank = parse_bank()
subject = build_subject(bank)
assert set(bank) <= {c["no"] for c in subject["chapters"]}, "shiwake.txt に存在しない章がある"
print("第3問の演習（答えは自動計算）")
built = {s["id"]: build_dai3(s) for s in SETS}
dai3 = [built[s["id"]] for s in SETS if not s.get("mock")]
prob = {p["id"]: p for p in PROBLEMS}
exams = [dict(e, q2=[prob[i] for i in e["q2"]], q3=built[e["q3"]]) for e in EXAMS]
plan = build_plan()
accounts = sorted((a for a in GROUP if GROUP[a] != "X" or a == "損益"), key=lambda a: ORDER[a])
data = {"subjects": [subject], "dai3": dai3, "exams": exams, "plan": plan, "accounts": accounts}
(APP / "js" / "data.js").write_text(
    "// build_data.py が作るデータ(手で編集しない)\nconst BOKI_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
    encoding="utf-8")
qs = [q for c in subject["chapters"] for q in c["quiz"]]
cnt = {t: sum(1 for q in qs if q["t"] == t) for t in ("jr", "num", "ox")}
print(f"章 {len(subject['chapters'])} / 仕訳 {cnt['jr']} / 計算 {cnt['num']} / ○× {cnt['ox']} / 第3問 {len(dai3)} / 模擬試験 {len(exams)} / 計画 {len(plan)}日")
