import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { UserPublic } from '@remotehub/shared';

// v1 App.tsx updateOnlineUsers 等价：每轮先 heartbeat 刷新活跃、再拉在线列表（串行，保证自己出现在首轮列表）
export function useOnlineStatus(): UserPublic[] {
  const [onlineUsers, setOnlineUsers] = useState<UserPublic[]>([]);

  useEffect(() => {
    const updateOnlineUsers = async () => {
      try {
        await api.post('/auth/heartbeat');
        const data = await api.get<{ users: UserPublic[]; count: number }>('/auth/online');
        // 契约破坏防御：缺 users 字段时空列表兜底，避免向渲染层传 undefined（slice 调用崩白屏）
        if (!cancelled) setOnlineUsers(data.users ?? []);
      } catch {
        // 网络抖动/认证失败：静默跳过本轮（v1 无网络失败路径，等价其「本轮无更新」；下一轮自动恢复）
      }
    };
    let cancelled = false;
    updateOnlineUsers(); // 首轮立即拉取
    const timer = setInterval(updateOnlineUsers, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return onlineUsers;
}
