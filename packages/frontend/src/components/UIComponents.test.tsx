import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from './UIComponents';

// 批 13a a11y 基线：Modal 对话框语义 + 父子组件受控开合（打开即焦点入框、关闭焦点返回触发器）。
// Tab 循环 focus trap 属 B 类批 13b，不在本文件范围。焦点断言一律 waitFor（jsdom rAF 异步移焦）。

/** 测试壳：外部触发按钮 + 受控 Modal（含内部关闭按钮） */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开弹窗</button>
      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <h3>弹窗标题</h3>
        <button onClick={() => setOpen(false)}>关闭按钮</button>
      </Modal>
    </>
  );
}

describe('Modal a11y（批 13a 对话框 role + 焦点管理）', () => {
  it('渲染 role=dialog + aria-modal=true（含 tabindex=-1 使框体可聚焦）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '打开弹窗' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('弹窗标题')).toBeInTheDocument();
  });

  it('打开即初始焦点落对话框本体；关闭后焦点返回触发器', async () => {
    render(<Harness />);
    // userEvent 点击自带焦点移动：触发器先持有焦点再打开（焦点返回的锚点）
    const trigger = screen.getByRole('button', { name: '打开弹窗' });
    await userEvent.setup().click(trigger);

    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());

    // 内部「关闭按钮」关闭 → effect cleanup 即时返回焦点（先于 300ms 卸载动画完成）
    await userEvent.setup().click(screen.getByRole('button', { name: '关闭按钮' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('打开时无焦点元素（activeElement=body）→ 初始焦点仍入框，关闭后焦点落 body 不炸', async () => {
    render(<Harness />);
    // fireEvent 不移动焦点：打开时 activeElement = body
    fireEvent.click(screen.getByRole('button', { name: '打开弹窗' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    // 关闭 → previousFocus(body).focus() 是 no-op,焦点留在 body
    fireEvent.click(screen.getByRole('button', { name: '关闭按钮' }));
    await waitFor(() => expect(document.activeElement).toBe(document.body));
  });
});
