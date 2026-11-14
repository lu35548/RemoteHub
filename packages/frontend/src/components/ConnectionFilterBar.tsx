import React from 'react';
import { ArrowDownUp, BarChart3 } from 'lucide-react';
import { PROTOCOL_SHORT_LABELS } from '../constants';
import type { Protocol } from '@remotehub/shared';

/** #42 tag 候选项（计数供排序与展示；来源见 App 聚合逻辑） */
export interface TagOption {
  tag: string;
  count: number;
}

/** 排序目标（'default' = updatedAt desc 服务端缺省；'lastAccessed' = 最近访问优先） */
export type ConnectionSortTarget = 'default' | 'lastAccessed';

interface ConnectionFilterBarProps {
  /** tag chips 候选（已按计数降序传入；空数组时 chips 区整体隐藏） */
  tagOptions: TagOption[];
  /** 当前生效的 tag 多选集（空数组 = 无过滤；批 13b C2：单选 → 真多选 OR，契约 tags:string[]） */
  selectedTags: string[];
  /** 点 chip 切换过滤：点选并入，再点移出（多值并存；集合运算在 App 层，URL tags=逗号串直传服务端 OR 过滤） */
  onToggleTag: (tag: string) => void;
  /** 是否按最近访问排序 */
  sortByLastAccessed: boolean;
  /** 排序切换（两键各自的目标值，非 toggle） */
  onSortChange: (sort: ConnectionSortTarget) => void;
  /** 项目视图协议分布（stats 端点 protocols；全局视图不传即隐藏） */
  protocolStats?: Record<string, number>;
}

/**
 * #42 工作台过滤栏：tag 多选切换 chips（批 13b C2 前多选 OR 契约）+ 最近访问排序切换 + 协议分布。
 * 纯展示组件——URL 联动与数据请求在 App 层（q/tags/sort 均为 URL query 真相源）。
 */
const ConnectionFilterBar: React.FC<ConnectionFilterBarProps> = ({
  tagOptions,
  selectedTags,
  onToggleTag,
  sortByLastAccessed,
  onSortChange,
  protocolStats,
}) => {
  const protocolEntries = protocolStats
    ? Object.entries(protocolStats).filter(([, n]) => n > 0)
    : [];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1 min-h-[40px]">
      {/* tag chips：多选并存（点选并入 / 再点移出，多 chip 同时高亮——批 13b C2） */}
      {tagOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="标签过滤">
          {tagOptions.map(({ tag, count }) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleTag(tag)}
                title={active ? '点击取消该标签过滤' : '按此标签过滤'}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                    : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                }`}
              >
                #{tag} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 排序切换：最近更新（服务端缺省 updatedAt desc）/ 最近访问（lastAccessed 优先） */}
      <div className="flex items-center gap-1.5">
        <ArrowDownUp size={14} className="text-slate-500" />
        <div className="flex rounded-lg border border-white/10 bg-slate-900 p-0.5" role="group" aria-label="排序方式">
          <button
            type="button"
            aria-pressed={!sortByLastAccessed}
            onClick={() => onSortChange('default')}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              !sortByLastAccessed ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            最近更新
          </button>
          <button
            type="button"
            aria-pressed={sortByLastAccessed}
            onClick={() => onSortChange('lastAccessed')}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              sortByLastAccessed ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            最近访问
          </button>
        </div>
      </div>

      {/* 项目视图协议分布（#41 stats 端点消费；全局视图不渲染） */}
      {protocolEntries.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400" aria-label="协议分布">
          <BarChart3 size={14} className="text-slate-500" />
          {protocolEntries.map(([proto, n]) => (
            <span key={proto} className="px-2 py-0.5 rounded-md bg-slate-900/60 border border-white/5">
              {/* 中文短标签与卡片协议名同口径（review 修复 1）；stats 键来自后端原始值，未知键原样兜底 */}
              {PROTOCOL_SHORT_LABELS[proto as Protocol] ?? proto} <span className="text-slate-200 font-medium">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConnectionFilterBar;
