// ==UserScript==
// @name        定时开团助手Persistent
// @author      铭茗
// @version     2.0.0
// @description 支持分钟数/指定时刻开团，自定义文本，任务持久化，查看和取消
// ==/UserScript==
if (!seal.ext.find("提灯小僧")) {
  const ext = seal.ext.new("提灯小僧", "铭茗", "2.0.0");

  // 任务缓存 [{id, targetTime, text}]
  let raidTasks = [];
  let taskIdCounter = 1;

  // 从存储加载
  function loadTasks() {
    let raw = ext.storageGet("raidTasks");
    if (!raw) return;
    try {
      let arr = JSON.parse(raw);
      let now = Date.now();
      raidTasks = arr.filter((t) => t.targetTime > now);
      // 重新调度
      raidTasks.forEach((t) => {
        scheduleTimer(t);
      });
    } catch (e) {
      console.log("开团任务存储解析失败", e);
    }
  }

  // 保存到存储
  function saveTasks() {
    ext.storageSet("raidTasks", JSON.stringify(raidTasks));
  }

  // 调度任务
  function scheduleTimer(task) {
    let delayMs = task.targetTime - Date.now();
    if (delayMs <= 0) return;
    task.timer = setTimeout(() => {
      seal.replyToSender(task.ctx, task.msg, "[CQ:at,qq=all] " + task.text);
      // 触发后删除
      raidTasks = raidTasks.filter((t) => t.id !== task.id);
      saveTasks();
    }, delayMs);
  }

  // 创建任务
  function createTask(ctx, msg, targetTime, text) {
    let task = {
      id: taskIdCounter++,
      targetTime: targetTime,
      text: text,
      ctx,
      msg,
    };
    scheduleTimer(task);
    raidTasks.push(task);
    saveTasks();
    return task;
  }

  // 开团（分钟数）
  const cmdRaidMinutes = seal.ext.newCmdItemInfo();
  cmdRaidMinutes.name = "开团";
  cmdRaidMinutes.help = ".开团 <分钟数> (可选文本)";
  cmdRaidMinutes.solve = (ctx, msg, cmdArgs) => {
    let minutes = cmdArgs.getArgN(1);
    if (!minutes || isNaN(minutes)) {
      seal.replyToSender(ctx, msg, "用法：.开团 <分钟数> (可选文本)");
      return seal.ext.newCmdExecuteResult(true);
    }
    let target = Date.now() + parseInt(minutes) * 60000;
    let text = cmdArgs.getRestArgsFrom(2);
    if (!text) text = "诸位客官预约的场地都打扫好了，请尽快入座";
    let task = createTask(ctx, msg, target, text);
    seal.replyToSender(ctx, msg, `已设置 ${minutes} 分钟后开团，文本：“${text}”，任务ID:${task.id}`);
    return seal.ext.newCmdExecuteResult(true);
  };

  // 开团时间（HH:mm）
  const cmdRaidTime = seal.ext.newCmdItemInfo();
  cmdRaidTime.name = "开团时间";
  cmdRaidTime.help = ".开团时间 HH:mm (可选文本)";
  cmdRaidTime.solve = (ctx, msg, cmdArgs) => {
    let timeStr = cmdArgs.getArgN(1);
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
      seal.replyToSender(ctx, msg, "用法：.开团时间 HH:mm (可选文本)");
      return seal.ext.newCmdExecuteResult(true);
    }
    let [h, m] = timeStr.split(":").map((x) => parseInt(x));
    let now = new Date();
    let target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    let text = cmdArgs.getRestArgsFrom(2);
    if (!text) text = "诸位客官预约的场地都打扫好了，请尽快入座";
    let task = createTask(ctx, msg, target.getTime(), text);
    seal.replyToSender(ctx, msg, `已设置 ${timeStr} 开团，文本：“${text}”，任务ID:${task.id}`);
    return seal.ext.newCmdExecuteResult(true);
  };

  // 取消任务
  const cmdRaidCancel = seal.ext.newCmdItemInfo();
  cmdRaidCancel.name = "取消开团";
  cmdRaidCancel.help = ".取消开团 (任务ID/空=取消全部)";
  cmdRaidCancel.solve = (ctx, msg, cmdArgs) => {
    let id = cmdArgs.getArgN(1);
    if (!id) {
      raidTasks.forEach((t) => clearTimeout(t.timer));
      raidTasks = [];
      saveTasks();
      seal.replyToSender(ctx, msg, "所有任务已取消");
    } else {
      let num = parseInt(id);
      let idx = raidTasks.findIndex((t) => t.id === num);
      if (idx === -1) {
        seal.replyToSender(ctx, msg, "未找到该任务ID");
      } else {
        clearTimeout(raidTasks[idx].timer);
        let removed = raidTasks.splice(idx, 1)[0];
        saveTasks();
        seal.replyToSender(ctx, msg, `已取消任务 ${removed.id} 文本：“${removed.text}”`);
      }
    }
    return seal.ext.newCmdExecuteResult(true);
  };

  // 查看任务列表
  const cmdRaidList = seal.ext.newCmdItemInfo();
  cmdRaidList.name = "开团列表";
  cmdRaidList.help = "查看已设置任务";
  cmdRaidList.solve = (ctx, msg, cmdArgs) => {
    if (raidTasks.length === 0) {
      seal.replyToSender(ctx, msg, "当前没有任务");
    } else {
      let now = Date.now();
      let list = raidTasks
        .map((t) => {
          let remain = Math.floor((t.targetTime - now) / 1000);
          let min = Math.floor(remain / 60);
          let sec = remain % 60;
          return `ID:${t.id} 时间:${new Date(t.targetTime).toLocaleString()} 剩余:${min}分${sec}秒 文本:“${t.text}”`;
        })
        .join("\n");
      seal.replyToSender(ctx, msg, list);
    }
    return seal.ext.newCmdExecuteResult(true);
  };

  // 注册命令
  ext.cmdMap["开团"] = cmdRaidMinutes;
  ext.cmdMap["开团时间"] = cmdRaidTime;
  ext.cmdMap["取消开团"] = cmdRaidCancel;
  ext.cmdMap["开团列表"] = cmdRaidList;

  // 注册扩展
  seal.ext.register(ext);

  // 启动时加载
  loadTasks();
}
