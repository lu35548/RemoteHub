import React, { useState } from 'react';
import { MEMBER_ROLES } from '@remotehub/shared';
import type { MemberListItem, MemberRole, ProjectListItem, UserPublic, UserSearchResult } from '@remotehub/shared';
import { Modal, useUI } from './UIComponents';
import { Users, Plus, Trash2, LogOut } from 'lucide-react';
import { useMembers, useAddMember, useUpdateMemberRole, useRemoveMember, useSearchUsers } from '../api/queries';
import { MEMBER_ROLE_LABELS, ROLE_BADGE_STYLES } from '../constants';
import { errMsg } from '../utils';
import { getAvatarColor } from '../utils/avatar';

interface ProjectMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectListItem | null;
  currentUser: UserPublic;
  /** 离开项目成功回调（App 侧重置活动视图 + 失效项目/连接缓存） */
  onLeft?: (projectId: string) => void;
}

/**
 * 票 #40：工作台项目成员管理弹窗（后端零改动，纯消费 member 4 hooks）。
 * 权限遮蔽对齐后端三层链（memberRoutes + memberService + projectRoleMiddleware admin 直通）：
 * - 管理面（添加/改角色/移除他人）：admin 全局直通 或 项目 owner（POST/PATCH 路由门 owner）
 * - 离开项目（移除自己）：任何成员（DELETE 路由门 viewer + service 层 self 校验，即 leave 语义）
 * - 唯一 owner 不提供「离开」入口（service MEMBER_002 last-owner 保护必拒）。owner 数按第一页近似，
 *   两个误判方向：实际多 owner 但另一 owner 不在第一页 → 误判唯一 → 离开入口被遮蔽（保守方向，
 *   用户无路径触发后端兜底）；误判非唯一 → 可点离开 → 后端 MEMBER_002 拒 + toast 兜底
 */
