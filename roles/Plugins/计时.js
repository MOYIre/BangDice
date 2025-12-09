// ==UserScript==
// @name        恶楼
// @author      御铭茗
// @version     1.0.3
// @description 可以用于跑本时的计时，支持倍速-爱来自铭茗
// @license     Apache-2
// ==/UserScript==

let cmd = seal.ext.newCmdItemInfo()
let ext = seal.ext.find('恶楼');
if (!ext) {
    ext = seal.ext.new('恶楼', '御铭茗', '1.0.3');
    seal.ext.register(ext);
}

// 工具函数
function min2str(min) {
    min = Number(min) || 0
    let d = Math.floor(min / 1440)
    min %= 1440
    let h = Math.floor(min / 60)
    let m = min % 60
    return `${d}天 ${h}时 ${m}分`
}

function parseDate(str) {
    let m = str.match(/(\d+)年(\d+)月(\d+)日(\d+)(点|时)/)
    if (!m) return null
    return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        0, 0
    )
}

function parseOffset(str) {
    let m = str.match(/([\+\-]\d+)(天|小时|时|分钟|分)/)
    if (!m) return 0
    let num = Number(m[1])
    let unit = m[2]
    let map = { '天': 1440, '小时': 60, '时': 60, '分钟': 1, '分': 1 }
    return num * map[unit]
}

// 存储
function getData(key) {
    return {
        start: ext.storageGet(`${key}/start`) || '',
        minutes: Number(ext.storageGet(`${key}/minutes`)) || 0,
        auto: ext.storageGet(`${key}/auto`) || '', // timestamp
        rate: Number(ext.storageGet(`${key}/rate`)) || 1 // 倍率
    }
}
function setData(key, data) {
    ext.storageSet(`${key}/start`, data.start || '')
    ext.storageSet(`${key}/minutes`, String(data.minutes || 0))
    ext.storageSet(`${key}/auto`, data.auto || '')
    ext.storageSet(`${key}/rate`, String(data.rate || 1))
}

cmd.name = '计时'
cmd.help = `
.计时 / .time   恶楼计时器
指令：
  .计时                          查看起始时间/累计时间/当前团内时间
  .计时 设置 XXXX年X月XX日XX点   设定起始时间
  .计时 开始 [倍率]              开始自动计时，可附倍率（如 开始5）
  .计时 暂停                      停止计时并累计
  .计时 状态                      查看当前计时状态
  .计时 清零                      清空所有记录
  .计时 倍率5                     修改默认时间倍率为 5
  .计时 +3小时 / -20分钟          手动调整累计时间
`

cmd.solve = (ctx, msg, argv) => {
    let result = seal.ext.newCmdExecuteResult(true)
    let key = 'cmd/计时' + msg.groupId
    let arg = argv.args.join('') || ''
    let arg0 = argv.args[0] || ''

    // 支持 help 触发：.计时 help / .help 计时
    if (arg0 === 'help' || (arg0 === '计时' && argv.args[1] === 'help')) {
        result.showHelp = true
        return result
    }

    let data = getData(key)

    // 清零
    if (arg === '清零') {
        setData(key, { start: '', minutes: 0, auto: '', rate: 1 })
        seal.replyToSender(ctx, msg, '🐾 所有计时已清零')
        return result
    }

    // 状态
    if (arg === '状态') {
        seal.replyToSender(ctx, msg, data.auto ? `🐾 正在计时中（倍率${data.rate}）` : '🐾 已停止')
        return result
    }

    // 设置起始时间
    if (arg.startsWith('设置')) {
        let timeStr = arg.replace('设置', '').trim()
        let d = parseDate(timeStr)
        if (!d) {
            seal.replyToSender(ctx, msg, '⚠ 时间格式错误，应为“2000年7月18日19点”')
            return result
        }
        data.start = d.toISOString()
        setData(key, data)
        seal.replyToSender(ctx, msg, `🐾 已设定起始时间：${timeStr}`)
        return result
    }

    // 设置倍率
    if (arg.startsWith('倍率')) {
        let r = Number(arg.replace('倍率', '').trim())
        if (!r || r <= 0) {
            seal.replyToSender(ctx, msg, '⚠ 倍率必须为正整数')
            return result
        }
        data.rate = r
        setData(key, data)
        seal.replyToSender(ctx, msg, `🐾 已设定默认倍率为 ${r}`)
        return result
    }

    // 开始自动计时（可带倍率）
    if (arg.startsWith('开始')) {
        if (data.auto) {
            seal.replyToSender(ctx, msg, '⚠ 已在计时中，请先暂停')
            return result
        }
        let r = Number(arg.replace('开始', '').trim())
        if (r && r > 0) data.rate = r
        data.auto = String(Date.now())
        setData(key, data)
        seal.replyToSender(ctx, msg, `🐾 自动计时已开始（倍率${data.rate}）`)
        return result
    }

    // 暂停自动计时
    if (arg === '暂停') {
        if (!data.auto) {
            seal.replyToSender(ctx, msg, '⚠ 当前没有在计时')
            return result
        }
        let delta = Math.floor((Date.now() - Number(data.auto)) / 60000) * data.rate
        data.minutes += delta
        data.auto = ''
        setData(key, data)
        seal.replyToSender(ctx, msg, `🐾 计时停止，累计增加 ${delta} 分钟（倍率${data.rate}）\n当前团内耗时：${min2str(data.minutes)}`)
        return result
    }

    // 手动调整
    if (/^[\+\-]/.test(arg)) {
        let delta = parseOffset(arg)
        if (delta === 0) {
            seal.replyToSender(ctx, msg, '⚠ 时间调整格式错误，应为 +3小时 / -20分钟 这样')
            return result
        }
        data.minutes += delta
        setData(key, data)
        seal.replyToSender(ctx, msg, `🐾 累计时间已调整 ${arg}\n当前团内耗时：${min2str(data.minutes)}`)
        return result
    }

    // 查询
    if (!arg) {
        let base = data.start ? new Date(data.start) : null
        let minutes = data.minutes
        if (data.auto) {
            minutes += Math.floor((Date.now() - Number(data.auto)) / 60000) * data.rate
        }

        let reply = ''
        if (base) {
            let current = new Date(base.getTime() + minutes * 60000)
            reply += `🐾 起始时间：${base.getFullYear()}年${base.getMonth()+1}月${base.getDate()}日${base.getHours()}点\n`
            reply += `⏱ 已累计：${min2str(minutes)}（倍率${data.rate}）\n`
            reply += `🐾 当前团内时间：${current.getFullYear()}年${current.getMonth()+1}月${current.getDate()}日${current.getHours()}点`
        } else {
            reply += `⚠ 尚未设定起始时间\n已累计：${min2str(minutes)}（倍率${data.rate}）`
        }

        seal.replyToSender(ctx, msg, reply)
        return result
    }

    seal.replyToSender(ctx, msg, '无法理解的参数：' + arg)
    return result
}

ext.cmdMap['计时'] = cmd
ext.cmdMap['time'] = cmd
