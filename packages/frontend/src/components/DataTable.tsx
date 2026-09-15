import React from 'react';

export interface DataTableProps<T> {
  /** 列定义：render 缺省时按 key 直出字段值 */
  columns: Array<{
    key: string;
    label: string;
    render?: (row: T) => React.ReactNode;
  }>;
  rows: T[];
  isLoading?: boolean;
  emptyText?: string;
  /** 受控分页 footer */
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/**
 * 通用分页表格（P0-7）。P0-9 审计页消费。
 * 深色 slate 主题，空态/loading 态内聚，分页边界（首末页）按钮禁用。
 */
export function DataTable<T>(props: DataTableProps<T>): React.JSX.Element {
  const { columns, rows, isLoading, emptyText = '暂无数据', page, total, pageSize, onPageChange } = props;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // 共享表头（loading/正常两形态同构）
  const thead = (
    <thead>
      <tr>
        {columns.map((col) => (
          <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  if (isLoading) {
    // 骨架行：UIComponents 的 LoadingTable 是浅色 v1 遗产，与 admin 深色界面不符，自绘深色骨架
    return (
      <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/60">
        <table className="min-w-full divide-y divide-white/5">
          {thead}
          <tbody className="divide-y divide-white/5">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-4">
                    <div className="h-4 bg-white/10 rounded animate-pulse" style={{ width: `${60 + ((rowIndex * 13 + col.key.length * 7) % 30)}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/60">
        <table className="min-w-full divide-y divide-white/5">
          {thead}
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                  {emptyText}
                </td>
              </tr>
            )}
            {/* 行 key 用 index：消费场景是分页只读列表，无行重排 */}
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-white/5 transition-colors">
                {columns.map((col) => {
                  // render 存在即完全接管单元格（返回 null 渲染空），不回落字段直出
                  const value = col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '');
                  return (
                    <td key={col.key} className="px-4 py-3 text-sm text-slate-300">
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 受控分页 footer */}
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            上一页
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
