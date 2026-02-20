// 无缝兼容插件，现已支持: sealdice
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";   // ★ 修复：载入绝对路径需要 URL
import seal, { extList } from "./seal-shim.js";

globalThis.seal = seal;
export const pluginCmdTable = [];
export const pluginStatus = new Map(); // 用于跟踪插件启用/禁用状态

// 命令索引：命令名 -> { ext, cmd }
const commandIndex = new Map();
// 命令长度列表（用于快速匹配）
let sortedCommandLengths = [];

// 构建命令索引
function buildCommandIndex() {
  commandIndex.clear();
  sortedCommandLengths.length = 0; // 清空数组
  const lengths = new Set();
  
  for (const ext of extList) {
    const pluginFile = ext.pluginFile || ext.name || 'unknown';
    const isEnabled = pluginStatus.has(pluginFile) ? pluginStatus.get(pluginFile) : true;
    
    if (!isEnabled) continue;
    
    for (const key of Object.keys(ext.cmdMap || {})) {
      commandIndex.set(key, { ext, cmd: ext.cmdMap[key], pluginFile });
      lengths.add(key.length);
    }
  }
  
  // 按长度降序排列
  sortedCommandLengths = Array.from(lengths).sort((a, b) => b - a);
}

export default function loadPlugins(bot, send, ws) {
  const dir = path.join(process.cwd(), "roles", "Plugins");
  if (!fs.existsSync(dir)) return;

  // 初始化插件状态 - 默认所有插件都启用
  function initPluginStatus() {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const pluginName = path.basename(file, '.js');
      pluginStatus.set(pluginName, true); // 默认启用
    }
  }

  async function loadAll() {
    pluginCmdTable.length = 0;
    extList.length = 0;
    
    // 重置命令到插件映射
    globalThis.commandToPluginMap = new Map();

    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      try {
        const full = path.join(dir, file);

        // ★ 修复：Windows 必须转换为 file:// URL
        const url = pathToFileURL(full).href + "?t=" + Date.now();
        await import(url);

        const ext = extList[extList.length - 1];
        if (!ext || !ext.cmdMap) continue;

        const names = Object.keys(ext.cmdMap);
        const pluginFile = path.basename(file, '.js');
        // 设置插件文件名到扩展对象，以便dispatchPlugin可以使用
        ext.pluginFile = pluginFile;
        
        // 添加命令到插件文件名的映射
        for (const name of names) {
          globalThis.commandToPluginMap.set(name, pluginFile);
        }
        
        // 存储插件整体信息，而不是每个命令单独存储
        // 获取插件的名称（如果ext有name属性）或使用文件名
        const pluginDisplayName = ext.name || pluginFile;
        let firstCmdHelp = "无帮助信息";
        for (const name of names) {
          if (ext.cmdMap[name] && ext.cmdMap[name].help) {
            firstCmdHelp = ext.cmdMap[name].help.trim();
            break;
          }
        }
        
        pluginCmdTable.push({ 
          names, 
          help: firstCmdHelp, 
          file: pluginFile,
          displayName: pluginDisplayName,  // 插件的显示名称
          author: ext.author || '未知作者',
          version: ext.version || '未知版本'
        });
        
        // 同时在pluginStatus中初始化插件状态（如果尚未初始化）
        if (!pluginStatus.has(pluginFile)) {
          pluginStatus.set(pluginFile, true); // 默认启用
        }
      } catch (err) {
        console.error("插件加载失败:", file, err);
      }
    }
    
    // 构建命令索引
    buildCommandIndex();
  }

  // 初始化插件状态
  initPluginStatus();
  loadAll();
  fs.watch(dir, { recursive: false }, () => loadAll());

  bot.dispatchPlugin = (text, e, ws, send) => {
    if (typeof text !== "string") return false;
    if (!text.startsWith(".")) return false;

    const stripped = text.slice(1).trim();
    
    // 使用索引快速匹配：按命令长度从长到短尝试
    for (const len of sortedCommandLengths) {
      if (len > stripped.length) continue;
      
      const key = stripped.slice(0, len);
      const entry = commandIndex.get(key);
      
      if (!entry) continue;
      
      const { ext, cmd, pluginFile } = entry;
      
      // 检查插件是否被禁用
      if (pluginStatus.has(pluginFile) && !pluginStatus.get(pluginFile)) {
        continue;
      }
      
      const argv = { args: stripped.slice(len).trim().split(/\s+/) };
      const ctx = {
        send: (msg) => send(ws, e.group_id, msg),
        group_id: e.group_id,
        user_id: e.user_id,
        msg: e,
        ws: ws  // 添加ws连接以支持文件上传
      };
      
      try { 
        const result = cmd.solve(ctx, e, argv);
        // 如果命令被处理（solve函数返回的不是false），返回true
        if (result !== false) {
          return true;
        }
      }
      catch (err) { 
        console.error("插件执行错误:", key, err.message || err); 
        console.error("错误堆栈:", err.stack);
      }
    }
    
    return false;
  };

  bot.getPluginHelp = (name) => {
    for (const p of pluginCmdTable) {
      if (p.names.includes(name)) return p.help || "无帮助信息";
    }
    return "未找到此插件指令";
  };
  
  // 导出重建索引函数，供外部在插件状态变更时调用
  bot.rebuildCommandIndex = buildCommandIndex;
}
