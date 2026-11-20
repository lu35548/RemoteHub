import React from 'react';

export interface PaginationProps {
  /** 受控分页 footer（#49 抽取自 DataTable 审计页 footer 模式，三列表共用） */
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** 挂载点微调（如 Sidebar 窄条 / 工作台卡片底部留白） */
  className?: string;
}

/**
 * 通用分页 footer（#49）：审计页 DataTable footer 同款交互——总数 / 上一页 / 页码 / 下一页，
 * 边界（首末页）按钮禁用。供 DataTable 内部与三列表（用户/项目/连接）卡片态独立消费。
 */
export function Pagination(props: PaginationProps): React.JSX.Element {
  const { page, total, pageSize, onPageChange, className } = props;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 越界钳制（批 13a）：末页末条删除瞬间消费方 setState 异步空窗可传入 page > totalPages，
  // 组件 render 期自正钳回末页，防「第 2 / 1 页」显示（消费方 state 不回写，由其自身翻页逻辑收敛）
  const currentPage = Math.min(page, totalPages);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className={`flex items-center justify-between text-xs text-slate-500 ${className ?? ''}`}>
      <span>共 {total} 条</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canPrev}
          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          上一页
        </button>
        <span>第 {currentPage} / {totalPages} 页</span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canNext}
          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
