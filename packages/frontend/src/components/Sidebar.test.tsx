import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import type { ProjectListItem, UserPublic } from '@remotehub/shared';
import { useProjects } from '../api/queries';

// B2（批 13b）：Sidebar 搜索态走 useProjects 服务端查询——hook 契约由 queries.projectsQ.test.ts
// 独立锁定，本文件 mock hook 断言 Sidebar 交互参数（debounce → q/enabled/翻页）。
vi.mock('../api/queries', () => ({
  useProjects: vi.fn(() => ({ data: undefined, isPending: true })),
}));

const mockedUseProjects = vi.mocked(useProjects);

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };

const projects: ProjectListItem[] = [
  { id: 'p1', name: '某某科技 - 私有云', icon: 'server', createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'p2', name: '测试项目', icon: 'cloud', createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const noop = vi.fn();
const props = {
  projects,
  activeProjectId: null,
  viewMode: 'all' as const,
  onSelectProject: noop,
  onSelectViewMode: noop,
  onAddProject: noop,
  onEditProject: noop,
  onDeleteProject: noop,
  onManageMembers: noop,
  onLogout: noop,
  currentUser: admin,
  onOpenUserModal: noop,
};

// B2（批 13b）：搜索态 mock——按参数返回：搜索态（enabled && q）返回可控结果集，
// 非搜索态返回 undefined（Sidebar 回退 props 列表口径）
const searchResultItems: ProjectListItem[] = [
  { id: 'px', name: '某某科技 - 云端搜索结果', icon: 'server', createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];
const setupSearchMock = () => {
  mockedUseProjects.mockImplementation(((page: number, _pageSize: number, q?: string, enabled?: boolean) => {
    if (enabled && q) {
      return {
        data: { data: searchResultItems, pagination: { page, pageSize: 100, total: 150 } },
        isPending: false,
      };
    }
    return pendingResult;
  }) as unknown as typeof useProjects);
};

// UseQueryResult 完整形状宽 cast 常量（mock 部分形状，非搜索态统一返回）
const pendingResult = { data: undefined, isPending: true } as unknown as ReturnType<typeof useProjects>;

beforeEach(() => {
  mockedUseProjects.mockReset();
  mockedUseProjects.mockImplementation(() => pendingResult);
});

describe('Sidebar 冒烟（T4）', () => {
  it('渲染项目列表与视图入口', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
  });

  it('项目搜索：输入 debounce 后展示服务端查询结果（客户端 filter 已移除）', async () => {
    setupSearchMock();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    await events.type(screen.getByPlaceholderText('搜索客户...'), '某某');
    // debounce 到点 → mock 返回的搜索结果渲染（名字不含「私有云」语境，非客户端 filter 可产出）
    await waitFor(() => expect(screen.getByText('某某科技 - 云端搜索结果')).toBeInTheDocument(), { timeout: 2000 });
    // props 列表条目退出展示（搜索态口径 = 服务端结果）
    expect(screen.queryByText('测试项目')).not.toBeInTheDocument();
  });

  it('选中项目回调', async () => {
    const onSelectProject = vi.fn();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} onSelectProject={onSelectProject} />
      </MemoryRouter>,
    );
    await events.click(screen.getByText('某某科技 - 私有云'));
    expect(onSelectProject).toHaveBeenCalledWith('p1');
  });
});

