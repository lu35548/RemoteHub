import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, Monitor, Network, PanelLeftClose, PanelLeftOpen, Search, X, LogOut, Settings, MoreVertical, Edit2, Trash2, LayoutDashboard, Users, Archive, FolderDown, ArrowLeftRight, RotateCcw, ChevronDown } from 'lucide-react';
import type { ProjectListItem, UserPublic } from '@remotehub/shared';
import { Tooltip } from './UIComponents';
import { Pagination } from './Pagination';
import { ProjectIcon } from './ProjectIcons';
import { ARCHIVED_LIST_PAGE_SIZE } from '../constants';
import type { ProjectListItemWithStatus } from '../api/queries';

interface SidebarProps {
  projects: ProjectListItem[];
  activeProjectId: string | null;
  viewMode: 'all' | 'vpn';
  onSelectProject: (id: string | null) => void;
  onSelectViewMode: (mode: 'all' | 'vpn') => void;
  onAddProject: () => void;
  onEditProject: (project: ProjectListItem) => void;
  onDeleteProject: (id: string) => void;
  /** #40 成员管理弹窗入口（admin 直通或项目成员可见） */
  onManageMembers: (project: ProjectListItem) => void;
  onLogout: () => void;
  currentUser: UserPublic;
  onOpenUserModal: () => void;
  /** #49 项目列表受控分页（page state 在 App 层，服务端分页） */
  projectPage?: number;
  projectTotal?: number;
  onProjectPageChange?: (page: number) => void;
  /** #49 移动抽屉（<md 生效；桌面常驻不受影响） */
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  // ── #48 项目管理增强 ──
  /** 归档项目列表（App 层拉取传入，Sidebar 保持哑组件；空数组/缺省 = 归档区不渲染） */
  archivedProjects?: ProjectListItemWithStatus[];
  /** 归档总数（折叠钮计数 + 归档分页 total） */
  archivedTotal?: number;
  /** 归档列表受控分页（归档区展开且跨页时显示 Pagination） */
  archivedPage?: number;
  onArchivedPageChange?: (page: number) => void;
  /** 归档菜单入口回调（App 层 confirm + mutation；缺省 = 入口不渲染，向后兼容旧 props 基准） */
  onArchiveProject?: (project: ProjectListItem) => void;
  onCopyProject?: (project: ProjectListItem) => void;
  onTransferProject?: (project: ProjectListItem) => void;
  /** 恢复入口回调（App 层 mutation；缺省 = 归档区不渲染） */
  onRestoreProject?: (project: ProjectListItemWithStatus) => void;
  /** #48 rev：归档区条目点击（App 层据此记录归档视图事实——与归档列表当前页解耦的只读态判定，
   *  见 App.tsx archivedView 注记；在 onSelectProject 之后调用，App 侧顺序依赖） */
  onSelectArchivedProject?: (project: ProjectListItemWithStatus) => void;
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
  onManageMembers,
  onLogout,
  currentUser,
  onOpenUserModal,
  projectPage = 1,
  projectTotal = 0,
  onProjectPageChange,
  isMobileOpen = false,
  onMobileClose,
  archivedProjects,
  archivedTotal = 0,
  archivedPage = 1,
  onArchivedPageChange,
  onArchiveProject,
  onCopyProject,
  onTransferProject,
  onRestoreProject,
  onSelectArchivedProject,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  // #48 归档折叠区开合（默认收起：归档项目非工作台主角，「默认隐藏」语义）
  const [archivedOpen, setArchivedOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // M3（#49 rev）：抽屉打开即移焦至关闭按钮（焦点入抽屉，Tab 序从抽屉开始 + Escape 可达）。
  // 双路移焦（lead 两轮真机实证定案）：
  // ① 双 rAF 首帧兜底——首次开抽屉有效；但关→开循环后 rAF 回调与渲染帧合并，等不到 style
  //    recalc（按钮 used visibility 仍 invisible，Chrome 静默拒绝 focus），循环场景恒失效；
  // ② transitionend 与 CSS 严格同步——visibility 过渡（300ms）结束事件是可靠信号，根治循环
  //    失效；桌面 md 以上关态也 visible、无 visibility 过渡，不触发，常驻侧栏不受影响。
  // focus 幂等（已聚焦再 focus 无害），双路并存无副作用。
  useEffect(() => {
    if (!isMobileOpen) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => closeButtonRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isMobileOpen]);

  /** ② visibility 过渡结束 → 移焦（仅抽屉容器自身的 visibility 过渡；width 折叠过渡不过滤会误触） */
  const handleDrawerTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === 'visibility' && isMobileOpen) {
      closeButtonRef.current?.focus();
    }
  };

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
      id="mobile-sidebar"
      onKeyDown={(e) => {
        // M3：焦点在抽屉内（打开即移焦至此）按 Escape 关闭抽屉
        if (e.key === 'Escape') onMobileClose?.();
      }}
      onTransitionEnd={handleDrawerTransitionEnd}
      className={`
        fixed inset-y-0 left-0 z-40 h-full flex flex-col border-r border-white/5 bg-slate-950/80 backdrop-blur-xl md:static md:z-20 md:shrink-0
        transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]
        ${isMobileOpen ? 'translate-x-0 visible' : '-translate-x-full md:translate-x-0 invisible md:visible'}
        w-[280px] ${isCollapsed ? 'md:w-[80px]' : 'md:w-[280px]'}
      `}
      aria-label="主导航"
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
        
        {/* #49 桌面折叠按钮：移动抽屉隐藏（折叠是桌面语义）；a11y aria-label 落位 */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="折叠侧栏"
          className={`text-slate-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 active:scale-90 duration-200 hidden md:block ${isCollapsed ? 'mx-auto' : ''}`}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        {/* #49 移动抽屉关闭按钮（仅抽屉打开时渲染，<md 显示；M3 打开即移焦至此） */}
        {isMobileOpen && (
          <button
            ref={closeButtonRef}
            onClick={onMobileClose}
            aria-label="关闭导航菜单"
            className="text-slate-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 active:scale-90 duration-200 md:hidden"
          >
            <X size={20} />
          </button>
        )}
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
                           role="button"
                           tabIndex={0}
                           aria-label={`项目操作 ${project.name}`}
                           onClick={(e) => toggleProjectMenu(e, project.id)}
                           onKeyDown={(e) => {
                             // 键盘可达：Enter/Space 与 onClick 同逻辑（stopPropagation + 切换菜单）；Space 阻默认滚动
                             if (e.key === 'Enter' || e.key === ' ') {
                               e.preventDefault();
                               e.stopPropagation();
                               setProjectMenuOpenId(projectMenuOpenId === project.id ? null : project.id);
                             }
                           }}
                           className={`p-1 rounded-md transition-all ${projectMenuOpenId === project.id ? 'text-white bg-white/10' : 'text-slate-600 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100'}`}
                         >
                           <MoreVertical size={14} />
                         </div>
                         {projectMenuOpenId === project.id && (
                            <div className="absolute right-0 top-8 w-32 bg-slate-900/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl z-50 py-1 animate-in fade-in zoom-in duration-200 origin-top-right ring-1 ring-black/50">
                              {/* #40 成员管理入口：admin 全局直通或项目成员（对齐后端 member 权限链，非成员遮蔽） */}
                              {(currentUser.role === 'admin' || !!project.currentUserRole) && (
                                <div
                                  onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onManageMembers(project); }}
                                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Users size={12} /> 成员管理
                                </div>
                              )}
                              {/* #48 管理操作入口：owner 或 admin 直通可见（对齐五端点 projectRole('owner')+admin 门）；
                                  handler 缺省点击无动作（App 恒传），可见性只由权限决定 */}
                              {(currentUser.role === 'admin' || project.currentUserRole === 'owner') && (
                                <>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onArchiveProject?.(project); }}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <Archive size={12} /> 归档项目
                                  </div>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onCopyProject?.(project); }}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <FolderDown size={12} /> 复制项目
                                  </div>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setProjectMenuOpenId(null); onTransferProject?.(project); }}
                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                                  >
                                    <ArrowLeftRight size={12} /> 转让所有权
                                  </div>
                                </>
                              )}
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

          {/* #48 归档折叠视图：默认收起（归档项目「工作台默认隐藏」语义）、折叠态隐藏（紧凑模式）。
              条目点击进入归档项目视图（onSelectArchivedProject 回传完整对象，App 层记只读态事实，
              #48 rev 与归档列表当前页解耦）；恢复入口 owner|admin 可见（对齐后端 restore 权限门） */}
          {!isCollapsed && (archivedProjects?.length ?? 0) > 0 && (
            <div className="mt-2 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setArchivedOpen(!archivedOpen)}
                aria-expanded={archivedOpen}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
              >
                <Archive size={12} />
                <span className="text-[11px] font-bold uppercase tracking-widest">已归档 ({archivedTotal})</span>
                <ChevronDown size={12} className={`ml-auto transition-transform ${archivedOpen ? 'rotate-180' : ''}`} />
              </button>
              {archivedOpen && (
                <div role="region" className="mt-1 space-y-1" aria-label="已归档项目区">
                  {archivedProjects!.map((p) => {
                    const canRestore = currentUser.role === 'admin' || p.currentUserRole === 'owner';
                    return (
                      <div key={p.id} className="flex items-center gap-1 group/arch rounded-lg hover:bg-white/5 transition-colors">
                        <button
                          onClick={() => { onSelectViewMode('all'); onSelectProject(p.id); onSelectArchivedProject?.(p); }}
                          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-500 hover:text-slate-200 truncate"
                        >
                          <ProjectIcon name={p.icon} size={14} className="text-slate-600 flex-shrink-0" />
                          <span className="truncate">{p.name}</span>
                        </button>
                        {canRestore && onRestoreProject && (
                          <button
                            onClick={() => onRestoreProject(p)}
                            aria-label={`恢复 ${p.name}`}
                            title="恢复项目"
                            className="p-1.5 mr-1 rounded-md text-slate-600 hover:text-emerald-400 hover:bg-white/10 opacity-0 group-hover/arch:opacity-100 transition-all active:scale-90"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {/* 归档分页：跨页才渲染 footer（单页不占位，复用 Pagination 先例）；页大小与 App 归档查询同常量 */}
                  {archivedTotal > archivedProjects!.length && onArchivedPageChange && (
                    <Pagination page={archivedPage} total={archivedTotal} pageSize={ARCHIVED_LIST_PAGE_SIZE} onPageChange={onArchivedPageChange} className="px-1 pt-1" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* #49 项目列表受控分页 footer：total>0 才渲染；折叠态隐藏（紧凑模式不放分页） */}
        {!isCollapsed && projectTotal > 0 && onProjectPageChange && (
          <Pagination page={projectPage} total={projectTotal} pageSize={100} onPageChange={onProjectPageChange} className="mt-2 px-1" />
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-slate-900/30 space-y-2 flex-shrink-0 backdrop-blur-md">
         {/* 管理后台入口：仅 admin 渲染（入口隐藏而非仅路由拒绝，票 #21） */}
         {currentUser?.role === 'admin' && (
           <Tooltip content="管理后台" side="right" className={isCollapsed ? 'w-full' : ''}>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-blue-200 hover:bg-blue-500/10 rounded-xl transition-colors duration-200 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <LayoutDashboard size={16} />
              {!isCollapsed && <span className="text-xs font-medium">管理后台</span>}
            </button>
           </Tooltip>
         )}

         <Tooltip content={currentUser.nickname} side="right" className={isCollapsed ? 'w-full' : ''}>
            <button 
              onClick={onOpenUserModal}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors group border border-transparent hover:border-white/5 ${isCollapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 ring-2 ring-slate-950 flex-shrink-0 group-hover:scale-105 transition-transform">
                {(currentUser.nickname || currentUser.username || 'U')[0]?.toUpperCase()}
              </div>
              {!isCollapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-xs font-bold truncate tracking-tight text-white">{currentUser.nickname || currentUser.username}</div>
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