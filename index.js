import fs from "fs";
import path from "path";
import readline from "readline";
import WebSocket from "ws";
import http from "http";
import { Server } from "socket.io";
import loadPlugins, { pluginCmdTable, pluginStatus } from "./src/core/plugin-loader.js";
import { renderKey } from "./src/utils/templates.js";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rolePluginDir = path.join(process.cwd(), "roles", "Plugins");
if (!fs.existsSync(rolePluginDir)) fs.mkdirSync(rolePluginDir, { recursive: true });

// 存储消息和状态
let activeGroups = new Set();
let messageCounter = 0;
let playerData = {};

// 修改日志函数，将日志发送到WebUI
function log(msg, type = 'info') {
  const time = new Date();
  const stamp = time.toISOString().replace("T", " ").split(".")[0];
  const day = time.toISOString().split("T")[0];
  const line = `[${stamp}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(logDir, `${day}.log`), line + "\n", "utf8"); } catch {}
  
  // 如果ioRef存在，发送日志到WebUI
  if (ioRef) {
    ioRef.emit('log_message', {
      timestamp: time.toLocaleString(),
      message: msg,
      type: type
    });
  }
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

// 声明全局WebSocket实例
let ws;

// 声明io引用以便在全局作用域中使用
let ioRef = null;

// 创建HTTP服务器和Socket.IO
const server = http.createServer();

// 处理API请求
server.on('request', (req, res) => {
  // 如果是socket.io的请求，交给socket.io处理
  if (req.url.startsWith('/socket.io/')) {
    // 让socket.io处理此请求，不发送响应
    return;
  }
  
  // 处理API请求
  if (req.url.startsWith('/api/')) {
    handleAPIRequest(req, res);
    return;
  }
  
  if (req.url === '/' || req.url.startsWith('/webui') || req.url.startsWith('/dist') || req.url.startsWith('/assets/') || req.url === '/favicon.ico' || req.url === '/favicon.svg') {
    let filePath = req.url;
    if (filePath === '/') {
      filePath = '/webui/index.html'; // 默认加载webui/index.html
    } else if (filePath.startsWith('/webui')) {
      filePath = './webui' + filePath.substring(6); // 将/webui映射到./webui
    } else if (filePath.startsWith('/dist')) {
      filePath = '.' + filePath;
    } else if (filePath === '/favicon.ico' || filePath === '/favicon.svg') {
      filePath = './webui/favicon.ico'; // 从webui目录提供图标
    }
    
    const absolutePath = path.join(process.cwd(), filePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.woff': 'application/font-woff',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'application/font-otf'
    }[ext] || 'application/octet-stream';
    
    fs.readFile(absolutePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // 如果在dist中找不到文件，尝试从webui目录提供
          if (filePath.includes('/dist/')) {
            const webuiPath = path.join(process.cwd(), filePath.replace('/dist', '/webui'));
            fs.readFile(webuiPath, (err2, content2) => {
              if (err2) {
                res.writeHead(404);
                res.end('404 Not Found');
              } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content2, 'utf-8');
              }
            });
          } else {
            res.writeHead(404);
            res.end('404 Not Found');
          }
        } else {
          res.writeHead(500);
          res.end('Server Error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  } else {
    res.writeHead(404);
    res.end('404 Not Found');
  }
});



// 启动Web服务器
let WEB_PORT = 4412;

function startServer(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    
    // 复制Socket.IO配置
    const io = new Server(srv, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    // 保存io引用，以便在全局作用域中使用
    ioRef = io;

    // Socket.IO事件处理复制到新服务器...
    io.on('connection', (socket) => {
      log('WebUI 客户端已连接: ' + socket.id);
      
      // 发送初始状态
      socket.emit('status_update', {
        activeGroups: activeGroups.size,
        activePlugins: pluginCmdTable.length,
        connected: ws && ws.readyState === WebSocket.OPEN
      });
      
      // 发送当前配置
      socket.emit('config_update', {
        wsUrl: config.ws,
        accessToken: config.token
      });
      
      // 请求发送命令
      socket.on('send_command', (data) => {
        log(`通过WebUI发送命令: ${data.command}`);
      });
      
      // 更新配置
      socket.on('update_config', (data) => {
        config.ws = data.wsUrl;
        config.token = data.accessToken;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        log('配置已更新');
        
        // 通知所有客户端配置已更新
        if (ioRef) {
          ioRef.emit('config_update', {
            wsUrl: config.ws,
            accessToken: config.token
          });
        }
      });
      
      // 连接 OneBot
      socket.on('connect_onebot', (data) => {
        // 如果已有连接，先关闭
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        
        // 更新配置
        config.ws = data.wsUrl;
        config.token = data.accessToken;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        
        // 创建新连接
        ws = new WebSocket(config.ws, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
        
        ws.on("open", () => {
          log("通过WebUI已连接: " + config.ws);
          if (ioRef) {
            ioRef.emit('onebot_status_update', { connected: true });
            ioRef.emit('status_update', {
              activeGroups: activeGroups.size,
              activePlugins: pluginCmdTable.length,
              connected: true
            });
          }
        });
        
        ws.on("close", () => {
          log("OneBot连接已关闭");
          if (ioRef) {
            ioRef.emit('onebot_status_update', { connected: false });
            ioRef.emit('status_update', {
              activeGroups: activeGroups.size,
              activePlugins: pluginCmdTable.length,
              connected: false
            });
          }
        });
        
        ws.on("error", err => {
          log("OneBot连接错误: " + err);
          if (ioRef) {
            ioRef.emit('onebot_status_update', { connected: false });
          }
        });
        
        ws.on("message", raw => {
          let e;
          try { e = JSON.parse(raw.toString()); } catch { return; }
          if (e.post_type !== "message" || e.message_type !== "group") return;

          let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
          if (!text) return;

          // 记录收到的消息
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
          if (ioRef) {
            ioRef.emit('status_update', {
              activeGroups: activeGroups.size,
              activePlugins: pluginCmdTable.length,
              messageCount: messageCounter
            });
          }

          text = text.replace(/^\.([a-zA-Z])(\d)/, ".$1 $2");
          text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

          // 记录活跃群组
          activeGroups.add(e.group_id);

          if (text.startsWith(".help")) {
            const name = text.slice(5).trim();
            if (name) {
              // 查找插件帮助信息
              let helpText = "未找到此插件指令";
              for (const p of pluginCmdTable) {
                if (p.names.includes(name)) {
                  helpText = p.help || "无帮助信息";
                  break;
                }
              }
              sendGroupMsg(ws, e.group_id, helpText);
            } else {
              // 计算最长命令名宽度（兼容中文）
              const getMaxWidth = (str) => [...str].length;
              const maxCmdWidth = Math.max(...pluginCmdTable.map(p => getMaxWidth(p.names.join("/"))));
              
              // 生成命令行（简洁格式）
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
      });
      
      // 断开 OneBot 连接
      socket.on('disconnect_onebot', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        log('通过WebUI断开OneBot连接');
      });
      
      // 获取配置
      socket.on('get_config', () => {
        socket.emit('config_update', {
          wsUrl: config.ws,
          accessToken: config.token
        });
      });
      
      // 获取插件列表
      socket.on('get_plugins', () => {
        const plugins = pluginCmdTable.map(p => ({
          name: p.names[0],
          command: p.names[0],
          description: p.help || '暂无描述',
          author: '铭茗',  // 使用统一的作者名
          enabled: true
        }));
        
        // 添加内置插件信息
        plugins.push({
          name: 'log',
          command: 'log',
          description: '跑团日志记录功能',
          author: '铭茗',
          enabled: true
        });
        
        socket.emit('plugins_list', plugins);
      });
      
      // 获取角色列表
      socket.on('get_players', () => {
        socket.emit('players_list', playerData);
      });
      
      // 插件操作
      // 插件操作
      socket.on('plugin_action', (data) => {
        log(`插件操作: ${data.action} ${data.plugin}`);
      });
      
      // 获取历史日志
      socket.on('get_logs', () => {
        // 读取最近的日志文件并发送给客户端
        try {
          const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log')).sort().reverse();
          if (logFiles.length > 0) {
            const latestLogFile = logFiles[0]; // 获取最新的日志文件
            const logContent = fs.readFileSync(path.join(logDir, latestLogFile), 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim() !== '').slice(-50); // 获取最后50行
            
            logLines.forEach(line => {
              if (line.trim() !== '') {
                // 解析日志行 [timestamp] message
                const match = line.match(/^\[([^\]]+)\]\s+(.*)/);
                if (match) {
                  const timestamp = match[1];
                  const message = match[2];
                  const type = message.includes('错误') || message.includes('error') || message.includes('fail') ? 'error' : 
                              message.includes('成功') || message.includes('success') || message.includes('connect') ? 'success' : 'info';
                  
                  socket.emit('log_message', {
                    timestamp: timestamp,
                    message: message,
                    type: type
                  });
                }
              }
            });
          }
        } catch (error) {
          log(`读取历史日志失败: ${error.message}`, 'error');
        }
      });
      
      socket.on('disconnect', () => {
        log('WebUI 客户端断开连接: ' + socket.id);
      });
    });

    srv.on('request', (req, res) => {
      // 如果是socket.io的请求，交给socket.io处理
      if (req.url.startsWith('/socket.io/')) {
        // 让socket.io处理此请求，不发送响应
        return;
      }
      
      // 处理API请求
      if (req.url.startsWith('/api/')) {
        handleAPIRequest(req, res);
        return;
      }
      
      if (req.url === '/' || req.url.startsWith('/webui') || req.url.startsWith('/dist') || req.url.startsWith('/assets/') || req.url === '/favicon.ico' || req.url === '/favicon.svg') {
        let filePath = req.url;
        if (filePath === '/') {
          filePath = '/webui/index.html'; // 默认加载webui/index.html
        } else if (filePath.startsWith('/webui')) {
          filePath = './webui' + filePath.substring(6); // 将/webui映射到./webui
        } else if (filePath.startsWith('/dist')) {
          filePath = '.' + filePath;
        } else if (filePath === '/favicon.ico' || filePath === '/favicon.svg') {
          filePath = './webui/favicon.ico'; // 从webui目录提供图标
        }
        
        const absolutePath = path.join(process.cwd(), filePath);
        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.wav': 'audio/wav',
          '.mp4': 'video/mp4',
          '.woff': 'application/font-woff',
          '.ttf': 'application/font-ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.otf': 'application/font-otf'
        }[ext] || 'application/octet-stream';
        
        fs.readFile(absolutePath, (err, content) => {
          if (err) {
            if (err.code === 'ENOENT') {
              // 如果在dist中找不到文件，尝试从webui目录提供
              if (filePath.includes('/dist/')) {
                const webuiPath = path.join(process.cwd(), filePath.replace('/dist', '/webui'));
                fs.readFile(webuiPath, (err2, content2) => {
                  if (err2) {
                    res.writeHead(404);
                    res.end('404 Not Found');
                  } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(content2, 'utf-8');
                  }
                });
              } else {
                res.writeHead(404);
                res.end('404 Not Found');
              }
            } else {
              res.writeHead(500);
              res.end('Server Error');
            }
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
          }
        });
      } else {
        res.writeHead(404);
        res.end('404 Not Found');
      }
    });

    srv.listen(port, () => {
      log(`WebUI 服务器已在端口 ${port} 上启动`);
      log(`请访问 http://localhost:${port} 查看管理界面`);
      resolve(srv);
    });

    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(err);
      } else {
        log(`服务器错误: ${err}`);
        reject(err);
      }
    });
  });
}