// ── 批 13b B2：搜索后端化交互契约 ──
describe('批 13b B2 搜索后端化交互', () => {
  it('输入 → debounce 前 enabled=false 停查；debounce 到点 useProjects(page,100,q,enabled=true)', async () => {
    setupSearchMock();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    await events.type(screen.getByPlaceholderText('搜索客户...'), '某某');
    // debounce 计时窗口内（输入刚完成）：搜索态查询停查
    expect(mockedUseProjects).toHaveBeenLastCalledWith(1, 100, undefined, false);
    // 300ms debounce 到点：带 q 查询开启
    await waitFor(
      () => expect(mockedUseProjects).toHaveBeenLastCalledWith(1, 100, '某某', true),
      { timeout: 2000 },
    );
  });

  it('搜索态翻页走内部 searchPage：搜索结果 total=150 → Pagination「共 150 条」，下一页 → useProjects(2,100,q,true)', async () => {
    setupSearchMock();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    await events.type(screen.getByPlaceholderText('搜索客户...'), '某某');
    await waitFor(() => expect(screen.getByText('共 150 条')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(
      () => expect(mockedUseProjects).toHaveBeenLastCalledWith(2, 100, '某某', true),
      { timeout: 2000 },
    );
  });

  it('清空搜索（键盘全删）→ 回退无 q：useProjects 回 enabled=false，props 列表条目复现', async () => {
    setupSearchMock();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText('搜索客户...');
    await events.type(input, '某某');
    await waitFor(() => expect(mockedUseProjects).toHaveBeenLastCalledWith(1, 100, '某某', true), { timeout: 2000 });
    // 清空输入（clearSearch 按钮 X 无 aria-label；fireEvent.change 直设空值等价「清空」语义）
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(
      () => expect(mockedUseProjects).toHaveBeenLastCalledWith(1, 100, undefined, false),
      { timeout: 2000 },
    );
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
  });
});



describe('成员管理入口（#40）', () => {
  // MoreVertical 按钮 opacity-0 hover 才显示——userEvent 点击会静默失效，用 fireEvent 直点
  const openProjectMenu = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: `项目操作 ${name}` }));
  };

  it('admin：项目菜单含「成员管理」，点击回调带项目', () => {
    const onManageMembers = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar {...props} onManageMembers={onManageMembers} />
      </MemoryRouter>,
    );
    openProjectMenu('某某科技 - 私有云');
    fireEvent.click(screen.getByText('成员管理'));
    expect(onManageMembers).toHaveBeenCalledWith(projects[0]);
  });

  it('入口遮蔽：非 admin 且 currentUserRole 为空 → 菜单无「成员管理」，编辑/删除不受影响', () => {
    const user: UserPublic = { ...admin, id: 'u2', role: 'user' };
    render(
      <MemoryRouter>
        <Sidebar {...props} currentUser={user} />
      </MemoryRouter>,
    );
    openProjectMenu('测试项目');
    expect(screen.queryByText('成员管理')).not.toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('项目成员（非 admin 但 currentUserRole 存在）→ 入口可见', () => {
    const user: UserPublic = { ...admin, id: 'u2', role: 'user' };
    const memberProjects: ProjectListItem[] = [{ ...projects[0]!, currentUserRole: 'viewer' }];
    render(
      <MemoryRouter>
        <Sidebar {...props} projects={memberProjects} currentUser={user} />
      </MemoryRouter>,
    );
    openProjectMenu('某某科技 - 私有云');
    expect(screen.getByText('成员管理')).toBeInTheDocument();
  });

  it('键盘可达：MoreVertical 触发按钮 Enter 打开项目菜单', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '项目操作 某某科技 - 私有云' }), { key: 'Enter' });
    expect(screen.getByText('成员管理')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
  });

  it('a11y（批 13a）：菜单触发器 aria-haspopup + aria-expanded 随开合切换', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: '项目操作 某某科技 - 私有云' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('a11y（批 13a）：菜单项 div 语义化（role=button + tabIndex），Enter/Space 键与点击同逻辑', () => {
    const onEditProject = vi.fn();
    const onDeleteProject = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar {...props} onEditProject={onEditProject} onDeleteProject={onDeleteProject} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '项目操作 某某科技 - 私有云' }));

    // 菜单项原为裸 div（无 role/tabIndex/键盘）——语义化后 role=button 可查
    const editItem = screen.getByRole('button', { name: '编辑' });
    expect(editItem).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(editItem, { key: 'Enter' });
    expect(onEditProject).toHaveBeenCalledWith(projects[0]);

    // Enter 已触发并关菜单——重开后再测删除项 Space 键
    fireEvent.click(screen.getByRole('button', { name: '项目操作 某某科技 - 私有云' }));
    const deleteItem = screen.getByRole('button', { name: '删除' });
    expect(deleteItem).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(deleteItem, { key: ' ' }); // Space 键同逻辑
    expect(onDeleteProject).toHaveBeenCalledWith('p1');
  });
});

