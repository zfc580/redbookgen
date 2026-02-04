---
name: content-planner
description: Analyzes raw content and plans a new Xiaohongshu note, including copy and infographic scripts.
---

# Content Planner Skill

## Overview
This skill acts as the "Brain". It takes raw scraped content (title, description, images), analyzes the core value proposition, and regenerates a new, optimized note plan.

## Workflow
1.  **Read Input**: Loads `01_raw.json`.
2.  **LLM Processing**: Sends content to Gemini Pro with a specialized prompt to:
    *   Analyze the topic.
    *   Write a new viral title and copy.
    *   Design a visual script for the infographic generator.
3.  **Output**: Saves `02_draft.json` and `02_visual_input.json`.

## Usage
```bash
node content-planner/index.js --input "workspace/task_001/01_raw.json" --output-dir "workspace/task_001/"
```
