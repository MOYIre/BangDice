// 无缝兼容插件，现已支持: sealdice
import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";   // ★ 修复：载入绝对路径需要 URL
import seal, { extList } from "./seal-shim.js";

globalThis.seal = seal;
export const pluginCmdTable = [];
export const pluginStatus = new Map(); // 用于跟踪插件启用/禁用状态

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
        const pluginName = path.basename(file, '.js');
        // 设置插件文件名到扩展对象，以便dispatchPlugin可以使用
        ext.pluginFile = pluginName;
        
        // 添加命令到插件文件名的映射，并为每个命令单独存储帮助信息
        for (const name of names) {
          globalThis.commandToPluginMap.set(name, pluginName);
          
          // 为每个命令单独添加到pluginCmdTable
          const cmdHelp = ext.cmdMap[name] && ext.cmdMap[name].help ? ext.cmdMap[name].help.trim() : "无帮助信息";
          pluginCmdTable.push({ names: [name], help: cmdHelp, file: pluginName });
        }
        
        // 同时在pluginStatus中初始化插件状态（如果尚未初始化）
        if (!pluginStatus.has(pluginName)) {
          pluginStatus.set(pluginName, true); // 默认启用
        }
      } catch (err) {
        console.error("插件加载失败:", file, err);
      }
    }
  }

  // 初始化插件状态
  initPluginStatus();
  loadAll();
  fs.watch(dir, { recursive: false }, () => loadAll());

  bot.dispatchPlugin = (text, e, ws, send) => {
    if (typeof text !== "string") return false;
    if (!text.startsWith(".")) return false;

    const stripped = text.slice(1).trim();
    
    // 收集所有匹配的命令，按长度排序（长的在前，更具体）
    const allCommands = [];
    for (const ext of extList) {
      for (const key of Object.keys(ext.cmdMap || {})) {
        if (stripped.startsWith(key)) {
          // 检查插件是否被禁用
          // 基于插件文件名来判断插件状态
          const pluginFile = ext.pluginFile || ext.name || 'unknown'; // 优先使用pluginFile，否则用name
          if (pluginStatus.has(pluginFile) && !pluginStatus.get(pluginFile)) {
            continue; // 插件被禁用，跳过此插件，尝试下一个
          }
          
          allCommands.push({
            ext,
            key,
            cmd: ext.cmdMap[key]
          });
        }
      }
    }
    
    // 按命令键长度排序，长的优先（更具体的命令优先）
    allCommands.sort((a, b) => b.key.length - a.key.length);
    
    for (const { ext, key, cmd } of allCommands) {
      const argv = { args: stripped.slice(key.length).trim().split(/\s+/) };
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
}
