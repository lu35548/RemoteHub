import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LayoutGrid, Plus, Monitor, Download, Upload, Network, PanelLeftClose, PanelLeftOpen, Server, Search, X, LogOut, User as UserIcon, Settings, MoreVertical, Edit2, Trash2, Database } from 'lucide-react';
import { Project, User, UserRole } from '../types';
import { Tooltip } from './UIComponents';
import { ProjectIcon } from './ProjectIcons';

// 🔥 集成配置服务
import { config } from '../services/config.service';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  viewMode: 'all' | 'vpn';
  onSelectProject: (id: string | null) => void;
  onSelectViewMode: (mode: 'all' | 'vpn') => void;
  onAddProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
  currentUser: User;
  onOpenUserModal: () => void;
  // 🔥 新增：数据库配置回调
  onOpenDatabaseConfig?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  projects,
  activeProjectId,
  viewMode,
  onSelectProject,
  onSelectViewMode,
  onAddProject,
  onEditProject,
  onDeleteProject,
  onExport,
  onImport,
  onLogout,
  currentUser,
  onOpenUserModal,
  onOpenDatabaseConfig
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 🔥 检查是否显示数据库配置按钮
  const shouldShowDatabaseConfig = config.isDatabaseConfigModalEnabled() && currentUser.role === UserRole.ADMIN;

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lowerTerm = searchTerm.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(lowerTerm));
  }, [projects, searchTerm]);

  const handleSearchClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      searchInputRef.current?.focus();
    }
  };

  const handleProjectClick = (projectId: string) => {
    onSelectProject(projectId === activeProjectId ? null : projectId);
    if (isCollapsed) setIsCollapsed(false);
  };

  return (
    <div className={`flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-sm">RH</span>
          </div>
          {!isCollapsed && (
            <span className="text-white font-bold text-sm">RemoteHub</span>
          )}
        </div>
        <Tooltip content={isCollapsed ? '展开侧边栏' : '收起侧边栏'} side="right">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </Tooltip>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-800">
        {!isCollapsed && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索项目..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}
        {isCollapsed && (
          <Tooltip content="搜索项目" side="right">
            <button
              onClick={handleSearchClick}
              className="w-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Search className="w-4 h-4 mx-auto" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className="px-3 pb-2 border-b border-slate-800">
        <div className={`grid ${isCollapsed ? 'grid-cols-1' : 'grid-cols-2'} gap-1`}>
          <Tooltip content="所有资源" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => onSelectViewMode('all')}
              className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              } ${isCollapsed ? '' : 'gap-2'}`}
            >
              <LayoutGrid className={isCollapsed ? 'w-4 h-4' : 'w-4 h-4'} />
              {!isCollapsed && <span className="text-xs">全部</span>}
            </button>
          </Tooltip>
          <Tooltip content="VPN网络" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => onSelectViewMode('vpn')}
              className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                viewMode === 'vpn'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              } ${isCollapsed ? '' : 'gap-2'}`}
            >
              <Network className={isCollapsed ? 'w-4 h-4' : 'w-4 h-4'} />
              {!isCollapsed && <span className="text-xs">VPN</span>}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          {!isCollapsed && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">项目</span>
              <button
                onClick={onAddProject}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className={`text-center py-4 ${isCollapsed ? '' : 'px-2'}`}>
              {!isCollapsed ? (
                <div className="text-slate-500 text-sm">暂无项目</div>
              ) : (
                <Tooltip content="暂无项目" side="right">
                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                    <span className="text-slate-600 text-xs">0</span>
                  </div>
                </Tooltip>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredProjects.map((project) => {
                const isActive = activeProjectId === project.id;
                const connectionCount = Math.floor(Math.random() * 10) + 1; // Simulated count

                return (
                  <Tooltip
                    key={project.id}
                    content={`${project.name} (${connectionCount} 连接)`}
                    side="right"
                    className={isCollapsed ? 'w-full' : ''}
                  >
                    <button
                      onClick={() => handleProjectClick(project.id)}
                      className={`w-full group relative p-2 rounded-lg transition-all ${
                        isActive
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                      } ${isCollapsed ? 'flex items-center justify-center' : 'flex items-center gap-2'}`}
                    >
                      <ProjectIcon
                        icon={project.icon}
                        size={isCollapsed ? 'sm' : 'md'}
                        className={isActive ? 'text-blue-400' : 'text-slate-500'}
                      />
                      {!isCollapsed && (
                        <>
                          <div className="flex-1 text-left">
                            <div className="text-sm font-medium truncate">{project.name}</div>
                            <div className="text-xs opacity-60">{connectionCount} 连接</div>
                          </div>
                          <div
                            className="relative group-hover:opacity-100 opacity-0 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectMenuOpenId(projectMenuOpenId === project.id ? null : project.id);
                            }}
                          >
                            <MoreVertical size={14} />
                          </div>
                        </>
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        {/* 🔥 数据库配置按钮 (仅管理员可见) */}
        {shouldShowDatabaseConfig && (
          <Tooltip content="数据库配置" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => onOpenDatabaseConfig?.()}
              className={`w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors group border border-transparent hover:border-white/5 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <Database className={isCollapsed ? 'w-4 h-4' : 'w-4 h-4 text-slate-400 group-hover:text-blue-400'} />
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left text-xs">
                    <div className="font-medium truncate">数据库配置</div>
                    <div className="text-slate-500">管理员功能</div>
                  </div>
                </>
              )}
            </button>
          </Tooltip>
        )}

        {/* 用户管理 */}
        <Tooltip content={currentUser.nickname} side="right" className={isCollapsed ? 'w-full' : ''}>
          <button
            onClick={onOpenUserModal}
            className={`w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors group border border-transparent hover:border-white/5 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-lg flex-shrink-0">
              {currentUser.nickname[0]}
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-xs font-bold truncate text-white">{currentUser.nickname}</div>
                  <div className="text-[10px] text-slate-500 truncate uppercase font-semibold tracking-wider">{currentUser.role}</div>
                </div>
                <Settings size={12} className="text-slate-400 group-hover:text-slate-300 transition-colors" />
              </>
            )}
          </button>
        </Tooltip>

        {/* 导出/导入 */}
        {!isCollapsed && (
          <div className="flex gap-1">
            <Tooltip content="导出配置" side="top">
              <button
                onClick={onExport}
                className="flex-1 flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Download size={14} />
              </button>
            </Tooltip>
            <Tooltip content="导入配置" side="top">
              <label className="flex-1 flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
                <Upload size={14} />
                <input
                  type="file"
                  accept=".json"
                  onChange={onImport}
                  className="hidden"
                />
              </label>
            </Tooltip>
          </div>
        )}

        {/* 登出 */}
        <Tooltip content="退出登录" side="right" className={isCollapsed ? 'w-full' : ''}>
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          >
            <LogOut className={isCollapsed ? 'w-4 h-4' : 'w-4 h-4'} />
            {!isCollapsed && <span className="text-sm">退出</span>}
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Sidebar;