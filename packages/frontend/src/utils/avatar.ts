// 头像渐变色（按 userId 稳定 hash 选色；v1 原样，自 App.tsx / ProjectMembersModal.tsx 两处本地定义抽为共享工具）
export const getAvatarColor = (userId: string) => {
  const gradients = [
    'from-rose-500 to-orange-500',
    'from-orange-500 to-amber-500',
    'from-emerald-500 to-teal-600',
    'from-teal-500 to-cyan-600',
    'from-cyan-500 to-blue-600',
    'from-blue-500 to-indigo-600',
    'from-violet-500 to-purple-600',
    'from-fuchsia-500 to-pink-600'
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};
