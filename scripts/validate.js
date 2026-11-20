#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let errors = 0;

function logPass(msg) {
  console.log(`[PASS] ${msg}`);
}

function logFail(msg) {
  console.error(`[FAIL] ${msg}`);
  errors++;
}

function validateFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    logFail(`${filePath}: Missing YAML frontmatter block (---)`);
    return;
  }
  const fm = frontmatterMatch[1];
  if (!/^name:\s*.+$/m.test(fm)) {
    logFail(`${filePath}: Frontmatter missing 'name'`);
  } else {
    logPass(`${filePath}: Frontmatter has valid 'name'`);
  }
  if (!/^description:\s*.+$/m.test(fm)) {
    logFail(`${filePath}: Frontmatter missing 'description'`);
  } else {
    logPass(`${filePath}: Frontmatter has valid 'description'`);
  }
}

function findMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findMarkdownFiles(fullPath));
    } else if (file.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function validateMarkdownLinks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  const linkRegex = /\[([^\]]+)\]\(((\.{1,2}\/)[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawTarget = match[2];
    const cleanTarget = rawTarget.split('#')[0];
    if (!cleanTarget) continue;
    const resolvedPath = path.resolve(dir, cleanTarget);
    if (!fs.existsSync(resolvedPath)) {
      logFail(`${filePath}: Broken link "${rawTarget}" -> ${resolvedPath}`);
    } else {
      logPass(`${filePath}: Valid link -> ${rawTarget}`);
    }
  }
}

console.log('=== Validating Skills Repository ===\n');

const repoRoot = path.resolve(__dirname, '..');
const mdFiles = findMarkdownFiles(repoRoot);

for (const md of mdFiles) {
  if (path.basename(md) === 'SKILL.md') {
    validateFrontmatter(md);
  }
  validateMarkdownLinks(md);
}

console.log('\n====================================');
if (errors === 0) {
  console.log(`Validation successful! Checked ${mdFiles.length} markdown files. 0 errors found.`);
  process.exit(0);
} else {
  console.error(`Validation failed with ${errors} error(s).`);
  process.exit(1);
}
