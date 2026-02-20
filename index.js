import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import loadPlugins, { pluginCmdTable, pluginStatus } from "./src/core/plugin-loader.js";

// --------------------- 常量配置 ---------------------
const CONFIG = {
  MAX_MESSAGE_LENGTH: 2000,        // 最大消息长度
  MAX_REQUEST_BODY: 10000,         // 最大请求体大小
  MAX_COMMAND_RATE: 10,            // 每分钟最大命令数
  COMMAND_COOLDOWN: 1000,          // 命令冷却时间(ms)
  WS_RECONNECT_DELAY: 3000,        // WebSocket重连延迟(ms)
  WS_MAX_RECONNECT_ATTEMPTS: 10,   // 最大重连尝试次数
  API_TOKEN_LENGTH: 32,            // API Token长度
  HEARTBEAT_INTERVAL: 30000,       // 心跳间隔(ms)
  CONFIG_WATCH_DEBOUNCE: 1000,     // 配置文件监听防抖(ms)
  DEFAULT_WEB_PORT: 4412,          // 默认Web端口
  WEB_PORT_MIN: 4413,              // Web端口最小值
  WEB_PORT_MAX: 4500,              // Web端口最大值
  // 乐队模式配置
  BAND_TIMEOUT: 30000,             // 演奏超时时间(ms)，超时自动交棒
  BAND_QUEUE_MAX: 10,              // 每群最大排队人数
};

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
let reconnectAttempts = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let isShuttingDown = false;

// 命令冷却映射 (userId -> { count, lastTime })
const commandCooldown = new Map();

// API Token 存储
let apiTokens = new Set();

// --------------------- 乐队人格系统 ---------------------
// BangDream 风格的人格列表
const BAND_PERSONAS = [
  { name: 'Sayo', emoji: '🎸', color: '💜', style: '冷静' },      // 羽泽鸫 - 吉他
  { name: 'Rinko', emoji: '🎹', color: '💙', style: '温柔' },    // 白金燐子 - 键盘
  { name: 'Lisa', emoji: '🌸', color: '💗', style: '元气' },     // 今井莉莎 - 贝斯
  { name: 'Yukina', emoji: '🎤', color: '❄️', style: '凛然' },   // 友希那 - 主唱
  { name: 'Ako', emoji: '🦋', color: '💜', style: '热血' },      // 宇田川亚子 - 鼓
];

// 每个群的乐队模式状态
// bandMode: Map<groupId, { enabled: boolean, currentIndex: number }>
const bandMode = new Map();

// 群组是否启用乐队模式
function isBandModeEnabled(groupId) {
  const state = bandMode.get(groupId.toString());
  return state ? state.enabled : false;
}

// 获取群组当前人格
function getCurrentPersona(groupId) {
  const gid = groupId.toString();
  let state = bandMode.get(gid);
  if (!state) {
    state = { enabled: false, currentIndex: 0 };
    bandMode.set(gid, state);
  }
  return BAND_PERSONAS[state.currentIndex % BAND_PERSONAS.length];
}

// 切换到下一个人格（演奏完成）
function nextPersona(groupId) {
  const gid = groupId.toString();
  let state = bandMode.get(gid);
  if (!state) {
    state = { enabled: false, currentIndex: 0 };
    bandMode.set(gid, state);
  }
  state.currentIndex = (state.currentIndex + 1) % BAND_PERSONAS.length;
  return BAND_PERSONAS[state.currentIndex];
}

// 获取待机人格列表（排除当前）
function getWaitingPersonas(groupId) {
  const current = getCurrentPersona(groupId);
  return BAND_PERSONAS.filter(p => p.name !== current.name);
}

// 切换乐队模式开关
function toggleBandMode(groupId) {
  const gid = groupId.toString();
  let state = bandMode.get(gid);
  if (!state) {
    state = { enabled: false, currentIndex: 0 };
    bandMode.set(gid, state);
  }
  state.enabled = !state.enabled;
  return state.enabled;
}

