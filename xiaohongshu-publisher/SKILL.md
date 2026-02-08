---
name: xiaohongshu-publisher
description: 小红书自动化发布工具 (防风控版)
---

# 小红书自动化发布工具 (Xiaohongshu Publisher)

本工具旨在自动化完成小红书图文笔记的发布流程。
它具备以下核心能力：
1.  **智能 Tab 切换**：自动识别并切换到“上传图文”标签页。
2.  **防风控上传**：采用 **Remote Debugging (远程调试)** 技术，连接原生浏览器进行操作，彻底规避文件上传时的 Session 封禁问题。
3.  **自动填单**：自动读取草稿文件并填写标题、正文。
4.  **安全发布**：脚本执行完毕后保留浏览器窗口，由用户人工确认并点击“发布”，确保万无一失。

## 快速开始

### 方式一：一键脚本 (推荐)

直接运行 PowerShell 脚本，它会自动检测并启动调试版 Chrome：

```powershell
.\run_publisher.ps1
```

### 方式二：手动运行 (高级)

```powershell
# 1. 启动调试版 Chrome (保持窗口开启)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="E:\AIspace\redbookgen\chrome_debug_profile"

# 2. 运行发布脚本
node xiaohongshu-publisher/index.js --draft "workspace/test_task/02_draft.json" --images "workspace/test_task/images/"
```

---

## 🛑 风控问题复盘与解决方案

### 🚨 严重问题：动作触发型会话失效 (Session Invalidation)
**症状：**
脚本点击上传图片后，页面立即跳转到登录页（即使之前已登录）。

**原因：**
小红书拥有高级反爬虫指纹识别。Puppeteer 启动的浏览器（Launcher Mode）即使使用了隐藏插件，在进行“文件上传”这种敏感操作时，仍会被识别出自动化特征（如 `navigator.webdriver` 属性或特定的事件延迟），从而触发服务端风控，强制踢出登录态。

**解决方案：远程调试模式 (Remote Debugging)**
不管是 Puppeteer 还是 Selenium，只要是由代码 launch 出来的浏览器，都难以幸免。
我们的终极方案是 **“寄生模式”**：
1.  用户手动启动一个原生的 Chrome 浏览器。
2.  脚本通过 `puppeteer.connect()` 连接到这个浏览器。
3.  **结果**：浏览器指纹完全真实，Cookies 和 Session 也是自然生成的。脚本只负责“指挥”，从而完美绕过风控。

---

## 📋 标准操作流程 (SOP)

请严格按照以下步骤操作以确保发布成功。

### 1. 启动环境
运行 `.\run_publisher.ps1`。
*   如果这是您第一次运行，或者是 Cookies 过期了，弹出的 Chrome 窗口会要求登录。
*   **请务必手动扫码登录** 小红书创作中心。
*   **登录后请保持该窗口开启，不要关闭！**

### 2. 自动执行
脚本会自动连接该窗口并开始工作：
*   自动跳转到发布页。
*   自动切换到“上传图文”。
*   自动弹出文件选择框并填入图片路径。
*   自动填写标题和正文。

### 3. 人工介入 (如需)
*   **上传按钮变动**：如果脚本提示“File Picker timeout”，通常是因为小红书改了UI导致找不到上传按钮。此时您只需在脚本运行时**手动点击一下页面上的“点击上传”框**，脚本就能捕捉到文件选择弹窗并继续。

### 4. 最终确认
*   脚本**不会**自动点击“发布”按钮（为了安全）。
*   请您检查图片顺序、标题、正文是否正确。
*   确认无误后，手动点击“发布”。

---

## 项目结构
- `index.js`: 核心发布逻辑 (连接远程浏览器)。
- `SKILL.md`: 本说明文档。
- `../run_publisher.ps1`: 一键启动脚本。
