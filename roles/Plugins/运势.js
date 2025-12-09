// ==UserScript==
// @name        若麦运势
// @author      铭茗
// @version     1.1.1
// @description 若麦每日占卜运势
// @license     Apache-2
// ==/UserScript==

let cmd = seal.ext.newCmdItemInfo()
let ext = seal.ext.find('若麦运势')
if (!ext) {
  ext = seal.ext.new('Avemujica运势', '铭茗', '1.1.1')
  seal.ext.register(ext)
}

function getTodaySeed(userId) {
  let now = new Date()
  let dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  let str = userId + dateKey
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash
}

function randomBySeed(seed, max) {
  let x = Math.sin(seed + 1) * 10000
  let frac = x - Math.floor(x)   // 保证 0 <= frac < 1
  return Math.floor(frac * max)
}

cmd.name = '运势'
cmd.help = `
.运势 / .fortune
由若麦为你卜算今日运势（每日固定，不会变化）
`

cmd.solve = (ctx, msg, argv) => {
  let result = seal.ext.newCmdExecuteResult(true)

  let seed = getTodaySeed(msg.sender.userId)
  let fortunes = [
    { name: '大吉', tip: '今天福气满满哦~无论做什么都顺风顺水！' },
    { name: '中吉', tip: '运气不错呢，保持心态，会有小惊喜~' },
    { name: '小吉', tip: '有点小幸运呢，记得抓住机会！' },
    { name: '吉',   tip: '平平顺顺的一天呢，好好休息也不错~' },
    { name: '半吉', tip: '有喜也有忧呢，记得小心稳重行事~' },
    { name: '末吉', tip: '前路有点坎坷呢，但别灰心，慢慢走就好。' },
    { name: '凶',   tip: '今天不太顺呢，适合低调一点，别冒进。' },
    { name: '大凶', tip: '呜呜…今天诸事不宜，抱抱自己，早点休息吧。' }
  ]

  let idx = randomBySeed(seed, fortunes.length)
  let fortune = fortunes[idx]

  let reply = `🐾 若麦为你翻了今日的签：\n 【${fortune.name}】\n ${fortune.tip}`
  seal.replyToSender(ctx, msg, reply)

  return result
}

ext.cmdMap['运势'] = cmd
ext.cmdMap['fortune'] = cmd