// --------------------- 日志函数 ---------------------
function log(msg, type = 'info') {
  const time = new Date();
  const stamp = time.toISOString().replace("T", " ").split(".")[0];
  const day = time.toISOString().split("T")[0];
  const line = `[${stamp}] [${type.toUpperCase()}] ${msg}`;
  console.log(line);
  
  try {
    fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8");
  } catch (err) {
    console.error(`写入日志文件失败: ${err.message}`);
  }

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
let config = { ws: "ws://127.0.0.1:3001", token: "", apiTokens: [] };

async function ensureConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config = { ...config, ...data };
      // 加载已存在的API tokens
      if (config.apiTokens && Array.isArray(config.apiTokens)) {
        config.apiTokens.forEach(t => apiTokens.add(t));
      }
      return config;
    } catch (err) {
      log(`读取配置文件失败: ${err.message}`, 'error');
    }
  }
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, ans => res(ans.trim())));
  const wsUrl = await ask("请输入 OneBot WebSocket 地址 (默认 ws://127.0.0.1:3001): ") || "ws://127.0.0.1:3001";
  const token = await ask("请输入 Access-Token (没有请留空): ") || "";
  rl.close();
  
  // 生成默认API token
  const defaultApiToken = generateApiToken();
  apiTokens.add(defaultApiToken);
  
  config = { ws: wsUrl, token, apiTokens: [defaultApiToken] };
  saveConfig();
  log(`已生成默认API Token: ${defaultApiToken}`, 'info');
  return config;
}

function saveConfig() {
  try {
    config.apiTokens = Array.from(apiTokens);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    log(`保存配置失败: ${err.message}`, 'error');
  }
}

// 生成API Token
function generateApiToken() {
  return crypto.randomBytes(CONFIG.API_TOKEN_LENGTH).toString('hex');
}

// 配置热重载
function watchConfig() {
  let lastModified = Date.now();
  fs.watch(configPath, (eventType) => {
    if (eventType === 'change') {
      // 防抖处理
      const now = Date.now();
      if (now - lastModified < CONFIG.CONFIG_WATCH_DEBOUNCE) return;
      lastModified = now;
      
      try {
        const newConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const oldWs = config.ws;
        const oldToken = config.token;
        
        config = { ...config, ...newConfig };
        
        // 更新API tokens
        apiTokens.clear();
        if (config.apiTokens && Array.isArray(config.apiTokens)) {
          config.apiTokens.forEach(t => apiTokens.add(t));
        }
        
        // 如果WebSocket配置改变，重新连接
        if (oldWs !== config.ws || oldToken !== config.token) {
          log("检测到WebSocket配置变更，正在重连...", 'info');
          reconnectAttempts = 0;
          connectWS(config.ws, config.token, "配置热重载 ");
        }
        
        log("配置已热重载", 'success');
        if (ioRef) ioRef.emit('config_update', { wsUrl: config.ws, accessToken: config.token });
      } catch (err) {
        log(`配置热重载失败: ${err.message}`, 'error');
      }
    }
  });
}

await ensureConfig();

// --------------------- WebSocket 统一连接函数 ---------------------
function connectWS(url = config.ws, token = config.token, notifySource = "系统") {
  // 清理现有连接
  if (ws) {
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
  
  // 清理心跳定时器
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // 检查是否正在关闭
  if (isShuttingDown) return;

  ws = new WebSocket(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

  ws.on("open", () => {
    log(`${notifySource}已连接: ${url}`, 'success');
    reconnectAttempts = 0;
    
    // 清除重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    // 启动心跳
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
    
    if (ioRef) ioRef.emit('status_update', { activeGroups: activeGroups.size, activePlugins: pluginCmdTable.length, connected: true });
  });

  ws.on("close", (code, reason) => {
    log(`连接已关闭 (code: ${code}, reason: ${reason || '无'})`, 'warn');
    
    // 清理心跳
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    
    if (ioRef) ioRef.emit('status_update', { activeGroups: activeGroups.size, activePlugins: pluginCmdTable.length, connected: false });
    
    // 自动重连
    if (!isShuttingDown && reconnectAttempts < CONFIG.WS_MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = CONFIG.WS_RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
      log(`将在 ${delay/1000} 秒后尝试第 ${reconnectAttempts} 次重连...`, 'info');
      
      reconnectTimer = setTimeout(() => {
        if (!isShuttingDown) {
          connectWS(config.ws, config.token, "自动重连 ");
        }
      }, delay);
    } else if (reconnectAttempts >= CONFIG.WS_MAX_RECONNECT_ATTEMPTS) {
      log(`已达到最大重连次数 (${CONFIG.WS_MAX_RECONNECT_ATTEMPTS})，停止重连`, 'error');
    }
  });

  ws.on("error", (err) => {
    log(`WebSocket 错误: ${err.message}`, 'error');
    if (ioRef) ioRef.emit('status_update', { connected: false });
  });

  ws.on("pong", () => {
    // 心跳响应
  });
  
  // 绑定消息处理器（在 ws 初始化后）
  ws.on("message", handleWsMessage);
}

// --------------------- 插件列表函数 ---------------------
function getPluginList() {
  const plugins = pluginCmdTable.map(p => {
    const pluginFile = p.file || p.names[0];
    const isEnabled = pluginStatus.has(pluginFile) ? pluginStatus.get(pluginFile) : true;

    return {
      name: p.displayName || p.file || p.names[0],
      command: p.names[0],
      description: p.help || '暂无描述',
      author: p.author || '铭茗',
      enabled: isEnabled
    };
  });

  // 添加log插件信息
  const hasLogPlugin = pluginCmdTable.some(p => p.names.includes('log'));
  if (!hasLogPlugin) {
    plugins.push({
      name: 'log',
      command: 'log',
      description: '跑团日志记录功能',
      author: '铭茗',
      enabled: pluginStatus.get("log") ?? true
    });
  }

  return plugins;
}

// --------------------- 发送群消息 ---------------------
function sendGroupMsg(ws, group_id, text, skipBandMode = false) {
  // 输入验证
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log("WebSocket未连接，无法发送消息", 'error');
    return;
  }
  
  // 乐队模式：添加人格前缀
  let persona = null;
  if (!skipBandMode && isBandModeEnabled(group_id)) {
    persona = getCurrentPersona(group_id);
    text = `${persona.emoji}${persona.name}: ${text}`;
  }
  
  // 消息长度限制
  if (text && text.length > CONFIG.MAX_MESSAGE_LENGTH) {
    log(`消息过长 (${text.length} 字符)，将被截断`, 'warn');
    text = text.substring(0, CONFIG.MAX_MESSAGE_LENGTH) + '...';
  }
  
  try {
    ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } }));
    
    // 乐队模式：发送后切换到下一个人格
    if (persona) {
      nextPersona(group_id);
    }
    
    if (ioRef) {
      ioRef.emit('message', {
        type: 'command',
        content: text,
        groupId: group_id,
        timestamp: new Date().toLocaleString(),
        isSent: true
      });
    }
  } catch (err) {
    log(`发送消息失败: ${err.message}`, 'error');
  }
}

