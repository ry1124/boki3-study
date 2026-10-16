// 簿記3級 1週間合格プラン: 今日やること・テキスト・問題(仕訳/計算/○×)・第3問演習・計画・記録
const D = BOKI_DATA;
const PLAN = D.plan;          // 1日目〜7日目
const SUBJ = D.subjects[0];
const CHAPTERS = {};          // 章id -> 章
const QUESTIONS = {};         // 問題id -> 問題(+章id)
const SETS = {};              // 第3問の演習id -> 演習
SUBJ.chapters.forEach((c) => {
  CHAPTERS[c.id] = c;
  c.quiz.forEach((q) => { QUESTIONS[q.id] = Object.assign({ ch: c.id }, q); });
});
D.dai3.forEach((s) => { SETS[s.id] = s; });
const JR_IDS = Object.keys(QUESTIONS).filter((id) => QUESTIONS[id].t === 'jr');
const HARD_IDS = JR_IDS.filter((id) => QUESTIONS[id].hard); // 本試験レベル(複合取引・ひっかけ入り)
const hardOf = (chs) => HARD_IDS.filter((id) => chs.includes(QUESTIONS[id].ch));

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = (n) => Number(n).toLocaleString('ja-JP');
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const TYPE_LABEL = { jr: '仕訳', num: '計算', ox: '○×' };

