import React, { useState, useEffect, useMemo } from 'react';
import {
    Folder, FolderOpen, FileText, FileCode,
    ChevronRight, ChevronDown, Search, X
} from 'lucide-react';

// ============================================
// FILE ICON HELPER
// ============================================
const getFileIcon = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'py': return <FileCode size={14} color="#3572A5" />;
        case 'java': return <FileCode size={14} color="#b07219" />;
        case 'js': case 'jsx': return <FileCode size={14} color="#f1e05a" />;
        case 'ts': case 'tsx': return <FileCode size={14} color="#3178c6" />;
        case 'cpp': case 'cc': case 'c': case 'h': return <FileCode size={14} color="#f34b7d" />;
        case 'go': return <FileCode size={14} color="#00ADD8" />;
        case 'rs': return <FileCode size={14} color="#dea584" />;
        case 'json': return <FileCode size={14} color="#cb8c00" />;
        case 'md': return <FileText size={14} color="#083fa1" />;
        default: return <FileText size={14} color="#888" />;
    }
};

// ============================================
// TREE NODE (Read-Only)
// ============================================
const RemoteTreeNode = ({ node, path, depth, expandedFolders, toggleFolder, selectedFile, onFileSelect, loadingFile, dependencies }) => {
    const isFolder = node.type === 'folder';
    const fullPath = path.join('/');
    const isExpanded = expandedFolders.has(fullPath);
    const isSelected = selectedFile === fullPath;
    const isLoading = loadingFile === fullPath;

    // Dependency info
    const fileDeps = dependencies?.imports?.get(fullPath) || [];
    const importedBy = dependencies?.importedBy?.get(fullPath) || [];
    const selectedFileDeps = dependencies?.imports?.get(selectedFile) || [];
    const selectedFileImportedBy = dependencies?.importedBy?.get(selectedFile) || [];
    const isImportedBySelected = selectedFileDeps.includes(fullPath);
    const isImporterOfSelected = selectedFileImportedBy.includes(fullPath);

    const handleClick = (e) => {
        e.stopPropagation();
        if (isFolder) {
            toggleFolder(fullPath);
        } else {
            onFileSelect(fullPath, node);
        }
    };

    return (
        <div>
            <div
                onClick={handleClick}
                style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', paddingLeft: `${depth * 16 + 8}px`,
                    cursor: 'pointer', fontSize: '0.82rem',
                    color: isSelected ? '#fff' : isImportedBySelected ? '#4caf50' : isImporterOfSelected ? '#64b5f6' : '#bbb',
                    background: isSelected ? '#37373d' : isImportedBySelected ? 'rgba(76,175,80,0.08)' : isImporterOfSelected ? 'rgba(100,181,246,0.08)' : 'transparent',
                    borderLeft: isSelected ? '2px solid #4caf50' : isImportedBySelected ? '2px solid #4caf50' : isImporterOfSelected ? '2px solid #64b5f6' : '2px solid transparent',
                    transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#2a2d2e'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
                {isFolder ? (
                    <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {isExpanded ? <ChevronDown size={14} color="#888" /> : <ChevronRight size={14} color="#888" />}
                    </span>
                ) : (
                    <span style={{ width: 14, flexShrink: 0 }} />
                )}

                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {isFolder ? (
                        isExpanded ? <FolderOpen size={14} color="#dcb67a" /> : <Folder size={14} color="#dcb67a" />
                    ) : (
                        getFileIcon(node.name)
                    )}
                </span>

                <span style={{
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    opacity: isLoading ? 0.5 : 1
                }}>
                    {node.name}
                </span>

                {isLoading && (
                    <span style={{ fontSize: '0.65rem', color: '#4caf50', marginLeft: 'auto', flexShrink: 0 }}>
                        loading…
                    </span>
                )}

                {!isFolder && node._ghSize != null && !fileDeps.length && !importedBy.length && (
                    <span style={{ fontSize: '0.6rem', color: '#555', marginLeft: 'auto', flexShrink: 0 }}>
                        {node._ghSize > 1024 ? `${(node._ghSize / 1024).toFixed(1)}KB` : `${node._ghSize}B`}
                    </span>
                )}

                {/* Dependency badges */}
                {!isFolder && (fileDeps.length > 0 || importedBy.length > 0) && (
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: '3px', flexShrink: 0 }}>
                        {fileDeps.length > 0 && (
                            <span style={{ fontSize: '0.6rem', background: '#1a3a1a', color: '#4caf50', padding: '0 4px', borderRadius: '3px' }} title={`Imports ${fileDeps.length} file(s)`}>
                                →{fileDeps.length}
                            </span>
                        )}
                        {importedBy.length > 0 && (
                            <span style={{ fontSize: '0.6rem', background: '#1a2a3a', color: '#64b5f6', padding: '0 4px', borderRadius: '3px' }} title={`Imported by ${importedBy.length} file(s)`}>
                                ←{importedBy.length}
                            </span>
                        )}
                    </span>
                )}
            </div>

            {isFolder && isExpanded && node.children && (
                <div>
                    {Object.entries(node.children)
                        .sort(([, a], [, b]) => {
                            if (a.type === 'folder' && b.type !== 'folder') return -1;
                            if (a.type !== 'folder' && b.type === 'folder') return 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(([name, childNode]) => (
                            <RemoteTreeNode
                                key={name}
                                node={childNode}
                                path={[...path, name]}
                                depth={depth + 1}
                                expandedFolders={expandedFolders}
                                toggleFolder={toggleFolder}
                                selectedFile={selectedFile}
                                onFileSelect={onFileSelect}
                                loadingFile={loadingFile}
                                dependencies={dependencies}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};

// ============================================
// MAIN COMPONENT
// ============================================
const GitHubExplorer = ({ treeData, selectedFile, onFileSelect, loadingFile, repoInfo, dependencies }) => {
    const [expandedFolders, setExpandedFolders] = useState(new Set(['']));
    const [searchTerm, setSearchTerm] = useState('');

    // Filter tree based on search term
    const filteredTree = useMemo(() => {
        if (!searchTerm.trim()) return treeData;

        const filterNode = (node) => {
            if (node.type === 'file') {
                return node.name.toLowerCase().includes(searchTerm.toLowerCase()) ? node : null;
            }
            if (node.type === 'folder' && node.children) {
                const filteredChildren = {};
                let hasMatchingChild = false;

                Object.entries(node.children).forEach(([name, child]) => {
                    const filtered = filterNode(child);
                    if (filtered) {
                        filteredChildren[name] = filtered;
                        hasMatchingChild = true;
                    }
                });

                if (hasMatchingChild) {
                    return { ...node, children: filteredChildren };
                }
            }
            return null;
        };

        return filterNode(treeData);
    }, [treeData, searchTerm]);

    // Auto-expand folders when searching
    useEffect(() => {
        if (searchTerm.trim() && filteredTree) {
            const allPaths = new Set();
            const collectPaths = (node, path = '') => {
                if (node.type === 'folder') {
                    allPaths.add(path);
                    if (node.children) {
                        Object.entries(node.children).forEach(([name, child]) => {
                            collectPaths(child, path ? `${path}/${name}` : name);
                        });
                    }
                }
            };
            collectPaths(filteredTree);
            setExpandedFolders(allPaths);
        }
    }, [searchTerm, filteredTree]);

    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const s = new Set(prev);
            if (s.has(path)) s.delete(path);
            else s.add(path);
            return s;
        });
    };

    if (!treeData) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#555', fontSize: '0.8rem', fontStyle: 'italic' }}>
                Enter a repository above to browse.
            </div>
        );
    }

    const displayTree = searchTerm.trim() ? filteredTree : treeData;
    const fileCount = displayTree ? countFiles(displayTree) : 0;
    const scannedCount = dependencies ? countScannedFiles(displayTree) : 0;

    return (
        <div style={{ flex: 1, overflowY: 'auto' }}>
            {repoInfo && (
                <div style={{
                    padding: '6px 12px', fontSize: '0.7rem', color: '#666',
                    borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{repoInfo.owner}/{repoInfo.repo}</span>
                        <span>{fileCount} files{scannedCount > 0 ? ` · ${scannedCount} scanned` : ''}</span>
                    </div>

                    {/* Search Bar */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={12} style={{ position: 'absolute', left: 8, color: '#666' }} />
                        <input
                            type="text"
                            placeholder="Search matches..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                background: '#1e1e1e',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                padding: '4px 8px 4px 24px',
                                color: '#d4d4d4',
                                fontSize: '0.75rem',
                                outline: 'none'
                            }}
                        />
                        {searchTerm && (
                            <X
                                size={12}
                                style={{ position: 'absolute', right: 8, cursor: 'pointer', color: '#888' }}
                                onClick={() => setSearchTerm('')}
                            />
                        )}
                    </div>
                </div>
            )}

            {!displayTree ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
                    No matching files found.
                </div>
            ) : (
                displayTree.children && Object.entries(displayTree.children)
                    .sort(([, a], [, b]) => {
                        if (a.type === 'folder' && b.type !== 'folder') return -1;
                        if (a.type !== 'folder' && b.type === 'folder') return 1;
                        return a.name.localeCompare(b.name);
                    })
                    .map(([name, node]) => (
                        <RemoteTreeNode
                            key={name}
                            node={node}
                            path={[name]}
                            depth={0}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            selectedFile={selectedFile}
                            onFileSelect={onFileSelect}
                            loadingFile={loadingFile}
                            dependencies={dependencies}
                        />
                    ))
            )}
        </div>
    );
};

function countFiles(node) {
    if (node.type === 'file') return 1;
    if (!node.children) return 0;
    return Object.values(node.children).reduce((sum, child) => sum + countFiles(child), 0);
}

function countScannedFiles(node) {
    if (node.type === 'file') return node.content ? 1 : 0;
    if (!node.children) return 0;
    return Object.values(node.children).reduce((sum, child) => sum + countScannedFiles(child), 0);
}

export default GitHubExplorer;