// --------------------- 命令冷却检查 ---------------------
function checkCommandCooldown(userId) {
  const now = Date.now();
  const userCooldown = commandCooldown.get(userId) || { count: 0, lastTime: 0, blocked: false };
  
  // 重置每分钟的计数
  if (now - userCooldown.lastTime > 60000) {
    userCooldown.count = 0;
    userCooldown.blocked = false;
  }
  
  userCooldown.count++;
  userCooldown.lastTime = now;
  
  // 检查是否超过频率限制
  if (userCooldown.count > CONFIG.MAX_COMMAND_RATE) {
    userCooldown.blocked = true;
    commandCooldown.set(userId, userCooldown);
    return { allowed: false, reason: 'rate_limit' };
  }
  
  // 检查冷却时间
  if (userCooldown.blocked) {
    commandCooldown.set(userId, userCooldown);
    return { allowed: false, reason: 'cooldown' };
  }
  
  commandCooldown.set(userId, userCooldown);
  return { allowed: true };
}

// --------------------- API Token 验证 ---------------------
function validateApiToken(token) {
  if (!token) return false;
  return apiTokens.has(token);
}

// --------------------- 优雅关闭 ---------------------
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  log(`收到 ${signal} 信号，正在优雅关闭...`, 'info');
  
  // 清理定时器
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  
  // 关闭WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  
  // 关闭Socket.IO
  if (ioRef) {
    ioRef.close(() => {
      log('Socket.IO 已关闭', 'info');
    });
  }
  
  log('BangDice 已安全关闭', 'success');
  process.exit(0);
}

// 注册关闭信号处理
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  log(`未捕获异常: ${err.message}\n${err.stack}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的Promise拒绝: ${reason}`, 'error');
});

