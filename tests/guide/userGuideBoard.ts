import "./userGuideBoard.css";

type Marker = {
  number: number;
  x: number;
  y: number;
  label?: string;
  align?: "left" | "right";
};

type Panel = {
  image: string;
  title: string;
  caption: string;
  markers?: Marker[];
  className?: string;
};

type Board = {
  eyebrow: string;
  title: string;
  subtitle: string;
  panels: Panel[];
  footer?: string;
  className?: string;
};

const raw = "/output/playwright/user-guide/raw";

const boards: Record<string, Board> = {
  overview: {
    eyebrow: "DESKTODO · QUICK START",
    title: "一分钟认识主界面",
    subtitle: "固定操作槽位让常用动作始终在相同位置。",
    className: "board-overview",
    panels: [
      {
        image: `${raw}/app-overview.png`,
        title: "Day Todo",
        caption: "日期、Apple 日历、快速添加和任务列表都在一个窄窗口内。",
        className: "panel-app",
        markers: [
          { number: 1, x: 71, y: 5, label: "窗口模式与设置", align: "left" },
          { number: 2, x: 49, y: 14, label: "切换工作日期", align: "left" },
          { number: 3, x: 7, y: 23, label: "Apple 日历摘要", align: "right" },
          { number: 4, x: 5, y: 34, label: "输入后按 Enter", align: "right" },
          { number: 5, x: 82, y: 43, label: "重要 / 安排 / 子任务 / 删除", align: "left" }
        ]
      }
    ],
    footer: "提示：绿色表示当前选中或已启用；每个任务右侧的操作顺序保持不变。"
  },
  tasks: {
    eyebrow: "DESKTODO · TASKS",
    title: "创建、整理和完成任务",
    subtitle: "所有任务变化都由同一套操作槽位完成。",
    className: "board-tasks",
    panels: [
      {
        image: `${raw}/app-overview.png`,
        title: "快速添加",
        caption: "输入任务名称，按 Enter 创建。",
        markers: [
          { number: 1, x: 9, y: 34 },
          { number: 2, x: 88, y: 43 },
          { number: 3, x: 8, y: 43 },
          { number: 4, x: 8, y: 78 }
        ]
      },
      {
        image: `${raw}/apple-copy-result.png`,
        title: "检查结果",
        caption: "勾选完成；完成项集中在底部，可随时展开或恢复。",
        markers: [
          { number: 5, x: 9, y: 81 },
          { number: 6, x: 9, y: 91 }
        ]
      }
    ],
    footer: "1 输入 · 2 重要/安排/子任务/删除 · 3 勾选完成 · 4 展开完成区 · 5 普通任务 · 6 完成项；子任务最多一层。"
  },
  schedule: {
    eyebrow: "DESKTODO · PLANNING",
    title: "给任务设置日期与时间",
    subtitle: "使用 DeskTodo 自带的本地日期时间控件，不依赖浏览器原生弹窗。",
    className: "board-schedule",
    panels: [
      {
        image: `${raw}/schedule-time-block.png`,
        title: "时间安排",
        caption: "同一个编辑器覆盖计划日期、时间段、截止时间和重复规则。",
        className: "panel-dialog",
        markers: [
          { number: 1, x: 50, y: 12, label: "选择类型", align: "right" },
          { number: 2, x: 79, y: 24, label: "指定时间", align: "left" },
          { number: 3, x: 54, y: 35, label: "编辑开始 / 结束", align: "right" },
          { number: 4, x: 86, y: 82, label: "输入时间", align: "left" },
          { number: 5, x: 87, y: 96, label: "完成", align: "left" }
        ]
      }
    ],
    footer: "时间段必须覆盖任务的 Day Todo 日期；需要跨日时请同时调整计划日期。"
  },
  "apple-add": {
    eyebrow: "DESKTODO · APPLE CALENDAR",
    title: "添加公开日历来源",
    subtitle: "支持 webcal:// 与 https:// 公开订阅，也支持 Apple 官方地区节假日 .ics。",
    panels: [
      {
        image: `${raw}/apple-add-ready.png`,
        title: "填写并验证",
        caption: "示例使用 Apple 官方中国节假日日历，不含私人链接。",
        markers: [
          { number: 1, x: 7, y: 46, label: "粘贴公开链接", align: "right" },
          { number: 2, x: 7, y: 56, label: "可选显示名称", align: "right" },
          { number: 3, x: 83, y: 66, label: "验证并添加", align: "left" }
        ]
      },
      {
        image: `${raw}/apple-source-added.png`,
        title: "确认同步状态",
        caption: "出现“已同步”后，DeskTodo 会只读显示订阅内容。",
        markers: [
          { number: 4, x: 12, y: 70, label: "已同步与地区", align: "right" }
        ]
      }
    ],
    footer: "公开链接保存在 Windows 凭据管理器；DeskTodo 不会写回或删除 Apple 日历内容。"
  },
  "apple-view": {
    eyebrow: "DESKTODO · APPLE CALENDAR",
    title: "查看、展开和折叠当天日程",
    subtitle: "摘要最多显示两项；详情页显示时间、地点、备注和来源。",
    className: "board-three",
    panels: [
      {
        image: `${raw}/app-overview.png`,
        title: "摘要",
        caption: "点击标题进入当天详情。",
        markers: [
          { number: 1, x: 12, y: 20, label: "打开详情", align: "right" },
          { number: 2, x: 93, y: 20, label: "折叠", align: "left" }
        ]
      },
      {
        image: `${raw}/apple-day-details.png`,
        title: "详情",
        caption: "日程内容保持只读；“+”可复制为 Todo。",
        markers: [
          { number: 3, x: 93, y: 31, label: "复制此日程", align: "left" }
        ]
      },
      {
        image: `${raw}/apple-agenda-collapsed.png`,
        title: "折叠后",
        caption: "列表仍显示总数，再点右侧箭头即可展开。",
        markers: [
          { number: 4, x: 93, y: 20, label: "重新展开", align: "left" }
        ]
      }
    ],
    footer: "折叠状态会保存；日程很多时可以优先为任务列表腾出空间。"
  },
  "apple-copy": {
    eyebrow: "DESKTODO · APPLE CALENDAR",
    title: "把 Apple 日程复制为 Day Todo",
    subtitle: "复制后是独立任务；后续日历同步不会覆盖你的 Todo 修改。",
    className: "board-three board-copy",
    panels: [
      {
        image: `${raw}/app-overview.png`,
        title: "选择日程",
        caption: "点击日程右侧“+”。",
        markers: [
          { number: 1, x: 93, y: 24, label: "添加到 Todo", align: "left" }
        ]
      },
      {
        image: `${raw}/apple-copy-dialog.png`,
        title: "确认副本",
        caption: "可改任务名和 Day Todo 日期；指定时间日程还可改开始、结束时间。",
        className: "panel-dialog",
        markers: [
          { number: 2, x: 13, y: 15, label: "编辑名称", align: "right" },
          { number: 3, x: 52, y: 36, label: "编辑端点", align: "right" },
          { number: 4, x: 84, y: 95, label: "添加", align: "left" }
        ]
      },
      {
        image: `${raw}/apple-copy-result.png`,
        title: "完成",
        caption: "日程出现勾号，任务列表出现独立副本。",
        markers: [
          { number: 5, x: 89, y: 24, label: "已复制", align: "left" },
          { number: 6, x: 12, y: 79, label: "独立任务", align: "right" }
        ]
      }
    ],
    footer: "对应 Todo 仍存在时显示勾号并阻止重复；删除该 Todo 后可以再次添加。"
  },
  "apple-manage": {
    eyebrow: "DESKTODO · APPLE CALENDAR",
    title: "管理来源名称与颜色",
    subtitle: "点击左侧色条换色，点击名称或铅笔图标改名。",
    className: "board-three",
    panels: [
      {
        image: `${raw}/apple-source-added.png`,
        title: "找到来源",
        caption: "状态行显示最近同步时间和地区。",
        markers: [
          { number: 1, x: 10, y: 68, label: "点色条", align: "right" },
          { number: 2, x: 28, y: 68, label: "点名称", align: "right" }
        ]
      },
      {
        image: `${raw}/apple-color-picker.png`,
        title: "选择颜色",
        caption: "八种低刺激颜色便于区分多个日历。",
        markers: [
          { number: 3, x: 49, y: 77, label: "任选颜色", align: "right" }
        ]
      },
      {
        image: `${raw}/apple-rename-source.png`,
        title: "编辑名称",
        caption: "输入易识别的名称后保存。",
        markers: [
          { number: 4, x: 37, y: 78, label: "输入新名称", align: "right" },
          { number: 5, x: 87, y: 78, label: "保存", align: "left" }
        ]
      }
    ],
    footer: "刷新按钮只更新该来源；删除来源不会删除 Apple 日历本身。"
  },
  windows: {
    eyebrow: "DESKTODO · WINDOWS",
    title: "窗口模式与托盘行为",
    subtitle: "窗口层级按钮循环切换：置顶 → 普通 → 桌面。",
    className: "board-windows",
    panels: [
      {
        image: `${raw}/app-overview.png`,
        title: "固定在标题栏的窗口操作",
        caption: "模式、设置、隐藏窗口和关闭到托盘按钮始终保持相同顺序。",
        className: "panel-app",
        markers: [
          { number: 1, x: 67, y: 5 },
          { number: 2, x: 77, y: 5 },
          { number: 3, x: 85, y: 5 },
          { number: 4, x: 93, y: 5 }
        ]
      }
    ],
    footer: "1 窗口层级 · 2 设置 · 3 隐藏窗口 · 4 关闭到托盘。两者都不会退出；右键托盘图标可显示、隐藏或退出。"
  }
};

