# 架构设计：小红书自动发布智能体

## 项目概述

本项目旨在构建一个自主智能体（Agent），能够接收一个小红书笔记链接，自动分析其内容，并生成一篇风格相似的高质量新笔记（包含正文+信息图），最后将其发布。

## 设计理念：模块化技能 (Modular Skills)

我们采用**模块化技能架构**。我们将构建独立的“技能”（Skills），而不是编写一个巨大的单体脚本。

**为什么选择模块化？**
1.  **稳定性**：爬虫经常失效。将其隔离意味着我们可以在不影响核心逻辑的情况下修复它。
2.  **复用性**：`infographic-generator` 作为一个通用的绘图技能，可以被重复使用。
3.  **可调试性**：我们可以单独测试“大脑”（策划逻辑），而无需每次都运行“发布器”。

## 核心组件 (四大技能)

### 1. `xiaohongshu-parser` (眼睛)
*   **输入**: `url` (字符串)
*   **输出**: `NoteContent` 对象
    ```json
    {
      "original_title": "...",
      "original_desc": "...",
      "images": ["url1", "url2"], // 图片链接
      "ocr_content": "..." // 图片中的文字提取
    }
    ```
*   **实现策略**:
    *   **方案 A**: 无头浏览器 (Puppeteer/Playwright)，渲染页面并提取 DOM。
    *   **方案 B**: 第三方 API (如果可用且稳定)。

### 2. `content-planner` (大脑)
*   **输入**: `NoteContent`
*   **输出**: `PublishedPlan` 对象
    ```json
    {
       "new_title": "...",
       "new_desc": "...",
       "infographic_input": [ ... ] // 发送给绘图师的 JSON
    }
    ```
*   **核心逻辑**:
    *   **分析**: 总结原笔记的核心价值点。
    *   **重构**: 将内容拆解为“钩子”、“核心观点”、“行动号召”。
    *   **仿写**: 模仿原风格撰写新文案。
    *   **设计**: 规划 3-5 张信息图卡片（封面、内容页1、内容页2、总结页）。
    *   **格式化**: 根据 `infographic-generator` 的限制（字数、布局）转换数据。

### 3. `infographic-generator` (绘图师 - *现有*)
*   **输入**: `input.json`
*   **输出**: 本地图片路径列表 `['output/page_01.png', ...]`
*   **状态**: 已就绪。只需被编排器调用。

### 4. `xiaohongshu-publisher` (双手)
*   **输入**: `title` (标题), `desc` (正文), `image_paths` (图片路径)
*   **输出**: `success` (布尔值), `published_url` (可选)
*   **实现策略**:
    *   **浏览器自动化**: 扫码登录（首次），然后自动填写上传表单。

## 工作流编排 (Agent Orchestration)

1.  **User** 配置目标 URL。
2.  **Parser** 抓取原始内容。
3.  **Planner** 进行分析与创作 (调用 LLM)。
4.  **Agent** 生成 `input.json` 并调用 `infographic-generator`。
5.  **Publisher** 将生成的图片和文案上传到小红书。

## 目录结构规划

```text
redbookgen/
├── infographic-generator/  # [现有技能] 绘图师
├── xiaohongshu-parser/     # [新技能] 解析器
│   ├── index.js
│   └── scraper.js
├── xiaohongshu-publisher/  # [新技能] 发布器
│   ├── index.js
│   └── uploader.js
├── content-planner/        # [新技能] 策划师
│   └── prompt_templates/   # 分析与创作提示词
└── agent.js                # 主程序入口 (编排器)
```
