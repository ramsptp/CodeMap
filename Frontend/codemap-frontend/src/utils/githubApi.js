// GitHub API utility functions for CodeMap
// Uses public GitHub REST API v3 — no auth required for public repos (60 req/hr)
// With a token: 5000 req/hr

const GITHUB_API = 'https://api.github.com';

// Parse "owner/repo" or full GitHub URL into { owner, repo }
export function parseRepoInput(input) {
    input = input.trim().replace(/\/+$/, '');

    // Full URL: https://github.com/owner/repo
    const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace('.git', '') };

    // Short form: owner/repo
    const shortMatch = input.match(/^([^/]+)\/([^/]+)$/);
    if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };

    return null;
}

// Build headers (with optional token)
function headers(token) {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) h['Authorization'] = `token ${token}`;
    return h;
}

// Fetch default branch name
export async function fetchDefaultBranch(owner, repo, token = null) {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: headers(token) });
    if (!res.ok) throw new Error(`Repository not found: ${owner}/${repo} (${res.status})`);
    const data = await res.json();
    return data.default_branch || 'main';
}

// Fetch full recursive tree
export async function fetchRepoTree(owner, repo, branch, token = null) {
    const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers: headers(token) }
    );
    if (!res.ok) throw new Error(`Failed to fetch tree (${res.status})`);
    const data = await res.json();

    if (data.truncated) {
        console.warn('GitHub tree was truncated — very large repo');
    }

    return buildTreeFromFlat(data.tree, repo);
}

// Convert flat GitHub tree array into nested tree structure matching FileExplorer format
function buildTreeFromFlat(flatTree, repoName) {
    const root = { type: 'folder', name: repoName, children: {} };

    // Filter to only blobs (files) and trees (folders) that are code-relevant
    const CODE_EXTENSIONS = new Set([
        'py', 'java', 'js', 'jsx', 'ts', 'tsx', 'cpp', 'cc', 'c', 'h', 'hpp',
        'json', 'md', 'txt', 'css', 'html', 'go', 'rs', 'rb', 'php'
    ]);

    for (const item of flatTree) {
        const parts = item.path.split('/');

        if (item.type === 'blob') {
            const ext = parts[parts.length - 1].split('.').pop()?.toLowerCase();
            if (!CODE_EXTENSIONS.has(ext)) continue;
        }

        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;

            if (isLast && item.type === 'blob') {
                current.children[part] = {
                    type: 'file',
                    name: part,
                    content: null, // Lazy-loaded
                    _ghPath: item.path,
                    _ghSize: item.size
                };
            } else {
                if (!current.children[part]) {
                    current.children[part] = {
                        type: 'folder',
                        name: part,
                        children: {}
                    };
                }
                current = current.children[part];
            }
        }
    }

    // Prune empty folders (folders with no code files)
    pruneEmptyFolders(root);

    return root;
}

// Recursively remove folders that have no file descendants
function pruneEmptyFolders(node) {
    if (node.type !== 'folder' || !node.children) return false;

    const keys = Object.keys(node.children);
    for (const key of keys) {
        const child = node.children[key];
        if (child.type === 'folder') {
            const hasContent = pruneEmptyFolders(child);
            if (!hasContent) delete node.children[key];
        }
    }

    return Object.keys(node.children).length > 0;
}

// Fetch a single file's content
export async function fetchFileContent(owner, repo, path, token = null) {
    const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
        { headers: headers(token) }
    );
    if (!res.ok) throw new Error(`Failed to fetch file: ${path} (${res.status})`);
    const data = await res.json();

    if (data.encoding === 'base64') {
        return atob(data.content.replace(/\n/g, ''));
    }

    return data.content || '';
}

// Check remaining rate limit
export async function checkRateLimit(token = null) {
    const res = await fetch(`${GITHUB_API}/rate_limit`, { headers: headers(token) });
    const data = await res.json();
    return {
        remaining: data.rate?.remaining ?? 0,
        limit: data.rate?.limit ?? 60,
        reset: data.rate?.reset ? new Date(data.rate.reset * 1000) : null
    };
}

// Fetch README content (rendered as HTML by GitHub)
export async function fetchReadme(owner, repo, token = null) {
    const h = headers(token);
    h['Accept'] = 'application/vnd.github.v3.html';
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, { headers: h });
    if (!res.ok) return null; // No README
    return await res.text();
}

// Fetch recent commits for a specific file
export async function fetchFileCommits(owner, repo, filePath, token = null, perPage = 10) {
    const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=${perPage}`,
        { headers: headers(token) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(c => ({
        sha: c.sha?.substring(0, 7),
        message: c.commit?.message?.split('\n')[0] || '',
        author: c.commit?.author?.name || c.author?.login || 'Unknown',
        date: c.commit?.author?.date || '',
        avatar: c.author?.avatar_url || null,
        url: c.html_url || '',
    }));
}
