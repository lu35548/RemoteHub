import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Layout, Network, Server, Menu, Archive, RotateCcw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ConnectionDetail, ConnectionListItem, ConnectionListQuery, CreateConnectionRequest, ProjectListItem, ProjectDetail, UserPublic } from '@remotehub/shared';
import { api, setAccessToken } from './api/client';
import { useMe, useLogout, useProjects, useArchivedProjects, useArchiveProject, useRestoreProject, useCopyProject, useConnections, useConnectionStats, useGlobalConnectionStats, useCreateProject, useUpdateProject, useDeleteProject, useCreateConnection, useUpdateConnection, useDeleteConnection, useCloneConnection, NOTIFICATION_QUERY_KEY } from './api/queries';
import type { ProjectListItemWithStatus } from './api/queries';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useWs } from './hooks/useWs';
import { dispatchWsMessage } from './lib/notificationDispatch';
import Sidebar from './components/Sidebar';
import ConnectionCard from './components/ConnectionCard';
import ConnectionModal from './components/ConnectionModal';
import ProjectModal, { type ProjectFormInput } from './components/ProjectModal';
import ProjectMembersModal from './components/ProjectMembersModal';
import ProjectTransferModal from './components/ProjectTransferModal';
import UserManagementModal from './components/UserManagementModal';
import NotificationCenter from './components/NotificationCenter';
import ConnectionFilterBar, { type TagOption, type ConnectionSortTarget } from './components/ConnectionFilterBar';
import { useUI } from './components/UIComponents';
import { errMsg } from './utils';
import { ARCHIVED_LIST_PAGE_SIZE } from './constants';
import { Pagination } from './components/Pagination';
import { getAvatarColor } from './utils/avatar';

// ── #42 工作台过滤 URL 联动 ──
// URL（q/tags/sort）是过滤态唯一真相源：刷新/分享进入即还原（AC），交互 replace 写入
// 不产生历史条目（搜索/过滤非导航语义）；空值不拼、键序固定（对齐审计页 auditLogParams 模式）
const WORKBENCH_SEARCH_DEBOUNCE_MS = 400;

/** 过滤三参 → URL query（q→tags→sort 键序固定；tags 逗号串多值，空串不拼参——批 13b C2） */
function buildWorkbenchParams(q: string, tagsParam: string, sort: string): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tagsParam) params.set('tags', tagsParam);
  if (sort) params.set('sort', sort);
  return params;
}