async function startServerWithFallback() {
  try {
    await startServer(WEB_PORT);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      log(`端口 ${WEB_PORT} 已被占用，请输入新的端口号 (建议范围: 4413-4500): `);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const newPort = await new Promise(res => rl.question(`端口 ${WEB_PORT} 已被占用，请输入新端口号 (4413-4500): `, ans => res(Number(ans.trim()))));
      rl.close();
      
      if (newPort >= 4413 && newPort <= 4500) {
        WEB_PORT = newPort;
        await startServer(WEB_PORT);
      } else {
        log('输入的端口号不在建议范围内，使用默认端口4413');
        WEB_PORT = 4413;
        await startServer(WEB_PORT);
      }
    } else {
      log(`服务器启动失败: ${err}`);
    }
  }
}

startServerWithFallback();

ws = new WebSocket(config.ws, config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {});
ws.on("open", () => {
  log("已连接: " + config.ws);
  // 通知WebUI连接状态
  if (ioRef) {
    ioRef.emit('status_update', {
      activeGroups: activeGroups.size,
      activePlugins: pluginCmdTable.length,
      connected: true
    });
  }
});
ws.on("close", () => {
  log("连接已关闭");
  // 通知WebUI连接状态
  if (ioRef) {
    ioRef.emit('status_update', {
      activeGroups: activeGroups.size,
      activePlugins: pluginCmdTable.length,
      connected: false
    });
  }
});
ws.on("error", err => log("WebSocket 错误: " + err));

function handleAPIRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace('/api', '').replace(/^\/+/, '');
  
  // 已发送响应标志
  let responseSent = false;
  
  // 设置CORS头部
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    if (!responseSent) {
      res.writeHead(200);
      res.end();
      responseSent = true;
    }
    return;
  }
  
  switch(route) {
    case 'status':
      if (req.method === 'GET') {
        if (!responseSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            activeGroups: activeGroups.size,
            activePlugins: pluginCmdTable.length,
            connected: ws && ws.readyState === WebSocket.OPEN,
            messageCount: messageCounter
          }));
          responseSent = true;
        }
      } else {
        if (!responseSent) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSent = true;
        }
      }
      break;
      
    case 'config':
      if (req.method === 'GET') {
        if (!responseSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            wsUrl: config.ws,
            accessToken: config.token
          }));
          responseSent = true;
        }
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          if (chunk) body += chunk.toString();
        });
        req.on('end', () => {
          if (responseSent) return; // 防止重复响应
          
          try {
            const data = JSON.parse(body);
            config.ws = data.wsUrl;
            config.token = data.accessToken;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            responseSent = true;
          } catch (e) {
            if (!responseSent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              responseSent = true;
            }
          }
        });
        // 添加错误处理，防止请求出错时没有响应
        req.on('error', () => {
          if (!responseSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request error' }));
            responseSent = true;
          }
        });
      } else {
        if (!responseSent) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSent = true;
        }
      }
      break;
      
    case 'plugins':
      if (req.method === 'GET') {
        if (!responseSent) {
          const plugins = pluginCmdTable.map(p => {
            // 从插件文件名获取插件状态
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
          
          // 添加内置插件信息
          plugins.push({
            name: 'log',
            command: 'log',
            description: '跑团日志记录功能',
            author: '铭茗',
            enabled: pluginStatus.has('log') ? pluginStatus.get('log') : true
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(plugins));
          responseSent = true;
        }
      } else if (req.method === 'POST') {
        // 处理插件启用/禁用
        let body = '';
        req.on('data', chunk => {
          if (chunk) body += chunk.toString();
        });
        req.on('end', () => {
          if (responseSent) return; // 防止重复响应
          
          try {
            const data = JSON.parse(body);
            const { plugin, action } = data;
            
            if (!plugin || !action) {
              if (!responseSent) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Missing plugin name or action' }));
                responseSent = true;
              }
              return;
            }
            
            if (action !== 'enable' && action !== 'disable') {
              if (!responseSent) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid action. Use "enable" or "disable"' }));
                responseSent = true;
              }
              return;
            }
            
            log(`插件操作: ${action} ${plugin}`);
            
            // 需要将命令名转换为插件文件名
            let pluginFileToToggle = plugin;
            
            // 从全局命令到插件映射中查找
            if (globalThis.commandToPluginMap && globalThis.commandToPluginMap.has(plugin)) {
              pluginFileToToggle = globalThis.commandToPluginMap.get(plugin);
            } else {
              // 如果没有找到，尝试通过pluginCmdTable查找
              for (const p of pluginCmdTable) {
                if (p.names.includes(plugin)) {
                  pluginFileToToggle = p.file || plugin;
                  break;
                }
              }
            }
            
            // 实际更新插件状态
            if (typeof pluginStatus !== 'undefined') {
              const isEnabled = action === 'enable';
              pluginStatus.set(pluginFileToToggle, isEnabled);
              
              // 注意：不再重新加载插件，因为插件分发逻辑会基于pluginStatus检查插件是否启用
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: `Plugin ${plugin} ${action === 'enable' ? 'enabled' : 'disabled'} successfully` 
            }));
            responseSent = true;
            
          } catch (e) {
            if (!responseSent) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
              responseSent = true;
            }
          }
        });
        // 添加错误处理，防止请求出错时没有响应
        req.on('error', () => {
          if (!responseSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request error' }));
            responseSent = true;
          }
        });
      } else {
        if (!responseSent) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSent = true;
        }
      }
      break;
      
    case 'logs':
      if (req.method === 'GET') {
        if (!responseSent) {
          // 获取日志文件列表
          const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log')).sort().reverse();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ logs: logFiles }));
          responseSent = true;
        }
      } else {
        if (!responseSent) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSent = true;
        }
      }
      break;
      
    case 'send-command':
      let responseSentSC = false; // 为send-command端点单独设置标志
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          if (chunk) body += chunk.toString();
        });
        req.on('end', () => {
          if (responseSentSC) return; // 防止重复响应
          
          try {
            const data = JSON.parse(body);
            const command = data.command;
            
            if (command) {
              log(`通过API发送命令: ${command}`);
              // 这里可以添加实际发送命令的逻辑
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, command }));
              responseSentSC = true;
            } else {
              if (!responseSentSC) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Command is required' }));
                responseSentSC = true;
              }
            }
          } catch (e) {
            if (!responseSentSC) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              responseSentSC = true;
            }
          }
        });
        // 添加错误处理，防止请求出错时没有响应
        req.on('error', () => {
          if (!responseSentSC) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request error' }));
            responseSentSC = true;
          }
        });
      } else {
        if (!responseSentSC) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSentSC = true;
        }
      }
      break;
      
    case 'connect':
      let responseSentConn = false; // 为connect端点单独设置标志
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          if (chunk) body += chunk.toString();
        });
        req.on('end', () => {
          if (responseSentConn) return; // 防止重复响应
          
          try {
            const data = JSON.parse(body);
            const wsUrl = data.wsUrl || config.ws;
            const accessToken = data.accessToken || config.token;
            
            // 如果已有连接，先关闭
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            
            // 更新配置
            config.ws = wsUrl;
            config.token = accessToken;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
            
            // 创建新连接并赋值给全局ws变量
            ws = new WebSocket(wsUrl, accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {});
            
            ws.on("open", () => {
              log("通过API已连接: " + wsUrl);
              // 通知WebUI连接状态
              if (ioRef) {
                ioRef.emit('status_update', {
                  activeGroups: activeGroups.size,
                  activePlugins: pluginCmdTable.length,
                  connected: true
                });
              }
              
              if (!responseSentConn) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Connected successfully' }));
                responseSentConn = true;
              }
            });
            
            ws.on("error", err => {
              log("API连接错误: " + err);
              if (!responseSentConn) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
                responseSentConn = true;
              }
            });
            
            ws.on("close", () => {
              log("API连接已关闭");
              if (ioRef) {
                ioRef.emit('status_update', {
                  activeGroups: activeGroups.size,
                  activePlugins: pluginCmdTable.length,
                  connected: false
                });
              }
            });
            
            ws.on("message", raw => {
              let e;
              try { e = JSON.parse(raw.toString()); } catch { return; }
              if (e.post_type !== "message" || e.message_type !== "group") return;

              let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
              if (!text) return;

              // 记录收到的消息
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
              if (ioRef) {
                ioRef.emit('status_update', {
                  activeGroups: activeGroups.size,
                  activePlugins: pluginCmdTable.length,
                  messageCount: messageCounter
                });
              }

              text = text.replace(/^\.([a-zA-Z])(\d)/, ".$1 $2");
text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

              // 记录活跃群组
              activeGroups.add(e.group_id);

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
            
          } catch (e) {
            if (!responseSentConn) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON or connection data' }));
              responseSentConn = true;
            }
          }
        });
        // 添加错误处理，防止请求出错时没有响应
        req.on('error', () => {
          if (!responseSentConn) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Request error' }));
            responseSentConn = true;
          }
        });
      } else {
        if (!responseSentConn) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSentConn = true;
        }
      }
      break;
      
    case 'disconnect':
      if (req.method === 'POST') {
        if (!responseSent) {
          try {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            log('通过API断开连接');
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Disconnected successfully' }));
            responseSent = true;
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
            responseSent = true;
          }
        }
      } else {
        if (!responseSent) {
          res.writeHead(405);
          res.end('Method not allowed');
          responseSent = true;
        }
      }
      break;
      
    default:
      if (!responseSent) {
        res.writeHead(404);
        res.end('API endpoint not found');
        responseSent = true;
      }
  }
}