describe('#49 Sidebar 分页与移动抽屉', () => {
  it('项目分页 footer：projectTotal 205 → 「共 205 条」，下一页回调携带 page=2', () => {
    const onProjectPageChange = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar {...props} projectTotal={205} onProjectPageChange={onProjectPageChange} />
      </MemoryRouter>,
    );
    expect(screen.getByText('共 205 条')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onProjectPageChange).toHaveBeenCalledWith(2);
  });

  it('projectTotal=0 → 无分页 footer（默认 props 不渲染，冒烟场景零影响）', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/共 \d+ 条/)).not.toBeInTheDocument();
  });

  it('折叠态 → 分页 footer 隐藏（桌面紧凑模式；经折叠按钮切内部 state）', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} projectTotal={205} onProjectPageChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('共 205 条')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '折叠侧栏' }));
    expect(screen.queryByText('共 205 条')).not.toBeInTheDocument();
  });

  it('移动抽屉：默认关态容器含 -translate-x-full，isMobileOpen=true 切 translate-x-0', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(container.firstElementChild!.className).toContain('-translate-x-full');
    unmount();
    const open = render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen />
      </MemoryRouter>,
    );
    expect(open.container.firstElementChild!.className).toContain('translate-x-0');
    expect(open.container.firstElementChild!.className).not.toContain('-translate-x-full');
  });

  it('关闭按钮 a11y（aria-label）+ 点击回调 onMobileClose；折叠按钮在移动抽屉隐藏（md:hidden）', () => {
    const onMobileClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen onMobileClose={onMobileClose} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭导航菜单' }));
    expect(onMobileClose).toHaveBeenCalledTimes(1);
    // 桌面折叠按钮在移动抽屉隐藏（md:hidden 实现类锁定；jsdom 无视口，只能锁类）
    expect(screen.getByRole('button', { name: '折叠侧栏' }).className).toContain('hidden');
    void container;
  });
});

describe('#49 rev M3 抽屉键盘可达性', () => {
  it('关态容器含 invisible（visibility:hidden 不可 Tab 聚焦）；开态无 invisible', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(container.firstElementChild!.className).toContain('invisible');
    unmount();
    const open = render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen />
      </MemoryRouter>,
    );
    expect(open.container.firstElementChild!.className).not.toContain('invisible');
  });

  it('开态移焦至关闭按钮（焦点入抽屉）+ Escape 关闭回调', async () => {
    const onMobileClose = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen onMobileClose={onMobileClose} />
      </MemoryRouter>,
    );
    // 双 rAF 后聚焦（真机 style recalc 时序修复，lead 实证）——waitFor 等帧推进
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('button', { name: '关闭导航菜单' }), { key: 'Escape' });
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });

  it('false→true 更新路径同样移焦（真机开抽屉路径：mount 时关、重渲染开）', async () => {
    const view = render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: '关闭导航菜单' })).not.toBeInTheDocument();
    view.rerender(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
  });
});