// --------------------- Web 服务器启动 ---------------------
let WEB_PORT = CONFIG.DEFAULT_WEB_PORT;

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
      
      // 乐队模式事件
      socket.on('band_mode', (data) => {
        // 注意：乐队模式是群组级别的，这里提供一个全局开关的简化版本
        // 实际使用时应在群内使用 .band on/off 命令
        if (data.action === 'status') {
          socket.emit('band_status', {
            enabled: false, // WebUI 不管理具体群的乐队模式
            message: '请在群内使用 .band on/off 控制乐队模式'
          });
        }
      });
      
      socket.on('band_status', () => {
        socket.emit('band_status', {
          personas: BAND_PERSONAS,
          groups: Array.from(bandMode.entries()).map(([gid, state]) => ({
            groupId: gid,
            enabled: state.enabled,
            currentIndex: state.currentIndex
          }))
        });
      });

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
    const newPort = await new Promise(res => rl.question(`端口 ${WEB_PORT} 已被占用，请输入新端口号 (${CONFIG.WEB_PORT_MIN}-${CONFIG.WEB_PORT_MAX}): `, ans => res(Number(ans.trim()))));
    rl.close();
    WEB_PORT = (newPort >= CONFIG.WEB_PORT_MIN && newPort <= CONFIG.WEB_PORT_MAX) ? newPort : CONFIG.WEB_PORT_MIN;
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.end();

  const reply = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // 需要认证的API端点
  const protectedRoutes = ['config', 'plugins', 'send-command', 'connect', 'disconnect', 'tokens'];
  
  // 从header或query获取token
  const authHeader = req.headers['authorization'];
  const queryToken = url.searchParams.get('token');
  const token = authHeader?.replace('Bearer ', '') || queryToken;
  
  // 检查是否需要认证
  if (protectedRoutes.includes(route)) {
    if (!validateApiToken(token)) {
      return reply(401, { error: "Unauthorized: Invalid or missing API token" });
    }
  }

  switch (route) {

    case "status":
      return reply(200, {
        activeGroups: activeGroups.size,
        activePlugins: pluginCmdTable.length,
        connected: ws && ws.readyState === WebSocket.OPEN,
        messageCount: messageCounter,
        uptime: process.uptime()
      });

    case "config":
      if (req.method === "GET")
        return reply(200, { wsUrl: config.ws, accessToken: config.token ? '******' : '' });

      if (req.method === "POST") {
        let body = "";
        req.on("data", d => {
          body += d;
          if (body.length > CONFIG.MAX_REQUEST_BODY) {
            reply(413, { error: "Request body too large" });
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.wsUrl) config.ws = data.wsUrl;
            if (data.accessToken !== undefined) config.token = data.accessToken;
            saveConfig();
            reply(200, { success: true });
          } catch (err) {
            reply(400, { error: "Invalid JSON: " + err.message });
          }
        });
        return;
      }
      return reply(405, { error: "Method not allowed" });

    case "plugins":
      if (req.method === "GET")
        return reply(200, getPluginList());
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => {
          body += d;
          if (body.length > CONFIG.MAX_REQUEST_BODY) {
            reply(413, { error: "Request body too large" });
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const { plugin, action } = JSON.parse(body);
            if (!plugin || !action) {
              return reply(400, { error: "Missing plugin or action parameter" });
            }
            const isEnabled = action === "enable";
            pluginStatus.set(plugin, isEnabled);
            reply(200, { success: true, plugin, enabled: isEnabled });
          } catch (err) {
            reply(400, { error: "Invalid JSON: " + err.message });
          }
        });
        return;
      }
      return reply(405, { error: "Method not allowed" });

    case "logs":
      try {
        const logs = fs.readdirSync(logDir).filter(f => f.endsWith(".log")).sort().reverse();
        return reply(200, { logs });
      } catch (err) {
        return reply(500, { error: "Failed to read logs: " + err.message });
      }

    case "send-command":
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => {
          body += d;
          if (body.length > CONFIG.MAX_REQUEST_BODY) {
            reply(413, { error: "Request body too large" });
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const { command, groupId } = JSON.parse(body);
            if (!command) {
              return reply(400, { error: "Missing command parameter" });
            }
            if (command.length > CONFIG.MAX_MESSAGE_LENGTH) {
              return reply(400, { error: "Command too long" });
            }
            log(`通过API发送命令: ${command}`);
            if (groupId && ws && ws.readyState === WebSocket.OPEN) {
              sendGroupMsg(ws, groupId, command);
            }
            reply(200, { success: true });
          } catch (err) {
            reply(400, { error: "Invalid JSON: " + err.message });
          }
        });
        return;
      }
      return reply(405, { error: "Method not allowed" });

    case "connect":
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => {
          body += d;
          if (body.length > CONFIG.MAX_REQUEST_BODY) {
            reply(413, { error: "Request body too large" });
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const data = body ? JSON.parse(body) : {};
            if (data.wsUrl) config.ws = data.wsUrl;
            if (data.accessToken !== undefined) config.token = data.accessToken;
            saveConfig();
            reconnectAttempts = 0;
            connectWS(config.ws, config.token, "API ");
            reply(200, { success: true });
          } catch (err) {
            reply(400, { error: "Invalid JSON: " + err.message });
          }
        });
        return;
      }
      return reply(405, { error: "Method not allowed" });

    case "disconnect":
      if (req.method === "POST") {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        log("通过API断开连接");
        return reply(200, { success: true });
      }
      return reply(405, { error: "Method not allowed" });

    case "tokens":
      // API Token 管理
      if (req.method === "GET") {
        return reply(200, { tokens: Array.from(apiTokens).map(t => t.substring(0, 8) + '...') });
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", d => {
          body += d;
          if (body.length > CONFIG.MAX_REQUEST_BODY) {
            reply(413, { error: "Request body too large" });
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const { action } = JSON.parse(body);
            if (action === "generate") {
              const newToken = generateApiToken();
              apiTokens.add(newToken);
              saveConfig();
              log("生成新的API Token", 'info');
              return reply(200, { success: true, token: newToken });
            } else if (action === "list") {
              return reply(200, { tokens: Array.from(apiTokens) });
            } else if (action === "revoke") {
              const { token: revokeToken } = JSON.parse(body);
              if (apiTokens.has(revokeToken)) {
                apiTokens.delete(revokeToken);
                saveConfig();
                log("已撤销API Token", 'info');
                return reply(200, { success: true });
              }
              return reply(404, { error: "Token not found" });
            }
            return reply(400, { error: "Invalid action" });
          } catch (err) {
            reply(400, { error: "Invalid JSON: " + err.message });
          }
        });
        return;
      }
      return reply(405, { error: "Method not allowed" });

    default:
      return reply(404, { error: "API endpoint not found" });
  }
}

