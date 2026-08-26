import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectModal from './ProjectModal';
import { UIProvider } from './UIComponents';
import type { ProjectDetail } from '@remotehub/shared';

describe('ProjectModal（T4）', () => {
  it('新建：填名称提交 → onSave 收 { name, description, icon }，不传 id（后端生成）', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const events = userEvent.setup();
    render(
      <UIProvider>
        <ProjectModal isOpen onClose={vi.fn()} onSave={onSave} editingProject={null} />
      </UIProvider>,
    );
    await events.type(screen.getByPlaceholderText('例如: 某某科技 - 私有云部署'), '新项目');
    await events.click(screen.getByRole('button', { name: '立即创建' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0];
    expect(payload).toEqual({ name: '新项目', description: undefined, icon: 'folder' });
    expect(payload).not.toHaveProperty('id');
  });

  it('编辑：表单回填已有值', () => {
    const editing: ProjectDetail = {
      id: 'p1', name: '既有项目', description: '描述文本', icon: 'cloud',
      createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    render(
      <UIProvider>
        <ProjectModal isOpen onClose={vi.fn()} onSave={vi.fn()} editingProject={editing} />
      </UIProvider>,
    );
    expect((screen.getByPlaceholderText('例如: 某某科技 - 私有云部署') as HTMLInputElement).value).toBe('既有项目');
    expect(screen.getByText('编辑项目配置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存修改' })).toBeInTheDocument();
  });

  it('空名称 → 报错 toast 不提交', async () => {
    const onSave = vi.fn();
    const events = userEvent.setup();
    render(
      <UIProvider>
        <ProjectModal isOpen onClose={vi.fn()} onSave={onSave} editingProject={null} />
      </UIProvider>,
    );
    await events.click(screen.getByRole('button', { name: '立即创建' }));
    await waitFor(() => expect(screen.getByText('名称不能为空')).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });
});