describe('#49 rev M3 二次修复：transitionend 同步移焦（关→开循环根治）', () => {
  it('stub rAF 隔离兜底后：visibility 过渡结束触发移焦，width 过渡不触发（propertyName 过滤）', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const { container } = render(
        <MemoryRouter>
          <Sidebar {...props} isMobileOpen onMobileClose={vi.fn()} />
        </MemoryRouter>,
      );
      const drawer = container.firstElementChild as HTMLElement;
      const closeBtn = screen.getByRole('button', { name: '关闭导航菜单' });
      // jsdom TransitionEvent 构造器对 propertyName 初始化透传不可靠（实测 width 负向假绿/正向落空），
      // 用 Event + defineProperty 稳妥构造 propertyName
      const fireTransition = (propertyName: string) => {
        const ev = new Event('transitionend', { bubbles: true });
        Object.defineProperty(ev, 'propertyName', { value: propertyName });
        fireEvent(drawer, ev);
      };
      // width 过渡（桌面折叠）结束 → 不移焦
      fireTransition('width');
      expect(closeBtn).not.toHaveFocus();
      // visibility 过渡结束（关→开循环场景的可靠信号）→ 移焦
      fireTransition('visibility');
      expect(closeBtn).toHaveFocus();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── #48 项目管理增强:菜单三入口(归档/复制/转让,owner|admin 可见) + 归档折叠视图 ──
describe('#48 项目操作菜单权限边界', () => {
  // MoreVertical 按钮 opacity-0 hover 才显示——fireEvent 直点(#40 先例)
  const openProjectMenu = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: `项目操作 ${name}` }));
  };
  const ownerUser: UserPublic = { id: 'u1', username: 'owner1', nickname: '项目所有者', role: 'user', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
  const ownerProjects: ProjectListItem[] = [
    { ...projects[0]!, currentUserRole: 'owner' },
    { ...projects[1]!, currentUserRole: 'viewer' },
  ];

  it('owner:菜单含「归档项目」「复制项目」「转让所有权」', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} projects={ownerProjects} currentUser={ownerUser} />
      </MemoryRouter>,
    );
    openProjectMenu('某某科技 - 私有云');
    expect(screen.getByText('归档项目')).toBeInTheDocument();
    expect(screen.getByText('复制项目')).toBeInTheDocument();
    expect(screen.getByText('转让所有权')).toBeInTheDocument();
  });

  it('admin 直通:非成员 admin 菜单同样含三入口', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} currentUser={admin} />
      </MemoryRouter>,
    );
    openProjectMenu('测试项目');
    expect(screen.getByText('归档项目')).toBeInTheDocument();
    expect(screen.getByText('复制项目')).toBeInTheDocument();
    expect(screen.getByText('转让所有权')).toBeInTheDocument();
  });

  it('非 owner 非 admin(viewer):三入口全遮蔽(AC 权限边界),编辑/删除不受影响', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} projects={ownerProjects} currentUser={ownerUser} />
      </MemoryRouter>,
    );
    openProjectMenu('测试项目'); // currentUserRole: viewer
    expect(screen.queryByText('归档项目')).not.toBeInTheDocument();
    expect(screen.queryByText('复制项目')).not.toBeInTheDocument();
    expect(screen.queryByText('转让所有权')).not.toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });
});

