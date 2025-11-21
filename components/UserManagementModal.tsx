
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/auth.service';
import { Modal, useUI } from './UIComponents';
import { UserCog, Plus, Trash2, Key, Shield } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'users'>('profile');
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: '', nickname: '', password: '' });
  const [passChange, setPassChange] = useState({ old: '', new: '', confirm: '' });
  const { toast, confirm } = useUI();

  useEffect(() => {
    if (isOpen && currentUser.role === UserRole.ADMIN) {
      loadUsers();
    }
  }, [isOpen, currentUser]);

  const loadUsers = async () => {
    const allUsers = await AuthService.getAllUsers();
    setUsers(allUsers);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await AuthService.createUser({
        username: newUser.username,
        nickname: newUser.nickname,
        passwordHash: newUser.password,
        role: UserRole.USER
      }, currentUser);
      toast('success', '用户创建成功');
      setNewUser({ username: '', nickname: '', password: '' });
      await loadUsers();
    } catch (err: any) {
      toast('error', '创建失败', err.message);
    }
  };

  const handleDeleteUser = (id: string) => {
    confirm({
      title: '删除用户',
      message: '确定要删除该用户吗？此操作不可撤销。',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await AuthService.deleteUser(id, currentUser);
          toast('success', '用户已删除');
          await loadUsers();
        } catch (err: any) {
          toast('error', '操作失败', err.message);
        }
      }
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passChange.new !== passChange.confirm) {
      toast('error', '错误', '两次输入的新密码不一致');
      return;
    }
    try {
      await AuthService.changeMyPassword(currentUser.id, passChange.old, passChange.new);
      toast('success', '修改成功', '下次登录请使用新密码');
      setPassChange({ old: '', new: '', confirm: '' });
    } catch (err: any) {
      toast('error', '修改失败', err.message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl h-[600px] flex flex-col">
      <div className="flex h-full bg-slate-950 rounded-2xl overflow-hidden">
        {/* Sidebar */}
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
          
          {currentUser.role === UserRole.ADMIN && (
            <button 
              onClick={() => setActiveTab('users')}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              人员管理 (Admin)
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-y-auto bg-slate-950">
          {activeTab === 'profile' ? (
            <div className="max-w-md">
              <h3 className="text-xl font-bold text-white mb-6">个人资料</h3>
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 mb-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
                    {currentUser.nickname[0]}
                  </div>
                  <div>
                    <div className="text-white font-medium text-lg">{currentUser.nickname}</div>
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
                  <input type="password" value={passChange.old} onChange={e => setPassChange({...passChange, old: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase mb-1">新密码</label>
                  <input type="password" value={passChange.new} onChange={e => setPassChange({...passChange, new: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase mb-1">确认新密码</label>
                  <input type="password" value={passChange.confirm} onChange={e => setPassChange({...passChange, confirm: e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none" required />
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
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${u.role === UserRole.ADMIN ? 'bg-orange-500' : 'bg-blue-600'}`}>
                        {u.nickname[0]}
                      </div>
                      <div>
                        <div className="text-white font-medium flex items-center gap-2">
                          {u.nickname} 
                          {u.role === UserRole.ADMIN && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 rounded border border-orange-500/30">ADMIN</span>}
                        </div>
                        <div className="text-xs text-slate-500">ID: {u.username} · 最后活跃: {new Date(u.lastActiveAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    {u.id !== currentUser.id && (
                      <div className="flex gap-2">
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