// ===== 日付 =====
function ymd(n) {
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function todayStr() { return ymd(new Date()); }
function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
function fmtDay(s, withYear) {
  const d = parseDay(s);
  return `${withYear ? d.getFullYear() + '年' : ''}${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
}

// n日目の日付(1日目を決めていなければ null)
function dayDate(n) { return state.start ? addDays(state.start, n - 1) : null; }
// 今日が何日目か(1日目より前は0以下、7日目より後は8以上。未設定は null)
function todayN() { return state.start ? daysBetween(state.start, todayStr()) + 1 : null; }
const LAST = PLAN.length;

// ===== 共通 =====
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

let currentTab = 'today';
const backTo = { chapter: 'text', quiz: 'quizmenu', set: 'quizmenu', exam: 'quizmenu' };

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  $('view-' + name).scrollTop = 0;
}

function switchTab(tab) {
  stopTimer();
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  RENDER[tab]();
  showView(tab);
  if (pendingReload) location.reload(); // 問題を解いている間に見つけた更新を、解き終わってから反映する
}

function chapterTitle(id) {
  const c = CHAPTERS[id];
  return `第${c.no}章 ${c.title}`;
}

function todoHtml(todo) {
  return todo.split('\n').map((l) => `<li>${esc(l.replace(/^[①②③④⑤]/, ''))}</li>`).join('');
}

function entryText(dr, cr) {
  return `借方 ${dr.map(([a, x]) => `${a} ${yen(x)}`).join('・')}／貸方 ${cr.map(([a, x]) => `${a} ${yen(x)}`).join('・')}`;
}

// 仕訳の表(借方｜金額｜貸方｜金額)
function entryTable(dr, cr) {
  const n = Math.max(dr.length, cr.length);
  let rows = '';
  for (let i = 0; i < n; i++) {
    const d = dr[i] || ['', ''];
    const c = cr[i] || ['', ''];
    rows += `<tr><td>${esc(d[0])}</td><td class="num">${d[1] === '' ? '' : yen(d[1])}</td><td>${esc(c[0])}</td><td class="num">${c[1] === '' ? '' : yen(c[1])}</td></tr>`;
  }
  return `<div class="table-wrap"><table class="entry"><thead><tr><th>借方</th><th>金額</th><th>貸方</th><th>金額</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// 章ごとの問題の成績
function chapterStats(id) {
  const qs = CHAPTERS[id].quiz;
  const tried = qs.filter((q) => state.quiz[q.id]);
  const okNow = tried.filter((q) => state.quiz[q.id].last).length;
  return { total: qs.length, tried: tried.length, okNow };
}

// 「間違えた問題」: 一度でも間違えて、まだ3回続けて正解していない問題
function wrongIds() {
  return Object.keys(QUESTIONS).filter((id) => isWeak(state.quiz[id]));
}

// 全部の仕訳問題のうち、直近で正解している割合(解いていない問題は×として数える)
function jrRate() {
  const ok = JR_IDS.filter((id) => state.quiz[id] && state.quiz[id].last).length;
  return Math.round(ok / JR_IDS.length * 100);
}

// 第3問の演習の正答率(各演習の直近の結果。解いていない演習は0として数える)
function d3Rate() {
  let ok = 0;
  let n = 0;
  D.dai3.forEach((s) => { n += s.blanks.length; ok += state.d3[s.id] ? state.d3[s.id].ok : 0; });
  return Math.round(ok / n * 100);
}

// ===== 毎日の仕訳ドリル =====
const DRILL_SIZE = 15;
// 章を最初に読む日目。その日を過ぎた章だけをドリルに出す
const CH_FIRST_N = {};
PLAN.forEach((p) => p.ch.forEach((id) => { if (!CH_FIRST_N[id]) CH_FIRST_N[id] = p.n; }));

// 今取り組む日目。今日の分(と前倒しで終えた日)が完了していれば、その次の日を前倒しでできる
function workN() {
  const k = todayN();
  if (!k) return 1;
  let n = Math.min(Math.max(1, k), LAST);
  while (n < LAST && state.done[n]) n++;
  return n;
}

function reachedJr() {
  const k = workN();
  const chs = Object.keys(CHAPTERS).filter((id) => CH_FIRST_N[id] && CH_FIRST_N[id] <= k);
  return JR_IDS.filter((id) => chs.includes(QUESTIONS[id].ch));
}

// 間違えた問題 → まだ解いていない問題 → 最後に解いたのが古い問題、の順
function prioritized(pool, size) {
  const rank = (id) => {
    const r = state.quiz[id];
    if (isWeak(r)) return [0, r.at];
    if (!r) return [QUESTIONS[id].hard ? 1 : 2, ''];
    return [3, r.at];
  };
  return shuffle(pool.slice())
    .sort((a, b) => { const x = rank(a); const y = rank(b); return x[0] - y[0] || String(x[1]).localeCompare(String(y[1])); })
    .slice(0, size);
}

// ===== 関門 =====
// 関門の1項目の結果: { pass(null=未入力), text }
function gateResult(item) {
  if (item.type === 'jr') { const v = jrRate(); return { pass: v >= item.target, text: `今 ${v}%` }; }
  if (item.type === 'd3') { const v = d3Rate(); return { pass: v >= item.target, text: `今 ${v}%` }; }
  const v = state.gates[item.id];
  if (v === undefined || v === '') return { pass: null, text: '未入力' };
  return { pass: Number(v) >= item.target, text: `${v}点` };
}
const unit = (it) => (it.type === 'score' ? '点' : '%');

// 過ぎた関門の日で、届いていない(または未入力の)もの
function failedGateNow() {
  const k = todayN();
  if (!k || k > LAST) return null;
  return PLAN.find((p) => p.gate && p.n < k && p.gate.some((it) => gateResult(it).pass !== true));
}

// ===== 今日 =====
function renderToday() {
  const t = todayStr();
  const k = todayN();
  let html = `<div class="hero"><div class="hero-date">${fmtDay(t, true)}</div>`;
  if (k) {
    const left = daysBetween(t, dayDate(LAST));
    html += `<div class="hero-count">${left > 0 ? `受験日まで <b>${left}</b> 日` : left === 0 ? '<b>今日</b> が受験日' : '7日間の計画は終わりました'}</div>`;
  }
  html += `</div>`;

  if (!k) {
    html += `<div class="card main">
      <div class="card-label">はじめに</div>
      <h2 class="theme">1日目をいつにしますか？</h2>
      <p class="muted">1日6時間 × 7日間の計画です。7日目にネット試験を受けます。1日目に試験の予約をするので、7日目に受けられる日を選んでください。</p>
      <div class="btn-row">
        <button class="btn primary" data-set-start="${t}">今日から</button>
        <button class="btn ghost" data-set-start="${addDays(t, 1)}">明日から</button>
      </div>
      <label class="score-row" for="start-input">日付を選ぶ<input id="start-input" class="date-input" type="date" data-start-input="1"></label>
    </div>`;
    $('today-body').innerHTML = html;
    return;
  }

  const failed = failedGateNow();
  if (failed) {
    const miss = failed.gate.filter((it) => gateResult(it).pass !== true);
    html += `<div class="card alert">
      <div class="card-label">関門に届いていません（${failed.n}日目）</div>
      <p class="alert-text">${miss.map((it) => `${esc(it.label)}：${esc(gateResult(it).text)}（目標 ${it.target}${unit(it)}）`).join('<br>')}</p>
      <p class="muted">${esc(failed.memo)}</p>
      <button class="btn ghost" data-quiz-mode="wrong">間違えた問題を解き直す（${wrongIds().length}問）</button>
    </div>`;
  }

  let day = null;
  let label = '今日やること';
  if (k < 1) { day = PLAN[0]; label = `${fmtDay(state.start)}から始まります`; }
  else if (k <= LAST) day = PLAN[k - 1];
  // 今日の分が終わっていれば、次の日を前倒しで出す
  const w = workN();
  if (day && state.done[day.n] && w > day.n && !state.done[w]) {
    html += `<div class="card soft"><div class="card-label">✓ ${k < 1 ? '1日目' : '今日の分'}（${day.n}日目）は完了しました</div>
      <button class="btn ghost" data-plan-detail="${day.n}">${day.n}日目の内容を見る</button></div>`;
    day = PLAN[w - 1];
    html += dayCard(day, `前倒し：${w}日目（予定は${fmtDay(dayDate(w))}）`);
    html += `<p class="muted ahead-note">${w === LAST
      ? '7日目の内容（最終確認）は前倒しでできますが、受験は予約した日です。受験日を早めたいときは、設定の「1日目の日付」を変えて、予約も取り直してください。'
      : `予定より${w - Math.max(k, 1)}日進んでいます。終わったら、さらに次の日へ進めます。`}</p>`;
  } else if (day) html += dayCard(day, label);
  else {
    const exam = PLAN[LAST - 1].gate[0];
    html += `<div class="card main"><div class="card-label">7日間の計画は終わりました</div>
      <p class="muted">本番の点数を入れておきましょう。まだ受けていない場合は、毎日の仕訳ドリル・間違えた問題・第3問の演習を続けてください。</p>
      ${gateBox({ gate: [exam] })}</div>`;
  }

  // 毎日の仕訳ドリル
  if (k >= 1) {
    const n = state.ippon[t] || 0;
    const fin = n >= DRILL_SIZE;
    html += `<div class="card ${fin ? 'soft' : 'main'}">
      <div class="card-label">毎日の仕訳ドリル<span class="pill">第1問対策</span></div>
      <p class="muted">読んだ章の仕訳から、間違えた問題を優先して${DRILL_SIZE}問出します。3回続けて正解するまで何度でも出ます。</p>
      <button class="btn ${fin ? 'done' : 'primary'}" data-quiz-mode="drill">${fin ? `✓ 今日の${DRILL_SIZE}問は解きました（もう一度解く）` : `仕訳ドリルを始める（今日 ${n}/${DRILL_SIZE}問）`}</button>
    </div>`;
  }

  // 遅れている日
  const behind = PLAN.filter((p) => p.n < Math.min(k, LAST + 1) && !state.done[p.n]);
  if (behind.length) {
    html += `<div class="card warn">
      <div class="card-label">まだ終わっていない日が ${behind.length} 日あります</div>
      <p class="muted">いちばん古いのは ${behind[0].n}日目「${esc(behind[0].theme)}」です。今日の分と合わせて取り戻してください。</p>
      <button class="btn ghost" data-plan-detail="${behind[0].n}">${behind[0].n}日目を開く</button>
    </div>`;
  }

  const next = PLAN.find((p) => p.n > (day ? day.n : Math.max(k, 0)));
  if (next && day) {
    html += `<div class="card soft"><div class="card-label">次の予定 ${next.n}日目・${fmtDay(dayDate(next.n))}</div>
      <div class="next-theme">${esc(next.theme)}</div></div>`;
  }
  $('today-body').innerHTML = html;
}

function dayCard(day, label) {
  const done = !!state.done[day.n];
  let h = `<div class="card main ${done ? 'is-done' : ''}">
    <div class="card-label">${esc(label)}<span class="pill">${day.n}日目・${esc(day.phase)}</span></div>
    <h2 class="theme">${esc(day.theme)}</h2>
    <ol class="todo">${todoHtml(day.todo)}</ol>`;
  if (day.memo) h += `<p class="memo">${esc(day.memo)}</p>`;
  const links = [];
  day.ch.forEach((id) => {
    const s = chapterStats(id);
    links.push(`<div class="link-row">
      <button class="btn ghost" data-open-ch="${id}">📖 ${esc(chapterTitle(id))}</button>
      <button class="btn ghost small" data-quiz-ch="${id}">問題 ${s.okNow}/${s.total}</button>
    </div>`);
  });
  const dayHard = hardOf(day.ch);
  if (dayHard.length) {
    const ok = dayHard.filter((id) => state.quiz[id] && state.quiz[id].last).length;
    links.push(`<button class="btn ghost" data-quiz-hard="${day.n}">🔥 この日の範囲の本試験レベル（${ok}/${dayHard.length}問正解）</button>`);
  }
  if (day.todo.includes('第1問の模擬')) links.push(`<button class="btn ghost" data-quiz-mode="mock">⏱ 第1問の模擬（仕訳15問・15分）</button>`);
  if (day.todo.includes('第3問')) {
    D.dai3.forEach((s) => links.push(`<button class="btn ghost" data-open-set="${s.id}">🧮 第3問 ${esc(s.title)}${setChip(s.id)}</button>`));
  }
  if (day.todo.includes('本番形式の模擬試験')) {
    D.exams.forEach((e) => links.push(`<button class="btn ghost" data-open-exam="${e.id}">📝 ${esc(e.title)}（60分・100点）${examResults(e.id).length ? `　前回 ${examResults(e.id).slice(-1)[0].score}点` : ''}</button>`));
  }
  if (links.length) h += `<div class="links">${links.join('')}</div>`;
  if (day.gate) h += gateBox(day);
  h += `<button class="btn ${done ? 'done' : 'primary'}" data-toggle-day="${day.n}">${done ? '✓ 完了しました（取り消す）' : 'この日の分を完了にする'}</button>`;
  return h + `</div>`;
}

function setChip(id) {
  const r = state.d3[id];
  return r ? `（前回 ${r.ok}/${r.n}）` : '';
}

// 関門の判定と、点数の入力欄
function gateBox(day) {
  let h = `<div class="gate">`;
  day.gate.forEach((it) => {
    const r = gateResult(it);
    const badge = r.pass === null ? '' : r.pass ? '<span class="badge ok">合格ライン</span>' : '<span class="badge ng">届いていない</span>';
    const goal = `目標 ${it.target}${unit(it)}以上`;
    if (it.type === 'score') {
      h += `<label class="gate-item" for="gate-${it.id}"><div class="gate-head">${esc(it.label)}${badge}</div>
        <div class="gate-row"><span class="gate-sub">${esc(goal)}</span>
        <span><input id="gate-${it.id}" class="score-input" type="number" min="0" max="100" inputmode="numeric"
          value="${esc(state.gates[it.id] ?? '')}" data-gate-id="${it.id}"> 点</span></div></label>`;
    } else {
      h += `<div class="gate-item"><div class="gate-head">${esc(it.label)}${badge}</div>
        <div class="gate-sub">${esc(goal)}・${esc(r.text)}（アプリの記録から自動で計算）</div></div>`;
    }
  });
  return h + `</div>`;
}

// ===== テキスト =====
function renderText() {
  let html = `<ul class="list"><li class="list-row" data-open-intro="1">
      <span class="row-no">★</span>
      <span class="row-main"><span class="row-title">このテキストの使い方・試験の形式</span></span></li></ul>`;
  html += `<ul class="list">` + SUBJ.chapters.map((c) => {
    const st = chapterStats(c.id);
    const read = state.read[c.id];
    return `<li class="list-row" data-open-ch="${c.id}">
      <span class="row-no">${c.no}</span>
      <span class="row-main"><span class="row-title">${esc(c.title)}</span>
        <span class="row-sub">${CH_FIRST_N[c.id] ? CH_FIRST_N[c.id] + '日目・' : ''}${read ? '読んだ' : '未読'}・問題 ${st.okNow}/${st.total}</span></span>
      <span class="row-mark">${read ? '✓' : ''}</span>
    </li>`;
  }).join('') + `</ul>`;
  $('text-body').innerHTML = html;
}

function openIntro() {
  $('chapter-crumb').textContent = 'テキスト';
  $('chapter-body').innerHTML = `<h1 class="ch-title">このテキストの使い方</h1>${SUBJ.intro}`;
  backTo.chapter = currentTab;
  showView('chapter');
}

function openChapter(id) {
  const c = CHAPTERS[id];
  $('chapter-crumb').textContent = '簿記3級';
  const read = !!state.read[id];
  const ids = SUBJ.chapters.map((x) => x.id);
  const i = ids.indexOf(id);
  const counts = ['jr', 'num', 'ox'].map((t) => [t, c.quiz.filter((q) => q.t === t).length]).filter(([, n]) => n)
    .map(([t, n]) => `${TYPE_LABEL[t]}${n}`).join('・') + (hardOf([id]).length ? `／うち本試験レベル${hardOf([id]).length}` : '');
  $('chapter-body').innerHTML = `<h1 class="ch-title">第${c.no}章<br>${esc(c.title)}</h1>
    ${c.html}
    <div class="ch-actions">
      <button class="btn primary" data-quiz-ch="${id}">この章の問題を解く（${counts}）</button>
      <button class="btn ${read ? 'done' : 'ghost'}" data-toggle-read="${id}">${read ? '✓ 読みました（取り消す）' : '読み終えた'}</button>
      <div class="pager">
        ${i > 0 ? `<button class="btn ghost small" data-open-ch="${ids[i - 1]}">‹ 第${c.no - 1}章</button>` : '<span></span>'}
        ${i < ids.length - 1 ? `<button class="btn ghost small" data-open-ch="${ids[i + 1]}">第${c.no + 1}章 ›</button>` : '<span></span>'}
      </div>
    </div>`;
  if (!$('view-chapter').classList.contains('active')) backTo.chapter = currentTab;
  showView('chapter');
}

// ===== 問題メニュー =====
function renderQuizMenu() {
  const wrong = wrongIds();
  const all = Object.keys(QUESTIONS);
  const unanswered = all.filter((id) => !state.quiz[id]).length;
  const best = state.mocks.length ? Math.max(...state.mocks.map((m) => m.score)) : null;
  let html = `<div class="quick">
    <button class="quick-btn" data-quiz-mode="drill"><b>仕訳ドリル</b><span>読んだ章から${DRILL_SIZE}問</span></button>
    <button class="quick-btn" data-quiz-mode="hard"><b>本試験レベルの仕訳</b><span>読んだ章から15問（全${HARD_IDS.length}問）</span></button>
    <button class="quick-btn" data-quiz-mode="mock"><b>⏱ 第1問の模擬</b><span>仕訳15問・45点${best !== null ? `（最高 ${best}点）` : ''}</span></button>
    <button class="quick-btn" data-quiz-mode="wrong" ${wrong.length ? '' : 'disabled'}><b>間違えた問題</b><span>${wrong.length}問（3回続けて正解で外れる）</span></button>
    <button class="quick-btn" data-quiz-mode="new" ${unanswered ? '' : 'disabled'}><b>まだ解いていない問題</b><span>${unanswered}問</span></button>
  </div>
  <p class="muted">仕訳の正答率 ${jrRate()}%（全${JR_IDS.length}問のうち直近で正解している割合）</p>`;

  html += `<h2 class="section-title">本番形式の模擬試験<span class="section-sub">60分・100点・70点で合格</span></h2><ul class="list">` + D.exams.map((e, i) => {
    const rs = examResults(e.id);
    return `<li class="list-row" data-open-exam="${e.id}">
      <span class="row-no">${i + 1}</span>
      <span class="row-main"><span class="row-title">${esc(e.title)}</span>
        <span class="row-sub">第2問：${e.q2.map((p) => esc(p.title.replace(/（.*）/, ''))).join('・')}／第3問：財務諸表${rs.length ? `・最高 ${Math.max(...rs.map((r) => r.score))}点` : ''}</span></span>
      ${examChip(e.id)}</li>`;
  }).join('') + `</ul>`;

  html += `<h2 class="section-title">第3問 決算の演習<span class="section-sub">1つ25分が目標</span></h2><ul class="list">` + D.dai3.map((s, i) => {
    const r = state.d3[s.id];
    const cls = !r ? '' : r.ok === r.n ? 'good' : 'bad';
    return `<li class="list-row" data-open-set="${s.id}">
      <span class="row-no">${i + 1}</span>
      <span class="row-main"><span class="row-title">${esc(s.title.replace(/^演習\d+ /, ''))}</span>
        <span class="row-sub">${r ? `前回 ${r.ok}/${r.n}・最高 ${r.best}/${r.n}` : 'まだ解いていない'}</span></span>
      <span class="score-chip ${cls}">${r ? `${r.ok}/${r.n}` : '未'}</span></li>`;
  }).join('') + `</ul>`;

  html += `<h2 class="section-title">章ごと</h2><ul class="list">` + SUBJ.chapters.map((c) => {
    const st = chapterStats(c.id);
    const cls = st.tried === 0 ? '' : st.okNow === st.total ? 'good' : 'bad';
    return `<li class="list-row" data-quiz-ch="${c.id}">
      <span class="row-no">${c.no}</span>
      <span class="row-main"><span class="row-title">${esc(c.title)}</span></span>
      <span class="score-chip ${cls}">${st.tried ? `${st.okNow}/${st.total}` : '未'}</span>
    </li>`;
  }).join('') + `</ul>`;
  $('quizmenu-body').innerHTML = html;
}

// ===== 問題を解く =====
let quiz = null; // { ids, i, results, title, mode, answered, startAt }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startQuiz(ids, title, mode) {
  if (!ids.length) { showToast('出題できる問題がありません'); return; }
  quiz = { ids, i: 0, results: [], title, answered: false, mode: mode || '', startAt: Date.now() };
  backTo.quiz = currentTab;
  showView('quiz');
  renderQuestion();
  if (mode === 'mock') startTimer(() => quizProgressText());
}

function startQuizMode(mode) {
  const all = Object.keys(QUESTIONS);
  if (mode === 'drill') startQuiz(prioritized(reachedJr(), DRILL_SIZE), '仕訳ドリル', 'drill');
  else if (mode === 'mock') startQuiz(pickExamQ1(), '第1問の模擬', 'mock');
  else if (mode === 'hard') {
    const chs = Object.keys(CHAPTERS).filter((id) => CH_FIRST_N[id] && CH_FIRST_N[id] <= workN());
    startQuiz(prioritized(hardOf(chs), 15), '本試験レベルの仕訳');
  }
  else if (mode === 'wrong') startQuiz(shuffle(wrongIds()), '間違えた問題');
  else if (mode === 'new') startQuiz(all.filter((id) => !state.quiz[id]).slice(0, 15), 'まだ解いていない問題');
}

// ===== タイマー(第1問の模擬・第3問の演習) =====
let timer = null;
function startTimer(text) {
  stopTimer();
  const tick = () => { const el = $(text.el || 'quiz-progress'); if (el) el.textContent = text(); };
  tick();
  timer = setInterval(tick, 1000);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function mmss(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function quizProgressText() {
  const base = `${quiz.title}　${Math.min(quiz.i + 1, quiz.ids.length)} / ${quiz.ids.length}`;
  return quiz.mode === 'mock' ? `${base}　⏱ ${mmss(Date.now() - quiz.startAt)}（目標15:00）` : base;
}

function renderQuestion() {
  const id = quiz.ids[quiz.i];
  const q = QUESTIONS[id];
  $('quiz-progress').textContent = quizProgressText();
  quiz.answered = false;
  let body = `<div class="q-chapter">${esc(chapterTitle(q.ch))}・${TYPE_LABEL[q.t]}${q.hard ? '<span class="pill hard">本試験レベル</span>' : ''}</div><p class="q-text">${esc(q.q)}</p>`;
  if (q.t === 'ox') {
    body += `<div class="ox">
      <button class="ox-btn" data-answer="1" aria-label="正しい（○）">○</button>
      <button class="ox-btn" data-answer="0" aria-label="誤り（×）">×</button>
    </div>`;
  } else if (q.t === 'num') {
    body += `<div class="num-row"><input id="num-input" class="amount-input big" type="text" inputmode="numeric" autocomplete="off" placeholder="金額"> 円</div>
      <button class="btn primary" id="btn-answer">答える</button>`;
  } else {
    body += jrForm(q) + `<button class="btn primary" id="btn-answer">答える</button>`;
  }
  $('quiz-body').innerHTML = body + `<div id="q-result"></div>`;
}

const toNum = (s) => Number(String(s).replace(/[,，\s円]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));

// 仕訳の答え合わせ。同じ側の同じ科目は合算して比べる(行の順番は問わない)
function sumSide(rows) {
  const m = {};
  rows.forEach(([a, x]) => { m[a] = (m[a] || 0) + x; });
  return m;
}
function sameMap(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

// 仕訳の入力欄(借方・貸方 各4行)
function jrForm(q) {
  const opt = `<option value="">勘定科目</option>` + q.opts.map((a) => `<option>${esc(a)}</option>`).join('');
  const rows = (side) => [0, 1, 2, 3].map((i) => `<div class="jr-row" data-side="${side}" data-row="${i}">
      <select class="jr-acc" aria-label="${side === 'dr' ? '借方' : '貸方'}科目${i + 1}">${opt}</select>
      <input class="amount-input" type="text" inputmode="numeric" autocomplete="off" placeholder="金額" aria-label="${side === 'dr' ? '借方' : '貸方'}金額${i + 1}">
    </div>`).join('');
  return `<div class="jr">
    <div class="jr-side"><div class="jr-head">借方</div>${rows('dr')}</div>
    <div class="jr-side"><div class="jr-head">貸方</div>${rows('cr')}</div>
  </div>`;
}

function jrCorrect(q, got) {
  return sameMap(sumSide(got.dr), sumSide(q.dr)) && sameMap(sumSide(got.cr), sumSide(q.cr));
}

// 行ごとに、正解の科目・金額と合っているかを色で示す
function markJrRows(root, q, got) {
  const want = { dr: sumSide(q.dr), cr: sumSide(q.cr) };
  const gotSum = { dr: sumSide(got.dr), cr: sumSide(got.cr) };
  root.querySelectorAll('.jr-row').forEach((row) => {
    const acc = row.querySelector('select').value;
    if (!acc) return;
    const side = row.dataset.side;
    row.classList.add(want[side][acc] !== undefined && want[side][acc] === gotSum[side][acc] ? 'row-ok' : 'row-ng');
  });
}

// root の中の仕訳の入力を読む。科目と金額の片方だけの行があれば null
function readJr(root) {
  const got = { dr: [], cr: [] };
  let bad = false;
  root.querySelectorAll('.jr-row').forEach((row) => {
    const acc = row.querySelector('select').value;
    const raw = row.querySelector('input').value.trim();
    if (!acc && !raw) return;
    const x = toNum(raw);
    if (!acc || !raw || !Number.isFinite(x) || x <= 0) { bad = true; return; }
    got[row.dataset.side].push([acc, x]);
  });
  return bad ? null : got;
}

function submitAnswer(choice) {
  if (quiz.answered) return;
  const id = quiz.ids[quiz.i];
  const q = QUESTIONS[id];
  let ok;
  if (q.t === 'ox') ok = choice === q.a;
  else if (q.t === 'num') {
    const raw = $('num-input').value.trim();
    if (!raw || !Number.isFinite(toNum(raw))) { showToast('金額を数字で入れてください'); return; }
    ok = toNum(raw) === q.ans;
  } else {
    const got = readJr($('quiz-body'));
    if (!got) { showToast('勘定科目と金額をセットで入れてください'); return; }
    if (!got.dr.length || !got.cr.length) { showToast('借方と貸方の両方を入れてください'); return; }
    ok = jrCorrect(q, got);
    markJrRows($('quiz-body'), q, got);
  }
  quiz.answered = true;
  recordAnswer(id, ok);
  quiz.results.push(ok);
  if (quiz.mode === 'drill') {
    const t = todayStr();
    state.ippon[t] = (state.ippon[t] || 0) + 1;
    saveState();
  }
  document.querySelectorAll('#quiz-body select, #quiz-body input, .ox-btn').forEach((el) => { el.disabled = true; });
  if ($('btn-answer')) $('btn-answer').remove();
  let head;
  if (q.t === 'ox') {
    document.querySelectorAll('.ox-btn').forEach((b) => b.classList.add((b.dataset.answer === '1') === q.a ? 'is-answer' : 'is-other'));
    head = `答えは ${q.a ? '○' : '×'}`;
  } else if (q.t === 'num') head = `答えは ${yen(q.ans)}円`;
  else head = '正しい仕訳';
  const last = quiz.i === quiz.ids.length - 1;
  $('q-result').innerHTML = `<div class="result ${ok ? 'ok' : 'ng'}">
      <div class="result-head">${ok ? '正解' : '不正解'}　${q.t === 'jr' ? '' : head}</div>
      ${q.t === 'jr' ? entryTable(q.dr, q.cr) : ''}
      ${q.exp ? `<p>${esc(q.exp)}</p>` : ''}
      ${ok ? `<button class="guess-btn" id="btn-guess">理由を説明できない（勘で当たった）→ ×にする</button>` : ''}
    </div>
    <div class="q-actions">
      <button class="btn ghost small" data-open-ch="${q.ch}">テキストで確認</button>
      <button class="btn primary" id="btn-next-q">${last ? '結果を見る' : '次の問題'}</button>
    </div>`;
  $('q-result').scrollIntoView({ block: 'nearest' });
}

function answerSummary(q) {
  if (q.t === 'ox') return `答え ${q.a ? '○' : '×'}${q.exp ? '：' + q.exp : ''}`;
  if (q.t === 'num') return `答え ${yen(q.ans)}円${q.exp ? '：' + q.exp : ''}`;
  return entryText(q.dr, q.cr);
}

function nextQuestion() {
  if (quiz.i < quiz.ids.length - 1) {
    quiz.i += 1;
    renderQuestion();
    $('view-quiz').scrollTop = 0;
    return;
  }
  stopTimer();
  const ok = quiz.results.filter(Boolean).length;
  const n = quiz.results.length;
  const wrongHere = quiz.ids.filter((id, k) => !quiz.results[k]);
  let scoreHtml = `<b>${ok}</b> / ${n}`;
  let note = ok === n ? '全問正解です。' : `間違えた ${n - ok} 問は、3回続けて正解するまで「間違えた問題」に残ります。`;
  if (quiz.mode === 'mock') {
    const sec = Math.round((Date.now() - quiz.startAt) / 1000);
    state.mocks.push({ at: new Date().toISOString(), score: ok * 3, max: 45, sec });
    saveState();
    scoreHtml = `<b>${ok * 3}</b> / 45点`;
    note = `かかった時間 ${mmss(sec * 1000)}（目標15分）。本番は39点（13問正解）以上を目指します。`;
  }
  $('quiz-progress').textContent = quiz.title;
  $('quiz-body').innerHTML = `<div class="finish">
      <div class="finish-score">${scoreHtml}</div>
      <p class="muted">${esc(note)}</p>
    </div>
    ${wrongHere.length ? `<h2 class="section-title">間違えた問題</h2><ul class="list">` + wrongHere.map((id) => {
      const q = QUESTIONS[id];
      return `<li class="list-row static"><span class="row-main"><span class="row-title">${esc(q.q)}</span>
        <span class="row-sub">${esc(answerSummary(q))}</span></span></li>`;
    }).join('') + `</ul>` : ''}
    <div class="q-actions">
      ${wrongHere.length ? `<button class="btn ghost" id="btn-retry-wrong">間違えた問題をもう一度</button>` : ''}
      <button class="btn primary" id="btn-finish-quiz">終わる</button>
    </div>`;
  quiz.retry = wrongHere;
}

// ===== 第3問の演習 =====
let set = null; // { id, startAt, graded }

function openSet(id) {
  const s = SETS[id];
  set = { id, startAt: Date.now(), graded: false };
  if (!$('view-set').classList.contains('active')) backTo.set = currentTab;
  const tb = s.tb.map(([a, d, c]) => `<tr><td class="num">${d ? yen(d) : ''}</td><td>${esc(a)}</td><td class="num">${c ? yen(c) : ''}</td></tr>`).join('');
  const total = s.tb.reduce((x, r) => x + r[1], 0);
  $('set-body').innerHTML = `<h1 class="ch-title">第3問 ${esc(s.title)}</h1>
    <p>${esc(s.lead)}</p>
    <h3>決算整理前残高試算表</h3>
    <div class="table-wrap"><table class="tb"><thead><tr><th>借方</th><th>勘定科目</th><th>貸方</th></tr></thead>
      <tbody>${tb}<tr class="total"><td class="num">${yen(total)}</td><td>合計</td><td class="num">${yen(total)}</td></tr></tbody></table></div>
    <h3>決算整理事項</h3>
    <ol class="adj">${s.adj.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ol>
    <p class="muted">下書きに決算整理仕訳を書いてから、金額を入れてください。</p>
    <h3>答え</h3>
    <div class="blanks">${s.blanks.map((b, i) => `<label class="blank" for="blank-${i}"><span>${esc(b.label)}</span>
      <span class="blank-in"><input id="blank-${i}" class="amount-input" type="text" inputmode="numeric" autocomplete="off" placeholder="金額"> 円</span>
      <span class="blank-ans" id="blank-ans-${i}"></span></label>`).join('')}</div>
    <button class="btn primary" id="btn-grade-set">採点する</button>
    <div id="set-result"></div>`;
  showView('set');
  startTimer(Object.assign(() => `${s.title.split(' ')[0]}　⏱ ${mmss(Date.now() - set.startAt)}（目標25:00）`, { el: 'set-progress' }));
}

function gradeSet() {
  if (set.graded) return;
  const s = SETS[set.id];
  set.graded = true;
  stopTimer();
  let ok = 0;
  s.blanks.forEach((b, i) => {
    const input = $('blank-' + i);
    const right = toNum(input.value.trim()) === b.ans && input.value.trim() !== '';
    if (right) ok += 1;
    input.disabled = true;
    input.closest('.blank').classList.add(right ? 'row-ok' : 'row-ng');
    $('blank-ans-' + i).textContent = right ? '✓' : `答え ${yen(b.ans)}`;
  });
  const prev = state.d3[set.id];
  state.d3[set.id] = { at: new Date().toISOString(), ok, n: s.blanks.length, best: Math.max(ok, prev ? prev.best : 0) };
  saveState();
  $('btn-grade-set').remove();
  $('set-result').innerHTML = `<div class="finish"><div class="finish-score"><b>${ok}</b> / ${s.blanks.length}</div>
      <p class="muted">かかった時間 ${mmss(Date.now() - set.startAt)}（目標25分）</p></div>
    <h3>決算整理仕訳（解説）</h3>
    ${s.adj.map((a, i) => `<p class="adj-head">${i + 1}. ${esc(a.text)}</p>${entryTable(a.dr, a.cr)}`).join('')}
    <div class="q-actions">
      <button class="btn ghost" data-open-set="${s.id}">もう一度解く</button>
      <button class="btn primary" id="btn-finish-set">終わる</button>
    </div>`;
  $('set-progress').textContent = s.title.split(' ')[0];
}

// ===== 本番形式の模擬試験(ネット試験と同じ60分・第1問〜第3問・100点満点) =====
const EXAM_MS = 60 * 60 * 1000;
let exam = null; // { def, q1: 仕訳の問題id×15, startAt, done, tab, i }

// 第1問の15問: 同じ章からは3問まで
function pickExamQ1() {
  const per = {};
  const hard = shuffle(HARD_IDS.slice());
  return hard.concat(shuffle(JR_IDS.filter((id) => !QUESTIONS[id].hard))).filter((id) => {
    const c = QUESTIONS[id].ch;
    per[c] = (per[c] || 0) + 1;
    return per[c] <= 3;
  }).slice(0, 15);
}

function examResults(id) {
  return state.exams.filter((r) => r.id === id);
}

function examChip(id) {
  const rs = examResults(id);
  if (!rs.length) return '<span class="score-chip">未</span>';
  const last = rs[rs.length - 1].score;
  return `<span class="score-chip ${last >= 70 ? 'good' : 'bad'}">${last}点</span>`;
}

function startExam(id) {
  const def = D.exams.find((e) => e.id === id);
  exam = { def, q1: pickExamQ1(), startAt: Date.now(), done: false, tab: 1, i: 0 };
  if (!$('view-exam').classList.contains('active')) backTo.exam = currentTab;
  renderExam();
  $('btn-end-exam').classList.remove('hidden');
  showView('exam');
  startTimer(Object.assign(() => {
    const left = EXAM_MS - (Date.now() - exam.startAt);
    if (left <= 0 && !exam.done) { showToast('時間になりました。採点します'); setTimeout(gradeExam, 0); }
    return `${exam.def.title}　残り ${mmss(Math.max(0, left))}`;
  }, { el: 'exam-timer' }));
}

function blankInput(b, key) {
  if (b.kind === 'num') {
    return `<span class="blank-in"><input class="amount-input" type="text" inputmode="numeric" autocomplete="off" placeholder="金額" data-k="${key}"> 円</span>`;
  }
  if (b.kind === 'choice') {
    return `<select class="jr-acc blank-sel" data-k="${key}"><option value="">選ぶ</option>${b.opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
  }
  return `<span class="multi">${b.opts.map((o) => `<label class="chk"><input type="checkbox" value="${esc(o)}" data-k="${key}">${esc(o)}</label>`).join('')}</span>`;
}

// 財務諸表の1行(空欄なら入力欄)
function fsRow(r, key) {
  const label = r.contra ? `　${esc(r.label)}` : esc(r.label);
  const cell = r.blank
    ? `<input class="amount-input fs-in" type="text" inputmode="numeric" autocomplete="off" placeholder="金額" data-k="${key}">`
    : `${r.contra ? '△' : ''}${yen(r.amt)}`;
  return `<tr class="${r.blank ? 'is-blank' : ''}"><td>${label}</td><td class="num">${r.blank && r.contra ? '△' : ''}${cell}<span class="fs-ans" id="ans-${key}"></span></td></tr>`;
}

function fsTable(title, parts) {
  return `<h3>${title}</h3>` + parts.map(([name, rows, prefix]) => `<div class="table-wrap"><table class="tb fs"><thead><tr><th colspan="2">${name}</th></tr></thead>
    <tbody>${rows.map((r, i) => fsRow(r, `${prefix}-${i}`)).join('')}</tbody></table></div>`).join('');
}

function renderExam() {
  const e = exam.def;
  const tabs = [['第1問', '45点'], ['第2問', '20点'], ['第3問', '35点']];
  $('exam-tabs').innerHTML = tabs.map(([t, pt], i) => `<button class="exam-tab ${exam.tab === i + 1 ? 'on' : ''}" data-exam-tab="${i + 1}">${t}<small>${pt}</small></button>`).join('');

  // 第1問: 番号ボタンで行き来する
  let p1 = `<div class="exam-nav">${exam.q1.map((id, i) => `<button class="exam-num ${i === exam.i ? 'on' : ''}" data-exam-q="${i}">${i + 1}</button>`).join('')}</div>`;
  p1 += exam.q1.map((id, i) => {
    const q = QUESTIONS[id];
    return `<div class="exam-q ${i === exam.i ? '' : 'hidden'}" data-i="${i}">
      <div class="q-chapter">第1問　問${i + 1}（3点）</div>
      <p class="q-text">${esc(q.q)}</p>${jrForm(q)}<div class="exam-q-ans"></div></div>`;
  }).join('');
  p1 += `<div class="pager"><button class="btn ghost small" id="btn-exam-prev">‹ 前の問題</button><button class="btn ghost small" id="btn-exam-next">次の問題 ›</button></div>`;

  // 第2問: 小問2つ
  const p2 = e.q2.map((pb, pi) => `<h3>（${pi + 1}）${esc(pb.title)}（10点）</h3>
    <p>${esc(pb.lead)}</p>
    ${pb.facts.length ? `<ul>${pb.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <div class="blanks">${pb.blanks.map((b, bi) => `<div class="blank ${b.kind === 'num' ? '' : 'wide'}" data-blank="q2-${pi}-${bi}"><span>${esc(b.label)}</span>
      ${blankInput(b, `q2-${pi}-${bi}`)}<span class="blank-ans" id="ans-q2-${pi}-${bi}"></span></div>`).join('')}</div>
    <div class="exam-exp hidden">${pb.exp.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}</div>`).join('');

  // 第3問: 財務諸表
  const s = e.q3;
  const tb = s.tb.map(([a, d, c]) => `<tr><td class="num">${d ? yen(d) : ''}</td><td>${esc(a)}</td><td class="num">${c ? yen(c) : ''}</td></tr>`).join('');
  const total = s.tb.reduce((x, r) => x + r[1], 0);
  const p3 = `<p>${esc(s.lead)}</p>
    <h3>決算整理前残高試算表</h3>
    <div class="table-wrap"><table class="tb"><thead><tr><th>借方</th><th>勘定科目</th><th>貸方</th></tr></thead>
      <tbody>${tb}<tr class="total"><td class="num">${yen(total)}</td><td>合計</td><td class="num">${yen(total)}</td></tr></tbody></table></div>
    <h3>決算整理事項</h3>
    <ol class="adj">${s.adj.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ol>
    <p class="muted">△は差し引く金額です。空欄には△を付けずに金額だけ入れてください。</p>
    ${fsTable('損益計算書', [['費用', s.fs.pl.exp, 'pl-exp'], ['収益', s.fs.pl.rev, 'pl-rev']])}
    ${fsTable('貸借対照表', [['資産', s.fs.bs.asset, 'bs-asset'], ['負債', s.fs.bs.liab, 'bs-liab'], ['純資産', s.fs.bs.eq, 'bs-eq']])}
    <div class="exam-exp hidden"><h3>決算整理仕訳（解説）</h3>${s.adj.map((a, i) => `<p class="adj-head">${i + 1}. ${esc(a.text)}</p>${entryTable(a.dr, a.cr)}`).join('')}</div>`;

  $('exam-body').innerHTML = `<div id="exam-result"></div>
    <div class="exam-panel" data-panel="1">${p1}</div>
    <div class="exam-panel hidden" data-panel="2">${p2}</div>
    <div class="exam-panel hidden" data-panel="3">${p3}</div>
    <button class="btn primary" id="btn-end-exam2">解答を終了して採点する</button>`;
}

function examTab(n) {
  exam.tab = n;
  document.querySelectorAll('.exam-tab').forEach((b) => b.classList.toggle('on', Number(b.dataset.examTab) === n));
  document.querySelectorAll('.exam-panel').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.panel) !== n));
  $('view-exam').scrollTop = 0;
}

function examQ(i) {
  exam.i = Math.max(0, Math.min(exam.q1.length - 1, i));
  document.querySelectorAll('.exam-q').forEach((el) => el.classList.toggle('hidden', Number(el.dataset.i) !== exam.i));
  document.querySelectorAll('.exam-num').forEach((b) => b.classList.toggle('on', Number(b.dataset.examQ) === exam.i));
}

// 第1問の番号ボタンに、入力済みかどうかを示す
function markExamAnswered() {
  document.querySelectorAll('.exam-q').forEach((el) => {
    const filled = [...el.querySelectorAll('.jr-row select')].some((x) => x.value);
    document.querySelector(`.exam-num[data-exam-q="${el.dataset.i}"]`).classList.toggle('filled', filled);
  });
}

function gradeExam() {
  if (!exam || exam.done) return;
  exam.done = true;
  stopTimer();
  const sec = Math.round(Math.min(EXAM_MS, Date.now() - exam.startAt) / 1000);
  const root = $('exam-body');

  // 第1問: 1問3点
  let p1 = 0;
  exam.q1.forEach((id, i) => {
    const box = root.querySelector(`.exam-q[data-i="${i}"]`);
    const q = QUESTIONS[id];
    const got = readJr(box);
    const tried = !!(got && (got.dr.length || got.cr.length));
    const ok = !!(got && got.dr.length && got.cr.length && jrCorrect(q, got));
    if (ok) p1 += 3;
    if (tried) { recordAnswer(id, ok); markJrRows(box, q, got); }
    box.querySelector('.exam-q-ans').innerHTML = `<div class="result ${ok ? 'ok' : 'ng'}"><div class="result-head">${ok ? '正解' : tried ? '不正解' : '未解答・入力が不完全'}</div>
      ${entryTable(q.dr, q.cr)}${q.exp ? `<p>${esc(q.exp)}</p>` : ''}</div>`;
    root.querySelector(`.exam-num[data-exam-q="${i}"]`).classList.add(ok ? 'ok' : 'ng');
  });

  // 第2問: 空欄ごとの配点
  let p2 = 0;
  exam.def.q2.forEach((pb, pi) => pb.blanks.forEach((b, bi) => {
    const key = `q2-${pi}-${bi}`;
    let ok;
    if (b.kind === 'num') { const v = root.querySelector(`[data-k="${key}"]`).value.trim(); ok = v !== '' && toNum(v) === b.ans; }
    else if (b.kind === 'choice') ok = root.querySelector(`[data-k="${key}"]`).value === b.ans;
    else {
      const got = [...root.querySelectorAll(`[data-k="${key}"]:checked`)].map((x) => x.value).sort();
      ok = got.join('|') === b.ans.slice().sort().join('|');
    }
    if (ok) p2 += b.pts;
    root.querySelector(`[data-blank="${key}"]`).classList.add(ok ? 'row-ok' : 'row-ng');
    $('ans-' + key).textContent = ok ? '✓' : `答え ${b.kind === 'num' ? yen(b.ans) : b.kind === 'multi' ? b.ans.join('・') : b.ans}`;
  }));

  // 第3問: 空欄の正解数に応じて35点を配分
  let ok3 = 0;
  let n3 = 0;
  const fs = exam.def.q3.fs;
  [['pl-exp', fs.pl.exp], ['pl-rev', fs.pl.rev], ['bs-asset', fs.bs.asset], ['bs-liab', fs.bs.liab], ['bs-eq', fs.bs.eq]].forEach(([prefix, rows]) => {
    rows.forEach((r, i) => {
      if (!r.blank) return;
      const key = `${prefix}-${i}`;
      const input = root.querySelector(`[data-k="${key}"]`);
      const v = input.value.replace(/[△▲-]/g, '').trim();
      const ok = v !== '' && toNum(v) === r.amt;
      n3 += 1;
      if (ok) ok3 += 1;
      input.classList.add(ok ? 'in-ok' : 'in-ng');
      $('ans-' + key).textContent = ok ? ' ✓' : ` 答え ${yen(r.amt)}`;
    });
  });
  const p3 = Math.round(35 * ok3 / n3);

  root.querySelectorAll('input, select').forEach((x) => { x.disabled = true; });
  root.querySelectorAll('.exam-exp').forEach((x) => x.classList.remove('hidden'));
  if ($('btn-end-exam2')) $('btn-end-exam2').remove();
  const score = p1 + p2 + p3;
  state.exams.push({ at: new Date().toISOString(), id: exam.def.id, score, p1, p2, p3, sec });
  if (exam.def.gate) state.gates[exam.def.gate] = String(score); // 6日目の関門に自動で記録する
  saveState();
  $('exam-timer').textContent = `${exam.def.title}　採点済み`;
  $('btn-end-exam').classList.add('hidden');
  $('exam-result').innerHTML = `<div class="finish">
      <div class="finish-score"><b>${score}</b> / 100点</div>
      <p class="pass ${score >= 70 ? 'ok' : 'ng'}">${score >= 70 ? '合格ライン（70点）に届いています' : `合格ラインまであと ${70 - score} 点`}</p>
    </div>
    <div class="table-wrap"><table class="tb"><thead><tr><th>問題</th><th>得点</th><th>目標</th></tr></thead><tbody>
      <tr><td>第1問 仕訳</td><td class="num">${p1} / 45</td><td class="num">39</td></tr>
      <tr><td>第2問</td><td class="num">${p2} / 20</td><td class="num">12</td></tr>
      <tr><td>第3問（空欄 ${ok3}/${n3}）</td><td class="num">${p3} / 35</td><td class="num">28</td></tr>
    </tbody></table></div>
    <p class="muted">かかった時間 ${mmss(sec * 1000)}。上の「第1問・第2問・第3問」を切り替えると、答えと解説を確認できます。第1問で間違えた仕訳は「間違えた問題」に入りました。</p>
    <div class="q-actions"><button class="btn ghost" data-open-exam="${exam.def.id}">もう一度解く</button>
      <button class="btn primary" id="btn-finish-exam">終わる</button></div>`;
  $('view-exam').scrollTop = 0;
}

// ===== 計画 =====
function renderPlan() {
  const k = todayN();
  let html = '';
  if (!state.start) html += `<div class="card soft plan-note"><p class="muted">「今日」の画面で1日目の日付を決めると、日付が入ります。</p></div>`;
  PLAN.forEach((p) => {
    const d = dayDate(p.n);
    const done = !!state.done[p.n];
    const late = !done && k && p.n < k;
    html += `<div class="plan-row ${k === p.n ? 'today' : ''} ${done ? 'done' : ''} ${late ? 'late' : ''}">
      <div class="plan-date"><b>${p.n}</b><span>日目</span></div>
      <div class="plan-main" data-plan-detail="${p.n}">
        <div class="plan-theme">${esc(p.theme)}</div>
        <div class="plan-sub">${d ? fmtDay(d) + '・' : ''}${p.gate ? '<b class="gate-mark">関門</b>・' : ''}${esc(p.phase)}</div>
      </div>
      <button class="plan-check ${done ? 'on' : ''}" data-toggle-day="${p.n}" aria-label="${done ? '完了を取り消す' : '完了にする'}">${done ? '✓' : ''}</button>
    </div>`;
  });
  $('plan-body').innerHTML = html;
}

function showPlanDetail(n) {
  const p = PLAN[n - 1];
  if (!$('view-chapter').classList.contains('active')) backTo.chapter = currentTab;
  $('chapter-crumb').textContent = '計画';
  const d = dayDate(n);
  $('chapter-body').innerHTML = `<h1 class="ch-title">${n}日目${d ? `<br><span class="ch-sub">${fmtDay(d, true)}</span>` : ''}</h1>` + dayCard(p, 'この日にやること');
  showView('chapter');
}

// ===== 記録 =====
function renderRecord() {
  const k = todayN();
  const doneN = PLAN.filter((p) => state.done[p.n]).length;
  const readN = Object.keys(state.read).filter((id) => CHAPTERS[id]).length;
  const nCh = SUBJ.chapters.length;
  const oxIds = Object.keys(QUESTIONS).filter((id) => QUESTIONS[id].t !== 'jr' && state.quiz[id]);
  const oxOk = oxIds.filter((id) => state.quiz[id].last).length;

  let html = `<div class="stats">
    <div class="stat"><b>${doneN}/${LAST}</b><span>完了した日${k && k >= 1 ? `<br>（今日は${Math.min(k, LAST)}日目）` : ''}</span></div>
    <div class="stat"><b>${readN}/${nCh}</b><span>読んだ章</span></div>
    <div class="stat"><b>${jrRate()}%</b><span>仕訳の正答率<br>（全${JR_IDS.length}問・未回答は×）</span></div>
    <div class="stat"><b>${d3Rate()}%</b><span>第3問 演習の正答率<br>（全${D.dai3.length}演習）</span></div>
    <div class="stat"><b>${oxIds.length ? Math.round(oxOk / oxIds.length * 100) : 0}%</b><span>計算・○×の正答率<br>（${oxIds.length}問解いた）</span></div>
    <div class="stat"><b>${wrongIds().length}</b><span>間違えた問題<br>（3回続けて正解で外れる）</span></div>
  </div>`;

  html += `<h2 class="section-title">関門</h2><ul class="list">` + PLAN.filter((p) => p.gate).map((p) => {
    const rs = p.gate.map((it) => gateResult(it));
    let chip = '<span class="score-chip">これから</span>';
    if (rs.some((r) => r.pass === null)) chip = (k && p.n <= k) ? '<span class="score-chip bad">未入力</span>' : chip;
    else if (rs.every((r) => r.pass)) chip = '<span class="score-chip good">通過</span>';
    else if (k && p.n <= k) chip = '<span class="score-chip bad">未達</span>';
    return `<li class="list-row" data-plan-detail="${p.n}">
      <span class="row-main"><span class="row-title">${p.n}日目：${p.gate.map((it) => esc(it.label) + ' ' + it.target + unit(it)).join('／')}</span>
        <span class="row-sub">${rs.map((r) => esc(r.text)).join('／')}</span></span>
      ${chip}</li>`;
  }).join('') + `</ul>`;

  html += `<h2 class="section-title">本番形式の模擬試験（100点満点）</h2>`;
  html += state.exams.length ? `<ul class="list">` + state.exams.slice(-10).reverse().map((r) => {
    const d = new Date(r.at);
    const def = D.exams.find((e) => e.id === r.id);
    return `<li class="list-row static"><span class="row-main"><span class="row-title">${esc(def ? def.title : r.id)}・${fmtDay(ymd(d))}</span>
      <span class="row-sub">第1問 ${r.p1}・第2問 ${r.p2}・第3問 ${r.p3}・${mmss(r.sec * 1000)}</span></span>
      <span class="score-chip ${r.score >= 70 ? 'good' : 'bad'}">${r.score}点</span></li>`;
  }).join('') + `</ul>` : `<div class="card soft"><p class="muted">「問題」タブの「本番形式の模擬試験」を解くと、ここに並びます。6日目の関門にも自動で記録されます。</p></div>`;

  html += `<h2 class="section-title">第1問の模擬（45点満点）</h2>`;
  html += state.mocks.length ? `<ul class="list">` + state.mocks.slice(-10).reverse().map((m) => {
    const d = new Date(m.at);
    return `<li class="list-row static"><span class="row-main"><span class="row-title">${fmtDay(ymd(d))} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}</span>
      <span class="row-sub">かかった時間 ${mmss(m.sec * 1000)}</span></span>
      <span class="score-chip ${m.score >= 39 ? 'good' : 'bad'}">${m.score}点</span></li>`;
  }).join('') + `</ul>` : `<div class="card soft"><p class="muted">「問題」タブの「第1問の模擬」を解くと、ここに並びます。目標は39点以上です。</p></div>`;

  html += `<p class="foot">バージョン ${APP_VERSION}${state.start ? `・受験日 ${fmtDay(dayDate(LAST), true)}（予定）` : ''}</p>`;
  $('record-body').innerHTML = html;
}

// ===== 設定 =====
let updateStatus = ''; // 最後に「最新バージョンか確認」した結果
function renderSettings() {
  $('settings-body').innerHTML = `
    <h2 class="section-title">アプリ情報</h2>
    <div class="card soft">
      <div class="score-row">今のバージョン<b class="ver">${APP_VERSION}</b></div>
      <button class="btn primary" id="btn-check-update">最新バージョンか確認する</button>
      <p class="muted" id="update-status">${esc(updateStatus || 'アプリを開いたときと、画面に戻ったときにも自動で確認しています。')}</p>
    </div>

    <h2 class="section-title">1日目の日付</h2>
    <div class="card soft">
      <label class="score-row" for="start-change">1日目<input id="start-change" class="date-input" type="date" value="${esc(state.start || '')}" data-start-input="1"></label>
      <p class="muted">${state.start ? `受験日（7日目）は${fmtDay(dayDate(LAST), true)}です。` : ''}受験日を変えたときは、ここで1日目をずらしてください。完了の記録は「何日目」で残ります。</p>
    </div>

    <h2 class="section-title">バックアップ</h2>
    <div class="card soft">
      <p class="muted">記録はこの端末の中だけに保存されます。機種変更やブラウザのデータ削除に備えて、ときどきファイルに書き出してください。</p>
      <div class="btn-row">
        <button class="btn ghost" id="btn-export">書き出す</button>
        <button class="btn ghost" id="btn-import">読み込む</button>
      </div>
    </div>`;
}

function openSettings() {
  backTo.settings = currentTab;
  renderSettings();
  showView('settings');
}

// 確認の結果を、設定画面の表示とトーストの両方に出す
function reportUpdate(msg, manual) {
  const t = new Date();
  updateStatus = `${msg}（${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} に確認）`;
  if ($('update-status')) $('update-status').textContent = updateStatus;
  if (manual) showToast(msg);
}

const RENDER = { today: renderToday, text: renderText, quizmenu: renderQuizMenu, plan: renderPlan, record: renderRecord };

// ===== 操作 =====
function inPlanDetail() {
  return $('view-chapter').classList.contains('active') && $('chapter-crumb').textContent === '計画';
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-open-ch], [data-quiz-ch], [data-plan-detail], [data-open-set], [data-open-intro], [data-open-exam]');
  if (!el || el.disabled) return;
  const ds = el.dataset;
  if (el.classList.contains('tab-btn')) return switchTab(ds.tab);
  if (ds.setStart) {
    state.start = ds.setStart;
    saveState();
    showToast(`1日目は${fmtDay(ds.setStart)}、受験日は${fmtDay(addDays(ds.setStart, LAST - 1))}です`);
    return renderToday();
  }
  if (ds.toggleDay) {
    const n = Number(ds.toggleDay);
    if (state.done[n]) delete state.done[n];
    else { state.done[n] = new Date().toISOString(); showToast('お疲れさまでした'); }
    saveState();
    if (inPlanDetail()) showPlanDetail(n);
    else RENDER[currentTab]();
    return;
  }
  if (ds.toggleRead) {
    if (state.read[ds.toggleRead]) delete state.read[ds.toggleRead];
    else state.read[ds.toggleRead] = new Date().toISOString();
    saveState();
    return openChapter(ds.toggleRead);
  }
  if (ds.openIntro) return openIntro();
  if (ds.openCh) return openChapter(ds.openCh);
  if (ds.quizCh) return startQuiz(CHAPTERS[ds.quizCh].quiz.map((q) => q.id), `第${CHAPTERS[ds.quizCh].no}章`);
  if (ds.quizMode) return startQuizMode(ds.quizMode);
  if (ds.quizHard) return startQuiz(prioritized(hardOf(PLAN[Number(ds.quizHard) - 1].ch), 99), `${ds.quizHard}日目の本試験レベル`);
  if (ds.openSet) return openSet(ds.openSet);
  if (ds.openExam) {
    if (exam && !exam.done && $('view-exam').classList.contains('active')) return;
    return startExam(ds.openExam);
  }
  if (ds.examTab) return examTab(Number(ds.examTab));
  if (ds.examQ) { markExamAnswered(); return examQ(Number(ds.examQ)); }
  if (ds.answer) return submitAnswer(ds.answer === '1');
  if (ds.planDetail) return showPlanDetail(Number(ds.planDetail));
  switch (el.id) {
    case 'btn-answer': return submitAnswer();
    case 'btn-next-q': return nextQuestion();
    case 'btn-guess': {
      markGuess(quiz.ids[quiz.i]);
      quiz.results[quiz.i] = false;
      const box = el.closest('.result');
      box.classList.replace('ok', 'ng');
      box.querySelector('.result-head').textContent = '勘で当たった → 間違えた問題に入れました';
      el.remove();
      return;
    }
    case 'btn-retry-wrong': return startQuiz(shuffle(quiz.retry.slice()), '間違えた問題');
    case 'btn-finish-quiz':
    case 'btn-quit-quiz': return switchTab(backTo.quiz);
    case 'btn-grade-set': return gradeSet();
    case 'btn-finish-set':
    case 'btn-quit-set': return switchTab(backTo.set);
    case 'btn-back-chapter': return switchTab(backTo.chapter);
    case 'btn-settings': return openSettings();
    case 'btn-back-settings': return switchTab(backTo.settings || 'today');
    case 'btn-exam-prev': markExamAnswered(); return examQ(exam.i - 1);
    case 'btn-exam-next': markExamAnswered(); return examQ(exam.i + 1);
    case 'btn-end-exam':
    case 'btn-end-exam2':
      if (exam.done) return;
      if (confirm('解答を終了して採点しますか？')) gradeExam();
      return;
    case 'btn-quit-exam':
      if (!exam.done && !confirm('試験を中断しますか？ 入力した解答は消えます')) return;
      return switchTab(backTo.exam);
    case 'btn-finish-exam': return switchTab(backTo.exam);
    case 'btn-export': return doExport();
    case 'btn-import': return $('backup-file').click();
    case 'btn-check-update': return checkForUpdate(true);
  }
});