describe('#48 归档折叠视图', () => {
  const ownerUser: UserPublic = { id: 'u1', username: 'owner1', nickname: '项目所有者', role: 'user', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
  const archived = [
    { id: 'pa1', name: '归档项目甲', icon: 'server', status: 'archived' as const, currentUserRole: 'owner' as const, createdBy: { id: 'u1', nickname: '项目所有者' }, updatedBy: { id: 'u1', nickname: '项目所有者' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'pa2', name: '归档项目乙', icon: 'cloud', status: 'archived' as const, currentUserRole: 'viewer' as const, createdBy: { id: 'u1', nickname: '项目所有者' }, updatedBy: { id: 'u1', nickname: '项目所有者' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ];

  it('归档区折叠钮「已归档 (2)」+ aria-expanded;默认收起不显示归档项目名', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} archivedProjects={archived} archivedTotal={2} onRestoreProject={vi.fn()} />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', { name: /已归档/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('归档项目甲')).not.toBeInTheDocument();
  });

  it('展开 → 归档项目名可见;点击归档项目名 → onSelectProject(id)', async () => {
    const onSelectProject = vi.fn();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} archivedProjects={archived} archivedTotal={2} onRestoreProject={vi.fn()} onSelectProject={onSelectProject} />
      </MemoryRouter>,
    );
    await events.click(screen.getByRole('button', { name: /已归档/ }));
    await events.click(screen.getByText('归档项目甲'));
    expect(onSelectProject).toHaveBeenCalledWith('pa1');
  });

  it('owner 归档项带「恢复」按钮,点击 → onRestoreProject(归档项目对象)', async () => {
    const onRestoreProject = vi.fn();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} currentUser={ownerUser} archivedProjects={archived} archivedTotal={2} onRestoreProject={onRestoreProject} />
      </MemoryRouter>,
    );
    await events.click(screen.getByRole('button', { name: /已归档/ }));
    // 恢复按钮 opacity-0 hover 才显示 → fireEvent 直点(userEvent 会静默失效,#40 菜单按钮同坑先例)
    fireEvent.click(screen.getByRole('button', { name: '恢复 归档项目甲' }));
    expect(onRestoreProject).toHaveBeenCalledWith(archived[0]);
  });

  it('非 owner 非 admin 的归档项(viewer)无恢复按钮', async () => {
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} currentUser={ownerUser} archivedProjects={archived} archivedTotal={2} onRestoreProject={vi.fn()} />
      </MemoryRouter>,
    );
    await events.click(screen.getByRole('button', { name: /已归档/ }));
    expect(screen.queryByRole('button', { name: '恢复 归档项目乙' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复 归档项目甲' })).toBeInTheDocument();
  });

  it('折叠态(isCollapsed)归档区隐藏', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} archivedProjects={archived} archivedTotal={2} onRestoreProject={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '折叠侧栏' }));
    expect(screen.queryByRole('button', { name: /已归档/ })).not.toBeInTheDocument();
  });

  // #48 rev（review 修复项 6）：归档区 Pagination 跨页渲染分支两侧覆盖
  // （渲染条件 archivedTotal > archivedProjects.length，页大小 100）
  const hundredArchived = Array.from({ length: 100 }, (_, i) => ({
    id: `pa-${i}`, name: `归档项目 ${i}`, icon: 'server', status: 'archived' as const,
    currentUserRole: 'owner' as const, createdBy: { id: 'u1', nickname: '项目所有者' },
    updatedBy: { id: 'u1', nickname: '项目所有者' }, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }));

  it('跨页(150 > 100)→ Pagination 渲染,下一页回调携带 page=2', async () => {
    const onArchivedPageChange = vi.fn();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} archivedProjects={hundredArchived} archivedTotal={150} onArchivedPageChange={onArchivedPageChange} onRestoreProject={vi.fn()} />
      </MemoryRouter>,
    );
    await events.click(screen.getByRole('button', { name: /已归档/ }));
    expect(screen.getByText('共 150 条')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onArchivedPageChange).toHaveBeenCalledWith(2);
  });

  it('单页(5 = 5)→ Pagination 不渲染', async () => {
    const five = hundredArchived.slice(0, 5);
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} archivedProjects={five} archivedTotal={5} onArchivedPageChange={vi.fn()} onRestoreProject={vi.fn()} />
      </MemoryRouter>,
    );
    await events.click(screen.getByRole('button', { name: /已归档/ }));
    expect(screen.queryByText('共 5 条')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument();
  });
});

