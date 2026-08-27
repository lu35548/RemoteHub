import React, { useState } from 'react';
import type { ApiErrorResponse, UserListItem, UserPublic } from '@remotehub/shared';
import { Modal, useUI } from './UIComponents';
import { UserCog, Plus, Trash2, Key, Shield } from 'lucide-react';
import { useUsers, useCreateUser, useDeleteUser, useChangePassword } from '../api/queries';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserPublic;
}

// API 错误消息提取（client 抛 ApiErrorResponse 形状）——业务错误显示后端中文消息（等价 v1 err.message），
// 其余（网络异常/内部 Error 均为英文）一律中文兜底，不上英文 toast
const errMsg = (e: unknown, fallback: string): string =>
  (e as ApiErrorResponse)?.error?.message || fallback;

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
      toast('success', '修改成功', '下次登录请使用新密码');
      setPassChange({ old: '', new: '', confirm: '' });
    } catch (err) {
      toast('error', '修改失败', errMsg(err, '无法修改密码'));
    }
  };

  return (
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
                        {/* v1 假动作逐字保留：仅提示、不请求（v1 无重置密码 API，文案怪癖归 phase2） */}
                        <button onClick={() => toast('info', '重置密码', '请通知该员工：密码已重置为 "123456"')} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" title="重置密码"><Key size={16} /></button>
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
  );
};

export default UserManagementModal;