// 金額や答えの入力中に Enter で答える
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('#quiz-body input')) return;
  e.preventDefault();
  if (quiz && quiz.answered) nextQuestion(); else submitAnswer();
});

document.addEventListener('change', (e) => {
  const { gateId, startInput } = e.target.dataset;
  if (e.target.matches('.amount-input')) { // 金額は3桁ごとにカンマを入れて見やすくする
    const x = toNum(e.target.value.trim());
    if (e.target.value.trim() && Number.isFinite(x)) e.target.value = yen(x);
    return;
  }
  if (startInput) {
    if (!e.target.value) return;
    state.start = e.target.value;
    saveState();
    showToast(`1日目は${fmtDay(state.start)}、受験日は${fmtDay(dayDate(LAST))}です`);
    if ($('view-settings').classList.contains('active')) return renderSettings();
    return RENDER[currentTab]();
  }
  if (!gateId) return;
  const v = e.target.value.trim();
  if (v === '') delete state.gates[gateId]; else state.gates[gateId] = String(Math.max(0, Math.min(100, Number(v) || 0)));
  saveState();
  showToast('点数を保存しました');
  if (inPlanDetail()) {
    const d = $('chapter-body').querySelector('[data-toggle-day]');
    if (d) showPlanDetail(Number(d.dataset.toggleDay));
  } else if (currentTab === 'today') renderToday();
});

