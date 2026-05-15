import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const API = "/api/chat";
const MODEL = "claude-sonnet-4-20250514";

// Foshan building materials categories & quick templates
const CATEGORIES = [
  { id: "tile",     icon: "⬛", name: "瓷砖",   unit: "㎡",  hints: ["800×800 通体大理石", "600×1200 岩板", "300×600 厨卫砖"] },
  { id: "furn",     icon: "🪑", name: "家具",   unit: "件",  hints: ["实木沙发三人位", "电视柜 2.4m", "床架 1.8m"] },
  { id: "sanit",    icon: "🚿", name: "卫浴",   unit: "套",  hints: ["马桶 坐便器", "淋浴房 1.2×0.9", "浴室柜 80cm"] },
  { id: "appl",     icon: "📺", name: "家电",   unit: "台",  hints: ["空调 1.5匹 挂机", "热水器 60L 电热", "油烟机 侧吸式"] },
  { id: "alum",     icon: "🔩", name: "铝材",   unit: "米",  hints: ["门窗铝合金型材", "幕墙铝方通", "橱柜铝框"] },
  { id: "light",    icon: "💡", name: "灯具",   unit: "套",  hints: ["客厅吊灯", "筒灯 5W 嵌入", "线条灯 1m"] },
  { id: "door",     icon: "🚪", name: "门窗",   unit: "㎡",  hints: ["断桥铝窗 双层玻璃", "实木门 含门套", "推拉门 铝合金"] },
  { id: "cabinet",  icon: "🗄", name: "橱柜衣柜", unit: "延米", hints: ["定制橱柜 含台面", "整体衣柜 滑门", "入墙书柜"] },
];

const QUICK_PROMPTS = [
  "120㎡新房，客厅餐厅铺800×800通体大理石，卫生间300×600防滑砖，报个价",
  "帮我报一套卫浴：马桶、淋浴房1.2×0.9、浴室柜80cm、毛巾架，客户要中档品质",
  "别墅项目，全屋定制橱柜8延米、衣柜12延米，品牌欧派，报最新价格",
  "工装项目：办公室300间，每间装一套空调1.5匹，批量价格是多少",
];

const TAX = 0.09; // 建材常用9%增值税

const SYSTEM_PROMPT = `你是佛山建材行业的专业报价助手，熟悉瓷砖、家具、卫浴、家电、铝材、灯具、门窗、橱柜衣柜等产品的市场行情和本地价格。

你的工作：
1. 快速理解客户需求，提取产品信息（名称、规格、数量、单位）
2. 给出佛山本地市场的合理参考价格（含中档品牌行情）
3. 主动询问缺少的关键信息（数量、品质档次、品牌偏好）
4. 语气简洁专业，像一个有10年经验的业务员

每次回复格式：
- 先用1-2句话确认理解 + 简单说明
- 然后输出产品列表（如果有）
- 在回复末尾追加一行（不在正文显示）：ITEMS_JSON:[{"name":"产品名","spec":"规格","unit":"单位","qty":数量,"price":单价,"cat":"分类id"}]
- 如果识别到客户名或项目名，追加：CLIENT:名称

分类id对应：tile瓷砖 furn家具 sanit卫浴 appl家电 alum铝材 light灯具 door门窗 cabinet橱柜衣柜

价格参考（佛山2026年行情）：
- 瓷砖：普通60-120/㎡，中档120-280/㎡，高档280-800/㎡
- 定制橱柜：800-1800/延米（含台面）
- 定制衣柜：600-1500/延米
- 断桥铝窗：380-680/㎡
- 卫浴套件：马桶600-3000，淋浴房800-3500，浴室柜500-2500
- 家电按品牌市价

用中文回答，简洁直接。`;

