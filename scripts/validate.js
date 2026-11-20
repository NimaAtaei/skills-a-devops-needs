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

function getSubmodulePaths(rootDir) {
  const gitmodulesPath = path.join(rootDir, '.gitmodules');
  if (!fs.existsSync(gitmodulesPath)) return new Set();
  const content = fs.readFileSync(gitmodulesPath, 'utf8');
  const matches = content.matchAll(/path\s*=\s*(.+)/g);
  const paths = new Set();
  for (const m of matches) {
    paths.add(path.resolve(rootDir, m[1].trim()));
  }
  return paths;
}

function validateMarkdownLinks(filePath, submodulePaths) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  const linkRegex = /\[([^\]]+)\]\(((\.{1,2}\/)[^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawTarget = match[2];
    const cleanTarget = rawTarget.split('#')[0];
    if (!cleanTarget) continue;
    const resolvedPath = path.resolve(dir, cleanTarget);
    
    // Check if link points into a registered Git submodule
    const isSubmodule = Array.from(submodulePaths).some(subPath => resolvedPath.startsWith(subPath));

    if (!fs.existsSync(resolvedPath)) {
      if (isSubmodule) {
        logPass(`${filePath}: Valid submodule link (submodule registered in .gitmodules) -> ${rawTarget}`);
      } else {
        logFail(`${filePath}: Broken link "${rawTarget}" -> ${resolvedPath}`);
      }
    } else {
      logPass(`${filePath}: Valid link -> ${rawTarget}`);
    }
  }
}

console.log('=== Validating Skills Repository ===\n');

const repoRoot = path.resolve(__dirname, '..');
const submodulePaths = getSubmodulePaths(repoRoot);
const mdFiles = findMarkdownFiles(repoRoot);

for (const md of mdFiles) {
  if (path.basename(md) === 'SKILL.md') {
    validateFrontmatter(md);
  }
  validateMarkdownLinks(md, submodulePaths);
}

console.log('\n====================================');
if (errors === 0) {
  console.log(`Validation successful! Checked ${mdFiles.length} markdown files. 0 errors found.`);
  process.exit(0);
} else {
  console.error(`Validation failed with ${errors} error(s).`);
  process.exit(1);
}
