import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import http from "http";
import { Server } from "socket.io";
import loadPlugins, { pluginCmdTable, pluginStatus } from "./src/core/plugin-loader.js";

// --------------------- 基础目录 ---------------------
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const rolePluginDir = path.join(process.cwd(), "roles", "Plugins");
if (!fs.existsSync(rolePluginDir)) fs.mkdirSync(rolePluginDir, { recursive: true });

// --------------------- 全局状态 ---------------------
let activeGroups = new Set();
let messageCounter = 0;
let ws = null;
let ioRef = null;

// --------------------- 日志函数 ---------------------
function log(msg, type = 'info') {
  const time = new Date();
  const stamp = time.toISOString().replace("T", " ").split(".")[0];
  const day = time.toISOString().split("T")[0];
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8"); } catch {}

  if (ioRef) {
    ioRef.emit('log_message', {
      timestamp: time.toLocaleString(),
      message: msg,
      type: type
    });
  }
}

// --------------------- 配置 ---------------------
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

// --------------------- WebSocket 统一连接函数 ---------------------
function connectWS(url = config.ws, token = config.token, notifySource = "系统") {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();

  ws = new WebSocket(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

  ws.on("open", () => {
    log(`${notifySource}已连接: ${url}`);
    if (ioRef) ioRef.emit('status_update', { activeGroups: activeGroups.size, activePlugins: pluginCmdTable.length, connected: true });
  });

  ws.on("close", () => {
    log("连接已关闭");
    if (ioRef) ioRef.emit('status_update', { activeGroups: activeGroups.size, activePlugins: pluginCmdTable.length, connected: false });
  });

  ws.on("error", (err) => {
    log("WebSocket 错误: " + err);
    if (ioRef) ioRef.emit('status_update', { connected: false });
  });
}

// --------------------- 插件列表函数 ---------------------
function getPluginList() {
  const plugins = pluginCmdTable.map(p => {
    const pluginFile = p.file || p.names[0];
    const isEnabled = pluginStatus.has(pluginFile) ? pluginStatus.get(pluginFile) : true;

    return {
      name: p.names[0],
      command: p.names[0],
      description: p.help || '暂无描述',
      author: '铭茗',
      enabled: isEnabled
    };
  });

  plugins.push({
    name: 'log',
    command: 'log',
    description: '跑团日志记录功能',
    author: '铭茗',
    enabled: pluginStatus.get("log") ?? true
  });

  return plugins;
}

// --------------------- 发送群消息 ---------------------
function sendGroupMsg(ws, group_id, text) {
  try {
    ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } }));
    if (ioRef) {
      ioRef.emit('message', {
        type: 'command',
        content: text,
        groupId: group_id,
        timestamp: new Date().toLocaleString(),
        isSent: true
      });
    }
  } catch {}
}

// --------------------- Web 服务器启动 ---------------------
let WEB_PORT = 4412;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    const io = new Server(srv, { cors: { origin: "*", methods: ["GET", "POST"] } });
    ioRef = io;

    // --------------------- WebSocket 前端事件 ---------------------
    io.on('connection', (socket) => {
      log('WebUI 客户端已连接: ' + socket.id);

      socket.emit('status_update', {
        activeGroups: activeGroups.size,
        activePlugins: pluginCmdTable.length,
        connected: ws && ws.readyState === WebSocket.OPEN
      });

      socket.emit('config_update', { wsUrl: config.ws, accessToken: config.token });

      socket.on('send_command', (data) => { log(`通过WebUI发送命令: ${data.command}`); });

      socket.on('update_config', (data) => {
        config.ws = data.wsUrl;
        config.token = data.accessToken;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        log('配置已更新');
        ioRef.emit('config_update', { wsUrl: config.ws, accessToken: config.token });
      });

      socket.on('connect_onebot', (data) => {
        config.ws = data.wsUrl;
        config.token = data.accessToken;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        connectWS(config.ws, config.token, "WebUI ");
      });

      socket.on('disconnect_onebot', () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
        log("通过WebUI断开OneBot连接");
      });

      socket.on('get_plugins', () => socket.emit('plugins_list', getPluginList()));

      socket.on('get_logs', () => {
        try {
          const logs = fs.readdirSync(logDir).filter(f => f.endsWith(".log")).sort().reverse();
          if (!logs.length) return;

          const latest = fs.readFileSync(path.join(logDir, logs[0]), "utf8")
            .split("\n").filter(Boolean).slice(-50);

          for (const line of latest) {
            const m = line.match(/^\[([^\]]+)\]\s+(.*)/);
            if (!m) continue;
            socket.emit('log_message', {
              timestamp: m[1],
              message: m[2],
              type: /错误|error|fail/.test(m[2]) ? 'error' :
                    /成功|success|connect/.test(m[2]) ? 'success' : 'info'
            });
          }
        } catch {}
      });

      socket.on('disconnect', () => log('WebUI 客户端断开连接: ' + socket.id));
    });

    // --------------------- HTTP & 静态资源 ---------------------
    srv.on('request', (req, res) => {
      if (req.url.startsWith("/socket.io/")) return;
      if (req.url.startsWith("/api/")) return handleAPIRequest(req, res);

      let filePath = req.url === "/" ? "/webui/index.html" : req.url;
      if (filePath.startsWith("/webui")) filePath = "." + filePath;
      if (filePath.startsWith("/dist")) filePath = "." + filePath;
      if (filePath === "/favicon.ico") filePath = "./webui/favicon.ico";

      const abs = path.join(process.cwd(), filePath);
      fs.readFile(abs, (err, content) => {
        if (err) return res.end("404 Not Found");
        res.end(content);
      });
    });

    srv.listen(port, () => {
      log(`WebUI 服务器已在端口 ${port} 上启动`);
      log(`请访问 http://localhost:${port}`);
      resolve(srv);
    });

    srv.on('error', (err) => reject(err));
  });
}