// ── Utilities ──────────────────────────────────────────────────────────────
const fmt = (n) => "¥" + Math.round(n).toLocaleString("zh-CN");
const today = () => new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
const validDate = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }); };
const genNo = () => "FS-" + Date.now().toString().slice(-6);

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("chat"); // chat | preview
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [client, setClient] = useState("");
  const [quoteNo] = useState(genNo);
  const [recording, setRecording] = useState(false);
  const [recText, setRecText] = useState("");
  const msgId = useRef(0);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Init greeting
  useEffect(() => {
    addMsg("ai", null, (
      <div>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>你好！我是你的报价助手 👋</p>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 10 }}>直接说或输入你要报价的材料，我帮你快速整理成报价单。</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {QUICK_PROMPTS.map((q, i) => (
            <button key={i} onClick={() => sendMsg(q)}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 16, border: "0.5px solid #C8A96E", color: "#7A5C2E", background: "#FDF6EC", cursor: "pointer", textAlign: "left", maxWidth: 220 }}>
              {q.slice(0, 28)}…
            </button>
          ))}
        </div>
      </div>
    ));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function addMsg(role, text, jsx) {
    const id = ++msgId.current;
    setMessages(m => [...m, { id, role, text, jsx }]);
    return id;
  }
  function updateMsg(id, text, jsx) {
    setMessages(m => m.map(x => x.id === id ? { ...x, text, jsx } : x));
  }

  // Voice input
  function toggleVoice() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("当前浏览器不支持语音输入，请使用 Chrome"); return; }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => setRecording(true);
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setRecText(t);
      setInput(t);
    };
    rec.onend = () => {
      setRecording(false);
      setRecText("");
      if (inputRef.current?.value) sendMsg(inputRef.current.value);
    };
    rec.onerror = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
  }

  async function sendMsg(text = input.trim()) {
    if (!text || busy) return;
    setInput("");
    addMsg("user", text);
    const newHist = [...history, { role: "user", content: text }];
    setBusy(true);
    const loadId = addMsg("ai", null, <TypingDots />);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM_PROMPT, messages: newHist }),
      });
      const data = await res.json();
      const raw = data.content?.find(b => b.type === "text")?.text || "抱歉，请重试。";

      // Extract items JSON
      const im = raw.match(/ITEMS_JSON:(\[[\s\S]*?\])/);
      if (im) {
        try {
          const parsed = JSON.parse(im[1]);
          setItems(prev => {
            const merged = [...prev];
            parsed.forEach(ni => {
              const idx = merged.findIndex(p => p.name === ni.name);
              if (idx >= 0) merged[idx] = { ...merged[idx], ...ni };
              else merged.push({ ...ni, id: Date.now() + Math.random() });
            });
            return merged;
          });
        } catch { }
      }
      const cm = raw.match(/CLIENT:(.+)/);
      if (cm) setClient(cm[1].trim());

      const clean = raw.replace(/ITEMS_JSON:[\s\S]*?\]/, "").replace(/CLIENT:.+/, "").trim();
      setHistory([...newHist, { role: "assistant", content: raw }]);
      updateMsg(loadId, clean, null);
    } catch {
      updateMsg(loadId, "网络错误，请重试。", null);
    }
    setBusy(false);
  }

  const subtotal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const tax = subtotal * TAX;
  const total = subtotal + tax;

  return (
    <div style={{ fontFamily: "'PingFang SC', 'Hiragino Sans GB', sans-serif", height: 680, display: "flex", flexDirection: "column", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, overflow: "hidden" }}>
      <style>{`
        @keyframes blink{0%,80%,100%{opacity:.15}40%{opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        .item-row:hover{background:var(--color-background-secondary)!important}
        .cat-tag{display:inline-flex;align-items:center;gap:3px;font-size:11px;padding:2px 7px;border-radius:10px;background:#FDF6EC;color:#7A5C2E;border:0.5px solid #E8D0A0}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        .send-btn:active{transform:scale(0.96)}
        .voice-btn{transition:all 0.2s}
      `}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", gap: 12, background: "var(--color-background-primary)" }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "0.02em" }}>建材报价助手</span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 8 }}>佛山 · AI 智能报价</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <TabBtn active={screen === "chat"} onClick={() => setScreen("chat")}>对话</TabBtn>
          <TabBtn active={screen === "preview"} onClick={() => setScreen("preview")} badge={items.length || null}>
            报价单 {items.length > 0 && <span style={{ background: "#C8A96E", color: "#fff", fontSize: 10, borderRadius: 8, padding: "0 5px", marginLeft: 3 }}>{items.length}</span>}
          </TabBtn>
        </div>
      </div>

      {screen === "chat" ? (
        /* ─── Chat Screen ─── */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Category shortcuts */}
          <div style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", gap: 6, overflowX: "auto", flexShrink: 0 }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => { setInput(c.hints[0]); inputRef.current?.focus(); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "5px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", cursor: "pointer", flexShrink: 0, minWidth: 52 }}>
                <span style={{ fontSize: 16 }}>{c.icon}</span>
                <span style={{ fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{c.name}</span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px" }}>
            {messages.map(msg => (
              <div key={msg.id} style={{ marginBottom: 12, display: "flex", gap: 8, flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-end" }}>
                {msg.role === "ai" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#FDF6EC", border: "0.5px solid #E8D0A0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginBottom: 2 }}>✦</div>
                )}
                <div style={{
                  maxWidth: "78%", padding: "9px 13px", borderRadius: msg.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                  background: msg.role === "user" ? "#3D2B1F" : "var(--color-background-secondary)",
                  color: msg.role === "user" ? "#F5ECD7" : "var(--color-text-primary)",
                  fontSize: 13, lineHeight: 1.65,
                  border: msg.role === "ai" ? "0.5px solid var(--color-border-tertiary)" : "none",
                }}>
                  {msg.jsx || (msg.text || "").split("\n").filter(l => l.trim()).map((l, i) => <p key={i} style={{ margin: "2px 0" }}>{l}</p>)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: "10px 12px", borderTop: "0.5px solid var(--color-border-tertiary)", display: "flex", gap: 7, alignItems: "flex-end" }}>
            <button className="voice-btn" onClick={toggleVoice}
              style={{ width: 40, height: 40, borderRadius: "50%", border: recording ? "2px solid #C8A96E" : "0.5px solid var(--color-border-secondary)", background: recording ? "#FDF6EC" : "var(--color-background-secondary)", cursor: "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: recording ? "pulse 1s infinite" : "none" }}>
              {recording ? "🔴" : "🎙️"}
            </button>
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder={recording ? "正在录音，说完后自动发送…" : "输入材料名称、规格、数量… (Enter 发送)"}
              style={{ flex: 1, resize: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", outline: "none", lineHeight: 1.5, minHeight: 40, maxHeight: 88 }}
              rows={1}
            />
            <button className="send-btn" onClick={() => sendMsg()} disabled={busy || !input.trim()}
              style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: input.trim() && !busy ? "#3D2B1F" : "var(--color-background-secondary)", color: input.trim() && !busy ? "#F5ECD7" : "var(--color-text-tertiary)", fontSize: 13, cursor: "pointer", flexShrink: 0, fontFamily: "inherit", transition: "all 0.2s" }}>
              发送
            </button>
          </div>
        </div>
      ) : (
        /* ─── Preview Screen ─── */
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Items panel */}
          <div style={{ width: 260, borderRight: "0.5px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>产品明细</span>
              <button onClick={() => setItems([])} style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>清空</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
                  <p>在对话中报价后<br />产品会自动出现</p>
                </div>
              ) : items.map((it, i) => {
                const cat = CATEGORIES.find(c => c.id === it.cat);
                return (
                  <div key={it.id || i} className="item-row" style={{ padding: "8px 6px", borderRadius: 8, marginBottom: 4, transition: "background 0.15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</p>
                        {it.spec && <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>{it.spec}</p>}
                        {cat && <span className="cat-tag">{cat.icon} {cat.name}</span>}
                      </div>
                      <button onClick={() => setItems(its => its.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-tertiary)", flexShrink: 0, padding: 2 }}>✕</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                      <input type="number" value={it.qty} min={0} onChange={e => setItems(its => its.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))}
                        style={{ width: 48, padding: "3px 6px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, fontSize: 12, textAlign: "center", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontFamily: "inherit" }} />
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{it.unit || "件"}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 2 }}>×</span>
                      <input type="number" value={it.price} min={0} onChange={e => setItems(its => its.map((x, j) => j === i ? { ...x, price: +e.target.value } : x))}
                        style={{ flex: 1, padding: "3px 6px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, fontSize: 12, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontFamily: "inherit" }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, fontWeight: 500, color: "#7A5C2E", marginTop: 4 }}>
                      {fmt((it.qty || 0) * (it.price || 0))}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Totals */}
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "10px 14px", background: "var(--color-background-secondary)" }}>
              <Row label="小计" val={fmt(subtotal)} />
              <Row label={`增值税 ${(TAX * 100).toFixed(0)}%`} val={fmt(tax)} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>合计</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#7A5C2E" }}>{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Quote preview */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "var(--color-background-secondary)" }}>
            {/* Client info */}
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: "var(--color-text-tertiary)", display: "block", marginBottom: 3 }}>客户 / 项目名称</label>
                <input value={client} onChange={e => setClient(e.target.value)} placeholder="请输入客户或项目名称"
                  style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, fontFamily: "inherit", color: "var(--color-text-primary)", outline: "none", fontWeight: 500 }} />
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{quoteNo}</p>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{today()} · 有效至 {validDate()}</p>
              </div>
            </div>

            {/* Quote doc */}
            <div id="quote-doc" style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "20px 18px" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, paddingBottom: 14, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 3 }}>FOSHAN QUOTE</h2>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>佛山建材报价单 · {quoteNo}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>报价日期：{today()}</p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>有效期至：{validDate()}</p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>客户：<strong>{client || "—"}</strong></p>
                </div>
              </div>

              {/* Table */}
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-text-tertiary)", fontSize: 13 }}>尚未添加产品，请在对话中描述需求</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border-secondary)" }}>
                      {["产品名称", "规格", "数量", "单位", "单价", "小计"].map((h, i) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: i >= 4 ? "right" : "left", fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <td style={{ padding: "7px 8px", fontWeight: 500 }}>{it.name}</td>
                        <td style={{ padding: "7px 8px", color: "var(--color-text-secondary)", fontSize: 11 }}>{it.spec || "—"}</td>
                        <td style={{ padding: "7px 8px" }}>{it.qty}</td>
                        <td style={{ padding: "7px 8px", color: "var(--color-text-secondary)" }}>{it.unit || "件"}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>¥{(it.price || 0).toLocaleString()}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 500 }}>¥{((it.qty || 0) * (it.price || 0)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={5} style={{ padding: "8px 8px 3px", textAlign: "right", fontSize: 11, color: "var(--color-text-secondary)" }}>小计</td><td style={{ padding: "8px 8px 3px", textAlign: "right", fontSize: 12 }}>{fmt(subtotal)}</td></tr>
                    <tr><td colSpan={5} style={{ padding: "3px 8px", textAlign: "right", fontSize: 11, color: "var(--color-text-secondary)" }}>增值税 9%</td><td style={{ padding: "3px 8px", textAlign: "right", fontSize: 12 }}>{fmt(tax)}</td></tr>
                    <tr style={{ borderTop: "1px solid var(--color-border-secondary)" }}>
                      <td colSpan={5} style={{ padding: "8px 8px 0", textAlign: "right", fontWeight: 600, fontSize: 13 }}>合计总价</td>
                      <td style={{ padding: "8px 8px 0", textAlign: "right", fontWeight: 700, fontSize: 14, color: "#7A5C2E" }}>{fmt(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* Footer */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.7 }}>
                <p>· 以上报价含增值税，不含运费及安装费，如需安装请另行报价</p>
                <p>· 本报价有效期30天，逾期请重新确认价格</p>
                <p>· 大宗订单可议价，欢迎实地洽谈</p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setScreen("chat")}
                style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "var(--color-text-primary)" }}>
                继续对话
              </button>
              <button onClick={() => window.print()}
                style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "var(--color-text-primary)" }}>
                🖨 打印
              </button>
              <button onClick={() => {
                const doc = document.getElementById("quote-doc");
                const w = window.open("", "_blank");
                w.document.write(`<html><head><title>${quoteNo}</title><style>body{font-family:'PingFang SC',sans-serif;padding:24px;max-width:700px;margin:0 auto}table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;border-bottom:1px solid #eee}@media print{body{padding:0}}</style></head><body>${doc.innerHTML}</body></html>`);
                w.document.close(); w.print();
              }}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3D2B1F", color: "#F5ECD7", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
                导出 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 14px", borderRadius: 20, border: active ? "none" : "0.5px solid var(--color-border-secondary)", background: active ? "#3D2B1F" : "transparent", color: active ? "#F5ECD7" : "var(--color-text-secondary)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 500 : 400, display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}>
      {children}
    </button>
  );
}

function Row({ label, val }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 12 }}>{val}</span>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
      {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8A96E", display: "inline-block", animation: `blink 1.2s ${i * 0.2}s infinite` }} />)}
    </span>
  );
}