const ProjectMembersModal: React.FC<ProjectMembersModalProps> = ({ isOpen, onClose, project, currentUser, onLeft }) => {
  const { toast, confirm } = useUI();
  // projectId 空串 → useMembers enabled=false，关弹窗即停查询（与 useUsers 同模式）
  const pid = isOpen && project ? project.id : '';
  const membersQuery = useMembers(pid);
  const members: MemberListItem[] = membersQuery.data?.data ?? [];
  const total = membersQuery.data?.pagination.total ?? 0;

  const addMutation = useAddMember();
  const updateRoleMutation = useUpdateMemberRole();
  const removeMutation = useRemoveMember();

  const [searchQ, setSearchQ] = useState('');
  const [picked, setPicked] = useState<UserSearchResult | null>(null);
  const [addRole, setAddRole] = useState<MemberRole>('editor');
  // 选中后传空串停搜（enabled=false），结果下拉随 picked 隐藏
  const searchQuery = useSearchUsers(picked ? '' : searchQ);
  const searchResults: UserSearchResult[] = picked ? [] : (searchQuery.data ?? []);

  // admin 全局直通（projectRoleMiddleware）；admin 非成员时 currentUserRole 为 null
  const canManage = currentUser.role === 'admin' || project?.currentUserRole === 'owner';
  const selfMember = members.find((m) => m.userId === currentUser.id);
  const memberUserIds = new Set(members.map((m) => m.userId));
  // last-owner 近似判定（仅第一页数据，两个误判方向：实际多 owner 而另一 owner 不在第一页 → 误 true
  // → 遮蔽离开入口（保守方向，用户无路径触发后端兜底）；误 false → 可点离开 → 后端 MEMBER_002 拒 + toast 兜底）
  const soleOwner =
    !!selfMember && selfMember.role === 'owner' && members.filter((m) => m.role === 'owner').length <= 1;

  if (!project) return null;

  const displayName = (m: { nickname: string; username: string }) => m.nickname || m.username;

  const handleAdd = async () => {
    if (!picked) return;
    try {
      await addMutation.mutateAsync({ projectId: project.id, data: { userId: picked.id, role: addRole } });
      toast('success', '成员已添加', `${picked.nickname || picked.username} 已加入「${project.name}」`);
      setPicked(null);
      setSearchQ('');
    } catch (err) {
      toast('error', '添加失败', errMsg(err, '无法添加成员'));
    }
  };

  const handleRoleChange = async (m: MemberListItem, role: MemberRole) => {
    if (role === m.role) return;
    try {
      await updateRoleMutation.mutateAsync({ projectId: project.id, uid: m.userId, data: { role } });
      toast('success', '角色已更新', `${displayName(m)} 已设为${MEMBER_ROLE_LABELS[role]}`);
    } catch (err) {
      toast('error', '更新失败', errMsg(err, '无法更新角色'));
    }
  };

  const handleRemove = (m: MemberListItem) => {
    confirm({
      title: '移除成员',
      message: `确定要将 ${displayName(m)} 移出「${project.name}」吗？其将失去该项目的访问权限。`,
      variant: 'danger',
      confirmText: '确认移除',
      onConfirm: async () => {
        try {
          await removeMutation.mutateAsync({ projectId: project.id, uid: m.userId });
          toast('success', '成员已移除', `${displayName(m)} 已移出「${project.name}」`);
        } catch (err) {
          toast('error', '移除失败', errMsg(err, '无法移除成员'));
        }
      },
    });
  };

  // 离开项目 = 对自己执行 removeMember（DELETE viewer 路由门 + service self 校验 = leave 语义）
  const handleLeave = () => {
    confirm({
      title: '离开项目',
      message: `确定要离开「${project.name}」吗？离开后将失去该项目的访问权限。`,
      variant: 'danger',
      confirmText: '确认离开',
      onConfirm: async () => {
        try {
          await removeMutation.mutateAsync({ projectId: project.id, uid: currentUser.id });
          toast('info', '已离开项目', `你已退出「${project.name}」`);
          onLeft?.(project.id);
          onClose();
        } catch (err) {
          toast('error', '操作失败', errMsg(err, '无法离开项目'));
        }
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="text-blue-500" size={20} />成员管理
          </h3>
          <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-400">共 {total} 人</span>
        </div>
        <p className="text-sm text-slate-500 mb-6">{project.name}</p>

        {canManage && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 mb-6">
            <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Plus size={16} />添加成员</h4>
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-500">选择用户</label>
                {picked ? (
                  <button
                    type="button"
                    aria-label="清除已选用户"
                    onClick={() => setPicked(null)}
                    className="w-full flex items-center justify-between bg-slate-950 border border-blue-500/40 rounded-lg px-3 py-2 text-sm text-blue-300"
                  >
                    {picked.nickname || picked.username} ×
                  </button>
                ) : (
                  <input
                    type="text"
                    placeholder="搜索用户名或昵称..."
                    value={searchQ}
                    aria-label="搜索用户"
                    onChange={(e) => setSearchQ(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                  />
                )}
                {/* 搜索结果下拉：已是成员的标注禁选（后端 MEMBER_001 兜底） */}
                {!picked && searchQ && searchResults.length > 0 && (
                  <div className="mt-1 border border-slate-800 rounded-lg bg-slate-950 overflow-hidden">
                    {searchResults.map((r) => {
                      const isMember = memberUserIds.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={isMember}
                          onClick={() => { setPicked(r); setSearchQ(''); }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div>
                            <div className="text-white">{r.nickname || r.username}</div>
                            <div className="text-xs text-slate-500">@{r.username}</div>
                          </div>
                          {isMember && <span className="text-[10px] text-slate-500">已是成员</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">角色</label>
                <select
                  aria-label="新成员角色"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as MemberRole)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!picked || addMutation.isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                添加成员
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar">
          {members.map((m) => {
            const isSelf = m.userId === currentUser.id;
            return (
              <div key={m.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br ${getAvatarColor(m.userId)} flex-shrink-0`}>
                    {(displayName(m) || 'U')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-medium flex items-center gap-2 flex-wrap">
                      <span className="truncate">{displayName(m)}</span>
                      {isSelf && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 rounded border border-blue-500/30">(我)</span>}
                      <span className={`text-[10px] px-1.5 rounded border ${ROLE_BADGE_STYLES[m.role]}`}>{MEMBER_ROLE_LABELS[m.role]}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span>@{m.username}</span> · 加入于 {new Date(m.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 自己行不提供改角色（自改角色非管理场景，UI 收紧防误操作；后端本允许 owner/admin 改任何人） */}
                  {canManage && !isSelf && (
                    <>
                      <select
                        aria-label={`角色-${displayName(m)}`}
                        value={m.role}
                        disabled={updateRoleMutation.isPending}
                        onChange={(e) => void handleRoleChange(m, e.target.value as MemberRole)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none"
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r} value={r}>{MEMBER_ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemove(m)}
                        disabled={removeMutation.isPending}
                        title={`移除成员 ${displayName(m)}`}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {isSelf && !soleOwner && (
                    <button
                      onClick={handleLeave}
                      title="离开项目"
                      className="px-3 py-1.5 text-xs text-rose-400 hover:text-white hover:bg-rose-600 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <LogOut size={14} />离开
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {membersQuery.isError && (
            <div className="py-10 text-center text-sm text-rose-400">
              {errMsg(membersQuery.error, '无法加载成员列表')}
            </div>
          )}
          {/* 非失败且非首次加载中才显示空态：防缓存冷启动闪「暂无成员」、防加载失败被吞成空态误导 */}
          {!membersQuery.isError && !membersQuery.isPending && members.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-600">暂无成员</div>
          )}
        </div>
        {total > members.length && (
          <p className="text-xs text-slate-600 mt-3 text-right">仅显示前 {members.length} 人，共 {total} 人</p>
        )}
      </div>
    </Modal>
  );
};

export default ProjectMembersModal;