// --------------------- 消息处理 ---------------------
function handleWsMessage(raw) {
    let e;
    try { 
      e = JSON.parse(raw.toString()); 
    } catch (err) {
      log(`消息解析失败: ${err.message}`, 'error');
      return; 
    }
    
    if (e.post_type !== "message" || e.message_type !== "group") return;

    let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
    if (!text) return;
    
    // 输入长度限制
    if (text.length > CONFIG.MAX_MESSAGE_LENGTH) {
      log(`消息过长被忽略 (${text.length} 字符)`, 'warn');
      return;
    }

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

    // 命令冷却检查（只对以.开头的命令生效）
    if (text.startsWith('.')) {
      const cooldown = checkCommandCooldown(e.user_id);
      if (!cooldown.allowed) {
        if (cooldown.reason === 'rate_limit') {
          log(`用户 ${e.user_id} 触发命令频率限制`, 'warn');
          return sendGroupMsg(ws, e.group_id, "⚠️ 命令频率过高，请稍后再试");
        }
        return; // 冷却中，静默忽略
      }
    }

    // help 去重优化后逻辑保持原样
    text = text.replace(/^\.([a-zA-Z])(\d)/, ".\$1 \$2");
    text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

    // --------------------- 乐队模式命令 ---------------------
    if (text.startsWith(".band")) {
      const args = text.slice(5).trim().split(/\s+/);
      const subCmd = args[0];
      
      if (subCmd === 'on' || subCmd === '开') {
        const gid = e.group_id.toString();
        let state = bandMode.get(gid);
        if (!state) {
          state = { enabled: false, currentIndex: 0 };
          bandMode.set(gid, state);
        }
        state.enabled = true;
        const persona = getCurrentPersona(e.group_id);
        return sendGroupMsg(ws, e.group_id, 
          `🎸 乐队模式已开启！\n当前演奏者: ${persona.emoji}${persona.name}\n使用 .band off 关闭`, true);
      }
      
      if (subCmd === 'off' || subCmd === '关') {
        const gid = e.group_id.toString();
        let state = bandMode.get(gid);
        if (state) state.enabled = false;
        return sendGroupMsg(ws, e.group_id, "🎸 乐队模式已关闭，恢复正常回复", true);
      }
      
      if (subCmd === 'status' || subCmd === '状态') {
        const gid = e.group_id.toString();
        const state = bandMode.get(gid);
        if (!state || !state.enabled) {
          return sendGroupMsg(ws, e.group_id, "🎸 乐队模式: 未开启", true);
        }
        const current = getCurrentPersona(e.group_id);
        const waiting = getWaitingPersonas(e.group_id);
        return sendGroupMsg(ws, e.group_id, 
          `🎸 乐队模式: 已开启\n` +
          `当前演奏: ${current.emoji}${current.name} (${current.style})\n` +
          `待机成员: ${waiting.map(p => `${p.emoji}${p.name}`).join(' ')}`, true);
      }
      
      // 默认显示帮助
      return sendGroupMsg(ws, e.group_id, 
        `🎸 乐队模式命令:\n` +
        `.band on  - 开启乐队模式\n` +
        `.band off - 关闭乐队模式\n` +
        `.band status - 查看状态\n\n` +
        `开启后，骰娘会轮流以不同人格回复！`, true);
    }

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
}

// 启动配置热重载
watchConfig();
