(function () {
  "use strict";

  var R = window.ASSESSMENT;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function makeReportId(date) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易看错的 I O 0 1
    var rnd = "";
    var buf = new Uint32Array(4);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 4; i++) rnd += chars[buf[i] % chars.length];
    return R.brand.idPrefix + "-" + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + "-" + rnd;
  }
  function formatDate(d) {
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  // ---------- 生成表单 ----------
  function fillSelect(id, list) {
    var sel = $(id);
    sel.innerHTML = '<option value="">请选择</option>' +
      list.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join("");
  }

  function buildForm() {
    fillSelect("industry", R.options.industry);
    fillSelect("region", R.options.region);
    fillSelect("revenue", R.options.revenue);
    fillSelect("years", R.options.years);

    var html = R.dimensions.map(function (dim, di) {
      var qs = dim.questions.map(function (q, qi) {
        var opts = q.options.map(function (o, oi) {
          var id = q.id + "_" + oi;
          return '<label class="opt" for="' + id + '"><input type="radio" id="' + id + '" name="' + q.id +
            '" value="' + oi + '"><span>' + esc(o.label) + '</span></label>';
        }).join("");
        return '<fieldset class="question" id="q_' + q.id + '"><legend><span class="qno">' +
          (qi + 1) + '</span>' + esc(q.text) + '</legend><div class="opts">' + opts + '</div></fieldset>';
      }).join("");
      return '<section class="block"><h2><span class="step">' + (di + 2) + '</span>' + esc(dim.name) +
        '<small>' + esc(dim.desc) + '</small></h2>' + qs + '</section>';
    }).join("");
    $("questionBlocks").innerHTML = html;
  }

  // ---------- 读取与校验 ----------
  function normalizePhone(raw) {
    var d = String(raw || "").replace(/[^\d]/g, "");
    if (d.indexOf("60") === 0) d = "0" + d.slice(2);
    return d;
  }

  function readForm() {
    var f = {
      companyName: $("companyName").value.trim(),
      contactName: $("contactName").value.trim(),
      phone: $("phone").value.trim(),
      email: $("email").value.trim(),
      industry: $("industry").value,
      region: $("region").value,
      revenue: $("revenue").value,
      years: $("years").value,
      staff: $("staff").value.trim(),
      shareholders: $("shareholders").value.trim(),
      answers: {}
    };
    R.dimensions.forEach(function (dim) {
      dim.questions.forEach(function (q) {
        var picked = document.querySelector('input[name="' + q.id + '"]:checked');
        f.answers[q.id] = picked ? Number(picked.value) : null;
      });
    });
    return f;
  }

  function validate(f) {
    var errs = []; // { el, msg }
    function need(id, label) { if (!f[id]) errs.push({ el: id, msg: "请填写「" + label + "」" }); }

    need("companyName", "企业名称");
    need("contactName", "您的姓名");
    if (!f.phone) errs.push({ el: "phone", msg: "请填写「手机号码」" });
    else {
      var p = normalizePhone(f.phone);
      if (!/^0\d{8,10}$/.test(p)) errs.push({ el: "phone", msg: "手机号码格式不对，请输入马来西亚号码，例如 012-345 6789" });
    }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.push({ el: "email", msg: "电邮格式不对" });
    need("industry", "行业");
    need("region", "主要营业地区");
    need("revenue", "年营业额");
    need("years", "成立年限");

    function intRange(id, label, lo, hi) {
      if (!f[id]) { errs.push({ el: id, msg: "请填写「" + label + "」" }); return; }
      var n = Number(f[id]);
      if (!Number.isInteger(n) || n < lo || n > hi) errs.push({ el: id, msg: "「" + label + "」请填 " + lo + " 到 " + hi + " 之间的整数" });
    }
    intRange("staff", "员工人数", 1, 100000);
    intRange("shareholders", "股东人数", 1, 200);

    var missing = 0, firstMissing = null;
    R.dimensions.forEach(function (dim) {
      dim.questions.forEach(function (q) {
        var a = f.answers[q.id];
        var ok = a !== null && a >= 0 && a < q.options.length;
        $("q_" + q.id).classList.toggle("invalid", !ok);
        if (!ok) { missing++; if (!firstMissing) firstMissing = "q_" + q.id; }
      });
    });
    if (missing) errs.push({ el: firstMissing, msg: "还有 " + missing + " 道题没有选择答案" });
    return errs;
  }

  function showErrors(errs) {
    document.querySelectorAll(".field.invalid").forEach(function (el) { el.classList.remove("invalid"); });
    var box = $("formError");
    if (!errs.length) { box.hidden = true; return; }
    errs.forEach(function (e) {
      var el = $(e.el);
      if (el && el.closest(".field")) el.closest(".field").classList.add("invalid");
    });
    box.innerHTML = "<strong>还差一点：</strong><ul>" + errs.map(function (e) { return "<li>" + esc(e.msg) + "</li>"; }).join("") + "</ul>";
    box.hidden = false;
    var first = $(errs[0].el);
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.focus) first.focus({ preventScroll: true });
    }
  }

  // ---------- 计算 ----------
  function compute(f) {
    var dims = R.dimensions.map(function (dim) {
      var got = 0, max = 0, tips = [];
      dim.questions.forEach(function (q) {
        var top = Math.max.apply(null, q.options.map(function (o) { return o.score; }));
        max += top;
        var idx = f.answers[q.id];
        var opt = idx == null ? null : q.options[idx];
        var s = opt ? opt.score : 0; // 未作答按 0 分处理
        got += s;
        if (s <= R.questionTipThreshold && q.tip) tips.push({ q: q.text, a: opt ? opt.label : "未作答", tip: q.tip });
      });
      var score = max > 0 ? Math.round(clamp(got / max * 100, 0, 100)) : 0; // 防止除以 0
      var level = score >= 80 ? "good" : score >= R.weakThreshold ? "fair" : "weak";
      return { id: dim.id, name: dim.name, desc: dim.desc, weight: dim.weight, score: score, level: level, tips: tips, advice: dim.advice };
    });

    var wSum = dims.reduce(function (s, d) { return s + d.weight; }, 0);
    var total = wSum > 0 ? Math.round(clamp(dims.reduce(function (s, d) { return s + d.score * d.weight; }, 0) / wSum, 0, 100)) : 0;

    var grades = R.grades.slice().sort(function (a, b) { return b.min - a.min; });
    var grade = grades.filter(function (g) { return total >= g.min; })[0] || grades[grades.length - 1];

    var byScore = dims.slice().sort(function (a, b) { return b.score - a.score || b.weight - a.weight; });
    var strengths = byScore.filter(function (d) { return d.score >= R.strongThreshold; }).slice(0, 3);
    var weaknesses = byScore.slice().reverse().filter(function (d) { return d.score < R.weakThreshold; }).slice(0, 3);

    return { dims: dims, total: total, grade: grade, wSum: wSum, strengths: strengths, weaknesses: weaknesses, best: byScore[0], worst: byScore[byScore.length - 1] };
  }

  // ---------- 评语（保证前后一致） ----------
  function levelTag(level) {
    return level === "good" ? "保持" : level === "fair" ? "持续优化" : "优先处理";
  }

  function overviewSentence(r) {
    var spread = r.best.score - r.worst.score;
    if (spread < 10) {
      return "五个方面的得分较为平均（" + r.worst.score + "–" + r.best.score + " 分）" +
        (r.grade.code === "A" ? "，整体均衡。" : r.grade.code === "B" ? "，没有特别突出的短板，但每一项都还有提升空间。" : "，说明需要从基础开始系统梳理，而不是只补某一项。");
    }
    return "表现最好的是「" + r.best.name + "」（" + r.best.score + " 分），最需要关注的是「" + r.worst.name + "」（" + r.worst.score + " 分）。";
  }

  function strengthsHtml(r) {
    if (r.strengths.length) {
      return r.strengths.map(function (d) { return "<li><b>" + esc(d.name) + "</b> " + d.score + " 分 · " + esc(d.desc) + "</li>"; }).join("");
    }
    if (r.best.score - r.worst.score < 10) return '<li class="muted">暂无得分达到 ' + R.strongThreshold + ' 分的突出项，各方面得分接近。</li>';
    return '<li class="muted">暂无得分达到 ' + R.strongThreshold + ' 分的突出项。相对较好的是「' + esc(r.best.name) + '」（' + r.best.score + ' 分），可作为改善的起点。</li>';
  }
  function weaknessesHtml(r) {
    if (r.weaknesses.length) {
      return r.weaknesses.map(function (d) { return "<li><b>" + esc(d.name) + "</b> " + d.score + " 分 · " + esc(d.desc) + "</li>"; }).join("");
    }
    if (r.worst.score >= 80) return '<li class="muted">各方面均达到 80 分以上，暂无明显短板，建议每年定期检视一次。</li>';
    if (r.best.score - r.worst.score < 10) return '<li class="muted">没有低于 ' + R.weakThreshold + ' 分的明显短板，各方面得分接近，都还有提升空间。</li>';
    return '<li class="muted">没有低于 ' + R.weakThreshold + ' 分的明显短板。相对较弱的是「' + esc(r.worst.name) + '」（' + r.worst.score + ' 分），可作为下一步优化重点。</li>';
  }

  // ---------- 雷达图（SVG 矢量，打印不模糊） ----------
  function radarSvg(dims) {
    var W = 360, H = 320, cx = W / 2, cy = H / 2 + 6, rad = 108, n = dims.length;
    function pt(i, v) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + Math.cos(a) * rad * v / 100, cy + Math.sin(a) * rad * v / 100];
    }
    var out = '<svg class="radar" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="五个方面得分雷达图">';
    [20, 40, 60, 80, 100].forEach(function (lvl) {
      var p = dims.map(function (_, i) { return pt(i, lvl).join(","); }).join(" ");
      out += '<polygon points="' + p + '" fill="' + (lvl === 100 ? "#F5F7FC" : "none") + '" stroke="#D5DCEB" stroke-width="1"/>';
    });
    dims.forEach(function (_, i) {
      var e = pt(i, 100);
      out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#D5DCEB" stroke-width="1"/>';
    });
    [60, 80].forEach(function (lvl) {
      var p = pt(0, lvl);
      out += '<text x="' + (p[0] + 4) + '" y="' + (p[1] + 3) + '" font-size="9" fill="#8A93A8">' + lvl + '</text>';
    });
    var poly = dims.map(function (d, i) { return pt(i, Math.max(d.score, 2)).join(","); }).join(" ");
    out += '<polygon points="' + poly + '" fill="#1E3A8A" fill-opacity="0.18" stroke="#1E3A8A" stroke-width="2" stroke-linejoin="round"/>';
    dims.forEach(function (d, i) {
      var p = pt(i, Math.max(d.score, 2));
      out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="' + levelColor(d.level) + '" stroke="#fff" stroke-width="1.5"/>';
      var l = pt(i, 128);
      var anchor = Math.abs(l[0] - cx) < 8 ? "middle" : l[0] > cx ? "start" : "end";
      out += '<text x="' + l[0] + '" y="' + (l[1] - 2) + '" text-anchor="' + anchor + '" font-size="12" font-weight="700" fill="#1B2440">' + esc(d.name) + '</text>';
      out += '<text x="' + l[0] + '" y="' + (l[1] + 13) + '" text-anchor="' + anchor + '" font-size="11" fill="' + levelColor(d.level) + '">' + d.score + ' 分</text>';
    });
    return out + "</svg>";
  }
  function levelColor(level) { return level === "good" ? "#1F7A4D" : level === "fair" ? "#B7791F" : "#B42318"; }

  // ---------- 渲染报告 ----------
  function renderReport(f, r) {
    var now = new Date();
    var id = makeReportId(now);
    var b = R.brand;
    var rec = R.recommendations[r.grade.code];

    var cover =
      '<section class="cover">' +
        '<div class="cover-top"><span class="brandmark">W</span><span>' + esc(b.company) + '</span></div>' +
        '<div class="cover-main">' +
          '<p class="cover-eyebrow">Equity Health Assessment</p>' +
          '<h1>' + esc(b.reportTitle) + '</h1>' +
          '<p class="cover-company">' + esc(f.companyName) + '</p>' +
        '</div>' +
        '<dl class="cover-meta">' +
          '<div><dt>评估日期</dt><dd>' + formatDate(now) + '</dd></div>' +
          '<div><dt>报告编号</dt><dd>' + esc(id) + '</dd></div>' +
          '<div><dt>行业</dt><dd>' + esc(f.industry) + '</dd></div>' +
          '<div><dt>地区</dt><dd>' + esc(f.region) + '</dd></div>' +
        '</dl>' +
        '<p class="cover-foot">机密文件 · 仅供 ' + esc(f.companyName) + ' 内部参考</p>' +
      '</section>';

    var summary =
      '<section class="sec">' +
        '<h2 class="sec-title"><span>01</span>评估摘要</h2>' +
        '<div class="score-row">' +
          '<div class="score-box grade-' + r.grade.code + '">' +
            '<div class="score-num">' + r.total + '<small>/100</small></div>' +
            '<div class="badge">等级 ' + r.grade.code + ' · ' + esc(r.grade.label) + '</div>' +
            '<div class="score-tag">' + esc(r.grade.tagline) + '</div>' +
          '</div>' +
          '<div class="score-text"><p>' + esc(r.grade.summary) + '</p><p>' + esc(overviewSentence(r)) + '</p></div>' +
        '</div>' +
        '<table class="profile"><tbody>' +
          '<tr><th>企业名称</th><td>' + esc(f.companyName) + '</td><th>联系人</th><td>' + esc(f.contactName) + '</td></tr>' +
          '<tr><th>行业</th><td>' + esc(f.industry) + '</td><th>地区</th><td>' + esc(f.region) + '</td></tr>' +
          '<tr><th>年营业额</th><td>' + esc(f.revenue) + '</td><th>成立年限</th><td>' + esc(f.years) + '</td></tr>' +
          '<tr><th>员工人数</th><td>' + esc(f.staff) + ' 人</td><th>股东人数</th><td>' + esc(f.shareholders) + ' 位</td></tr>' +
        '</tbody></table>' +
        '<div class="sw">' +
          '<div class="sw-col good"><h3>核心优势</h3><ul>' + strengthsHtml(r) + '</ul></div>' +
          '<div class="sw-col weak"><h3>主要短板</h3><ul>' + weaknessesHtml(r) + '</ul></div>' +
        '</div>' +
        '<div class="next">' +
          '<p class="next-label">建议的下一步</p>' +
          '<h3>' + esc(rec.product) + '</h3>' +
          '<p>' + esc(rec.reason) + '</p>' +
        '</div>' +
      '</section>';

    var rows = r.dims.map(function (d) {
      var contrib = r.wSum > 0 ? (d.score * d.weight / r.wSum).toFixed(1) : "0.0";
      return '<tr><td><b>' + esc(d.name) + '</b><div class="muted small">' + esc(d.desc) + '</div></td>' +
        '<td class="num">' + d.weight + '%</td>' +
        '<td><div class="bar"><i class="lv-' + d.level + '" style="width:' + d.score + '%"></i></div></td>' +
        '<td class="num"><b>' + d.score + '</b></td>' +
        '<td class="num">' + contrib + '</td>' +
        '<td><span class="pill lv-' + d.level + '">' + levelTag(d.level) + '</span></td></tr>';
    }).join("");

    var analysis =
      '<section class="sec">' +
        '<h2 class="sec-title"><span>02</span>详细维度分析</h2>' +
        '<div class="chart-wrap">' + radarSvg(r.dims) +
          '<div class="legend"><p>每个方面满分 100 分，外圈为 100、往内每圈减 20 分。</p>' +
          '<p><i class="dot lv-good"></i>80 分以上：表现优秀</p>' +
          '<p><i class="dot lv-fair"></i>' + R.weakThreshold + '–79 分：基本达标</p>' +
          '<p><i class="dot lv-weak"></i>' + R.weakThreshold + ' 分以下：需优先处理</p></div>' +
        '</div>' +
        '<table class="dims"><thead><tr><th>评估方面</th><th class="num">权重</th><th>得分</th><th class="num">分数</th><th class="num">贡献</th><th>判断</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td>综合得分</td><td class="num">100%</td><td></td><td class="num"></td><td class="num"><b>' + r.total + '</b></td><td></td></tr></tfoot></table>' +
      '</section>';

    var order = r.dims.slice().sort(function (a, b) { return a.score - b.score || b.weight - a.weight; });
    var adviceCards = order.map(function (d) {
      var items = d.level === "weak" ? d.advice.weak : d.level === "fair" ? d.advice.fair : [d.advice.good];
      var tips = d.tips.length
        ? '<div class="tips"><h4>' + (d.level === "good" ? "个别需留意" : "具体问题") + '</h4>' + d.tips.map(function (t) {
            return '<div class="tip"><p class="tip-q">' + esc(t.q) + ' <span>您的回答：' + esc(t.a) + '</span></p><p>' + esc(t.tip) + '</p></div>';
          }).join("") + '</div>'
        : "";
      return '<article class="advice lv-' + d.level + '">' +
        '<header><h3>' + esc(d.name) + '</h3><span class="pill lv-' + d.level + '">' + levelTag(d.level) + ' · ' + d.score + ' 分</span></header>' +
        '<ul>' + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>' + tips +
      '</article>';
    }).join("");

    var advice =
      '<section class="sec">' +
        '<h2 class="sec-title"><span>03</span>改进建议与方案</h2>' +
        '<p class="sec-lede">以下按得分由低到高排列，越靠前越需要优先处理。</p>' +
        adviceCards +
      '</section>';

    var appendixRows = R.dimensions.map(function (dim) {
      return dim.questions.map(function (q, qi) {
        var idx = f.answers[q.id];
        var opt = idx == null ? null : q.options[idx];
        return '<tr>' + (qi === 0 ? '<td rowspan="' + dim.questions.length + '" class="ap-dim">' + esc(dim.name) + '</td>' : '') +
          '<td>' + esc(q.text) + '</td><td>' + esc(opt ? opt.label : "未作答") + '</td><td class="num">' + (opt ? opt.score : 0) + '</td></tr>';
      }).join("");
    }).join("");

    var appendix =
      '<section class="sec">' +
        '<h2 class="sec-title"><span>04</span>附录：作答明细</h2>' +
        '<table class="answers"><thead><tr><th>方面</th><th>问题</th><th>回答</th><th class="num">得分</th></tr></thead><tbody>' + appendixRows + '</tbody></table>' +
        '<p class="muted small">每题满分 10 分；每个方面得分 = 该方面 4 题得分合计 ÷ 40 × 100；综合得分 = 各方面得分按权重加权平均。</p>' +
      '</section>';

    var contacts = [b.phone && "电话：" + b.phone, b.email && "电邮：" + b.email, b.website && "网站：" + b.website].filter(Boolean);
    var back =
      '<section class="back">' +
        '<div class="back-inner">' +
          '<span class="brandmark big">W</span>' +
          '<h2>' + esc(b.company) + '</h2>' +
          '<p>' + esc(b.locations) + '</p>' +
          (contacts.length ? '<p>' + contacts.map(esc).join("　·　") + '</p>' : '') +
        '</div>' +
        '<div class="disclaimer"><h4>免责声明</h4>' +
          '<p>本报告根据 ' + esc(f.companyName) + ' 自行填写的资料自动生成，仅用于企业股权与管理状况的初步自我检视，不构成法律、税务、会计或投资意见。具体决策请结合企业实际情况，并咨询具备资格的专业人士。</p>' +
          '<p>报告内容在填写人的浏览器中生成，' + esc(b.company) + ' 不会自动收集或保存其中的资料。报告编号：' + esc(id) + '</p>' +
        '</div>' +
      '</section>';

    $("report").innerHTML = cover + '<div class="flow">' + summary + analysis + advice + appendix + '</div>' + back;
    return { id: id, date: now };
  }

  // ---------- 示例资料 ----------
  function fillSample() {
    $("companyName").value = "明辉贸易有限公司 (示例)";
    $("contactName").value = "陈先生";
    $("phone").value = "012-345 6789";
    $("email").value = "";
    $("industry").value = R.options.industry[0];
    $("region").value = R.options.region[0];
    $("revenue").value = R.options.revenue[2];
    $("years").value = R.options.years[2];
    $("staff").value = "35";
    $("shareholders").value = "3";
    var picks = { s1: 2, s2: 2, s3: 3, s4: 1, g1: 2, g2: 2, g3: 2, g4: 1, f1: 1, f2: 1, f3: 1, f4: 1, t1: 2, t2: 2, t3: 1, t4: 2, c1: 1, c2: 3, c3: 2, c4: 2 };
    Object.keys(picks).forEach(function (k) {
      var el = $(k + "_" + picks[k]);
      if (el) el.checked = true;
    });
    showErrors([]);
    document.querySelectorAll(".question.invalid").forEach(function (el) { el.classList.remove("invalid"); });
  }

  // ---------- 事件 ----------
  var current = null;

  function showReport(f) {
    var r = compute(f);
    current = { f: f, meta: renderReport(f, r) };
    $("formView").hidden = true;
    $("reportView").hidden = false;
    window.scrollTo(0, 0);
  }

  function init() {
    buildForm();

    $("assessForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = readForm();
      var errs = validate(f);
      showErrors(errs);
      if (!errs.length) showReport(f);
    });
    $("assessForm").addEventListener("change", function (e) {
      if (e.target.type === "radio") {
        var fs = e.target.closest(".question");
        if (fs) fs.classList.remove("invalid");
      } else {
        var fd = e.target.closest(".field");
        if (fd) fd.classList.remove("invalid");
      }
    });
    $("fillSample").addEventListener("click", fillSample);
    $("backBtn").addEventListener("click", function () {
      $("reportView").hidden = true;
      $("formView").hidden = false;
      $("report").innerHTML = ""; // 返回时清掉报告内容
      window.scrollTo(0, 0);
    });
    $("pdfBtn").addEventListener("click", function () {
      if (!current) return;
      var oldTitle = document.title;
      var safeName = current.f.companyName.replace(/[\\\/:*?"<>|]/g, "").slice(0, 40);
      document.title = "股权健康度评估_" + safeName + "_" + current.meta.id; // 作为 PDF 默认文件名
      var go = function () {
        window.print();
        setTimeout(function () { document.title = oldTitle; }, 1000);
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
    });
  }

  // 供自动测试使用
  window.__assessment = { compute: compute, validate: validate, renderReport: renderReport };

  init();
})();
