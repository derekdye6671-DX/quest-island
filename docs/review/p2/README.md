# P2：冒险章节与反馈（等待 Claude 审核）

独立基线：正式 main `dbbd620`（P0）。不包含 P1。审核时分别对 main 比较，不合并线上。

## 修改文件

应用仅修改 `index.html`；本目录包含说明、前后截图和测试结果。

- 地图改为原生 details/summary 章节：当前周默认展开，其他周压缩为主题、日期、交付与真实完成数量；全部原始任务和每日步骤仍可展开。
- `.past` 仅表示时间已过去；`.completed` 和“已完成”严格使用原有 `cnt === req.length`。过去未做满显示“已结束 · 完成 x/y”。Boss 标记仍只在 4/8/12 周，通关状态读 `compute().bossW`，不把所有任务完成与 Boss 双关混为一谈。
- “前往本周任务”仅切换当前查看日期、滚动并聚焦本周任务标题，不保存数据、不更改任务安排；计划期间外按钮禁用。
- 新 Boss 反馈在 `celebrate()` 比较前后 `bossW`，不在 render 内触发。沿用原有单次弹层优先级：新图鉴→自动造型→新 Boss→升级→普通 toast，不排队轰炸用户。
- `fetchVerified()` 保留 `lastPass !== null` 首次加载保护，仅在后续真实结果带来金币增加时，将前后快照交给原 `celebrate()`。重复刷新无新变化不弹；首次读取历史通过结果不弹。
- 沿用 `celebrate()` 原有集齐图鉴时写入 l16 的处理，无新增条件或字段；验收更新现在也可及时走这一既有入口，不再等下一次打卡。请重点复核这处调用时机变化。
- 弹层入场缩短到 200ms，保留 reduced-motion 全局关闭动效；无自动声音。

## 保护边界

不改任务、日期、ID、奖励金额、XP/等级阈值、全勤、连击、Boss 条件、购买与兼容修复、存储键/结构、备份/Grok schema。不新增 localStorage 字段。plan.json、verified.json、sw.js、manifest 和 24 张 JPG 均与 P0 字节一致。render 只展示数据，不发奖、不弹反馈。

## 验证

见 `test-results.json`。使用隔离 Chromium + Playwright、Asia/Shanghai，未使用用户真实数据。

- 原版/新版空记录、84 天全记录 compute 和导出一致。
- 过去不完整周不会误标完成；实际必做项齐全才 completed。
- 12 章、84 项每日标题完整，Boss 周 4/8/12；当前周默认展开、其他周可展开，跳转本周不写存储。
- 浏览器模拟验收响应：首载、重复刷新与 render 不触发反馈；新增第 8 周双关触发一次 Boss；真实日验收跨级触发一次升级；没有新增存储字段。
- reduced-motion 时动画为 none。
- 五种尺寸×两种主题×四页，共 40 组无水平溢出；离线重新打开地图仍有 12 章。
- JS 语法与 git diff --check 通过。

未测：手机真机安全区/PWA 安装、完整读屏器审计、实际 Claude 验收交互和所有业务排列。模拟通过数据只存在浏览器响应中，未修改仓库 verified.json。

## 前后截图

读取同一份仓库计划与验收结果，使用无本机打卡的测试上下文，不代表用户手机进度。

| 宽度 | 改前 | 改后 |
|---|---|---|
| 390 手机 | [前](before-390-adventure.png) | [后](after-390-adventure.png) |
| 768 平板 | [前](before-768-adventure.png) | [后](after-768-adventure.png) |
| 1366 桌面 | [前](before-1366-adventure.png) | [后](after-1366-adventure.png) |

回退时只撤销 P2 提交；不重置本机记录，不更改业务数据。P1 与 P2 分别审核；不要混入其他奖励图库 PR。
