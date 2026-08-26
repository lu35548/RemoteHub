import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Layout, Network, Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectListItem, ProjectDetail, UserPublic } from '@remotehub/shared';
import { api, setAccessToken } from './api/client';
import { useMe, useLogout, useProjects, useConnections, useCreateProject, useUpdateProject, useDeleteProject } from './api/queries';
import Sidebar from './components/Sidebar';
import ProjectModal, { type ProjectFormInput } from './components/ProjectModal';
import { useUI } from './components/UIComponents';

// Helper for consistent avatar colors based on User ID（v1 原样）
const getAvatarColor = (userId: string) => {
  const gradients = [
    'from-rose-500 to-orange-500',
    'from-orange-500 to-amber-500',
    'from-emerald-500 to-teal-600',
    'from-teal-500 to-cyan-600',
    'from-cyan-500 to-blue-600',
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-fuchsia-500 to-pink-600'
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

const AppContent: React.FC<{ currentUser: UserPublic }> = ({ currentUser }) => {
  const { toast, confirm } = useUI();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();

  // 大 pageSize 一次拉全（后端 MAX_PAGE_SIZE=100 上限，spec 决策 3 的「200」勘误为上限值；个人项目量级足够）
  const { data: projectsPage } = useProjects(1, 100);
  const { data: connectionsPage } = useConnections(undefined, 1, 100);
  const projects = useMemo(() => projectsPage?.data ?? [], [projectsPage]);
  const connections = useMemo(() => connectionsPage?.data ?? [], [connectionsPage]);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'vpn'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // T8（在线状态票）将接线心跳填充；T4 中间态为空列表（UI 显示 0 人在线）
  const onlineUsers: UserPublic[] = [];

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDetail | null>(null);

  // 项目过滤 + 搜索（vpn/host 分组与 ConnectionCard 渲染在 T5 接线）
  const relevantConnections = useMemo(() => {
    let list = connections;
    if (activeProjectId) {
      list = list.filter(c => c.projectId === activeProjectId);
    }
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      list = list.filter(conn =>
        conn.name.toLowerCase().includes(searchLower) ||
        conn.host.toLowerCase().includes(searchLower) ||
        (conn.tags ?? '').toLowerCase().includes(searchLower)
      );
    }
    return list;
  }, [connections, activeProjectId, searchQuery]);

  const handleSaveProject = async (input: ProjectFormInput) => {
    try {
      if (editingProject) {
        const savedProject = await updateProjectMutation.mutateAsync({ id: editingProject.id, data: input });
        setActiveProjectId(savedProject.id);
      } else {
        const savedProject = await createProjectMutation.mutateAsync(input);
        setActiveProjectId(savedProject.id);
      }
      setViewMode('all');
      setIsProjectModalOpen(false);
    } catch (e) {
      toast('error', '保存失败', '无法写入项目数据');
      throw e; // Re-throw for Modal to handle
    }
  };

  const handleEditProject = async (project: ProjectListItem) => {
    try {
      // 列表项无 description，编辑前拉详情补全
      const detail = await queryClient.fetchQuery({
        queryKey: ['projects', project.id],
        queryFn: () => api.get<ProjectDetail>(`/projects/${project.id}`),
      });
      setEditingProject(detail);
      setIsProjectModalOpen(true);
    } catch {
      toast('error', '加载失败', '无法获取项目详情');
    }
  };

  const handleDeleteProject = (id: string) => {
    confirm({
      title: '删除项目确认',
      message: '警告：删除项目将同时删除该项目下所有的连接资源！此操作不可恢复，确定要继续吗？',
      variant: 'danger',
      confirmText: '确认删除',
      onConfirm: async () => {
        try {
          await deleteProjectMutation.mutateAsync(id);
          if (activeProjectId === id) setActiveProjectId(null);
          toast('success', '项目已删除', '相关资源已一并清理');
        } catch {
          toast('error', '删除失败', '无法执行删除操作');
        }
      }
    });
  };

  // 注：v1 的导出/导入是死功能链（Sidebar 从无导出按钮，Download/Upload 为死 import），等价迁移时整链移除

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      // 内存 token 必须清除，否则 requireUnauth 守卫会弹回主界面
      setAccessToken(null);
      navigate('/login');
    }
  };

  const getHeaderTitle = () => {
    if (activeProjectId && projects && projects.length > 0) {
      const project = projects.find(p => p.id === activeProjectId);
      if (project) return project.name;
    }
    if (viewMode === 'vpn') return 'VPN 网络通道管理';
    return '所有远程资源';
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        viewMode={viewMode}
        onSelectProject={setActiveProjectId}
        onSelectViewMode={setViewMode}
        onAddProject={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
        onEditProject={handleEditProject}
        onDeleteProject={handleDeleteProject}
        onLogout={handleLogout}
        currentUser={currentUser}
        onOpenUserModal={() => toast('info', '用户管理', '该功能将在后续版本开放')}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-950">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <h2 className="text-lg font-bold text-white flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
               {viewMode === 'vpn' && !activeProjectId ? <Network className="text-indigo-400" /> : <Server className="text-blue-400" />}
               {getHeaderTitle()}
             </h2>
             <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full">
               {relevantConnections.length}
             </span>
          </div>

          <div className="flex items-center gap-6">
             {/* Online Users Avatar Stack - Dynamic Spacing & Gradient（心跳接线在 T8；当前空列表中间态） */}
             <div className="flex items-center gap-4 animate-in fade-in duration-500">
                <div className="flex items-center h-8 pl-2">
                  {onlineUsers.slice(0, 10).map((u, i) => {
                    const count = Math.min(onlineUsers.length, 10);
                    let overlap = -8;
                    if (count <= 3) overlap = 4;
                    else if (count <= 6) overlap = -4;

                    return (
                      <div
                        key={u.id}
                        className={`inline-flex h-8 w-8 rounded-full ring-2 ring-slate-950 bg-gradient-to-br ${getAvatarColor(u.id)} items-center justify-center text-xs text-white font-bold shadow-md relative transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:z-50 hover:ring-slate-800`}
                        title={`${u.nickname} (在线)`}
                        style={{
                          marginLeft: i === 0 ? 0 : `${overlap}px`,
                          zIndex: 20 - i
                        }}
                      >
                        {u.nickname[0]?.toUpperCase()}
                      </div>
                    );
                  })}
                  {onlineUsers.length > 10 && (
                     <div
                       className="inline-flex h-8 w-8 rounded-full ring-2 ring-slate-950 bg-slate-800 items-center justify-center text-[10px] text-slate-400 font-bold z-0 shadow-inner"
                       style={{ marginLeft: '-8px' }}
                     >
                       +{onlineUsers.length - 10}
                     </div>
                  )}
                </div>

                {/* Count Badge */}
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium text-slate-300">{onlineUsers.length}</span> 人在线
                </div>
             </div>

            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                placeholder="搜索主机, IP, 标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm w-64 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
              />
            </div>
            <button
              onClick={() => toast('info', '新建资源', '连接管理将在后续版本开放')}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 active:scale-95"
            >
              <Plus size={16} />
              新建资源
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
          {relevantConnections.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-20 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-slate-900/50 border border-slate-800 rounded-full flex items-center justify-center mb-6">
                {viewMode === 'vpn' ? <Network size={40} className="opacity-30" /> : <Layout size={40} className="opacity-30" />}
              </div>
              <p className="text-lg font-medium text-slate-400">
                {searchQuery ? '未找到匹配的资源' : '暂无资源配置'}
              </p>
              <p className="text-sm opacity-60 mt-2">点击右上角新建按钮开始添加</p>
            </div>
          )}
          {/* 连接卡片区（ConnectionCard/ConnectionModal）在 T5 迁移接线 */}
        </div>
      </main>

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProject}
        editingProject={editingProject}
      />
    </div>
  );
};

// 路由 / 的入口：loader 已挡未登录；此处拉取当前用户（token 过期且 refresh 失败时送回登录页）
const App: React.FC = () => {
  const { data: currentUser, isPending, isError } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (isError) {
      // 双保险：client 层 refresh 已自救，这里兜底清 token（防 requireUnauth 见残留 token 弹回）
      setAccessToken(null);
      navigate('/login', { replace: true });
    }
  }, [isError, navigate]);

  if (isPending) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;
  }
  if (!currentUser) return null;

  return <AppContent currentUser={currentUser} />;
};

export default App;