function sendGroupMsg(ws, group_id, text) {
  try { 
    ws.send(JSON.stringify({ action: "send_group_msg", params: { group_id, message: text } })); 
    
    // 记录发送的消息到WebUI
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

const bot = {};
loadPlugins(bot, sendGroupMsg, ws);

ws.on("message", raw => {
  let e;
  try { e = JSON.parse(raw.toString()); } catch { return; }
  if (e.post_type !== "message" || e.message_type !== "group") return;

  let text = (e.message || []).map(i => i.data?.text || "").join("").trim();
  if (!text) return;

  // 记录收到的消息
  // 注意：io可能未定义，因为服务器可能在另一个端口启动
  // 我们先保留全局处理逻辑，但需要确保在服务器启动后能收到消息
  
  // 发送到所有Socket.IO客户端（如果存在）
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
  
  // 发送状态更新
  if (ioRef) {
    ioRef.emit('status_update', {
      activeGroups: activeGroups.size,
      activePlugins: pluginCmdTable.length,
      messageCount: messageCounter
    });
  }

  text = text.replace(/^\.([a-zA-Z])(\d)/, ".$1 $2");
text = text.replace(/^\.([^\s]+)/, (m,a)=>"." + a.toLowerCase());

  // 记录活跃群组
  activeGroups.add(e.group_id);

if (text.startsWith(".help")) {
  const name = text.slice(5).trim();
  if (name) {
    // 查找插件帮助信息
    let helpText = "未找到此插件指令";
    for (const p of pluginCmdTable) {
      if (p.names.includes(name)) {
        helpText = p.help || "无帮助信息";
        break;
      }
    }
    sendGroupMsg(ws, e.group_id, helpText);
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