function renderMarker(marker: Marker) {
  const side = marker.align === "left" ? "marker-left" : "marker-right";
  return `
    <span class="guide-marker ${side}" style="left:${marker.x}%;top:${marker.y}%">
      <b>${marker.number}</b>
      ${marker.label ? `<em>${marker.label}</em>` : ""}
    </span>
  `;
}

function renderPanel(panel: Panel) {
  return `
    <figure class="guide-panel ${panel.className ?? ""}">
      <div class="guide-image">
        <img src="${panel.image}" alt="${panel.title}" />
        ${(panel.markers ?? []).map(renderMarker).join("")}
      </div>
      <figcaption>
        <strong>${panel.title}</strong>
        <span>${panel.caption}</span>
      </figcaption>
    </figure>
  `;
}

function renderBoard(board: Board) {
  return `
    <main class="guide-board ${board.className ?? ""}">
      <header>
        <span>${board.eyebrow}</span>
        <h1>${board.title}</h1>
        <p>${board.subtitle}</p>
      </header>
      <section class="guide-panels">
        ${board.panels.map(renderPanel).join("")}
      </section>
      ${board.footer ? `<footer><b>✓</b><span>${board.footer}</span></footer>` : ""}
    </main>
  `;
}

const boardName =
  new URLSearchParams(window.location.search).get("board") ?? "overview";
const board = boards[boardName];
const root = document.getElementById("root");

if (!root) {
  throw new Error("Guide board root is missing.");
}

root.innerHTML = board
  ? renderBoard(board)
  : `<main class="guide-board"><h1>未知文档画板：${boardName}</h1></main>`;
