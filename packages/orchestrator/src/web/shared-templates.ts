/**
 * 共用 SSR template 片段：CSS framework、theme toggle、topbar、escape helpers。
 *
 * 設計理念（follow 04_MVP規劃/previews 的視覺語言）：
 * - 預設淺色乾淨背景（白底 + slate 色階 + 淡漸層），適合長時間工作
 * - 右上角 🌙 / ☀️ 切換按鈕，localStorage 記住偏好
 * - 主色：紅 #dc2626 / #ef4444（双云 primary）+ 天空藍 #0ea5e9（次要）+ 琥珀 #f59e0b（品牌 / token）
 * - 無粉紫色系
 * - Zone 區塊色系（透過 CSS class 對應不同層概念）：
 *   zone-shuangyun = 天空藍（双云策略腦）
 *   zone-master    = 紅（師傅腦）
 *   zone-brand     = 琥珀（客戶品牌腦）
 *   zone-hands     = 綠（雙手 skill）
 *   zone-db        = 青（資料庫）
 *   zone-merged    = 紅+藍漸層（融合腦）
 *   zone-token     = 金黃（Token 經濟）
 *
 * 這個檔案**不依賴** server.ts，避免 circular import。
 */

export type NavActive =
  | "dashboard"
  | "onboarding"
  | "database"
  | "demo"
  | "demo-compare"
  | "members"
  | "member-detail"
  | "leaderboard"
  | "marketplace"
  | "admin"
  | "workflows";

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** 在 <head> 最早執行的 script，依 localStorage 決定初始主題，避免 FOUC。 */
export function renderThemeInitScript(): string {
  return `<script>(function(){var s=localStorage.getItem("sy-theme");if((s||"light")==="dark")document.documentElement.classList.add("dark");})();</script>`;
}

/** Tailwind CDN + darkMode 設定。 */
export function renderTailwindCdn(): string {
  return `<script src="https://cdn.tailwindcss.com"></script><script>tailwind.config={darkMode:"class"};</script>`;
}