// ── 批 13b B1：M3 focus trap + dialog accessible name（OQ 挂账批 10 + 13a std 轴 minor 同域）──
// 抽屉开态 Tab/Shift+Tab 在抽屉内可聚焦元素间循环（首尾环绕），Tab 不落背景内容；
// 容器 onKeyDown 拦截实现（初始移焦已保证焦点入抽屉，容器级拦截即闭环）。
describe('批 13b B1 抽屉 focus trap + dialog 语义', () => {
  /** 抽屉内可聚焦元素集合（与实现同款选择器，DOM 序） */
  const getDrawerFocusables = (drawer: HTMLElement) =>
    Array.from(drawer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));

  const renderOpenDrawer = (propsOverride: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
    const view = render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen onMobileClose={vi.fn()} {...propsOverride} />
      </MemoryRouter>,
    );
    const drawer = view.container.firstElementChild as HTMLElement;
    return { view, drawer, focusables: getDrawerFocusables(drawer) };
  };

  it('开态末元素 Tab → preventDefault + 焦点环绕回首元素（不落背景）', async () => {
    const { focusables } = renderOpenDrawer();
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
    const last = focusables[focusables.length - 1]!;
    last.focus();
    // fireEvent 返回 false = preventDefault 被调用（Tab 被拦截改环绕）
    const defaulted = fireEvent.keyDown(last, { key: 'Tab' });
    expect(defaulted).toBe(false);
    // 环绕目标 = 抽屉 DOM 首个可聚焦元素（「折叠侧栏」按钮；「关闭导航菜单」是 DOM 序第二）
    expect(screen.getByRole('button', { name: '折叠侧栏' })).toHaveFocus();
  });

  it('末元素 Tab 环绕跳过 display:none 首元素（真机复验修复：Chrome 静默拒绝 display:none 的 focus）', async () => {
    const { focusables } = renderOpenDrawer();
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
    // 移动态真机形态：DOM 首元素（折叠侧栏）display:none——真浏览器经 offsetParent 判定过滤，
    // jsdom 无 layout（offsetParent 恒 null）经计算样式兜底判定（inline style 可读）
    const first = focusables[0]!;
    expect(screen.getByRole('button', { name: '折叠侧栏' })).toBe(first);
    first.style.display = 'none';
    const last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    // 环绕落点 = 过滤后集合的首个可见元素（关闭导航菜单），而非被静默拒绝的 display:none 元素
    expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus();
  });

  it('开态首元素 Shift+Tab → preventDefault + 焦点环绕回末元素', async () => {
    const { focusables } = renderOpenDrawer();
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
    // DOM 首个可聚焦元素是「折叠侧栏」按钮（hidden md:block，jsdom 不管 CSS）
    const first = focusables[0]!;
    expect(screen.getByRole('button', { name: '折叠侧栏' })).toBe(first);
    first.focus();
    const defaulted = fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(defaulted).toBe(false);
    expect(screen.getByRole('button', { name: '退出登录' })).toHaveFocus();
  });

  it('开态中间元素 Tab 不拦截（fireEvent true = 默认行为前进，自然环绕前逻辑走浏览器默认序）', async () => {
    const { focusables } = renderOpenDrawer();
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭导航菜单' })).toHaveFocus());
    // 中间元素（关闭按钮之后第二个：搜索输入框）Tab → 不 preventDefault
    const middle = focusables[2]!;
    const defaulted = fireEvent.keyDown(middle, { key: 'Tab' });
    expect(defaulted).toBe(true);
  });

  it('关态 Tab 不拦截（桌面常驻侧栏 Tab 正常全页走，不圈进抽屉）', async () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    const closeBtnAbsent = screen.queryByRole('button', { name: '关闭导航菜单' });
    expect(closeBtnAbsent).not.toBeInTheDocument();
    const target = screen.getByRole('button', { name: '所有资源' });
    target.focus();
    const defaulted = fireEvent.keyDown(target, { key: 'Tab' });
    expect(defaulted).toBe(true);
  });

  it('开态容器 role=dialog + aria-modal + aria-labelledby 指向标题 id；关态无 dialog 语义（桌面常驻非 dialog）', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <Sidebar {...props} isMobileOpen />
      </MemoryRouter>,
    );
    const drawer = container.firstElementChild!;
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('aria-labelledby', 'sidebar-drawer-title');
    expect(screen.getByText('RemoteHub')).toHaveAttribute('id', 'sidebar-drawer-title');
    unmount();
    const closed = render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(closed.container.firstElementChild!.getAttribute('role')).toBeNull();
    // 关态保留 13a 既有 aria-label（桌面常驻 landmark 语义）
    expect(closed.container.firstElementChild!.getAttribute('aria-label')).toBe('主导航');
  });
});