const AppContent: React.FC<{ currentUser: UserPublic }> = ({ currentUser }) => {
  const { toast, confirm } = useUI();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  // #48 项目操作 mutation(归档/恢复/复制;转让在 ProjectTransferModal 内自持 hook)
  const archiveMutation = useArchiveProject();
  const restoreMutation = useRestoreProject();
  const copyMutation = useCopyProject();
  const createConnectionMutation = useCreateConnection();
  const updateConnectionMutation = useUpdateConnection();
  const deleteConnectionMutation = useDeleteConnection();
  const cloneConnectionMutation = useCloneConnection();

  // #49 项目列表拆双查询：底表（page=1 固定）供 ConnectionModal 项目下拉 + Via 依赖查找 + header 标题
  // （依赖数据需全量口径，维持原「一次拉全」语义）；展示查询（受控 page）供 Sidebar 翻页。
  // 底表 pageSize 500（批 13b C4：MAX_PAGE_SIZE 同步 100→500，>500 项目缺项仍挂账）——
  // 与展示查询（100/页）pageSize 不同 → page=1 不再同 key 去重，代价一次并发 GET（管理数据量级可接受）
  const { data: projectsBasePage } = useProjects(1, 500);
  const [projectPage, setProjectPage] = useState(1);
  const { data: projectsDisplayPage } = useProjects(projectPage, 100);
  const projectsBase = useMemo(() => projectsBasePage?.data ?? [], [projectsBasePage]);
  const projectsDisplay = useMemo(() => projectsDisplayPage?.data ?? [], [projectsDisplayPage]);
  const projectsTotal = projectsDisplayPage?.pagination.total ?? 0;
  // M2（#49 rev）越界恢复：同连接列表钳制逻辑
  const projectTotalPages = Math.max(1, Math.ceil(projectsTotal / 100));
  if (projectPage > projectTotalPages) setProjectPage(projectTotalPages);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'vpn'>('all');
  // #48 转让入口 → 打开弹窗（成员选择与提交在 ProjectTransferModal；转让者身份校验后端 owner 门兜底）
  const [transferProject, setTransferProject] = useState<ProjectListItem | null>(null);

  // #48 rev（review major 修复）：归档只读态的「事实」与归档列表当前页解耦。
  // 原实现 activeArchived = archivedProjects.find(id)，archivedProjects 只是归档列表当前页
  // （≤100 条）——用户在侧栏归档区翻页翻走后 find 落空 → 提示条消失/新建恢复/菜单回归，
  // 只读态静默解除。现改为显式记录「当前视图来自归档区」事实（选中归档条目时 Sidebar 回传
  // 完整对象，归档当前项目时由归档前列表项 + status 构造），只读判定纯派生：
  //   activeArchived = activeProjectId === archivedView.id ? archivedView : null
  // 与归档列表任何一页的数据都无关。事实清除时机：选中非该归档项目（主列表/全局视图）、恢复成功。
  const [archivedView, setArchivedView] = useState<ProjectListItemWithStatus | null>(null);

  // #48 归档列表（挂载即拉：折叠钮计数需要 total；queryKey ['projects','archived',…] 归属 projects 前缀族，
  // 四操作 mutation invalidate ['projects'] 时主列表与归档列表同步刷新）
  const [archivedPage, setArchivedPage] = useState(1);
  const { data: archivedPageData } = useArchivedProjects(archivedPage, ARCHIVED_LIST_PAGE_SIZE);
  const archivedProjects = useMemo(() => archivedPageData?.data ?? [], [archivedPageData]);
  const archivedTotal = archivedPageData?.pagination.total ?? 0;
  // M2（#49 rev）同款越界恢复：归档列表缩页时钳回有效页
  const archivedTotalPages = Math.max(1, Math.ceil(archivedTotal / ARCHIVED_LIST_PAGE_SIZE));
  if (archivedPage > archivedTotalPages) setArchivedPage(archivedTotalPages);
  // 当前视图是否归档项目（只读失效态判定）：从归档视图事实派生（见上方 archivedView 注记），
  // 不再依赖归档列表当前页数据——翻页翻走后只读态保持。项目名/恢复按钮权限等展示数据
  // 均来自事实记录时的快照（归档视图存续期间成员角色不变：归档项目菜单整遮蔽，无角色变更入口）
  const activeArchived =
    activeProjectId && archivedView?.id === activeProjectId ? archivedView : null;

  // #42 过滤态从 URL 还原（q/tags/sort）：URL 是唯一真相源，无本地镜像态。
  // tags 多选集（批 13b C2）：URL 逗号串 ↔ string[]（空段剔除，空数组 = 无过滤不拼参）
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTags = searchParams.get('tags')?.split(',').filter(Boolean) ?? [];
  // 逗号串派生单值：useMemo/useEffect 依赖数组须简单表达式（urlTags 每渲染新引用），
  // 语义上 URL 未变则串不变 → 各处依赖稳定
  const tagsParam = urlTags.join(',');
  const urlSort = searchParams.get('sort') === 'lastAccessed' ? 'lastAccessed' : '';
  const urlQ = searchParams.get('q') ?? '';

  // 搜索框本地态即时回显，400ms 防抖后提交进 URL（服务端 q 只覆盖 name/host/username；
  // tags 检索由 chips 精确过滤承接——搜索范围收窄是 #42 的有意演进，见完工报告）
  const [searchInput, setSearchInput] = useState(urlQ);
  useEffect(() => {
    if (searchInput === urlQ) return;
    const timer = setTimeout(() => {
      setSearchParams(buildWorkbenchParams(searchInput, tagsParam, urlSort), { replace: true });
    }, WORKBENCH_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, urlQ, tagsParam, urlSort, setSearchParams]);

  /** tag chip 多选切换（批 13b C2）：点选并入 / 再点移出，多值并存；服务端 tags 逗号串多值 OR 过滤 */
  const toggleTag = (tag: string) => {
    const next = urlTags.includes(tag) ? urlTags.filter((t) => t !== tag) : [...urlTags, tag];
    setSearchParams(buildWorkbenchParams(urlQ, next.join(','), urlSort), { replace: true });
  };
  /** 排序切换（'default' 移除 sort 参数 = 服务端缺省 updatedAt desc） */
  const changeSort = (sort: ConnectionSortTarget) => {
    setSearchParams(buildWorkbenchParams(urlQ, tagsParam, sort === 'lastAccessed' ? 'lastAccessed' : ''), { replace: true });
  };

  // #42 展示列表：服务端过滤（q 模糊/tags 多值 OR/sort=lastAccessed，项目视图叠加 projectId）。
  // queryKey 是结构化 filters 对象，#49 分页票在此形状上追加 page/pageSize 即可
  const listQuery = useMemo<Omit<ConnectionListQuery, 'page' | 'pageSize'>>(() => ({
    projectId: activeProjectId ?? undefined,
    tags: tagsParam || undefined,
    q: urlQ || undefined,
    sort: urlSort || undefined,
  }), [activeProjectId, tagsParam, urlQ, urlSort]);
  // #49 连接列表受控分页：过滤条件变化即重置回第 1 页（页码属于特定过滤结果集）。
  // 「render 期比较 prev」模式（react.dev/learn/you-might-not-need-an-effect 首选）——
  // effect 内同步 setState 触发级联渲染，react-hooks v7 set-state-in-effect 规则禁止；
  // 底表查询 useConnections({}) 保持 page=1 不受翻页影响
  const [connPage, setConnPage] = useState(1);
  const [prevListQuery, setPrevListQuery] = useState(listQuery);
  if (prevListQuery !== listQuery) {
    setPrevListQuery(listQuery);
    setConnPage(1);
  }
  const { data: connectionsPage } = useConnections(listQuery, connPage, 100);
  const connections = useMemo(() => connectionsPage?.data ?? [], [connectionsPage]);
  // M2（#49 rev）越界恢复：删末页末条 total 跨页界回退时钳回有效页（keepPreviousData 期间 total
  // 为旧页值不误钳，新页 total 到达即钳；条件幂等，钳后不再触发）
  const connTotalPages = Math.max(1, Math.ceil((connectionsPage?.pagination.total ?? 0) / 100));
  if (connPage > connTotalPages) setConnPage(connTotalPages);

  // #42 全量底表（无过滤）：ConnectionModal 依赖下拉 + Via 依赖查找 + 全局视图 chips 聚合源。
  // 与展示列表在「全局无过滤」时 queryKey 相同 → react-query 自动去重为单请求
  const { data: allConnectionsPage } = useConnections({});
  const allConnections = useMemo(() => allConnectionsPage?.data ?? [], [allConnectionsPage]);

  // #42 项目统计（协议分布 + chips 候选）：项目视图消费 per-project 端点；全局视图协议分布改走
  // 全局聚合端点（批 13b C3，原 OQ「stats 是 per-project，全局停查」的落地）——chips 候选全局仍由底表聚合
  const statsQuery = useConnectionStats(activeProjectId);
  const globalStatsQuery = useGlobalConnectionStats();

  // 在线状态：每 5s 一轮「心跳 → 在线列表」轮询（v1 updateOnlineUsers 等价，登出卸载即停）
  const onlineUsers = useOnlineStatus();

  // #37 通知中心：WS 实时消息 → query 缓存派发（setQueryData 原子插入 + invalidate 重同步）；
  // 建连（含重连）即 invalidate 通知列表补断线增量。仅在已认证布局挂载（登出态不起 WS）
  useWs({
    onMessage: (msg) => dispatchWsMessage(queryClient, toast, msg),
    onOpen: () => { void queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY }); },
  });

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDetail | null>(null);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionDetail | null>(null);
  // #40 成员管理弹窗：目标项目（Sidebar 项目菜单进入）
  const [membersProject, setMembersProject] = useState<ProjectListItem | null>(null);

  // #49 移动抽屉开合（<md 视口由汉堡开、遮罩/关闭按钮收）；桌面常驻不受影响
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  /** Sidebar 任一导航动作完成后收起移动抽屉（选项目/开弹窗/登出——抽屉不遮后续界面） */
  const runThenCloseDrawer = <A,>(fn: (...args: A[]) => void) => (...args: A[]) => {
    fn(...args);
    setMobileSidebarOpen(false);
  };

  // 分组（#42 后：tag/q 过滤与项目范围已由服务端完成，客户端只保留全局视图 vpn/all 互斥分组）
  const { hosts, vpns } = useMemo(() => {
    const list = activeProjectId
      ? connections
      : viewMode === 'vpn'
        ? connections.filter(c => c.protocol === 'VPN')
        : connections.filter(c => c.protocol !== 'VPN');
    return {
      hosts: list.filter(c => c.protocol !== 'VPN'),
      vpns: list.filter(c => c.protocol === 'VPN'),
    };
  }, [connections, activeProjectId, viewMode]);

  // #42 chips 候选：项目视图用 stats.tags（服务端权威，字面键不 trim）；全局视图从全量底表
  // 客户端聚合（过滤不收缩候选集）。均按计数降序（高频 tag 靠前）
  const tagOptions = useMemo<TagOption[]>(() => {
    const counts = activeProjectId
      ? new Map(Object.entries(statsQuery.data?.tags ?? {}))
      : allConnections.reduce((m, c) => {
          for (const t of (c.tags ?? '').split(',').filter(Boolean)) m.set(t, (m.get(t) ?? 0) + 1);
          return m;
        }, new Map<string, number>());
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeProjectId, statsQuery.data, allConnections]);

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

  // ── #48 项目四操作(归档/恢复/复制/转让) ──

  const handleArchiveProject = (project: ProjectListItem) => {
    confirm({
      title: '归档项目',
      message: `归档后「${project.name}」将从工作台默认列表隐藏，可随时在侧栏「已归档」区恢复。`,
      confirmText: '确认归档',
      onConfirm: async () => {
        try {
          await archiveMutation.mutateAsync(project.id);
          // 归档后不跳走：留在项目视图切只读态。归档事实即时记账（归档前列表项 + status 构造，
          // currentUserRole 沿用归档前值——归档不改成员角色），不依赖归档列表 invalidate 时序
          setArchivedView({ ...project, status: 'archived' });
          toast('success', '项目已归档', `「${project.name}」已移入归档区`);
        } catch (err) {
          toast('error', '归档失败', errMsg(err, '无法归档项目'));
        }
      },
    });
  };

  // 恢复 = 正向幂等操作（已 active 再恢复=成功），直接执行不 confirm
  const handleRestoreProject = async (project: ProjectListItemWithStatus) => {
    try {
      await restoreMutation.mutateAsync(project.id);
      // 恢复成功即清归档视图事实：若正处于该项目视图，只读失效态（提示条/新建禁用/卡片只读）随之解除
      // （旧实现依赖归档列表 invalidate 后 find 落空，invalidate 时序脆弱）
      if (archivedView?.id === project.id) setArchivedView(null);
      toast('success', '项目已恢复', `「${project.name}」已回到工作台列表`);
    } catch (err) {
      toast('error', '恢复失败', errMsg(err, '无法恢复项目'));
    }
  };

  const handleCopyProject = async (project: ProjectListItem) => {
    try {
      // 响应真形状（projectService.copyProject）：detail + clonedFrom + connectionCount（toast 消费连接数）
      const copy = await copyMutation.mutateAsync(project.id);
      toast('success', '复制成功', `已创建 "${copy.name}"，含 ${copy.connectionCount} 个连接`);
    } catch (err) {
      // PROJ_001（重名竞态 P2002 映射 409）等经 errMsg 透出后端中文消息
      toast('error', '复制失败', errMsg(err, '无法复制项目'));
    }
  };

  const handleSaveConnection = async (data: CreateConnectionRequest, editingId?: string) => {
    try {
      const saved = editingId
        ? await updateConnectionMutation.mutateAsync({ id: editingId, data })
        : await createConnectionMutation.mutateAsync(data);
      toast('success', '保存成功', `资源 "${saved.name}" 已更新`);
      return saved;
    } catch (e) {
      toast('error', '保存失败', '无法写入连接数据');
      throw e; // 重新抛出供 Modal 处理（快速建 VPN 流程依赖返回值回填 id）
    }
  };

  const handleEditConnection = async (conn: ConnectionListItem) => {
    try {
      // 列表项无 notes/vpnLoginUrl 等字段，编辑前拉详情补全（与 handleEditProject 同惯例）
      const detail = await queryClient.fetchQuery({
        queryKey: ['connections', conn.id],
        queryFn: () => api.get<ConnectionDetail>(`/connections/${conn.id}`),
      });
      setEditingConnection(detail);
      setIsConnectionModalOpen(true);
    } catch {
      toast('error', '加载失败', '无法获取连接详情');
    }
  };

  const handleDeleteConnection = (id: string) => {
    confirm({
      title: '删除确认',
      message: '确定要删除此连接资源吗？此操作不可恢复。',
      variant: 'danger',
      confirmText: '删除',
      onConfirm: async () => {
        try {
          await deleteConnectionMutation.mutateAsync(id);
          toast('info', '已删除', '资源连接已移除');
        } catch {
          toast('error', '删除失败', '无法执行删除操作');
        }
      },
    });
  };

  // #43 克隆：调 clone 端点（密文服务端复制不过前端）→ 成功后打开编辑弹窗载入克隆件
  // （票面「成功后跳编辑弹窗」；响应 detail 即完整形状，免二次 fetchQuery——handleEditConnection 惯例只补列表项缺的字段）
  const handleCloneConnection = async (conn: ConnectionListItem) => {
    try {
      const cloned = await cloneConnectionMutation.mutateAsync(conn.id);
      setEditingConnection(cloned);
      setIsConnectionModalOpen(true);
      toast('success', '克隆成功', `已创建 "${cloned.name}"，密码已随连接复制`);
    } catch {
      toast('error', '克隆失败', '无法克隆连接，请重试');
    }
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

  // #40：离开项目后——若正处于该项目视图则回全局，并失效项目/连接缓存（成员关系变化影响可见项目集）
  const handleLeftProject = (projectId: string) => {
    if (activeProjectId === projectId) setActiveProjectId(null);
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['connections'] });
  };

  // #49 header 标题查找：底表 + 展示页 + 归档列表并集（activeProject 可能在任一页；#48 归档项目
  // 只读视图标题也要命中——归档后留在项目视图的窗口期主列表已无此项）
  // m2 已知边界：底表只持 page=1，展示页只持当前页——activeProject 恰在「非当前展示页且非第一页」
  // 的窗口期（如翻走后又切回该项目视图）两表都不含，回退默认标题「所有远程资源」；重新翻回即恢复
  const getHeaderTitle = () => {
    const project = [...projectsBase, ...projectsDisplay, ...archivedProjects].find(p => p.id === activeProjectId);
    if (project) return project.name;
    if (viewMode === 'vpn') return 'VPN 网络通道管理';
    return '所有远程资源';
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* #49 移动抽屉遮罩：点击关闭（button 语义由抽屉内关闭按钮承载，遮罩纯视觉便利） */}
      {isMobileSidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}
      <Sidebar
        projects={projectsDisplay}
        activeProjectId={activeProjectId}
        viewMode={viewMode}
        onSelectProject={runThenCloseDrawer((id: string | null) => {
          setActiveProjectId(id);
          // #48 rev：主列表/全局视图选择即退出归档视图事实；归档区条目经 onSelectArchivedProject
          // 在其后重新记账（Sidebar 归档条目 onClick 顺序：onSelectProject → onSelectArchivedProject）
          setArchivedView(null);
        })}
        onSelectViewMode={runThenCloseDrawer(setViewMode)}
        onAddProject={runThenCloseDrawer(() => { setEditingProject(null); setIsProjectModalOpen(true); })}
        onEditProject={runThenCloseDrawer(handleEditProject)}
        onDeleteProject={runThenCloseDrawer(handleDeleteProject)}
        onManageMembers={runThenCloseDrawer(setMembersProject)}
        // #48 归档视图 + 管理操作入口（抽屉内动作完成后收抽屉）
        archivedProjects={archivedProjects}
        archivedTotal={archivedTotal}
        archivedPage={archivedPage}
        onArchivedPageChange={setArchivedPage}
        // #48 rev：归档区条目点击 → 记录归档视图事实（含完整对象快照），只读态从事实派生
        onSelectArchivedProject={runThenCloseDrawer((p: ProjectListItemWithStatus) => {
          setActiveProjectId(p.id);
          setArchivedView(p);
        })}
        onArchiveProject={runThenCloseDrawer(handleArchiveProject)}
        onCopyProject={runThenCloseDrawer(handleCopyProject)}
        onTransferProject={runThenCloseDrawer(setTransferProject)}
        onRestoreProject={runThenCloseDrawer(handleRestoreProject)}
        onLogout={runThenCloseDrawer(handleLogout)}
        currentUser={currentUser}
        onOpenUserModal={runThenCloseDrawer(() => setIsUserModalOpen(true))}
        projectPage={projectPage}
        projectTotal={projectsTotal}
        onProjectPageChange={setProjectPage}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-950">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 bg-slate-950/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
             {/* #49 移动端汉堡：开 Sidebar 抽屉（<md 显示）；aria-expanded 随开合状态，aria-controls 配对抽屉 id */}
             <button
               type="button"
               onClick={() => setMobileSidebarOpen(true)}
               aria-label="打开导航菜单"
               aria-expanded={isMobileSidebarOpen}
               aria-controls="mobile-sidebar"
               className="md:hidden text-slate-400 hover:text-white p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
             >
               <Menu size={22} />
             </button>
             <h2 className="text-lg font-bold text-white flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
               {viewMode === 'vpn' && !activeProjectId ? <Network className="text-indigo-400" /> : <Server className="text-blue-400" />}
               {getHeaderTitle()}
             </h2>
             <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full">
               {hosts.length + vpns.length}
             </span>
          </div>

          <div className="flex items-center gap-6">
             {/* Online Users Avatar Stack - Dynamic Spacing & Gradient（#49 小屏隐藏：375px 宽度放不下，在线人数非移动关键信息） */}
             <div className="hidden md:flex items-center gap-4 animate-in fade-in duration-500">
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

            {/* #37 通知中心：铃铛 + 未读角标 + 下拉未读列表 */}
            <NotificationCenter />

            {/* #49 工作台搜索：小屏隐藏（375px 布局收窄；服务端 q 过滤仍可经 URL 进入） */}
            <div className="relative group hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                placeholder="搜索名称, 主机, 用户名..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm w-64 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
              />
            </div>
            {/* #48 归档项目只读态:新建入口禁用(title 说明恢复路径) */}
            <button
              onClick={() => { setEditingConnection(null); setIsConnectionModalOpen(true); }}
              disabled={!!activeArchived}
              title={activeArchived ? '项目已归档，恢复后可新建资源' : undefined}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              <Plus size={16} />
              新建资源
            </button>
          </div>
        </header>

        {/* #42 过滤栏：tag chips（多选并存，批 13b C2）+ 最近访问排序切换 + 协议分布 */}
        <div className="px-4 md:px-8 border-b border-slate-800/50">
          <ConnectionFilterBar
            tagOptions={tagOptions}
            selectedTags={urlTags}
            onToggleTag={toggleTag}
            sortByLastAccessed={urlSort === 'lastAccessed'}
            onSortChange={changeSort}
            protocolStats={activeProjectId ? statsQuery.data?.protocols : globalStatsQuery.data?.protocols}
          />
        </div>

        {/* #48 归档项目只读提示条：直达连接失效态的显性说明 + 恢复入口（owner|admin 可见，对齐 restore 权限门）。
            role="status"（#48 rev a11y 修复）：归档/恢复切换只读态时 SR 主动播报 */}
        {activeArchived && (
          <div className="px-4 md:px-8 pt-4">
            <div role="status" className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 text-sm text-amber-300 min-w-0">
                <Archive size={16} className="flex-shrink-0" />
                <span className="truncate">本项目已归档，资源只读展示；恢复项目后可继续编辑。</span>
              </div>
              {(currentUser.role === 'admin' || activeArchived.currentUserRole === 'owner') && (
                <button
                  onClick={() => handleRestoreProject(activeArchived)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-200 hover:text-white bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors flex-shrink-0"
                >
                  <RotateCcw size={14} /> 恢复项目
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6 md:p-8 custom-scrollbar scroll-smooth">
          {hosts.length === 0 && vpns.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 pb-20 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-slate-900/50 border border-slate-800 rounded-full flex items-center justify-center mb-6">
                {viewMode === 'vpn' ? <Network size={40} className="opacity-30" /> : <Layout size={40} className="opacity-30" />}
              </div>
              <p className="text-lg font-medium text-slate-400">
                {urlQ || urlTags.length > 0 ? '未找到匹配的资源' : '暂无资源配置'}
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
                      readOnly={!!activeArchived}
                      onEdit={handleEditConnection}
                      onDelete={handleDeleteConnection}
                      onClone={handleCloneConnection}
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
                      vpnDependency={allConnections.find(c => c.id === conn.requiredVpnId) ?? undefined}
                      readOnly={!!activeArchived}
                      onEdit={handleEditConnection}
                      onDelete={handleDeleteConnection}
                      onClone={handleCloneConnection}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* #49 连接列表受控分页 footer：total>0 才渲染（空态由上方空态块承载） */}
            {(connectionsPage?.pagination.total ?? 0) > 0 && (
              <Pagination
                page={connPage}
                total={connectionsPage?.pagination.total ?? 0}
                pageSize={100}
                onPageChange={setConnPage}
                className="pt-2 pb-8"
              />
            )}
          </div>
        </div>
      </main>

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProject}
        editingProject={editingProject}
      />

      <ConnectionModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        onSave={handleSaveConnection}
        projects={projectsBase}
        connections={allConnections}
        editingConnection={editingConnection}
        activeProjectId={activeProjectId}
        onAddProjectRequest={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
      />

      <UserManagementModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        currentUser={currentUser}
      />

      <ProjectMembersModal
        isOpen={!!membersProject}
        onClose={() => setMembersProject(null)}
        project={membersProject}
        currentUser={currentUser}
        onLeft={handleLeftProject}
      />

      {/* #48 转让所有权弹窗（转让成功后 useTransferProject invalidate projects/members，
          项目列表 currentUserRole 与菜单入口随角色变化自动显隐） */}
      <ProjectTransferModal
        isOpen={!!transferProject}
        onClose={() => setTransferProject(null)}
        project={transferProject}
        currentUser={currentUser}
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
