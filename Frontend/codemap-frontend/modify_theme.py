import re

files = [
    r"c:\Users\abhir\OneDrive\Documents\VSCode\CodeMap\Frontend\codemap-frontend\src\App_v2.js",
    r"c:\Users\abhir\OneDrive\Documents\VSCode\CodeMap\Frontend\codemap-frontend\src\components\FileExplorer.css"
]

replacements = {
    r"#1e1e1e": "var(--bg-main)",
    r"#252526": "var(--bg-sidebar)",
    r"#333(?![\da-fA-F])": "var(--border-main)",
    r"#333333": "var(--border-main)",
    r"#444(?![\da-fA-F])": "var(--border-light)",
    r"#444444": "var(--border-light)",
    r"#555(?![\da-fA-F])": "var(--border-muted)",
    r"#555555": "var(--border-muted)",
    r"#d4d4d4": "var(--text-main)",
    r"#888(?![\da-fA-F])": "var(--text-muted)",
    r"#888888": "var(--text-muted)",
    r"#ccc(?![\da-fA-F])": "var(--text-light)",
    r"#cccccc": "var(--text-light)",
    r"#2d2d2d": "var(--bg-panel)",
    r"#1a1a1a": "var(--bg-dark)",
    r"#2a2d2e": "var(--bg-hover)",
    r"#3e3e42": "var(--bg-active)",
    r"rgba\(255,\s?255,\s?255,": "rgba(var(--rgb-text-base),",
    r"rgba\(0,\s?0,\s?0,": "rgba(var(--rgb-shadow-base),",
    r"#ffffff": "var(--text-bright)",
    r"#fff(?![a-fA-F0-9])": "var(--text-bright)",
    r"#111(?![a-fA-F0-9])": "var(--bg-very-dark)",
}

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    for pat, repl in replacements.items():
        content = re.sub(pat, repl, content, flags=re.IGNORECASE)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {file_path}")
