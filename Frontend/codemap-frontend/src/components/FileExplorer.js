import React, { useState, useRef } from 'react';
import {
    Folder, FolderOpen, FileText, FileCode, ChevronRight, ChevronDown,
    Plus, Trash2, Upload, FolderPlus, FilePlus, MoreVertical, X
} from 'lucide-react';
import './FileExplorer.css';

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Get file extension
const getExtension = (filename) => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

// Get icon based on file type
const getFileIcon = (filename, isActive) => {
    const ext = getExtension(filename);
    const color = isActive ? '#4caf50' : '#888';

    switch (ext) {
        case 'py':
            return <FileCode size={14} color="#3572A5" />;
        case 'java':
            return <FileCode size={14} color="#b07219" />;
        case 'js':
        case 'jsx':
            return <FileCode size={14} color="#f1e05a" />;
        case 'json':
            return <FileCode size={14} color="#cb8c00" />;
        default:
            return <FileText size={14} color={color} />;
    }
};

// Get file path from tree path
const getFilePath = (pathArray) => pathArray.join('/');

// ============================================
// TREE NODE COMPONENT
// ============================================
const TreeNode = ({
    node,
    path,
    depth,
    expandedFolders,
    toggleFolder,
    selectedFile,
    onFileSelect,
    onCreateFile,
    onCreateFolder,
    onDelete,
    dependencies,
    onContextMenu
}) => {
    const isFolder = node.type === 'folder';
    const fullPath = getFilePath(path);
    const isExpanded = expandedFolders.has(fullPath);
    const isSelected = selectedFile === fullPath;

    // Dependency indicators
    const fileDeps = dependencies?.imports?.get(fullPath) || [];
    const importedBy = dependencies?.importedBy?.get(fullPath) || [];

    const handleClick = (e) => {
        e.stopPropagation();
        if (isFolder) {
            toggleFolder(fullPath);
        } else {
            onFileSelect(fullPath, node.content);
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, fullPath, node);
    };

    return (
        <div className="tree-node">
            <div
                className={`tree-item ${isSelected ? 'selected' : ''} ${isFolder ? 'folder' : 'file'}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {/* Expand/Collapse for folders */}
                {isFolder ? (
                    <span className="tree-chevron">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                ) : (
                    <span className="tree-chevron-spacer" />
                )}

                {/* Icon */}
                <span className="tree-icon">
                    {isFolder ? (
                        isExpanded ? <FolderOpen size={14} color="#dcb67a" /> : <Folder size={14} color="#dcb67a" />
                    ) : (
                        getFileIcon(node.name, isSelected)
                    )}
                </span>

                {/* Name */}
                <span className="tree-name">{node.name}</span>

                {/* Dependency indicators for files */}
                {!isFolder && (fileDeps.length > 0 || importedBy.length > 0) && (
                    <span className="dependency-indicators">
                        {fileDeps.length > 0 && (
                            <span className="dep-badge imports" title={`Imports: ${fileDeps.join(', ')}`}>
                                →{fileDeps.length}
                            </span>
                        )}
                        {importedBy.length > 0 && (
                            <span className="dep-badge imported-by" title={`Imported by: ${importedBy.join(', ')}`}>
                                ←{importedBy.length}
                            </span>
                        )}
                    </span>
                )}
            </div>

            {/* Render children if folder is expanded */}
            {isFolder && isExpanded && node.children && (
                <div className="tree-children">
                    {Object.entries(node.children)
                        .sort(([, a], [, b]) => {
                            // Folders first, then alphabetical
                            if (a.type === 'folder' && b.type !== 'folder') return -1;
                            if (a.type !== 'folder' && b.type === 'folder') return 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(([name, childNode]) => (
                            <TreeNode
                                key={name}
                                node={childNode}
                                path={[...path, name]}
                                depth={depth + 1}
                                expandedFolders={expandedFolders}
                                toggleFolder={toggleFolder}
                                selectedFile={selectedFile}
                                onFileSelect={onFileSelect}
                                onCreateFile={onCreateFile}
                                onCreateFolder={onCreateFolder}
                                onDelete={onDelete}
                                dependencies={dependencies}
                                onContextMenu={onContextMenu}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};

// ============================================
// CONTEXT MENU COMPONENT
// ============================================
const ContextMenu = ({ x, y, node, path, onClose, onCreateFile, onCreateFolder, onDelete, onRename }) => {
    const isFolder = node?.type === 'folder';
    const isRoot = path === '';

    return (
        <div
            className="context-menu"
            style={{ left: x, top: y }}
            onClick={(e) => e.stopPropagation()}
        >
            {(isFolder || isRoot) && (
                <>
                    <div className="context-item" onClick={() => { onCreateFile(path); onClose(); }}>
                        <FilePlus size={14} /> New File
                    </div>
                    <div className="context-item" onClick={() => { onCreateFolder(path); onClose(); }}>
                        <FolderPlus size={14} /> New Folder
                    </div>
                    <div className="context-divider" />
                </>
            )}
            {!isRoot && (
                <>
                    <div className="context-item" onClick={() => { onRename(path, node); onClose(); }}>
                        <FileText size={14} /> Rename
                    </div>
                    <div className="context-item danger" onClick={() => { onDelete(path, node); onClose(); }}>
                        <Trash2 size={14} /> Delete
                    </div>
                </>
            )}
        </div>
    );
};

// ============================================
// MAIN FILE EXPLORER COMPONENT
// ============================================
const FileExplorer = ({
    fileTree,
    setFileTree,
    selectedFile,
    onFileSelect,
    dependencies,
    onUploadFiles,
    onUploadFolder,
    onUploadZip
}) => {
    const [expandedFolders, setExpandedFolders] = useState(new Set(['']));
    const [contextMenu, setContextMenu] = useState(null);
    const [showUploadMenu, setShowUploadMenu] = useState(false);

    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);
    const zipInputRef = useRef(null);

    // Toggle folder expansion
    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    };

    // Navigate to a node in the tree
    const getNodeAtPath = (tree, pathArray) => {
        if (pathArray.length === 0 || (pathArray.length === 1 && pathArray[0] === '')) {
            return tree;
        }
        let current = tree;
        for (const part of pathArray) {
            if (!part) continue;
            if (current.children && current.children[part]) {
                current = current.children[part];
            } else {
                return null;
            }
        }
        return current;
    };

    // Create new file in tree
    const handleCreateFile = (folderPath) => {
        const name = prompt('Enter file name (e.g., helper.py):');
        if (!name) return;

        setFileTree(prev => {
            const newTree = JSON.parse(JSON.stringify(prev));
            const pathArray = folderPath ? folderPath.split('/') : [];
            const targetFolder = getNodeAtPath(newTree, pathArray);

            if (targetFolder && targetFolder.type === 'folder') {
                if (targetFolder.children[name]) {
                    alert('A file with this name already exists!');
                    return prev;
                }
                targetFolder.children[name] = {
                    type: 'file',
                    name: name,
                    content: `# ${name}\n`
                };
            }
            return newTree;
        });

        // Expand the folder to show new file
        if (folderPath) {
            setExpandedFolders(prev => new Set([...prev, folderPath]));
        }
    };

    // Create new folder in tree
    const handleCreateFolder = (parentPath) => {
        const name = prompt('Enter folder name:');
        if (!name) return;

        setFileTree(prev => {
            const newTree = JSON.parse(JSON.stringify(prev));
            const pathArray = parentPath ? parentPath.split('/') : [];
            const targetFolder = getNodeAtPath(newTree, pathArray);

            if (targetFolder && targetFolder.type === 'folder') {
                if (targetFolder.children[name]) {
                    alert('A folder with this name already exists!');
                    return prev;
                }
                targetFolder.children[name] = {
                    type: 'folder',
                    name: name,
                    children: {}
                };
            }
            return newTree;
        });

        // Expand parent to show new folder
        if (parentPath) {
            setExpandedFolders(prev => new Set([...prev, parentPath]));
        }
    };

    // Delete file or folder
    const handleDelete = (path, node) => {
        const isFolder = node.type === 'folder';
        const message = isFolder
            ? `Delete folder "${node.name}" and all its contents?`
            : `Delete file "${node.name}"?`;

        if (!window.confirm(message)) return;

        setFileTree(prev => {
            const newTree = JSON.parse(JSON.stringify(prev));
            const pathArray = path.split('/');
            const name = pathArray.pop();
            const parentPath = pathArray;
            const parent = getNodeAtPath(newTree, parentPath);

            if (parent && parent.children) {
                delete parent.children[name];
            }
            return newTree;
        });
    };

    // Rename file or folder
    const handleRename = (path, node) => {
        const newName = prompt(`Rename "${node.name}" to:`, node.name);
        if (!newName || newName === node.name) return;

        setFileTree(prev => {
            const newTree = JSON.parse(JSON.stringify(prev));
            const pathArray = path.split('/');
            const oldName = pathArray.pop();
            const parentPath = pathArray;
            const parent = getNodeAtPath(newTree, parentPath);

            if (parent && parent.children) {
                if (parent.children[newName]) {
                    alert('An item with this name already exists!');
                    return prev;
                }
                const nodeData = parent.children[oldName];
                nodeData.name = newName;
                delete parent.children[oldName];
                parent.children[newName] = nodeData;
            }
            return newTree;
        });
    };

    // Handle context menu
    const handleContextMenu = (e, path, node) => {
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            path,
            node
        });
    };

    // Close context menu when clicking outside
    const closeContextMenu = () => setContextMenu(null);

    // File upload handlers
    const handleFileInputChange = (e) => {
        if (onUploadFiles && e.target.files) {
            onUploadFiles(Array.from(e.target.files));
        }
        e.target.value = '';
        setShowUploadMenu(false);
    };

    const handleFolderInputChange = (e) => {
        if (onUploadFolder && e.target.files) {
            onUploadFolder(Array.from(e.target.files));
        }
        e.target.value = '';
        setShowUploadMenu(false);
    };

    const handleZipInputChange = (e) => {
        if (onUploadZip && e.target.files && e.target.files[0]) {
            onUploadZip(e.target.files[0]);
        }
        e.target.value = '';
        setShowUploadMenu(false);
    };

    return (
        <div className="file-explorer" onClick={closeContextMenu}>
            {/* Header */}
            <div className="explorer-header">
                <span>EXPLORER</span>
                <div className="explorer-actions">
                    <button
                        className="explorer-btn"
                        onClick={() => handleCreateFile('')}
                        title="New File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        className="explorer-btn"
                        onClick={() => handleCreateFolder('')}
                        title="New Folder"
                    >
                        <FolderPlus size={14} />
                    </button>
                    <div className="upload-dropdown">
                        <button
                            className="explorer-btn"
                            onClick={() => setShowUploadMenu(!showUploadMenu)}
                            title="Upload"
                        >
                            <Upload size={14} />
                        </button>
                        {showUploadMenu && (
                            <div className="upload-menu">
                                <div className="upload-item" onClick={() => fileInputRef.current?.click()}>
                                    <FileText size={14} /> Upload Files
                                </div>
                                <div className="upload-item" onClick={() => folderInputRef.current?.click()}>
                                    <Folder size={14} /> Upload Folder
                                </div>
                                <div className="upload-item" onClick={() => zipInputRef.current?.click()}>
                                    <FileCode size={14} /> Upload ZIP
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
                accept=".py,.java,.js,.jsx,.ts,.tsx,.json,.txt,.md,.css,.html"
            />
            <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderInputChange}
            />
            <input
                ref={zipInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleZipInputChange}
                accept=".zip"
            />

            {/* Tree */}
            <div className="explorer-tree">
                {fileTree.children && Object.entries(fileTree.children)
                    .sort(([, a], [, b]) => {
                        if (a.type === 'folder' && b.type !== 'folder') return -1;
                        if (a.type !== 'folder' && b.type === 'folder') return 1;
                        return a.name.localeCompare(b.name);
                    })
                    .map(([name, node]) => (
                        <TreeNode
                            key={name}
                            node={node}
                            path={[name]}
                            depth={0}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            selectedFile={selectedFile}
                            onFileSelect={onFileSelect}
                            onCreateFile={handleCreateFile}
                            onCreateFolder={handleCreateFolder}
                            onDelete={handleDelete}
                            dependencies={dependencies}
                            onContextMenu={handleContextMenu}
                        />
                    ))}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    node={contextMenu.node}
                    path={contextMenu.path}
                    onClose={closeContextMenu}
                    onCreateFile={handleCreateFile}
                    onCreateFolder={handleCreateFolder}
                    onDelete={handleDelete}
                    onRename={handleRename}
                />
            )}
        </div>
    );
};

export default FileExplorer;