/** 淺色為預設、深色以 html.dark 覆寫的整套主題樣式。 */
export function renderThemeStyles(): string {
  return `<style>
body{font-family:-apple-system,"PingFang TC","Noto Sans TC",system-ui,sans-serif}
.mono{font-family:"SF Mono","Monaco","Consolas",monospace}

/* ===== LIGHT THEME (預設 / 日常工作用) ===== */
body{background:radial-gradient(ellipse at top left,rgba(239,68,68,.04) 0%,transparent 50%),radial-gradient(ellipse at top right,rgba(56,189,248,.05) 0%,transparent 50%),linear-gradient(180deg,#fafafa 0%,#f1f5f9 100%);min-height:100vh}
.surface-1{background:#fff;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.surface-2{background:#fff;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(15,23,42,.06)}
.surface-sunken{background:#f8fafc;border:1px solid #e2e8f0}
.text-primary{color:#0f172a}
.text-secondary{color:#475569}
.text-muted{color:#94a3b8}

.zone-shuangyun{background:linear-gradient(135deg,rgba(56,189,248,.08) 0%,rgba(14,165,233,.04) 100%);border:1px solid rgba(14,165,233,.25)}
.zone-master{background:linear-gradient(135deg,rgba(239,68,68,.08) 0%,rgba(220,38,38,.04) 100%);border:1px solid rgba(239,68,68,.25)}
.zone-brand{background:linear-gradient(135deg,rgba(245,158,11,.08) 0%,rgba(217,119,6,.04) 100%);border:1px solid rgba(245,158,11,.25)}
.zone-hands{background:linear-gradient(135deg,rgba(34,197,94,.08) 0%,rgba(22,163,74,.04) 100%);border:1px solid rgba(34,197,94,.25)}
.zone-db{background:linear-gradient(135deg,rgba(20,184,166,.08) 0%,rgba(13,148,136,.04) 100%);border:1px solid rgba(20,184,166,.25)}
.zone-merged{background:linear-gradient(135deg,rgba(239,68,68,.06) 0%,rgba(56,189,248,.06) 100%);border:1px solid rgba(239,68,68,.28);box-shadow:0 4px 24px rgba(239,68,68,.08)}
.zone-token{background:linear-gradient(135deg,rgba(234,179,8,.1) 0%,rgba(202,138,4,.04) 100%);border:1px solid rgba(234,179,8,.3)}

.equation-glow{background:linear-gradient(90deg,rgba(56,189,248,.1) 0%,rgba(239,68,68,.1) 50%,rgba(245,158,11,.08) 100%);border:1px solid rgba(14,165,233,.3)}
.nav-active{background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);color:#fff;box-shadow:0 4px 14px rgba(239,68,68,.3)}
.nav-item{background:#fff;border:1px solid #e2e8f0;color:#475569}
.nav-item:hover{background:#f1f5f9;border-color:#cbd5e1}

.btn-primary{background:linear-gradient(135deg,#dc2626 0%,#ef4444 50%,#0ea5e9 100%);color:#fff;box-shadow:0 4px 14px rgba(239,68,68,.25)}
.btn-primary:hover{box-shadow:0 6px 24px rgba(239,68,68,.4)}
.btn-primary:disabled{opacity:.7;cursor:wait}

.progress-bar{height:6px;border-radius:999px;background:#e2e8f0;overflow:hidden}
.progress-bar>span{display:block;height:100%}
.bar-green{background:linear-gradient(90deg,#10b981,#34d399)}
.bar-yellow{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.bar-red{background:linear-gradient(90deg,#dc2626,#f87171)}
.bar-sky{background:linear-gradient(90deg,#0ea5e9,#38bdf8)}

.input-field{background:#fff;border:1px solid #cbd5e1;color:#0f172a}
.input-field:focus{outline:none;border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.15)}

.verdict-passed{color:#047857;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3)}
.verdict-minor{color:#b45309;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3)}
.verdict-rework{color:#b91c1c;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3)}
.verdict-reject{color:#991b1b;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4)}
.verdict-pill{font-size:10px;padding:2px 8px;border-radius:999px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}

.status-pill{font-size:10px;padding:2px 8px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.status-normal{background:rgba(16,185,129,.1);color:#047857;border:1px solid rgba(16,185,129,.3)}
.status-busy{background:rgba(239,68,68,.1);color:#dc2626;border:1px solid rgba(239,68,68,.3)}
.status-quiet{background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.3)}

.tier-bronze{background:rgba(217,119,6,.08);color:#b45309;border:1px solid rgba(217,119,6,.35)}
.tier-silver{background:rgba(100,116,139,.08);color:#475569;border:1px solid rgba(100,116,139,.35)}
.tier-gold{background:rgba(234,179,8,.1);color:#a16207;border:1px solid rgba(234,179,8,.45)}
.tier-platinum{background:rgba(239,68,68,.08);color:#b91c1c;border:1px solid rgba(239,68,68,.4)}
.tier-pill{font-size:11px;padding:3px 10px;border-radius:999px;font-weight:700;display:inline-flex;align-items:center;gap:4px}

.fade-in{animation:fadeIn .5s ease-out}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.pulse-slow{animation:pulseSlow 4s ease-in-out infinite}
@keyframes pulseSlow{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.88;transform:scale(1.015)}}

/* ===== DARK THEME (demo / 晚上) ===== */
html.dark body{background:radial-gradient(ellipse at top left,rgba(239,68,68,.08) 0%,transparent 50%),radial-gradient(ellipse at top right,rgba(56,189,248,.1) 0%,transparent 50%),linear-gradient(135deg,#020617 0%,#0f172a 50%,#020617 100%)}
html.dark .surface-1{background:rgba(15,23,42,.6);border:1px solid rgba(51,65,85,.6);box-shadow:none}
html.dark .surface-2{background:rgba(15,23,42,.7);border:1px solid rgba(51,65,85,.6);box-shadow:0 4px 16px rgba(0,0,0,.3)}
html.dark .surface-sunken{background:rgba(2,6,23,.6);border:1px solid rgba(30,41,59,.6)}
html.dark .text-primary{color:#f1f5f9}
html.dark .text-secondary{color:#94a3b8}
html.dark .text-muted{color:#64748b}
html.dark .zone-shuangyun{background:radial-gradient(ellipse at center,rgba(56,189,248,.14) 0%,rgba(15,23,42,.4) 70%);border:1px solid rgba(56,189,248,.3)}
html.dark .zone-master{background:radial-gradient(ellipse at center,rgba(239,68,68,.14) 0%,rgba(15,23,42,.4) 70%);border:1px solid rgba(239,68,68,.3)}
html.dark .zone-brand{background:radial-gradient(ellipse at center,rgba(245,158,11,.14) 0%,rgba(15,23,42,.4) 70%);border:1px solid rgba(245,158,11,.3)}
html.dark .zone-hands{background:radial-gradient(ellipse at center,rgba(34,197,94,.12) 0%,rgba(15,23,42,.4) 70%);border:1px solid rgba(34,197,94,.3)}
html.dark .zone-db{background:radial-gradient(ellipse at center,rgba(20,184,166,.12) 0%,rgba(15,23,42,.4) 70%);border:1px solid rgba(20,184,166,.3)}
html.dark .zone-merged{background:radial-gradient(ellipse at center,rgba(239,68,68,.12) 0%,rgba(56,189,248,.08) 100%);border:1px solid rgba(239,68,68,.4);box-shadow:0 0 40px rgba(239,68,68,.15)}
html.dark .zone-token{background:radial-gradient(ellipse at center,rgba(250,204,21,.14) 0%,rgba(15,23,42,.45) 70%);border:1px solid rgba(250,204,21,.35)}
html.dark .equation-glow{background:linear-gradient(90deg,rgba(56,189,248,.14) 0%,rgba(239,68,68,.14) 50%,rgba(245,158,11,.12) 100%);border:1px solid rgba(56,189,248,.3)}
html.dark .nav-item{background:rgba(30,41,59,.7);border:1px solid rgba(51,65,85,.6);color:#cbd5e1}
html.dark .nav-item:hover{background:rgba(51,65,85,.7)}
html.dark .progress-bar{background:rgba(255,255,255,.08)}
html.dark .input-field{background:rgba(2,6,23,.6);border:1px solid rgba(51,65,85,.6);color:#f1f5f9}
html.dark .input-field:focus{border-color:#0ea5e9;box-shadow:0 0 0 3px rgba(14,165,233,.2)}
html.dark .verdict-passed{color:#6ee7b7;background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3)}
html.dark .verdict-minor{color:#fcd34d;background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.3)}
html.dark .verdict-rework{color:#fca5a5;background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3)}
html.dark .verdict-reject{color:#fecaca;background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4)}
html.dark .status-normal{background:rgba(16,185,129,.15);color:#6ee7b7;border-color:rgba(16,185,129,.3)}
html.dark .status-busy{background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.3)}
html.dark .status-quiet{background:rgba(245,158,11,.15);color:#fcd34d;border-color:rgba(245,158,11,.3)}
html.dark .tier-bronze{background:rgba(217,119,6,.18);color:#fbbf24;border-color:rgba(217,119,6,.4)}
html.dark .tier-silver{background:rgba(148,163,184,.18);color:#e2e8f0;border-color:rgba(148,163,184,.4)}
html.dark .tier-gold{background:rgba(250,204,21,.18);color:#fef08a;border-color:rgba(250,204,21,.5)}
html.dark .tier-platinum{background:rgba(239,68,68,.18);color:#fca5a5;border-color:rgba(239,68,68,.5)}
</style>`;
}

