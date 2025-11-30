import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import loadPlugins, { pluginCmdTable } from "./data/plugin-loader.js";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rolePluginDir = path.join(process.cwd(), "roles", "Plugins");
if (!fs.existsSync(rolePluginDir)) fs.mkdirSync(rolePluginDir, { recursive: true });

function log(msg) {
  const time = new Date();
  const stamp = time.toISOString().replace("T", " ").split(".")[0];
  const day = time.toISOString().split("T")[0];
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8"); } catch {}
}

const configPath = path.join(process.cwd(), "config.json");
async function ensureConfig() {
  if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, ans => res(ans.trim())));
  const ws = await ask("请输入 OneBot WebSocket 地址 (默认 ws://127.0.0.1:3001): ") || "ws://127.0.0.1:3001";
  const token = await ask("请输入 Access-Token (没有请留空): ") || "";
  rl.close();
  const cfg = { ws, token };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
  return cfg;
}

const config = await ensureConfig();
const ws = new WebSocket(config.ws, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
ws.on("open", () => log("已连接: " + config.ws));
ws.on("close", () => log("连接已关闭"));
ws.on("error", err => log("WebSocket 错误: " + err));

function sendGroupMsg(ws, group_id, text) {
  try { ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } })); } catch {}
}

const bot = {};
loadPlugins(bot, sendGroupMsg, ws);

ws.on("message", raw => {
  let e;
  try { e = JSON.parse(raw.toString()); } catch { return; }
  if (e.post_type !== "message" || e.message_type !== "group") return;

  let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
  if (!text) return;

  text = text.replace(/^\.([a-zA-Z])(\d)/, ".$1 $2");
  text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

if (text.startsWith(".help")) {
  const name = text.slice(5).trim();
  if (name) {
    sendGroupMsg(ws, e.group_id, bot.getPluginHelp(name));
  } else {
    // 计算最长命令名宽度（兼容中文）
    const getMaxWidth = (str) => [...str].length;
    const maxCmdWidth = Math.max(...pluginCmdTable.map(p => getMaxWidth(p.names.join("/"))));
    
    // 生成命令行（居左对齐，保留足够间距）
    const cmdLines = pluginCmdTable.map(p => {
      const cmd = p.names.join("/");
      return `🜲 ${cmd}`;
    });

    // 组合最终输出
    const helpText = [
      `          ✨  Bangdice 过载核心  ✨`,
      "────────────────",
      ...cmdLines,
      "────────────────",
      "🜲 输入 .help <指令> 揭开细节"
    ].join("\n");
    
    sendGroupMsg(ws, e.group_id, helpText);
  }
  return;
}


  if (bot.dispatchPlugin(text, e, ws, sendGroupMsg)) return;
});