$('backup-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    importBackup(await f.text());
    showToast('バックアップを読み込みました');
    renderSettings();
  } catch (err) {
    showToast('読み込めませんでした：' + err.message);
  }
});

async function doExport() {
  const name = `簿記3級の記録_${todayStr()}.json`;
  const blob = new Blob([exportBackup()], { type: 'application/json' });
  // iPhoneでは共有シートから「ファイルに保存」できるようにする
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 日付が変わったら(アプリを開いたまま翌日になった場合も)今の画面を描き直す
let lastDay = todayStr();
document.addEventListener('visibilitychange', () => {
  const busy = ['view-quiz', 'view-set', 'view-chapter', 'view-exam'].some((v) => $(v).classList.contains('active'));
  if (document.visibilityState === 'visible' && todayStr() !== lastDay) {
    lastDay = todayStr();
    if (!busy) RENDER[currentTab]();
  }
  if (document.visibilityState === 'visible') checkForUpdate(false);
});

// ===== 自動アップデート =====
// サーバー上の最新の js/version.js を(キャッシュを通さず)取りに行き、今動いているバージョンと比べる
async function fetchLatestVersion() {
  const res = await fetch(`js/version.js?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('取得できませんでした');
  const m = (await res.text()).match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('バージョンを読み取れませんでした');
  return m[1];
}

let pendingReload = false;
let updateInFlight = false;
// 新しいバージョンがあれば、そのファイル一式を新しいキャッシュに入れてから画面を更新する。
// service-worker.js 自体は中身が変わらないリリースもあるので、ブラウザの更新チェックだけに頼らない
async function checkForUpdate(manual) {
  if (updateInFlight) return;
  if (!('caches' in window)) { if (manual) reportUpdate('このブラウザでは確認できません', true); return; }
  updateInFlight = true;
  if (manual && $('update-status')) $('update-status').textContent = '確認しています…';
  try {
    const latest = await fetchLatestVersion();
    if (latest === APP_VERSION) {
      reportUpdate(`最新のバージョン（${APP_VERSION}）です`, manual);
      return;
    }
    // 同じバージョンへの自動更新は1回だけ(HTTPキャッシュが古いまま再読込を繰り返さないため)
    let tried = null;
    try { tried = localStorage.getItem('boki3-update-tried'); } catch (e) { /* なくても動く */ }
    if (!manual && tried === latest) return;
    try { localStorage.setItem('boki3-update-tried', latest); } catch (e) { /* なくても動く */ }

    const name = 'boki3-cache-' + latest;
    const cache = await caches.open(name);
    await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== name).map((k) => caches.delete(k)));
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.update().catch(() => {});

    if (['view-quiz', 'view-set', 'view-exam'].some((v) => $(v).classList.contains('active'))) {
      pendingReload = true;
      reportUpdate(`新しいバージョン（${latest}）があります。問題を終えたら更新します`, true);
    } else {
      reportUpdate(`新しいバージョン（${latest}）に更新します`, true);
      setTimeout(() => location.reload(), 900);
    }
  } catch (e) {
    reportUpdate('確認できませんでした。通信状態を確かめてください', manual);
  } finally {
    updateInFlight = false;
  }
}

// ===== 起動 =====
$('app-version').textContent = 'v' + APP_VERSION;
switchTab('today'); // 開いたら毎回「今日」から
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
checkForUpdate(false); // 開いたときに、裏で新しいバージョンがないか確認する
