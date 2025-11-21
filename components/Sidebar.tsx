import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LayoutGrid, Plus, Monitor, Download, Upload, Network, PanelLeftClose, PanelLeftOpen, Server, Search, X, LogOut, User as UserIcon, Settings, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { Project, User } from '../types';
import { Tooltip } from './UIComponents';
import { ProjectIcon } from './ProjectIcons';

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
  onOpenUserModal
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lowerTerm = searchTerm.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(lowerTerm));
  }, [projects, searchTerm]);

  const handleSearchClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      searchInputRef.current?.focus();
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

  const toggleProjectMenu = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectMenuOpenId(projectMenuOpenId === projectId ? null : projectId);
  };

  useEffect(() => {
    const closeMenu = () => setProjectMenuOpenId(null);
    if (projectMenuOpenId) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [projectMenuOpenId]);

  return (
    <div 
      className={`
        h-full flex flex-col border-r border-white/5 bg-slate-950/80 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)] relative z-20
        ${isCollapsed ? 'w-[80px]' : 'w-[280px]'}
      `}
    >
      {/* Header Area */}
      <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 flex-shrink-0">
        <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            <Monitor className="text-white w-5 h-5 drop-shadow-md" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            RemoteHub
          </h1>
        </div>
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`text-slate-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 active:scale-90 duration-200 ${isCollapsed ? 'mx-auto' : ''}`}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar space-y-8 overflow-x-hidden">
        
        {/* Main Views */}
        <div className="space-y-1.5">
          {!isCollapsed && <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-3 animate-in fade-in duration-300">工作台</h2>}
          <Tooltip content="所有资源" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => { onSelectViewMode('all'); onSelectProject(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                viewMode === 'all' && activeProjectId === null
                  ? 'bg-blue-600/10 text-blue-100 border border-blue-500/20 shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              {viewMode === 'all' && activeProjectId === null && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />}
              <LayoutGrid size={20} className={`flex-shrink-0 transition-colors ${viewMode === 'all' && activeProjectId === null ? 'text-blue-400' : 'group-hover:text-white'}`} />
              {!isCollapsed && <span className="text-sm font-medium truncate tracking-tight">所有资源</span>}
            </button>
          </Tooltip>

          <Tooltip content="VPN 网络管理" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => { onSelectViewMode('vpn'); onSelectProject(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden ${
                viewMode === 'vpn'
                  ? 'bg-indigo-600/10 text-indigo-100 border border-indigo-500/20 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              {viewMode === 'vpn' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.8)]" />}
              <Network size={20} className={`flex-shrink-0 transition-colors ${viewMode === 'vpn' ? 'text-indigo-400' : 'group-hover:text-white'}`} />
              {!isCollapsed && <span className="text-sm font-medium truncate tracking-tight">VPN 网络管理</span>}
            </button>
          </Tooltip>
        </div>

        {/* Projects Section */}
        <div>
          <div className={`flex items-center ${isCollapsed ? 'justify-center mb-4' : 'justify-between mb-3 px-3'}`}>
            {!isCollapsed && <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest animate-in fade-in">客户项目</h2>}
            <Tooltip content="添加项目" side="right">
              <button 
                onClick={onAddProject}
                className={`text-slate-500 hover:text-white transition-all hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-600/30 rounded-lg active:scale-90 duration-200 ${isCollapsed ? 'p-2 bg-white/5' : 'p-1'}`}
              >
                <Plus size={isCollapsed ? 18 : 14} />
              </button>
            </Tooltip>
          </div>

          {/* Search */}
          <div className={`mb-4 px-1 transition-all duration-300 ${isCollapsed ? 'flex justify-center' : ''}`}>
            {isCollapsed ? (
              <Tooltip content="搜索客户" side="right">
                <button 
                  onClick={handleSearchClick}
                  className="p-2.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <Search size={18} />
                </button>
              </Tooltip>
            ) : (
              <div className="relative group animate-in fade-in zoom-in-95 duration-300 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors w-3.5 h-3.5" />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索客户..."
                  className="w-full bg-slate-900/50 border border-white/10 text-slate-200 text-xs rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                />
                {searchTerm && (
                  <button 
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* List */}
          <div className="space-y-1 min-h-[100px]">
            {filteredProjects.length === 0 && !isCollapsed && (
              <div className="px-4 py-8 text-center text-xs text-slate-600 animate-in fade-in italic">
                未找到相关客户
              </div>
            )}
            {filteredProjects.map((project) => (
              <Tooltip key={project.id} content={project.name} side="right" className={isCollapsed ? 'w-full' : ''}>
                <button
                  onClick={() => { onSelectViewMode('all'); onSelectProject(project.id); }}
                  className={`w-full relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    activeProjectId === project.id && viewMode === 'all'
                      ? 'bg-white/10 text-white shadow-inner border border-white/5'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  {activeProjectId === project.id && viewMode === 'all' && !isCollapsed && (
                     <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                  )}
                  
                  {isCollapsed ? (
                     <ProjectIcon name={project.icon} size={20} className={activeProjectId === project.id ? 'text-blue-400 drop-shadow-md' : 'text-slate-500'} />
                  ) : (
                    <>
                      <ProjectIcon name={project.icon} size={18} className={`transition-all duration-300 ${activeProjectId === project.id ? 'text-blue-400 drop-shadow-md scale-110' : 'text-slate-500 group-hover:text-slate-300'}`} />
                      <span className="text-sm font-medium truncate text-left flex-1 tracking-tight">{project.name}</span>
                      
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                         <div 
                           onClick={(e) => toggleProjectMenu(e, project.id)}
                           className={`p-1 rounded-md transition-all ${projectMenuOpenId === project.id ? 'text-white bg-white/10' : 'text-slate-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100'}`}
                         >
                           <MoreVertical size={14} />
                         </div>
                         {projectMenuOpenId === project.id && (
                            <div className="absolute right-0 top-8 w-32 bg-slate-900/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl z-50 py-1 animate-in fade-in zoom-in duration-200 origin-top-right ring-1 ring-black/50">
                              <div 
                                onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onEditProject(project); }}
                                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Edit2 size={12} /> 编辑
                              </div>
                              <div 
                                onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onDeleteProject(project.id); }}
                                className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-rose-600 hover:text-white flex items-center gap-2 border-t border-white/5 cursor-pointer transition-colors"
                              >
                                <Trash2 size={12} /> 删除
                              </div>
                            </div>
                         )}
                      </div>
                    </>
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-slate-900/30 space-y-2 flex-shrink-0 backdrop-blur-md">
         <Tooltip content={currentUser.nickname} side="right" className={isCollapsed ? 'w-full' : ''}>
            <button 
              onClick={onOpenUserModal}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors group border border-transparent hover:border-white/5 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 ring-2 ring-slate-950 flex-shrink-0 group-hover:scale-105 transition-transform">
                {currentUser.nickname[0]}
              </div>
              {!isCollapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-xs font-bold truncate tracking-tight text-white">{currentUser.nickname}</div>
                  <div className="text-[10px] text-slate-500 truncate uppercase font-semibold tracking-wider">{currentUser.role}</div>
                </div>
              )}
              {!isCollapsed && <Settings size={14} className="text-slate-600 group-hover:text-slate-300 transition-colors" />}
            </button>
         </Tooltip>

         <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2" />

         <Tooltip content="退出登录" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button onClick={onLogout} className={`w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors duration-200 ${isCollapsed ? 'justify-center' : ''}`}>
              <LogOut size={16} />
              {!isCollapsed && <span className="text-xs font-medium">退出登录</span>}
            </button>
         </Tooltip>
      </div>
    </div>
  );
};

export default Sidebar;