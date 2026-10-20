"""从 crm/index.html 生成 Google 版：page.html（网页）和 dist/Code.gs（贴进 Apps Script 的完整程序）。"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
src = (ROOT.parent / "crm" / "index.html").read_text(encoding="utf-8")
s = src

def r(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, (n, a[:80])
    s = s.replace(a, b)

# 头部：显示当前记录人 + 换人
r('<p class="sub">按客户类型记下每次发了什么、哪天发的。发之前先看看之前发过什么，避免重复。</p>',
  '<p class="sub">按客户类型记下每次发了什么、哪天发的。发之前先看看之前发过什么，避免重复。</p>\n'
  '      <p class="sub" id="who" hidden>记录人：<b id="whoName"></b> <button class="ghost" type="button" id="logout">换人</button></p>')

# 进入页（团队密码 + 名字）
r('<div id="toast" class="toast" hidden></div>',
  '''<div id="gate" class="gate" hidden>
  <form id="gf" class="card gate-card">
    <h2>客户跟进记录本</h2>
    <p class="sub">第一次打开请输入团队密码和你的名字。这台手机或电脑会记住，下次不用再输入。</p>
    <div class="field"><label class="label" for="gPw">团队密码</label><input id="gPw" type="password" required autocomplete="current-password"></div>
    <div class="field"><label class="label" for="gName">你的名字（记录时会显示）</label><input id="gName" type="text" required maxlength="30" placeholder="例如：小凯"></div>
    <p id="gErr" class="gate-err" hidden></p>
    <button class="primary" type="submit" id="gBtn">进入</button>
  </form>
</div>
<div id="toast" class="toast" hidden></div>''')
r('.toast{position:fixed;',
  '''.gate{position:fixed;inset:0;z-index:40;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:16px}
.gate-card{width:100%;max-width:400px;display:flex;flex-direction:column;gap:12px}
.gate-card h2{font-family:var(--f-display);margin:0;font-size:22px}
.gate-err{color:var(--late);margin:0;font-size:14px}
.toast{position:fixed;''')

# Claude 网页外壳本来会提供的基本样式，Google 版要自己带
r('*{box-sizing:border-box}', '*{box-sizing:border-box}\n[hidden]{display:none!important}\nhtml,body{margin:0}\nimg{max-width:100%}')

# 状态
r('const S = { db:null, user:null, me:null,', 'const S = { db:null, pw:"", name:"",')

# 错误提示
r('''function fail(e){ console.error(e); toast(e && e.code==="quota_exceeded" ? "存储已满，请删除一些旧记录后再试" : e && e.code==="invalid_argument" ? "你目前只有查看权限，不能修改" : "没保存成功，请检查网络后再试一次"); }''',
  '''function fail(e){ console.error(e); if(String(e&&e.message||e).includes("WRONG_PASSWORD")){ showGate("团队密码已经改了，请输入新密码"); return; } toast("没保存成功，请检查网络后再试一次"); }''')

# 记录人直接存名字
r('const who = m.by ? (S.names[m.by] || "同事") : "";', 'const who = m.by || "";')
r('by:S.me||""', 'by:S.name||""')

# 图片网址
r('src="/_blob/${esc(id)}"', 'src="${imgUrl(id)}"', count=2)
r('$("lbImg").src="/_blob/"+id;', '$("lbImg").src=imgUrl(id,2000);')

# 去掉 Claude 的名字查询和初始化，换成 Google 版
start = s.index('async function resolveNames(){')
end = s.index('</script>')
s = s[:start] + r'''const imgUrl=(id,w)=>"https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w"+(w||600);
function run(op,args){ return new Promise((res,rej)=>google.script.run.withSuccessHandler(res).withFailureHandler(rej).call(S.pw,op,args||{})); }
const blobToB64=b=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(",")[1]); fr.onerror=rej; fr.readAsDataURL(b); });

S.db={
  doc(path){ const [col,id]=path.split("/"); return {
    update: async data=>{ await run("update",{col,id,data}); await refresh(); },
    delete: async ()=>{ await run("remove",{col,id}); await refresh(); } }; },
  collection(col){ return { add: async data=>{ const id=await run("add",{col,data}); await refresh(); return {id}; } }; }
};
S.assets={
  upload: async blob=>({ id: await run("upload",{ name:"图片-"+Date.now()+(blob.type==="image/png"?".png":".jpg"), mime:blob.type||"image/jpeg", b64: await blobToB64(blob) }) }),
  delete: id=>run("trash",{id})
};

function apply(data){
  S.segs=(data.segments||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
  S.msgs=data.messages||[];
  if(!S.sel && S.segs.length) S.sel=S.segs[0].id;
  if(S.sel && !S.segs.find(s=>s.id===S.sel)) S.sel=S.segs[0]?.id||null;
  renderSegs();
  const busy=S.formOpen || !$("segForm").hidden || (document.activeElement && document.activeElement.closest("#mf"));
  if(!busy) renderMain();
}
let loading=false;
async function refresh(){ if(loading) return; loading=true; try{ apply(await run("list")); }catch(e){ fail(e); } finally{ loading=false; } }

function showGate(msg){
  try{ localStorage.removeItem("crm.pw"); }catch(e){}
  S.pw=""; $("gate").hidden=false; $("gName").value=S.name||"";
  const er=$("gErr"); er.hidden=!msg; er.textContent=msg||"";
  $("gPw").focus();
}
function enter(){
  $("gate").hidden=true; $("who").hidden=false; $("whoName").textContent=S.name;
}
$("gf").onsubmit=async ev=>{
  ev.preventDefault();
  const pw=$("gPw").value.trim(), name=$("gName").value.trim(); if(!pw||!name) return;
  const btn=$("gBtn"); btn.disabled=true; btn.textContent="检查中…";
  S.pw=pw; S.name=name;
  try{
    const data=await run("list");
    try{ localStorage.setItem("crm.pw",pw); localStorage.setItem("crm.name",name); }catch(e){}
    enter(); apply(data);
  }catch(e){
    const wrong=String(e&&e.message||e).includes("WRONG_PASSWORD");
    $("gErr").hidden=false; $("gErr").textContent=wrong?"密码不对，请再试一次":"连不上，请检查网络后再试";
  }finally{ btn.disabled=false; btn.textContent="进入"; }
};
$("logout").onclick=()=>{ try{ localStorage.removeItem("crm.name"); }catch(e){} S.name=""; showGate(""); };

(function init(){
  try{ S.pw=localStorage.getItem("crm.pw")||""; S.name=localStorage.getItem("crm.name")||""; }catch(e){}
  if(!S.pw || !S.name){ $("segList").innerHTML=""; showGate(""); return; }
  enter(); refresh();
})();
// 每 30 秒拿一次最新资料，看到同事刚记的内容
setInterval(()=>{ if(S.pw && document.visibilityState==="visible") refresh(); },30000);
document.addEventListener("visibilitychange",()=>{ if(S.pw && document.visibilityState==="visible") refresh(); });
''' + s[end:]

# 旧版 Claude 专用的提示
r('`<div class="drop">你目前没有上载图片的权限。请网页拥有人在「Share」里把你设为 Editor 或 Contributor。</div>`', '""')

assert "claude" not in s.split("<script>")[1].lower(), "leftover claude call"
(ROOT / "page.html").write_text(s, encoding="utf-8")

# 旧资料
exp = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
seed = {"segments": [], "messages": []}
if exp and exp.exists():
    for k in seed:
        for f in sorted((exp / k).glob("*.json")):
            d = json.loads(f.read_text(encoding="utf-8"))
            d = d.get("data", d)
            d["id"] = f.stem
            if k == "messages":
                d["images"] = []   # 旧图片搬不过来，需要重新上载
                d["by"] = ""
            d.pop("cadenceDays", None)
            seed[k].append(d)
(ROOT / "seed.json").write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")

lines = s.split("\n")
page_js = "[\n" + ",\n".join("  " + json.dumps(l, ensure_ascii=False) for l in lines) + "\n].join('\\n')"
code = (ROOT / "Code.template.gs").read_text(encoding="utf-8")
import os, html as H
pw = os.environ.get("CRM_PASSWORD") or "CHANGE_ME"
code = code.replace("__PASSWORD__", pw).replace("__SEED__", json.dumps(seed, ensure_ascii=False, indent=1)).replace("__PAGE__", page_js)
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "Code.gs").write_text(code, encoding="utf-8")
tpl = (ROOT / "setup.template.html").read_text(encoding="utf-8")
(ROOT / "dist" / "setup.html").write_text(tpl.replace("__CODE__", H.escape(code)).replace("__PASSWORD__", H.escape(pw)), encoding="utf-8")
print("ok", len(code), "chars", len(seed["segments"]), "types", len(seed["messages"]), "messages")