/** 頂部 header：logo + equation-glow + 主題切換按鈕 + nav。 */
export function renderHeader(active: NavActive, subtitle = ""): string {
  const subtitleText = subtitle ? escapeHtml(subtitle) : "Brain × Hand × Brand";
  return `<header class="backdrop-blur-md sticky top-0 z-50 border-b" style="border-color:rgba(148,163,184,.25);background:rgba(255,255,255,.8);">
  <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 via-red-500 to-amber-500 flex items-center justify-center text-xl shadow-lg shadow-red-500/20">🧠</div>
      <div>
        <h1 class="text-lg font-bold text-primary">双云 AI 行銷部</h1>
        <p class="text-xs text-secondary">${subtitleText}</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div class="text-xs equation-glow px-4 py-2 rounded-full hidden md:block">
        <span class="text-sky-600 dark:text-sky-300 font-semibold">双云腦</span>
        <span class="text-muted mx-1">×</span>
        <span class="text-red-600 dark:text-red-300 font-semibold">師傅腦</span>
        <span class="text-muted mx-1">×</span>
        <span class="text-amber-600 dark:text-amber-300 font-semibold">品牌腦</span>
        <span class="text-muted mx-1">→</span>
        <span class="text-emerald-600 dark:text-emerald-300 font-semibold">雙手</span>
      </div>
      <button onclick="__syToggleTheme()" class="w-10 h-10 rounded-xl surface-1 flex items-center justify-center hover:scale-105 transition" title="切換主題">
        <span id="theme-icon" class="text-lg">🌙</span>
      </button>
    </div>
  </div>
  <div class="max-w-7xl mx-auto px-6 pb-3">
    <nav class="flex flex-wrap gap-2">
      <a href="/library" class="${active === "dashboard" ? "nav-active" : "nav-item"} px-4 py-1.5 rounded-lg text-sm font-semibold transition">腦手資料庫</a>
      <a href="/workflows" class="${active === "workflows" ? "nav-active" : "nav-item"} px-4 py-1.5 rounded-lg text-sm font-semibold transition">工作流</a>
      <a href="/brands" class="${active === "database" ? "nav-active" : "nav-item"} px-4 py-1.5 rounded-lg text-sm font-semibold transition">品牌管理</a>
    </nav>
  </div>
</header>`;
}

/** 全頁底部共用：主題切換 JS。 */
export function renderThemeToggleScript(): string {
  return `<script>
function __syToggleTheme(){var isDark=document.documentElement.classList.toggle("dark");localStorage.setItem("sy-theme",isDark?"dark":"light");document.getElementById("theme-icon").textContent=isDark?"☀️":"🌙";}
(function(){var icon=document.getElementById("theme-icon");if(icon)icon.textContent=document.documentElement.classList.contains("dark")?"☀️":"🌙";})();
</script>`;
}

/** 包整個頁面的 wrapper：head + body + 共用 script。 */
export function renderPageShell(options: {
  title: string;
  active: NavActive;
  subtitle?: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
${renderThemeInitScript()}
${renderTailwindCdn()}
${renderThemeStyles()}
</head>
<body class="text-primary">
${renderHeader(options.active, options.subtitle)}
<main class="max-w-7xl mx-auto px-6 py-8 space-y-6">
${options.body}
</main>
${renderThemeToggleScript()}
</body>
</html>`;
}
