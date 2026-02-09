---
name: redbook-automator
description: A master skill that orchestrates the entire specialized pipeline (parse -> plan -> generate -> publish) for Xiaohongshu content creation.
---

# Redbook Automator (Master Skill)

## Overview
This skill serves as the central command center, automating the end-to-end workflow of cloning and recreating a Xiaohongshu note. It sequentially triggers the specialized sub-skills to transform a target URL into a fully prepared draft ready for publishing.

## Workflow Execution
When triggered, this skill performs the following steps automatically:
1.  **Initialize**: Creates a unique task workspace (e.g., `workspace/20231027_1000`).
2.  **Parse**: Runs `xiaohongshu-parser` to extract content from the provided URL.
3.  **Plan**: Runs `content-planner` to rewrite the copy and design visual scripts.
4.  **Generate**: Runs `infographic-generator` to create the new images.
5.  **Publish**: Runs `xiaohongshu-publisher` to upload the draft and images to the browser.

## Usage

### Single Command
```bash
node redbook-automator/index.js --url "https://www.xiaohongshu.com/explore/..."
```

### Options
- `--url`: (Required) The full URL of the Xiaohongshu note to clone.
- `--task-id`: (Optional) precise task ID to use. If omitted, a timestamp-based ID is generated.

## Prerequisite
**Crucial**: The `xiaohongshu-publisher` step requires a running Chrome instance with remote debugging enabled.
Run `.\run_publisher.ps1` in a separate terminal *before* executing this automator.
