# 冒险岛

十二周学习计划的打卡网页，可以装到手机桌面使用。

- **打开：** https://derekdye6671-dx.github.io/quest-island/
- **装到手机桌面：** 安卓 Chrome 点右上角菜单 →「添加到主屏幕」或「安装应用」；iPhone Safari 点分享 →「添加到主屏幕」
- **数据存在哪：** 打卡、金币、衣橱都只存在你自己手机的浏览器里，不上传。换手机或清理浏览器前，先点「💾 备份」导出文件
- **验收：** 点「提交验收」，把自动复制的申请发给 Claude；Claude 验收后更新 `verified.json`，回到网页点「🔄 刷新验收」
- **同步 Grok 版：** 点「⬇ 导出给 Grok」，得到 `quest12-checkins.json`

## 文件

| 文件 | 内容 | 谁改 |
| --- | --- | --- |
| `index.html` | 网页本身 | Claude |
| `plan.json` | 12 周计划 | Claude |
| `verified.json` | 验收清单：任务编号 + 一句结论，不含个人数据 | Claude |
| `manifest.webmanifest`、`sw.js`、`icons/` | 让网页能装到桌面、断网也能打开 | Claude |
