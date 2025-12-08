// 跑团日志记录系统
import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// 游戏日志记录器
class GameLogRecorder {
  constructor() {
    this.logs = {};
    this.logFile = path.join(logDir, 'gamelogs.json');
    this.loadLogs();
  }

  // 加载已有日志
  loadLogs() {
    if (fs.existsSync(this.logFile)) {
      try {
        const data = fs.readFileSync(this.logFile, 'utf8');
        this.logs = JSON.parse(data);
      } catch (e) {
        console.error('加载游戏日志失败:', e.message);
        this.logs = {};
      }
    }
  }

  // 保存日志
  saveLogs() {
    try {
      fs.writeFileSync(this.logFile, JSON.stringify(this.logs, null, 2), 'utf8');
    } catch (e) {
      console.error('保存游戏日志失败:', e.message);
    }
  }

  // 记录事件
  recordEvent(groupId, logName, event) {
    const key = `${groupId}_${logName}`;
    if (!this.logs[key]) this.logs[key] = [];
    
    const timestamp = new Date().toLocaleString();
    const logEntry = {
      time: timestamp,
      type: event.type || 'general',
      user: event.userId,
      message: event.message,
      data: event.data || {}
    };
    
    this.logs[key].push(logEntry);
    this.saveLogs();
  }

  // 获取日志列表
  getLogList(groupId) {
    const logsForGroup = Object.keys(this.logs)
      .filter(key => key.startsWith(`${groupId}_`))
      .map(key => key.split('_')[1]);
    return logsForGroup;
  }

  // 获取日志内容
  getLogContent(groupId, logName, limit = 50) {
    const key = `${groupId}_${logName}`;
    if (!this.logs[key]) return [];
    
    return this.logs[key].slice(-limit);
  }

  // 获取统计信息
  getLogStats(groupId, logName) {
    const key = `${groupId}_${logName}`;
    if (!this.logs[key] || this.logs[key].length === 0) {
      return { total: 0, checks: 0, successes: 0, players: {} };
    }

    let checks = 0;
    let successes = 0;
    const players = {};

    for (const log of this.logs[key]) {
      // 统计检定 - 检查是否包含检定信息（包括类似"D100=63/80 成功"这样的格式）
      const isCheck = log.message.includes('检定') || 
                     /D\d+=\d+\/\d+\s+(成功|失败|大成功|大失败|困难成功|极难成功)/.test(log.message) ||
                     log.message.includes('掷出了') ||
                     log.message.includes('掷出');
      
      if (isCheck) {
        checks++;
        // 检查是否成功
        const isSuccess = log.message.includes('成功') && 
                         !log.message.includes('失败') && 
                         !log.message.includes('大失败');
        if (isSuccess) {
          successes++;
        }
      }

      // 统计玩家活动
      const player = log.user;
      if (!players[player]) {
        players[player] = { total: 0, checks: 0, successes: 0 };
      }
      players[player].total++;

      if (isCheck) {
        players[player].checks++;
        if (isCheck && log.message.includes('成功') && !log.message.includes('失败')) {
          players[player].successes++;
        }
      }
    }

    return {
      total: this.logs[key].length,
      checks,
      successes,
      successRate: checks > 0 ? (successes / checks * 100).toFixed(1) : 0,
      players
    };
  }

  // 清除日志
  clearLog(groupId, logName) {
    const key = `${groupId}_${logName}`;
    if (this.logs[key]) {
      delete this.logs[key];
      this.saveLogs();
      return true;
    }
    return false;
  }

  // 导出日志为文本
  exportLogText(groupId, logName, getPlayerName = null) {
    const logContent = this.getLogContent(groupId, logName, 10000); // 获取全部日志
    if (logContent.length === 0) return null;

    let text = '';

    for (const entry of logContent) {
      // 如果提供了getPlayerName函数，使用玩家昵称，否则使用用户ID
      let playerName = entry.user;
      if (typeof getPlayerName === 'function') {
        // 假设getPlayerName(groupId, userId)格式
        try {
          playerName = getPlayerName(groupId, entry.user) || `玩家${entry.user}`;
        } catch (e) {
          playerName = `玩家${entry.user}`;
        }
      }
      
      // 使用标准格式: 玩家名(用户ID) 时间戳 \n 消息
      text += `${playerName}(${entry.user}) ${entry.time}\n`;
      text += `${entry.message}\n\n`;
    }

    return text;
  }
}

// 创建全局日志记录器实例
const gameLogRecorder = new GameLogRecorder();

export default gameLogRecorder;