// --------------------- 自动端口回退 ---------------------
async function startServerWithFallback() {
  try {
    await startServer(WEB_PORT);
  } catch (err) {
    if (err.code !== 'EADDRINUSE') return log("服务器启动失败: " + err);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const newPort = await new Promise(res => rl.question(`端口 ${WEB_PORT} 已被占用，请输入新端口号 (4413-4500): `, ans => res(Number(ans.trim()))));
    rl.close();
    WEB_PORT = (newPort >= 4413 && newPort <= 4500) ? newPort : 4413;
    await startServer(WEB_PORT);
  }
}

startServerWithFallback();

// --------------------- 启动初始 WS ---------------------
connectWS(config.ws, config.token, "系统 ");

// --------------------- 插件加载 ---------------------
const bot = {};
loadPlugins(bot, sendGroupMsg, ws);

// --------------------- API 路由 ---------------------
function handleAPIRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const route = url.pathname.replace("/api", "").replace(/^\//, "");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.end();

  const reply = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  switch (route) {

    case "status":
      return reply(200, {
        activeGroups: activeGroups.size,
        activePlugins: pluginCmdTable.length,
        connected: ws && ws.readyState === WebSocket.OPEN,
        messageCount: messageCounter
      });

    case "config":
      if (req.method === "GET")
        return reply(200, { wsUrl: config.ws, accessToken: config.token });

      if (req.method === "POST") {
        let body = "";
        req.on("data", d => body += d);
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            config.ws = data.wsUrl;
            config.token = data.accessToken;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
            reply(200, { success: true });
          } catch {
            reply(400, { error: "Invalid JSON" });
          }
        });
        return;
      }
      return reply(405, {});

    case "plugins":
      if (req.method === "GET")
        return reply(200, getPluginList());
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => body += d);
        req.on("end", () => {
          try {
            const { plugin, action } = JSON.parse(body);
            const isEnabled = action === "enable";
            pluginStatus.set(plugin, isEnabled);
            reply(200, { success: true });
          } catch {
            reply(400, { error: "Invalid JSON" });
          }
        });
        return;
      }
      return reply(405, {});

    case "logs":
      return reply(200, { logs: fs.readdirSync(logDir).filter(f => f.endsWith(".log")) });

    case "send-command":
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => body += d);
        req.on("end", () => {
          try {
            const { command } = JSON.parse(body);
            log(`通过API发送命令: ${command}`);
            reply(200, { success: true });
          } catch {
            reply(400, { error: "Invalid JSON" });
          }
        });
        return;
      }
      return reply(405, {});

    case "connect":
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => body += d);
        req.on("end", () => {
          try {
            const { wsUrl, accessToken } = JSON.parse(body);
            config.ws = wsUrl || config.ws;
            config.token = accessToken || config.token;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
            connectWS(config.ws, config.token, "API ");
            reply(200, { success: true });
          } catch {
            reply(400, { error: "Invalid JSON" });
          }
        });
        return;
      }
      return reply(405, {});

    case "disconnect":
      if (req.method === "POST") {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
        log("通过API断开连接");
        return reply(200, { success: true });
      }
      return reply(405, {});

    default:
      return reply(404, { error: "API endpoint not found" });
  }
}

// --------------------- 消息处理 ---------------------
ws.on("message", raw => {
  let e;
  try { e = JSON.parse(raw.toString()); } catch { return; }
  if (e.post_type !== "message" || e.message_type !== "group") return;

  let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
  if (!text) return;

  if (ioRef) {
    ioRef.emit('message', {
      type: 'group',
      content: text,
      groupId: e.group_id,
      userId: e.user_id,
      timestamp: new Date().toLocaleString(),
      isSent: false
    });
  }

  messageCounter++;
  if (ioRef) ioRef.emit('status_update', { activeGroups: activeGroups.size, activePlugins: pluginCmdTable.length, messageCount: messageCounter });

  activeGroups.add(e.group_id);

  // help 去重优化后逻辑保持原样
  text = text.replace(/^\.([a-zA-Z])(\d)/, ".\$1 \$2");
  text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

  if (text.startsWith(".help")) {
    const name = text.slice(5).trim();
    if (name) {
      let helpText = "未找到此插件指令";
      for (const p of pluginCmdTable) {
        if (p.names.includes(name)) {
          helpText = p.help || "无帮助信息";
          break;
        }
      }
      return sendGroupMsg(ws, e.group_id, helpText);
    }

    const commands = pluginCmdTable.map(p => {
      // 将COC相关命令归类为'coc'，但保持各自的帮助查询功能
      if (p.names.some(x => ['coc','st','ra','nn','rav','sc','ti','li','setcoc','en','stshow','log'].includes(x))) return 'coc';
      if (p.names.some(x => x.includes("开团"))) return '开团';
      if (p.names.includes('r')) return 'r';
      if (p.names.some(x => x.includes('网易云'))) return '网易云';
      return p.names[0];
    }).filter((cmd, i, arr) => arr.indexOf(cmd) === i);

    const cmdLines = [];
    for (let i = 0; i < commands.length; i += 4) {
      cmdLines.push(commands.slice(i, i + 4).map(cmd => `🜲 ${cmd}`).join("    "));
    }

    const helpText = [
      `          ✨  Bangdice 过载核心  ✨`,
      "────────────────",
      ...cmdLines,
      "────────────────",
      "🜲 输入 .help <指令> 揭开细节"
    ].join("\n");

    return sendGroupMsg(ws, e.group_id, helpText);
  }

  bot.dispatchPlugin(text, e, ws, sendGroupMsg);
});
