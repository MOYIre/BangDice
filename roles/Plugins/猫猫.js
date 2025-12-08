// ==UserScript==
// @name       猫舍
// @author      御铭茗
// @version     1.0.4
// @description 输入 .猫猫 即可直接发送一张猫猫图片 -爱来自铭茗
// @license     Apache-2
// ==/UserScript==

let ext = seal.ext.find('猫猫图鉴')
if (!ext) {
  ext = seal.ext.new('猫舍', '御铭茗', '1.0.4')
  seal.ext.register(ext)
}

let cmd = seal.ext.newCmdItemInfo()
cmd.name = '猫猫'
cmd.help = '输入 .猫猫 随机获得一张猫猫图片'

cmd.solve = async (ctx, msg, argv) => {
  let result = seal.ext.newCmdExecuteResult(true)

  try {
    let response = await fetch('https://api.thecatapi.com/v1/images/search')
    let data = await response.json()
    if (Array.isArray(data) && data.length > 0 && data[0].url) {
      let url = data[0].url
      let cq = `[CQ:image,file=${url}]`
      result.showTips = false
      seal.replyToSender(ctx, msg, cq)
    } else {
      seal.replyToSender(ctx, msg, '喵……图片没找到，可能是落在哪里了')
    }
  } catch (e) {
    seal.replyToSender(ctx, msg, '喵……出了一点小问题')
  }

  return result
}

ext.cmdMap['猫猫'] = cmd
