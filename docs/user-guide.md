<p align="right">
  <strong>简体中文</strong> · <a href="./user-guide.en.md">English</a>
</p>

# DeskTodo 图文使用说明

适用于 DeskTodo v0.6.0。DeskTodo 是 Windows 本地优先的桌面 Todo 小组件：任务、设置和日历快照保存在当前电脑，不需要账号。

> [!IMPORTANT]
> Apple 日历功能是**公开链接的单向只读订阅**。DeskTodo 不会修改 Apple 日历；公开链接本身相当于查看凭据，请不要发到公开 Issue、聊天群或截图中。

## 目录

- [快速认识主界面](#快速认识主界面)
- [创建和管理任务](#创建和管理任务)
- [安排日期、时间段、截止时间与重复](#安排日期时间段截止时间与重复)
- [添加 Apple 日历](#添加-apple-日历)
- [查看和折叠 Apple 日历](#查看和折叠-apple-日历)
- [把 Apple 日程复制为 Day Todo](#把-apple-日程复制为-day-todo)
- [管理日历名称与颜色](#管理日历名称与颜色)
- [窗口模式和系统托盘](#窗口模式和系统托盘)
- [数据、隐私与备份](#数据隐私与备份)
- [常用快捷键](#常用快捷键)
- [常见问题](#常见问题)

## 快速认识主界面

![DeskTodo 主界面图解](./images/user-guide/01-overview.png)

1. 标题栏包含窗口层级、设置、隐藏窗口和关闭到托盘。
2. 日期栏用于查看今天、历史日期或未来计划日。
3. Apple 日历摘要显示所选日期的前两项日程。
4. 在快速添加框输入任务名，按 `Enter` 创建。
5. 每个一级任务右侧依次是重要、时间安排、添加子任务和删除。

## 创建和管理任务

![DeskTodo 任务操作图解](./images/user-guide/02-task-basics.png)

### 新建与编辑

1. 在“在此添加任务”中输入名称，按 `Enter`。
2. 双击任务标题进入编辑；按 `Enter` 保存，按 `Esc` 取消。
3. 点击复选框切换完成状态。完成项进入底部的“已完成”区域，可再次勾选恢复。
4. 点击 `+` 添加子任务。DeskTodo 只支持一层子任务，子任务继承父任务的计划日期。
5. 长按任务行后拖动可调整顺序；重要任务只在显示时置顶，不改写你保存的普通顺序。

### 重要、搜索与删除

- 星标：将未完成的一级任务标为重要。
- 搜索：点击日期栏右侧放大镜，或按 `Ctrl+F`；可以搜索一级任务和子任务。
- 删除：点击垃圾桶后可在 8 秒内撤销。焦点不在输入框时也可按 `Ctrl+Z`。
- 已完成历史：切换到历史日期可以回顾；正常回顾保持只读。

## 安排日期、时间段、截止时间与重复

点击一级任务右侧的日历/时钟按钮打开“时间安排”。

![DeskTodo 时间安排图解](./images/user-guide/03-task-schedule.png)

- **计划日期**：任务在哪一天的 Day Todo 中显示。今天和未来日期可以新增、编辑任务。
- **时间段**：选择无、全天或指定时间。指定时间时分别编辑开始、结束端点。
- **截止时间**：可显示平静倒计时，或明确的本地截止时间；最后 30 分钟会精确到秒。
- **重复**：支持每天、工作日或指定星期。每个系列最多保留一个未完成实例，避免长期未打开后产生大量积压。

> [!NOTE]
> 计划日期、时间段和截止时间是不同字段。跨日时间段必须覆盖任务的计划日期；需要移到另一日时，请同时调整计划日期。

## 添加 Apple 日历

### 第一步：取得公开日历链接

Apple 官方在 iPhone 上的路径是：

1. 打开“日历” App。
2. 轻点底部“日历”，再轻点目标 **iCloud 日历**右侧的简介按钮 `ⓘ`。
3. 打开“公开日历”。
4. 轻点“共享链接”，选择“拷贝”。

![取得 Apple 公开日历链接](./images/user-guide/04-apple-public-link.png)

可参考 Apple 官方说明：

- [在 iPhone 上共享 iCloud 日历](https://support.apple.com/zh-cn/guide/iphone/iph7613c4fb/ios)
- [在 iCloud.com 上共享日历](https://support.apple.com/zh-cn/guide/icloud/mm6b1a9479/icloud)

复制出来的链接通常类似：

```text
webcal://p123-caldav.icloud.com/published/2/••••••••
```

中国大陆和其他地区的 Apple 公开日历链接都支持；DeskTodo 会把 `webcal://` 安全等价为 HTTPS。也支持 Apple 官方地区节假日 `.ics`，例如：

```text
https://calendars.icloud.com/holidays/cn_zh.ics
```

> [!WARNING]
> 公开日历不是“仅自己可见”。任何拿到链接的人都可能读取其中的日程。只公开适合被链接查看的日历；不要把链接写进源码、README、日志或公开截图。

### 第二步：在 DeskTodo 中验证并添加

1. 点击标题栏齿轮，滚动到“Apple 日历”。
2. 点击“添加”。
3. 粘贴公开链接；“显示名称”可留空，也可填写“工作”“家庭”等易识别名称。
4. 点击“验证并添加”。
5. 出现“已同步”和最近同步时间后即完成。

![在 DeskTodo 中添加 Apple 日历](./images/user-guide/05-apple-add-source.png)

DeskTodo 最多保存 8 个来源。它只接受严格白名单内的 Apple 公开订阅地址和官方节假日源；其他域名、不安全协议、带用户名密码、查询参数或片段的地址会被拒绝。

同步在启动后、约每 5 分钟，以及窗口重新获得焦点且缓存过期时进行。临时网络故障会保留最后一次成功快照，不会用空结果覆盖现有日程。

## 查看和折叠 Apple 日历

![查看和折叠 Apple 日历](./images/user-guide/06-apple-view-and-collapse.png)

1. 主界面摘要最多显示当天两项日程。
2. 点击“Apple 日历”标题进入当天详情，可查看时间、地点、备注和来源。
3. 点击摘要右侧上箭头可折叠，给任务列表腾出空间。
4. 折叠后总数仍保留；点击下箭头即可重新展开。

折叠状态会保存。全天、跨日、时区和重复规则会在本地解析；排除日期与取消实例不会显示，改期实例按新时间显示。

## 把 Apple 日程复制为 Day Todo

Apple 日历始终只读。如果某项日程需要进入任务流程，可显式复制：

![把 Apple 日程复制为 Day Todo](./images/user-guide/07-apple-copy-to-todo.png)

1. 在摘要或详情中点击日程右侧 `+`。只能复制今天或未来的日程，过去日程的按钮不可用。
2. 检查并按需修改任务名称。
3. 选择的 Day Todo 日期不得早于今天，且必须位于日程的日期范围内。全天日程只需检查起止日期；指定时间日程还可修改开始时间和结束时间。
4. 点击“添加”。
5. 原日程右侧变为勾号；任务列表出现独立的一级任务。

复制结果是**独立 Todo**：后续可以像普通任务一样编辑、完成或删除；Apple 日历后续同步不会覆盖它，Todo 的修改也不会回写 Apple。只要对应 Todo 仍存在，原日程会显示勾号并阻止重复复制；删除该 Todo 后可以再次添加。

如果原事件在 Apple 日历中被删除，下一次成功同步会让它从只读订阅视图消失；已经复制出的独立 Todo 会保留。

## 管理日历名称与颜色

进入“设置 → Apple 日历”：

![管理 Apple 日历来源](./images/user-guide/08-apple-manage-source.png)

- 点击来源左侧色条，选择八种预设颜色之一。
- 点击来源名称或铅笔图标，编辑显示名称并保存。
- 点击刷新按钮，只刷新该来源。
- 点击垃圾桶，移除 DeskTodo 本地订阅和对应凭据；**不会删除 Apple 日历本身**。

## 窗口模式和系统托盘

![DeskTodo 窗口模式与托盘](./images/user-guide/09-windows-modes.png)

窗口层级按钮循环切换：

- **置顶**：保持在普通窗口上方。
- **普通**：使用正常窗口层级。
- **桌面**：尽力保持在普通窗口下方，作为桌面贴纸使用。该模式依赖 Windows 合成器，不是嵌入系统桌面。

标题栏 `—` 隐藏窗口；`×` 关闭到系统托盘。两者都不会退出程序；左键托盘图标可以恢复窗口，右键菜单可以显示、隐藏或退出。

如果桌面模式下暂时找不到窗口，请点击托盘“显示”，或再次启动 DeskTodo。程序会把窗口恢复到可操作的普通模式。

## 数据、隐私与备份

### 数据保存位置

Todo、设置、重复系列和窗口层级偏好：

```text
%APPDATA%\com.desktodo.desktop\desktodo-state.json
```

Apple 日历来源元数据和最近一次成功快照：

```text
%APPDATA%\com.desktodo.desktop\desktodo-calendar-state.json
```

Apple 公开链接全文保存在 **Windows 凭据管理器**，不会写入上述 JSON、日志或源码。DeskTodo 没有账号、分析、遥测或 Todo 云同步。

### 安装或升级前备份

退出 DeskTodo 后，在 PowerShell 中运行：

```powershell
$backup = Join-Path $env:USERPROFILE "Desktop\DeskTodo-backup"
New-Item -ItemType Directory -Path $backup -Force
Copy-Item "$env:APPDATA\com.desktodo.desktop\desktodo-state.json" $backup -ErrorAction SilentlyContinue
Copy-Item "$env:APPDATA\com.desktodo.desktop\desktodo-calendar-state.json" $backup -ErrorAction SilentlyContinue
```

只要应用 identifier 仍为 `com.desktodo.desktop`、Store 文件名不变，覆盖安装新版本通常会保留旧数据。日历公开链接凭据不包含在文件备份中；仅用上述两个 JSON 在新电脑恢复时，需要先移除失效来源，再重新添加公开链接。

## 常用快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+N` | 在没有编辑器或日历弹窗时聚焦快速添加 |
| `Ctrl+F` | 打开任务搜索 |
| `Ctrl+Z` | 恢复等待撤销的删除 |
| `Enter` | 创建任务或提交标题编辑 |
| `Esc` | 取消当前标题编辑或关闭顶层弹窗 |

## 常见问题

### 为什么 Apple 日历链接无法添加？

依次检查：

1. 链接对应的日历是否已开启“公开日历”，而不是私人邀请链接。
2. 是否为 `webcal://` 或 `https://` 的 Apple 公开订阅，且没有手动添加查询参数或片段。
3. 网络能否直接访问对应 Apple 域名。
4. DeskTodo 是否为 v0.6.0 或更新版本。
5. Apple 官方节假日源请复制完整 `.ics` 地址；不要从网页中复制被截断的显示文本。

### 已添加，但当天没有日程

- 点击来源右侧刷新，查看是否仍显示“已同步”。
- 切换到实际包含事件的日期；事件会按 Windows 本地日期和事件时区解析。
- 日历可能本来就没有当天事件。摘要只显示两项，点击标题查看完整列表。
- 临时失败会继续显示最后一次成功快照；错误状态不会删除 Apple 日历或 Todo。

### 为什么不能在 DeskTodo 中删除 Apple 日程？

这是有意的安全边界。订阅严格单向只读，DeskTodo 不具有 Apple 写入凭据。若要修改或删除原日程，请在 Apple 日历中操作；如果只想作为任务跟踪，请复制为独立 Day Todo。

### 点击“×”后程序去哪了？

窗口已隐藏到系统托盘。左键托盘图标恢复；右键可显示、隐藏或退出。

### 如何报告问题而不泄露隐私？

可以附上错误文字、DeskTodo 版本和经过裁剪的界面截图，但请遮住任务名称、日程内容和公开链接。不要上传真实 Store 文件、凭据或完整日历 URL。

---

[返回 README](../README.md) · [下载最新版本](https://github.com/star0628/DeskTodo/releases/latest)
