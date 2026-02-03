---
name: infographic-generator
description: Generates a series of infographic images from a structured JSON input using a customizable prompt template and the Google Gen AI API. Use when the user wants to visualize list-based content, stories, or data points.
---

# Infographic Generator

## Overview

This skill automates the creation of infographic illustrations. It takes a JSON file containing a list of items (pages/descriptions), merges each item with a predefined prompt template, and sends the request to the Google Gen AI API (`imagen-3.0-generate-001` or compatible) to generate high-quality images.

## Workflow

1.  **Prepare Input**: User provides a JSON file defining the content for each image.
2.  **Customize Template** (Optional): User edits the `assets/template.txt` to define the artistic style and prompt structure.
3.  **Generate**: The `scripts/generate.js` script processes the input and saves images to the `output/` directory.

## Usage

### 1. Prerequisites

- **API Key**: Ensure `GOOGLE_API_KEY` is set in the `.env` file in the project root.
- **Proxy (Optional)**: If you are in a region where Google is blocked, set `HTTPS_PROXY` in the `.env` file (e.g., `HTTPS_PROXY=http://127.0.0.1:7890`).
- **Dependencies**: Ensure `npm install` has been run in the project root.

### 2. Input Format

The input must be a JSON array of objects. Each object should have a `content` or `description` field.

**Example (`example_input.json`):**
```json
[
  { "id": 1, "content": "A glowing brain representing AI." },
  { "id": 2, "content": "A robot shaking hands with a human." }
]
```

### 3. Execution

Run the generation script from the project root:

```bash
node infographic-generator/scripts/generate.js <path-to-json-file>
```

**Example:**
```bash
node infographic-generator/scripts/generate.js infographic-generator/assets/example_input.json
```

### 4. Customizing the Prompt

Edit the template file at:
`infographic-generator/assets/template.txt`

The template uses `{{content}}` as a placeholder for the JSON data.

**Example Template:**
```text
Create a vector art illustration about: {{content}}.
Style: Flat, minimal, blue color palette.
```

## Troubleshooting

- **No images generated?** Check the console output. If the API returns text instead of images (which can happen if the model refuses the prompt or defaults to chat), the script will log the text response.
- **API Errors**: Ensure your API key has access to the `imagen-3.0-generate-001` model.