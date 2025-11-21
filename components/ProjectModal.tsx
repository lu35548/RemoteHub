
import React, { useState, useMemo, useEffect } from 'react';
import { X, FolderPlus, Search, Loader2, Edit2 } from 'lucide-react';
import { ProjectInput, Project } from '../types';
import { generateId } from '../utils';
import { useUI } from './UIComponents';
import { ALL_ICONS, ProjectIcon } from './ProjectIcons';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: ProjectInput) => Promise<void>;
  editingProject?: Project | null;
}

const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, onSave, editingProject }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('folder');
  const [iconSearch, setIconSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useUI();

  // Populate form when editingProject changes or modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingProject) {
        setName(editingProject.name);
        setDescription(editingProject.description || '');
        setSelectedIcon(editingProject.icon);
      } else {
        // Reset for new project
        setName('');
        setDescription('');
        setSelectedIcon('folder');
      }
      setIconSearch('');
    }
  }, [isOpen, editingProject]);

  const filteredIcons = useMemo(() => {
    if (!iconSearch) return ALL_ICONS;
    return ALL_ICONS.filter(icon => icon.includes(iconSearch.toLowerCase()));
  }, [iconSearch]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('error', '名称不能为空', '请为客户或项目填写一个名称');
      return;
    }

    setIsSaving(true);
    try {
      // Use existing ID if editing, otherwise generate new
      const id = editingProject ? editingProject.id : generateId();
      
      await onSave({
        id,
        name,
        description,
        icon: selectedIcon
      });
      
      toast('success', editingProject ? '更新成功' : '项目创建成功', `已${editingProject ? '更新' : '添加'} "${name}"`);
      onClose();
    } catch (error) {
      console.error(error);
      // Keep modal open on error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300 ease-out">
      <div className="bg-slate-950 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 ease-out overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-500">
              {editingProject ? <Edit2 size={20} /> : <FolderPlus size={20} />}
            </div>
            <h2 className="text-lg font-bold text-white">{editingProject ? '编辑项目配置' : '新建客户 / 项目'}</h2>
          </div>
          <button onClick={onClose} disabled={isSaving} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-800 rounded-full disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">项目名称 <span className="text-rose-400">*</span></label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              placeholder="例如: 某某科技 - 私有云部署"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-inner disabled:opacity-50"
            />
          </div>

          <div className="space-y-3">
             <div className="flex items-center justify-between">
               <label className="text-sm font-medium text-slate-300">项目图标</label>
               <div className="relative">
                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                 <input 
                    type="text" 
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    disabled={isSaving}
                    placeholder="搜索图标..."
                    className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white w-32 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                 />
               </div>
             </div>
             
             <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-900/50 border border-slate-800 rounded-xl custom-scrollbar">
                {filteredIcons.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    disabled={isSaving}
                    onClick={() => setSelectedIcon(icon)}
                    className={`aspect-square flex items-center justify-center rounded-lg transition-all ${
                      selectedIcon === icon 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-110' 
                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={icon}
                  >
                    <ProjectIcon name={icon} size={18} />
                  </button>
                ))}
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">描述 (可选)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
              placeholder="备注客户的主要联系方式或特殊要求..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none shadow-inner disabled:opacity-50"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 text-sm transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              {isSaving ? '保存中...' : (editingProject ? '保存修改' : '立即创建')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
