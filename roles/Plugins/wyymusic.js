// ==UserScript==
// @name       鬼灵歌姬
// @author      铭茗
// @version     1.0.3
// @description 网易云点歌，返回能直接播放的音乐卡片，可用".网易云 <歌名 (作者)>"
// ==/UserScript==
if (!seal.ext.find("music")) {
  const ext = seal.ext.new("鬼灵歌伎", "原作星尘（铭茗换源）", "1.0.3");

  // 网易云点歌命令
  const cmdCloudMusic = seal.ext.newCmdItemInfo();
  cmdCloudMusic.name = "网易云";
  cmdCloudMusic.help =
    "网易云点歌，可用.网易云 <歌名 (作者)> 作者可以加也可以不加";
  cmdCloudMusic.solve = (ctx, msg, cmdArgs) => {
    let val = cmdArgs.getArgN(1);
    switch (val) {
      case "help": {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        if (!val) {
          seal.replyToSender(ctx, msg, `要输入歌名啊...`);
        }
        let musicName = val;
        let url = "https://163api.qijieya.cn/cloudsearch?keywords=" + musicName;
        fetch(url)
          .then((response) => {
            if (response.ok) {
              return response.text();
            } else {
              console.log(response.status);
              console.log("网易云音乐api失效！");
            }
          })
          .then((data) => {
            let musicJson = JSON.parse(data);
            if (musicJson["result"]["songCount"] == 0) {
              seal.replyToSender(ctx, msg, "没找到这首歌...");
            }
            let musicId = musicJson["result"]["songs"]["0"]["id"];
            let messageRet = "[CQ:music,type=163,id=" + musicId + "]";
            seal.replyToSender(ctx, msg, messageRet);
          })
          .catch((error) => {
            console.log("网易云音乐api请求错误！错误原因：" + error);
          });
        return seal.ext.newCmdExecuteResult(true);
      }
    }
  };

  // 注册命令
  ext.cmdMap["网易云"] = cmdCloudMusic;

  // 注册扩展
  seal.ext.register(ext);
}
