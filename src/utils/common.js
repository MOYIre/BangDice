/**
 * 通用工具函数
 * 包含项目中常用的公共功能
 */

import fs from 'fs';
import path from 'path';

// 创建目录的公共函数（同步版本）
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 创建目录的公共函数（异步版本）
export async function ensureDirAsync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }
}

// 获取日志目录路径
export function getLogDir() {
  return path.join(process.cwd(), 'logs');
}

// 获取角色目录路径
export function getAttrDir() {
  return path.join(process.cwd(), 'roles');
}

// 获取玩家名称（优先使用昵称，否则使用用户ID）
export function getPlayerName(playerNames, groupId, userId) {
  const key = `${groupId}_${userId}`;
  return playerNames[key] || `玩家${userId}`;
}

// 安全的文件读取函数（同步版本）
export function safeReadFile(filePath, defaultValue = null) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return defaultValue;
  } catch (e) {
    console.error(`读取文件失败: ${filePath}`, e.message);
    return defaultValue;
  }
}

// 安全的文件读取函数（异步版本）
export async function safeReadFileAsync(filePath, defaultValue = null) {
  try {
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(data);
    }
    return defaultValue;
  } catch (e) {
    console.error(`读取文件失败: ${filePath}`, e.message);
    return defaultValue;
  }
}

// 安全的文件写入函数（同步版本）
export function safeWriteFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入文件失败: ${filePath}`, e.message);
    return false;
  }
}

// 安全的文件写入函数（异步版本）
export async function safeWriteFileAsync(filePath, data) {
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入文件失败: ${filePath}`, e.message);
    return false;
  }
}

// 防止路径遍历的安全路径解析函数
export function safePathJoin(basePath, relativePath) {
  // 规范化路径
  const normalizedPath = path.normalize(relativePath);
  
  // 检查是否包含路径遍历序列
  if (normalizedPath.includes('../') || normalizedPath.startsWith('..')) {
    throw new Error(`Invalid path: Path traversal detected in ${relativePath}`);
  }
  
  // 确保结果路径在基础路径内
  const fullPath = path.join(basePath, normalizedPath);
  const resolvedBase = path.resolve(basePath);
  const resolvedFull = path.resolve(fullPath);
  
  if (!resolvedFull.startsWith(resolvedBase + path.sep) && resolvedFull !== resolvedBase) {
    throw new Error(`Invalid path: Path is outside base directory ${basePath}`);
  }
  
  return fullPath;
}

// 验证用户输入的函数
export function validateInput(input, type = 'string') {
  if (input === null || input === undefined) {
    return false;
  }
  
  switch (type) {
    case 'string':
      if (typeof input !== 'string') return false;
      // 检查是否包含危险字符
      if (/[<>'"&]/.test(input)) return false;
      // 检查长度
      if (input.length > 1000) return false;
      break;
    case 'number':
      if (typeof input !== 'number' || isNaN(input)) return false;
      break;
    case 'integer':
      if (!Number.isInteger(input)) return false;
      break;
    case 'id': // 用于验证用户ID、群组ID等
      if (typeof input !== 'string' && typeof input !== 'number') return false;
      // 转换为字符串进行验证
      const idStr = String(input);
      // 只允许数字，且长度在合理范围内
      if (!/^\d{1,20}$/.test(idStr)) return false;
      break;
    default:
      return true;
  }
  
  return true;
}

// 清理用户输入，移除潜在危险字符
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  // 移除或转义潜在的危险字符
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/&/g, '&amp;');
}