import React, { useState } from 'react';
import type { UserListItem, UserPublic } from '@remotehub/shared';
import { Modal, useUI } from './UIComponents';
import { UserCog, Plus, Trash2, Key, Shield, ShieldCheck } from 'lucide-react';
import { useUsers, useCreateUser, useDeleteUser, useChangePassword, useAdminResetLink, useUpdateUser } from '../api/queries';
import { errMsg } from '../utils';

/** 重置链接弹窗数据：目标用户 + 一次性链接 */
interface ResetLinkInfo {
  nickname: string;
  resetLink: string;
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserPublic;
}

const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'users'>('profile');
  const [newUser, setNewUser] = useState({ username: '', nickname: '', password: '' });
  const [passChange, setPassChange] = useState({ old: '', new: '', confirm: '' });
  const { toast, confirm } = useUI();

  const isAdmin = currentUser.role === 'admin';
  // v1：isOpen 且 admin 时加载列表；enabled 每次 false→true 变化（staleTime 0）自动重取，等价「每次打开刷新」
  const usersQuery = useUsers(1, isOpen && isAdmin);
  const users: UserListItem[] = usersQuery.data?.data ?? [];

  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const changePassword = useChangePassword();
  const resetLinkMutation = useAdminResetLink();
  const updateUser = useUpdateUser();
  const [resetLinkInfo, setResetLinkInfo] = useState<ResetLinkInfo | null>(null);

  /** 票 #31：2FA 开关——开启直接提交；关闭清绑定+恢复码，走危险确认 */
  const handleToggle2FA = (u: UserListItem) => {
    const enabling = !u.twoFactorEnabled;
    if (enabling) {
      updateUser
        .mutateAsync({ id: u.id, data: { twoFactorEnabled: true } })
        .then(() => toast('success', '已开启 2FA', '该用户下次登录将强制绑定验证器'))
        .catch((err) => toast('error', '操作失败', errMsg(err, '无法更新 2FA 状态')));
      return;
    }
    confirm({
      title: '关闭双因素认证',
      message: `关闭后将清除 ${u.nickname || u.username} 的验证器绑定并作废全部恢复码，确定继续？`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await updateUser.mutateAsync({ id: u.id, data: { twoFactorEnabled: false } });
          toast('success', '已关闭 2FA');
        } catch (err) {
          toast('error', '操作失败', errMsg(err, '无法更新 2FA 状态'));
        }
      },
    });
  };

  /** 票 #29：假重置换真——调 admin 代重置端点，弹窗展示一次性链接供复制转交 */
  const handleResetLink = async (u: UserListItem) => {
    try {
      const { resetLink } = await resetLinkMutation.mutateAsync(u.id);
      setResetLinkInfo({ nickname: u.nickname || u.username, resetLink });
    } catch (err) {
      toast('error', '生成重置链接失败', errMsg(err, '无法生成重置链接'));
    }
  };

  const handleCopyResetLink = async () => {
    if (!resetLinkInfo) return;
    try {
      await navigator.clipboard.writeText(resetLinkInfo.resetLink);
      toast('success', '已复制', '重置链接已复制到剪贴板');
    } catch {
      toast('error', '复制失败', '请手动选中链接复制');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser.mutateAsync({
        username: newUser.username,
        nickname: newUser.nickname,
        password: newUser.password,
        role: 'user',
      });
      toast('success', '用户创建成功');
      setNewUser({ username: '', nickname: '', password: '' });
    } catch (err) {
      toast('error', '创建失败', errMsg(err, '无法创建用户'));
    }
  };

  const handleDeleteUser = (id: string) => {
    confirm({
      title: '删除用户',
      message: '确定要删除该用户吗？此操作不可撤销。',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteUser.mutateAsync(id);
          toast('success', '用户已删除');
        } catch (err) {
          toast('error', '操作失败', errMsg(err, '无法删除用户'));
        }
      },
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passChange.new !== passChange.confirm) {
      toast('error', '错误', '两次输入的新密码不一致');
      return;
    }
    try {
      await changePassword.mutateAsync({
        oldPassword: passChange.old,
        newPassword: passChange.new,
      });
      toast('success', '修改成功', '请使用新密码重新登录');
      setPassChange({ old: '', new: '', confirm: '' });
    } catch (err) {
      toast('error', '修改失败', errMsg(err, '无法修改密码'));
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl h-[600px] flex flex-col">
        <div className="flex h-full bg-slate-950 rounded-2xl overflow-hidden">
          {/* 侧栏 */}
          <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-2">
            <div className="px-4 py-4 mb-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserCog className="text-blue-500" /> 账号管理
              </h2>
              <p className="text-xs text-slate-500 mt-1">RBAC 权限控制中心</p>
            </div>
  
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              个人中心
            </button>
  
            {isAdmin && (
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                人员管理 (Admin)
              </button>
            )}
          </div>
  
          {/* 内容区 */}
          <div className="flex-1 p-8 overflow-y-auto bg-slate-950">
            {activeTab === 'profile' ? (
              <div className="max-w-md">
                <h3 className="text-xl font-bold text-white mb-6">个人资料</h3>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 mb-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
                      {(currentUser.nickname || currentUser.username || 'A')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium text-lg">{currentUser.nickname || currentUser.username}</div>
                      <div className="text-slate-500 text-sm">@{currentUser.username}</div>
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20">
                        <Shield size={10} /> {currentUser.role.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>
  
                <h3 className="text-lg font-bold text-white mb-4">修改密码</h3>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 uppercase mb-1">当前密码</label>
                    <input type="password" aria-label="当前密码" value={passChange.old} onChange={e => setPassChange({...passChange, old: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase mb-1">新密码</label>
                    <input type="password" aria-label="新密码" value={passChange.new} onChange={e => setPassChange({...passChange, new: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase mb-1">确认新密码</label>
                    <input type="password" aria-label="确认新密码" value={passChange.confirm} onChange={e => setPassChange({...passChange, confirm: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
                  </div>
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
                    更新密码
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-bold text-white mb-6">员工账号管理</h3>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 mb-8">
                  <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Plus size={16} /> 新增员工</h4>
                  <form onSubmit={handleCreateUser} className="flex gap-4 items-end">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-slate-500">登录账号</label>
                      <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm" required placeholder="login_id" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-slate-500">显示昵称</label>
                      <input type="text" value={newUser.nickname} onChange={e => setNewUser({...newUser, nickname: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm" required placeholder="张三" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-slate-500">初始密码</label>
                      <input type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm" required placeholder="123456" />
                    </div>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm h-[38px]">添加</button>
                  </form>
                </div>
  
                <div className="space-y-3">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${u.role === 'admin' ? 'bg-orange-500' : 'bg-blue-600'}`}>
                          {(u.nickname || u.username || 'U')[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-medium flex items-center gap-2">
                            {u.nickname || u.username}
                            {u.role === 'admin' && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 rounded border border-orange-500/30">ADMIN</span>}
                          </div>
                          <div className="text-xs text-slate-500">ID: {u.username} · 最后活跃: {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleTimeString() : '从未'}</div>
                        </div>
                      </div>
                      {u.id !== currentUser.id && (
                        <div className="flex gap-2">
                          {/* 票 #31：2FA 开关（对齐面板 icon 按钮交互） */}
                          <button
                            onClick={() => handleToggle2FA(u)}
                            disabled={updateUser.isPending}
                            className={`p-2 hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${u.twoFactorEnabled ? 'text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                            title={u.twoFactorEnabled ? '关闭双因素认证' : '开启双因素认证'}
                          >
                            <ShieldCheck size={16} />
                          </button>
                          {/* 票 #29 换真：生成一次性重置链接，弹窗展示供 admin 复制转交 */}
                          <button onClick={() => handleResetLink(u)} disabled={resetLinkMutation.isPending} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" title="重置密码"><Key size={16} /></button>
                          <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg" title="删除用户"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 票 #29：重置链接弹窗（展示一次性链接 + 复制） */}
      <Modal isOpen={!!resetLinkInfo} onClose={() => setResetLinkInfo(null)} className="max-w-lg">
        {resetLinkInfo && (
          <div className="p-6">
            <h3 className="text-lg font-bold text-white mb-2">重置密码链接</h3>
            <p className="text-xs text-slate-400 mb-4">
              一次性链接，1 小时内有效。请转交 {resetLinkInfo.nickname}，由其打开链接自行设置新密码。
            </p>
            <input
              type="text"
              readOnly
              value={resetLinkInfo.resetLink}
              aria-label="重置链接"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-blue-300 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetLinkInfo(null)}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
              >
                关闭
              </button>
              <button
                onClick={handleCopyResetLink}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white"
              >
                复制链接
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default UserManagementModal;
