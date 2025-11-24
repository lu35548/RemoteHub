import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Layout, Network, Server, Shield } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ConnectionCard from './components/ConnectionCard';
import ConnectionModal from './components/ConnectionModal';
import ProjectModal from './components/ProjectModal';
import LoginPage from './components/LoginPage';
import { UserManagementModal } from './components/UserManagementModal';
import { UIProvider, useUI } from './components/UIComponents';
import { Project, RemoteConnection, Protocol, User as UserType, ProjectInput, ConnectionInput } from './types';
import { AuthService } from './services/auth.service';
import { DataService } from './services/data.service';

interface AppContentProps {
  currentUser: UserType;
  onLogout: () => void;
}

// Helper for consistent avatar colors based on User ID
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

const AppContent: React.FC<AppContentProps> = ({ currentUser, onLogout }) => {
  const { toast, confirm } = useUI();

  const [projects, setProjects] = useState<Project[]>([]);
  const [connections, setConnections] = useState<RemoteConnection[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'vpn'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<UserType[]>([]);

  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<RemoteConnection | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  useEffect(() => {
    refreshData();
    const updateOnlineUsers = async () => {
      await AuthService.heartbeat();
      const users = await AuthService.getOnlineUsers();
      setOnlineUsers(users);
    };
    
    updateOnlineUsers(); // Initial fetch
    const timer = setInterval(updateOnlineUsers, 5000);
    
    return () => clearInterval(timer);
  }, []);

  const refreshData = async () => {
    setIsLoadingData(true);
    try {
      const [p, c] = await Promise.all([
        DataService.getProjects(),
        DataService.getConnections()
      ]);
      setProjects(p);
      setConnections(c);
    } catch (err) {
      toast('error', '数据加载失败');
    } finally {
      setIsLoadingData(false);
    }
  };

  const { hosts, vpns } = useMemo(() => {
    let relevantConnections = connections;

    if (activeProjectId) {
      relevantConnections = relevantConnections.filter(c => c.projectId === activeProjectId);
    } else {
      if (viewMode === 'vpn') {
        relevantConnections = relevantConnections.filter(c => c.protocol === Protocol.VPN);
      } else {
        relevantConnections = relevantConnections.filter(c => c.protocol !== Protocol.VPN);
      }
    }

    const searchLower = searchQuery.toLowerCase();
    if (searchQuery) {
      relevantConnections = relevantConnections.filter(conn => 
        conn.name.toLowerCase().includes(searchLower) ||
        conn.host.toLowerCase().includes(searchLower) ||
        conn.username?.toLowerCase().includes(searchLower) ||
        conn.tags?.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    const vpnList = relevantConnections.filter(c => c.protocol === Protocol.VPN);
    const hostList = relevantConnections.filter(c => c.protocol !== Protocol.VPN);

    return { hosts: hostList, vpns: vpnList };
  }, [connections, activeProjectId, searchQuery, viewMode]);

  const handleSaveConnection = async (connInput: ConnectionInput) => {
    try {
      await DataService.saveConnection(connInput, currentUser);
      await refreshData();
      toast('success', '保存成功', `资源 "${connInput.name}" 已更新`);
    } catch (e) {
      toast('error', '保存失败', '无法写入数据');
      throw e; // Re-throw to let Modal stay open
    }
  };

  const handleDeleteConnection = (id: string) => {
    confirm({
      title: '删除确认',
      message: '确定要删除此连接资源吗？此操作不可恢复。',
      variant: 'danger',
      confirmText: '删除',
      onConfirm: async () => {
        await DataService.deleteConnection(id);
        await refreshData();
        toast('info', '已删除', '资源连接已移除');
      }
    });
  };

  const handleEditConnection = (conn: RemoteConnection) => {
    setEditingConnection(conn);
    setIsConnectionModalOpen(true);
  };

  const handleSaveProject = async (projectInput: ProjectInput) => {
    try {
      const savedProject = await DataService.saveProject(projectInput, currentUser);
      await refreshData();
      setActiveProjectId(savedProject.id);
      setViewMode('all');
      setIsProjectModalOpen(false);
    } catch (e) {
      toast('error', '保存失败', '无法写入项目数据');
      throw e; // Re-throw for Modal to handle
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  const handleDeleteProject = (id: string) => {
    confirm({
      title: '删除项目确认',
      message: '警告：删除项目将同时删除该项目下所有的连接资源！此操作不可恢复，确定要继续吗？',
      variant: 'danger',
      confirmText: '确认删除',
      onConfirm: async () => {
        try {
          await DataService.deleteProject(id);
          await refreshData();
          if (activeProjectId === id) setActiveProjectId(null);
          toast('success', '项目已删除', '相关资源已一并清理');
        } catch (e) {
          toast('error', '删除失败', '无法执行删除操作');
        }
      }
    });
  };

  const handleExport = () => {
    const data = { projects, connections };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remotehub_config_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('success', '导出成功', '配置文件已下载');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    toast('info', '导入功能', '请使用新增功能重建数据以保持审计完整性');
  };

  const getHeaderTitle = () => {
    if (activeProjectId) return projects.find(p => p.id === activeProjectId)?.name;
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
        onExport={handleExport}
        onImport={handleImport}
        onLogout={onLogout}
        currentUser={currentUser}
        onOpenUserModal={() => setIsUserModalOpen(true)}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-950">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <h2 className="text-lg font-bold text-white flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
               {viewMode === 'vpn' && !activeProjectId ? <Network className="text-indigo-400" /> : <Server className="text-blue-400" />}
               {getHeaderTitle()}
             </h2>
             <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full">
               {hosts.length + vpns.length}
             </span>
          </div>

          <div className="flex items-center gap-6">
             {/* Online Users Avatar Stack - Dynamic Spacing & Gradient */}
             <div className="flex items-center gap-4 animate-in fade-in duration-500">
                <div className="flex items-center h-8 pl-2">
                  {onlineUsers.slice(0, 10).map((u, i) => {
                    // Dynamic overlap calculation
                    const count = Math.min(onlineUsers.length, 10);
                    let overlap = -8; // Default (tight)
                    if (count <= 3) overlap = 4; // Gap instead of overlap
                    else if (count <= 6) overlap = -4; // Slight overlap
                    
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
                        {u.nickname[0].toUpperCase()}
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
              onClick={() => { setEditingConnection(null); setIsConnectionModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 active:scale-95"
            >
              <Plus size={16} />
              新建资源
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
          {hosts.length === 0 && vpns.length === 0 && (
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

          <div className="max-w-[1920px] mx-auto space-y-10">
            {vpns.length > 0 && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeProjectId && (
                  <div className="flex items-center gap-2 mb-4 text-slate-400 border-b border-slate-800/50 pb-2">
                    <Network size={16} className="text-indigo-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">VPN 网络节点</h3>
                    <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">{vpns.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {vpns.map(conn => (
                    <ConnectionCard 
                      key={conn.id} 
                      connection={conn} 
                      onEdit={handleEditConnection}
                      onDelete={handleDeleteConnection}
                    />
                  ))}
                </div>
              </section>
            )}

            {hosts.length > 0 && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                {activeProjectId && vpns.length > 0 && (
                  <div className="flex items-center gap-2 mb-4 text-slate-400 border-b border-slate-800/50 pb-2">
                    <Server size={16} className="text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">远程主机 / 服务</h3>
                    <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">{hosts.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                  {hosts.map(conn => (
                    <ConnectionCard 
                      key={conn.id} 
                      connection={conn} 
                      vpnDependency={connections.find(c => c.id === conn.requiredVpnId)}
                      onEdit={handleEditConnection}
                      onDelete={handleDeleteConnection}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <ConnectionModal 
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onSave={handleSaveConnection}
        projects={projects}
        connections={connections}
        editingConnection={editingConnection}
        activeProjectId={activeProjectId}
        onAddProjectRequest={() => setIsProjectModalOpen(true)}
      />
      
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProject}
        editingProject={editingProject}
      />

      <UserManagementModal 
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
};

// Auth wrapper component
const AuthGuard: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await AuthService.initialize(); // Ensure default admin exists
      const user = await AuthService.getCurrentUser();
      setCurrentUser(user);
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const handleLoginSuccess = async () => {
    const user = await AuthService.getCurrentUser();
    setCurrentUser(user);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <AppContent currentUser={currentUser} onLogout={async () => { await AuthService.logout(); setCurrentUser(null); }} />;
};

const App: React.FC = () => {
  return (
    <UIProvider>
      <AuthGuard />
    </UIProvider>
  );
};

export default App;