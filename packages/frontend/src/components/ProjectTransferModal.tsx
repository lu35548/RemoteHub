import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { MemberListItem, MemberRole, ProjectListItem, UserPublic } from '@remotehub/shared';
import { Modal, useUI } from './UIComponents';
import { useMembers, useTransferProject } from '../api/queries';
import { MEMBER_ROLE_LABELS } from '../constants';
import { errMsg } from '../utils';
import { getAvatarColor } from '../utils/avatar';

// 角色徽章配色（owner 金 / editor 蓝 / viewer 灰——ProjectMembersModal 同款口径，本地内联避免跨组件导出耦合；
// 三键齐全，Record<MemberRole> 完整索引）
const ROLE_BADGE_STYLES: Record<MemberRole, string> = {
  owner: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  editor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  viewer: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

interface ProjectTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectListItem | null;
  /** 当前用户（校验 owner 身份展示说明文案；转让动作本身由后端 owner 门兜底） */
  currentUser: UserPublic;
}

/**
 * 票 #48：项目所有权转让弹窗（消费 POST /projects/:id/transfer-ownership）。
 * 候选 = 现有成员中非 owner 者（转现任 owner 是后端 VAL_001，前端入口即遮蔽；
 * 目标须现有成员——非成员 MEMBER_001 409，候选列表天然满足）。
 * 转让语义（design §10）：新 owner 升 owner、原 owner 降 editor——成功后
 * useTransferProject invalidate 项目列表与成员列表，菜单入口随角色变化自动显隐。
 */
const ProjectTransferModal: React.FC<ProjectTransferModalProps> = ({ isOpen, onClose, project, currentUser }) => {
  const { toast } = useUI();
  // projectId 空串 → useMembers enabled=false，关弹窗即停查询（与 ProjectMembersModal 同模式）
  const pid = isOpen && project ? project.id : '';
  const membersQuery = useMembers(pid);
  const members: MemberListItem[] = membersQuery.data?.data ?? [];
  // 候选 = 非 owner 成员（owner 行不出现在列表）
  const candidates = members.filter((m) => m.role !== 'owner');
  const transferMutation = useTransferProject();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  if (!project) return null;

  const displayName = (m: { nickname: string; username: string }) => m.nickname || m.username;
  const selectedMember = candidates.find((m) => m.userId === selectedUserId) ?? null;

  const handleTransfer = async () => {
    if (!selectedMember) return;
    try {
      await transferMutation.mutateAsync({ projectId: project.id, userId: selectedMember.userId });
      toast('success', '转让成功', `「${project.name}」所有权已转让给 ${displayName(selectedMember)}`);
      setSelectedUserId(null);
      onClose();
    } catch (err) {
      toast('error', '转让失败', errMsg(err, '无法转让所有权'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <ArrowLeftRight className="text-blue-500" size={20} />
          <h3 className="text-xl font-bold text-white">转让所有权</h3>
        </div>
        <p className="text-sm text-slate-500 mb-2">{project.name}</p>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          选择一位现有成员接收项目所有权。转让后原所有者将降为编辑者。
        </p>

        {/* #48 rev a11y 修复：候选 role="radio" 需 radiogroup 祖先才暴露给辅助技术（方向键导航增强不做，挂账） */}
        <div role="radiogroup" aria-label="候选成员" className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
          {candidates.map((m) => {
            const isSelected = m.userId === selectedUserId;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedUserId(m.userId)}
                className={`w-full flex items-center justify-between bg-slate-900 border rounded-xl p-3 text-left transition-colors ${
                  isSelected ? 'border-blue-500/60 bg-blue-500/5' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br ${getAvatarColor(m.userId)} flex-shrink-0`}>
                    {(displayName(m) || 'U')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-medium flex items-center gap-2 flex-wrap">
                      <span className="truncate">{displayName(m)}</span>
                      {m.userId === currentUser.id && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 rounded border border-blue-500/30">(我)</span>
                      )}
                      <span className={`text-[10px] px-1.5 rounded border ${ROLE_BADGE_STYLES[m.role]}`}>
                        {MEMBER_ROLE_LABELS[m.role]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">@{m.username}</div>
                  </div>
                </div>
                {isSelected && <div className="w-4 h-4 rounded-full bg-blue-500 ring-2 ring-blue-500/30 flex-shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
          {membersQuery.isError && (
            <div className="py-10 text-center text-sm text-rose-400">
              {errMsg(membersQuery.error, '无法加载成员列表')}
            </div>
          )}
          {/* 非失败且非首次加载中才显示空态（防缓存冷启动闪空态，ProjectMembersModal 同口径） */}
          {!membersQuery.isError && !membersQuery.isPending && candidates.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-600">
              暂无可转让的成员，请先在成员管理中添加
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!selectedMember || transferMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            确认转让
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectTransferModal;
